"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requireUploadTokenAccess } from "@/lib/auth/context";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { processUpload } from "@/lib/documents/pipeline";
import { customerFormSchema } from "@/lib/domain/forms";
import { audit } from "@/lib/audit";

export interface CustomerUploadState {
  uploaded: number;
  rejected: { name: string; reason: string }[];
  error?: string;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  // x-real-ip wird von Vercel gesetzt (nicht client-spoofbar); x-forwarded-for als Fallback.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Kunden-Upload über sicheren Token-Link. Validierung, Virenscan und OCR/KI
 * laufen in der gesicherten Pipeline; abgelehnte Dateien werden dem Kunden
 * verständlich gemeldet, ohne interne Details preiszugeben.
 */
export async function customerUpload(
  token: string,
  _prev: CustomerUploadState,
  formData: FormData
): Promise<CustomerUploadState> {
  const access = await requireUploadTokenAccess(token);
  if (!access) return { uploaded: 0, rejected: [], error: "Upload-Link ungültig oder abgelaufen." };

  const env = getEnv();
  const limit = await checkRateLimit(`upload:${access.linkId}:${await clientIp()}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) {
    return { uploaded: 0, rejected: [], error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { uploaded: 0, rejected: [], error: "Bitte mindestens eine Datei auswählen." };

  const caseRow = await prisma.case.findUnique({
    where: { id: access.caseId },
    include: { applicants: { orderBy: { position: "asc" }, take: 1 } },
  });
  const applicant = caseRow?.applicants[0];
  const applicantName = applicant ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") : null;

  await audit({
    organizationId: access.organizationId,
    action: "upload_link.accessed",
    entityType: "case",
    entityId: access.caseId,
    metadata: { linkId: access.linkId, files: files.length, ip: await clientIp() },
  });

  const rejected: { name: string; reason: string }[] = [];
  let uploaded = 0;
  let successfulUploads = 0;

  for (const file of files) {
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
      uploaded += 1;
      successfulUploads += 1;
    } else {
      rejected.push({ name: file.name, reason: result.reason ?? "Datei konnte nicht verarbeitet werden." });
    }
  }

  if (successfulUploads > 0) {
    await prisma.uploadLink.update({
      where: { id: access.linkId },
      data: { usedCount: { increment: successfulUploads } },
    });
  }

  revalidatePath(`/upload/${token}`);
  revalidatePath(`/cases/${access.caseId}`);
  return { uploaded, rejected };
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
