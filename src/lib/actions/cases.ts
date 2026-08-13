"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
import { mapLimit } from "@/lib/util/concurrency";
import { generateByType } from "@/lib/messages/generators";
import { buildTemplateVars, renderTemplate, templateKey, DEFAULT_TEMPLATES, buildSignature } from "@/lib/messages/render";
import { getBrokerInfo } from "@/lib/organization/broker-info";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { getDatenkontext, getEuropaceClient } from "@/lib/platforms/europace/client";
import {
  uebertrageFallNachEuropace,
  type UebertragungErgebnis,
} from "@/lib/platforms/europace/uebertragung";
import {
  uebertrageUnterlagen,
  type UnterlagenErgebnis,
} from "@/lib/platforms/europace/unterlagen";
import { getStorage } from "@/lib/storage";
import { formatCaseNumber, highestSequence, caseNumberPrefix } from "@/lib/cases/case-number";
import { computeApplicantUpdate, type CurrentApplicant } from "@/lib/documents/apply-fields";
import { computeObjectUpdate, isObjectDocumentType } from "@/lib/documents/apply-object-fields";
import { planRematch } from "@/lib/documents/applicant-match";
import { isAiCheckRunning } from "@/lib/cases/ai-check-status";
import { LOCKED_CASE_STATUSES } from "@/lib/domain/enums";
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

// Wie viele Dokumente die KI-Prüfung gleichzeitig verarbeitet. Genug, um die
// Gesamtdauer klein zu halten, ohne den KI-Anbieter mit Requests zu überfahren.
const AI_CHECK_CONCURRENCY = 4;

/** true, wenn der Fehler eine Prisma-Unique-Constraint-Verletzung (P2002) ist. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function nextCaseNumber(organizationId: string, year: number): Promise<string> {
  // Numerisches Maximum statt `orderBy: { caseNumber: "desc" }`: die DB sortiert
  // Strings, wodurch ab "…-10000" dauerhaft "…-9999" als höchste Nummer gälte
  // und jede weitere Fallanlage an der Unique-Constraint scheitern würde.
  const rows = await prisma.case.findMany({
    where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(year) } },
    select: { caseNumber: true },
  });
  return formatCaseNumber(year, highestSequence(rows.map((r) => r.caseNumber)) + 1);
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
    // Damit "manuell" kein toter Buchstabe bleibt. Bestandsfälle behalten
    // "unbekannt" – sie ohne Beleg umzuschreiben wäre geraten.
    quelle: "manuell" as const,
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
  if (row && !LOCKED_CASE_STATUSES.has(row.status as CaseStatus)) {
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

/**
 * Startet die KI-Prüfung über alle Dokumente eines Falls – im Hintergrund.
 *
 * Die Aktion kehrt sofort zurück; die eigentliche Prüfung (2 KI-Aufrufe je
 * Dokument) läuft via after() weiter. Vorher lief sie synchron im Request:
 * Bei einem echten Fall mit 10 Dokumenten stand der Vermittler ~2 Minuten vor
 * einem stummen Spinner und hielt die Funktion für kaputt (29.07., Fall
 * UP-2026-0002). Den Fortschritt zeigt die Fallseite über den Fallstatus
 * `ki_pruefung_laeuft` plus Dokument-Status, die Seite pollt selbst.
 */
export async function runAiCheck(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  // Status-Guard: einen bereits exportierten/übertragenen/abgeschlossenen Fall
  // nicht durch eine erneute KI-Prüfung zurücksetzen.
  const current = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { status: true, updatedAt: true },
  });
  if (LOCKED_CASE_STATUSES.has(current.status as CaseStatus)) {
    return;
  }
  // Läuft bereits eine frische Prüfung, keine zweite parallel starten. Ein
  // veralteter läuft-Status (abgestürzter Lauf) darf dagegen neu gestartet
  // werden – als Revert-Ziel dient dann ein neutraler Status.
  if (isAiCheckRunning(current.status, current.updatedAt)) {
    return;
  }
  const previousStatus = current.status === "ki_pruefung_laeuft" ? "unterlagen_fehlen" : current.status;

  await prisma.case.update({ where: { id: caseId }, data: { status: "ki_pruefung_laeuft" } });
  // Alle Dokumente sichtbar auf "läuft" setzen – daraus speist sich die
  // Fortschrittsanzeige ("n von m geprüft") auf der Fallseite.
  await prisma.document.updateMany({
    where: { caseId },
    data: { classificationStatus: "laeuft", extractionStatus: "laeuft" },
  });

  after(() =>
    processAiCheckInBackground({
      caseId,
      previousStatus,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    })
  );

  revalidatePath(`/cases/${caseId}`);
}

