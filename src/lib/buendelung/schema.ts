import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";
import { MIN_KANDIDATEN } from "./types";

/**
 * Vertrag mit der KI. Sie schlaegt Gruppen vor - ob daraus ein Vorschlag wird,
 * entscheidet pruefeBuendel(), nicht der Prompt.
 */
export const buendelSchema = z.object({
  titel: z.string().min(1),
  // Zod erwartet ein veraenderliches [string, ...string[]]; DOCUMENT_TYPES ist
  // bewusst `as const`. Die Zusicherung aendert nur den Typ, nicht die Werte.
  vermuteterTyp: z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]).nullable(),
  confidence: z.number().min(0).max(1),
  /**
   * Laufende Nummern der Kandidaten IN DER GEWUENSCHTEN SEITENREIHENFOLGE.
   * Die Reihenfolge im Array ist die Reihenfolge im spaeteren PDF.
   */
  seiten: z.array(z.number().int().nonnegative()).min(MIN_KANDIDATEN),
});

export const buendelungSchema = z.object({ buendel: z.array(buendelSchema) });

export type BuendelungResult = z.infer<typeof buendelungSchema>;
