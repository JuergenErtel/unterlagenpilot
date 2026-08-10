import { prisma } from "@/lib/db";
import { VORGABE_ANNAHMEN, type Annahmen } from "./types";

/**
 * Marktannahmen der Organisation ueber die Vorgaben legen.
 *
 * Hinterlegbar sind nur die Zinswerte – sie sind Marktkenntnis und aendern sich
 * laufend. Alles andere (Notarquote, Eigenleistungsdeckel, Puffer) sind
 * fachliche Konstanten, die im Code stehen und dort versioniert werden.
 *
 * Ein Datenbankfehler darf die Machbarkeitsrechnung nicht kippen: dann gelten
 * die Vorgaben, und das Ergebnis weist sie ohnehin als Annahme aus.
 */
export async function ladeAnnahmen(organizationId: string): Promise<Annahmen> {
  try {
    const row = await prisma.machbarkeitsAnnahmen.findUnique({ where: { organizationId } });
    if (!row) return VORGABE_ANNAHMEN;
    return {
      ...VORGABE_ANNAHMEN,
      basiszinsProzent: row.basiszinsProzent,
      aufschlagBis80: row.aufschlagBis80,
      aufschlagBis90: row.aufschlagBis90,
      aufschlagBis100: row.aufschlagBis100,
      aufschlagBis110: row.aufschlagBis110,
    };
  } catch (e) {
    console.error("[machbarkeit] Annahmen konnten nicht geladen werden:", e);
    return VORGABE_ANNAHMEN;
  }
}
