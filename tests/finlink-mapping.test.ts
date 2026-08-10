import { describe, it, expect } from "vitest";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import { parseFinLinkLeadsResponse, type FinLinkVorgangDTO } from "@/lib/platforms/finlink/dto";

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

describe("Eigenkapital aus dem Lead", () => {
  // Das Feld heisst in der API bank_savings_amount_towards_down_payment
  // ("Erspartes fuer die Anzahlung") und kommt in gemischten Typen: in einer
  // Stichprobe von 200 echten Leads 160-mal als Zeichenkette, 28-mal als
  // float, 12-mal als int.
  const antwort = (betrag: unknown) => ({
    data: [
      {
        id: "lead-1",
        attributes: {
          applicant_meta: {
            first_name: "Simon",
            last_name: "Antovski",
            monthly_net_income: 4250,
            bank_savings_amount_towards_down_payment: betrag,
          },
          property_meta: {
            listed_price: 335000,
            german_zipcode_number: "76135",
            city_name: "Karlsruhe",
          },
        },
      },
    ],
  });

  it("liest das Eigenkapital als Zahl", () => {
    const dto = parseFinLinkLeadsResponse(antwort(30000), "lead-1");
    expect(dto?.finanzierung?.eigenkapital).toBe(30000);
  });

  it("liest es auch als Zeichenkette – so kommt es meistens", () => {
    const dto = parseFinLinkLeadsResponse(antwort("30000.0"), "lead-1");
    expect(dto?.finanzierung?.eigenkapital).toBe(30000);
  });

  it("laesst es weg, wenn nichts angegeben ist", () => {
    for (const leer of [null, undefined, ""]) {
      const dto = parseFinLinkLeadsResponse(antwort(leer), "lead-1");
      expect(dto?.finanzierung?.eigenkapital).toBeUndefined();
    }
  });

  it("reicht es bis in die Fallstruktur durch", () => {
    const dto = parseFinLinkLeadsResponse(antwort("45000.0"), "lead-1");
    expect(finlinkToCanonical(dto!).financing.eigenkapital).toBe(45000);
  });
});
