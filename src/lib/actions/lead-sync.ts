"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { syncFinLinkLeads, type SyncErgebnis } from "@/lib/platforms/finlink/sync";

/** „Jetzt abgleichen" – derselbe Lauf wie der Cron, nur von Hand ausgelöst. */
export async function gleicheLeadsAb(): Promise<SyncErgebnis> {
  const ctx = await requireContext();
  const ergebnis = await syncFinLinkLeads({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  revalidatePath("/dashboard");
  return ergebnis;
}
