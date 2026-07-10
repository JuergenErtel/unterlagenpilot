import { describe, it, expect } from "vitest";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import type { FinLinkVorgangDTO } from "@/lib/platforms/finlink/dto";

const full: FinLinkVorgangDTO = {
  id: "FL-2026-04821",
  antragsteller: [
    {
      vorname: "Anna", nachname: "Muster", geburtsdatum: "1985-04-12",
      familienstand: "verheiratet", email: "anna@example.com", anzahlKinder: 2,
      beschaeftigung: { art: "angestellter", beruf: "Ingenieurin", arbeitgeber: "ACME GmbH" },
      einkommen: { nettoMonatlich: 3200, bruttoMonatlich: 5200 },
    },
    { vorname: "Ben", nachname: "Muster", familienstand: "verheiratet" },
  ],
  objekt: { art: "eigentumswohnung", ort: "Karlsruhe", plz: "76131" },
  finanzierung: { art: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
};

describe("finlinkToCanonical", () => {
  it("mappt Antragsteller mit fortlaufender Position", () => {
    const c = finlinkToCanonical(full);
    expect(c.applicants).toHaveLength(2);
    expect(c.applicants[0]).toMatchObject({ position: 1, vorname: "Anna", nachname: "Muster" });
    expect(c.applicants[1]).toMatchObject({ position: 2, vorname: "Ben" });
    expect(c.applicants[0]?.familienstand).toBe("verheiratet");
    expect(c.applicants[0]?.anzahlKinder).toBe(2);
  });

  it("mappt Beschäftigung/Einkommen mit applicantPosition", () => {
    const c = finlinkToCanonical(full);
    expect(c.employment[0]).toMatchObject({ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME GmbH" });
    expect(c.income[0]).toMatchObject({ applicantPosition: 1, nettoMonatlich: 3200, bruttoMonatlich: 5200 });
  });

  it("mappt Objekt und Finanzierung", () => {
    const c = finlinkToCanonical(full);
    expect(c.property).toMatchObject({ objektart: "eigentumswohnung", ort: "Karlsruhe", plz: "76131" });
    expect(c.financing).toMatchObject({ finanzierungsart: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 });
    expect(c.platformIds.finlinkId).toBe("FL-2026-04821");
  });

  it("mappt unbekannte Enum-Werte zu undefined (kein Raten)", () => {
    const c = finlinkToCanonical({ id: "x", antragsteller: [{ familienstand: "kompliziert" }], objekt: { art: "villa" } });
    expect(c.applicants[0]?.familienstand).toBeUndefined();
    expect(c.property?.objektart).toBeUndefined();
  });

  it("lässt fehlende Felder leer und erzeugt keine leeren Objekt/Beschäftigungseinträge", () => {
    const c = finlinkToCanonical({ id: "x", antragsteller: [{ vorname: "Nur" }] });
    expect(c.employment).toHaveLength(0);
    expect(c.income).toHaveLength(0);
    expect(c.property).toBeUndefined();
    expect(c.applicants[0]?.email).toBeUndefined();
  });
});
