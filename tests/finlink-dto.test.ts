import { describe, it, expect } from "vitest";
import { parseFinLinkVorgang, parseFinLinkLeadsResponse } from "@/lib/platforms/finlink/dto";

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

// Realistische Partner-API-Antwort (JSON:API), Struktur wie in
// https://api.finlink.de/partner-api/docs/redoc bzw. dem finlink-Repo dokumentiert.
const apiLead = {
  id: "lead-4711",
  type: "lead",
  attributes: {
    applicant_meta: {
      first_name: "Anna",
      last_name: "Muster",
      dob: "1985-04-12",
      email_address: "anna@example.com",
      phone_number: "+49 170 000000",
      relationship_status: "married",
      employment_status: "employed",
      monthly_net_income: "3200.0",
      street_address: "Musterweg",
      house_number: "12",
      german_zipcode_number: "76131",
      city_name: "Karlsruhe",
      birth_city: "Stuttgart",
      children_meta: [{ name: "Kind 1" }, { name: "Kind 2" }],
      employer_meta: { name: "ACME GmbH", role_title: "Entwicklerin" },
    },
    user_meta: { email: "anna-user@example.com" },
    property_meta: {
      property_type: "condominium",
      street_address: "Zielstraße",
      house_number: "3",
      german_zipcode_number: "76133",
      city_name: "Karlsruhe",
      listed_price: 460000,
      final_sale_price: 450000,
    },
    loan_application_meta: {
      finance_type: "buy_existing",
      financing_wish: [{ amount: 300000 }, { amount: 80000 }],
    },
    extras_meta: {},
    imported: false,
    external_id: null,
    contact_id: null,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
  },
  relationships: {
    advisor: { data: null },
    contact: { data: null },
    loan_applications: { data: [] },
  },
};

describe("parseFinLinkLeadsResponse", () => {
  it("mappt einen JSON:API-Lead in das interne Vorgangs-DTO", () => {
    const dto = parseFinLinkLeadsResponse({ data: [apiLead] }, "lead-4711");
    expect(dto).not.toBeNull();
    const a = dto!.antragsteller[0]!;
    expect(dto!.id).toBe("lead-4711");
    expect(a.vorname).toBe("Anna");
    expect(a.nachname).toBe("Muster");
    expect(a.geburtsdatum).toBe("1985-04-12");
    expect(a.geburtsort).toBe("Stuttgart");
    expect(a.familienstand).toBe("verheiratet");
    expect(a.anzahlKinder).toBe(2);
    expect(a.strasse).toBe("Musterweg 12");
    expect(a.plz).toBe("76131");
    expect(a.ort).toBe("Karlsruhe");
    expect(a.email).toBe("anna@example.com");
    expect(a.beschaeftigung?.art).toBe("angestellter");
    expect(a.beschaeftigung?.arbeitgeber).toBe("ACME GmbH");
    expect(a.beschaeftigung?.beruf).toBe("Entwicklerin");
    expect(a.einkommen?.nettoMonatlich).toBe(3200);
    expect(dto!.objekt?.art).toBe("eigentumswohnung");
    expect(dto!.objekt?.strasse).toBe("Zielstraße 3");
    expect(dto!.finanzierung?.art).toBe("kauf");
    expect(dto!.finanzierung?.kaufpreis).toBe(450000);
    expect(dto!.finanzierung?.darlehenswunsch).toBe(380000);
  });

  it("lässt unbekannte Vokabeln weg statt zu raten", () => {
    const lead = structuredClone(apiLead);
    lead.attributes.applicant_meta.relationship_status = "unbekannt-xyz";
    lead.attributes.property_meta.property_type = "castle";
    const dto = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto!.antragsteller[0]!.familienstand).toBeUndefined();
    expect(dto!.objekt?.art).toBeUndefined();
  });

  it("liefert null, wenn die Lead-ID nicht in der Antwort vorkommt", () => {
    expect(parseFinLinkLeadsResponse({ data: [apiLead] }, "gibt-es-nicht")).toBeNull();
  });

  it("wirft bei strukturell ungültiger Antwort", () => {
    expect(() => parseFinLinkLeadsResponse({ unerwartet: true }, "x")).toThrow();
  });

  it("fällt beim Kaufpreis auf listed_price zurück und ignoriert leere Einkommens-Strings", () => {
    const lead = structuredClone(apiLead);
    lead.attributes.property_meta.final_sale_price = undefined as never;
    lead.attributes.applicant_meta.monthly_net_income = "" as never;
    const dto = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto!.finanzierung?.kaufpreis).toBe(460000);
    expect(dto!.antragsteller[0]!.einkommen).toBeUndefined();
  });
});
