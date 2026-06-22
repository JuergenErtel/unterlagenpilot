import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EinkommenDoc, Kennzahl } from "@/lib/einkommen/consolidate";

const kennzahlenSchema = z
  .object({
    umsatz: z.number().optional(),
    gewinn: z.number().optional(),
    zuVersteuerndesEinkommen: z.number().optional(),
    afa: z.number().optional(),
    zinsaufwand: z.number().optional(),
    privatentnahmen: z.number().optional(),
    geschaeftsfuehrergehalt: z.number().optional(),
  })
  .default({});

const docSchema = z.object({
  dokumenttyp: z
    .enum([
      "bwa",
      "jahresabschluss",
      "euer",
      "einkommensteuerbescheid",
      "einkommensteuererklaerung",
      "susa",
      "sonstige",
    ])
    .default("sonstige"),
  jahr: z.number().int().default(0),
  kennzahlen: kennzahlenSchema,
  notiz: z.string().default(""),
  konfidenz: z.number().min(0).max(1).default(0.5),
});

export const selfEmployedAnalysisSchema = z.object({
  docs: z.array(docSchema).default([]),
});

export type SelfEmployedAnalysis = z.infer<typeof selfEmployedAnalysisSchema>;

export const selfEmployedJsonSchema = zodToJsonSchema(
  selfEmployedAnalysisSchema,
  "selfEmployed"
) as Record<string, unknown>;

/** Mappt die KI-Ausgabe auf EinkommenDoc[]; verwirft Dokumente ohne plausibles Jahr. */
export function toEinkommenDocs(a: SelfEmployedAnalysis): EinkommenDoc[] {
  return a.docs
    .filter((d) => d.jahr >= 1990 && d.jahr <= 2100)
    .map((d) => {
      const kennzahlen: Partial<Record<Kennzahl, number>> = {};
      for (const [k, v] of Object.entries(d.kennzahlen)) {
        if (typeof v === "number") kennzahlen[k as Kennzahl] = v;
      }
      return { dokumenttyp: d.dokumenttyp, jahr: d.jahr, kennzahlen, notiz: d.notiz, konfidenz: d.konfidenz };
    });
}
