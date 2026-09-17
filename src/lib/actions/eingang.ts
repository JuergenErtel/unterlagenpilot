"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { requireAkteAccess } from "@/lib/auth/akte-zugriff";
import { ordneEingangZu, verwirfEingang, type ZuordnungErgebnis } from "@/lib/eingang/service";
import { erstelleStapel } from "@/lib/sortierer/service";

/**
 * Zuordnen und Verwerfen im Posteingang.
 *
 * Der Zugriff auf den ZIELFALL geht ueber den zentralen Guard - nicht ueber
 * die Fallliste, die der Bildschirm anbietet. Eine mitgeschickte Fall-Id ist
 * eine Behauptung des Browsers, keine Erlaubnis.
 */

export async function ordneEingangZuAction(
  eingangId: string,
  caseId: string
): Promise<ZuordnungErgebnis> {
  if (!eingangId || !caseId) return { ok: false, grund: "Bitte einen Fall auswählen." };
  const { ctx, akte } = await requireAkteAccess(caseId, { schreibend: true });

  const ergebnis = await ordneEingangZu({
    eingangId,
    caseId,
    caseOrganizationId: akte.organizationId,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });

  if (ergebnis.ok) {
    revalidatePath("/eingang");
    // Die Akte zeigt das neue Dokument sofort, ohne dass jemand neu laedt.
    // Ein Sortierstapel hat eine andere Adresse als ein Fall - ohne diese
    // Unterscheidung stuende die Datei beim Sortierer-Nutzer erst nach einem
    // Neuladen da, und er haelt die Zuordnung fuer fehlgeschlagen.
    if (akte.akteArt === "sortierung") revalidatePath(`/sortierer/${caseId}`);
    else revalidatePath(`/cases/${caseId}`, "layout");
  }
  return ergebnis;
}

/**
 * Legt einen frischen Sortierstapel an und legt die wartende Datei hinein.
 *
 * Der Weg, ohne den der Sortierer als eigenstaendiges Produkt nicht
 * funktioniert: Wer BaufiDesk nur zum Sortieren nutzt, hat keinen Fall - und
 * saehe im Posteingang bis hierher nur eine leere Auswahlliste. Fuer ihn ist
 * "in einen neuen Stapel" nicht eine Zusatzoption, sondern DIE Antwort.
 */
export async function ordneEingangInNeuenStapelAction(
  eingangId: string
): Promise<ZuordnungErgebnis & { stapelId?: string }> {
  if (!eingangId) return { ok: false, grund: "Es ist keine Datei ausgewählt." };
  const ctx = await requireContext();
  const stapel = await erstelleStapel({ organizationId: ctx.organizationId, userId: ctx.userId });

  const ergebnis = await ordneEingangZuAction(eingangId, stapel.id);
  if (!ergebnis.ok) return ergebnis;
  return { ...ergebnis, stapelId: stapel.id };
}

export async function verwirfEingangAction(eingangId: string): Promise<ZuordnungErgebnis> {
  const ctx = await requireContext();
  const ergebnis = await verwirfEingang({
    eingangId,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });
  if (ergebnis.ok) revalidatePath("/eingang");
  return ergebnis;
}
