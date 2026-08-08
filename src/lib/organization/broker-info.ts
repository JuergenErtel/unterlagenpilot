import { prisma } from "@/lib/db";
import type { BrokerInfo } from "@/lib/pdf/renderer";

/**
 * Absenderdaten einer Organisation – Grundlage jeder Signatur und jedes
 * PDF-Briefkopfs.
 *
 * Eigenes, schlankes Modul (und nicht mehr Teil von `case-pdf`), damit auch
 * der Erstkontakt sie nutzen kann, ohne den ganzen PDF- und KI-Baum in den
 * Cron-Pfad zu ziehen.
 */
export async function getBrokerInfo(organizationId: string): Promise<BrokerInfo> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, street: true, zip: true, city: true, website: true },
  });
  return {
    name: org?.name ?? "BaufiDesk",
    street: org?.street ?? undefined,
    zip: org?.zip ?? undefined,
    city: org?.city ?? undefined,
    website: org?.website ?? undefined,
  };
}
