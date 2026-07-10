"use server";

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { FinLinkConnector } from "@/lib/platforms/connectors";

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
