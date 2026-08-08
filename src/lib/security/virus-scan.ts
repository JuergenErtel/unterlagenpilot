import { getEnv } from "@/lib/env";

/**
 * Virenscan als austauschbarer Adapter.
 *
 * Default: MockVirusScanner (DEMO) – deterministisch, ohne externe Infrastruktur.
 * Für echten Betrieb: ClamAVScanner (Adapter vorbereitet) oder ein Cloud-AV-Dienst.
 *
 * WICHTIG: Dokumente werden erst nach bestandenem Scan an OCR/KI weitergegeben.
 */
export type VirusVerdict = "clean" | "infected" | "error";

export interface VirusScanResult {
  verdict: VirusVerdict;
  engine: string;
  /** Signaturname bei Fund – nur Metadatum, kein Klartext-Inhalt. */
  signature?: string;
  /** true, wenn Ergebnis aus Demo-/Mock-Quelle stammt (für Systemstatus). */
  demo: boolean;
}

export interface VirusScanInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface VirusScanner {
  readonly name: string;
  scan(input: VirusScanInput): Promise<VirusScanResult>;
}

// EICAR-Antivirus-Testsignatur (Standard-Testdatei, harmlos).
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Demo-Scanner: meldet EICAR-Testdatei sowie offensichtlich markierte Dateinamen
 * als „infected", alles andere als „clean". Klar als Demo gekennzeichnet.
 */
export class MockVirusScanner implements VirusScanner {
  readonly name = "mock-demo";

  async scan(input: VirusScanInput): Promise<VirusScanResult> {
    const head = input.buffer.subarray(0, 1024).toString("latin1");
    const name = input.filename.toLowerCase();
    if (head.includes(EICAR) || name.includes("eicar") || name.includes("virus-test")) {
      return { verdict: "infected", engine: this.name, signature: "EICAR-Test-Signature", demo: true };
    }
    return { verdict: "clean", engine: this.name, demo: true };
  }
}

/** Blockgröße beim Streamen an clamd. Unter dem üblichen StreamMaxLength-Rahmen. */
const CLAMAV_CHUNK = 64 * 1024;
/** Zeitlimit für Verbindung und Antwort. Lieber Quarantäne als hängender Upload. */
const CLAMAV_TIMEOUT_MS = 30_000;

/**
 * Antwort von clamd auswerten.
 *
 * clamd antwortet auf zINSTREAM mit einer nullterminierten Zeile:
 *   "stream: OK"                          → sauber
 *   "stream: Eicar-Test-Signature FOUND"  → Fund, Signatur davor
 *   "INSTREAM size limit exceeded. ERROR" → Fehler (Datei größer als StreamMaxLength)
 *
 * Exportiert, damit die Auswertung ohne Netzwerk prüfbar ist.
 */
export function parseClamAvAntwort(antwort: string): {
  verdict: VirusVerdict;
  signature?: string;
} {
  const zeile = antwort.replace(/\0/g, "").trim();
  if (/\bERROR\b/i.test(zeile)) return { verdict: "error" };
  if (/\bFOUND\b/.test(zeile)) {
    // "stream: <Signatur> FOUND" – Signatur ist alles zwischen Doppelpunkt und FOUND.
    const treffer = zeile.match(/:\s*(.+?)\s+FOUND\s*$/);
    return { verdict: "infected", signature: treffer?.[1] ?? "unbekannt" };
  }
  if (/\bOK\s*$/.test(zeile)) return { verdict: "clean" };
  // Unbekannte Antwortform → fail-closed.
  return { verdict: "error" };
}

/**
 * ClamAV über das INSTREAM-Protokoll (TCP zu clamd, CLAMAV_HOST/CLAMAV_PORT).
 *
 * Auf Vercel läuft kein clamd im selben Prozess – der Dienst muss erreichbar
 * betrieben werden. Vorteil gegenüber einem HTTP-AV-Dienst: die Dateien
 * verlassen die eigene Infrastruktur nicht, es kommt kein
 * Unterauftragsverarbeiter hinzu.
 *
 * Jeder Fehlerfall ist bewusst `error` = fail-closed → die Datei bleibt in
 * Quarantäne, nie ein stiller Durchgang.
 */
export class ClamAVScanner implements VirusScanner {
  readonly name = "clamav";

