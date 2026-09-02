import { prisma } from "@/lib/db";
import { BACKOFFICE_FEATURE_KEY } from "@/lib/domain/enums";

/**
 * Feature Flag "backoffice" je Organisation. Ohne Flag gibt es keinen
 * Menuepunkt, keine Seite und keine Action - das Vertriebs-Erlebnis bleibt
 * unveraendert. Ein globaler Eintrag (organizationId null) schaltet alle
 * Organisationen; er ist fuer spaeter gedacht und heute nicht gesetzt.
 */
export async function istBackofficeAktiv(organizationId: string): Promise<boolean> {
  const flags = await prisma.featureFlag.findMany({
    where: {
      key: BACKOFFICE_FEATURE_KEY,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { organizationId: true, enabled: true },
  });
  const eigenes = flags.find((f) => f.organizationId === organizationId);
  if (eigenes) return eigenes.enabled;
  return flags.find((f) => f.organizationId == null)?.enabled ?? false;
}

export async function setzeBackofficeFlag(organizationId: string, enabled: boolean): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { organizationId_key: { organizationId, key: BACKOFFICE_FEATURE_KEY } },
    create: { organizationId, key: BACKOFFICE_FEATURE_KEY, enabled },
    update: { enabled },
  });
}

/**
 * Ist diese Organisation irgendwo als Auftraggeber verknuepft? Dann sehen ihre
 * Nutzer das Auftraggeberportal. Kein Flag noetig: Die Verknuepfung durch
 * das Backoffice IST die Freischaltung.
 */
export async function hatPortalZugang(organizationId: string): Promise<boolean> {
  const n = await prisma.backofficeAuftraggeber.count({ where: { organizationId, aktiv: true } });
  return n > 0;
}
