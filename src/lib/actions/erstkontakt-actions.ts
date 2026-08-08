"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { bereiteErstkontaktVor } from "@/lib/cases/erstkontakt";

/**
 * Oberflaechenseite des Erstkontakts. Bereitet vor und liest den Stand –
 * versendet aber NICHT selbst. Der Versand laeuft ueber die vorhandene
 * `sendeNachricht`, damit es genau einen Weg an Kunden gibt, der die
 * Versandsperre und die Doppelklick-Sicherung traegt.
 */
export interface ErstkontaktStand {
  vorbereitetAm: Date | null;
  messageId: string | null;
  /** true, sobald die Nachricht tatsaechlich verschickt wurde. */
  versendet: boolean;
  /**
   * Tatsaechlicher Sendezeitpunkt, falls bekannt. Kann bei `versendet: true`
   * dennoch `null` sein (Altbestand ohne `sentAt`) - dann darf die
   * Oberflaeche kein Datum behaupten, aber trotzdem "versendet" anzeigen.
   */
  versendetAm: Date | null;
  empfaenger: string | null;
}

export async function ladeErstkontaktStand(caseId: string): Promise<ErstkontaktStand> {
  // Diese Datei traegt "use server": jede exportierte Funktion ist ein
  // eigener, oeffentlich erreichbarer Endpunkt, unabhaengig davon, dass die
  // Fallseite selbst den Zugriff bereits prueft. Ohne diesen Aufruf koennte
  // jeder mit einer beliebigen Fall-ID die Empfaenger-Mailadresse abfragen.
  await requireCaseAccess(caseId);
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    // Reihenfolge wie beim tatsaechlichen Versand (sendMessageByEmail):
    // sonst kann die Karte eine andere Adresse zeigen als die, an die
    // tatsaechlich gesendet wird.
    include: { applicants: { orderBy: { position: "asc" }, select: { email: true } } },
  });
  if (!fall) {
    return { vorbereitetAm: null, messageId: null, versendet: false, versendetAm: null, empfaenger: null };
  }

  const entwurf = await prisma.generatedMessage.findFirst({
    where: { caseId, channel: "email", templateType: "erstnachforderung" },
    orderBy: { createdAt: "asc" },
    select: { id: true, sent: true, sentAt: true },
  });

  const empfaenger =
    fall.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null;

  return {
    vorbereitetAm: fall.erstkontaktVorbereitetAm ?? null,
    messageId: entwurf?.id ?? null,
    versendet: entwurf?.sent ?? false,
    versendetAm: entwurf?.sentAt ?? null,
    empfaenger,
  };
}

export async function erstkontaktVorbereitenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;
  const { ctx } = await requireCaseAccess(caseId);
  await bereiteErstkontaktVor(caseId, { actorUserId: ctx.userId });
  revalidatePath(`/cases/${caseId}`);
}
