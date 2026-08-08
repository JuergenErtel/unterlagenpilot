import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/session";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { erstelleToken, verbraucheToken, entwerteOffeneToken, TOKEN_GUELTIGKEIT } from "@/lib/auth/tokens";

/**
 * Passwort zuruecksetzen.
 *
 * `fordereResetAn` gibt null zurueck, wenn keine Mail noetig ist (unbekannte
 * oder gesperrte Adresse). Der Aufrufer MUSS trotzdem immer dieselbe Antwort
 * anzeigen – sonst wird das Formular zum Kontopruefer.
 */
export async function fordereResetAn(email: string): Promise<{ token: string } | null> {
  const normalisiert = email.trim().toLowerCase();
  const nutzer = await prisma.user.findUnique({ where: { email: normalisiert } });
  if (!nutzer || !nutzer.active) return null;

  // Aeltere offene Reset-Links entwerten: es soll immer nur einer gelten.
  await entwerteOffeneToken("passwort_reset", { userId: nutzer.id });

  const { token } = await erstelleToken({
    zweck: "passwort_reset",
    userId: nutzer.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.passwort_reset,
  });
  return { token };
}

export type ResetErgebnis =
  | { ok: true; userId: string }
  | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string };

export async function setzeNeuesPasswort(token: string, passwort: string): Promise<ResetErgebnis> {
  // Passwortregeln VOR dem Einloesen pruefen waere angenehmer, verbraucht aber
  // sonst das Token bei jedem Tippfehler. Deshalb: erst pruefen, dann einloesen.
  const regel = pruefePasswort(passwort);
  if (!regel.ok) return { ok: false, grund: "passwort_schwach", text: regel.grund };

  const treffer = await verbraucheToken(token, "passwort_reset");
  if (!treffer?.userId) return { ok: false, grund: "ungueltig" };

  const nutzer = await prisma.user.findUnique({ where: { id: treffer.userId } });
  if (!nutzer || !nutzer.active) return { ok: false, grund: "ungueltig" };

  await prisma.user.update({
    where: { id: nutzer.id },
    data: { passwordHash: hashPassword(passwort) },
  });
  return { ok: true, userId: nutzer.id };
}