/**
 * Der eigentliche Prüflauf. Läuft nach der Antwort weiter (after()) und darf
 * deshalb niemals werfen – Fehler räumt er selbst auf (Status-Revert).
 */
async function processAiCheckInBackground(params: {
  caseId: string;
  previousStatus: string;
  organizationId: string;
  userId: string;
}): Promise<void> {
  const { caseId, previousStatus, organizationId, userId } = params;
  try {
    const docs = await prisma.document.findMany({
      where: { caseId },
      include: { pages: true, extractedFields: true },
    });

    // Einmal je Prüflauf laden statt je Dokument – der Abgleich ist reine
    // Textlogik und braucht keinen weiteren KI-Aufruf.
    const applicants = await prisma.applicant.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, vorname: true, nachname: true },
    });

    // Dokumente begrenzt parallel prüfen statt streng nacheinander: das war die
    // Hauptursache, dass die KI-Prüfung bei mehreren Dokumenten über das
    // Function-Timeout lief und mit "Etwas ist schiefgelaufen" abbrach.
    // Jedes Dokument ist ein eigener DB-Datensatz -> keine Schreibkonflikte.
    await mapLimit(docs, AI_CHECK_CONCURRENCY, async (doc) => {
      const text = doc.pages.map((p) => p.ocrText ?? "").join("\n");
      try {
        const cls = await ai.classifyDocument(text, { forceType: doc.documentType ?? undefined });
        const ext = await ai.extractFields(cls.documentType, text);

        // Dieselbe Regel wie beim nachträglichen Abgleich: nur unzugeordnete
        // oder automatisch zugeordnete Dokumente anfassen, eine Auswahl des
        // Vermittlers bleibt bestehen. planRematch liefert nur echte Änderungen.
        const [change] = planRematch(
          [
            {
              id: doc.id,
              applicantId: doc.applicantId,
              applicantSource: doc.applicantSource,
              detectedApplicant: cls.detectedApplicant ?? null,
            },
          ],
          applicants
        );

        await prisma.document.update({
          where: { id: doc.id },
          data: {
            documentType: cls.documentType,
            detectedApplicant: cls.detectedApplicant ?? null,
            ...(change ? { applicantId: change.applicantId, applicantSource: "auto" } : {}),
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
      } catch (e) {
        // KI-/OCR-Dienst nicht erreichbar o.ä.: Dokument markieren, Vorgang fortsetzen.
        // Fehlerart loggen (ohne Kundendaten/Dokumenttext) – sonst ist die
        // Ursache in Prod unauffindbar (04.08.: Schema-Fehler blieb unsichtbar).
        console.warn(
          `[ki-pruefung] Dokument ${doc.id} fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`
        );
        await prisma.document.update({
          where: { id: doc.id },
          data: { classificationStatus: "fehler", extractionStatus: "fehler" },
        });
      }
    });

    const agg = await getCaseAggregate(caseId);
    await prisma.case.update({
      where: { id: caseId },
      data: {
        status: agg.missing.length > 0 ? "unterlagen_fehlen" : "vermittlerpruefung_erforderlich",
        readinessScore: agg.readiness.score,
      },
    });

    await audit({
      organizationId,
      userId,
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
      .update({ where: { id: caseId }, data: { status: previousStatus as CaseStatus } })
      .catch(() => {});
  }
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
  const needsLink = ["erstnachforderung", "unterlage_fehlt_weiterhin", "pdf_checkliste", "status_nachforderung"].includes(type);
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
  reviewStatus: "akzeptiert" | "abgelehnt" | "duplikat" | "ersetzt",
  grund?: string
): Promise<void> {
  const ctx = await requireContext();
  // Tenant-Isolation: Dokument muss zur Organisation des Nutzers gehören.
  const owner = await prisma.document.findUnique({
    where: { id: documentId },
    select: { caseId: true, applicantId: true, case: { select: { organizationId: true } } },
  });
  if (!owner || owner.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      reviewStatus,
      // Beim Ablehnen den Grund speichern (kundentauglich formuliert, siehe
      // Review-Center) – sonst ausdrücklich leeren, damit ein alter Grund nicht
      // an einem später angenommenen Dokument kleben bleibt.
      reviewNote: reviewStatus === "abgelehnt" ? grund?.trim().slice(0, 500) || null : null,
    },
    select: { caseId: true, documentType: true },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.reviewed",
    entityType: "document",
    entityId: documentId,
    metadata: { reviewStatus },
  });

  // Manuelle Freigabe: beim Akzeptieren erkannte Stammdaten in die Kundendaten
  // übernehmen (nur leere Felder). Best-effort – ein Fehler blockiert die Freigabe nie.
  if (reviewStatus === "akzeptiert") {
    try {
      await applyExtractedFieldsToApplicant(documentId, owner!.caseId, owner!.applicantId, ctx);
    } catch (e) {
      console.error("[setDocumentReview] Stammdaten-Übernahme fehlgeschlagen:", e);
    }
    // Objekt-Dokumente (Exposé, Kaufvertrag, Grundbuch …): erkannte Objekt-/
    // Finanzierungsdaten in Property/FinancingRequest übernehmen (nur leere Felder).
    if (doc.documentType && isObjectDocumentType(doc.documentType)) {
      try {
        await applyExtractedFieldsToObject(documentId, owner!.caseId, ctx);
      } catch (e) {
        console.error("[setDocumentReview] Objektdaten-Übernahme fehlgeschlagen:", e);
      }
    }
  }

  revalidatePath(`/cases/${doc.caseId}`);
  revalidatePath(`/review`);
}

/**
 * Dünner Wrapper für `<form action={acceptDocument.bind(null, documentId)}>`.
 *
 * `setDocumentReview` hat seit dem optionalen `grund`-Parameter drei
 * Argumente – mit zwei gebundenen Argumenten (documentId, "akzeptiert")
 * bliebe als drittes, ungebundenes Argument `grund?: string` übrig, und React
 * würde dort beim Formular-Submit ein FormData-Objekt hineinreichen. Dieser
 * Wrapper bindet vollständig, sodass kein Formularwert erwartet wird.
 */
export async function acceptDocument(documentId: string): Promise<void> {
  await setDocumentReview(documentId, "akzeptiert");
}

/** Zu prüfende/befüllende Stammdaten-Spalten des Antragstellers. */
const APPLICANT_MASTER_SELECT = {
  id: true,
  vorname: true,
  nachname: true,
  geburtsdatum: true,
  geburtsort: true,
  staatsangehoerigkeit: true,
  familienstand: true,
  anzahlKinder: true,
  street: true,
  zip: true,
  city: true,
  email: true,
  phone: true,
} as const;

/**
 * Überträgt die (ggf. korrigierten) extrahierten Felder eines akzeptierten
 * Dokuments in die Stammdaten des zugeordneten Antragstellers – nur leere Felder.
 * Ziel = document.applicantId; falls nicht gesetzt, nur bei genau EINEM
 * Antragsteller im Fall (sonst keine sichere Zuordnung).
 */
async function applyExtractedFieldsToApplicant(
  documentId: string,
  caseId: string,
  applicantId: string | null,
  ctx: { organizationId: string; userId: string }
): Promise<void> {
  const fields = await prisma.extractedFieldRecord.findMany({
    where: { documentId },
    select: { key: true, label: true, value: true, correctedValue: true },
  });
  if (fields.length === 0) return;

  let target: ({ id: string } & CurrentApplicant) | null = null;
  if (applicantId) {
    target = await prisma.applicant.findUnique({ where: { id: applicantId }, select: APPLICANT_MASTER_SELECT });
  } else {
    const apps = await prisma.applicant.findMany({
      where: { caseId },
      select: APPLICANT_MASTER_SELECT,
      orderBy: { position: "asc" },
    });
    if (apps.length === 1) target = apps[0]!;
  }
  if (!target) return;

  const effective = fields.map((f) => ({ key: f.key, label: f.label, value: f.correctedValue ?? f.value }));
  const { data, appliedLabels } = computeApplicantUpdate(effective, target);
  if (appliedLabels.length === 0) return;

  await prisma.applicant.update({ where: { id: target.id }, data });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "applicant",
    entityId: target.id,
    metadata: { source: "document_extraction", documentId, fields: appliedLabels },
  });
}

