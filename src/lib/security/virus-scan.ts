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

/**
 * ClamAV-Adapter (vorbereiteter Stub).
 * Produktiv: TCP-INSTREAM gegen clamd (CLAMAV_HOST/CLAMAV_PORT) oder clamdscan.
 * Wir erraten/implementieren das Protokoll hier bewusst noch nicht vollständig –
 * solange nicht konfiguriert, schlägt der Scan kontrolliert fehl (kein Bypass).
 */
export class ClamAVScanner implements VirusScanner {
  readonly name = "clamav";

  async scan(_input: VirusScanInput): Promise<VirusScanResult> {
    const env = getEnv();
    if (!env.CLAMAV_HOST || !env.CLAMAV_PORT) {
      // Kein heimlicher Pass-Through: ohne Konfiguration ist das Ergebnis „error",
      // d. h. die Datei bleibt in Quarantäne (virus_scan_failed).
      return { verdict: "error", engine: this.name, demo: false };
    }
    // TODO(prod): clamd INSTREAM-Protokoll implementieren:
    //   1) "zINSTREAM\0" senden
    //   2) Chunks als <4-Byte-Länge><Daten> streamen, mit <0000> abschließen
    //   3) Antwort lesen ("stream: OK" | "stream: <Signatur> FOUND")
    throw new Error("ClamAVScanner: INSTREAM-Protokoll noch nicht implementiert (Stub).");
  }
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
