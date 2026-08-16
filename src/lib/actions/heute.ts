"use server";

/**
 * Abhaken auf der Heute-Liste.
 *
 * Der Haken schreibt, wo immer es geht, die TATSACHE an den Fall statt die
 * Zeile bloß zu verstecken (siehe `ABHAKART` in `heute.ts`). Nur so weiß
 * hinterher auch die Fallakte, das Kanban und die Prioritätsleiter Bescheid.
 * Ein reiner Anzeige-Haken hätte genau den Fehler wiederholt, der bei „Kredit
 * zugesagt" an vier Stellen gleichzeitig auftrat.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { abhakartFuer, SCHRITT_LABEL } from "@/lib/cases/heute";
import type { NextStep } from "@/lib/cases/next-step";

function neuLaden(caseId: string): void {
  revalidatePath("/heute");
  revalidatePath("/dashboard");
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/verwaltung`);
}

/** Ein Schritt-Schlüssel, den die Leiter wirklich kennt – oder nichts. */
function schrittAus(formData: FormData): NextStep["key"] | null {
  const roh = formData.get("schritt");
  if (typeof roh !== "string") return null;
  return roh in SCHRITT_LABEL ? (roh as NextStep["key"]) : null;
}

/**
 * Aufgabe abhaken.
 *
 * Für die fällige Wiedervorlage nimmt das Formular stattdessen
 * `wiedervorlageErledigen` – dort ist „erledigt" nicht dasselbe wie „nie
 * wieder", und ein stilles Löschen des Termins würde den häufigen Ausgang
 * („nochmal in drei Tagen") wegwerfen.
 */
export async function aufgabeAbhaken(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const schritt = schrittAus(formData);
  if (!schritt) return;

  const art = abhakartFuer(schritt);

  if (art === "erstgespraech") {
    // Die Tatsache gehört an den Fall: Genau dieses Feld liest die
    // Prioritätsleiter, die Fallakte und die Kanban-Karte.
    await prisma.case.update({
      where: { id: caseId },
      data: { erstgespraechGefuehrtAm: new Date() },
    });
  } else if (art === "wiedervorlage") {
    await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage: null } });
  } else {
    // `upsert` statt `create`: Zwei Klicks kurz hintereinander (oder zwei
    // offene Tabs) dürfen keinen zweiten Vermerk erzeugen – das Rückgängig
    // löschte sonst nur einen davon und die Aufgabe bliebe weg.
    await prisma.aufgabeErledigt.upsert({
      where: { caseId_schritt: { caseId, schritt } },
      create: { caseId, schritt, userId: ctx.userId },
      update: { erledigtAm: new Date(), userId: ctx.userId },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "heute_abhaken", schritt, art },
  });
  neuLaden(caseId);
}

/**
 * Eine fällige Wiedervorlage abschließen.
 *
 * Ohne Datum: erledigt, der Termin fällt weg. Mit Datum: neuer Termin, die
 * Aufgabe verschwindet heute und kommt an dem Tag von selbst zurück. Der
 * Termin MUSS in der Zukunft liegen – ein Datum von gestern hieße „sofort
 * wieder überfällig", und der Klick hätte nichts bewirkt.
 */
export async function wiedervorlageErledigen(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  const roh = formData.get("wiederAm");
  const gewuenscht = typeof roh === "string" && roh.trim() !== "" ? new Date(roh) : null;
  const gueltig =
    gewuenscht && !Number.isNaN(gewuenscht.getTime()) && gewuenscht.getTime() > Date.now()
      ? gewuenscht
      : null;

  await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage: gueltig } });

  // Als Vermerk am Fall festhalten – die Wiedervorlage ist Kontakthistorie,
  // und auf /cases/<id>/verwaltung steht die Liste, in der sie erwartet wird.
  await prisma.caseNote.create({
    data: {
      caseId,
      authorId: ctx.userId,
      kind: "wiedervorlage",
      body: gueltig
        ? `Wiedervorlage bearbeitet, neuer Termin: ${gueltig.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}.`
        : "Wiedervorlage erledigt.",
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "heute_wiedervorlage", neuerTermin: gueltig?.toISOString() ?? null },
  });
  neuLaden(caseId);
}

/**
 * Einen Haken zurücknehmen.
 *
 * Nur für Vermerke: Das Erstgespräch und die Wiedervorlage werden über die
 * Fallakte zurückgenommen, wo das Feld ohnehin steht – dafür hier einen
 * zweiten Weg zu bauen, hieße zwei Stellen für dieselbe Änderung.
 */
export async function aufgabeZuruecknehmen(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const roh = formData.get("schritt");
  if (typeof roh !== "string" || roh.trim() === "") return;

  // `deleteMany` statt `delete`: Ist der Vermerk schon weg (Doppelklick,
  // zweiter Tab), wirft `delete` und der Nutzer sähe eine Fehlerseite für
  // etwas, das genau so gewollt war.
  await prisma.aufgabeErledigt.deleteMany({ where: { caseId, schritt: roh } });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "heute_zuruecknehmen", schritt: roh },
  });
  neuLaden(caseId);
}
