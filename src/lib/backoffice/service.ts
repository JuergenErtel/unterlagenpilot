import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";
import type {
  AuditAction,
  BackofficePrioritaet,
  BackofficeRolle,
  BackofficeStatus,
  EmploymentType,
  FinancingType,
} from "@/lib/domain/enums";
import { mitAuftragsnummer } from "./nummer";
import { faelligkeitNachWerktagen, periodeVon } from "./sla";
import { bereinigeLeistungen, auftragsart as findeAuftragsart } from "./leistungen";
import { pruefeUebergang, darfQualitaetPruefen } from "./status";
import { verbrauchsSchluessel } from "./kontingent";

/**
 * Fachlicher Kern des Backoffice - ohne Next-Laufzeit, damit die DB-Tests ihn
 * direkt aufrufen koennen. Die Server Actions in src/lib/actions/backoffice*.ts
 * pruefen den Zugang und reichen hierher durch.
 *
 * Drei Regeln, die jede Funktion hier einhaelt:
 *  1. Kein Schreibzugriff auf Case.status, Case.leadPhase oder sonst ein
 *     Vertriebsfeld. Der Auftrag lebt neben der Akte, nicht in ihr.
 *  2. Jeder Statuswechsel ist ein bedingtes updateMany auf den erwarteten
 *     Ausgangsstatus. Zwei gleichzeitige Klicks gewinnen nicht beide.
 *  3. Jede Aenderung erzeugt ein Ereignis im Verlauf UND einen Audit-Eintrag
 *     mit Schluesseln, nie mit Freitext.
 */

export type ServiceErgebnis<T = undefined> = { ok: true; wert: T } | { ok: false; grund: string };

export interface Akteur {
  userId: string;
  organizationId: string;
  backofficeRolle: BackofficeRolle | null;
}

