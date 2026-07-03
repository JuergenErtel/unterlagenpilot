"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireContext, requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import {
  createSecureUploadLink,
  regenerateUploadLink,
  deactivateUploadLink,
} from "@/lib/security/upload-link";
import { getCaseAggregate } from "@/lib/cases/service";
import { AIService } from "@/lib/ai/service";
import { generateByType } from "@/lib/messages/generators";
import { buildTemplateVars, renderTemplate, templateKey, DEFAULT_TEMPLATES, buildSignature } from "@/lib/messages/render";
import { getBrokerInfo } from "@/lib/pdf/case-pdf";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { computeNextCaseNumber, caseNumberPrefix } from "@/lib/cases/case-number";
import type {
  CaseStatus,
  EmploymentType,
  FinancingType,
  MessageChannel,
  MessageTemplateType,
  Platform,
  PropertyType,
} from "@/lib/domain/enums";

const ai = new AIService();

/** Terminal-/Post-Export-Status: hier darf eine Aktion den Status nicht zurücksetzen. */
const LOCKED_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  "exportiert",
  "uebertragen",
  "abgeschlossen",
  "archiviert",
]);

/** true, wenn der Fehler eine Prisma-Unique-Constraint-Verletzung (P2002) ist. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function nextCaseNumber(organizationId: string, year: number): Promise<string> {
  const highest = await prisma.case.findFirst({
    where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(year) } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });
  return computeNextCaseNumber(highest?.caseNumber ?? null, year);
}

export async function createCase(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const financingType = (formData.get("financingType") || null) as FinancingType | null;
  const employmentType = (formData.get("employmentType") || null) as EmploymentType | null;
  const propertyType = (formData.get("propertyType") || null) as PropertyType | null;
  const year = new Date().getFullYear();

  const buildData = (caseNumber: string) => ({
    organizationId: ctx.organizationId,
    brokerId: ctx.userId,
    caseNumber,
    status: "neu" as const,
    financingType,
    primaryEmploymentType: employmentType,
    kapitalanlage: formData.get("kapitalanlage") === "on",
    applicants: {
      create: [{ position: 1, vorname: vorname || null, nachname: nachname || null }],
    },
    property: propertyType ? { create: { objektart: propertyType } } : undefined,
    financingRequest: { create: {} },
    sources: { create: { type: "manuell" as const } },
  });

  // Race-Schutz: parallele Anlage kann dieselbe Nummer berechnen -> P2002 auf
  // @@unique([organizationId, caseNumber]). In dem Fall neu berechnen und erneut versuchen.
  let created: { id: string; caseNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const caseNumber = await nextCaseNumber(ctx.organizationId, year);
    try {
      created = await prisma.case.create({
        data: buildData(caseNumber),
        select: { id: true, caseNumber: true },
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue;
      throw e;
    }
  }
  if (!created) throw new Error("Fallnummer konnte nicht vergeben werden.");

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

export interface UploadLinkActionState {
  /** Klartext-URL des neu erstellten Links – nur einmalig sichtbar. */
  url?: string;
  error?: string;
}

/**
 * Erstellt einen sicheren Upload-Link. Das Klartext-Token ist NUR im Rückgabewert
 * verfügbar (zum Kopieren); in der DB liegt ausschließlich der Hash.
 */
export async function createUploadLink(caseId: string, days = 14): Promise<string> {
  const { ctx } = await requireCaseAccess(caseId);
  const created = await createSecureUploadLink(
    caseId,
    new Date(Date.now() + days * 86400 * 1000),
    { organizationId: ctx.organizationId, actorUserId: ctx.userId }
  );
  await setUploadOpenIfNotLocked(caseId);
  revalidatePath(`/cases/${caseId}`);
  return created.url;
}

/** Setzt den Status auf "upload_offen", ohne einen abgeschlossenen Fall zurückzuwerfen. */
async function setUploadOpenIfNotLocked(caseId: string): Promise<void> {
  const row = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } });
  if (row && !LOCKED_STATUSES.has(row.status as CaseStatus)) {
    await prisma.case.update({ where: { id: caseId }, data: { status: "upload_offen" } });
  }
}

/** Formular-Action (useActionState): erstellt einen Link und gibt die URL einmalig zurück. */
export async function createUploadLinkAction(
  caseId: string,
  _prev: UploadLinkActionState,
  formData: FormData
): Promise<UploadLinkActionState> {
  try {
    const { ctx } = await requireCaseAccess(caseId);
    const days = Number(formData.get("days") ?? 14) || 14;
    const singleUse = formData.get("singleUse") === "on";
    const created = await createSecureUploadLink(
      caseId,
      new Date(Date.now() + days * 86400 * 1000),
      { organizationId: ctx.organizationId, actorUserId: ctx.userId, singleUse }
    );
    await setUploadOpenIfNotLocked(caseId);
    revalidatePath(`/cases/${caseId}`);
    return { url: created.url };
  } catch {
    return { error: "Link konnte nicht erstellt werden." };
  }
}

