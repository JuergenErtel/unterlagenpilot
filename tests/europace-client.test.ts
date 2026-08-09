import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EuropaceApiError,
  EuropaceAuthError,
  EuropaceValidationError,
  HttpEuropaceClient,
  type DokumentUpload,
} from "@/lib/platforms/europace/client";

const REQUEST = {
  importMetadaten: { datenkontext: "TEST_MODUS" as const },
  kundenangaben: {},
};

/** Steht fuer geheimen Serverinhalt, der niemals in einer Fehlermeldung landen darf. */
const INTERNES_GEHEIMNIS = "interner-Vorgangsschluessel-XJ9";
const CLIENT_SECRET = "geheim-XJ9";

const DOKUMENT: DokumentUpload = {
  vorgangsnummer: "YX4MDU",
  datei: Buffer.from("PDF-INHALT"),
  dateiname: "gehalt.pdf",
  mimeType: "application/pdf",
  anzeigename: "Gehaltsabrechnung",
  kategorie: "EINKOMMENSNACHWEIS",
};

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Meldungen duerfen weder Zugangsdaten noch den Antwortkoerper enthalten. */
function erwarteKeineGeheimnisse(fehler: unknown): void {
  expect(fehler).toBeInstanceOf(Error);
  const text = (fehler as Error).message;
  expect(text).not.toContain(CLIENT_SECRET);
  expect(text).not.toContain(INTERNES_GEHEIMNIS);
  expect(text).not.toContain(Buffer.from(`id:${CLIENT_SECRET}`).toString("base64"));
}