/**
 * Überträgt die (ggf. korrigierten) extrahierten Felder eines akzeptierten
 * Objekt-Dokuments in die Objektdaten (Property) und den Finanzierungswunsch
 * (FinancingRequest) des Falls – nur leere Felder.
 */
async function applyExtractedFieldsToObject(
  documentId: string,
  caseId: string,
  ctx: { organizationId: string; userId: string }
): Promise<void> {
  const fields = await prisma.extractedFieldRecord.findMany({
    where: { documentId },
    select: { key: true, label: true, value: true, correctedValue: true },
  });
  if (fields.length === 0) return;

  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      property: {
        // Jedes Feld, das computeObjectUpdate füllen kann, muss hier geladen
        // werden: ein nicht selektiertes Feld sieht dort wie ein leeres aus –
        // und ein vorhandener Wert würde überschrieben.
        select: {
          objektart: true,
          street: true,
          zip: true,
          city: true,
          wohnflaeche: true,
          nutzflaeche: true,
          grundstuecksflaeche: true,
          baujahr: true,
          zustand: true,
          anzahlZimmer: true,
          anzahlWohneinheiten: true,
          heizungsart: true,
          stellplaetze: true,
          hausgeldMonatlich: true,
          mieteinnahmenMonatlich: true,
        },
      },
      financingRequest: { select: { kaufpreis: true, baukosten: true } },
    },
  });

  const effective = fields.map((f) => ({ key: f.key, label: f.label, value: f.correctedValue ?? f.value }));
  const { propertyData, financingData, appliedLabels } = computeObjectUpdate(effective, {
    property: caseRow?.property ?? null,
    financing: caseRow?.financingRequest ?? null,
  });
  if (appliedLabels.length === 0) return;

  if (Object.keys(propertyData).length > 0) {
    await prisma.property.upsert({
      where: { caseId },
      create: { caseId, ...propertyData },
      update: propertyData,
    });
  }
  if (Object.keys(financingData).length > 0) {
    await prisma.financingRequest.upsert({
      where: { caseId },
      create: { caseId, ...financingData },
      update: financingData,
    });
  }
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { source: "document_extraction", documentId, fields: appliedLabels },
  });
}

