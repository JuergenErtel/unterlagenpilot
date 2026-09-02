import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentContext, requireContext, type AppContext } from "@/lib/auth/context";
import type { BackofficeRolle, UserRole } from "@/lib/domain/enums";
import { hatPortalZugang, istBackofficeAktiv } from "./feature";
import { darfAuftragSehen, darfPortalAuftragSehen, istAuftraggeberAdmin, sichtbarkeitsFilter } from "./sichtbarkeit";
import type { Bereiche } from "./bereich";

/**
 * Zugriffsschutz des Backoffice-Produkts. Jede Seite und jede Server Action
 * beginnt mit einem dieser Helfer - nicht mit requireContext allein, denn
 * der weiss nichts vom Feature Flag und nichts von der Backoffice-Rolle.
 *
 * Antworten sind 404, nie 403: Wer keinen Zugang hat, erfaehrt nicht, dass es
 * den Bereich gibt (dieselbe Regel wie beim Plattform-Admin).
 */

export interface BackofficeKontext extends AppContext {
  backofficeRolle: BackofficeRolle;
}

export async function requireBackoffice(): Promise<BackofficeKontext> {
  const ctx = await requireContext();
  if (!ctx.backofficeRolle) notFound();
  if (!(await istBackofficeAktiv(ctx.organizationId))) notFound();
  return { ...ctx, backofficeRolle: ctx.backofficeRolle! };
}

/** Wie requireBackoffice, verlangt aber die Manager-Rolle. */
export async function requireBackofficeManager(): Promise<BackofficeKontext> {
  const ctx = await requireBackoffice();
  if (ctx.backofficeRolle !== "manager") notFound();
  return ctx;
}

