"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requireUploadTokenAccess, requireCaseAccess } from "@/lib/auth/context";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { processUpload } from "@/lib/documents/pipeline";
import { customerFormSchema } from "@/lib/domain/forms";
import { audit } from "@/lib/audit";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildUploadNotification } from "@/lib/email/notifications";

export interface UploadState {
  uploaded: number;
  rejected: { name: string; reason: string }[];
  error?: string;
}

/** Kompatible Aliase für Kunden- bzw. Vermittler-Flow. */
export type CustomerUploadState = UploadState;
export type BrokerUploadState = UploadState;

async function clientIp(): Promise<string> {
  const h = await headers();
  // x-real-ip wird von Vercel gesetzt (nicht client-spoofbar); x-forwarded-for als Fallback.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Kunden-Upload über sicheren Token-Link – EINE Datei pro Aufruf.
 *
 * Der Client lädt die Dateien einzeln nacheinander hoch (statt alle in einem
 * Request). So bleibt jeder Request klein genug für das Plattform-Body-Limit
 * (Vercel deckelt Function-Requests unter dem Framework-Limit) – große
 * Sammel-Uploads (z.B. 15 Fotos) schlagen sonst komplett fehl.
 * Die einmalige Broker-Benachrichtigung erfolgt separat über `finishCustomerUpload`.
 */
export async function customerUploadOne(token: string, formData: FormData): Promise<UploadState> {
  const access = await requireUploadTokenAccess(token);
  if (!access) return { uploaded: 0, rejected: [], error: "Upload-Link ungültig oder abgelaufen." };

  const env = getEnv();
  const limit = await checkRateLimit(`upload:${access.linkId}:${await clientIp()}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) {
    return { uploaded: 0, rejected: [], error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  }

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) {
    return { uploaded: 0, rejected: [], error: "Keine Datei empfangen." };
  }

  const caseRow = await prisma.case.findUnique({
    where: { id: access.caseId },
    include: { applicants: { orderBy: { position: "asc" }, take: 1 } },
  });
  const applicant = caseRow?.applicants[0];
  const applicantName = applicant ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processUpload({
    organizationId: access.organizationId,
    caseId: access.caseId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadSource: "kunde",
    applicantName,
    applicantId: applicant?.id ?? null,
  });

  if (result.ok) {
    await prisma.uploadLink.update({
      where: { id: access.linkId },
      data: { usedCount: { increment: 1 } },
    });
    return { uploaded: 1, rejected: [] };
  }
  return { uploaded: 0, rejected: [{ name: file.name, reason: result.reason ?? "Datei konnte nicht verarbeitet werden." }] };
}

/**
 * Schliesst einen Kunden-Sammel-Upload ab: EINE Broker-Benachrichtigung für alle
 * Dateien zusammen (statt pro Datei) und Revalidierung. `uploaded` = Anzahl der
 * erfolgreich übernommenen Dateien.
 */
export async function finishCustomerUpload(token: string, uploaded: number): Promise<void> {
  const access = await requireUploadTokenAccess(token);
  if (!access) return;

  await audit({
    organizationId: access.organizationId,
    action: "upload_link.accessed",
    entityType: "case",
    entityId: access.caseId,
    metadata: { linkId: access.linkId, files: uploaded, ip: await clientIp() },
  });

  if (uploaded > 0) {
    const caseRow = await prisma.case.findUnique({
      where: { id: access.caseId },
      include: {
        applicants: { orderBy: { position: "asc" }, take: 1 },
        broker: { select: { email: true, name: true } },
      },
    });
    const applicant = caseRow?.applicants[0];
    const applicantName = applicant ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") : null;
    await notifyBrokerOfUpload(caseRow, applicantName, uploaded);
  }

  revalidatePath(`/upload/${token}`);
  revalidatePath(`/cases/${access.caseId}`);
}

/**
 * Vermittler-Upload direkt in einen Fall (ohne Kunden-Link) – EINE Datei pro Aufruf.
 * Gleiche gesicherte Pipeline; Antragsteller-Zuordnung über applicantPosition
 * ("1" | "2" | "none"). Revalidierung erfolgt gesammelt über `finishBrokerUpload`.
 */
export async function brokerUploadOne(caseId: string, formData: FormData): Promise<UploadState> {
  const { ctx } = await requireCaseAccess(caseId);

  const env = getEnv();
  const limit = await checkRateLimit(
    `broker-upload:${caseId}:${ctx.userId}`,
    env.UPLOAD_RATE_MAX,
    env.UPLOAD_RATE_WINDOW_SEC
  );
  if (!limit.ok) {
    return { uploaded: 0, rejected: [], error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  }

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) {
    return { uploaded: 0, rejected: [], error: "Keine Datei empfangen." };
  }

  // Antragsteller-Zuordnung auflösen (Vorauswahl 1; "none" = keine Zuordnung).
  const position = String(formData.get("applicantPosition") ?? "1");
  let applicantId: string | null = null;
  let applicantName: string | null = null;
  if (position === "1" || position === "2") {
    const applicant = await prisma.applicant.findFirst({
      where: { caseId, position: Number(position) },
      select: { id: true, vorname: true, nachname: true },
    });
    if (applicant) {
      applicantId = applicant.id;
      applicantName = [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") || null;
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processUpload({
    organizationId: ctx.organizationId,
    caseId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadSource: "vermittler",
    applicantName,
    applicantId,
    actorUserId: ctx.userId,
  });
  if (result.ok) return { uploaded: 1, rejected: [] };
  return { uploaded: 0, rejected: [{ name: file.name, reason: result.reason ?? "Datei konnte nicht verarbeitet werden." }] };
}

/** Schliesst einen Vermittler-Sammel-Upload ab (einmalige Revalidierung). */
export async function finishBrokerUpload(caseId: string): Promise<void> {
  await requireCaseAccess(caseId);
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Benachrichtigt den zuständigen Vermittler per E-Mail über neu hochgeladene
 * Unterlagen. Best-effort: nur bei konfiguriertem Versand und vorhandener
 * Broker-Adresse; ein Fehler bricht den Upload NIE ab.
 */
async function notifyBrokerOfUpload(
  caseRow: { id: string; caseNumber: string; broker: { email: string | null } | null } | null,
  kundeName: string | null,
  count: number
): Promise<void> {
  const brokerEmail = caseRow?.broker?.email;
  if (!caseRow || !brokerEmail || !isEmailConfigured()) return;
  try {
    const caseUrl = `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/cases/${caseRow.id}`;
    const { subject, text } = buildUploadNotification({
      caseNumber: caseRow.caseNumber,
      kundeName: kundeName ?? "",
      count,
      caseUrl,
    });
    await sendEmail({ to: brokerEmail, subject, text });
  } catch (e) {
    // Kein Abbruch des Uploads – nur Metadaten loggen, keine Kundendaten.
    console.error("[customerUpload] Broker-Benachrichtigung fehlgeschlagen:", e);
  }
}

/** Speichert das Kunden-Erstformular (auch Teilstand). */
export async function saveCustomerForm(token: string, formData: FormData): Promise<void> {
  const access = await requireUploadTokenAccess(token);
  if (!access) throw new Error("Upload-Link ungültig oder abgelaufen.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = customerFormSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : raw;

  await prisma.customerForm.upsert({
    where: { caseId: access.caseId },
    create: { caseId: access.caseId, data: data as object, submitted: true },
    update: { data: data as object, submitted: true },
  });

  if (parsed.success) {
    const d = parsed.data;
    const applicant = await prisma.applicant.findFirst({
      where: { caseId: access.caseId },
      orderBy: { position: "asc" },
    });
    if (applicant) {
      await prisma.applicant.update({
        where: { id: applicant.id },
        data: {
          vorname: d.vorname || applicant.vorname,
          nachname: d.nachname || applicant.nachname,
          email: d.email || applicant.email,
          phone: d.telefon || applicant.phone,
          familienstand: d.familienstand ?? applicant.familienstand,
          anzahlKinder: d.anzahlKinder ?? applicant.anzahlKinder,
        },
      });
    }
  }

  await audit({
    organizationId: access.organizationId,
    action: "case.updated",
    entityType: "case",
    entityId: access.caseId,
    metadata: { customerForm: true },
  });
  revalidatePath(`/upload/${token}`);
}
