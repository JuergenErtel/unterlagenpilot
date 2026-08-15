import { z } from "zod";
import { personenSchluessel } from "@/lib/self-disclosure/navigation";
import type { Feld, Schritt } from "@/lib/self-disclosure/types";

/**
 * Validierung eines Schritts. Grundsatz: Ein leeres Feld ist immer gültig —
 * geprüft wird ausschließlich die FORM eines eingegebenen Werts. Der Kunde soll
 * überspringen können, ohne dass der Bogen ihn festhält.
 */

/** "400.000,50" oder "400000" -> 400000.5; "" -> null; Unlesbares -> Fehler. */
export function parseBetrag(roh: string): number | null {
  const s = roh.trim();
  if (s === "") return null;
  const normiert = s.replace(/\./g, "").replace(",", ".").replace(/[€%\s]/g, "");
  const n = Number(normiert);
  if (normiert === "" || !Number.isFinite(n)) throw new Error("kein Betrag");
  return n;
}

const leerZuNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

function feldSchema(feld: Feld): z.ZodTypeAny {
  switch (feld.typ) {
    case "betrag":
    case "prozent_oder_betrag":
    case "zahl":
      return z.preprocess(
        leerZuNull,
        z
          .union([z.number(), z.string()])
          .nullable()
          .transform((v, ctx) => {
            if (v === null) return null;
            if (typeof v === "number") return v;
            try {
              return parseBetrag(v);
            } catch {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine Zahl eingeben." });
              return z.NEVER;
            }
          })
      );
    case "auswahl": {
      const erlaubt = (feld.optionen ?? []).map((o) => o.wert);
      return z.preprocess(
        leerZuNull,
        z
          .string()
          .nullable()
          .refine((v) => v === null || erlaubt.includes(v), {
            message: "Bitte eine der Optionen wählen.",
          })
      );
    }
    case "ja_nein":
      return z.preprocess(
        (v) => (v === "ja" || v === true ? true : v === "nein" || v === false ? false : null),
        z.boolean().nullable()
      );
    case "datum":
      return z.preprocess(
        leerZuNull,
        z
          .string()
          .nullable()
          .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
            message: "Bitte ein gültiges Datum eingeben.",
          })
      );
    default:
      return z.preprocess(leerZuNull, z.string().max(500).nullable());
  }
}

export function schrittSchema(
  schritt: Schritt,
  personen?: (1 | 2)[]
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  // Die Schluessel des Schemas MUESSEN denen des Formulars entsprechen:
  // .strip() wirft alles Unbekannte weg, und zwar lautlos. Ein Schema ueber
  // blosse Feld-IDs liesse bei Spalten jede Antwort verschwinden.
  for (const person of personen ?? [undefined]) {
    for (const feld of schritt.felder) {
      shape[personenSchluessel(schritt.id, feld.id, person)] = feldSchema(feld).optional();
    }
  }
  return z.object(shape).strip() as unknown as z.ZodType<Record<string, unknown>>;
}
