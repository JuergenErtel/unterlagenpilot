"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireCaseAccess } from "@/lib/auth/context";
import { LOCKED_CASE_STATUSES } from "@/lib/domain/enums";
import {
  resolveSelfDisclosureToken,
  createSelfDisclosureLink,
  deactivateSelfDisclosureLink,
} from "@/lib/security/self-disclosure-link";
import { schrittFinden, naechsterSchritt, schluessel } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import {
  planUebernahme,
  type Fallstand,
  type Uebernahmeplan,
} from "@/lib/self-disclosure/takeover";
import type { Antworten } from "@/lib/self-disclosure/types";
import { schreibeVorschlaege } from "@/lib/self-disclosure/schreiben";

export interface SchrittState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Speichert einen Schritt und schickt den Kunden zum nächsten.
 *
 * Grundsatz: Ein leerer Schritt ist gültig und wird übersprungen – er schreibt
 * nichts. Geprüft wird nur die Form eingegebener Werte; ungeprüfte Rohdaten
 * landen nie in der Datenbank.
 */
export async function speichereAntwort(
  token: string,
  schrittId: string,
  formData: FormData
): Promise<SchrittState | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bestand = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true },
  });
  if (bestand?.submittedAt) {
    return {
      error: "Ihre Angaben wurden bereits übermittelt. Bitte wenden Sie sich an Ihren Berater.",
    };
  }

  const antworten = ((bestand?.answers as Antworten | null) ?? {}) as Antworten;
  const schritt = schrittFinden(schrittId, antworten);
  if (!schritt) return { error: "Dieser Schritt gehört nicht zu Ihrem Bogen." };

  const roh = Object.fromEntries(formData.entries());
  const geprueft = schrittSchema(schritt.schritt).safeParse(roh);
  if (!geprueft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of geprueft.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };
  }

  // Nur tatsächlich gegebene Werte schreiben. Eine Lücke darf einen früher
  // gegebenen Wert nicht löschen – der Kunde springt oft zurück.
  const neu: Antworten = { ...antworten };
  for (const [feldId, value] of Object.entries(geprueft.data)) {
    if (value === null || value === undefined || value === "") continue;
    neu[schluessel(schritt.id, feldId)] = value as Antworten[string];
  }

  const nach = naechsterSchritt(schritt.id, neu);
  const currentStep = nach?.id ?? "zusammenfassung";

  await prisma.selfDisclosure.upsert({
    where: { linkId: access.linkId },
    // caseId nur setzen, wenn es einen Fall gibt. Beim Anfrageformular
    // entsteht er erst beim Absenden.
    create: {
      linkId: access.linkId,
      ...(access.caseId ? { caseId: access.caseId } : {}),
      answers: neu as object,
      currentStep,
    },
    update: { answers: neu as object, currentStep },
  });

  redirect(`/selbstauskunft/${token}/${currentStep}`);
}

/**
 * Schließt den Bogen ab. Lücken sind ausdrücklich erlaubt – der Eingang zeigt
 * sie dem Vermittler als Nachfassliste. Ab hier ist der Bogen nur noch lesbar.
 *
 * `formData` trägt beim Anfrageformular die Pflichtangaben und die
 * Einwilligung (Kontaktfelder, Häkchen `einwilligung`) – ausgewertet wird das
 * erst in Aufgabe 9, wenn aus dem Bogen ein Fall entsteht.
 */
export async function sendeAb(
  token: string,
  formData?: FormData
): Promise<{ error?: string } | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { id: true, submittedAt: true },
  });
  if (!bogen) return { error: "Es sind noch keine Angaben gespeichert." };
  if (bogen.submittedAt) return { error: "Ihre Angaben wurden bereits übermittelt." };

  await prisma.selfDisclosure.update({
    where: { id: bogen.id },
    data: { submittedAt: new Date(), currentStep: "zusammenfassung" },
  });

  await audit({
    organizationId: access.organizationId,
    userId: null,
    action: "case.updated",
    entityType: "case",
    entityId: access.caseId,
    metadata: { quelle: "selbstauskunft", ereignis: "eingegangen" },
  });
}

// ---------------------------------------------------------------------------
// Backoffice: Eingang und Freigabe
// ---------------------------------------------------------------------------

