"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { requireAkteAccess } from "@/lib/auth/akte-zugriff";
import { ordneEingangZu, verwirfEingang, type ZuordnungErgebnis } from "@/lib/eingang/service";

/**
 * Zuordnen und Verwerfen im Posteingang.
 *
 * Der Zugriff auf den ZIELFALL geht ueber den zentralen Guard - nicht ueber
 * die Fallliste, die der Bildschirm anbietet. Eine mitgeschickte Fall-Id ist
 * eine Behauptung des Browsers, keine Erlaubnis.
 */

export async function ordneEingangZuAction(
  eingangId: string,
  caseId: string
): Promise<ZuordnungErgebnis> {
  if (!eingangId || !caseId) return { ok: false, grund: "Bitte einen Fall auswählen." };
  const { ctx, akte } = await requireAkteAccess(caseId, { schreibend: true });

  const ergebnis = await ordneEingangZu({
    eingangId,
    caseId,
    caseOrganizationId: akte.organizationId,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });

  if (ergebnis.ok) {
    revalidatePath("/eingang");
    // Die Akte zeigt das neue Dokument sofort, ohne dass jemand neu laedt.
    revalidatePath(`/cases/${caseId}`, "layout");
  }
  return ergebnis;
}

export async function verwirfEingangAction(eingangId: string): Promise<ZuordnungErgebnis> {
  const ctx = await requireContext();
  const ergebnis = await verwirfEingang({
    eingangId,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });
  if (ergebnis.ok) revalidatePath("/eingang");
  return ergebnis;
}
