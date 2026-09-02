import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildChecklistForCase, type ExistingDocument } from "@/lib/checklists/engine";
import { checklistEingabeFuerFall } from "@/lib/checklists/case-input";
import type { BackofficePrioritaet, BackofficeStatus, DocumentType } from "@/lib/domain/enums";
import type { AuftragFuerQueue } from "./queue";

/**
 * Lader fuer Queue und Dashboard des Backoffice. Rechnet je Auftrag die drei
 * Zahlen, die der Bearbeiter zuerst sieht: fehlende Unterlagen, ungepruefte
 * Dokumente, offene Rueckfragen. Die Soll-Liste kommt aus der Checklisten-
 * Engine (rein) - ohne KI-Plausibilitaet und ohne Europace-Abruf, die der
 * volle Fall-Aggregator zusaetzlich laedt. Das haelt die Queue bei 200
 * Auftraegen unter einer Sekunde.
 */

const MAX_AUFTRAEGE = 300;

const QUEUE_INCLUDE = {
  auftraggeber: { select: { name: true, kurzname: true } },
  bearbeiter: { select: { name: true } },
  case: {
    select: {
      id: true,
      caseNumber: true,
      financingType: true,
      primaryEmploymentType: true,
      kapitalanlage: true,
      property: { select: { objektart: true, nutzung: true } },
      applicants: {
        select: { id: true, position: true, employment: { select: { beschaeftigungsart: true } } },
      },
      documents: {
        select: {
          documentType: true,
          reviewStatus: true,
          readable: true,
          period: true,
          applicantId: true,
          classificationStatus: true,
        },
      },
    },
  },
  _count: {
    select: {
      rueckfragen: { where: { status: "offen" as const } },
    },
  },
  rueckfragen: { where: { status: "beantwortet" as const }, select: { id: true } },
} satisfies Prisma.BackofficeAuftragInclude;

type QueueRow = Prisma.BackofficeAuftragGetPayload<{ include: typeof QUEUE_INCLUDE }>;

function ageFromPeriod(period: string | null): number | null {
  if (!period) return null;
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Math.round((Date.now() - d.getTime()) / 86_400_000);
}

/** Offene Positionen der Soll-Liste einer Akte - dieselbe Engine wie der Arbeitsplatz. */
export function zaehleFehlendeUnterlagen(fall: QueueRow["case"]): number {
  const existing: ExistingDocument[] = fall.documents.map((d) => ({
    documentType: d.documentType as DocumentType | null,
    reviewStatus: d.reviewStatus,
    readable: d.readable,
    ageDays: ageFromPeriod(d.period),
    applicantId: d.applicantId,
  }));
  const liste = buildChecklistForCase(checklistEingabeFuerFall(fall), existing);
  return liste.filter((i) => i.status === "offen" || i.status === "unvollstaendig" || i.status === "nicht_aktuell").length;
}

export interface AuftragZeile extends AuftragFuerQueue {
  caseId: string;
  caseNumber: string;
  kontaktId: string | null;
  wartegrund: string | null;
  quelle: string;
  leistungen: string[];
  statusSeit: Date;
}

export function zuZeile(a: QueueRow): AuftragZeile {
  return {
    id: a.id,
    auftragsnummer: a.auftragsnummer,
    aktenbezeichnung: a.aktenbezeichnung,
    auftraggeberId: a.auftraggeberId,
    auftraggeberName: a.auftraggeber.kurzname ?? a.auftraggeber.name,
    auftragsart: a.auftragsart,
    status: a.status as BackofficeStatus,
    prioritaet: a.prioritaet as BackofficePrioritaet,
    eingangAm: a.eingangAm,
    faelligAm: a.faelligAm,
    pausiertSeit: a.pausiertSeit,
    bearbeiterId: a.bearbeiterId,
    bearbeiterName: a.bearbeiter?.name ?? null,
    uebergebenAm: a.uebergebenAm,
    updatedAt: a.updatedAt,
    fehlendeUnterlagen: zaehleFehlendeUnterlagen(a.case),
    ungepruefteDokumente: a.case.documents.filter((d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig").length,
    offeneRueckfragen: a._count.rueckfragen,
    beantworteteRueckfragen: a.rueckfragen.length,
    caseId: a.case.id,
    caseNumber: a.case.caseNumber,
    kontaktId: a.kontaktId,
    wartegrund: a.wartegrund,
    quelle: a.quelle,
    leistungen: a.leistungen,
    statusSeit: a.statusSeit,
  };
}

/**
 * Alle Auftraege zu einem Where - der Aufrufer liefert den Sichtbarkeits-
 * filter (auftraegeFilterFuer / portalAuftraegeFilter). Ohne Filter laedt
 * diese Funktion nichts: Ein leeres Where waere ein mandantenuebergreifender
 * Vollzugriff.
 */
export async function ladeAuftragZeilen(where: Prisma.BackofficeAuftragWhereInput): Promise<AuftragZeile[]> {
  if (Object.keys(where).length === 0) throw new Error("ladeAuftragZeilen: Where fehlt.");
  const rows = await prisma.backofficeAuftrag.findMany({
    where,
    include: QUEUE_INCLUDE,
    orderBy: [{ faelligAm: "asc" }, { eingangAm: "asc" }],
    take: MAX_AUFTRAEGE,
  });
  return rows.map(zuZeile);
}

/** Teammitglieder mit Backoffice-Rolle einer Organisation - fuer Zuweisungen. */
export async function ladeBackofficeTeam(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, active: true, backofficeRolle: { not: null } },
    select: { id: true, name: true, email: true, backofficeRolle: true, role: true },
    orderBy: { name: "asc" },
  });
}

/** Auftraggeber einer Backoffice-Organisation (fuer Filter und Anlage). */
export async function ladeAuftraggeberListe(backofficeOrganizationId: string) {
  return prisma.backofficeAuftraggeber.findMany({
    where: { backofficeOrganizationId },
    select: {
      id: true,
      name: true,
      kurzname: true,
      email: true,
      phone: true,
      city: true,
      aktiv: true,
      abrechnungsmodell: true,
      kontingentMonatlich: true,
      slaTage: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
      kontakte: { where: { aktiv: true }, select: { id: true, name: true, email: true, userId: true, darfAlleAuftraegeSehen: true } },
      _count: { select: { auftraege: true } },
    },
    orderBy: [{ aktiv: "desc" }, { name: "asc" }],
  });
}

/** Verlauf eines Auftrags. `nurExtern` liefert die Portal-Sicht. */
export async function ladeVerlauf(auftragId: string, nurExtern: boolean) {
  return prisma.backofficeAuftragEreignis.findMany({
    where: { auftragId, ...(nurExtern ? { sichtbarFuerAuftraggeber: true } : {}) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function ladeRueckfragen(auftragId: string, nurSichtbar: boolean) {
  return prisma.backofficeRueckfrage.findMany({
    where: { auftragId, ...(nurSichtbar ? { status: { not: "entwurf" } } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
