"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FinLinkConnector } from "@/lib/platforms/connectors";
import { getFinLinkClient, FinLinkNotFoundError, FinLinkAuthError } from "@/lib/platforms/finlink/client";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import { fillCaseFromCanonical } from "@/lib/platforms/case-writer";
import { rematchCaseDocuments } from "@/lib/documents/rematch";

export interface FinLinkImportState {
  error?: string;
  /** Bei Erfolg: der angelegte (oder bereits vorhandene) Fall. */
  fall?: { id: string; caseNumber?: string };
}

/**
 * Übernimmt einen FinLink-Vorgang als Fall und MELDET das Ergebnis zurück –
 * bewusst ohne `redirect()`.
 *
 * Am 28.08.2026 hing der Knopf „Importiert …" in der Lead-Liste dauerhaft:
 * Der Fall war nach einer Sekunde angelegt (UP-2026-0030), der Server hatte
 * die Weiterleitung ausgeliefert (303, Zielseite mit 200 abgeholt) – nur
 * übernahm der Browser sie nie. Damit blieb der Ladezustand für immer stehen,
 * denn bei `redirect()` endet er ERST, wenn die Navigation durch ist. Der
 * fertige Fall war unsichtbar und der Knopf ausgegraut: kein Weg vor, keiner
 * zurück, keine Meldung.
 *
 * Die Ursache im Browser liess sich nicht nachstellen (Muster, CSP-Nonce,
 * nachgeladene Chunks, langsame Ausgangsseite und Sentry einzeln geprueft –
 * alle unauffaellig). Deshalb haengt der Ladezustand jetzt nur noch am
 * Abschluss DIESER Funktion, den sie selbst in der Hand hat. Wohin es danach
 * geht, entscheidet der Client (finlink-lead-list.tsx) – und zwar so, dass
 * der Fall auch dann erreichbar bleibt, wenn keine Navigation greift.
 */
export async function importFromFinLink(
  _prev: FinLinkImportState,
  formData: FormData
): Promise<FinLinkImportState> {
  const externalId = String(formData.get("finlinkId") ?? "").trim();
  if (!externalId) return { error: "Bitte eine FinLink-Vorgangs-ID eingeben." };

  const ctx = await requireContext();
  const connector = new FinLinkConnector();
  const res = await connector.importCaseById(externalId, { organizationId: ctx.organizationId, userId: ctx.userId });

  const id = res.importedCaseIds[0];
  if (!res.ok || !id) {
    return { error: res.message || "FinLink-Import fehlgeschlagen." };
  }

  // Die Fallnummer ist nur Beschriftung: Fehlt sie, führt die ID trotzdem hin.
  // Ein Fehler beim Nachschlagen darf den geglückten Import nicht kippen.
  let caseNumber: string | undefined;
  try {
    const angelegt = await prisma.case.findUnique({ where: { id }, select: { caseNumber: true } });
    caseNumber = angelegt?.caseNumber;
  } catch (e) {
    console.error(`[finlink] Fallnummer für ${id} nicht gelesen:`, e);
  }
  return { fall: { id, caseNumber } };
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

    // Der Abgleich kann Antragsteller angelegt haben – bereits hochgeladene
    // Dokumente jetzt neu zuordnen. Best-effort.
    try {
      await rematchCaseDocuments(caseRow.id, { organizationId: ctx.organizationId, userId: ctx.userId });
    } catch (e) {
      console.error("[finlink] Automatische Dokumentzuordnung fehlgeschlagen:", e);
    }

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
