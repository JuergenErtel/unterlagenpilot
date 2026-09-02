import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  akteSichtbarWhere,
  darfBackofficeAkteBearbeiten,
  darfBackofficeAkteSehen,
  getCurrentContext,
  requireContext,
  type AppContext,
} from "@/lib/auth/context";
import type { AkteArt, CaseStatus } from "@/lib/domain/enums";

/**
 * Der zentrale Zugriffsschutz fuer Dokumente und Akten - eine Regel, an
 * allen Stellen dieselbe Antwort.
 *
 * Die Kenntnis einer Dokument-ID reicht fuer nichts. Jede Antwort haengt an:
 *   1. angemeldetem Nutzer (requireContext),
 *   2. Organisation der Akte,
 *   3. Aktenart: Vertriebsakten sieht jeder Nutzer der Organisation,
 *      Backoffice-Akten nur, wer eine Backoffice-Rolle hat - Bearbeiter nur
 *      mit eigenem oder freiem Auftrag (akteSichtbarWhere / darfBackofficeAkteSehen),
 *   4. bei schreibendem Zugriff auf eine Backoffice-Akte: ein noch nicht
 *      abgeschlossener Auftrag.
 *
 * Alle Verweigerungen antworten mit 404 (notFound), nie mit 403: Wer nicht
 * darf, erfaehrt nicht, dass es das Dokument gibt. Fehlversuche landen ohne
 * Inhalt im Audit-Log (nur IDs), damit ein Rateversuch auffaellt.
 *
 * Route Handler koennen notFound() nicht werfen; fuer sie gibt es die
 * `...FuerRoute`-Varianten mit Statuscode statt Wurf.
 */

export interface DokumentZugriff {
  ctx: AppContext;
  dokument: { id: string; caseId: string; organizationId: string; akteArt: AkteArt; caseStatus: CaseStatus };
}

export interface AkteZugriff {
  ctx: AppContext;
  akte: { id: string; organizationId: string; akteArt: AkteArt; status: CaseStatus; caseNumber: string };
}

export interface ZugriffOptionen {
  /** Mutation: Backoffice-Akten nur mit offenem Auftrag. */
  schreibend?: boolean;
}

async function verweigert(ctx: AppContext | null, art: "dokument" | "akte", id: string, schreibend: boolean): Promise<never> {
  // Nur IDs und die Art des Versuchs - kein Name, kein Inhalt, kein Pfad.
  if (ctx) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "access.denied",
      entityType: art,
      entityId: id,
      metadata: { schreibend },
    }).catch(() => undefined);
  }
  notFound();
}

/**
 * Laedt ein Dokument NUR, wenn der Kontext es sehen darf. Liefert die
 * Aktenzugehoerigkeit, damit der Aufrufer sein eigenes select ohne zweiten
 * Zugriffsschutz nachladen kann.
 */
export async function requireDocumentAccess(documentId: string, optionen: ZugriffOptionen = {}): Promise<DokumentZugriff> {
  const ctx = await requireContext();
  const doc = documentId
    ? await prisma.document.findFirst({
        where: { id: documentId, case: akteSichtbarWhere(ctx) },
        select: { id: true, caseId: true, case: { select: { organizationId: true, akteArt: true, status: true } } },
      })
    : null;
  if (!doc) return verweigert(ctx, "dokument", documentId, Boolean(optionen.schreibend));
  if (optionen.schreibend && doc.case.akteArt === "backoffice" && !(await darfBackofficeAkteBearbeiten(ctx, doc.caseId))) {
    return verweigert(ctx, "dokument", documentId, true);
  }
  return {
    ctx,
    dokument: {
      id: doc.id,
      caseId: doc.caseId,
      organizationId: doc.case.organizationId,
      akteArt: doc.case.akteArt as AkteArt,
      caseStatus: doc.case.status as CaseStatus,
    },
  };
}

/**
 * Wie requireCaseAccess, mit Schreibpruefung fuer Backoffice-Akten und
 * Audit des Fehlversuchs. Fuer Aktionen, die eine ganze Akte veraendern.
 */
export async function requireAkteAccess(caseId: string, optionen: ZugriffOptionen = {}): Promise<AkteZugriff> {
  const ctx = await requireContext();
  const akte = caseId
    ? await prisma.case.findFirst({
        where: { id: caseId, ...akteSichtbarWhere(ctx) },
        select: { id: true, organizationId: true, akteArt: true, status: true, caseNumber: true },
      })
    : null;
  if (!akte) return verweigert(ctx, "akte", caseId, Boolean(optionen.schreibend));
  if (optionen.schreibend && akte.akteArt === "backoffice" && !(await darfBackofficeAkteBearbeiten(ctx, akte.id))) {
    return verweigert(ctx, "akte", caseId, true);
  }
  return {
    ctx,
    akte: { id: akte.id, organizationId: akte.organizationId, akteArt: akte.akteArt as AkteArt, status: akte.status as CaseStatus, caseNumber: akte.caseNumber },
  };
}

export type RouteZugriff<T> = { status: 401 } | { status: 404 } | ({ status: 200 } & T);

/** Aktenzugriff fuer Route Handler: Statuscode statt notFound(). */
export async function ladeAkteFuerRoute(caseId: string): Promise<RouteZugriff<AkteZugriff>> {
  const ctx = await getCurrentContext();
  if (!ctx) return { status: 401 };
  const akte = await prisma.case.findFirst({
    where: { id: caseId, ...akteSichtbarWhere(ctx) },
    select: { id: true, organizationId: true, akteArt: true, status: true, caseNumber: true },
  });
  if (!akte) {
    await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "access.denied", entityType: "akte", entityId: caseId, metadata: { schreibend: false } }).catch(() => undefined);
    return { status: 404 };
  }
  return {
    status: 200,
    ctx,
    akte: { id: akte.id, organizationId: akte.organizationId, akteArt: akte.akteArt as AkteArt, status: akte.status as CaseStatus, caseNumber: akte.caseNumber },
  };
}

/** Dokumentzugriff fuer Route Handler: Statuscode statt notFound(). */
export async function ladeDokumentFuerRoute(documentId: string): Promise<RouteZugriff<DokumentZugriff>> {
  const ctx = await getCurrentContext();
  if (!ctx) return { status: 401 };
  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: akteSichtbarWhere(ctx) },
    select: { id: true, caseId: true, case: { select: { organizationId: true, akteArt: true, status: true } } },
  });
  if (!doc) {
    await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "access.denied", entityType: "dokument", entityId: documentId, metadata: { schreibend: false } }).catch(() => undefined);
    return { status: 404 };
  }
  return {
    status: 200,
    ctx,
    dokument: { id: doc.id, caseId: doc.caseId, organizationId: doc.case.organizationId, akteArt: doc.case.akteArt as AkteArt, caseStatus: doc.case.status as CaseStatus },
  };
}

// Re-Export, damit Aufrufer eine einzige Importquelle haben.
export { akteSichtbarWhere, darfBackofficeAkteSehen, darfBackofficeAkteBearbeiten };
