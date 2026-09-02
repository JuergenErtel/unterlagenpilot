import { prisma } from "@/lib/db";
import { getCurrentContext, type AppContext } from "@/lib/auth/context";
import type { UserRole } from "@/lib/domain/enums";
import { darfPortalAuftragSehen } from "./sichtbarkeit";

/**
 * Zugriffspruefung fuer die Portal-API-Routen. Anders als requirePortalAuftrag
 * wirft sie nicht (notFound ist in Route Handlern kein Mittel), sondern
 * antwortet mit einem Statuscode, den die Route zurueckgibt. Dieselbe Regel:
 * der Auftrag gehoert einem Auftraggeber, dessen verknuepfte Organisation
 * die des Nutzers ist, und der Nutzer darf ihn laut Kontaktbindung sehen.
 */
export async function ladePortalAuftragFuerRoute(auftragId: string): Promise<
  | { status: 401 | 404 }
  | {
      status: 200;
      ctx: AppContext;
      auftrag: { id: string; caseId: string; backofficeOrganizationId: string; auftragsnummer: string; uebergebenAm: Date | null; leistungen: string[] };
    }
> {
  const ctx = await getCurrentContext();
  if (!ctx) return { status: 401 };
  const auftrag = await prisma.backofficeAuftrag.findUnique({
    where: { id: auftragId },
    select: {
      id: true,
      caseId: true,
      backofficeOrganizationId: true,
      auftragsnummer: true,
      uebergebenAm: true,
      leistungen: true,
      kontaktId: true,
      auftraggeber: {
        select: {
          organizationId: true,
          aktiv: true,
          kontakte: { select: { id: true, userId: true, darfAlleAuftraegeSehen: true, aktiv: true } },
        },
      },
    },
  });
  if (!auftrag || !auftrag.auftraggeber.aktiv) return { status: 404 };
  const sichtbar = darfPortalAuftragSehen(
    { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role as UserRole },
    { organizationId: auftrag.auftraggeber.organizationId, kontakte: auftrag.auftraggeber.kontakte },
    auftrag.kontaktId
  );
  if (!sichtbar) return { status: 404 };
  return {
    status: 200,
    ctx,
    auftrag: {
      id: auftrag.id,
      caseId: auftrag.caseId,
      backofficeOrganizationId: auftrag.backofficeOrganizationId,
      auftragsnummer: auftrag.auftragsnummer,
      uebergebenAm: auftrag.uebergebenAm,
      leistungen: auftrag.leistungen,
    },
  };
}
