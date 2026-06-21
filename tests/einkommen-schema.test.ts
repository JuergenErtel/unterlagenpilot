import { describe, it, expect } from "vitest";
import { selfEmployedAnalysisSchema, toEinkommenDocs } from "@/lib/einkommen/schema";

describe("Selbständige-Analyse-Schema", () => {
  it("validiert eine KI-Ausgabe und mappt auf EinkommenDoc[]", () => {
    const parsed = selfEmployedAnalysisSchema.parse({
      docs: [
        { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 200000, gewinn: 80000 }, notiz: "Stabiler Gewinn.", konfidenz: 0.9 },
        { dokumenttyp: "sonstige", jahr: 2022, notiz: "", konfidenz: 0.4 },
      ],
    });
    const docs = toEinkommenDocs(parsed);
    expect(docs.length).toBe(2);
    expect(docs[0]!.kennzahlen.gewinn).toBe(80000);
    expect(docs[1]!.kennzahlen).toEqual({}); // fehlende kennzahlen → leeres Objekt
  });

  it("ignoriert Dokumente ohne plausibles Jahr", () => {
    const parsed = selfEmployedAnalysisSchema.parse({ docs: [{ dokumenttyp: "euer", jahr: 0, notiz: "", konfidenz: 0.5 }] });
    expect(toEinkommenDocs(parsed).length).toBe(0);
  });
});
