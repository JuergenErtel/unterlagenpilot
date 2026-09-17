"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth/context";
import { requireAkteAccess } from "@/lib/auth/akte-zugriff";
import { nurSortierung } from "@/lib/cases/aktenart";
import { getStorage } from "@/lib/storage";
import { erstelleStapel } from "@/lib/sortierer/service";

/**
 * Server Actions des Unterlagensortierers.
 *
 * Kein eigener Rollenbegriff: Der Sortierer steht jedem Nutzer offen. Der
 * Zugriff auf einen einzelnen Stapel laeuft ueber `requireAkteAccess` - den
 * zentralen Guard, den auch jede Fallakte benutzt. Bewusst KEINE eigene
 * Pruefung "gehoert zur Organisation": Ein Sortierstapel IST eine Akte, also
 * gehoert er hinter dieselbe Tuer wie jede andere. Ein Vertragstest
 * (tests/dokument-zugriff-vertrag.test.ts) haelt fest, dass der Guard hier
 * textlich VOR dem ersten Datenbankzugriff steht.
 *
 * Was der Guard nicht weiss: ob die Akte ein Stapel ist. Die Aktenart wird
 * deshalb direkt danach geprueft - sonst liesse sich ueber diese Actions ein
 * gewoehnlicher Fall loeschen oder freigeben.
 */

/** Guard + Aktenart in einem: nur ein Sortierstapel kommt hier durch. */
async function stapelGuard(
  stapelId: string
): Promise<{ id: string; organizationId: string; caseNumber: string } | null> {
  const { akte } = await requireAkteAccess(stapelId, { schreibend: true });
  if (akte.akteArt !== "sortierung") return null;
  return { id: akte.id, organizationId: akte.organizationId, caseNumber: akte.caseNumber };
}

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
  const erlaubt = await stapelGuard(id);
  if (!erlaubt) return { ok: false };
  const ctx = await requireContext();

  const stapel = await prisma.case.findFirst({
    where: { id: erlaubt.id, ...nurSortierung },
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

/**
 * Bestaetigt eine lose Seite als eigenstaendiges Dokument.
 *
 * Damit ist sie ENTSCHIEDEN und wird nicht erneut gefragt - auch dann nicht,
 * wenn weiterhin kein Typ erkannt wurde. Eine Frage, die trotz Antwort
 * wiederkommt, ist das Ende des Vertrauens in das Werkzeug.
 *
 * `reviewStatus: "akzeptiert"` ist dabei nicht nur eine Markierung, sondern
 * hat eine zweite, erwuenschte Wirkung: `istBuendelKandidat` verlangt
 * `reviewStatus === "offen"`, die Seite wird also auch von keinem kuenftigen
 * Buendelvorschlag mehr eingesammelt.
 */
export async function seiteErledigtAction(
  stapelId: string,
  documentId: string
): Promise<{ ok: boolean }> {
  const erlaubt = await stapelGuard(stapelId);
  if (!erlaubt) return { ok: false };

  // Die Seite muss in DIESEM Stapel liegen - die documentId kommt aus dem
  // Browser und ist damit Eingabe.
  const treffer = await prisma.document.updateMany({
    where: { id: documentId, caseId: erlaubt.id },
    data: { reviewStatus: "akzeptiert" },
  });
  if (treffer.count === 0) return { ok: false };

  revalidatePath(`/sortierer/${stapelId}`);
  return { ok: true };
}

/** Haelt fest, dass der Stapel ausgeliefert wurde (Download oder Zuordnung). */
export async function protokolliereAuslieferung(
  stapelId: string,
  weg: "download" | "fall"
): Promise<void> {
  // Der Guard liefert Nummer und Organisation bereits mit - eine eigene
  // Abfrage waere hier nicht nur ueberfluessig, sondern ein zweiter Weg zu
  // derselben Akte an der zentralen Pruefung vorbei.
  const erlaubt = await stapelGuard(stapelId);
  if (!erlaubt) return;
  const ctx = await requireContext();
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "sortierer.ausgeliefert",
    entityType: "case",
    entityId: erlaubt.id,
    metadata: { nummer: erlaubt.caseNumber, weg },
  });
}
