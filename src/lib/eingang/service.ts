import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { EINGANG_SEGMENT, isStorageKeyForEingang } from "@/lib/storage";
import { validateUpload } from "@/lib/security/file-validation";
import { normalizeUploadFile } from "@/lib/documents/heic";
import { getVirusScanner } from "@/lib/security/virus-scan";
import { processUpload, type ProcessUploadFile } from "@/lib/documents/pipeline";

/**
 * Der Posteingang: Dateien, die angekommen sind, bevor feststeht, zu welchem
 * Fall sie gehoeren.
 *
 * Er existiert, weil das Zuordnen am Handy der teure Teil war. Der Kurzbefehl
 * schickt nur die Datei; die Frage "zu welchem Fall?" beantwortet der Vermittler
 * am Bildschirm, wo er die Akte ohnehin vor sich hat.
 *
 * Der Posteingang ist bewusst eine Durchgangsstation und kein zweites Archiv:
 * Beim Zuordnen laeuft die Datei durch die normale Upload-Pipeline in den Fall
 * (Virenscan, HEIC-Wandlung, Einstufung, Antragstellerzuordnung), und die
 * Zwischenablage verschwindet.
 */

export interface AnnahmeErgebnis {
  ok: boolean;
  id?: string;
  name: string;
  /** Datenarme, verstaendliche Meldung bei Ablehnung. */
  grund?: string;
}

/**
 * Nimmt eine Datei in den Posteingang.
 *
 * Geprueft wird HIER, nicht erst beim Zuordnen: Eine Datei, die kein Dokument
 * werden kann, soll gar nicht erst im Posteingang stehen und dort Arbeit
 * vortaeuschen. Auch der Virenscan laeuft sofort - anders als beim Upload in
 * eine Akte gibt es hier keine Quarantaenezeile, die einen Fund festhalten
 * koennte, also wird ein Fund abgewiesen und nichts gespeichert.
 */
export async function nimmDateiAn(input: {
  organizationId: string;
  userId: string | null;
  file: ProcessUploadFile;
  quelle?: string;
}): Promise<AnnahmeErgebnis> {
  const { organizationId } = input;

  // HEIC/HEIF (iPhone-Standard) sofort nach JPEG wandeln - genau wie die
  // Pipeline es tut. Sonst laege im Posteingang etwas, das der Browser des
  // Vermittlers nicht anzeigen kann.
  const { file } = await normalizeUploadFile(input.file);

  const pruefung = validateUpload({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    buffer: file.buffer,
  });
  if (!pruefung.ok) {
    await audit({
      organizationId,
      userId: input.userId,
      action: "document.rejected",
      entityType: "organization",
      entityId: organizationId,
      metadata: { stage: "eingang-validierung", reason: pruefung.error },
    });
    return { ok: false, name: file.name, grund: pruefung.error };
  }

  const scan = await getVirusScanner().scan({
    buffer: file.buffer,
    filename: file.name,
    mimeType: pruefung.mimeType!,
  });
  if (scan.verdict !== "clean") {
    await audit({
      organizationId,
      userId: input.userId,
      action: "document.quarantined",
      entityType: "organization",
      entityId: organizationId,
      metadata: { stage: "eingang-scan", verdict: scan.verdict },
    });
    return {
      ok: false,
      name: file.name,
      grund:
        scan.verdict === "infected"
          ? "Die Datei wurde als schädlich eingestuft und nicht angenommen."
          : "Die Datei konnte nicht geprüft werden. Bitte später erneut versuchen.",
    };
  }

  const stored = await getStorage().put({
    organizationId,
    // Steht an der Stelle der Fall-Id: Es gibt noch keinen Fall (siehe
    // EINGANG_SEGMENT in storage.ts).
    caseId: EINGANG_SEGMENT,
    originalName: file.name,
    mimeType: pruefung.mimeType!,
    buffer: file.buffer,
  });

  const zeile = await prisma.eingangsdatei.create({
    data: {
      organizationId,
      userId: input.userId,
      storageKey: stored.storageKey,
      originalName: file.name,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      quelle: input.quelle ?? "kurzbefehl",
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    userId: input.userId,
    action: "eingang.angenommen",
    entityType: "organization",
    entityId: organizationId,
    metadata: { eingangId: zeile.id, quelle: input.quelle ?? "kurzbefehl" },
  });

  return { ok: true, id: zeile.id, name: file.name };
}

export interface EingangZeile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  quelle: string;
  createdAt: Date;
  /** Name des Absenders, sofern das Konto noch existiert. */
  von: string | null;
}

export async function listeEingang(organizationId: string): Promise<EingangZeile[]> {
  const zeilen = await prisma.eingangsdatei.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      quelle: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return zeilen.map((z) => ({
    id: z.id,
    originalName: z.originalName,
    mimeType: z.mimeType,
    sizeBytes: z.sizeBytes,
    quelle: z.quelle,
    createdAt: z.createdAt,
    von: z.user?.name ?? null,
  }));
}