async function protokolliere(input: {
  auftragId: string;
  organizationId: string;
  userId: string | null;
  art: string;
  vonStatus?: BackofficeStatus | null;
  nachStatus?: BackofficeStatus | null;
  text?: string | null;
  sichtbarFuerAuftraggeber?: boolean;
  audit: AuditAction;
  auditMeta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.backofficeAuftragEreignis.create({
    data: {
      auftragId: input.auftragId,
      art: input.art,
      vonStatus: input.vonStatus ?? null,
      nachStatus: input.nachStatus ?? null,
      text: input.text ?? null,
      sichtbarFuerAuftraggeber: input.sichtbarFuerAuftraggeber ?? false,
      userId: input.userId,
    },
  });
  await audit({
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.audit,
    entityType: "backoffice_auftrag",
    entityId: input.auftragId,
    metadata: { ...(input.auditMeta ?? {}), von: input.vonStatus ?? undefined, nach: input.nachStatus ?? undefined },
  });
}

// ---------------------------------------------------------------------------
// Anlage
// ---------------------------------------------------------------------------

export interface AuftragAnlage {
  backofficeOrganizationId: string;
  auftraggeberId: string;
  kontaktId?: string | null;
  /** Vorhandene Akte (interne Uebergabe). Fehlt sie, entsteht eine Backoffice-Akte. */
  caseId?: string | null;
  antragsteller?: { vorname?: string | null; nachname?: string | null; email?: string | null; phone?: string | null };
  aktenbezeichnung?: string | null;
  auftragsart: string;
  leistungen?: readonly string[];
  prioritaet?: BackofficePrioritaet;
  faelligAm?: Date | null;
  referenzExtern?: string | null;
  hinweiseAuftraggeber?: string | null;
  financingType?: FinancingType | null;
  employmentType?: EmploymentType | null;
  quelle: "manuell" | "portal" | "vertrieb_uebergabe";
  erstelltVonId: string | null;
  jetzt?: Date;
}

/**
 * Legt einen Auftrag an - und, wenn keine Akte mitkommt, die Akte dazu.
 * Externe Auftraege bekommen eine Akte mit akteArt = backoffice und der
 * Auftragsnummer als Aktenzeichen. Die Akte traegt bewusst keine Quelle,
 * keine Leadphase-Aenderung, keinen Broker: sie ist kein Lead.
 */
export async function erzeugeAuftrag(input: AuftragAnlage): Promise<ServiceErgebnis<{ id: string; auftragsnummer: string; caseId: string }>> {
  const jetzt = input.jetzt ?? new Date();
  const art = findeAuftragsart(input.auftragsart);
  if (!art) return { ok: false, grund: "Unbekannte Auftragsart." };

  const auftraggeber = await prisma.backofficeAuftraggeber.findFirst({
    where: { id: input.auftraggeberId, backofficeOrganizationId: input.backofficeOrganizationId, aktiv: true },
    select: { id: true, slaTage: true, backofficeOrganization: { select: { backofficeSlaTage: true } } },
  });
  if (!auftraggeber) return { ok: false, grund: "Auftraggeber nicht gefunden." };

  if (input.kontaktId) {
    const kontakt = await prisma.backofficeAuftraggeberKontakt.findFirst({
      where: { id: input.kontaktId, auftraggeberId: auftraggeber.id, aktiv: true },
      select: { id: true },
    });
    if (!kontakt) return { ok: false, grund: "Ansprechpartner gehört nicht zu diesem Auftraggeber." };
  }

  let caseId = input.caseId ?? null;
  if (caseId) {
    // Interne Uebergabe: Die Akte muss der Backoffice-Organisation gehoeren.
    const akte = await prisma.case.findFirst({
      where: { id: caseId, organizationId: input.backofficeOrganizationId },
      select: { id: true },
    });
    if (!akte) return { ok: false, grund: "Akte nicht gefunden." };
    const offen = await prisma.backofficeAuftrag.findFirst({
      where: { caseId, status: { notIn: ["abgeschlossen", "abgelehnt", "storniert"] } },
      select: { auftragsnummer: true },
    });
    if (offen) return { ok: false, grund: `Zu dieser Akte läuft bereits Auftrag ${offen.auftragsnummer}.` };
  }

  const leistungen = bereinigeLeistungen(input.leistungen?.length ? input.leistungen : art.leistungen);
  const slaTage = auftraggeber.slaTage ?? auftraggeber.backofficeOrganization.backofficeSlaTage;
  const faelligAm = input.faelligAm ?? faelligkeitNachWerktagen(jetzt, slaTage);
  const name = [input.antragsteller?.vorname, input.antragsteller?.nachname].filter(Boolean).join(" ").trim();
  const bezeichnung = (input.aktenbezeichnung ?? "").trim() || name || "Ohne Bezeichnung";
  const jahr = jetzt.getFullYear();

  const erzeugt = await mitAuftragsnummer(input.backofficeOrganizationId, jahr, async (auftragsnummer) => {
    return prisma.$transaction(async (tx) => {
      let akteId = caseId;
      if (!akteId) {
        // Eigene Nummernvergabe fuer die Akte: Backoffice-Akten tragen das
        // BO-Zeichen des Auftrags, damit Akte und Auftrag dasselbe Etikett
        // haben. Kollidiert es (zwei Anlagen gleichzeitig), wirft der
        // Unique-Index und mitAuftragsnummer versucht es erneut.
        const akte = await tx.case.create({
          data: {
            organizationId: input.backofficeOrganizationId,
            caseNumber: auftragsnummer,
            akteArt: "backoffice",
            status: "neu",
            financingType: input.financingType ?? null,
            primaryEmploymentType: input.employmentType ?? null,
            applicants: {
              create: [
                {
                  position: 1,
                  vorname: input.antragsteller?.vorname?.trim() || null,
                  nachname: input.antragsteller?.nachname?.trim() || null,
                  email: input.antragsteller?.email?.trim() || null,
                  phone: input.antragsteller?.phone?.trim() || null,
                },
              ],
            },
            financingRequest: { create: {} },
            sources: { create: { type: "manuell" } },
          },
          select: { id: true },
        });
        akteId = akte.id;
      }
      const auftrag = await tx.backofficeAuftrag.create({
        data: {
          backofficeOrganizationId: input.backofficeOrganizationId,
          auftragsnummer,
          auftraggeberId: auftraggeber.id,
          kontaktId: input.kontaktId ?? null,
          caseId: akteId,
          aktenbezeichnung: bezeichnung,
          auftragsart: art.key,
          leistungen,
          prioritaet: input.prioritaet ?? "normal",
          eingangAm: jetzt,
          faelligAm,
          quelle: input.quelle,
          referenzExtern: input.referenzExtern?.trim() || null,
          hinweiseAuftraggeber: input.hinweiseAuftraggeber?.trim() || null,
          erstelltVonId: input.erstelltVonId,
          statusSeit: jetzt,
        },
        select: { id: true, auftragsnummer: true, caseId: true },
      });
      return auftrag;
    });
  });

  await protokolliere({
    auftragId: erzeugt.id,
    organizationId: input.backofficeOrganizationId,
    userId: input.erstelltVonId,
    art: "angelegt",
    nachStatus: "neu_eingegangen",
    text: `Auftrag ${erzeugt.auftragsnummer} eingegangen`,
    sichtbarFuerAuftraggeber: true,
    audit: input.quelle === "vertrieb_uebergabe" ? "backoffice.vertrieb_uebergabe" : "backoffice.auftrag_erstellt",
    auditMeta: { auftragsnummer: erzeugt.auftragsnummer, auftragsart: art.key, quelle: input.quelle },
  });
  return { ok: true, wert: erzeugt };
}

/**
 * Der Auftraggeber-Datensatz fuer interne Uebergaben: die eigene
 * Organisation. Wird beim ersten Mal angelegt.
 */
export async function eigenerAuftraggeber(organizationId: string): Promise<string> {
  const vorhanden = await prisma.backofficeAuftraggeber.findFirst({
    where: { backofficeOrganizationId: organizationId, organizationId, abrechnungsmodell: "intern" },
    select: { id: true },
  });
  if (vorhanden) return vorhanden.id;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const neu = await prisma.backofficeAuftraggeber.upsert({
    where: { backofficeOrganizationId_organizationId: { backofficeOrganizationId: organizationId, organizationId } },
    create: {
      backofficeOrganizationId: organizationId,
      organizationId,
      name: org.name,
      kurzname: "Eigener Vertrieb",
      abrechnungsmodell: "intern",
      antragstellerKontaktErlaubt: true,
    },
    update: {},
    select: { id: true },
  });
  return neu.id;
}

// ---------------------------------------------------------------------------
// Statuswechsel
// ---------------------------------------------------------------------------

async function ladeFuerWechsel(auftragId: string, organizationId: string) {
  return prisma.backofficeAuftrag.findFirst({
    where: { id: auftragId, backofficeOrganizationId: organizationId },
    select: { id: true, status: true, bearbeiterId: true, pausiertSeit: true, auftragsnummer: true, auftraggeberId: true },
  });
}

export async function wechsleStatus(input: {
  auftragId: string;
  nach: BackofficeStatus;
  akteur: Akteur;
  begruendung?: string | null;
  wartegrund?: string | null;
  jetzt?: Date;
}): Promise<ServiceErgebnis> {
  const jetzt = input.jetzt ?? new Date();
  const a = await ladeFuerWechsel(input.auftragId, input.akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  const von = a.status as BackofficeStatus;

  const pruefung = pruefeUebergang({
    von,
    nach: input.nach,
    rolle: input.akteur.backofficeRolle,
    userId: input.akteur.userId,
    bearbeiterId: a.bearbeiterId,
    pausiert: a.pausiertSeit != null,
    begruendung: input.begruendung,
  });
  if (!pruefung.erlaubt) return { ok: false, grund: pruefung.grund };

  // QC-Freigabe und -Rueckgabe haben eigene Funktionen mit Vier-Augen-Regel.
  if (von === "qualitaetskontrolle" && (input.nach === "einreichungsfertig" || input.nach === "nachbearbeitung")) {
    return { ok: false, grund: "Bitte über die Qualitätskontrolle freigeben oder zurückgeben." };
  }
  if (input.nach === "uebergeben") {
    return { ok: false, grund: "Bitte über „Übergeben“ ausführen." };
  }

  const wartegrund =
    input.nach === "wartet_auf_unterlagen" || input.nach === "rueckfrage_auftraggeber"
      ? (input.wartegrund ?? input.begruendung ?? null)
      : null;

  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: von },
    data: {
      status: input.nach,
      statusSeit: jetzt,
      wartegrund,
      // Ein Bearbeiter, der einen freien Auftrag anfasst, uebernimmt ihn.
      ...(a.bearbeiterId == null && input.akteur.backofficeRolle === "bearbeiter" ? { bearbeiterId: input.akteur.userId } : {}),
    },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag wurde zwischenzeitlich geändert. Bitte neu laden." };

  await protokolliere({
    auftragId: a.id,
    organizationId: input.akteur.organizationId,
    userId: input.akteur.userId,
    art: "status_wechsel",
    vonStatus: von,
    nachStatus: input.nach,
    text: input.begruendung?.trim() || null,
    // Der Auftraggeber sieht Statuswechsel, aber nicht die interne Begruendung
    // eines Stornos - die steht im Ereignis, nicht im Portal-Text.
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.status_geaendert",
    auditMeta: { auftragsnummer: a.auftragsnummer },
  });
  return { ok: true, wert: undefined };
}

// ---------------------------------------------------------------------------
// Zuweisung, Prioritaet, Frist, Pause
// ---------------------------------------------------------------------------

export async function uebernehmeAuftrag(auftragId: string, akteur: Akteur): Promise<ServiceErgebnis> {
  if (!akteur.backofficeRolle) return { ok: false, grund: "Keine Backoffice-Rolle." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: auftragId, backofficeOrganizationId: akteur.organizationId, bearbeiterId: null },
    data: { bearbeiterId: akteur.userId },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag ist bereits zugewiesen." };
  await protokolliere({
    auftragId,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "zuweisung",
    text: "Auftrag übernommen",
    audit: "backoffice.zugewiesen",
    auditMeta: { bearbeiterId: akteur.userId, art: "uebernahme" },
  });
  return { ok: true, wert: undefined };
}

export async function weiseZu(auftragId: string, bearbeiterId: string | null, akteur: Akteur): Promise<ServiceErgebnis> {
  if (akteur.backofficeRolle !== "manager") return { ok: false, grund: "Nur Manager weisen zu." };
  if (bearbeiterId) {
    const b = await prisma.user.findFirst({
      where: { id: bearbeiterId, organizationId: akteur.organizationId, active: true, backofficeRolle: { not: null } },
      select: { id: true, name: true },
    });
    if (!b) return { ok: false, grund: "Bearbeiter nicht im Backoffice-Team." };
  }
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: auftragId, backofficeOrganizationId: akteur.organizationId },
    data: { bearbeiterId },
  });
  if (count !== 1) return { ok: false, grund: "Auftrag nicht gefunden." };
  await protokolliere({
    auftragId,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "zuweisung",
    text: bearbeiterId ? "Bearbeiter zugewiesen" : "Zuweisung aufgehoben",
    audit: "backoffice.zugewiesen",
    auditMeta: { bearbeiterId },
  });
  return { ok: true, wert: undefined };
}

