"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { formularZuSlug, type AnfrageStart } from "@/lib/leadformular/service";
// Eigener Importpfad (nicht über service.ts): Der Test mockt
// "@/lib/leadformular/service" komplett und stellt nur formularZuSlug
// bereit; ERSTER_SCHRITT wäre dort ein am Mock scheiternder Zugriff.
import { ERSTER_SCHRITT } from "@/lib/leadformular/erster-schritt";
import { createAnfrageLink } from "@/lib/security/self-disclosure-link";
import { schrittFinden, naechsterSchritt } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import type { Antworten } from "@/lib/self-disclosure/types";

/** Gültigkeit eines Formular-Links: lang genug, um in Ruhe auszufüllen. */
const GUELTIG_TAGE = 30;
/** Neue Bögen je IP und Stunde. */
const MAX_JE_STUNDE = 5;

async function clientIp(): Promise<string> {
  const h = await headers();
  // x-real-ip wird von Vercel gesetzt (nicht client-spoofbar); x-forwarded-for als Fallback.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Der erste abgesendete Schritt eines öffentlichen Anfrageformulars.
 *
 * Hier – und nur hier – entsteht der persönliche Link eines Besuchers. Ein
 * bloßer Seitenaufruf legt nichts an: Sonst hinterließe jeder Scanner, der
 * die Domain abklopft, eine Zeile. Ein Fall entsteht auch hier noch nicht;
 * der kommt erst beim Absenden des ganzen Bogens.
 */
export async function starteAnfrage(
  slug: string,
  formData: FormData
): Promise<AnfrageStart | undefined> {
  // Honigtöpfchen: ein für Menschen unsichtbares Feld. Ist es gefüllt, war es
  // kein Mensch. Freundlich bestätigen und nichts tun – eine Fehlermeldung
  // verriete die Erkennung.
  if (String(formData.get("firmenzusatz") ?? "").trim() !== "") return { danke: true };

  // Zaehler VOR der Datenbankabfrage: Sonst kostet jede abgewiesene Anfrage
  // trotzdem eine Datenbank-Runde – genau die Last, vor der die Grenze
  // schuetzen soll.
  const grenze = await checkRateLimit(`anfrage:${slug}:${await clientIp()}`, MAX_JE_STUNDE, 3600);
  if (!grenze.ok) {
    return { error: "Zu viele Anfragen. Bitte versuchen Sie es später noch einmal." };
  }

  const formular = await formularZuSlug(slug);
  if (!formular) return { error: "Dieses Formular ist derzeit nicht verfügbar." };

  const schritt = schrittFinden(ERSTER_SCHRITT, {});
  if (!schritt) throw new Error(`Erster Schritt "${ERSTER_SCHRITT}" fehlt im Katalog.`);

  const geprueft = schrittSchema(schritt.schritt, schritt.personen).safeParse(
    Object.fromEntries(formData.entries())
  );
  if (!geprueft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of geprueft.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };
  }

  // Die Schlüssel aus `geprueft.data` sind schon die fertigen Antwortschlüssel
  // (siehe speichereAntwort) – nicht erneut zusammensetzen.
  const antworten: Antworten = {};
  for (const [k, value] of Object.entries(geprueft.data)) {
    if (value === null || value === undefined || value === "") continue;
    antworten[k] = value as Antworten[string];
  }

  const link = await createAnfrageLink(
    formular.id,
    new Date(Date.now() + GUELTIG_TAGE * 86_400_000),
    { organizationId: formular.organizationId }
  );

  const weiter = naechsterSchritt(schritt.id, antworten);
  const currentStep = weiter?.id ?? "zusammenfassung";
  await prisma.selfDisclosure.create({
    data: { linkId: link.linkId, answers: antworten as object, currentStep },
  });

  redirect(`/selbstauskunft/${link.token}/${currentStep}`);
}