export async function zaehleEingang(organizationId: string): Promise<number> {
  return prisma.eingangsdatei.count({ where: { organizationId } });
}

/** Holt die Zeile NUR, wenn sie zur Organisation gehoert und der Pfad stimmt. */
async function ladeZeile(eingangId: string, organizationId: string) {
  const zeile = await prisma.eingangsdatei.findFirst({
    where: { id: eingangId, organizationId },
    select: { id: true, storageKey: true, originalName: true, mimeType: true, organizationId: true },
  });
  if (!zeile) return null;
  // Zweiter Riegel gegen einen manipulierten Pfad in der Zeile: Was wir
  // gleich lesen und loeschen, muss im Posteingang GENAU dieser Organisation
  // liegen - nie in einer Akte und nie bei jemand anderem.
  if (!isStorageKeyForEingang(zeile.storageKey, organizationId)) return null;
  return zeile;
}

export interface ZuordnungErgebnis {
  ok: boolean;
  grund?: string;
}

/**
 * Ordnet eine wartende Datei einem Fall zu.
 *
 * Der Aufrufer hat den Zugriff auf DIESEN Fall bereits geprueft (die Action
 * ruft requireAkteAccess schreibend) - hier geht es nur noch darum, die Bytes
 * in die normale Pipeline zu geben und die Zwischenablage aufzuraeumen.
 */
export async function ordneEingangZu(input: {
  eingangId: string;
  caseId: string;
  /** Organisation DER AKTE - dorthin wird gespeichert. */
  caseOrganizationId: string;
  /** Organisation des Handelnden - dort liegt die wartende Datei. */
  organizationId: string;
  actorUserId: string;
}): Promise<ZuordnungErgebnis> {
  const zeile = await ladeZeile(input.eingangId, input.organizationId);
  if (!zeile) return { ok: false, grund: "Die Datei ist nicht mehr da." };

  const storage = getStorage();
  const buffer = await storage.get(zeile.storageKey);
  if (!buffer) {
    // Zeile ohne Datei ist eine Karteileiche - sie soll nicht ewig Arbeit
    // vortaeuschen.
    await prisma.eingangsdatei.delete({ where: { id: zeile.id } }).catch(() => undefined);
    return { ok: false, grund: "Die Datei war nicht mehr auffindbar und wurde aus dem Posteingang entfernt." };
  }

  const ergebnis = await processUpload({
    organizationId: input.caseOrganizationId,
    caseId: input.caseId,
    file: { name: zeile.originalName, type: zeile.mimeType, size: buffer.byteLength, buffer },
    uploadSource: "vermittler",
    // Keine Zuordnung mitgeben - die Namenserkennung entscheidet, wie beim
    // Upload im Browser ohne gewaehlten Antragsteller.
    applicantName: null,
    applicantId: null,
    actorUserId: input.actorUserId,
  });

  if (!ergebnis.ok) {
    // Nicht loeschen: Die Datei bleibt im Posteingang, damit der Fehler
    // sichtbar bleibt und ein zweiter Versuch moeglich ist.
    return { ok: false, grund: ergebnis.reason ?? "Die Datei konnte nicht verarbeitet werden." };
  }

  // Erst die Zeile, dann das Objekt: Bleibt das Loeschen im Speicher stecken,
  // ist die Datei trotzdem aus dem Posteingang verschwunden - eine verwaiste
  // Datei kostet Platz, eine doppelt angezeigte kostet Vertrauen.
  await prisma.eingangsdatei.delete({ where: { id: zeile.id } });
  await storage.remove(zeile.storageKey).catch(() => undefined);

  await audit({
    organizationId: input.caseOrganizationId,
    userId: input.actorUserId,
    action: "eingang.zugeordnet",
    entityType: "case",
    entityId: input.caseId,
    metadata: { eingangId: input.eingangId, documentId: ergebnis.documentId ?? null },
  });
  return { ok: true };
}

/** Wirft eine wartende Datei weg (Werbung, Doppeltes, versehentlich geteilt). */
export async function verwirfEingang(input: {
  eingangId: string;
  organizationId: string;
  actorUserId: string;
}): Promise<ZuordnungErgebnis> {
  const zeile = await ladeZeile(input.eingangId, input.organizationId);
  if (!zeile) return { ok: false, grund: "Die Datei ist nicht mehr da." };

  await prisma.eingangsdatei.delete({ where: { id: zeile.id } });
  await getStorage().remove(zeile.storageKey).catch(() => undefined);

  await audit({
    organizationId: input.organizationId,
    userId: input.actorUserId,
    action: "eingang.verworfen",
    entityType: "organization",
    entityId: input.organizationId,
    metadata: { eingangId: input.eingangId },
  });
  return { ok: true };
}
