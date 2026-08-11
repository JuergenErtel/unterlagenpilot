import { z } from "zod";

/**
 * Die vier Urteile, die eine Bankaussage zu einer Frage tragen kann.
 *
 * "keine_aussage" ist KEIN Nein – es ist die haeufigste Antwort im Bestand und
 * die einzige, die man nicht gegen die Bank verwenden darf.
 */
export const URTEILE = ["ja", "bedingt", "nein", "keine_aussage"] as const;
export type Urteil = (typeof URTEILE)[number];

/** Wie die Frage gedeutet wurde – Ausgabe des kleinen ersten KI-Aufrufs. */
export const deutungSchema = z.object({
  /** Kriteriennamen aus dem Katalog. Wird spaeter gegen den Katalog geprueft. */
  kriterien: z.array(z.string()).max(10).default([]),
  /** Bankname, falls die Frage einen nennt. Aufloesung passiert im Code. */
  bank: z.string().nullable().default(null),
  /** Stichwoerter fuer das Volltext-Auffangnetz. */
  stichwoerter: z.array(z.string()).max(10).default([]),
  /** Die Frage in eigenen Worten – macht die Deutung fuer den Nutzer pruefbar. */
  verstanden: z.string().default(""),
});
export type Deutung = z.infer<typeof deutungSchema>;

/** Urteil je Textblock – Ausgabe der gebuendelten Leseaufrufe. */
export const urteileSchema = z.object({
  urteile: z
    .array(
      z.object({
        id: z.number().int(),
        urteil: z.enum(URTEILE),
        /** Woertliches Zitat aus genau diesem Text. Wird gegengeprueft. */
        beleg: z.string().default(""),
      })
    )
    .default([]),
});
export type UrteileErgebnis = z.infer<typeof urteileSchema>;