describe("HttpEuropaceClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holt ein Token per Basic Auth und haengt es an den Folgeaufruf", async () => {
    const aufrufe: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      aufrufe.push({ url, init });
      if (url.includes("/auth/token")) return antwort({ access_token: "tok-1", expires_in: 3600 });
      return antwort({ vorgangsnummer: "YX4MDU" }, 201);
    }) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    const nummer = await client.legeVorgangAn(REQUEST);

    expect(nummer).toBe("YX4MDU");
    expect(aufrufe[0]!.url).toBe("https://api.europace.de/auth/token");
    expect((aufrufe[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("id:geheim").toString("base64")}`
    );
    expect((aufrufe[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("holt das Token nur einmal, solange es gueltig ist", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort({ vorgangsnummer: "AAA111" }, 201)
    ) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    await client.legeVorgangAn(REQUEST);
    await client.legeVorgangAn(REQUEST);

    const tokenAufrufe = (fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls.filter(
      (c) => String(c[0]).includes("/auth/token")
    );
    expect(tokenAufrufe).toHaveLength(1);
  });

  it("meldet abgelehnte Zugangsdaten als EuropaceAuthError", async () => {
    const fetchImpl = vi.fn(async () => antwort({ error: "invalid_client" }, 401)) as unknown as typeof fetch;
    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "falsch" }, fetchImpl);
    await expect(client.legeVorgangAn(REQUEST)).rejects.toBeInstanceOf(EuropaceAuthError);
  });

  it("reicht Validierungsmeldungen aus einer 400-Antwort feldgenau durch", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort(
            { messages: [{ path: "kundenangaben.haushalte[0]", message: "Kunde ohne referenzId" }] },
            400
          )
    ) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    const fehler = await client.validiereKundenangaben(REQUEST).catch((e) => e);

    expect(fehler).toBeInstanceOf(EuropaceValidationError);
    expect((fehler as EuropaceValidationError).meldungen).toEqual([
      "kundenangaben.haushalte[0]: Kunde ohne referenzId",
    ]);
  });

  it("schickt bei der Validierung keinen Anlege-Request", async () => {
    const pfade: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      pfade.push(String(url));
      return url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort({}, 200);
    }) as unknown as typeof fetch;

    await new HttpEuropaceClient({ clientId: "id", clientSecret: "g" }, fetchImpl).validiereKundenangaben(
      REQUEST
    );
    expect(pfade.some((p) => p.endsWith("/kundenangaben"))).toBe(false);
    expect(pfade.some((p) => p.endsWith("/kundenangaben/body-validation"))).toBe(true);
  });

  describe("Guard: fehlende Vorgangsnummer", () => {
    it("wirft EuropaceApiError, wenn Europace 201 ohne Vorgangsnummer antwortet", async () => {
      const fetchImpl = vi.fn(async (url: string) =>
        url.includes("/auth/token")
          ? antwort({ access_token: "tok-1", expires_in: 3600 })
          : antwort({ hinweis: INTERNES_GEHEIMNIS }, 201)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.legeVorgangAn(REQUEST).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      erwarteKeineGeheimnisse(fehler);
    });
  });

  describe("Netzwerkfehler", () => {
    it("meldet einen Netzwerkfehler beim Token-Holen, ohne Details preiszugeben", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError(`fetch failed: ${INTERNES_GEHEIMNIS}`);
      }) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.legeVorgangAn(REQUEST).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Europace nicht erreichbar (Netzwerkfehler).");
      erwarteKeineGeheimnisse(fehler);
    });

    it("meldet einen Netzwerkfehler beim Anlegen, ohne Details preiszugeben", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes("/auth/token")) return antwort({ access_token: "tok-1", expires_in: 3600 });
        throw new TypeError(`fetch failed: ${INTERNES_GEHEIMNIS}`);
      }) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.legeVorgangAn(REQUEST).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Europace nicht erreichbar (Netzwerkfehler).");
      erwarteKeineGeheimnisse(fehler);
    });

    it("meldet einen Netzwerkfehler beim Dokument-Upload, ohne Details preiszugeben", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes("/auth/token")) return antwort({ access_token: "tok-1", expires_in: 3600 });
        throw new TypeError(`fetch failed: ${INTERNES_GEHEIMNIS}`);
      }) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.ladeDokumentHoch(DOKUMENT).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Europace nicht erreichbar (Netzwerkfehler).");
      erwarteKeineGeheimnisse(fehler);
    });
  });

  describe("Sonstige HTTP-Fehler (weder 400 noch 401/403)", () => {
    it("meldet einen sonstigen Token-Fehler, ohne den Antwortkoerper preiszugeben", async () => {
      const fetchImpl = vi.fn(async () =>
        antwort({ interna: INTERNES_GEHEIMNIS }, 500)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.legeVorgangAn(REQUEST).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Europace-Token fehlgeschlagen (HTTP 500).");
      erwarteKeineGeheimnisse(fehler);
    });

    it("meldet einen sonstigen Anlege-Fehler, ohne den Antwortkoerper preiszugeben", async () => {
      const fetchImpl = vi.fn(async (url: string) =>
        url.includes("/auth/token")
          ? antwort({ access_token: "tok-1", expires_in: 3600 })
          : antwort({ interna: INTERNES_GEHEIMNIS }, 500)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.legeVorgangAn(REQUEST).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Europace antwortete mit HTTP 500.");
      erwarteKeineGeheimnisse(fehler);
    });

    it("meldet einen sonstigen Upload-Fehler, ohne den Antwortkoerper preiszugeben", async () => {
      const fetchImpl = vi.fn(async (url: string) =>
        url.includes("/auth/token")
          ? antwort({ access_token: "tok-1", expires_in: 3600 })
          : antwort({ interna: INTERNES_GEHEIMNIS }, 500)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.ladeDokumentHoch(DOKUMENT).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      expect((fehler as Error).message).toBe("Dokument-Upload fehlgeschlagen (HTTP 500).");
      erwarteKeineGeheimnisse(fehler);
    });
  });

  describe("ladeDokumentHoch", () => {
    it("sendet die Multipart-Felder mit den vom Brief vorgegebenen Namen und liefert die Dokument-ID", async () => {
      let empfangeneForm: FormData | undefined;
      const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("/auth/token")) return antwort({ access_token: "tok-1", expires_in: 3600 });
        expect(url).toBe("https://api.europace2.de/v2/dokumente");
        empfangeneForm = init.body as FormData;
        return antwort({ id: "doc-1" }, 201);
      }) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const id = await client.ladeDokumentHoch(DOKUMENT);

      expect(id).toBe("doc-1");
      expect(empfangeneForm).toBeDefined();
      expect(empfangeneForm!.get("caseId")).toBe("YX4MDU");
      expect(empfangeneForm!.get("displayName")).toBe("Gehaltsabrechnung");
      expect(empfangeneForm!.get("category")).toBe("EINKOMMENSNACHWEIS");
      const datei = empfangeneForm!.get("file") as File;
      expect(datei).toBeInstanceOf(Blob);
      expect(datei.name).toBe("gehalt.pdf");
      expect(datei.type).toBe("application/pdf");
    });

    it("faellt bei 401/403 auf EuropaceAuthError zurueck", async () => {
      const fetchImpl = vi.fn(async (url: string) =>
        url.includes("/auth/token")
          ? antwort({ access_token: "tok-1", expires_in: 3600 })
          : antwort({ error: "forbidden" }, 403)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.ladeDokumentHoch(DOKUMENT).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceAuthError);
      erwarteKeineGeheimnisse(fehler);
    });

    it("wirft EuropaceApiError, wenn Europace keine Dokument-ID liefert", async () => {
      const fetchImpl = vi.fn(async (url: string) =>
        url.includes("/auth/token")
          ? antwort({ access_token: "tok-1", expires_in: 3600 })
          : antwort({ status: INTERNES_GEHEIMNIS }, 201)
      ) as unknown as typeof fetch;

      const client = new HttpEuropaceClient({ clientId: "id", clientSecret: CLIENT_SECRET }, fetchImpl);
      const fehler = await client.ladeDokumentHoch(DOKUMENT).catch((e) => e);

      expect(fehler).toBeInstanceOf(EuropaceApiError);
      erwarteKeineGeheimnisse(fehler);
    });
  });
});
