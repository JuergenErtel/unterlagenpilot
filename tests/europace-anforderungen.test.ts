import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { HttpEuropaceClient } from "@/lib/platforms/europace/client";
import { auswahlAus } from "@/lib/platforms/europace/anforderungen";

const UNTERLAGEN_SWAGGER_PATH = "src/lib/platforms/europace/schema/unterlagen-swagger.yaml";

/**
 * Liest die Basis-URL aus dem `servers:`-Block der eingecheckten Spezifikation,
 * statt sie im Test fest abzutippen. Ein von Hand eingetragenes "/v1" haette
 * genau die Luecke, die Critical 1 verursacht hat, nicht geschlossen: der Test
 * waere gruen geblieben, obwohl der Client eine andere Version anspricht als
 * die Spezifikation vorschreibt.
 */
function unterlagenServerUrl(): string {
  const swagger = readFileSync(UNTERLAGEN_SWAGGER_PATH, "utf-8");
  const match = swagger.match(/^servers:\s*\n\s*-\s*url:\s*(\S+)/m);
  if (!match) throw new Error("Kein servers:-Block in unterlagen-swagger.yaml gefunden.");
  return match[1]!;
}

/** Antwortet auf den Token-Aufruf und danach mit der uebergebenen Nutzlast. */
function fetchMitAntwort(nutzlast: unknown, status = 200) {
  return vi.fn(async (url: string | URL) => {
    if (String(url).includes("/auth/token")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify(nutzlast), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const client = (f: typeof fetch) =>
  new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, f);

describe("Anforderungen lesen", () => {
  it("liest die Anforderungen eines Antrags", async () => {
    const f = fetchMitAntwort([
      { id: "r1", code: "AW01", text: "Ausweisdokument", erfuellungskategorien: ["Ausweis"] },
    ]);
    const r = await client(f).holeAnforderungen({
      quelle: "antrag",
      vorgangsNummer: "CH6407",
      bezugsId: "A-1",
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("r1");

    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/dokumente/antrag/anforderungen");
    expect(aufgerufen).toContain("antragsNummer=A-1");
    expect(aufgerufen.startsWith(unterlagenServerUrl())).toBe(true);
  });

  it("liest die Anforderungen eines Finanzierungsvorschlags mit beiden Parametern", async () => {
    const f = fetchMitAntwort([]);
    await client(f).holeAnforderungen({
      quelle: "vorschlag",
      vorgangsNummer: "CH6407",
      bezugsId: "FV-9",
    });
    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/dokumente/anforderungen");
    expect(aufgerufen).toContain("vorgangsNummer=CH6407");
    expect(aufgerufen).toContain("finanzierungsvorschlagsId=FV-9");
    expect(aufgerufen.startsWith(unterlagenServerUrl())).toBe(true);
  });

  it("nennt beim Antrags-Weg den Scope unterlagen:freigabe:lesen, nicht irgendeinen anderen", async () => {
    // Der Antrags-Weg (/dokumente/antrag/anforderungen) verlangt laut
    // unterlagen-swagger.yaml GENAU diesen Scope -- eine falsche Nennung
    // schickt den Fehlersuchenden auf die falsche Faehrte.
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(
      client(f).holeAnforderungen({ quelle: "antrag", vorgangsNummer: "X", bezugsId: "A-1" })
    ).rejects.toThrow(/unterlagen:freigabe:lesen/);
  });

  it("nennt beim Vorschlags-Weg den Scope unterlagen:unterlage:lesen, nicht irgendeinen anderen", async () => {
    // Der Vorschlags-Weg (/dokumente/anforderungen) verlangt laut
    // unterlagen-swagger.yaml den JEWEILS ANDEREN Scope als der Antrags-Weg.
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(
      client(f).holeAnforderungen({ quelle: "vorschlag", vorgangsNummer: "X", bezugsId: "FV-9" })
    ).rejects.toThrow(/unterlagen:unterlage:lesen/);
  });

  it("liefert eine leere Liste, wenn Europace nichts zurueckgibt", async () => {
    const f = fetchMitAntwort([]);
    const r = await client(f).holeAnforderungen({
      quelle: "antrag",
      vorgangsNummer: "X",
      bezugsId: "A-1",
    });
    expect(r).toEqual([]);
  });
});

describe("Antraege und Finanzierungsvorschlaege lesen", () => {
  it("liest die Antraege eines Vorgangs aus der Huelle", async () => {
    const f = fetchMitAntwort({
      antraege: [{ antragsNummer: "A-1", produktAnbieter: { id: "ING_DIBA", bezeichnung: "ING" } }],
    });
    const r = await client(f).holeAntraege("CH6407");
    expect(r).toHaveLength(1);
    expect(r[0]!.antragsNummer).toBe("A-1");

    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/v3/vorgaenge/CH6407/antraege");
  });

  it("nennt bei den Antraegen den Scope baufinanzierung:vorgang:lesen, nicht die Unterlagen-Scopes", async () => {
    // holeAntraege spricht die Vorgaenge-API an, nicht die Unterlagen-API --
    // ein 403 hier hat nichts mit unterlagen:unterlage:lesen zu tun.
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(client(f).holeAntraege("X")).rejects.toThrow(/baufinanzierung:vorgang:lesen/);
  });

  it("liest die Finanzierungsvorschlaege eines Vorgangs aus der Huelle", async () => {
    const f = fetchMitAntwort({
      finanzierungsvorschlaege: [{ id: "FV-9", sollZins: 1.5 }],
    });
    const r = await client(f).holeFinanzierungsvorschlaege("CH6407");
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("FV-9");

    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/v3/vorgaenge/CH6407/finanzierungsvorschlaege");
  });

  it("nennt bei den Finanzierungsvorschlaegen den Scope baufinanzierung:vorgang:lesen, nicht die Unterlagen-Scopes", async () => {
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(client(f).holeFinanzierungsvorschlaege("X")).rejects.toThrow(
      /baufinanzierung:vorgang:lesen/
    );
  });
});

describe("Auswahlliste", () => {
  it("stellt Antraege vor Vorschlaege", () => {
    const a = auswahlAus(
      [{ antragsNummer: "A-1", produktAnbieter: { id: "ING_DIBA", bezeichnung: "ING" } }],
      [{ id: "FV-9", darlehen: [{ produktAnbieter: { id: "DSL_BANK", bezeichnung: "DSL Bank" } }] }]
    );
    expect(a[0]!.quelle).toBe("antrag");
    expect(a[0]!.bankId).toBe("ING_DIBA");
    expect(a[1]!.quelle).toBe("vorschlag");
  });

  it("holt die Bank eines Vorschlags aus dem ersten Darlehen", () => {
    const a = auswahlAus(
      [],
      [{ id: "FV-9", darlehen: [{ produktAnbieter: { id: "DSL_BANK", bezeichnung: "DSL Bank" } }] }]
    );
    expect(a[0]!.bankName).toBe("DSL Bank");
    expect(a[0]!.bankId).toBe("DSL_BANK");
  });

  it("nennt einen Vorschlag ohne Bank ehrlich unbekannt", () => {
    const a = auswahlAus([], [{ id: "FV-9" }]);
    expect(a[0]!.bankName).toBe("Bank unbekannt");
    expect(a[0]!.bankId).toBeNull();
  });

  it("beschreibt Vorschlaege mit Zins und Rate, damit sie unterscheidbar sind", () => {
    const a = auswahlAus([], [{ id: "FV-9", sollZins: 1.89, rateMonatlich: 1240 }]);
    expect(a[0]!.hinweis).toContain("1,89");
    expect(a[0]!.hinweis).toContain("1.240");
  });

  it("laesst Eintraege ohne Kennung weg", () => {
    // Ohne Id koennten wir die Anforderungen gar nicht abrufen.
    expect(auswahlAus([{ produktAnbieter: { id: "X" } }], [{ sollZins: 1 }])).toEqual([]);
  });
});

describe("Vertrag gegen die eingecheckte Spezifikation", () => {
  const swagger = readFileSync("src/lib/platforms/europace/schema/unterlagen-swagger.yaml", "utf-8");

  it("kennt beide Anforderungs-Endpunkte", () => {
    expect(swagger).toContain("/dokumente/anforderungen:");
    expect(swagger).toContain("/dokumente/antrag/anforderungen:");
  });

  it("nennt genau die Scopes, die der Client anfordert", () => {
    expect(swagger).toContain("unterlagen:unterlage:lesen");
    expect(swagger).toContain("unterlagen:freigabe:lesen");
  });

  it("belegt jedes Feld, das wir aus Unterlagenanforderung lesen", () => {
    const ab = swagger.indexOf("    Unterlagenanforderung:");
    expect(ab).toBeGreaterThan(-1);
    const block = swagger.slice(ab, ab + 2000);
    for (const feld of [
      "id:",
      "code:",
      "text:",
      "kurzbezeichnung:",
      "erfuellungskategorien:",
      "produktanbieter:",
      "bezug:",
      "liegtVor:",
      "ausgeblendet:",
    ]) {
      expect(block).toContain(feld);
    }
  });

  it("belegt die Pfade der Vorgaenge-API", () => {
    const v3 = readFileSync("src/lib/platforms/europace/schema/vorgaenge-openapi-v3.json", "utf-8");
    expect(v3).toContain("/v3/vorgaenge/{vorgangsNummer}/antraege");
    expect(v3).toContain("/v3/vorgaenge/{vorgangsNummer}/finanzierungsvorschlaege");
  });
});
