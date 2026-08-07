import { z } from "zod";

/**
 * FinLink-Vorgangs-DTO (interne Form) + Parser für die echte Partner-API.
 *
 * Die Partner-API (https://api.finlink.de/partner-api/docs/redoc) liefert
 * unter GET /leads eine JSON:API-Liste; einen Einzel-Abruf per ID gibt es
 * nicht. `parseFinLinkLeadsResponse` sucht den Lead in der Liste und übersetzt
 * ihn in die interne Vorgangs-Form, auf der Mapping/Writer aufsetzen.
 *
 * Grundsätze: alles außer `id` optional; unbekannte Felder werden ignoriert
 * (kein `.strict()`), damit ein erweiterter Payload nicht bricht; unbekannte
 * Vokabeln werden weggelassen statt geraten.
 */
const beschaeftigung = z
  .object({
    art: z.string().optional(),
    beruf: z.string().optional(),
    arbeitgeber: z.string().optional(),
  })
  .optional();

const einkommen = z
  .object({
    nettoMonatlich: z.number().optional(),
    bruttoMonatlich: z.number().optional(),
  })
  .optional();

const antragsteller = z.object({
  vorname: z.string().optional(),
  nachname: z.string().optional(),
  geburtsdatum: z.string().optional(), // ISO yyyy-mm-dd
  geburtsort: z.string().optional(),
  staatsangehoerigkeit: z.string().optional(),
  familienstand: z.string().optional(),
  anzahlKinder: z.number().int().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  beschaeftigung,
  einkommen,
});

const objekt = z
  .object({
    art: z.string().optional(),
    strasse: z.string().optional(),
    plz: z.string().optional(),
    ort: z.string().optional(),
  })
  .optional();

const finanzierung = z
  .object({
    art: z.string().optional(),
    kaufpreis: z.number().optional(),
    darlehenswunsch: z.number().optional(),
  })
  .optional();

export const finlinkVorgangSchema = z.object({
  id: z.string().min(1),
  antragsteller: z.array(antragsteller).default([]),
  objekt,
  finanzierung,
});

export type FinLinkVorgangDTO = z.infer<typeof finlinkVorgangSchema>;

/** Validiert einen rohen FinLink-Payload; wirft ZodError bei ungültig. */
export function parseFinLinkVorgang(input: unknown): FinLinkVorgangDTO {
  return finlinkVorgangSchema.parse(input);
}

// ─── Echte Partner-API (JSON:API unter /leads) ───────────────────────────────

/**
 * Vokabel-Übersetzungen Partner-API → kanonische Enums. Mit der echten API
 * abgeglichen (Live-Bestand 2026-08-03, 100 Leads); zusätzlich plausible, noch
 * nicht beobachtete Werte. Unbekanntes fällt auf undefined zurück (das Mapping
 * lässt das Feld dann leer, es wird nie geraten).
 */
const FINANCE_TYPE_DE: Record<string, string> = {
  // live beobachtet:
  buy_existing: "kauf",
  new_from_developer: "neubau", // Kauf vom Bauträger
  self_construction: "neubau",
  capital_raising: "kapitalbeschaffung",
  modernization: "modernisierung",
  // plausibel, noch nicht beobachtet:
  construction_financing: "neubau",
  follow_up_financing: "anschlussfinanzierung",
  refinancing: "umschuldung",
};
const RELATIONSHIP_DE: Record<string, string> = {
  // live beobachtet: single, married, widowed
  single: "ledig",
  married: "verheiratet",
  divorced: "geschieden",
  widowed: "verwitwet",
  registered_partnership: "eingetragene_partnerschaft",
  civil_union: "eingetragene_partnerschaft",
  separated: "getrennt_lebend",
};
const EMPLOYMENT_DE: Record<string, string> = {
  // live beobachtet:
  employed_unlimited: "angestellter",
  worker: "angestellter", // Arbeiter:in (nichtselbständig)
  self_employed: "selbststaendiger",
  freelancer: "selbststaendiger",
  civil_servant: "beamter",
  other: "sonstiges",
  // plausibel, noch nicht beobachtet:
  employed_limited: "angestellter",
  employed: "angestellter",
  employee: "angestellter",
  retired: "rentner",
  pensioner: "rentner",
  managing_director: "geschaeftsfuehrer",
  shareholder: "gesellschafter",
};
const PROPERTY_TYPE_DE: Record<string, string> = {
  // live beobachtet:
  apartment: "eigentumswohnung",
  single_family: "einfamilienhaus",
  apartment_building: "mehrfamilienhaus",
  // two_family/double_family (Zweifamilienhaus) bewusst NICHT gemappt:
  // Banken unterscheiden 1-2 Einheiten vs. Mehrfamilienhaus (3+) – nicht raten.
  // plausibel, noch nicht beobachtet:
  single_family_house: "einfamilienhaus",
  detached_house: "einfamilienhaus",
  semi_detached_house: "doppelhaushaelfte",
  terraced_house: "reihenhaus",
  townhouse: "reihenhaus",
  condominium: "eigentumswohnung",
  flat: "eigentumswohnung",
  multi_family_house: "mehrfamilienhaus",
  plot: "grundstueck",
  land: "grundstueck",
  commercial: "gewerbe",
};

