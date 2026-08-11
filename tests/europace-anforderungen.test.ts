import { describe, it, expect, vi } from "vitest";
import { HttpEuropaceClient } from "@/lib/platforms/europace/client";
import { auswahlAus } from "@/lib/platforms/europace/anforderungen";

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
  });

  it("nennt einen fehlenden Scope beim Namen", async () => {
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(
      client(f).holeAnforderungen({ quelle: "antrag", vorgangsNummer: "X", bezugsId: "A-1" })
    ).rejects.toThrow(/Scope|Zugang/i);
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

import { readFileSync } from "node:fs";

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