/** Erzeugt einen frischen Link und deaktiviert vorherige aktive Links des Falls. */
export async function regenerateUploadLinkAction(
  caseId: string,
  _prev: UploadLinkActionState,
  formData: FormData
): Promise<UploadLinkActionState> {
  try {
    const { ctx } = await requireCaseAccess(caseId);
    const days = Number(formData.get("days") ?? 14) || 14;
    const created = await regenerateUploadLink(
      caseId,
      new Date(Date.now() + days * 86400 * 1000),
      { organizationId: ctx.organizationId, actorUserId: ctx.userId }
    );
    revalidatePath(`/cases/${caseId}`);
    return { url: created.url };
  } catch {
    return { error: "Link konnte nicht neu erzeugt werden." };
  }
}

/** Deaktiviert einen einzelnen Upload-Link. */
export async function deactivateUploadLinkAction(caseId: string, linkId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await deactivateUploadLink(linkId, { organizationId: ctx.organizationId, userId: ctx.userId });
  revalidatePath(`/cases/${caseId}`);
}

/** Startet die (deterministische) KI-Prüfung über alle Dokumente eines Falls. */
export async function runAiCheck(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  // Status-Guard: einen bereits exportierten/übertragenen/abgeschlossenen Fall
  // nicht durch eine erneute KI-Prüfung zurücksetzen.
  const current = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { status: true },
  });
  if (LOCKED_STATUSES.has(current.status as CaseStatus)) {
    return;
  }
  const previousStatus = current.status;

  await prisma.case.update({ where: { id: caseId }, data: { status: "ki_pruefung_laeuft" } });

  try {
    const docs = await prisma.document.findMany({
      where: { caseId },
      include: { pages: true, extractedFields: true },
    });

    for (const doc of docs) {
      const text = doc.pages.map((p) => p.ocrText ?? "").join("\n");
      try {
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
              // Auch Warnungen vor dem Neuschreiben leeren, sonst vervielfachen
              // sie sich bei jedem erneuten Lauf.
              deleteMany: {},
              create: ext.warnings.map((w) => ({
                code: w.code,
                severity: w.severity,
                message: w.message,
                customerVisible: w.customerVisible,
              })),
            },
          },
        });
      } catch {
        // KI-/OCR-Dienst nicht erreichbar o.ä.: Dokument markieren, Vorgang fortsetzen.
        // (Keine Kundendaten loggen.)
        await prisma.document.update({
          where: { id: doc.id },
          data: { classificationStatus: "fehler", extractionStatus: "fehler" },
        });
      }
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
  } catch (e) {
    // Fehler NACH dem Statuswechsel: Fall nicht dauerhaft in "ki_pruefung_laeuft"
    // hängen lassen -> vorherigen Status wiederherstellen.
    console.error(`[runAiCheck] Prüfung für Fall ${caseId} fehlgeschlagen:`, e);
    await prisma.case
      .update({ where: { id: caseId }, data: { status: previousStatus } })
      .catch(() => {});
    throw e;
  }

  revalidatePath(`/cases/${caseId}`);
}

export async function generateMessage(
  caseId: string,
  type: MessageTemplateType,
  channel: MessageChannel
): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const agg = await getCaseAggregate(caseId);
  const a = agg.canonical.applicants[0];
  // Token wird nur gehasht gespeichert → für Nachrichten mit Upload-Bezug einen
  // frischen, gültigen Link erzeugen (sonst kein Klartext-Link verfügbar).
  const needsLink = ["erstnachforderung", "unterlage_fehlt_weiterhin", "pdf_checkliste"].includes(type);
  let uploadLink: string | undefined;
  if (needsLink) {
    const created = await createSecureUploadLink(
      caseId,
      new Date(Date.now() + 14 * 86400 * 1000),
      { organizationId: ctx.organizationId, actorUserId: ctx.userId }
    );
    uploadLink = created.url;
  }

  const kundeName = [a?.vorname, a?.nachname].filter(Boolean).join(" ");
  const items = agg.missing.map((m) => ({ title: m.name }));

  // Signatur aus den Organisationsdaten (mandantenfähig statt hartkodiert).
  const broker = await getBrokerInfo(ctx.organizationId);
  const vars = buildTemplateVars({
    kundeName,
    uploadLink,
    signatur: buildSignature(broker),
    items,
    dokument: items[0]?.title,
  });

  // Organisationsspezifische Vorlage bevorzugen, sonst Standard-Vorlage,
  // sonst (z.B. interne Notiz) der eingebaute Generator.
  const override = await prisma.messageTemplate.findFirst({
    where: { organizationId: ctx.organizationId, type, channel },
    select: { subject: true, body: true },
  });
  const source = override ?? DEFAULT_TEMPLATES[templateKey(type, channel)];

  let subject: string | null;
  let body: string;
  if (source) {
    subject = source.subject ? renderTemplate(source.subject, vars) : null;
    body = renderTemplate(source.body, vars);
  } else {
    const msg = generateByType(type, { kundeName, uploadLink }, items);
    subject = msg.subject ?? null;
    body = msg.body;
  }

  await prisma.generatedMessage.create({
    data: {
      caseId,
      channel,
      templateType: type,
      subject,
      body,
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
  const { ctx } = await requireCaseAccess(caseId);
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
  // Tenant-Isolation: Dokument muss zur Organisation des Nutzers gehören.
  const owner = await prisma.document.findUnique({
    where: { id: documentId },
    select: { case: { select: { organizationId: true } } },
  });
  if (!owner || owner.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
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
