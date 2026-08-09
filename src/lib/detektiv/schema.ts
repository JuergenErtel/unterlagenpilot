import { z } from "zod";

/**
 * Vertrag mit der KI. Sie liefert AUSSCHLIESSLICH Fakten aus dem Text – niemals
 * eine Bewertung, welche Folgeunterlage noetig ist. Das entscheidet
 * src/lib/detektiv/rules.ts.
 */
export const referenceSchema = z.object({
  kind: z.enum(["selbst", "bezugsurkunde", "nachtrag", "anlage", "last", "grundpfandrecht"]),
  label: z.string().min(1),
  urkundeDatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  urkundenNummer: z.string().nullable(),
  notar: z.string().nullable(),
  abteilung: z.enum(["BV", "II", "III"]).nullable(),
  laufendeNummer: z.string().nullable(),
  sourcePage: z.number().int().positive(),
  /** Ohne woertliches Zitat ist ein Befund nicht nachpruefbar – deshalb Pflicht. */
  sourceQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const documentReferencesSchema = z.object({
  references: z.array(referenceSchema),
});

export type DocumentReferencesResult = z.infer<typeof documentReferencesSchema>;
