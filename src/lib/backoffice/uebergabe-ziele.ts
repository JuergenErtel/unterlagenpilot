import { prisma } from "@/lib/db";
import { istBackofficeAktiv } from "./feature";

/**
 * Wohin kann ein Vertriebsfall uebergeben werden? An das eigene Backoffice
 * (wenn freigeschaltet) und an jeden Backoffice-Partner, bei dem diese
 * Organisation als Auftraggeber verknuepft ist (Cross-Org-Uebergabe).
 * Reihenfolge: eigenes zuerst, Partner nach Anlagedatum.
 */
export interface UebergabeZiel {
  /** "intern" fuer das eigene Backoffice, sonst die Auftraggeber-ID beim Partner. */
  schluessel: string;
  name: string;
  intern: boolean;
  auftraggeberId: string | null;
  backofficeOrganizationId: string;
}

export async function ladeUebergabeZiele(organizationId: string): Promise<UebergabeZiel[]> {
  const ziele: UebergabeZiel[] = [];
  if (await istBackofficeAktiv(organizationId)) {
    ziele.push({
      schluessel: "intern",
      name: "Eigenes Backoffice",
      intern: true,
      auftraggeberId: null,
      backofficeOrganizationId: organizationId,
    });
  }
  const partner = await prisma.backofficeAuftraggeber.findMany({
    where: { organizationId, aktiv: true, abrechnungsmodell: { not: "intern" } },
    select: { id: true, backofficeOrganizationId: true, backofficeOrganization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const p of partner) {
    // Partner ohne aktives Backoffice-Flag koennen keine Auftraege bearbeiten.
    if (!(await istBackofficeAktiv(p.backofficeOrganizationId))) continue;
    ziele.push({
      schluessel: p.id,
      name: p.backofficeOrganization.name,
      intern: false,
      auftraggeberId: p.id,
      backofficeOrganizationId: p.backofficeOrganizationId,
    });
  }
  return ziele;
}
