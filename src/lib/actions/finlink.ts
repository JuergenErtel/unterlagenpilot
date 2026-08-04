"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FinLinkConnector } from "@/lib/platforms/connectors";
import { getFinLinkClient, FinLinkNotFoundError, FinLinkAuthError } from "@/lib/platforms/finlink/client";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import { fillCaseFromCanonical } from "@/lib/platforms/case-writer";

export interface FinLinkImportState {
  error?: string;
}

export async function importFromFinLink(
  _prev: FinLinkImportState,
  formData: FormData
): Promise<FinLinkImportState> {
  const externalId = String(formData.get("finlinkId") ?? "").trim();
  if (!externalId) return { error: "Bitte eine FinLink-Vorgangs-ID eingeben." };

  const ctx = await requireContext();
  const connector = new FinLinkConnector();
  const res = await connector.importCaseById(externalId, { organizationId: ctx.organizationId, userId: ctx.userId });

  if (!res.ok || res.importedCaseIds.length === 0) {
    return { error: res.message || "FinLink-Import fehlgeschlagen." };
  }
  redirect(`/cases/${res.importedCaseIds[0]}`);
}

export interface FinLinkRefreshState {
  error?: string;
  success?: string;
}

/**
 * „Aus FinLink aktualisieren“: zieht die aktuellen Lead-/Antragsdaten in einen
 * bestehenden Fall nach. Füllt ausschließlich leere Felder und legt fehlende
 * Antragsteller an – vorhandene Werte bleiben unangetastet.
 */
export async function refreshFromFinLink(
  caseId: string,
  _prev: FinLinkRefreshState,
  _formData: FormData
): Promise<FinLinkRefreshState> {
  const ctx = await requireContext();
  const caseRow = await prisma.case.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true, finlinkId: true },
  });
  if (!caseRow) return { error: "Fall nicht gefunden." };
  if (!caseRow.finlinkId) return { error: "Dieser Fall ist nicht mit FinLink verknüpft." };

  const client = getFinLinkClient();
  if (!client) return { error: "FinLink ist nicht konfiguriert (FINLINK_API_KEY fehlt)." };

  try {
    const dto = await client.fetchVorgang(caseRow.finlinkId);
    const canonical = finlinkToCanonical(dto);
    const result = await fillCaseFromCanonical(caseRow.id, canonical);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "case.updated",
      entityType: "case",
      entityId: caseRow.id,
      metadata: {
        source: "finlink_refresh",
        filledFields: result.filledFields,
        createdApplicants: result.createdApplicants,
      },
    });
    revalidatePath(`/cases/${caseRow.id}`);

    if (result.filledFields.length === 0 && result.createdApplicants === 0) {
      return { success: "Alles aktuell – FinLink hat keine neuen Angaben." };
    }
    const teile: string[] = [];
    if (result.createdApplicants > 0)
      teile.push(`${result.createdApplicants} Antragsteller neu angelegt`);
    if (result.filledFields.length > 0)
      teile.push(`${result.filledFields.length} Feld${result.filledFields.length === 1 ? "" : "er"} ergänzt`);
    return { success: `Übernommen: ${teile.join(", ")}. Bestehende Werte blieben unverändert.` };
  } catch (e) {
    if (e instanceof FinLinkNotFoundError) return { error: "FinLink-Vorgang nicht mehr gefunden." };
    if (e instanceof FinLinkAuthError) return { error: "FinLink-Zugang abgelehnt. Bitte API-Key prüfen." };
    console.error(`[finlink] Aktualisieren fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return { error: "Aktualisierung fehlgeschlagen. Bitte später erneut versuchen." };
  }
}
