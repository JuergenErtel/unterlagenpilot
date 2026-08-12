import { describe, it, expect } from "vitest";
import {
  parseFinLinkLeadQuelle,
  parseFinLinkVorgang,
  parseFinLinkLeadsResponse,
  parseFinLinkLeadsSummaries,
  parseFinLinkSingleLeadResponse,
  parseFinLinkLeadLoanApplicationIds,
  parseFinLinkApplicantsResponse,
  mergeAntragstellerDetails,
} from "@/lib/platforms/finlink/dto";

describe("Antragsteller-Detaildaten aus /loan_applications/{id}/applicants", () => {
  // Nachbau der echten Antwort für Lead Colell (04.08.2026): zwei Antragsteller,
  // dob als ISO-Datetime, Kinderzahl als String.
  const applicantsBody = {
    data: [
      {
        attributes: {
          first_name: "Laura",
          last_name: "Colell",
          dob: "1990-04-29T00:00:00.000+02:00",
          birth_city: "Gelnhausen",
          nationality: "Germany",
          relationship_status: "married",
          number_of_dependants: "4.0",
          email_address: "laura@example.com",
          phone_number: "+4915756197464",
          employment_status: "employed_unlimited",
          monthly_net_income: "8050.0",
        },
      },
      {
        attributes: {
          first_name: "Thomas Philipp",
          last_name: "Colell",
          dob: "1989-10-24T00:00:00.000+01:00",
          birth_city: "Groß Gerau",
          employment_status: "civil_servant",
        },
      },
    ],
  };

  it("mappt beide Antragsteller inkl. Geburtsdatum, Familienstand und Kindern", () => {
    const a = parseFinLinkApplicantsResponse(applicantsBody);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({
      vorname: "Laura",
      nachname: "Colell",
      geburtsdatum: "1990-04-29",
      geburtsort: "Gelnhausen",
      staatsangehoerigkeit: "Germany",
      familienstand: "verheiratet",
      anzahlKinder: 4,
      email: "laura@example.com",
    });
    expect(a[0]?.beschaeftigung?.art).toBe("angestellter");
    expect(a[0]?.einkommen?.nettoMonatlich).toBe(8050);
    expect(a[1]).toMatchObject({ vorname: "Thomas Philipp", geburtsdatum: "1989-10-24" });
    expect(a[1]?.beschaeftigung?.art).toBe("beamter");
  });

  it("merge: Detailwerte gewinnen, Lead-Adresse bleibt als Fallback am ersten Antragsteller", () => {
    const leadDto = parseFinLinkVorgang({
      id: "L-1",
      antragsteller: [{ vorname: "Laura", strasse: "Leadweg 1", plz: "64319", ort: "Pfungstadt" }],
    });
    const merged = mergeAntragstellerDetails(leadDto, parseFinLinkApplicantsResponse(applicantsBody));
    expect(merged.antragsteller).toHaveLength(2);
    expect(merged.antragsteller[0]).toMatchObject({
      nachname: "Colell",
      geburtsdatum: "1990-04-29",
      strasse: "Leadweg 1",
      plz: "64319",
      ort: "Pfungstadt",
    });
    expect(merged.antragsteller[1]?.vorname).toBe("Thomas Philipp");
  });

  it("merge ohne Detaildaten lässt das DTO unverändert", () => {
    const leadDto = parseFinLinkVorgang({ id: "L-1", antragsteller: [{ vorname: "A" }] });
    expect(mergeAntragstellerDetails(leadDto, [])).toBe(leadDto);
  });

  it("liest die Antrags-IDs aus der Einzel-Lead-Antwort", () => {
    const body = {
      data: {
        id: "L-1",
        attributes: {},
        relationships: { loan_applications: { data: [{ id: "LA-1" }, { id: "LA-2" }] } },
      },
    };
    expect(parseFinLinkLeadLoanApplicationIds(body)).toEqual(["LA-1", "LA-2"]);
    expect(parseFinLinkLeadLoanApplicationIds({ data: { id: "L-1" } })).toEqual([]);
  });
});

