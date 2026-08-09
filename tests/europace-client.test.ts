import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EuropaceAuthError,
  EuropaceValidationError,
  HttpEuropaceClient,
} from "@/lib/platforms/europace/client";

const REQUEST = {
  importMetadaten: { datenkontext: "TEST_MODUS" as const },
  kundenangaben: {},
};

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
});
