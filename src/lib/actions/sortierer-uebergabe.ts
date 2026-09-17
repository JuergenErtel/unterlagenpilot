"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth/context";
import { requireAkteAccess } from "@/lib/auth/akte-zugriff";
import { nurSortierung } from "@/lib/cases/aktenart";
import { getStorage } from "@/lib/storage";
import { processUpload } from "@/lib/documents/pipeline";

/**
 * Der zweite Rueckweg aus dem Sortierer: die fertigen Dokumente in einen Fall
 * uebernehmen.
 *
 * Bewusst in einer eigenen Datei und nicht in actions/sortierer.ts: Dies ist
 * die einzige Stelle, an der der Sortierer die Grenze zum CRM ueberschreitet.
 * Wer den Sortierer als eigenstaendiges Produkt liest, soll sofort sehen, wo
 * diese Bruecke steht.
 */

export interface UebergabeErgebnis {
  ok: boolean;
  uebernommen: number;
  grund?: string;
}

export async function uebergebeStapelAnFall(
  stapelId: string,
  zielFallId: string
): Promise<UebergabeErgebnis> {
  // BEIDE Akten durch den zentralen Guard, und zwar VOR dem ersten
  // Datenbankzugriff: der Stapel (lesen) und der Zielfall (schreiben). Ein
  // Vertragstest haelt diese Reihenfolge fest.
  const { akte: stapelAkte } = await requireAkteAccess(stapelId, { schreibend: true });
  if (stapelAkte.akteArt !== "sortierung") {
    return { ok: false, uebernommen: 0, grund: "Das ist kein Sortierstapel." };
  }
  const { akte } = await requireAkteAccess(zielFallId, { schreibend: true });
  // Ziel muss ein echter Fall sein. Ein Stapel in einen Stapel zu uebergeben
  // waere keine Uebernahme, sondern eine Verdopplung - und das faellt erst
  // auf, wenn beide nach vierzehn Tagen verschwinden.
  if (akte.akteArt === "sortierung") {
    return { ok: false, uebernommen: 0, grund: "Das Ziel muss ein Fall sein, kein Sortierstapel." };
  }
  const ctx = await requireContext();

  const stapel = await prisma.case.findFirst({
    where: { id: stapelAkte.id, ...nurSortierung },
    select: {
      id: true,
      caseNumber: true,
      documents: {
        // Nur das ERGEBNIS: Seiten, die in einem Buendel aufgegangen sind,
        // stecken bereits im zusammengefuegten PDF. Wuerden sie mitgehen,
        // laege jede Seite zweimal im Fall - einmal einzeln, einmal im PDF.
        where: { zusammengefuegtInId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, generatedName: true, mimeType: true, storageKey: true },
      },
    },
  });
  if (!stapel) return { ok: false, uebernommen: 0, grund: "Der Stapel ist nicht mehr da." };
  if (stapel.documents.length === 0) {
    return { ok: false, uebernommen: 0, grund: "In diesem Stapel liegt nichts." };
  }

  const speicher = getStorage();
  let uebernommen = 0;
  const gescheitert: string[] = [];

  for (const d of stapel.documents) {
    const name = d.generatedName ?? d.originalName;
    const bytes = await speicher.get(d.storageKey);
    if (!bytes) {
      gescheitert.push(name);
      continue;
    }
    // Durch die NORMALE Pipeline, nicht per Kopie der Zeile: Der Fall bekommt
    // damit Einstufung, Umbenennung, Antragstellerzuordnung und Virenscan
    // genau wie bei jedem Browser-Upload. Eine kopierte Zeile haette den
    // Fall-Kontext (Antragsteller, Anforderungen) nie gesehen.
    const ergebnis = await processUpload({
      organizationId: akte.organizationId,
      caseId: zielFallId,
      file: { name, type: d.mimeType, size: bytes.byteLength, buffer: bytes },
      uploadSource: "vermittler",
      // Keine Zuordnung mitgeben: Die Namenserkennung entscheidet. Ein
      // geratener Wert waere als "manuell" gestempelt und danach unantastbar.
      applicantName: null,
      applicantId: null,
      actorUserId: ctx.userId,
    });
    if (ergebnis.ok) uebernommen += 1;
    else gescheitert.push(name);
  }

  // Der Stapel bleibt bestehen - Juergens ausdrueckliche Vorgabe: Ein zweiter
  // Download muss moeglich sein, ohne alles neu zu sortieren. Er raeumt sich
  // nach vierzehn Tagen von selbst weg.
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "sortierer.ausgeliefert",
    entityType: "case",
    entityId: stapel.id,
    metadata: { nummer: stapel.caseNumber, weg: "fall", zielFallId, uebernommen },
  });

  revalidatePath(`/sortierer/${stapelId}`);
  revalidatePath(`/cases/${zielFallId}`);

  if (uebernommen === 0) {
    return { ok: false, uebernommen: 0, grund: "Keines der Dokumente konnte übernommen werden." };
  }
  return {
    ok: true,
    uebernommen,
    grund: gescheitert.length
      ? `Nicht übernommen: ${gescheitert.join(", ")}.`
      : undefined,
  };
}
