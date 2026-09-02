"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext, akteSichtbarWhere, type AppContext } from "@/lib/auth/context";
import { requireAkteAccess } from "@/lib/auth/akte-zugriff";
import { audit } from "@/lib/audit";
import { reconcileCase, runReferenceExtraction } from "@/lib/detektiv/service";
import { checklistKeyFor } from "@/lib/detektiv/keys";
import { setDocumentReview } from "@/lib/actions/cases";

/**
 * Die einzige Stelle, an der aus einem Befund eine Checklistenposition wird –
 * nach Klick des Vermittlers, nie automatisch. Der Detektiv schlaegt vor,
 * entschieden wird hier.
 */

/**
 * Laedt den Befund NUR, wenn der Kontext die Akte sehen darf (Organisation,
 * Aktenart, Rolle) - und, weil jede Befund-Action schreibt, nur bei offenem
 * Auftrag einer Backoffice-Akte.
 */
async function ladeBefund(findingId: string, ctx: AppContext) {
  const fund = await prisma.caseFinding.findFirst({
    where: { id: findingId, case: akteSichtbarWhere(ctx) },
  });
  if (!fund) return null;
  await requireAkteAccess(fund.caseId, { schreibend: true });
  return fund;
}

export async function befundUebernehmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx);
  if (!fund || fund.status === "freigegeben") return;

  if (fund.resolution === "neue_position") {
    const item = await prisma.caseChecklistItem.create({
      data: {
        caseId: fund.caseId,
        key: checklistKeyFor(fund.id),
        name: fund.title,
        status: "offen",
        level: "zwingend",
        customerVisible: true,
        note: fund.reason,
      },
    });
    await prisma.caseFinding.update({
      where: { id: fund.id },
      data: { status: "freigegeben", checklistItemId: item.id },
    });
  } else {
    // dokument_nachfordern: die BESTEHENDE Position auf unvollstaendig setzen,
    // statt eine Dublette anzulegen. Gibt es keine, bleibt der Befund als
    // Freigabe ohne Position stehen – die Nachforderung laeuft dann ueber die
    // Dokumentablehnung im Review-Center.
    const bestehend = await prisma.caseChecklistItem.findFirst({
      where: { caseId: fund.caseId, documents: { some: { id: fund.sourceDocumentId } } },
    });
    if (bestehend) {
      await prisma.caseChecklistItem.update({
        where: { id: bestehend.id },
        data: { status: "unvollstaendig", note: fund.reason },
      });
    }
    await prisma.caseFinding.update({
      where: { id: fund.id },
      data: { status: "freigegeben", checklistItemId: bestehend?.id ?? null },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.accepted",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code, resolution: fund.resolution },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

export async function befundVerwerfen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx);
  if (!fund) return;

  await prisma.caseFinding.update({ where: { id: fund.id }, data: { status: "verworfen" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.dismissed",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

/**
 * Unsicherer Abgleich bestaetigt: die vermutete Datei IST die gesuchte Urkunde.
 * Der Befund gilt damit als erledigt.
 */
export async function befundZuordnen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx);
  if (!fund || !fund.matchCandidateId) return;

  await prisma.caseFinding.update({ where: { id: fund.id }, data: { status: "erledigt" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.accepted",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code, zugeordnet: fund.matchCandidateId },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

/**
 * Sammelfreigabe. Ohne sie wird die Freigabe zur Klickstrecke: ein einziger
 * Grundbuchauszug erzeugt schnell vier bis sechs Befunde.
 */
export async function alleBefundeUebernehmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, ...akteSichtbarWhere(ctx) },
    select: { id: true },
  });
  if (!fall) return;

  const offene = await prisma.caseFinding.findMany({
    where: { caseId, status: "offen" },
    select: { id: true },
  });
  for (const f of offene) {
    const fd = new FormData();
    fd.set("findingId", f.id);
    await befundUebernehmen(fd);
  }

  revalidatePath(`/cases/${caseId}`);
}

/** Manueller Anstoss des Abgleichslaufs ("Akte prüfen"). */
/**
 * KI-Nachpruefung fuer EIN Dokument, dessen Verweislauf fehlgeschlagen ist.
 *
 * Bewusst je Dokument statt "alle auf einmal": meist scheitert genau eines
 * (429/Timeout), und der Vermittler soll an der Warnmeldung selbst entscheiden
 * koennen, statt den Umweg ueber "Akte pruefen" zu kennen. Laeuft synchron -
 * ein einzelner KI-Aufruf, der SubmitButton zeigt den Lauf an, und nach der
 * Antwort ist die Warnung entweder weg oder ehrlich noch da.
 */
export async function verweiseNachpruefen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: akteSichtbarWhere(ctx) },
    select: { id: true, caseId: true },
  });
  if (!doc) return;

  await runReferenceExtraction(doc.id);
  // Danach abgleichen: erst der Abgleich macht aus neuen Verweisen Befunde
  // bzw. loest alte, nun belegte Befunde auf.
  await reconcileCase(doc.caseId);
  revalidatePath(`/cases/${doc.caseId}`);
}

/**
 * "Dokument verwerfen" direkt an der Warnung "Verweispruefung nicht moeglich":
 * lehnt das Dokument ab (derselbe Weg wie im Review-Center, inkl. Audit und
 * Tenant-Pruefung in setDocumentReview). Ein abgelehntes Dokument taucht in
 * der Warnliste nicht mehr auf - die Fallseite filtert es heraus.
 */
export async function verweisDokumentVerwerfen(formData: FormData): Promise<void> {
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;
  await setDocumentReview(documentId, "abgelehnt");
}

export async function aktePruefen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, ...akteSichtbarWhere(ctx) },
    select: { id: true },
  });
  if (!fall) return;

  await reconcileCase(caseId);
  revalidatePath(`/cases/${caseId}`);
}
