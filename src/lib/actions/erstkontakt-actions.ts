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

  // Genau der Entwurf, den `bereiteErstkontaktVor` angelegt hat. Vorher wurde
  // die aelteste Nachricht mit templateType "erstnachforderung" gesucht - ein
  // Typ, den der Vermittler jederzeit selbst erzeugen kann. Ein alter, nie
  // versendeter Nachforderungsentwurf liess die Karte dann "Entwurf liegt
  // bereit" behaupten, obwohl kein Erstkontakt vorbereitet und kein
  // Selbstauskunfts-Link erzeugt worden war.
  const entwurf = fall.erstkontaktMessageId
    ? await prisma.generatedMessage.findUnique({
        where: { id: fall.erstkontaktMessageId },
        select: { id: true, sent: true, sentAt: true },
      })
    : null;

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

export interface ErstkontaktVorbereitenState {
  error?: string;
  success?: string;
}

export async function erstkontaktVorbereitenAction(
  _prev: ErstkontaktVorbereitenState,
  formData: FormData
): Promise<ErstkontaktVorbereitenState> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return { error: "Kein Fall angegeben." };

  // Bewusst VOR dem try: `requireCaseAccess` ruft im Zweifel `notFound()`, und
  // das wirft einen Next.js-Steuerfehler, der nach oben durchlaufen muss. Faenge
  // ihn ein try/catch ab, wuerde aus einer sauberen 404 eine belanglose
  // Fehlermeldung an der Karte.
  const { ctx } = await requireCaseAccess(caseId);

  // `bereiteErstkontaktVor` wirft, wenn die Linkanlage oder die Vorlage
  // scheitert. Ungefangen sah der Vermittler dafuer die Next.js-Fehlerseite und
  // verlor den Fall unter den Fuessen – statt einer Zeile an der Karte, die
  // sagt, was schiefging und dass er es erneut versuchen kann.
  let ergebnis;
  try {
    ergebnis = await bereiteErstkontaktVor(caseId, { actorUserId: ctx.userId });
  } catch (e) {
    console.error("[erstkontakt] Vorbereitung fehlgeschlagen:", e);
    return {
      error:
        "Der Erstkontakt konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut" +
        " – wenn es wieder scheitert, melden Sie sich bitte.",
    };
  }

  revalidatePath(`/cases/${caseId}`);

  // Auch die geordneten Ausgaenge bekommen einen Satz: vorher blieb die Karte
  // stumm, wenn gar nichts passieren konnte.
  if (ergebnis.status === "kein_empfaenger") {
    return {
      error:
        "Für diesen Fall ist keine E-Mail-Adresse hinterlegt. Bitte in den Kundendaten ergänzen.",
    };
  }
  if (ergebnis.status === "schon_vorbereitet") {
    return { success: "Der Erstkontakt war bereits vorbereitet." };
  }
  return { success: "Erstkontakt vorbereitet – der Entwurf liegt zum Prüfen bereit." };
}
