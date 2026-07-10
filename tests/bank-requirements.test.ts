import { describe, it, expect } from "vitest";
import { resolveBankRequirements, bankRequirementItems } from "@/lib/rules/bank-requirements";

describe("resolveBankRequirements", () => {
  it("liefert nichts ohne Bankauswahl", () => {
    expect(resolveBankRequirements(null)).toEqual([]);
    expect(resolveBankRequirements(undefined, [])).toEqual([]);
  });

  it("nimmt org-spezifische DB-Einträge auf", () => {
    const reqs = resolveBankRequirements("ING", [
      { key: "ing.kontoauszug", title: "Kontoauszüge 2 Monate", documentType: "kontoauszug", level: "zwingend" },
    ]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.title).toBe("Kontoauszüge 2 Monate");
  });

  it("lässt DB-Einträge statische bei gleichem key überschreiben", () => {
    const reqs = resolveBankRequirements("Muster Bank AG", [
      { key: "bank.muster.kontoauszug", title: "Kontoauszüge 6 Monate", documentType: "kontoauszug", level: "zwingend" },
    ]);
    const eintrag = reqs.find((r) => r.key === "bank.muster.kontoauszug");
    expect(eintrag?.title).toBe("Kontoauszüge 6 Monate");
  });
});

describe("bankRequirementItems", () => {
  it("erzeugt bankbezogene (nicht kundensichtbare) Checklisten-Positionen", () => {
    const items = bankRequirementItems([
      { key: "x", title: "Nachweis X", documentType: null, level: "bankabhaengig" },
    ]);
    expect(items[0]!.scope).toBe("bankbezogen");
    expect(items[0]!.bankSpecific).toBe(true);
    expect(items[0]!.name).toBe("Nachweis X");
  });
});
