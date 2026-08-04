import { describe, it, expect } from "vitest";
import { extractionSchema } from "@/lib/domain/ai-schemas";

// Hintergrund (04.08.2026): Die KI lieferte für ein Listen-Feld der
// Baugenehmigung ein Array als value – ein einzelnes solches Feld ließ die
// gesamte Extraktion (13+ korrekte Felder) zweimal scheitern, das Dokument
// stand danach still auf "Fehler".
describe("extractionSchema – tolerante value-Normalisierung", () => {
  const base = { documentType: "baubeschreibung", overallConfidence: 0.9, warnings: [] };
  const field = (value: unknown) => ({ key: "k", label: "L", value, confidence: 0.9 });

  it("akzeptiert primitive Werte unverändert", () => {
    const r = extractionSchema.parse({ ...base, fields: [field("Text"), field(42), field(true), field(null)] });
    expect(r.fields.map((f) => f.value)).toEqual(["Text", 42, true, null]);
  });

  it("normalisiert Arrays zu einem kommaseparierten String", () => {
    const r = extractionSchema.parse({ ...base, fields: [field(["1:100", "1:1000"])] });
    expect(r.fields[0]?.value).toBe("1:100, 1:1000");
  });

  it("normalisiert Arrays mit Objekten und nackte Objekte zu JSON-Strings", () => {
    const r = extractionSchema.parse({
      ...base,
      fields: [field([{ plan: "Grundriss", massstab: "1:100" }]), field({ a: 1 })],
    });
    expect(r.fields[0]?.value).toBe('{"plan":"Grundriss","massstab":"1:100"}');
    expect(r.fields[1]?.value).toBe('{"a":1}');
  });
});
