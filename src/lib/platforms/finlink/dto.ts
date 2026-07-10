import { z } from "zod";

/**
 * PROVISORISCHES FinLink-Vorgangs-Schema.
 *
 * Die reale FinLink-API-Struktur liegt noch nicht vor (Doku/Beispiel-JSON
 * ausstehend). Diese Form ist eine fundierte Annahme, damit Mapping, Writer,
 * Connector und UI jetzt gebaut und getestet werden können. Beim Vorliegen des
 * echten Schemas wird NUR diese Datei (+ client.ts) angepasst.
 *
 * Grundsätze: alles außer `id` optional; unbekannte Felder werden ignoriert
 * (kein `.strict()`), damit ein erweiterter Payload nicht bricht.
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
