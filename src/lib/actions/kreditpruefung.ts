"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import type { KreditpruefungStand } from "@/lib/cases/kreditpruefung";

/**
 * Was bei der Bank zur Kreditpruefung eingereicht wurde.
 *
 * Der Anlass (Juergen, 19.08.2026): Im Kanban gibt es die Phase "Kreditpruefung
 * eingereicht", aber nirgends stand, BEI WEM und zu welchen Konditionen. Ohne
 * diese fuenf Angaben ist die Phase eine leere Behauptung – man sieht, dass
 * etwas raus ist, aber nicht was.
 *
 * Kein Feld blockiert: Der Phasenwechsel geht auch ohne die Angaben durch, die
 * Luecke wird danach sichtbar angezeigt. Dieselbe Regel wie in der
 * Erstgespraechsmaske – eine Maske, die den Vermittler aufhaelt, wird
 * umgangen, nicht ausgefuellt.
 */

/**
 * Liest den Stand und fuellt leere Felder mit dem VORSCHLAG aus den
 * Kundenwuenschen vor (Darlehenswunsch, gewuenschte Zinsbindung, Wunschrate,
 * Zielbank). Das ist nur eine Eingabehilfe: Gespeichert wird ausschliesslich,
 * was der Vermittler bestaetigt – sonst stuende irgendwann ein Wunsch als
 * eingereichte Kondition in der Akte.
 */
export async function ladeKreditpruefung(caseId: string): Promise<{
  stand: KreditpruefungStand | null;
  vorschlag: {
    bank: string | null;
    darlehenssumme: number | null;
    zinsbindungJahre: number | null;
    rateMonatlich: number | null;
  };
}> {
  await requireCaseAccess(caseId);

  const [k, fall] = await Promise.all([
    prisma.kreditpruefung.findUnique({ where: { caseId } }),
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        bankName: true,
        europaceVorgangId: true,
        financingRequest: {
          select: { darlehenswunsch: true, zinsbindungJahre: true, wunschrateMonatlich: true },
        },
      },
    }),
  ]);

  const stand: KreditpruefungStand | null = k
    ? {
        bank: k.bank,
        darlehenssumme: k.darlehenssumme,
        sollzinsProzent: k.sollzinsProzent,
        zinsbindungJahre: k.zinsbindungJahre,
        rateMonatlich: k.rateMonatlich,
        tilgungProzent: k.tilgungProzent,
        plattform: k.plattform,
        quelle: k.quelle,
        eingereichtAm: k.eingereichtAm ? k.eingereichtAm.toISOString().slice(0, 10) : null,
        notiz: k.notiz,
        leer:
          !k.bank &&
          k.darlehenssumme == null &&
          k.sollzinsProzent == null &&
          k.zinsbindungJahre == null &&
          k.rateMonatlich == null &&
          k.tilgungProzent == null,
      }
    : null;

  return {
    stand,
    vorschlag: {
      bank: fall?.bankName ?? null,
      darlehenssumme: fall?.financingRequest?.darlehenswunsch ?? null,
      zinsbindungJahre: fall?.financingRequest?.zinsbindungJahre ?? null,
      rateMonatlich: fall?.financingRequest?.wunschrateMonatlich ?? null,
    },
  };
}

/** Liest eine deutsche Zahleingabe ("320.000", "3,45 %") als Zahl. */
function zahl(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  // Punkt = Tausendertrenner, Komma = Dezimaltrenner (deutsche Eingabe).
  // "3.45" waere sonst 345 – deshalb wird der Punkt nur entfernt, wenn er
  // wie ein Tausendertrenner steht (drei Ziffern dahinter).
  const bereinigt = t
    .replace(/[€%\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(bereinigt);
  return Number.isFinite(n) ? n : null;
}

function text(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Speichert die Einreichungsdaten. Legt den Datensatz an, wenn es ihn noch
 * nicht gibt, und setzt auf Wunsch zugleich die Vertriebsphase – dann ist der
 * Zug ins Kanban und das Erfassen EIN Vorgang und nicht zwei.
 */
export async function speichereKreditpruefung(
  caseId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);

  const daten = {
    bank: text(formData, "bank"),
    darlehenssumme: zahl(formData, "darlehenssumme"),
    sollzinsProzent: zahl(formData, "sollzinsProzent"),
    zinsbindungJahre: (() => {
      const n = zahl(formData, "zinsbindungJahre");
      return n == null ? null : Math.round(n);
    })(),
    rateMonatlich: zahl(formData, "rateMonatlich"),
    tilgungProzent: zahl(formData, "tilgungProzent"),
    plattform: text(formData, "plattform"),
    notiz: text(formData, "notiz"),
    eingereichtAm: (() => {
      const d = text(formData, "eingereichtAm");
      if (!d) return null;
      const parsed = new Date(d);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })(),
    quelle: "manuell",
  };

  await prisma.kreditpruefung.upsert({
    where: { caseId },
    create: { caseId, ...daten },
    update: daten,
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { kreditpruefung: daten.bank ?? "ohne Bank" },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
  return {};
}
