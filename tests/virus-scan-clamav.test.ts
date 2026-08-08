import { describe, it, expect, vi, afterEach } from "vitest";
import net from "node:net";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    CLAMAV_HOST: host,
    CLAMAV_PORT: port,
    VIRUS_SCANNER: "clamav",
  }),
}));

let host: string | undefined;
let port: number | undefined;
let server: net.Server | null = null;

/**
 * Startet einen Mini-clamd, der das INSTREAM-Protokoll mitspielt: Er liest den
 * Strom bis zum Nulllängen-Block und antwortet mit dem vorgegebenen Text.
 * Damit prüfen wir den echten Socket-Weg, nicht nur die Antwortauswertung.
 */
async function fakeClamd(antwort: string, opts: { schweigen?: boolean } = {}) {
  server = net.createServer((socket) => {
    let gesehen = Buffer.alloc(0);
    socket.on("data", (d) => {
      gesehen = Buffer.concat([gesehen, d]);
      // Ende des Stroms: vier Nullbytes am Schluss.
      const ende = gesehen.subarray(gesehen.length - 4);
      if (gesehen.length >= 4 && ende.readUInt32BE(0) === 0) {
        if (opts.schweigen) return; // antwortet nie -> Zeitlimit
        socket.write(antwort);
        socket.end();
      }
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server!.address() as net.AddressInfo;
  host = "127.0.0.1";
  port = addr.port;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  host = undefined;
  port = undefined;
  vi.resetModules();
});

const eingabe = {
  buffer: Buffer.from("%PDF-1.7 harmloser Inhalt"),
  filename: "gehalt.pdf",
  mimeType: "application/pdf",
};

describe("Auswertung der clamd-Antwort", () => {
  it("erkennt eine saubere Datei", async () => {
    const { parseClamAvAntwort } = await import("@/lib/security/virus-scan");
    expect(parseClamAvAntwort("stream: OK\0")).toEqual({ verdict: "clean" });
  });

  it("erkennt einen Fund und liest die Signatur", async () => {
    const { parseClamAvAntwort } = await import("@/lib/security/virus-scan");
    expect(parseClamAvAntwort("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      verdict: "infected",
      signature: "Eicar-Test-Signature",
    });
  });

  it("wertet eine Fehlerantwort NICHT als sauber", async () => {
    const { parseClamAvAntwort } = await import("@/lib/security/virus-scan");
    expect(parseClamAvAntwort("INSTREAM size limit exceeded. ERROR\0").verdict).toBe("error");
  });

  it("wertet eine unbekannte Antwort als Fehler, nicht als sauber", async () => {
    const { parseClamAvAntwort } = await import("@/lib/security/virus-scan");
    expect(parseClamAvAntwort("irgendwas Unerwartetes").verdict).toBe("error");
    expect(parseClamAvAntwort("").verdict).toBe("error");
  });
});

describe("ClamAV über TCP", () => {
  it("meldet eine saubere Datei als clean", async () => {
    await fakeClamd("stream: OK\0");
    const { ClamAVScanner } = await import("@/lib/security/virus-scan");
    await expect(new ClamAVScanner().scan(eingabe)).resolves.toMatchObject({
      verdict: "clean",
      engine: "clamav",
      demo: false,
    });
  }, 20_000);

  it("meldet einen Fund samt Signatur und markiert ihn nicht als Demo", async () => {
    await fakeClamd("stream: Win.Test.EICAR_HDB-1 FOUND\0");
    const { ClamAVScanner } = await import("@/lib/security/virus-scan");
    await expect(new ClamAVScanner().scan(eingabe)).resolves.toMatchObject({
      verdict: "infected",
      signature: "Win.Test.EICAR_HDB-1",
      demo: false,
    });
  }, 20_000);

  it("liefert bei unerreichbarem clamd error statt clean", async () => {
    host = "127.0.0.1";
    port = 1; // dort lauscht nichts
    // Der Adapter protokolliert den Grund – hier erwartet, deshalb stummgeschaltet,
    // damit die Testausgabe sauber bleibt.
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ClamAVScanner } = await import("@/lib/security/virus-scan");
    await expect(new ClamAVScanner().scan(eingabe)).resolves.toMatchObject({
      verdict: "error",
      demo: false,
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  }, 20_000);

  it("liefert ohne Konfiguration error statt clean", async () => {
    host = undefined;
    port = undefined;
    const { ClamAVScanner } = await import("@/lib/security/virus-scan");
    await expect(new ClamAVScanner().scan(eingabe)).resolves.toMatchObject({
      verdict: "error",
    });
  });

  it("überträgt auch Dateien über die Blockgröße vollständig", async () => {
    // Grösser als CLAMAV_CHUNK (64 KiB), damit die Zerlegung geprüft wird.
    let empfangen = 0;
    server = net.createServer((socket) => {
      let puffer = Buffer.alloc(0);
      socket.on("data", (d) => {
        puffer = Buffer.concat([puffer, d]);
        const ende = puffer.subarray(puffer.length - 4);
        if (puffer.length >= 4 && ende.readUInt32BE(0) === 0) {
          // "zINSTREAM\0" = 10 Bytes, je Block 4 Bytes Länge, 4 Bytes Abschluss.
          const bloecke = Math.ceil(200_000 / (64 * 1024));
          empfangen = puffer.length - 10 - 4 * bloecke - 4;
          socket.write("stream: OK\0");
          socket.end();
        }
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const addr = server!.address() as net.AddressInfo;
    host = "127.0.0.1";
    port = addr.port;

    const { ClamAVScanner } = await import("@/lib/security/virus-scan");
    const gross = { ...eingabe, buffer: Buffer.alloc(200_000, 0x41) };
    await expect(new ClamAVScanner().scan(gross)).resolves.toMatchObject({ verdict: "clean" });
    expect(empfangen).toBe(200_000);
  }, 20_000);
});
