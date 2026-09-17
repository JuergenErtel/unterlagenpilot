import { prisma } from "@/lib/db";
import { BACKOFFICE_FEATURE_KEY, VERTRIEB_FEATURE_KEY } from "@/lib/domain/enums";

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

/**
 * Ist der Vertrieb (das CRM) fuer diese Organisation eingeschaltet?
 *
 * Spiegelbild zu istBackofficeAktiv - mit UMGEKEHRTER Vorgabe: ohne Eintrag
 * ist der Vertrieb AN. Bis zum 17.09.2026 war er fest verdrahtet fuer jeden
 * da, und eine Vorgabe "aus" wuerde jedem Bestandskunden ueber Nacht sein
 * Produkt wegnehmen.
 *
 * Ausgeschaltet wird er nur fuer Kunden, die BaufiDesk ausschliesslich als
 * Unterlagensortierer nutzen. Fuer sie IST der Sortierer das Produkt - sie
 * sollen keine Fallakte sehen muessen, um an ihr Werkzeug zu kommen.
 */
export async function istVertriebAktiv(organizationId: string): Promise<boolean> {
  const flags = await prisma.featureFlag.findMany({
    where: {
      key: VERTRIEB_FEATURE_KEY,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { organizationId: true, enabled: true },
  });
  const eigenes = flags.find((f) => f.organizationId === organizationId);
  if (eigenes) return eigenes.enabled;
  return flags.find((f) => f.organizationId == null)?.enabled ?? true;
}

export async function setzeVertriebFlag(organizationId: string, enabled: boolean): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { organizationId_key: { organizationId, key: VERTRIEB_FEATURE_KEY } },
    create: { organizationId, key: VERTRIEB_FEATURE_KEY, enabled },
    update: { enabled },
  });
}
