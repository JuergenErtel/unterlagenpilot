"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { processUpload, processStoredUpload } from "@/lib/documents/pipeline";
import { getStorage, isStorageKeyForCase } from "@/lib/storage";
import { createSecureUploadLink } from "@/lib/security/upload-link";
import { requirePortal, requirePortalAuftrag } from "@/lib/backoffice/zugriff";
import { beantworteRueckfrage, erzeugeAuftrag, fordereNachbearbeitungAn, nimmAb } from "@/lib/backoffice/service";
import type { UploadSlot, UploadState, StoredUploadMeta } from "@/lib/actions/upload";
import {
  BACKOFFICE_TERMINAL_STATUS,
  EMPLOYMENT_TYPES,
  FINANCING_TYPES,
  type BackofficeStatus,
  type EmploymentType,
  type FinancingType,
} from "@/lib/domain/enums";
import type { AktionsErgebnis } from "./backoffice";

/**
 * Server Actions des Auftraggeberportals. Jede beginnt mit requirePortal
 * bzw. requirePortalAuftrag - der Nutzer gehoert einer Organisation, die als
 * Auftraggeber verknuepft ist, und sieht nur die Auftraege dieses
 * Auftraggebers. Die Akte gehoert dem Backoffice; das Portal schreibt in
 * sie ausschliesslich ueber die Upload-Pipeline.
 */

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optional(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  return v ? v : null;
}
function enumWert<T extends string>(werte: readonly T[], v: string | null): T | null {
  return v && (werte as readonly string[]).includes(v) ? (v as T) : null;
}

function revalidiere(auftragId: string) {
  revalidatePath("/portal");
  revalidatePath("/portal/auftraege");
  revalidatePath(`/portal/auftraege/${auftragId}`);
  revalidatePath("/backoffice");
  revalidatePath("/backoffice/queue");
  revalidatePath(`/backoffice/auftraege/${auftragId}`);
}

export async function portalAuftragAnlegenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requirePortal();
  const auftraggeberId = text(fd, "auftraggeberId");
  const ag = ctx.auftraggeber.find((a) => a.id === auftraggeberId);
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  const auftragsart = text(fd, "auftragsart");
  if (!auftragsart) return { error: "Bitte eine Auftragsart wählen." };
  const nachname = text(fd, "nachname");
  if (!nachname && !text(fd, "aktenbezeichnung")) return { error: "Bitte den Antragsteller oder eine Aktenbezeichnung angeben." };

  // Kontakt: der eigene, falls vorhanden - dann sieht auch ein Mitarbeiter
  // ohne "alle sehen" seinen Auftrag wieder.
  const eigenerKontakt = ag.kontakte.find((k) => k.aktiv && k.userId === ctx.userId) ?? null;

  const ergebnis = await erzeugeAuftrag({
    backofficeOrganizationId: ag.backofficeOrganizationId,
    auftraggeberId: ag.id,
    kontaktId: eigenerKontakt?.id ?? null,
    antragsteller: {
      vorname: optional(fd, "vorname"),
      nachname: nachname || null,
      email: optional(fd, "email"),
      phone: optional(fd, "phone"),
    },
    aktenbezeichnung: optional(fd, "aktenbezeichnung"),
    auftragsart,
    leistungen: fd.getAll("leistungen").map(String),
    referenzExtern: optional(fd, "referenzExtern"),
    hinweiseAuftraggeber: optional(fd, "hinweise"),
    financingType: enumWert(FINANCING_TYPES as readonly FinancingType[], optional(fd, "financingType")),
    employmentType: enumWert(EMPLOYMENT_TYPES as readonly EmploymentType[], optional(fd, "employmentType")),
    quelle: "portal",
    erstelltVonId: ctx.userId,
  });
  if (!ergebnis.ok) return { error: ergebnis.grund };
  revalidiere(ergebnis.wert.id);
  redirect(`/portal/auftraege/${ergebnis.wert.id}`);
}

export async function portalHinweiseAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { auftrag } = await requirePortalAuftrag(auftragId);
  if (BACKOFFICE_TERMINAL_STATUS.has(auftrag.status as BackofficeStatus)) return { error: "Der Auftrag ist abgeschlossen." };
  await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { hinweiseAuftraggeber: optional(fd, "hinweise") } });
  revalidiere(auftragId);
  return { ok: true };
}

export async function portalRueckfrageBeantwortenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx } = await requirePortalAuftrag(auftragId);
  const rueckfrageId = text(fd, "rueckfrageId");
  const r = await prisma.backofficeRueckfrage.findFirst({ where: { id: rueckfrageId, auftragId }, select: { id: true } });
  if (!r) return { error: "Rückfrage nicht gefunden." };
  const e = await beantworteRueckfrage(r.id, text(fd, "antwort"), ctx);
  revalidiere(auftragId);
  return e.ok ? { ok: true } : { error: e.grund };
}

export async function portalAbnehmenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx } = await requirePortalAuftrag(auftragId);
  const e = await nimmAb(auftragId, optional(fd, "kommentar"), ctx);
  revalidiere(auftragId);
  return e.ok ? { ok: true } : { error: e.grund };
}

export async function portalNachbearbeitungAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx } = await requirePortalAuftrag(auftragId);
  const e = await fordereNachbearbeitungAn(auftragId, text(fd, "grund"), ctx);
  revalidiere(auftragId);
  return e.ok ? { ok: true } : { error: e.grund };
}

export async function portalFeedbackAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { auftrag } = await requirePortalAuftrag(auftragId);
  if (!auftrag.uebergebenAm) return { error: "Feedback ist nach der Übergabe möglich." };
  const bewertung = parseInt(text(fd, "bewertung"), 10);
  if (!Number.isFinite(bewertung) || bewertung < 1 || bewertung > 5) return { error: "Bewertung zwischen 1 und 5." };
  await prisma.backofficeAuftrag.update({
    where: { id: auftragId },
    data: { feedbackBewertung: bewertung, feedbackText: optional(fd, "text") },
  });
  revalidiere(auftragId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Upload durch den Auftraggeber - dieselbe Pipeline wie der Vermittler-Upload
// ---------------------------------------------------------------------------

export async function portalUploadOne(auftragId: string, formData: FormData): Promise<UploadState> {
  const { ctx, auftrag } = await requirePortalAuftrag(auftragId);
  if (BACKOFFICE_TERMINAL_STATUS.has(auftrag.status as BackofficeStatus)) {
    return { uploaded: 0, rejected: [], error: "Der Auftrag ist abgeschlossen." };
  }
  const env = getEnv();
  const limit = await checkRateLimit(`portal-upload:${auftragId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { uploaded: 0, rejected: [], error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) return { uploaded: 0, rejected: [], error: "Keine Datei empfangen." };

  const { applicantId, applicantName } = await antragstellerAus(auftrag.caseId, String(formData.get("applicantPosition") ?? "none"));
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processUpload({
    organizationId: auftrag.backofficeOrganizationId,
    caseId: auftrag.caseId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadSource: "vermittler",
    applicantName,
    applicantId,
    actorUserId: ctx.userId,
  });
  if (result.ok) {
    await audit({
      organizationId: auftrag.backofficeOrganizationId,
      userId: ctx.userId,
      action: "backoffice.dokument_hochgeladen",
      entityType: "document",
      entityId: result.documentId ?? null,
      metadata: { auftragId, quelle: "portal" },
    });
    return { uploaded: 1, rejected: [] };
  }
  return { uploaded: 0, rejected: [{ name: file.name, reason: result.reason ?? "Datei konnte nicht verarbeitet werden." }] };
}

export async function portalFinishUpload(auftragId: string): Promise<void> {
  await requirePortalAuftrag(auftragId);
  revalidiere(auftragId);
}

export async function portalRequestUploadSlot(auftragId: string, originalName: string, _mimeType: string): Promise<UploadSlot> {
  const { ctx, auftrag } = await requirePortalAuftrag(auftragId);
  if (BACKOFFICE_TERMINAL_STATUS.has(auftrag.status as BackofficeStatus)) return { error: "Der Auftrag ist abgeschlossen." };
  const env = getEnv();
  const limit = await checkRateLimit(`portal-upload:${auftragId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  const target = await getStorage().createSignedUploadUrl({
    organizationId: auftrag.backofficeOrganizationId,
    caseId: auftrag.caseId,
    originalName,
  });
  if (!target) return { error: "Direkt-Upload nicht verfügbar." };
  return target;
}

export async function portalProcessStoredUpload(auftragId: string, applicantPosition: string, meta: StoredUploadMeta): Promise<UploadState> {
  const { ctx, auftrag } = await requirePortalAuftrag(auftragId);
  if (!isStorageKeyForCase(meta.storageKey, auftrag.backofficeOrganizationId, auftrag.caseId)) {
    return { uploaded: 0, rejected: [{ name: meta.originalName, reason: "Ungültiger Upload-Pfad." }] };
  }
  const { applicantId, applicantName } = await antragstellerAus(auftrag.caseId, applicantPosition);
  const result = await processStoredUpload({
    organizationId: auftrag.backofficeOrganizationId,
    caseId: auftrag.caseId,
    storageKey: meta.storageKey,
    originalName: meta.originalName,
    mimeType: meta.mimeType,
    uploadSource: "vermittler",
    applicantName,
    applicantId,
    actorUserId: ctx.userId,
  });
  if (result.ok) {
    await audit({
      organizationId: auftrag.backofficeOrganizationId,
      userId: ctx.userId,
      action: "backoffice.dokument_hochgeladen",
      entityType: "document",
      entityId: result.documentId ?? null,
      metadata: { auftragId, quelle: "portal" },
    });
    return { uploaded: 1, rejected: [] };
  }
  return { uploaded: 0, rejected: [{ name: meta.originalName, reason: result.reason ?? "Datei konnte nicht verarbeitet werden." }] };
}

async function antragstellerAus(caseId: string, position: string) {
  let applicantId: string | null = null;
  let applicantName: string | null = null;
  if (position === "1" || position === "2") {
    const a = await prisma.applicant.findFirst({
      where: { caseId, position: Number(position) },
      select: { id: true, vorname: true, nachname: true },
    });
    if (a) {
      applicantId = a.id;
      applicantName = [a.vorname, a.nachname].filter(Boolean).join(" ") || null;
    }
  }
  return { applicantId, applicantName };
}

/** Upload-Link fuer den Antragsteller - vom Auftraggeber erzeugt, nur einmal sichtbar. */
export async function portalUploadLinkAction(_prev: { url?: string; error?: string }, fd: FormData): Promise<{ url?: string; error?: string }> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requirePortalAuftrag(auftragId);
  if (BACKOFFICE_TERMINAL_STATUS.has(auftrag.status as BackofficeStatus)) return { error: "Der Auftrag ist abgeschlossen." };
  const tage = Math.min(60, Math.max(1, parseInt(text(fd, "tage") || "14", 10) || 14));
  const created = await createSecureUploadLink(auftrag.caseId, new Date(Date.now() + tage * 86_400_000), {
    organizationId: auftrag.backofficeOrganizationId,
    actorUserId: ctx.userId,
  });
  revalidiere(auftragId);
  return { url: created.url };
}

// ---------------------------------------------------------------------------
// Organisation und Mitarbeiter des Auftraggebers
// ---------------------------------------------------------------------------

/** Auftraggeber-Admin bindet einen Nutzer der eigenen Organisation als Kontakt. */
export async function portalKontaktAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requirePortal();
  if (!ctx.istAdmin) return { error: "Nur Administratoren verwalten Mitarbeiter." };
  const auftraggeberId = text(fd, "auftraggeberId");
  const ag = ctx.auftraggeber.find((a) => a.id === auftraggeberId);
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  const userId = text(fd, "userId");
  const u = await prisma.user.findFirst({
    where: { id: userId, organizationId: ctx.organizationId, active: true },
    select: { id: true, name: true, email: true },
  });
  if (!u) return { error: "Nutzer nicht in der eigenen Organisation." };
  const vorhanden = ag.kontakte.find((k) => k.userId === u.id);
  if (vorhanden) {
    await prisma.backofficeAuftraggeberKontakt.update({
      where: { id: vorhanden.id },
      data: { aktiv: true, darfAlleAuftraegeSehen: fd.get("darfAlleAuftraegeSehen") === "on" },
    });
  } else {
    await prisma.backofficeAuftraggeberKontakt.create({
      data: {
        auftraggeberId: ag.id,
        name: u.name,
        email: u.email,
        userId: u.id,
        darfAlleAuftraegeSehen: fd.get("darfAlleAuftraegeSehen") === "on",
      },
    });
  }
  revalidatePath("/portal/organisation");
  return { ok: true };
}

export async function portalKontaktEntfernenAction(auftraggeberId: string, kontaktId: string): Promise<AktionsErgebnis> {
  const ctx = await requirePortal();
  if (!ctx.istAdmin) return { error: "Nur Administratoren verwalten Mitarbeiter." };
  const ag = ctx.auftraggeber.find((a) => a.id === auftraggeberId);
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  const { count } = await prisma.backofficeAuftraggeberKontakt.updateMany({
    where: { id: kontaktId, auftraggeberId: ag.id },
    data: { aktiv: false },
  });
  revalidatePath("/portal/organisation");
  return count === 1 ? { ok: true } : { error: "Kontakt nicht gefunden." };
}