const translate = (map: Record<string, string>, raw: string | undefined | null): string | undefined =>
  raw ? map[raw.trim().toLowerCase()] : undefined;

/** Die API liefert Beträge teils als String ("3200.0"); leere Strings/NaN → undefined. */
const toNumber = (v: string | number | undefined | null): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const joinStrasse = (street?: string | null, houseNumber?: string | null): string | undefined => {
  const s = [street, houseNumber].filter(Boolean).join(" ").trim();
  return s || undefined;
};

const numOrStr = z.union([z.number(), z.string()]).optional().nullable();
// PLZ kommt in Echtdaten mal als String, mal als Zahl.
const plzField = z.union([z.string(), z.number()]).optional().nullable();
const toPlz = (v: string | number | undefined | null): string | undefined =>
  v == null || v === "" ? undefined : String(v);

const apiApplicantMeta = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  birth_city: z.string().optional().nullable(),
  email_address: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  relationship_status: z.string().optional().nullable(),
  employment_status: z.string().optional().nullable(),
  monthly_net_income: numOrStr,
  street_address: z.string().optional().nullable(),
  house_number: z.string().optional().nullable(),
  german_zipcode_number: plzField,
  city_name: z.string().optional().nullable(),
  children_meta: z.array(z.unknown()).optional().nullable(),
  employer_meta: z
    .object({ name: z.string().optional().nullable(), role_title: z.string().optional().nullable() })
    .optional()
    .nullable(),
});

const apiLeadSchema = z.object({
  id: z.string().min(1),
  attributes: z.object({
    applicant_meta: apiApplicantMeta.optional().nullable(),
    // Bei vielen Leads (576 von 905 im Bestand 08/2026) stehen Name/Telefon
    // NUR hier und nicht in applicant_meta – user_meta ist der Fallback.
    user_meta: z
      .object({
        email: z.string().optional().nullable(),
        phone_number: z.string().optional().nullable(),
        first_name: z.string().optional().nullable(),
        last_name: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    property_meta: z
      .object({
        property_type: z.string().optional().nullable(),
        street_address: z.string().optional().nullable(),
        house_number: z.string().optional().nullable(),
        german_zipcode_number: plzField,
        city_name: z.string().optional().nullable(),
        listed_price: numOrStr,
        final_sale_price: numOrStr,
      })
      .optional()
      .nullable(),
    loan_application_meta: z
      .object({
        finance_type: z.string().optional().nullable(),
        // In Echtdaten mal Array, mal Objekt (ältere Leads) – Nicht-Arrays zählen als leer.
        financing_wish: z
          .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ amount: numOrStr })))
          .optional()
          .nullable(),
      })
      .optional()
      .nullable(),
    created_at: z.string().optional().nullable(),
  }),
});

const apiLeadsResponseSchema = z.object({ data: z.array(apiLeadSchema) });

/**
 * Kompakte Lead-Zusammenfassung für die Auswahlliste auf der Import-Seite.
 * Nur Anzeigefelder – der vollständige Import läuft weiterhin über
 * `parseFinLinkLeadsResponse` + Mapping/Writer.
 */
