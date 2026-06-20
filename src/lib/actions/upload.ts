"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyUploadToken } from "@/lib/security/upload-token";
import { getStorage } from "@/lib/storage";
import { getOCRProvider } from "@/lib/ai";
import { AIService } from "@/lib/ai/service";
import { generateFileName } from "@/lib/documents/filename";
import { customerFormSchema } from "@/lib/domain/forms";
import { audit } from "@/lib/audit";

const ai = new AIService();

async function resolveToken(token: string) {
  const payload = verifyUploadToken(token);
  if (!payload) return null;
  const link = await prisma.uploadLink.findUnique({
    where: { token },
    include: { case: { include: { applicants: true, organization: true } } },
  });
  if (!link || !link.active || link.expiresAt < new Date()) return null;
  return { payload, link };
}

/** Kunden-Upload: speichert Datei, OCR, Klassifizierung, sinnvoller Dateiname. */
export async function customerUpload(token: string, formData: FormData): Promise<void> {
  const resolved = await resolveToken(token);
  if (!resolved) throw new Error("Upload-Link ungültig oder abgelaufen.");
  const { link } = resolved;

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const storage = getStorage();
  const ocr = getOCRProvider();

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.put({
      caseId: link.caseId,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    // OCR + KI bestmöglich. Bei Ausfall (Dienst nicht erreichbar) wird die Datei
    // trotzdem gespeichert und kann später erneut geprüft werden – der Kunde
    // bekommt keinen Fehler.
    let ocrResult: Awaited<ReturnType<typeof ocr.extractText>> | null = null;
    let cls: Awaited<ReturnType<typeof ai.classifyDocument>> | null = null;
    let ext: Awaited<ReturnType<typeof ai.extractFields>> | null = null;
    try {
      ocrResult = await ocr.extractText({
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        originalName: file.name,
        buffer,
      });
      cls = await ai.classifyDocument(ocrResult.fullText, { pageCount: ocrResult.pageCount });
      ext = await ai.extractFields(cls.documentType, ocrResult.fullText);
    } catch {
      // KI/OCR aktuell nicht verfügbar – ohne Klartext loggen.
    }

    const applicant = link.case.applicants[0];
    const applicantName = applicant ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") : null;

    const generatedName = generateFileName({
      documentType: cls?.documentType ?? null,
      applicantName: cls?.detectedApplicant ?? applicantName,
      propertyRef: cls?.detectedPropertyRef,
      period: cls?.period,
      originalName: file.name,
    });

    await prisma.document.create({
      data: {
        caseId: link.caseId,
        originalName: file.name,
        generatedName,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        pageCount: ocrResult?.pageCount,
        documentType: cls?.documentType ?? null,
        uploadSource: "kunde",
        ocrStatus: ocrResult ? "fertig" : "fehler",
        classificationStatus: cls ? "fertig" : "fehler",
        extractionStatus: ext ? "fertig" : "fehler",
        confidence: cls?.confidence,
        readable: ocrResult ? true : null,
        period: cls?.period ?? undefined,
        pages: ocrResult ? { create: ocrResult.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: p.text, width: p.width, height: p.height })) } : undefined,
        extractedFields: ext ? {
          create: ext.fields.map((f) => ({
            key: f.key,
            label: f.label,
            value: f.value == null ? null : String(f.value),
            confidence: f.confidence,
            source: f.source,
          })),
        } : undefined,
        warnings: ext ? {
          create: ext.warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message, customerVisible: w.customerVisible })),
        } : undefined,
      },
    });
  }

  await prisma.uploadLink.update({
    where: { id: link.id },
    data: { usedCount: { increment: files.length } },
  });
  await audit({
    organizationId: link.case.organizationId,
    action: "document.uploaded",
    entityType: "case",
    entityId: link.caseId,
    metadata: { source: "kunde", count: files.length },
  });

  revalidatePath(`/upload/${token}`);
  revalidatePath(`/cases/${link.caseId}`);
}

/** Speichert das Kunden-Erstformular (auch Teilstand). */
export async function saveCustomerForm(token: string, formData: FormData): Promise<void> {
  const resolved = await resolveToken(token);
  if (!resolved) throw new Error("Upload-Link ungültig oder abgelaufen.");
  const { link } = resolved;

  const raw = Object.fromEntries(formData.entries());
  const parsed = customerFormSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : raw;

  await prisma.customerForm.upsert({
    where: { caseId: link.caseId },
    create: { caseId: link.caseId, data: data as object, submitted: true },
    update: { data: data as object, submitted: true },
  });

  // Grunddaten in den Fall übernehmen (Antragsteller 1).
  if (parsed.success) {
    const d = parsed.data;
    const applicant = link.case.applicants[0];
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
    organizationId: link.case.organizationId,
    action: "case.updated",
    entityType: "case",
    entityId: link.caseId,
    metadata: { customerForm: true },
  });
  revalidatePath(`/upload/${token}`);
}
