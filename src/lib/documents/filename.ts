import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/domain/enums";

/**
 * Automatische, sinnvolle Dateibenennung.
 * Beispiele:
 *   Gehaltsabrechnung_Max_Mustermann_2026-05.pdf
 *   Grundbuch_Musterstrasse_12_Woerth.pdf
 *   Personalausweis_Erika_Mustermann.pdf
 *   Expose_Musterstrasse_12.pdf
 */

const TYPE_PREFIX: Partial<Record<DocumentType, string>> = {
  gehaltsabrechnung: "Gehaltsabrechnung",
  grundbuchauszug: "Grundbuch",
  personalausweis: "Personalausweis",
  expose: "Expose",
  kontoauszug: "Kontoauszug",
  einkommensteuerbescheid: "ESt-Bescheid",
  eigenkapitalnachweis: "Eigenkapitalnachweis",
  kaufvertragsentwurf: "Kaufvertrag",
  mietvertrag: "Mietvertrag",
  rentenbescheid: "Rentenbescheid",
};

export interface FilenameInput {
  documentType: DocumentType | null | undefined;
  applicantName?: string | null;
  propertyRef?: string | null; // z.B. "Musterstraße 12, Wörth"
  period?: string | null; // z.B. 2026-05
  originalName: string;
}

/** Ersetzt Umlaute/Sonderzeichen für dateisystemfreundliche Namen. */
export function slugify(input: string): string {
  return input
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function extOf(name: string): string {
  const m = name.match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? `.${m[1]!.toLowerCase()}` : ".pdf";
}

export function generateFileName(input: FilenameInput): string {
  const ext = extOf(input.originalName);
  const type = input.documentType ?? "sonstige";
  const prefix = TYPE_PREFIX[type] ?? slugify(DOCUMENT_TYPE_LABELS[type] ?? "Dokument");

  const parts: string[] = [prefix];

  // Personenbezug
  if (input.applicantName) parts.push(slugify(input.applicantName));

  // Objektbezug (für Grundbuch/Exposé/Objektunterlagen)
  if (
    input.propertyRef &&
    ["grundbuchauszug", "expose", "flurkarte_lageplan", "teilungserklaerung", "wohnflaechenberechnung", "kaufvertragsentwurf"].includes(
      type
    )
  ) {
    parts.push(slugify(input.propertyRef));
  }

  // Zeitraum (für periodische Unterlagen) – Bindestrich im Datum bewahren.
  if (input.period) parts.push(input.period.trim().replace(/[^0-9A-Za-z-]/g, ""));

  const base = parts.filter(Boolean).join("_") || "Dokument";
  return `${base}${ext}`;
}
