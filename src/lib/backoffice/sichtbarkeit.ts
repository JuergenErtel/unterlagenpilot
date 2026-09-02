import type { BackofficeRolle, UserRole } from "@/lib/domain/enums";

/**
 * Wer sieht welchen Auftrag - als reine Regeln, damit Queue, Zugriffsschutz
 * und Tests dieselbe Antwort geben.
 */

export interface AuftragSichtbarkeit {
  backofficeOrganizationId: string;
  bearbeiterId: string | null;
}

export interface BackofficeNutzer {
  userId: string;
  organizationId: string;
  backofficeRolle: BackofficeRolle | null;
}

/**
 * Backoffice-Seite: Manager und Pruefer sehen alle Auftraege ihrer
 * Organisation. Ein Bearbeiter sieht die eigenen und die noch nicht
 * zugewiesenen - letztere, damit er sie uebernehmen kann.
 */
export function darfAuftragSehen(nutzer: BackofficeNutzer, auftrag: AuftragSichtbarkeit): boolean {
  if (!nutzer.backofficeRolle) return false;
  if (auftrag.backofficeOrganizationId !== nutzer.organizationId) return false;
  if (nutzer.backofficeRolle === "bearbeiter") {
    return auftrag.bearbeiterId == null || auftrag.bearbeiterId === nutzer.userId;
  }
  return true;
}

/** Prisma-Where fuer die Queue, passend zu `darfAuftragSehen`. */
export function sichtbarkeitsFilter(nutzer: BackofficeNutzer): {
  backofficeOrganizationId: string;
  OR?: Array<{ bearbeiterId: string | null }>;
} {
  const basis = { backofficeOrganizationId: nutzer.organizationId };
  if (nutzer.backofficeRolle === "bearbeiter") {
    return { ...basis, OR: [{ bearbeiterId: null }, { bearbeiterId: nutzer.userId }] };
  }
  return basis;
}

export interface PortalNutzer {
  userId: string;
  organizationId: string;
  role: UserRole;
}

export interface PortalAuftraggeber {
  /** BaufiDesk-Organisation, die als Auftraggeber verknuepft ist. */
  organizationId: string | null;
  kontakte: Array<{ id: string; userId: string | null; darfAlleAuftraegeSehen: boolean; aktiv: boolean }>;
}

/** Auftraggeber-Admin: Organisationsadmin oder White-Label-Admin. */
export function istAuftraggeberAdmin(role: UserRole): boolean {
  return role === "org_admin" || role === "white_label_admin";
}

/**
 * Portal-Seite: Der Auftrag gehoert einem Auftraggeber, dessen verknuepfte
 * Organisation die des Nutzers ist. Admins sehen alles, Mitarbeiter nur,
 * wenn ihr Kontakt "alle" darf oder der Auftrag an ihrem Kontakt haengt.
 */
export function darfPortalAuftragSehen(
  nutzer: PortalNutzer,
  auftraggeber: PortalAuftraggeber,
  auftragKontaktId: string | null
): boolean {
  if (!auftraggeber.organizationId || auftraggeber.organizationId !== nutzer.organizationId) return false;
  if (istAuftraggeberAdmin(nutzer.role)) return true;
  const eigene = auftraggeber.kontakte.filter((k) => k.aktiv && k.userId === nutzer.userId);
  if (eigene.length === 0) return false;
  if (eigene.some((k) => k.darfAlleAuftraegeSehen)) return true;
  return auftragKontaktId != null && eigene.some((k) => k.id === auftragKontaktId);
}