async function ladeFallstand(caseId: string): Promise<Fallstand> {
  const [applicants, property, financingRequest, fall] = await Promise.all([
    prisma.applicant.findMany({ where: { caseId }, orderBy: { position: "asc" } }),
    prisma.property.findUnique({ where: { caseId } }),
    prisma.financingRequest.findUnique({ where: { caseId } }),
    prisma.case.findUnique({ where: { id: caseId }, select: { financingType: true } }),
  ]);
  return {
    applicants: applicants as unknown as Fallstand["applicants"],
    property: (property as Record<string, unknown> | null) ?? null,
    financingRequest: (financingRequest as Record<string, unknown> | null) ?? null,
    caseFelder: { financingType: fall?.financingType ?? null },
  };
}

/** Lädt den zuletzt eingegangenen, noch nicht übernommenen Bogen eines Falls. */
export async function ladeUebernahmeplan(caseId: string): Promise<{
  plan: Uebernahmeplan;
  disclosureId: string;
  submittedAt: Date;
} | null> {
  await requireCaseAccess(caseId);
  const bogen = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: { not: null }, takenOverAt: null },
    orderBy: { submittedAt: "desc" },
    select: { id: true, answers: true, submittedAt: true },
  });
  if (!bogen) return null;

  const stand = await ladeFallstand(caseId);
  return {
    plan: planUebernahme((bogen.answers as Antworten) ?? {}, stand),
    disclosureId: bogen.id,
    submittedAt: bogen.submittedAt!,
  };
}

/**
 * Übernimmt die ausgewählten Vorschläge in den Fall. Nichts wird ohne Auswahl
 * geschrieben; ein gesperrter Fall nimmt nichts an. Alle Schreibvorgänge laufen
 * in einer Transaktion – ein abgebrochener Lauf darf keinen halb gefüllten Fall
 * hinterlassen.
 */
export async function uebernehmen(
  caseId: string,
  schluesselListe: string[]
): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);

  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    select: { status: true, financingType: true },
  });
  if (!fall) return { error: "Fall nicht gefunden." };
  if (LOCKED_CASE_STATUSES.has(fall.status)) {
    return { error: "Der Fall ist gesperrt – die Angaben können nicht übernommen werden." };
  }

  const bogen = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: { not: null }, takenOverAt: null },
    orderBy: { submittedAt: "desc" },
    select: { id: true, answers: true },
  });
  if (!bogen) return { error: "Es liegt keine eingegangene Selbstauskunft vor." };

  const antworten = (bogen.answers as Antworten) ?? {};
  const stand = await ladeFallstand(caseId);
  const plan = planUebernahme(antworten, stand);
  const gewaehlt = plan.vorschlaege.filter((v) => schluesselListe.includes(v.schluessel));

  await prisma.$transaction(async (tx) => {
    // Antragsteller 2 entsteht erst hier – ein halb ausgefüllter Bogen soll den
    // Fall nicht verändern.
    const vorhanden = new Map<number, string>(
      stand.applicants.map((a) => [a.position, a.id as string])
    );
    await schreibeVorschlaege(tx, caseId, gewaehlt, vorhanden);

    await tx.selfDisclosure.update({
      where: { id: bogen.id },
      data: { takenOverAt: new Date() },
    });
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "field.corrected",
    entityType: "case",
    entityId: caseId,
    metadata: { quelle: "selbstauskunft", uebernommen: gewaehlt.length },
  });

  revalidatePath(`/cases/${caseId}`);
  return {};
}

export interface SelfDisclosureLinkState {
  url?: string;
  error?: string;
}

/**
 * Erzeugt einen Link; der Klartext wird nur hier einmal zurückgegeben.
 *
 * War ein früherer Bogen begonnen, aber nie abgesendet, wandern seine Antworten
 * mit — sonst begänne der Kunde nach einem abgelaufenen Link wieder bei null.
 * Ein abgesendeter Bogen wird nie fortgeschrieben: Er ist der belegte Stand.
 */
export async function erstelleSelbstauskunftLink(
  caseId: string,
  tage = 14
): Promise<SelfDisclosureLinkState> {
  const { ctx } = await requireCaseAccess(caseId);
  const expiresAt = new Date(Date.now() + tage * 86400_000);
  const created = await createSelfDisclosureLink(caseId, expiresAt, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });

  const unfertig = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: null },
    orderBy: { createdAt: "desc" },
    select: { answers: true, currentStep: true },
  });
  if (unfertig) {
    await prisma.selfDisclosure.create({
      data: {
        linkId: created.linkId,
        caseId,
        answers: (unfertig.answers as object) ?? {},
        currentStep: unfertig.currentStep,
      },
    });
  }

  revalidatePath(`/cases/${caseId}`);
  return { url: created.url };
}

export async function widerrufeSelbstauskunftLink(caseId: string, linkId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await deactivateSelfDisclosureLink(linkId, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  revalidatePath(`/cases/${caseId}`);
}