const AUFTRAG_KERN = {
  id: true,
  backofficeOrganizationId: true,
  auftragsnummer: true,
  auftraggeberId: true,
  kontaktId: true,
  caseId: true,
  aktenbezeichnung: true,
  auftragsart: true,
  leistungen: true,
  prioritaet: true,
  eingangAm: true,
  faelligAm: true,
  quelle: true,
  referenzExtern: true,
  status: true,
  statusSeit: true,
  wartegrund: true,
  pausiertSeit: true,
  pausiertGrund: true,
  bearbeiterId: true,
  prueferId: true,
  erstelltVonId: true,
  hinweiseAuftraggeber: true,
  interneNotizen: true,
  ergebnisText: true,
  qualitaetFreigegebenAm: true,
  qualitaetFreigegebenVonId: true,
  qualitaetBegruendung: true,
  uebergebenAm: true,
  abgenommenAm: true,
  abnahmeKommentar: true,
  abrechnungsstatus: true,
  feedbackBewertung: true,
  feedbackText: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AuftragKern = {
  [K in keyof typeof AUFTRAG_KERN]: NonNullable<
    Awaited<ReturnType<typeof prisma.backofficeAuftrag.findUnique>>
  >[K];
};

/**
 * Laedt einen Auftrag NUR, wenn er zur Organisation des Kontextes gehoert und
 * fuer die Rolle sichtbar ist. Bearbeiter sehen fremd zugewiesene Auftraege
 * nicht - auch nicht per direkter URL.
 */
export async function requireBackofficeAuftrag(auftragId: string): Promise<{ ctx: BackofficeKontext; auftrag: AuftragKern }> {
  const ctx = await requireBackoffice();
  const auftrag = await prisma.backofficeAuftrag.findUnique({ where: { id: auftragId }, select: AUFTRAG_KERN });
  if (!auftrag || !darfAuftragSehen(ctx, auftrag)) notFound();
  return { ctx, auftrag: auftrag! };
}

/** Prisma-Where fuer alle Auftraege, die der Kontext sehen darf. */
export function auftraegeFilterFuer(ctx: BackofficeKontext) {
  return sichtbarkeitsFilter(ctx);
}

// ---------------------------------------------------------------------------
// Auftraggeberportal
// ---------------------------------------------------------------------------

export interface PortalKontext extends AppContext {
  /** Alle Auftraggeber-Datensaetze, die auf die Organisation des Nutzers zeigen
   *  (je Backoffice-Partner einer). */
  auftraggeber: Array<{
    id: string;
    name: string;
    backofficeOrganizationId: string;
    backofficeName: string;
    abrechnungsmodell: string;
    kontingentMonatlich: number | null;
    carryOverMax: number;
    antragstellerKontaktErlaubt: boolean;
    kontakte: Array<{ id: string; userId: string | null; darfAlleAuftraegeSehen: boolean; aktiv: boolean; name: string; email: string | null }>;
  }>;
  istAdmin: boolean;
}

export async function requirePortal(): Promise<PortalKontext> {
  const ctx = await requireContext();
  const auftraggeber = await prisma.backofficeAuftraggeber.findMany({
    where: { organizationId: ctx.organizationId, aktiv: true },
    select: {
      id: true,
      name: true,
      backofficeOrganizationId: true,
      backofficeOrganization: { select: { name: true } },
      abrechnungsmodell: true,
      kontingentMonatlich: true,
      carryOverMax: true,
      antragstellerKontaktErlaubt: true,
      kontakte: { select: { id: true, userId: true, darfAlleAuftraegeSehen: true, aktiv: true, name: true, email: true } },
    },
    orderBy: { name: "asc" },
  });
  if (auftraggeber.length === 0) notFound();
  const istAdmin = istAuftraggeberAdmin(ctx.role);
  // Mitarbeiter ohne Kontakt-Bindung sehen nichts - und damit auch das
  // Portal nicht.
  const gebunden = auftraggeber.some((a) => a.kontakte.some((k) => k.aktiv && k.userId === ctx.userId));
  if (!istAdmin && !gebunden) notFound();
  return {
    ...ctx,
    istAdmin,
    auftraggeber: auftraggeber.map((a) => ({
      id: a.id,
      name: a.name,
      backofficeOrganizationId: a.backofficeOrganizationId,
      backofficeName: a.backofficeOrganization.name,
      abrechnungsmodell: a.abrechnungsmodell,
      kontingentMonatlich: a.kontingentMonatlich,
      carryOverMax: a.carryOverMax,
      antragstellerKontaktErlaubt: a.antragstellerKontaktErlaubt,
      kontakte: a.kontakte,
    })),
  };
}

/**
 * Prisma-Where fuer die Auftraege, die dieser Portal-Nutzer sehen darf.
 * Spiegelt darfPortalAuftragSehen als Abfrage.
 */
export function portalAuftraegeFilter(ctx: PortalKontext) {
  if (ctx.istAdmin) return { auftraggeberId: { in: ctx.auftraggeber.map((a) => a.id) } };
  const alle: string[] = [];
  const kontaktIds: string[] = [];
  for (const a of ctx.auftraggeber) {
    const eigene = a.kontakte.filter((k) => k.aktiv && k.userId === ctx.userId);
    if (eigene.some((k) => k.darfAlleAuftraegeSehen)) alle.push(a.id);
    for (const k of eigene) kontaktIds.push(k.id);
  }
  return { OR: [{ auftraggeberId: { in: alle } }, { kontaktId: { in: kontaktIds } }] };
}

export async function requirePortalAuftrag(auftragId: string): Promise<{ ctx: PortalKontext; auftrag: AuftragKern }> {
  const ctx = await requirePortal();
  const auftrag = await prisma.backofficeAuftrag.findUnique({ where: { id: auftragId }, select: AUFTRAG_KERN });
  if (!auftrag) notFound();
  const ag = ctx.auftraggeber.find((a) => a.id === auftrag!.auftraggeberId);
  if (!ag) notFound();
  const sichtbar = darfPortalAuftragSehen(
    { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role as UserRole },
    { organizationId: ctx.organizationId, kontakte: ag!.kontakte },
    auftrag!.kontaktId
  );
  if (!sichtbar) notFound();
  return { ctx, auftrag: auftrag! };
}

// ---------------------------------------------------------------------------
// Arbeitsbereiche (fuer Navigation und Umschalter)
// ---------------------------------------------------------------------------

export type { Bereich, Bereiche } from "./bereich";
export { bereichAusPfad } from "./bereich";

/** Welche Produkte dieser Nutzer sieht. Vertrieb hat jeder Organisationsnutzer. */
export async function ladeBereiche(ctx: AppContext): Promise<Bereiche> {
  const [flag, portal] = await Promise.all([
    ctx.backofficeRolle ? istBackofficeAktiv(ctx.organizationId) : Promise.resolve(false),
    hatPortalZugang(ctx.organizationId),
  ]);
  let portalSichtbar = portal;
  if (portal && !istAuftraggeberAdmin(ctx.role as UserRole)) {
    const n = await prisma.backofficeAuftraggeberKontakt.count({
      where: { userId: ctx.userId, aktiv: true, auftraggeber: { organizationId: ctx.organizationId, aktiv: true } },
    });
    portalSichtbar = n > 0;
  }
  return { vertrieb: true, backoffice: Boolean(ctx.backofficeRolle) && flag, portal: portalSichtbar };
}

/** Fuer Seiten, die nur den Kontext brauchen, aber nie umleiten sollen. */
export async function optionalerKontext(): Promise<AppContext | null> {
  return getCurrentContext();
}

/** Leitet Nutzer ohne Backoffice-Zugang still zum Dashboard, statt 404. */
export async function backofficeOderDashboard(): Promise<BackofficeKontext> {
  const ctx = await requireContext();
  if (!ctx.backofficeRolle || !(await istBackofficeAktiv(ctx.organizationId))) redirect("/dashboard");
  return { ...ctx, backofficeRolle: ctx.backofficeRolle! };
}