  async scan(input: VirusScanInput): Promise<VirusScanResult> {
    const env = getEnv();
    if (!env.CLAMAV_HOST || !env.CLAMAV_PORT) {
      // Kein heimlicher Pass-Through: ohne Konfiguration ist das Ergebnis „error",
      // d. h. die Datei bleibt in Quarantäne (virus_scan_failed).
      return { verdict: "error", engine: this.name, demo: false };
    }

    try {
      const antwort = await instream(env.CLAMAV_HOST, env.CLAMAV_PORT, input.buffer);
      const { verdict, signature } = parseClamAvAntwort(antwort);
      return { verdict, engine: this.name, signature, demo: false };
    } catch (e) {
      // Kein Dateiinhalt und kein Dateiname ins Log – nur der technische Grund.
      console.error("[virus-scan] clamd nicht erreichbar oder Protokollfehler:", e);
      return { verdict: "error", engine: this.name, demo: false };
    }
  }
}

/** Sendet den Puffer per zINSTREAM an clamd und liefert die rohe Antwort. */
async function instream(host: string, port: number, buffer: Buffer): Promise<string> {
  const net = await import("node:net");

  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const teile: Buffer[] = [];
    let erledigt = false;

    const beenden = (fehler?: Error) => {
      if (erledigt) return;
      erledigt = true;
      socket.destroy();
      if (fehler) reject(fehler);
      else resolve(Buffer.concat(teile).toString("utf-8"));
    };

    socket.setTimeout(CLAMAV_TIMEOUT_MS);
    socket.on("timeout", () => beenden(new Error("Zeitlimit überschritten")));
    socket.on("error", (e) => beenden(e));
    socket.on("data", (d: Buffer) => {
      teile.push(d);
      // clamd schliesst nach der Antwort selbst; die Null beendet die Zeile.
      if (d.includes(0)) beenden();
    });
    socket.on("close", () => beenden());

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let pos = 0; pos < buffer.length; pos += CLAMAV_CHUNK) {
        const stueck = buffer.subarray(pos, pos + CLAMAV_CHUNK);
        const laenge = Buffer.alloc(4);
        laenge.writeUInt32BE(stueck.length, 0);
        socket.write(laenge);
        socket.write(stueck);
      }
      // Nulllänge schliesst den Strom ab.
      socket.write(Buffer.alloc(4));
    });
  });
}

/**
 * Cloudmersive Virus-Scan (HTTP-AV-Dienst, serverless-tauglich).
 * POST der Datei-Bytes als multipart an /virus/scan/file, Apikey im Header.
 * Antwort: { CleanResult: boolean, FoundViruses?: [{ VirusName }] }.
 * Jeder Fehlerfall (kein Key, HTTP-Fehler, unerwartete Antwort) ist bewusst
 * `error` = fail-closed → Datei bleibt in Quarantäne, kein Bypass.
 *
 * DSGVO: Vor Prod-Einsatz AVV mit dem Anbieter abschließen (No-Retention-Pfad).
 */
export class CloudmersiveVirusScanner implements VirusScanner {
  readonly name = "cloudmersive";

  async scan(input: VirusScanInput): Promise<VirusScanResult> {
    const env = getEnv();
    if (!env.CLOUDMERSIVE_API_KEY) {
      return { verdict: "error", engine: this.name, demo: false };
    }
    try {
      const body = new FormData();
      body.append("inputFile", new Blob([Uint8Array.from(input.buffer)]), input.filename);
      const res = await fetch("https://api.cloudmersive.com/virus/scan/file", {
        method: "POST",
        headers: { Apikey: env.CLOUDMERSIVE_API_KEY },
        body,
      });
      if (!res.ok) {
        return { verdict: "error", engine: this.name, demo: false };
      }
      const data = (await res.json()) as {
        CleanResult?: boolean;
        FoundViruses?: Array<{ VirusName?: string }>;
      };
      if (data.CleanResult === true) {
        return { verdict: "clean", engine: this.name, demo: false };
      }
      if (data.CleanResult === false) {
        return {
          verdict: "infected",
          engine: this.name,
          signature: data.FoundViruses?.[0]?.VirusName ?? "unbekannt",
          demo: false,
        };
      }
      // Unerwartete Antwortform → fail-closed.
      return { verdict: "error", engine: this.name, demo: false };
    } catch {
      // Netzwerk-/Parsingfehler → fail-closed (kein Klartext-Inhalt geloggt).
      return { verdict: "error", engine: this.name, demo: false };
    }
  }
}

let scanner: VirusScanner | null = null;

export function getVirusScanner(): VirusScanner {
  if (scanner) return scanner;
  const which = getEnv().VIRUS_SCANNER;
  scanner =
    which === "clamav"
      ? new ClamAVScanner()
      : which === "cloudmersive"
        ? new CloudmersiveVirusScanner()
        : new MockVirusScanner();
  return scanner;
}

/** Nur für Tests: erlaubt Injektion eines Scanners. */
export function __setVirusScanner(s: VirusScanner | null): void {
  scanner = s;
}
