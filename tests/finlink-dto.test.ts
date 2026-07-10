import { describe, it, expect } from "vitest";
import { parseFinLinkVorgang } from "@/lib/platforms/finlink/dto";

const valid = {
  id: "FL-2026-04821",
  antragsteller: [
    {
      vorname: "Anna",
      nachname: "Muster",
      geburtsdatum: "1985-04-12",
      familienstand: "verheiratet",
      email: "anna@example.com",
      beschaeftigung: { art: "angestellter", arbeitgeber: "ACME GmbH" },
      einkommen: { nettoMonatlich: 3200 },
    },
  ],
  objekt: { art: "eigentumswohnung", ort: "Karlsruhe" },
  finanzierung: { art: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
};

describe("parseFinLinkVorgang", () => {
  it("akzeptiert einen vollständigen Vorgang", () => {
    const dto = parseFinLinkVorgang(valid);
    expect(dto.id).toBe("FL-2026-04821");
    expect(dto.antragsteller[0]?.vorname).toBe("Anna");
  });

  it("akzeptiert einen minimalen Vorgang (nur id + leere Antragstellerliste)", () => {
    const dto = parseFinLinkVorgang({ id: "FL-1", antragsteller: [] });
    expect(dto.antragsteller).toHaveLength(0);
  });

  it("lehnt einen Vorgang ohne id ab", () => {
    expect(() => parseFinLinkVorgang({ antragsteller: [] })).toThrow();
  });

  it("lehnt einen falschen Typ für kaufpreis ab", () => {
    expect(() =>
      parseFinLinkVorgang({ id: "x", antragsteller: [], finanzierung: { kaufpreis: "viel" } })
    ).toThrow();
  });
});