export interface FinLinkLeadSummary {
  id: string;
  vorname?: string;
  nachname?: string;
  ort?: string;
  objektOrt?: string;
  finanzierungsart?: string;
  kaufpreis?: number;
  createdAt?: string; // ISO
  /** Vertriebsstatus aus /loan_applications: active | lost | won | on_hold */
  salesState?: string;
}

/** Vertriebsstatus eines Antrags samt zugehöriger Lead-ID (aus /loan_applications). */
export interface FinLinkSalesStateEntry {
  leadId: string;
  salesState: string;
}

const apiLoanApplicationsSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({ sales_state: z.string().optional().nullable() }).passthrough(),
      relationships: z
        .object({ lead: z.object({ data: z.object({ id: z.string() }).optional().nullable() }).optional().nullable() })
        .passthrough()
        .optional()
        .nullable(),
    })
  ),
});

/** Zieht aus der /loan_applications-Antwort die Vertriebsstatus-Einträge je Lead. */
export function parseFinLinkSalesStates(body: unknown): FinLinkSalesStateEntry[] {
  const parsed = apiLoanApplicationsSchema.parse(body);
  const entries: FinLinkSalesStateEntry[] = [];
  for (const la of parsed.data) {
    const leadId = la.relationships?.lead?.data?.id;
    const state = la.attributes.sales_state ?? undefined;
    if (leadId && state) entries.push({ leadId, salesState: state });
  }
  return entries;
}

/** Übersetzt die komplette /leads-Antwort in Anzeige-Zusammenfassungen. */
export function parseFinLinkLeadsSummaries(body: unknown): FinLinkLeadSummary[] {
  const parsed = apiLeadsResponseSchema.parse(body);
  return parsed.data.map((lead) => {
    const am = lead.attributes.applicant_meta;
    const pm = lead.attributes.property_meta;
    const lm = lead.attributes.loan_application_meta;
    const um = lead.attributes.user_meta;
    return {
      id: lead.id,
      vorname: am?.first_name ?? um?.first_name ?? undefined,
      nachname: am?.last_name ?? um?.last_name ?? undefined,
      ort: am?.city_name ?? undefined,
      objektOrt: pm?.city_name ?? undefined,
      finanzierungsart: translate(FINANCE_TYPE_DE, lm?.finance_type ?? undefined),
      kaufpreis: toNumber(pm?.final_sale_price) ?? toNumber(pm?.listed_price),
      createdAt: lead.attributes.created_at ?? undefined,
    };
  });
}

/**
 * Sucht den Lead mit `externalId` in der /leads-Antwort und übersetzt ihn in
 * das interne Vorgangs-DTO. `null`, wenn die ID nicht vorkommt; wirft bei
 * strukturell ungültiger Antwort.
 */
export function parseFinLinkLeadsResponse(body: unknown, externalId: string): FinLinkVorgangDTO | null {
  const parsed = apiLeadsResponseSchema.parse(body);
  const lead = parsed.data.find((l) => l.id === externalId);
  if (!lead) return null;
  return mapApiLead(lead);
}

/** Übersetzt die /leads/{id}-Einzelantwort in das interne Vorgangs-DTO. */
export function parseFinLinkSingleLeadResponse(body: unknown): FinLinkVorgangDTO {
  const parsed = z.object({ data: apiLeadSchema }).parse(body);
  return mapApiLead(parsed.data);
}

