import { z } from "zod";

/**
 * Der Vertrag zwischen baufivergleicher.de und BaufiDesk.
 *
 * Verbindliche Fassung steht in
 * docs/superpowers/specs/2026-09-20-baufivergleicher-lead-uebergabe-design.md.
 * Wer eine Seite aendert, aendert zuerst dort.
 *
 * Grundregel: Jedes Feld ist gefuellt ODER null – nie weggelassen. `null`
 * heisst "der Interessent hat dazu nichts angegeben", ein fehlendes Feld
 * heisst "die Gegenseite wurde umgebaut". Der Unterschied entscheidet, ob
 * ein Lead stillschweigend halb ankommt oder laut abgelehnt wird.
 */

/** Nullbares Feld, das TROTZDEM dastehen muss (nicht `.optional()`). */
const pflichtLeerbar = <T extends z.ZodTypeAny>(inner: T) => z.union([inner, z.null()]);

export const uebergabeSchema = z.object({
  quelle: z.literal("baufivergleicher"),
  externeId: z.string().min(1).max(64),
  /** offer_review = Anzeigen-Funnel (Spannen), comparison = /vergleich (Betraege). */
  art: z.enum(["offer_review", "comparison"]),
  eingegangenAm: z.string().datetime(),
  kontakt: z.object({
    vorname: z.string().min(1).max(120),
    nachname: z.string().min(1).max(120),
    email: z.string().email(),
    telefon: z.string().min(1).max(60),
  }),
  finanzierung: z.object({
    finanzierungsart: z.string().min(1).max(40),
    // Spannen des Anzeigen-Funnels. Werden NICHT in Zahlen verwandelt.
    betragSpanne: pflichtLeerbar(z.string().max(40)),
    eigenkapitalSpanne: pflichtLeerbar(z.string().max(40)),
    angebotVorhanden: pflichtLeerbar(z.boolean()),
    angebotZins: pflichtLeerbar(z.number().min(0).max(30)),
    angebotAnbieter: pflichtLeerbar(z.string().max(40)),
    // Exakte Angaben des Vergleichsfunnels.
    plz: pflichtLeerbar(z.string().max(10)),
    kaufpreis: pflichtLeerbar(z.number().min(0)),
    eigenkapital: pflichtLeerbar(z.number().min(0)),
    darlehenswunsch: pflichtLeerbar(z.number().min(0)),
    haushaltsnetto: pflichtLeerbar(z.number().min(0)),
  }),
  einwilligung: z.object({
    fassung: z.string().min(1).max(60),
    erteiltAm: z.string().datetime(),
    werbung: z.boolean(),
  }),
  herkunft: z.object({
    quelleText: pflichtLeerbar(z.string().max(80)),
    kampagne: pflichtLeerbar(z.string().max(120)),
    gclid: pflichtLeerbar(z.string().max(200)),
    gbraid: pflichtLeerbar(z.string().max(200)),
    wbraid: pflichtLeerbar(z.string().max(200)),
    einstiegspfad: pflichtLeerbar(z.string().max(200)),
  }),
});

export type Uebergabe = z.infer<typeof uebergabeSchema>;
