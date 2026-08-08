import { describe, it, expect } from "vitest";
import { CHECKLIST_TEMPLATES } from "@/lib/checklists/templates";

const alle = Object.values(CHECKLIST_TEMPLATES).flatMap((t) => t.items);

describe("Kundenhinweise je Unterlage", () => {
  it("erklaert jede kundensichtbare Position in ganzen Saetzen", () => {
    const duenn = alle
      .filter((i) => i.customerDescription.trim().length < 40)
      .map((i) => i.key);
    expect(duenn).toEqual([]);
  });

  it("nennt zu jeder kundensichtbaren Position ein Beispiel", () => {
    const ohne = alle.filter((i) => !i.example || i.example.trim().length === 0).map((i) => i.key);
    expect(ohne).toEqual([]);
  });

  it("verwendet keine Fachbegriffe ohne Erklaerung", () => {
    // Woerter, die ein Kunde nicht kennen muss. Kommen sie vor, muss im selben
    // Satz eine Erklaerung stehen – geprueft ueber die Mindestlaenge.
    const fachbegriffe = ["SCHUFA-Selbstauskunft", "Grundschuldbestellung", "Annuität"];
    for (const i of alle) {
      for (const wort of fachbegriffe) {
        if (i.customerDescription.includes(wort)) {
          expect(i.customerDescription.length).toBeGreaterThan(80);
        }
      }
    }
  });
});
