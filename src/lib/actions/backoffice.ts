"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext, roleAtLeast } from "@/lib/auth/context";
import { istBackofficeAktiv } from "@/lib/backoffice/feature";
import { requireBackofficeAuftrag, requireBackofficeManager } from "@/lib/backoffice/zugriff";
import {
  erzeugeAuftrag,
  gibQualitaetFrei,
  gibZurNachbearbeitung,
  pausiere,
  setzeFort,
  setzePrioritaetUndFrist,
  stelleRueckfrage,
  uebergib,
  uebernehmeAuftrag,
  wechsleStatus,
  weiseZu,
  type ServiceErgebnis,
} from "@/lib/backoffice/service";
import { periodeVon } from "@/lib/backoffice/sla";
import {
  BACKOFFICE_ABRECHNUNGSMODELLE,
  BACKOFFICE_PRIORITAETEN,
  BACKOFFICE_ROLLEN,
  BACKOFFICE_STATUS,
  EMPLOYMENT_TYPES,
  FINANCING_TYPES,
  type BackofficeAbrechnungsmodell,
  type BackofficePrioritaet,
  type BackofficeRolle,
  type BackofficeStatus,
  type EmploymentType,
  type FinancingType,
} from "@/lib/domain/enums";

/**
 * Server Actions des internen Backoffice. Jede beginnt mit requireBackoffice
 * (Flag + Rolle) und endet mit einer Revalidierung der betroffenen Seiten.
 * Die Fachlogik liegt in src/lib/backoffice/service.ts.
 */

