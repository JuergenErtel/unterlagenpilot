"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { schrittFinden, naechsterSchritt, schluessel } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import type { Antworten } from "@/lib/self-disclosure/types";

export interface SchrittState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Speichert einen Schritt und schickt den Kunden zum nächsten.
 *
 * Grundsatz: Ein leerer Schritt ist gültig und wird übersprungen – er schreibt
 * nichts. Geprüft wird nur die Form eingegebener Werte; ungeprüfte Rohdaten
 * landen nie in der Datenbank.
 */
export async function speichereAntwort(
  token: string,
  schrittId: string,
  formData: FormData
): Promise<SchrittState | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bestand = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true },
  });
  if (bestand?.submittedAt) {
    return {
      error: "Ihre Angaben wurden bereits übermittelt. Bitte wenden Sie sich an Ihren Berater.",
    };
  }

  const antworten = ((bestand?.answers as Antworten | null) ?? {}) as Antworten;
  const schritt = schrittFinden(schrittId, antworten);
  if (!schritt) return { error: "Dieser Schritt gehört nicht zu Ihrem Bogen." };

  const roh = Object.fromEntries(formData.entries());
  const geprueft = schrittSchema(schritt.schritt).safeParse(roh);
  if (!geprueft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of geprueft.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };
  }

  // Nur tatsächlich gegebene Werte schreiben. Eine Lücke darf einen früher
  // gegebenen Wert nicht löschen – der Kunde springt oft zurück.
  const neu: Antworten = { ...antworten };
  for (const [feldId, value] of Object.entries(geprueft.data)) {
    if (value === null || value === undefined || value === "") continue;
    neu[schluessel(schritt.id, feldId)] = value as Antworten[string];
  }

  const nach = naechsterSchritt(schritt.id, neu);
  const currentStep = nach?.id ?? "zusammenfassung";

  await prisma.selfDisclosure.upsert({
    where: { linkId: access.linkId },
    create: { linkId: access.linkId, caseId: access.caseId, answers: neu as object, currentStep },
    update: { answers: neu as object, currentStep },
  });

  redirect(`/selbstauskunft/${token}/${currentStep}`);
}

/**
 * Schließt den Bogen ab. Lücken sind ausdrücklich erlaubt – der Eingang zeigt
 * sie dem Vermittler als Nachfassliste. Ab hier ist der Bogen nur noch lesbar.
 */
export async function sendeAb(token: string): Promise<{ error?: string } | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { id: true, submittedAt: true },
  });
  if (!bogen) return { error: "Es sind noch keine Angaben gespeichert." };
  if (bogen.submittedAt) return { error: "Ihre Angaben wurden bereits übermittelt." };

  await prisma.selfDisclosure.update({
    where: { id: bogen.id },
    data: { submittedAt: new Date(), currentStep: "zusammenfassung" },
  });

  await audit({
    organizationId: access.organizationId,
    userId: null,
    action: "case.updated",
    entityType: "case",
    entityId: access.caseId,
    metadata: { quelle: "selbstauskunft", ereignis: "eingegangen" },
  });
}