/**
 * Prueft die bindende Zusage "keine Uebertragung ohne manuelle Freigabe" fuer
 * beide Europace-Aktionen (Vorgang anlegen wie Unterlagen nachschieben) --
 * die Zusage darf nicht nur an einer Stelle greifen. Anders als jeder andere
 * Ausgang der beiden Ablaufdateien war dieser Abbruch bisher der einzige ohne
 * PlatformSyncLog-Eintrag; das holt diese Funktion nach.
 *
 * Liefert die Abbruchmeldung, wenn (noch) nicht freigegeben ist, sonst null.
 */
async function pruefeEuropaceFreigabe(caseId: string): Promise<string | null> {
  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { released: true },
  });
  if (mapping?.released) return null;

  const meldung = "Der Fall ist fuer Europace noch nicht freigegeben.";
  await prisma.platformSyncLog.create({
    data: { caseId, platform: "europace", direction: "export", status: "uebersprungen", message: meldung },
  });
  return meldung;
}

/**
 * Legt den Fall als Europace-Vorgang an. Nur nach manueller Freigabe.
 */
export async function europaceVorgangAnlegen(caseId: string): Promise<UebertragungErgebnis> {
  const { ctx } = await requireCaseAccess(caseId);

  const freigabeFehler = await pruefeEuropaceFreigabe(caseId);
  if (freigabeFehler) {
    return { ok: false, meldung: freigabeFehler };
  }

  const ergebnis = await uebertrageFallNachEuropace(caseId, {
    client: getEuropaceClient(ctx.organizationId),
    datenkontext: getDatenkontext(),
    ladeCanonical: (id) => caseToCanonical(id),
    ladeVorhandeneNummer: async (id) =>
      (
        await prisma.platformMapping.findUnique({
          where: { caseId_platform: { caseId: id, platform: "europace" } },
          select: { externalId: true },
        })
      )?.externalId ?? null,
    speichereNummer: async (id, vorgangsnummer) => {
      // Bedingtes Update: schreibt nur, wenn noch keine Nummer gesetzt ist.
      // Ein ueberlappender Aufruf (Doppelklick, zweiter Tab) hat sonst die
      // Chance, die zuerst gespeicherte Nummer kommentarlos zu ueberschreiben.
      const { count } = await prisma.platformMapping.updateMany({
        where: { caseId: id, platform: "europace", externalId: null },
        data: { externalId: vorgangsnummer },
      });
      if (count > 0) return { ok: true };

      const aktuell = await prisma.platformMapping.findUnique({
        where: { caseId_platform: { caseId: id, platform: "europace" } },
        select: { externalId: true },
      });
      return { ok: false, vorhandeneNummer: aktuell?.externalId ?? undefined };
    },
    protokolliere: async ({ caseId: id, status, meldung }) => {
      await prisma.platformSyncLog.create({
        data: { caseId: id, platform: "europace", direction: "export", status, message: meldung },
      });
    },
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "platform.pushed",
      entityType: "case",
      entityId: caseId,
      metadata: { platform: "europace", vorgangsnummer: ergebnis.vorgangsnummer },
    });
  }

  revalidatePath(`/cases/${caseId}/export`);
  return ergebnis;
}

