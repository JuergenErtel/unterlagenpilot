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
    user_meta: z
      .object({ email: z.string().optional().nullable(), phone_number: z.string().optional().nullable() })
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
        financing_wish: z.array(z.object({ amount: numOrStr })).optional().nullable(),
      })
      .optional()
      .nullable(),
  }),
});

const apiLeadsResponseSchema = z.object({ data: z.array(apiLeadSchema) });

/**
 * Sucht den Lead mit `externalId` in der /leads-Antwort und übersetzt ihn in
 * das interne Vorgangs-DTO. `null`, wenn die ID nicht vorkommt; wirft bei
 * strukturell ungültiger Antwort.
 */
export function parseFinLinkLeadsResponse(body: unknown, externalId: string): FinLinkVorgangDTO | null {
  const parsed = apiLeadsResponseSchema.parse(body);
  const lead = parsed.data.find((l) => l.id === externalId);
  if (!lead) return null;

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
    antragsteller: am
      ? [
          {
            vorname: am.first_name ?? undefined,
            nachname: am.last_name ?? undefined,
            geburtsdatum: am.dob ?? undefined,
            geburtsort: am.birth_city ?? undefined,
            familienstand: translate(RELATIONSHIP_DE, am.relationship_status ?? undefined),
            anzahlKinder: am.children_meta ? am.children_meta.length : undefined,
            strasse: joinStrasse(am.street_address, am.house_number),
            plz: toPlz(am.german_zipcode_number),
            ort: am.city_name ?? undefined,
            email: am.email_address ?? um?.email ?? undefined,
            telefon: am.phone_number ?? um?.phone_number ?? undefined,
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
