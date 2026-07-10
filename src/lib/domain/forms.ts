import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  MARITAL_STATUSES,
  PROPERTY_TYPES,
  USAGE_TYPES,
} from "./enums";

/**
 * HTML-Formulare liefern für „nicht ausgefüllt" immer `""`, nie `undefined`.
 * Ohne Vorverarbeitung würde
 *  - ein leeres `<select>` das Enum-Schema sprengen (safeParse schlägt fürs
 *    GANZE Objekt fehl → Stammdaten-Übernahme wird still übersprungen), und
 *  - ein leeres Zahlenfeld über `z.coerce.number()` zu `0` werden – fachlich
 *    ein Unterschied ums Ganze: „0 € Eigenkapital" statt „keine Angabe".
 * Daher: `""` → `undefined`, bevor validiert wird.
 */
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const optionalText = () => z.string().optional().or(z.literal(""));
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndefined, z.enum(values).optional());
const optionalNumber = (opts?: { int?: boolean }) =>
  z.preprocess(
    emptyToUndefined,
    (opts?.int ? z.coerce.number().int() : z.coerce.number()).min(0).optional()
  );

/**
 * Kunden-Erstformular (über den sicheren Upload-Link).
 * Speicherbar (Teilstand) und mit extrahierten Dokumentdaten abgleichbar.
 */
export const customerFormSchema = z.object({
  vorname: optionalText(),
  nachname: optionalText(),
  geburtsdatum: optionalText(),
  strasse: optionalText(),
  plz: optionalText(),
  ort: optionalText(),
  email: z.string().email("Bitte gültige E-Mail").optional().or(z.literal("")),
  telefon: optionalText(),
  familienstand: optionalEnum(MARITAL_STATUSES),
  anzahlKinder: optionalNumber({ int: true }),
  beruf: optionalText(),
  arbeitgeber: optionalText(),
  eintrittsdatum: optionalText(),
  beschaeftigungsart: optionalEnum(EMPLOYMENT_TYPES),
  nettoEinkommen: optionalNumber(),
  sonstigeEinnahmen: optionalNumber(),
  bestehendeKredite: optionalText(),
  eigenkapital: optionalNumber(),
  objektart: optionalEnum(PROPERTY_TYPES),
  objektStrasse: optionalText(),
  objektPlz: optionalText(),
  objektOrt: optionalText(),
  kaufpreis: optionalNumber(),
  baukosten: optionalNumber(),
  geplanteNutzung: optionalEnum(USAGE_TYPES),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;

export const customerFormFieldLabels: Record<keyof CustomerFormData, string> = {
  vorname: "Vorname",
  nachname: "Nachname",
  geburtsdatum: "Geburtsdatum",
  strasse: "Straße & Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  email: "E-Mail",
  telefon: "Telefon",
  familienstand: "Familienstand",
  anzahlKinder: "Anzahl Kinder",
  beruf: "Beruf",
  arbeitgeber: "Arbeitgeber",
  eintrittsdatum: "Eintrittsdatum",
  beschaeftigungsart: "Beschäftigungsart",
  nettoEinkommen: "Monatliches Nettoeinkommen",
  sonstigeEinnahmen: "Sonstige Einnahmen",
  bestehendeKredite: "Bestehende Kredite",
  eigenkapital: "Eigenkapital",
  objektart: "Objektart",
  objektStrasse: "Objekt – Straße",
  objektPlz: "Objekt – PLZ",
  objektOrt: "Objekt – Ort",
  kaufpreis: "Kaufpreis",
  baukosten: "Baukosten",
  geplanteNutzung: "Geplante Nutzung",
};