/**
 * Schiebt die akzeptierten Unterlagen an den bestehenden Europace-Vorgang.
 */
export async function europaceUnterlagenUebertragen(caseId: string): Promise<UnterlagenErgebnis> {
  const { ctx } = await requireCaseAccess(caseId);

  const freigabeFehler = await pruefeEuropaceFreigabe(caseId);
  if (freigabeFehler) {
    return {
      ok: false,
      uebertragen: 0,
      uebersprungen: 0,
      fehlgeschlagen: [],
      ueberzaehlig: [],
      meldung: freigabeFehler,
    };
  }

  const storage = getStorage();

  const ergebnis = await uebertrageUnterlagen(caseId, {
    client: getEuropaceClient(ctx.organizationId),
    ladeVorgangsnummer: async (id) =>
      (
        await prisma.platformMapping.findUnique({
          where: { caseId_platform: { caseId: id, platform: "europace" } },
          select: { externalId: true },
        })
      )?.externalId ?? null,
    ladeDokumente: (id) =>
      prisma.document.findMany({
        where: { caseId: id, reviewStatus: "akzeptiert" },
        select: {
          id: true,
          generatedName: true,
          originalName: true,
          documentType: true,
          mimeType: true,
          storageKey: true,
          europaceDokumentId: true,
        },
      }),
    ladeDatei: (storageKey) => storage.get(storageKey),
    merkeDokumentId: async (dokumentId, europaceDokumentId) => {
      // Bedingtes Update: schreibt nur, wenn fuer das Dokument noch keine ID
      // gesetzt ist. Ein ueberlappender Aufruf (Doppelklick, zweiter Tab) hat
      // sonst die Chance, die zuerst gespeicherte ID kommentarlos zu
      // ueberschreiben -- die Zuordnung des ersten, ebenfalls real
      // hochgeladenen Dokuments waere dann verloren, siehe `merkeDokumentId`
      // in unterlagen.ts.
      const { count } = await prisma.document.updateMany({
        where: { id: dokumentId, europaceDokumentId: null },
        data: { europaceDokumentId },
      });
      return { ok: count > 0 };
    },
    protokolliere: async ({ caseId: id, status, meldung }) => {
      await prisma.platformSyncLog.create({
        data: { caseId: id, platform: "europace", direction: "export", status, message: meldung },
      });
    },
  });

  revalidatePath(`/cases/${caseId}/export`);
  return ergebnis;
}
