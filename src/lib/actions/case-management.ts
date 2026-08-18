"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { NOTIZEN_MAX_ZEICHEN } from "@/lib/cases/notizen";
import {
  CASE_NOTE_KINDS,
  DEADLINE_KINDS,
  KONTAKT_ERGEBNISSE,
  type CaseNoteKind,
  type DeadlineKind,
  type KontaktErgebnis,
} from "@/lib/domain/enums";

function str(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function num(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  // Deutsche Eingabe (1.234,56) → Zahl.
  const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function date(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function revalidateCase(caseId: string): void {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/verwaltung`);
}

// ---------------------------------------------------------------------------
// P0.1 – Ziel-/einreichende Bank am Fall
// ---------------------------------------------------------------------------

export async function setCaseBank(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  // Auswahl aus der Liste ODER Freitext ("Andere Bank …").
  const bankName = str(formData, "bankNameFree") ?? str(formData, "bankName") ?? null;
  await prisma.case.update({ where: { id: caseId }, data: { bankName } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { bankName: bankName ?? "(keine)" },
  });
  revalidateCase(caseId);
  revalidatePath(`/cases/${caseId}/edit`);
}

// ---------------------------------------------------------------------------
// P1.7 – Kontakthistorie / Notizen / Wiedervorlage
// ---------------------------------------------------------------------------

export async function addCaseNote(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const body = str(formData, "body");
  if (!body) return;
  const kindRaw = str(formData, "kind");
  const kind: CaseNoteKind =
    kindRaw && (CASE_NOTE_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as CaseNoteKind)
      : "notiz";

  await prisma.caseNote.create({
    data: { caseId, authorId: ctx.userId, kind, body },
  });

  // Eine als "Wiedervorlage" erfasste Notiz mit Datum setzt zugleich den Fall-Termin.
  const wiedervorlage = date(formData, "wiedervorlage");
  if (kind === "wiedervorlage" && wiedervorlage) {
    await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage } });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { note: kind },
  });
  revalidateCase(caseId);
}

export async function setWiedervorlage(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const wiedervorlage = date(formData, "wiedervorlage");
  await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { wiedervorlage: wiedervorlage?.toISOString() ?? "(gelöscht)" },
  });
  revalidateCase(caseId);
}

export async function deleteCaseNote(noteId: string): Promise<void> {
  const note = await prisma.caseNote.findUnique({
    where: { id: noteId },
    select: { caseId: true, case: { select: { organizationId: true } } },
  });
  if (!note) return;
  const { ctx } = await requireCaseAccess(note.caseId);
  if (note.case.organizationId !== ctx.organizationId) return;
  await prisma.caseNote.delete({ where: { id: noteId } });
  revalidateCase(note.caseId);
}

/** Kanäle, über die ein Kontaktversuch laufen kann. E-Mail zählt nicht mit –
 *  sie erreicht niemanden, sie wartet auf Antwort. */
const KONTAKT_KANAELE = ["telefon", "whatsapp"] as const;

/**
 * Hält einen Kontaktversuch fest – die Schreibseite der geführten
 * Kontaktaufnahme.
 *
 * Bewusst ein Vermerk und keine eigene Tabelle: `CaseNote` IST die
 * Kontakthistorie und wird auf der Verwaltungsseite bereits angezeigt. So
 * steht der Versuch ohne Zusatzarbeit dort, wo der Vermittler ihn sucht.
 *
 * Der Text wird erzeugt, nicht erfragt: Im Gespräch tippt niemand.
 */
export async function kontaktVersuchErfassen(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  const kanalRoh = str(formData, "kanal");
  const ergebnisRoh = str(formData, "ergebnis");
  if (!(KONTAKT_KANAELE as readonly string[]).includes(kanalRoh ?? "")) return;
  if (!(KONTAKT_ERGEBNISSE as readonly string[]).includes(ergebnisRoh ?? "")) return;
  const kanal = kanalRoh as (typeof KONTAKT_KANAELE)[number];
  const ergebnis = ergebnisRoh as KontaktErgebnis;

  const bisher = await prisma.caseNote.count({
    where: { caseId, ergebnis: "nicht_erreicht" },
  });

  const body =
    ergebnis === "erreicht"
      ? kanal === "telefon"
        ? "Telefonisch erreicht."
        : "Antwort über WhatsApp erhalten."
      : kanal === "telefon"
        ? `Nicht erreicht (${bisher + 1}. Versuch).`
        : `WhatsApp geschrieben (${bisher + 1}. Versuch).`;

  await prisma.caseNote.create({
    data: { caseId, authorId: ctx.userId, kind: kanal, ergebnis, body },
  });

  const wiedervorlage = date(formData, "wiedervorlage");
  if (ergebnis === "erreicht" && wiedervorlage) {
    await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage } });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
  });

  // `revalidateCase` statt eines blossen `revalidatePath("/cases/<id>")`: Der
  // Versuch IST ein Vermerk, und die Vermerkliste steht auf
  // /cases/<id>/verwaltung – ausgerechnet die Seite, wegen der es ein
  // `CaseNote` geworden ist, blieb sonst auf dem alten Stand. Das Dashboard
  // kommt dazu, weil der Kontaktstand dort die To-do-Reihenfolge bestimmt.
  revalidateCase(caseId);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Freier Notizblock am Fall
// ---------------------------------------------------------------------------

export type NotizenFormState = { ok?: boolean; error?: string };

/**
 * Speichert den freien Notizblock des Falls (`Case.notes`).
 *
 * Bewusst KEIN `CaseNote`: Vermerke sind Ereignisse (wer hat wann was getan)
 * und stehen chronologisch in der Verwaltung. Dieser Block ist der Gegenpol –
 * ein Schmierzettel, der immer den aktuellen Stand zeigt und den man
 * ueberschreibt, statt ihn fortzuschreiben. Beides in einen Topf zu werfen
 * hiesse, entweder die Historie zu verlieren oder den Zettel zu zerreissen.
 */
export async function setCaseNotes(
  caseId: string,
  _prev: NotizenFormState,
  formData: FormData,
): Promise<NotizenFormState> {
  const { ctx } = await requireCaseAccess(caseId);

  const roh = formData.get("notes");
  const text = typeof roh === "string" ? roh.trim() : "";
  if (text.length > NOTIZEN_MAX_ZEICHEN) {
    return {
      error: `Die Notizen sind zu lang (${text.length} von ${NOTIZEN_MAX_ZEICHEN} Zeichen). Nichts gespeichert.`,
    };
  }
  // Leer heisst "keine Notiz" (null), nicht "Notiz mit leerem Text": Sonst
  // muesste jede Abfrage nach "hat der Fall Notizen?" den leeren String extra
  // abfangen.
  const notes = text.length > 0 ? text : null;

  await prisma.case.update({ where: { id: caseId }, data: { notes } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    // Nur die Laenge, nie der Inhalt: Im Notizblock stehen Dinge ueber
    // Menschen, die im Pruefprotokoll nichts verloren haben.
    metadata: { notizen: notes ? `${notes.length} Zeichen` : "(geleert)" },
  });
  revalidateCase(caseId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// P0.3 – Fristen
// ---------------------------------------------------------------------------

export async function addDeadline(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const dueDate = date(formData, "dueDate");
  const title = str(formData, "title");
  if (!dueDate || !title) return;
  const kindRaw = str(formData, "kind");
  const kind: DeadlineKind =
    kindRaw && (DEADLINE_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as DeadlineKind)
      : "sonstige";

  await prisma.caseDeadline.create({ data: { caseId, kind, title, dueDate } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { deadline: kind, dueDate: dueDate.toISOString() },
  });
  revalidateCase(caseId);
}

export async function toggleDeadline(deadlineId: string): Promise<void> {
  const dl = await prisma.caseDeadline.findUnique({
    where: { id: deadlineId },
    select: { caseId: true, done: true, case: { select: { organizationId: true } } },
  });
  if (!dl) return;
  const { ctx } = await requireCaseAccess(dl.caseId);
  if (dl.case.organizationId !== ctx.organizationId) return;
  await prisma.caseDeadline.update({ where: { id: deadlineId }, data: { done: !dl.done } });
  revalidateCase(dl.caseId);
}

// ---------------------------------------------------------------------------
// P0.3 – Nach der Einreichung: Bank-Status & Nachforderungen
// ---------------------------------------------------------------------------

/** Markiert den Fall als bei der Bank eingereicht. */
export async function markSubmittedToBank(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await prisma.case.updateMany({
    where: { id: caseId, status: { in: ["einreichungsfertig", "exportiert"] } },
    data: { status: "uebertragen" },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { to: "uebertragen" },
  });
  revalidateCase(caseId);
}

/** Erfasst eine Nachforderung der Bank (mit optionaler Frist) → Status wechselt. */
export async function addBankRequest(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const title = str(formData, "title");
  if (!title) return;
  const dueDate = date(formData, "dueDate");
  const reason = str(formData, "reason") ?? "Von der Bank nachgefordert.";

  await prisma.missingDocumentRequest.create({
    data: {
      caseId,
      requirementKey: `bank.nachforderung.${Date.now()}`,
      title,
      reason,
      level: "zwingend",
      requestSource: "bank",
      dueDate,
      customerVisible: true,
    },
  });
  // Zugleich eine Frist anlegen, damit die Nachforderung im Fristen-/Reminder-Blick auftaucht.
  if (dueDate) {
    await prisma.caseDeadline.create({
      data: { caseId, kind: "nachreichung", title: `Nachreichen: ${title}`, dueDate },
    });
  }
  await prisma.case.update({ where: { id: caseId }, data: { status: "bank_nachforderung" } });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { bankRequest: title, dueDate: dueDate?.toISOString() ?? null },
  });
  revalidateCase(caseId);
}

/** Erledigt eine (Bank-)Nachforderung. Sind alle erledigt, zurück auf "eingereicht". */
export async function resolveMissingRequest(requestId: string): Promise<void> {
  const req = await prisma.missingDocumentRequest.findUnique({
    where: { id: requestId },
    select: { caseId: true, case: { select: { organizationId: true } } },
  });
  if (!req) return;
  const { ctx } = await requireCaseAccess(req.caseId);
  if (req.case.organizationId !== ctx.organizationId) return;

  await prisma.missingDocumentRequest.update({
    where: { id: requestId },
    data: { resolved: true, resolvedAt: new Date() },
  });

  const offeneBankforderungen = await prisma.missingDocumentRequest.count({
    where: { caseId: req.caseId, requestSource: "bank", resolved: false },
  });
  if (offeneBankforderungen === 0) {
    await prisma.case.updateMany({
      where: { id: req.caseId, status: "bank_nachforderung" },
      data: { status: "uebertragen" },
    });
  }
  revalidateCase(req.caseId);
}

// ---------------------------------------------------------------------------
// P2.9 – Abschlussdaten (Provision / Pipeline)
// ---------------------------------------------------------------------------

export async function setCaseOutcome(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const abschlussBank = str(formData, "abschlussBank") ?? null;
  const darlehensbetrag = num(formData, "darlehensbetrag");
  const sollzinsProzent = num(formData, "sollzinsProzent");
  const courtageProzent = num(formData, "courtageProzent");
  const abschlussdatum = date(formData, "abschlussdatum");
  const markClosed = formData.get("markClosed") === "on";

  await prisma.case.update({
    where: { id: caseId },
    data: {
      abschlussBank,
      darlehensbetrag,
      sollzinsProzent,
      courtageProzent,
      abschlussdatum,
      ...(markClosed ? { status: "abgeschlossen" } : {}),
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { outcome: true, abschlussBank: abschlussBank ?? "(offen)" },
  });
  revalidateCase(caseId);
}
