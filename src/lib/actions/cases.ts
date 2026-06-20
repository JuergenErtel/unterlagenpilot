"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { createUploadToken, randomToken } from "@/lib/security/upload-token";
import { getEnv } from "@/lib/env";
import { getCaseAggregate } from "@/lib/cases/service";
import { AIService } from "@/lib/ai/service";
import { generateByType } from "@/lib/messages/generators";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import type {
  EmploymentType,
  FinancingType,
  MessageChannel,
  MessageTemplateType,
  Platform,
  PropertyType,
} from "@/lib/domain/enums";

const ai = new AIService();

async function nextCaseNumber(organizationId: string): Promise<string> {
  const count = await prisma.case.count({ where: { organizationId } });
  const year = new Date().getFullYear();
  return `UP-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createCase(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const financingType = (formData.get("financingType") || null) as FinancingType | null;
  const employmentType = (formData.get("employmentType") || null) as EmploymentType | null;
  const propertyType = (formData.get("propertyType") || null) as PropertyType | null;

  const created = await prisma.case.create({
    data: {
      organizationId: ctx.organizationId,
      brokerId: ctx.userId,
      caseNumber: await nextCaseNumber(ctx.organizationId),
      status: "neu",
      financingType,
      primaryEmploymentType: employmentType,
      kapitalanlage: formData.get("kapitalanlage") === "on",
      applicants: {
        create: [{ position: 1, vorname: vorname || null, nachname: nachname || null }],
      },
      property: propertyType ? { create: { objektart: propertyType } } : undefined,
      financingRequest: { create: {} },
      sources: { create: { type: "manuell" } },
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.created",
    entityType: "case",
    entityId: created.id,
    metadata: { caseNumber: created.caseNumber },
  });

  redirect(`/cases/${created.id}`);
}

export async function createUploadLink(caseId: string, days = 14): Promise<string> {
  const ctx = await requireContext();
  const linkId = randomToken(8);
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const token = createUploadToken({ caseId, linkId, exp });

  await prisma.uploadLink.create({
    data: { caseId, token, expiresAt: new Date(exp * 1000) },
  });
  await prisma.case.update({ where: { id: caseId }, data: { status: "upload_offen" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { days },
  });

  revalidatePath(`/cases/${caseId}`);
  return `${getEnv().APP_BASE_URL}/upload/${token}`;
}

/** Formular-Wrapper: erstellt einen Upload-Link (Rückgabe via DB/Revalidate). */
export async function createUploadLinkForm(caseId: string): Promise<void> {
  await createUploadLink(caseId);
}

/** Startet die (deterministische) KI-Prüfung über alle Dokumente eines Falls. */
export async function runAiCheck(caseId: string): Promise<void> {
  const ctx = await requireContext();
  await prisma.case.update({ where: { id: caseId }, data: { status: "ki_pruefung_laeuft" } });

  const docs = await prisma.document.findMany({
    where: { caseId },
    include: { pages: true, extractedFields: true },
  });

  for (const doc of docs) {
    const text = doc.pages.map((p) => p.ocrText ?? "").join("\n");
    const cls = await ai.classifyDocument(text, { forceType: doc.documentType ?? undefined });
    const ext = await ai.extractFields(cls.documentType, text);

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        documentType: cls.documentType,
        confidence: cls.confidence,
        classificationStatus: "fertig",
        extractionStatus: "fertig",
        readable: true,
        extractedFields: {
          deleteMany: {},
          create: ext.fields.map((f) => ({
            key: f.key,
            label: f.label,
            value: f.value == null ? null : String(f.value),
            confidence: f.confidence,
            source: f.source,
          })),
        },
        warnings: {
          create: ext.warnings.map((w) => ({
            code: w.code,
            severity: w.severity,
            message: w.message,
            customerVisible: w.customerVisible,
          })),
        },
      },
    });
  }

  const agg = await getCaseAggregate(caseId);
  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: agg.missing.length > 0 ? "unterlagen_fehlen" : "vermittlerpruefung_erforderlich",
      readinessScore: agg.readiness.score,
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { documents: docs.length, score: agg.readiness.score },
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function generateMessage(
  caseId: string,
  type: MessageTemplateType,
  channel: MessageChannel
): Promise<void> {
  const ctx = await requireContext();
  const agg = await getCaseAggregate(caseId);
  const a = agg.canonical.applicants[0];
  const link = await prisma.uploadLink.findFirst({
    where: { caseId, active: true },
    orderBy: { createdAt: "desc" },
  });
  const uploadLink = link ? `${getEnv().APP_BASE_URL}/upload/${link.token}` : undefined;

  const msg = generateByType(
    type,
    { kundeName: [a?.vorname, a?.nachname].filter(Boolean).join(" "), uploadLink },
    agg.missing.map((m) => ({ title: m.name }))
  );

  await prisma.generatedMessage.create({
    data: {
      caseId,
      channel: msg.channel,
      templateType: type,
      subject: msg.subject ?? null,
      body: msg.body,
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "message.generated",
    entityType: "case",
    entityId: caseId,
    metadata: { type, channel },
  });
  revalidatePath(`/cases/${caseId}/messages`);
}

/** Bereitet Plattform-Mapping vor und gibt es (nach manueller Aktion) frei. */
export async function releasePlatform(caseId: string, platform: Platform): Promise<void> {
  const ctx = await requireContext();
  const canonical = await caseToCanonical(caseId);
  const payload = buildPlatformMapping(canonical, platform);

  await prisma.platformMapping.upsert({
    where: { caseId_platform: { caseId, platform } },
    create: {
      caseId,
      platform,
      payload: payload as object,
      missingRequiredFields: payload.missingRequiredFields,
      released: true,
      releasedBy: ctx.userId,
      releasedAt: new Date(),
    },
    update: {
      payload: payload as object,
      missingRequiredFields: payload.missingRequiredFields,
      released: true,
      releasedBy: ctx.userId,
      releasedAt: new Date(),
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "platform.released",
    entityType: "case",
    entityId: caseId,
    metadata: { platform, missing: payload.missingRequiredFields.length },
  });
  revalidatePath(`/cases/${caseId}/export`);
}

export async function setDocumentReview(
  documentId: string,
  reviewStatus: "akzeptiert" | "abgelehnt" | "duplikat" | "ersetzt"
): Promise<void> {
  const ctx = await requireContext();
  const doc = await prisma.document.update({
    where: { id: documentId },
    data: { reviewStatus },
    select: { caseId: true },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.reviewed",
    entityType: "document",
    entityId: documentId,
    metadata: { reviewStatus },
  });
  revalidatePath(`/cases/${doc.caseId}`);
  revalidatePath(`/review`);
}
