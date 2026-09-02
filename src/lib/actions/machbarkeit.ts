"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext, akteSichtbarWhere, type AppContext } from "@/lib/auth/context";
import { BUNDESLAENDER } from "@/lib/machbarkeit/bundesland";

/** Stellt sicher, dass der Fall zur Organisation des Nutzers gehoert. */
async function pruefeFall(caseId: string, ctx: AppContext): Promise<boolean> {
  if (!caseId) return false;
  const fall = await prisma.case.findFirst({
    where: { id: caseId, ...akteSichtbarWhere(ctx) },
    select: { id: true },
  });
  return fall != null;
}

/**
 * Bundesland von Hand festlegen, wenn die PLZ ueber eine Landesgrenze laeuft
 * und der Ort nicht half.
 */
export async function setzeBundesland(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const wert = String(formData.get("bundesland") ?? "");
  if (!(BUNDESLAENDER as readonly string[]).includes(wert)) return;
  if (!(await pruefeFall(caseId, ctx))) return;

  // Ein Fall ohne Objektdatensatz soll daran nicht scheitern.
  await prisma.property.upsert({
    where: { caseId },
    create: { caseId, bundesland: wert },
    update: { bundesland: wert },
  });
  revalidatePath(`/cases/${caseId}/machbarkeit`);
}

/** Grunderwerbsteuersatz ueberschreiben. */
export async function setzeGrunderwerbsteuer(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const roh = Number(String(formData.get("satz") ?? "").replace(",", "."));
  if (!Number.isFinite(roh) || roh < 0 || roh > 10) return;
  if (!(await pruefeFall(caseId, ctx))) return;

  await prisma.financingRequest.upsert({
    where: { caseId },
    create: { caseId, grunderwerbsteuerProzent: roh },
    update: { grunderwerbsteuerProzent: roh },
  });
  revalidatePath(`/cases/${caseId}/machbarkeit`);
}

/**
 * Marktannahmen der Organisation speichern.
 *
 * Alles oder nichts: ein halb gespeichertes Zinsgeruest waere schlimmer als die
 * Vorgabewerte, weil es plausibel aussieht.
 */
export async function speichereAnnahmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();

  const zahl = (name: string, min: number, max: number): number | null => {
    const n = Number(String(formData.get(name) ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  const basiszinsProzent = zahl("basiszinsProzent", 0, 20);
  const aufschlagBis80 = zahl("aufschlagBis80", 0, 5);
  const aufschlagBis90 = zahl("aufschlagBis90", 0, 5);
  const aufschlagBis100 = zahl("aufschlagBis100", 0, 5);
  const aufschlagBis110 = zahl("aufschlagBis110", 0, 5);

  if (
    basiszinsProzent == null ||
    aufschlagBis80 == null ||
    aufschlagBis90 == null ||
    aufschlagBis100 == null ||
    aufschlagBis110 == null
  ) {
    return;
  }

  const werte = {
    basiszinsProzent,
    aufschlagBis80,
    aufschlagBis90,
    aufschlagBis100,
    aufschlagBis110,
  };
  await prisma.machbarkeitsAnnahmen.upsert({
    where: { organizationId: ctx.organizationId },
    create: { organizationId: ctx.organizationId, ...werte },
    update: werte,
  });
  revalidatePath("/settings/machbarkeit");
}