/** IDs der Anträge (loan_applications) aus der /leads/{id}-Antwort. */
export function parseFinLinkLeadLoanApplicationIds(body: unknown): string[] {
  const schema = z.object({
    data: z
      .object({
        relationships: z
          .object({
            loan_applications: z
              .object({ data: z.array(z.object({ id: z.string() })).optional().nullable() })
              .optional()
              .nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
      })
      .passthrough(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return [];
  return (parsed.data.data.relationships?.loan_applications?.data ?? []).map((d) => d.id);
}

/**
 * Antragsteller aus GET /loan_applications/{id}/applicants. Deutlich reicher
 * als die Lead-Ebene (Geburtsdatum/-ort, E-Mail, Familienstand, Kinder,
 * Staatsangehörigkeit) und enthält auch Mit-Antragsteller, die am Lead
 * komplett fehlen.
 */
const apiLoanApplicantSchema = z.object({
  attributes: z
    .object({
      first_name: z.string().optional().nullable(),
      last_name: z.string().optional().nullable(),
      dob: z.string().optional().nullable(), // ISO-Datetime, z. B. 1990-04-29T00:00:00.000+02:00
      birth_city: z.string().optional().nullable(),
      nationality: z.string().optional().nullable(),
      relationship_status: z.string().optional().nullable(),
      number_of_dependants: numOrStr,
      email_address: z.string().optional().nullable(),
      phone_number: z.string().optional().nullable(),
      employment_status: z.string().optional().nullable(),
      monthly_net_income: numOrStr,
      street_address: z.string().optional().nullable(),
      house_number: z.string().optional().nullable(),
      german_zipcode_number: plzField,
      city_name: z.string().optional().nullable(),
      employer_meta: z
        .object({ name: z.string().optional().nullable(), role_title: z.string().optional().nullable() })
        .optional()
        .nullable(),
    })
    .passthrough(),
});

type Antragsteller = FinLinkVorgangDTO["antragsteller"][number];

export function parseFinLinkApplicantsResponse(body: unknown): Antragsteller[] {
  const parsed = z.object({ data: z.array(apiLoanApplicantSchema) }).parse(body);
  return parsed.data.map((ap) => {
    const at = ap.attributes;
    const kinder = toNumber(at.number_of_dependants);
    const beschaeftigungsart = translate(EMPLOYMENT_DE, at.employment_status ?? undefined);
    const arbeitgeber = at.employer_meta?.name ?? undefined;
    const beruf = at.employer_meta?.role_title ?? undefined;
    const netto = toNumber(at.monthly_net_income);
    return {
      vorname: at.first_name ?? undefined,
      nachname: at.last_name ?? undefined,
      geburtsdatum: at.dob ? at.dob.slice(0, 10) : undefined,
      geburtsort: at.birth_city ?? undefined,
      staatsangehoerigkeit: at.nationality ?? undefined,
      familienstand: translate(RELATIONSHIP_DE, at.relationship_status ?? undefined),
      anzahlKinder: kinder != null && Number.isInteger(kinder) ? kinder : undefined,
      strasse: joinStrasse(at.street_address, at.house_number),
      plz: toPlz(at.german_zipcode_number),
      ort: at.city_name ?? undefined,
      email: at.email_address ?? undefined,
      telefon: at.phone_number ?? undefined,
      beschaeftigung:
        beschaeftigungsart || beruf || arbeitgeber ? { art: beschaeftigungsart, beruf, arbeitgeber } : undefined,
      einkommen: netto != null ? { nettoMonatlich: netto } : undefined,
    };
  });
}

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Reichert das Lead-DTO mit den Detail-Antragstellern an. Detailwerte haben
 * Vorrang; für den ersten Antragsteller bleiben Lead-Felder (v. a. Adresse)
 * als Fallback erhalten. Ohne Detaildaten bleibt das DTO unverändert.
 */
export function mergeAntragstellerDetails(dto: FinLinkVorgangDTO, detailed: Antragsteller[]): FinLinkVorgangDTO {
  if (detailed.length === 0) return dto;
  const lead1 = dto.antragsteller[0];
  const antragsteller = detailed.map((d, i) => {
    if (i > 0 || !lead1) return d;
    return {
      ...lead1,
      ...stripUndefined(d),
      beschaeftigung:
        d.beschaeftigung || lead1.beschaeftigung
          ? { ...lead1.beschaeftigung, ...stripUndefined(d.beschaeftigung ?? {}) }
          : undefined,
      einkommen:
        d.einkommen || lead1.einkommen ? { ...lead1.einkommen, ...stripUndefined(d.einkommen ?? {}) } : undefined,
    };
  });
  return parseFinLinkVorgang({ ...dto, antragsteller });
}

function mapApiLead(lead: z.infer<typeof apiLeadSchema>): FinLinkVorgangDTO {
  const am = lead.attributes.applicant_meta;
  const pm = lead.attributes.property_meta;
  const lm = lead.attributes.loan_application_meta;
  const um = lead.attributes.user_meta;

  const netto = toNumber(am?.monthly_net_income ?? undefined);
  const beschaeftigungsart = translate(EMPLOYMENT_DE, am?.employment_status ?? undefined);
  const arbeitgeber = am?.employer_meta?.name ?? undefined;
  const beruf = am?.employer_meta?.role_title ?? undefined;

  const wishSum = (lm?.financing_wish ?? [])
    .map((w) => toNumber(w.amount) ?? 0)
    .reduce((sum, a) => sum + a, 0);

  return parseFinLinkVorgang({
    id: lead.id,
    antragsteller: am || um
      ? [
          {
            vorname: am?.first_name ?? um?.first_name ?? undefined,
            nachname: am?.last_name ?? um?.last_name ?? undefined,
            geburtsdatum: am?.dob ?? undefined,
            geburtsort: am?.birth_city ?? undefined,
            familienstand: translate(RELATIONSHIP_DE, am?.relationship_status ?? undefined),
            anzahlKinder: am?.children_meta ? am.children_meta.length : undefined,
            strasse: joinStrasse(am?.street_address, am?.house_number),
            plz: toPlz(am?.german_zipcode_number),
            ort: am?.city_name ?? undefined,
            email: am?.email_address ?? um?.email ?? undefined,
            telefon: am?.phone_number ?? um?.phone_number ?? undefined,
            beschaeftigung:
              beschaeftigungsart || beruf || arbeitgeber
                ? { art: beschaeftigungsart, beruf, arbeitgeber }
                : undefined,
            einkommen: netto != null ? { nettoMonatlich: netto } : undefined,
          },
        ]
      : [],
    objekt: pm
      ? {
          art: translate(PROPERTY_TYPE_DE, pm.property_type ?? undefined),
          strasse: joinStrasse(pm.street_address, pm.house_number),
          plz: toPlz(pm.german_zipcode_number),
          ort: pm.city_name ?? undefined,
        }
      : undefined,
    finanzierung: {
      art: translate(FINANCE_TYPE_DE, lm?.finance_type ?? undefined),
      kaufpreis: toNumber(pm?.final_sale_price) ?? toNumber(pm?.listed_price),
      darlehenswunsch: wishSum > 0 ? wishSum : undefined,
    },
  });
}

/**
 * Die Felder, die der Lead-Abgleich braucht – bewusst getrennt von
 * `FinLinkLeadSummary` (Anzeige) und `FinLinkVorgangDTO` (Fallinhalt).
 * `extras_meta` ist in echten Daten mal Objekt, mal null.
 */
export interface FinLinkLeadRoh {
  id: string;
  /** ISO-Zeitstempel des Eingangs; null, wenn FinLink keinen liefert. */
  createdAt: string | null;
  sourceType: string | null;
  source: string | null;
  einwilligungKontakt: boolean | null;
  einwilligungMarketing: boolean | null;
}

const rohLeadSchema = z.object({
  id: z.string().min(1),
  attributes: z
    .object({
      created_at: z.string().optional().nullable(),
      extras_meta: z
        .object({
          source: z.string().optional().nullable(),
          source_type: z.string().optional().nullable(),
          consent_to_contact: z.boolean().optional().nullable(),
          consent_marketing: z.boolean().optional().nullable(),
        })
        .passthrough()
        .optional()
        .nullable(),
    })
    .passthrough(),
});

export function parseFinLinkLeadsRoh(body: unknown): FinLinkLeadRoh[] {
  const parsed = z.object({ data: z.array(rohLeadSchema) }).parse(body);
  return parsed.data.map((l) => {
    const e = l.attributes.extras_meta ?? {};
    return {
      id: l.id,
      createdAt: l.attributes.created_at ?? null,
      sourceType: e.source_type ?? null,
      source: e.source ?? null,
      einwilligungKontakt: e.consent_to_contact ?? null,
      einwilligungMarketing: e.consent_marketing ?? null,
    };
  });
}
