"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth/context";
import { nurSortierung } from "@/lib/cases/aktenart";
import { getStorage } from "@/lib/storage";
import { erstelleStapel } from "@/lib/sortierer/service";

/**
 * Server Actions des Unterlagensortierers.
 *
 * Kein eigener Rollenbegriff: Der Sortierer steht jedem Nutzer offen, und ein
 * Stapel enthaelt nur das, was dieser Nutzer selbst hineingeworfen hat. Was
 * darin passiert - Upload, Buendelung, Freigabe - laeuft ueber die bestehenden
 * Dokument-Actions und deren Zugriffspruefung (`requireAkteAccess`).
 */

/** Legt einen Stapel an und gibt seine Id zurueck - der Aufrufer navigiert dorthin. */
export async function erstelleStapelAction(): Promise<{ id: string }> {
  const ctx = await requireContext();
  const stapel = await erstelleStapel({ organizationId: ctx.organizationId, userId: ctx.userId });
  revalidatePath("/sortierer");
  return { id: stapel.id };
}

/**
 * Wirft einen Stapel samt Dateien weg.
 *
 * Die Bytes im Speicher gehen mit: Ein Stapel ohne Fall hat keinen Zweck, der
 * eine Aufbewahrung rechtfertigt - bleiben die Dateien liegen, sammelt sich
 * genau das an, was die Vierzehn-Tage-Regel verhindern soll.
 */
export async function loescheStapelAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();

  // Nur ein Stapel DIESER Organisation, und nur ein Stapel - die Id kommt aus
  // dem Browser. Ohne die Aktenart-Bedingung liesse sich hierueber ein
  // gewoehnlicher Fall loeschen.
  const stapel = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId, ...nurSortierung },
    select: { id: true, caseNumber: true, documents: { select: { storageKey: true } } },
  });
  if (!stapel) return { ok: false };

  const speicher = getStorage();
  for (const d of stapel.documents) {
    // Ein fehlgeschlagenes Loeschen im Speicher darf die Zeile nicht
    // stehenlassen: Eine Datei ohne Zeile ist Muell, eine Zeile ohne Datei
    // waere ein Stapel, der sich nicht mehr wegraeumen laesst.
    await speicher.remove(d.storageKey).catch(() => {});
  }
  await prisma.case.delete({ where: { id: stapel.id } });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "sortierer.stapel_geloescht",
    entityType: "case",
    entityId: stapel.id,
    metadata: { nummer: stapel.caseNumber, dateien: stapel.documents.length },
  });
  revalidatePath("/sortierer");
  return { ok: true };
}
