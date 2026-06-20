import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  MARITAL_STATUSES,
  PROPERTY_TYPES,
  USAGE_TYPES,
} from "./enums";

/**
 * Kunden-Erstformular (über den sicheren Upload-Link).
 * Speicherbar (Teilstand) und mit extrahierten Dokumentdaten abgleichbar.
 */
export const customerFormSchema = z.object({
  vorname: z.string().min(1, "Bitte Vorname angeben").optional().or(z.literal("")),
  nachname: z.string().optional().or(z.literal("")),
  geburtsdatum: z.string().optional().or(z.literal("")),
  strasse: z.string().optional().or(z.literal("")),
  plz: z.string().optional().or(z.literal("")),
  ort: z.string().optional().or(z.literal("")),
  email: z.string().email("Bitte gültige E-Mail").optional().or(z.literal("")),
  telefon: z.string().optional().or(z.literal("")),
  familienstand: z.enum(MARITAL_STATUSES).optional(),
  anzahlKinder: z.coerce.number().int().min(0).optional(),
  beruf: z.string().optional().or(z.literal("")),
  arbeitgeber: z.string().optional().or(z.literal("")),
  eintrittsdatum: z.string().optional().or(z.literal("")),
  beschaeftigungsart: z.enum(EMPLOYMENT_TYPES).optional(),
  nettoEinkommen: z.coerce.number().min(0).optional(),
  sonstigeEinnahmen: z.coerce.number().min(0).optional(),
  bestehendeKredite: z.string().optional().or(z.literal("")),
  eigenkapital: z.coerce.number().min(0).optional(),
  objektart: z.enum(PROPERTY_TYPES).optional(),
  objektStrasse: z.string().optional().or(z.literal("")),
  objektPlz: z.string().optional().or(z.literal("")),
  objektOrt: z.string().optional().or(z.literal("")),
  kaufpreis: z.coerce.number().min(0).optional(),
  baukosten: z.coerce.number().min(0).optional(),
  geplanteNutzung: z.enum(USAGE_TYPES).optional(),
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