export interface AktionsErgebnis {
  error?: string;
  ok?: boolean;
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optional(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  return v ? v : null;
}

function enumWert<T extends string>(werte: readonly T[], v: string | null): T | null {
  return v && (werte as readonly string[]).includes(v) ? (v as T) : null;
}

function datum(fd: FormData, key: string): Date | null {
  const v = text(fd, key);
  if (!v) return null;
  const d = new Date(`${v}T17:00:00+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ausErgebnis(e: ServiceErgebnis<unknown>): AktionsErgebnis {
  return e.ok ? { ok: true } : { error: e.grund };
}

function revalidiereAuftrag(auftragId: string, caseId?: string) {
  revalidatePath("/backoffice");
  revalidatePath("/backoffice/queue");
  revalidatePath("/backoffice/auftraege");
  revalidatePath(`/backoffice/auftraege/${auftragId}`);
  revalidatePath("/portal");
  revalidatePath(`/portal/auftraege/${auftragId}`);
  if (caseId) revalidatePath(`/cases/${caseId}`, "layout");
}

// ---------------------------------------------------------------------------
// Anlage
// ---------------------------------------------------------------------------

export async function auftragAnlegenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const auftraggeberId = text(fd, "auftraggeberId");
  if (!auftraggeberId) return { error: "Bitte einen Auftraggeber wählen." };
  const auftragsart = text(fd, "auftragsart");
  if (!auftragsart) return { error: "Bitte eine Auftragsart wählen." };
  const leistungen = fd.getAll("leistungen").map(String);

  const ergebnis = await erzeugeAuftrag({
    backofficeOrganizationId: ctx.organizationId,
    auftraggeberId,
    kontaktId: optional(fd, "kontaktId"),
    antragsteller: {
      vorname: optional(fd, "vorname"),
      nachname: optional(fd, "nachname"),
      email: optional(fd, "email"),
      phone: optional(fd, "phone"),
    },
    aktenbezeichnung: optional(fd, "aktenbezeichnung"),
    auftragsart,
    leistungen,
    prioritaet: enumWert(BACKOFFICE_PRIORITAETEN, optional(fd, "prioritaet")) ?? "normal",
    faelligAm: datum(fd, "faelligAm"),
    referenzExtern: optional(fd, "referenzExtern"),
    hinweiseAuftraggeber: optional(fd, "hinweise"),
    financingType: enumWert(FINANCING_TYPES as readonly FinancingType[], optional(fd, "financingType")),
    employmentType: enumWert(EMPLOYMENT_TYPES as readonly EmploymentType[], optional(fd, "employmentType")),
    quelle: "manuell",
    erstelltVonId: ctx.userId,
  });
  if (!ergebnis.ok) return { error: ergebnis.grund };
  revalidiereAuftrag(ergebnis.wert.id);
  redirect(`/backoffice/auftraege/${ergebnis.wert.id}`);
}

// ---------------------------------------------------------------------------
// Status und Steuerung
// ---------------------------------------------------------------------------

export async function statusWechselnAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const nach = enumWert(BACKOFFICE_STATUS as readonly BackofficeStatus[], optional(fd, "nach"));
  if (!nach) return { error: "Unbekannter Zielstatus." };
  const e = await wechsleStatus({
    auftragId,
    nach,
    akteur: ctx,
    begruendung: optional(fd, "begruendung"),
    wartegrund: optional(fd, "wartegrund"),
  });
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function uebernehmenAction(auftragId: string): Promise<AktionsErgebnis> {
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const e = await uebernehmeAuftrag(auftragId, ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function zuweisenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const bearbeiterId = optional(fd, "bearbeiterId");
  const e = await weiseZu(auftragId, bearbeiterId === "keiner" ? null : bearbeiterId, ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function steuerungAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const prioritaet = enumWert(BACKOFFICE_PRIORITAETEN as readonly BackofficePrioritaet[], optional(fd, "prioritaet"));
  const fristGesetzt = fd.has("faelligAm");
  const e = await setzePrioritaetUndFrist(
    auftragId,
    { ...(prioritaet ? { prioritaet } : {}), ...(fristGesetzt ? { faelligAm: datum(fd, "faelligAm") } : {}) },
    ctx
  );
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function pausierenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const e = await pausiere(auftragId, text(fd, "grund"), ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function fortsetzenAction(auftragId: string): Promise<AktionsErgebnis> {
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const e = await setzeFort(auftragId, ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function notizenSpeichernAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  if (ctx.backofficeRolle === "bearbeiter" && auftrag.bearbeiterId != null && auftrag.bearbeiterId !== ctx.userId) {
    return { error: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  await prisma.backofficeAuftrag.update({
    where: { id: auftragId },
    data: {
      ...(fd.has("interneNotizen") ? { interneNotizen: optional(fd, "interneNotizen") } : {}),
      ...(fd.has("ergebnisText") ? { ergebnisText: optional(fd, "ergebnisText") } : {}),
    },
  });
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Qualitaetskontrolle, Uebergabe
// ---------------------------------------------------------------------------

export async function qualitaetFreigebenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const e = await gibQualitaetFrei(auftragId, optional(fd, "begruendung"), ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function zurNachbearbeitungAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  const e = await gibZurNachbearbeitung(auftragId, text(fd, "begruendung"), ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function uebergebenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  // Bewusste Bestaetigung: Der Knopf schickt "bestaetigt=ja" erst nach dem
  // zweiten Klick. Ohne das Feld passiert nichts.
  if (text(fd, "bestaetigt") !== "ja") return { error: "Bitte die Übergabe bestätigen." };
  const e = await uebergib(auftragId, ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

// ---------------------------------------------------------------------------
// Rueckfragen
// ---------------------------------------------------------------------------

export async function rueckfrageEntwurfAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  if (ctx.backofficeRolle === "pruefer") return { error: "Prüfer stellen keine Rückfragen." };
  const betreff = text(fd, "betreff");
  const frage = text(fd, "frage");
  if (!betreff || !frage) return { error: "Betreff und Frage sind Pflicht." };
  const id = optional(fd, "rueckfrageId");
  if (id) {
    const { count } = await prisma.backofficeRueckfrage.updateMany({
      where: { id, auftragId, status: "entwurf" },
      data: { betreff, frage },
    });
    if (count !== 1) return { error: "Nur Entwürfe lassen sich bearbeiten." };
  } else {
    await prisma.backofficeRueckfrage.create({ data: { auftragId, betreff, frage, status: "entwurf" } });
  }
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return { ok: true };
}

export async function rueckfrageStellenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const auftragId = text(fd, "auftragId");
  const { ctx, auftrag } = await requireBackofficeAuftrag(auftragId);
  if (text(fd, "bestaetigt") !== "ja") return { error: "Bitte die Vorschau bestätigen." };
  const e = await stelleRueckfrage(text(fd, "rueckfrageId"), ctx);
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return ausErgebnis(e);
}

export async function rueckfrageErledigenAction(auftragId: string, rueckfrageId: string): Promise<AktionsErgebnis> {
  const { auftrag } = await requireBackofficeAuftrag(auftragId);
  const { count } = await prisma.backofficeRueckfrage.updateMany({
    where: { id: rueckfrageId, auftragId, status: { in: ["offen", "beantwortet"] } },
    data: { status: "erledigt" },
  });
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return count === 1 ? { ok: true } : { error: "Rückfrage nicht gefunden." };
}

export async function rueckfrageLoeschenAction(auftragId: string, rueckfrageId: string): Promise<AktionsErgebnis> {
  const { auftrag } = await requireBackofficeAuftrag(auftragId);
  const { count } = await prisma.backofficeRueckfrage.deleteMany({ where: { id: rueckfrageId, auftragId, status: "entwurf" } });
  revalidiereAuftrag(auftragId, auftrag.caseId);
  return count === 1 ? { ok: true } : { error: "Nur Entwürfe lassen sich löschen." };
}

// ---------------------------------------------------------------------------
// Auftraggeber
// ---------------------------------------------------------------------------

export async function auftraggeberSpeichernAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const id = optional(fd, "id");
  const name = text(fd, "name");
  if (!name) return { error: "Name ist Pflicht." };
  const kontingent = text(fd, "kontingentMonatlich");
  const slaTage = text(fd, "slaTage");
  const daten = {
    name,
    kurzname: optional(fd, "kurzname"),
    street: optional(fd, "street"),
    zip: optional(fd, "zip"),
    city: optional(fd, "city"),
    email: optional(fd, "email"),
    phone: optional(fd, "phone"),
    abrechnungsmodell:
      enumWert(BACKOFFICE_ABRECHNUNGSMODELLE as readonly BackofficeAbrechnungsmodell[], optional(fd, "abrechnungsmodell")) ?? "testfall",
    kontingentMonatlich: kontingent ? Math.max(0, parseInt(kontingent, 10) || 0) : null,
    carryOverMax: Math.max(0, parseInt(text(fd, "carryOverMax") || "0", 10) || 0),
    slaTage: slaTage ? Math.max(1, parseInt(slaTage, 10) || 1) : null,
    antragstellerKontaktErlaubt: fd.get("antragstellerKontaktErlaubt") === "on",
    aktiv: fd.has("aktiv") ? fd.get("aktiv") === "on" : true,
    notizIntern: optional(fd, "notizIntern"),
  };
  if (daten.abrechnungsmodell === "intern") return { error: "„Interne Übergabe“ wird automatisch angelegt." };

  let auftraggeberId: string;
  if (id) {
    const { count } = await prisma.backofficeAuftraggeber.updateMany({
      where: { id, backofficeOrganizationId: ctx.organizationId },
      data: daten,
    });
    if (count !== 1) return { error: "Auftraggeber nicht gefunden." };
    auftraggeberId = id;
  } else {
    const neu = await prisma.backofficeAuftraggeber.create({
      data: { ...daten, backofficeOrganizationId: ctx.organizationId },
      select: { id: true },
    });
    auftraggeberId = neu.id;
  }
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: id ? "backoffice.auftraggeber_geaendert" : "backoffice.auftraggeber_angelegt",
    entityType: "backoffice_auftraggeber",
    entityId: auftraggeberId,
    metadata: { abrechnungsmodell: daten.abrechnungsmodell },
  });
  revalidatePath("/backoffice/auftraggeber");
  revalidatePath(`/backoffice/auftraggeber/${auftraggeberId}`);
  if (!id) redirect(`/backoffice/auftraggeber/${auftraggeberId}`);
  return { ok: true };
}

/**
 * Verknuepft einen Auftraggeber mit einer BaufiDesk-Organisation (Portal).
 * Manager-Entscheidung mit Tragweite: Die Nutzer dieser Organisation sehen
 * danach die Auftraege dieses Auftraggebers. Deshalb ueber den Slug, den
 * nur kennt, wer mit der Organisation gesprochen hat, und mit Audit.
 */
export async function auftraggeberVerknuepfenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const id = text(fd, "id");
  const slug = text(fd, "slug").toLowerCase();
  const ag = await prisma.backofficeAuftraggeber.findFirst({
    where: { id, backofficeOrganizationId: ctx.organizationId },
    select: { id: true, abrechnungsmodell: true },
  });
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  if (ag.abrechnungsmodell === "intern") return { error: "Die eigene Organisation ist bereits verknüpft." };
  if (!slug) {
    await prisma.backofficeAuftraggeber.update({ where: { id: ag.id }, data: { organizationId: null } });
  } else {
    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!org) return { error: "Keine Organisation mit diesem Kürzel." };
    if (org.id === ctx.organizationId) return { error: "Die eigene Organisation nutzt die interne Übergabe." };
    try {
      await prisma.backofficeAuftraggeber.update({ where: { id: ag.id }, data: { organizationId: org.id } });
    } catch (e) {
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
        return { error: "Diese Organisation ist bereits einem anderen Auftraggeber zugeordnet." };
      }
      throw e;
    }
  }
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "backoffice.auftraggeber_geaendert",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { verknuepfung: slug || null },
  });
  revalidatePath(`/backoffice/auftraggeber/${ag.id}`);
  return { ok: true };
}

export async function kontaktSpeichernAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const auftraggeberId = text(fd, "auftraggeberId");
  const ag = await prisma.backofficeAuftraggeber.findFirst({
    where: { id: auftraggeberId, backofficeOrganizationId: ctx.organizationId },
    select: { id: true, organizationId: true },
  });
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  const name = text(fd, "name");
  if (!name) return { error: "Name ist Pflicht." };
  const email = optional(fd, "email");
  // Portal-Nutzer nur aus der verknuepften Organisation - sonst koennte ein
  // Kontakt an einen Nutzer eines fremden Mandanten gebunden werden.
  let userId: string | null = null;
  if (email && ag.organizationId) {
    const u = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), organizationId: ag.organizationId, active: true },
      select: { id: true },
    });
    userId = u?.id ?? null;
  }
  await prisma.backofficeAuftraggeberKontakt.create({
    data: {
      auftraggeberId: ag.id,
      name,
      email,
      phone: optional(fd, "phone"),
      userId,
      darfAlleAuftraegeSehen: fd.get("darfAlleAuftraegeSehen") !== "off",
    },
  });
  revalidatePath(`/backoffice/auftraggeber/${ag.id}`);
  return { ok: true };
}

export async function kontaktDeaktivierenAction(auftraggeberId: string, kontaktId: string): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const { count } = await prisma.backofficeAuftraggeberKontakt.updateMany({
    where: { id: kontaktId, auftraggeber: { id: auftraggeberId, backofficeOrganizationId: ctx.organizationId } },
    data: { aktiv: false },
  });
  revalidatePath(`/backoffice/auftraggeber/${auftraggeberId}`);
  return count === 1 ? { ok: true } : { error: "Kontakt nicht gefunden." };
}

// ---------------------------------------------------------------------------
// Team, Kontingent, Konfiguration
// ---------------------------------------------------------------------------

/**
 * Backoffice-Rolle setzen. Erlaubt fuer Manager - und fuer den
 * Organisationsadmin, denn irgendjemand muss den ersten Manager benennen.
 */
export async function rolleSetzenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireContext();
  const darf = ctx.backofficeRolle === "manager" || roleAtLeast(ctx.role, "org_admin");
  if (!darf || !(await istBackofficeAktiv(ctx.organizationId))) return { error: "Dafür fehlt die Berechtigung." };
  const userId = text(fd, "userId");
  const rolle = enumWert(BACKOFFICE_ROLLEN as readonly BackofficeRolle[], optional(fd, "rolle"));
  const { count } = await prisma.user.updateMany({
    where: { id: userId, organizationId: ctx.organizationId },
    data: { backofficeRolle: rolle },
  });
  if (count !== 1) return { error: "Nutzer nicht gefunden." };
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "backoffice.rolle_geaendert",
    entityType: "user",
    entityId: userId,
    metadata: { backofficeRolle: rolle },
  });
  revalidatePath("/backoffice/team");
  revalidatePath("/organization");
  return { ok: true };
}

export async function kontingentKorrigierenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const auftraggeberId = text(fd, "auftraggeberId");
  const ag = await prisma.backofficeAuftraggeber.findFirst({
    where: { id: auftraggeberId, backofficeOrganizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!ag) return { error: "Auftraggeber nicht gefunden." };
  const menge = parseInt(text(fd, "menge"), 10);
  if (!Number.isFinite(menge) || menge === 0 || Math.abs(menge) > 100) return { error: "Menge zwischen -100 und 100, nicht 0." };
  const begruendung = text(fd, "begruendung");
  if (!begruendung) return { error: "Eine Korrektur braucht eine Begründung." };
  const art = text(fd, "art") === "zusatzfall" ? "zusatzfall" : "korrektur";
  const periode = optional(fd, "periode") ?? periodeVon(new Date());
  const e = await prisma.backofficeKontingentEreignis.create({
    data: {
      auftraggeberId: ag.id,
      art,
      menge,
      periode,
      begruendung,
      idempotenzSchluessel: `${art}:${ag.id}:${Date.now()}:${ctx.userId}`,
      userId: ctx.userId,
    },
    select: { id: true },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "backoffice.kontingent_korrigiert",
    entityType: "backoffice_kontingent",
    entityId: e.id,
    metadata: { auftraggeberId: ag.id, art, menge, periode },
  });
  revalidatePath("/backoffice/abrechnung");
  revalidatePath(`/backoffice/auftraggeber/${ag.id}`);
  return { ok: true };
}

export async function abrechnungsstatusAction(auftragId: string, status: "offen" | "abgerechnet" | "nicht_abrechenbar"): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: auftragId, backofficeOrganizationId: ctx.organizationId },
    data: { abrechnungsstatus: status },
  });
  revalidatePath("/backoffice/abrechnung");
  revalidatePath(`/backoffice/auftraege/${auftragId}`);
  return count === 1 ? { ok: true } : { error: "Auftrag nicht gefunden." };
}

export async function slaVorgabeAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const tage = parseInt(text(fd, "backofficeSlaTage"), 10);
  if (!Number.isFinite(tage) || tage < 1 || tage > 60) return { error: "Zwischen 1 und 60 Werktagen." };
  await prisma.organization.update({ where: { id: ctx.organizationId }, data: { backofficeSlaTage: tage } });
  revalidatePath("/backoffice/konfiguration");
  return { ok: true };
}

/** Kleiner Helfer fuer Seiten: existiert das Backoffice fuer diesen Kontext? */
export async function backofficeSichtbar(): Promise<boolean> {
  const ctx = await requireContext();
  return Boolean(ctx.backofficeRolle) && (await istBackofficeAktiv(ctx.organizationId));
}