export async function setzePrioritaetUndFrist(
  auftragId: string,
  daten: { prioritaet?: BackofficePrioritaet; faelligAm?: Date | null },
  akteur: Akteur
): Promise<ServiceErgebnis> {
  if (akteur.backofficeRolle !== "manager") return { ok: false, grund: "Nur Manager ändern Priorität und Frist." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: auftragId, backofficeOrganizationId: akteur.organizationId },
    data: {
      ...(daten.prioritaet ? { prioritaet: daten.prioritaet } : {}),
      ...(daten.faelligAm !== undefined ? { faelligAm: daten.faelligAm } : {}),
    },
  });
  if (count !== 1) return { ok: false, grund: "Auftrag nicht gefunden." };
  await protokolliere({
    auftragId,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "steuerung",
    text: [daten.prioritaet ? `Priorität: ${daten.prioritaet}` : null, daten.faelligAm !== undefined ? "Frist geändert" : null]
      .filter(Boolean)
      .join(" · "),
    sichtbarFuerAuftraggeber: daten.faelligAm !== undefined,
    audit: "backoffice.status_geaendert",
    auditMeta: { prioritaet: daten.prioritaet, fristGeaendert: daten.faelligAm !== undefined },
  });
  return { ok: true, wert: undefined };
}

export async function pausiere(auftragId: string, grund: string, akteur: Akteur, jetzt = new Date()): Promise<ServiceErgebnis> {
  const a = await ladeFuerWechsel(auftragId, akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  if (akteur.backofficeRolle === "bearbeiter" && a.bearbeiterId !== akteur.userId) {
    return { ok: false, grund: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  if (akteur.backofficeRolle === "pruefer") return { ok: false, grund: "Prüfer pausieren keine Aufträge." };
  if (!grund.trim()) return { ok: false, grund: "Bitte einen Grund angeben." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, pausiertSeit: null, status: { notIn: ["abgeschlossen", "abgelehnt", "storniert"] } },
    data: { pausiertSeit: jetzt, pausiertGrund: grund.trim() },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag ist bereits pausiert oder abgeschlossen." };
  await protokolliere({
    auftragId: a.id,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "pause",
    text: "Pausiert",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.pausiert",
    auditMeta: { pausiert: true },
  });
  return { ok: true, wert: undefined };
}

export async function setzeFort(auftragId: string, akteur: Akteur): Promise<ServiceErgebnis> {
  const a = await ladeFuerWechsel(auftragId, akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  if (akteur.backofficeRolle === "bearbeiter" && a.bearbeiterId != null && a.bearbeiterId !== akteur.userId) {
    return { ok: false, grund: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, pausiertSeit: { not: null } },
    data: { pausiertSeit: null, pausiertGrund: null },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag ist nicht pausiert." };
  await protokolliere({
    auftragId: a.id,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "pause",
    text: "Fortgesetzt",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.pausiert",
    auditMeta: { pausiert: false },
  });
  return { ok: true, wert: undefined };
}

// ---------------------------------------------------------------------------
// Qualitaetskontrolle
// ---------------------------------------------------------------------------

/**
 * Freigabe: nur aus qualitaetskontrolle, nur durch Pruefer oder Manager.
 * Vier-Augen-Regel: Der eigene Bearbeiter darf seine Arbeit nicht selbst
 * freigeben - ausser er ist Manager, dann wird die Selbstfreigabe im Audit
 * ausdruecklich vermerkt (ein Einpersonen-Backoffice muss arbeiten koennen,
 * aber es soll nachlesbar sein).
 */
export async function gibQualitaetFrei(
  auftragId: string,
  begruendung: string | null,
  akteur: Akteur,
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  if (!darfQualitaetPruefen(akteur.backofficeRolle)) return { ok: false, grund: "Dafür fehlt die Berechtigung." };
  const a = await ladeFuerWechsel(auftragId, akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  if (a.pausiertSeit) return { ok: false, grund: "Der Auftrag ist pausiert." };
  const selbst = a.bearbeiterId === akteur.userId;
  if (selbst && akteur.backofficeRolle !== "manager") {
    return { ok: false, grund: "Die eigene Arbeit kann nicht selbst freigegeben werden (Vier-Augen-Prinzip)." };
  }
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: "qualitaetskontrolle" },
    data: {
      status: "einreichungsfertig",
      statusSeit: jetzt,
      prueferId: akteur.userId,
      qualitaetFreigegebenAm: jetzt,
      qualitaetFreigegebenVonId: akteur.userId,
      qualitaetBegruendung: begruendung?.trim() || null,
      wartegrund: null,
    },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag steht nicht in der Qualitätskontrolle." };
  await protokolliere({
    auftragId: a.id,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "qc_freigabe",
    vonStatus: "qualitaetskontrolle",
    nachStatus: "einreichungsfertig",
    text: begruendung?.trim() || "Qualitätsfreigabe erteilt",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.qc_freigegeben",
    auditMeta: { auftragsnummer: a.auftragsnummer, selbstfreigabe: selbst },
  });
  return { ok: true, wert: undefined };
}

export async function gibZurNachbearbeitung(
  auftragId: string,
  begruendung: string,
  akteur: Akteur,
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  if (!darfQualitaetPruefen(akteur.backofficeRolle)) return { ok: false, grund: "Dafür fehlt die Berechtigung." };
  if (!begruendung.trim()) return { ok: false, grund: "Bitte begründen, was nachzubessern ist." };
  const a = await ladeFuerWechsel(auftragId, akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: { in: ["qualitaetskontrolle", "einreichungsfertig"] } },
    data: {
      status: "nachbearbeitung",
      statusSeit: jetzt,
      prueferId: akteur.userId,
      qualitaetFreigegebenAm: null,
      qualitaetFreigegebenVonId: null,
      qualitaetBegruendung: begruendung.trim(),
    },
  });
  if (count !== 1) return { ok: false, grund: "Der Auftrag steht nicht in der Qualitätskontrolle." };
  await protokolliere({
    auftragId: a.id,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "qc_rueckgabe",
    vonStatus: a.status as BackofficeStatus,
    nachStatus: "nachbearbeitung",
    text: begruendung.trim(),
    // Interne Qualitaetshinweise bleiben intern.
    sichtbarFuerAuftraggeber: false,
    audit: "backoffice.qc_zurueckgegeben",
    auditMeta: { auftragsnummer: a.auftragsnummer },
  });
  return { ok: true, wert: undefined };
}

// ---------------------------------------------------------------------------
// Uebergabe, Abnahme, Abschluss
// ---------------------------------------------------------------------------

/**
 * Uebergabe an den Auftraggeber. Nur aus einreichungsfertig - und dorthin
 * kommt ein Auftrag nur durch die Freigabe. Hier entsteht der Kontingent-
 * verbrauch: genau ein Ereignis je Auftrag, ueber den Idempotenzschluessel
 * gegen Doppelzaehlung gesichert.
 */
export async function uebergib(auftragId: string, akteur: Akteur, jetzt = new Date()): Promise<ServiceErgebnis> {
  if (akteur.backofficeRolle !== "manager" && akteur.backofficeRolle !== "bearbeiter") {
    return { ok: false, grund: "Dafür fehlt die Berechtigung." };
  }
  const a = await ladeFuerWechsel(auftragId, akteur.organizationId);
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  if (akteur.backofficeRolle === "bearbeiter" && a.bearbeiterId != null && a.bearbeiterId !== akteur.userId) {
    return { ok: false, grund: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  if (a.pausiertSeit) return { ok: false, grund: "Der Auftrag ist pausiert." };

  const auftraggeber = await prisma.backofficeAuftraggeber.findUniqueOrThrow({
    where: { id: a.auftraggeberId },
    select: { abrechnungsmodell: true },
  });

  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: "einreichungsfertig", qualitaetFreigegebenAm: { not: null } },
    data: { status: "uebergeben", statusSeit: jetzt, uebergebenAm: jetzt },
  });
  if (count !== 1) return { ok: false, grund: "Übergabe nur nach Qualitätsfreigabe möglich." };

  // Kontingent: intern kostet nichts. Alle anderen Modelle verbrauchen einen
  // Fall - beim Testfall den einen, beim Abo einen aus dem Kontingent, beim
  // Partner einen fuer die Partnerabrechnung.
  if (auftraggeber.abrechnungsmodell !== "intern") {
    try {
      await prisma.backofficeKontingentEreignis.create({
        data: {
          auftraggeberId: a.auftraggeberId,
          auftragId: a.id,
          art: "verbrauch",
          menge: 1,
          periode: periodeVon(jetzt),
          idempotenzSchluessel: verbrauchsSchluessel(a.id),
          userId: akteur.userId,
        },
      });
    } catch (e) {
      // P2002: Verbrauch existiert schon (zweite Uebergabe nach Nachbearbeitung).
      if (!(typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002")) throw e;
    }
  }

  await protokolliere({
    auftragId: a.id,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "uebergabe",
    vonStatus: "einreichungsfertig",
    nachStatus: "uebergeben",
    text: "Ergebnis an den Auftraggeber übergeben",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.uebergeben",
    auditMeta: { auftragsnummer: a.auftragsnummer },
  });
  return { ok: true, wert: undefined };
}

export async function nimmAb(
  auftragId: string,
  kommentar: string | null,
  akteur: { userId: string; organizationId: string },
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  const a = await prisma.backofficeAuftrag.findUnique({
    where: { id: auftragId },
    select: { id: true, backofficeOrganizationId: true, auftragsnummer: true },
  });
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: "uebergeben", abgenommenAm: null },
    data: { abgenommenAm: jetzt, abnahmeKommentar: kommentar?.trim() || null },
  });
  if (count !== 1) return { ok: false, grund: "Abnahme ist nur nach der Übergabe möglich." };
  await protokolliere({
    auftragId: a.id,
    organizationId: a.backofficeOrganizationId,
    userId: akteur.userId,
    art: "abnahme",
    text: "Ergebnis vom Auftraggeber abgenommen",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.abgenommen",
    auditMeta: { auftragsnummer: a.auftragsnummer },
  });
  return { ok: true, wert: undefined };
}

export async function fordereNachbearbeitungAn(
  auftragId: string,
  grund: string,
  akteur: { userId: string },
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  if (!grund.trim()) return { ok: false, grund: "Bitte beschreiben, was nachzubearbeiten ist." };
  const a = await prisma.backofficeAuftrag.findUnique({
    where: { id: auftragId },
    select: { id: true, backofficeOrganizationId: true, auftragsnummer: true },
  });
  if (!a) return { ok: false, grund: "Auftrag nicht gefunden." };
  const { count } = await prisma.backofficeAuftrag.updateMany({
    where: { id: a.id, status: "uebergeben" },
    data: { status: "nachbearbeitung", statusSeit: jetzt, abgenommenAm: null, wartegrund: null },
  });
  if (count !== 1) return { ok: false, grund: "Nachbearbeitung kann nur nach der Übergabe angefordert werden." };
  await protokolliere({
    auftragId: a.id,
    organizationId: a.backofficeOrganizationId,
    userId: akteur.userId,
    art: "nachbearbeitung_angefordert",
    vonStatus: "uebergeben",
    nachStatus: "nachbearbeitung",
    text: grund.trim(),
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.nachbearbeitung_angefordert",
    auditMeta: { auftragsnummer: a.auftragsnummer },
  });
  return { ok: true, wert: undefined };
}

// ---------------------------------------------------------------------------
// Rueckfragen
// ---------------------------------------------------------------------------

export async function stelleRueckfrage(
  rueckfrageId: string,
  akteur: Akteur,
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  const r = await prisma.backofficeRueckfrage.findFirst({
    where: { id: rueckfrageId, auftrag: { backofficeOrganizationId: akteur.organizationId } },
    select: { id: true, status: true, auftragId: true, auftrag: { select: { status: true, bearbeiterId: true, pausiertSeit: true } } },
  });
  if (!r) return { ok: false, grund: "Rückfrage nicht gefunden." };
  if (r.status !== "entwurf") return { ok: false, grund: "Diese Rückfrage wurde bereits gestellt." };
  if (akteur.backofficeRolle === "bearbeiter" && r.auftrag.bearbeiterId != null && r.auftrag.bearbeiterId !== akteur.userId) {
    return { ok: false, grund: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  const { count } = await prisma.backofficeRueckfrage.updateMany({
    where: { id: r.id, status: "entwurf" },
    data: { status: "offen", gestelltAm: jetzt, gestelltVonId: akteur.userId },
  });
  if (count !== 1) return { ok: false, grund: "Die Rückfrage wurde zwischenzeitlich geändert." };

  // Der Auftrag wandert in den Wartezustand, wenn er aus einem Arbeitsstatus
  // kommt. Steht er woanders (QC, uebergeben), bleibt er, wo er ist.
  const von = r.auftrag.status as BackofficeStatus;
  if (["auftrag_pruefen", "in_aufbereitung", "wartet_auf_unterlagen"].includes(von) && !r.auftrag.pausiertSeit) {
    await prisma.backofficeAuftrag.updateMany({
      where: { id: r.auftragId, status: von },
      data: { status: "rueckfrage_auftraggeber", statusSeit: jetzt, wartegrund: "Rückfrage gestellt" },
    });
  }
  await protokolliere({
    auftragId: r.auftragId,
    organizationId: akteur.organizationId,
    userId: akteur.userId,
    art: "rueckfrage",
    text: "Rückfrage an den Auftraggeber gestellt",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.rueckfrage_gestellt",
    auditMeta: { rueckfrageId: r.id },
  });
  return { ok: true, wert: undefined };
}

export async function beantworteRueckfrage(
  rueckfrageId: string,
  antwort: string,
  akteur: { userId: string },
  jetzt = new Date()
): Promise<ServiceErgebnis> {
  if (!antwort.trim()) return { ok: false, grund: "Bitte eine Antwort eingeben." };
  const r = await prisma.backofficeRueckfrage.findUnique({
    where: { id: rueckfrageId },
    select: { id: true, auftragId: true, auftrag: { select: { backofficeOrganizationId: true, status: true } } },
  });
  if (!r) return { ok: false, grund: "Rückfrage nicht gefunden." };
  const { count } = await prisma.backofficeRueckfrage.updateMany({
    where: { id: r.id, status: "offen" },
    data: { status: "beantwortet", antwort: antwort.trim(), beantwortetAm: jetzt, beantwortetVonId: akteur.userId },
  });
  if (count !== 1) return { ok: false, grund: "Diese Rückfrage ist nicht mehr offen." };
  await protokolliere({
    auftragId: r.auftragId,
    organizationId: r.auftrag.backofficeOrganizationId,
    userId: akteur.userId,
    art: "rueckfrage",
    text: "Rückmeldung des Auftraggebers eingegangen",
    sichtbarFuerAuftraggeber: true,
    audit: "backoffice.rueckfrage_beantwortet",
    auditMeta: { rueckfrageId: r.id },
  });
  return { ok: true, wert: undefined };
}