describe("user_meta-Fallback (576 von 905 Bestands-Leads haben Namen NUR dort)", () => {
  const leadNurUserMeta = {
    id: "lead-um-1",
    attributes: {
      applicant_meta: null,
      user_meta: { first_name: "Laura", last_name: "Colell", email: "l@example.com", phone_number: "0157" },
      property_meta: { city_name: "Wörth" },
      loan_application_meta: { finance_type: "buy_existing" },
      created_at: "2026-07-27T17:47:02Z",
    },
  };

  it("Zusammenfassung nimmt den Namen aus user_meta, wenn applicant_meta leer ist", () => {
    const s = parseFinLinkLeadsSummaries({ data: [leadNurUserMeta] });
    expect(s[0]).toMatchObject({ vorname: "Laura", nachname: "Colell" });
  });

  it("Import baut den Antragsteller aus user_meta (Name, E-Mail, Telefon)", () => {
    const dto = parseFinLinkSingleLeadResponse({ data: leadNurUserMeta });
    expect(dto.antragsteller).toHaveLength(1);
    expect(dto.antragsteller[0]).toMatchObject({
      vorname: "Laura",
      nachname: "Colell",
      email: "l@example.com",
      telefon: "0157",
    });
  });

  it("applicant_meta hat Vorrang vor user_meta", () => {
    const lead = structuredClone(leadNurUserMeta);
    (lead.attributes as any).applicant_meta = { first_name: "Anna", last_name: "Muster" };
    const s = parseFinLinkLeadsSummaries({ data: [lead] });
    expect(s[0]).toMatchObject({ vorname: "Anna", nachname: "Muster" });
  });
});

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

  it("übersetzt die real beobachteten API-Vokabeln (Live-Abgleich 2026-08-03)", () => {
    const lead = structuredClone(apiLead);
    lead.attributes.applicant_meta.employment_status = "employed_unlimited";
    lead.attributes.property_meta.property_type = "single_family";
    lead.attributes.loan_application_meta.finance_type = "capital_raising";
    const dto = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto!.antragsteller[0]!.beschaeftigung?.art).toBe("angestellter");
    expect(dto!.objekt?.art).toBe("einfamilienhaus");
    expect(dto!.finanzierung?.art).toBe("kapitalbeschaffung");

    lead.attributes.applicant_meta.employment_status = "worker";
    lead.attributes.loan_application_meta.finance_type = "new_from_developer";
    const dto2 = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto2!.antragsteller[0]!.beschaeftigung?.art).toBe("angestellter");
    expect(dto2!.finanzierung?.art).toBe("neubau");

    // Zwei-/Doppelfamilienhaus wird bewusst NICHT geraten (Bank unterscheidet 1-2 vs. 3+ Einheiten).
    lead.attributes.property_meta.property_type = "two_family";
    expect(parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711")!.objekt?.art).toBeUndefined();
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

  it("akzeptiert PLZ als Zahl (kommt in Echtdaten vor) und liefert sie als String", () => {
    const lead = structuredClone(apiLead);
    lead.attributes.applicant_meta.german_zipcode_number = 76131 as never;
    lead.attributes.property_meta.german_zipcode_number = 76133 as never;
    const dto = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto!.antragsteller[0]!.plz).toBe("76131");
    expect(dto!.objekt?.plz).toBe("76133");
  });

  it("akzeptiert Preise und Finanzierungswünsche als String (kommt in Echtdaten vor)", () => {
    const lead = structuredClone(apiLead);
    lead.attributes.property_meta.final_sale_price = "450000.0" as never;
    lead.attributes.loan_application_meta.financing_wish = [{ amount: "300000.0" }, { amount: 80000 }] as never;
    const dto = parseFinLinkLeadsResponse({ data: [lead] }, "lead-4711");
    expect(dto!.finanzierung?.kaufpreis).toBe(450000);
    expect(dto!.finanzierung?.darlehenswunsch).toBe(380000);
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

describe("parseFinLinkLeadQuelle", () => {
  const body = (extras: unknown) => ({
    data: { id: "lead-1", type: "lead", attributes: { extras_meta: extras } },
  });

  it("liest source_type und source aus extras_meta der /leads/{id}-Antwort", () => {
    expect(parseFinLinkLeadQuelle(body({ source_type: "ImmoscoutLead", source: "Leadshop" }))).toEqual({
      sourceType: "ImmoscoutLead",
      source: "Leadshop",
    });
  });

  it("liefert leere Werte, wenn extras_meta fehlt oder null ist (kommt in Echtdaten vor)", () => {
    expect(parseFinLinkLeadQuelle(body(null))).toEqual({ sourceType: null, source: null });
    expect(parseFinLinkLeadQuelle({ data: { attributes: {} } })).toEqual({ sourceType: null, source: null });
  });

  it("wirft nie – ein unerwarteter Body kostet die Quelle, nicht den Import", () => {
    expect(parseFinLinkLeadQuelle({ kaputt: true })).toEqual({ sourceType: null, source: null });
    expect(parseFinLinkLeadQuelle(null)).toEqual({ sourceType: null, source: null });
  });
});
