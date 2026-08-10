import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";

/**
 * Vertrag mit der KI. Sie schlaegt Grenzen vor – ob daraus ein Vorschlag wird,
 * entscheidet pruefeSegmente(), nicht der Prompt.
 */
export const segmentSchema = z.object({
  vonSeite: z.number().int().positive(),
  bisSeite: z.number().int().positive(),
  // Zod erwartet ein veraenderliches [string, ...string[]]; DOCUMENT_TYPES ist
  // bewusst `as const`. Die Zusicherung aendert nur den Typ, nicht die Werte.
  vermuteterTyp: z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]).nullable(),
  titel: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const dokumentgrenzenSchema = z.object({
  segmente: z.array(segmentSchema),
});

export type DokumentgrenzenResult = z.infer<typeof dokumentgrenzenSchema>;
