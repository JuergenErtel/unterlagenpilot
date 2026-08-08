import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/session";
import {
  entwerteOffeneToken,
  erstelleToken,
  findeToken,
  verbraucheToken,
  TOKEN_GUELTIGKEIT,
} from "@/lib/auth/tokens";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { PLAN_TIERS } from "@/lib/domain/enums";

/**
 * Registrierungsantraege. Organisation und Nutzer entstehen bewusst erst bei der
 * Freigabe (siehe gibFrei in freigabe.ts) – hier wird nur der Antrag gefuehrt.
 *
 * Kein audit() in diesem Modul: das Audit-Log verlangt zwingend eine
 * organizationId, die es vor der Freigabe nicht gibt.
 */

/** Fassung der AGB/Datenschutzerklaerung, der zugestimmt wurde. Bei jeder
 *  inhaltlichen Aenderung hochzaehlen – der Nachweis haengt daran. */
export const AGB_VERSION = "2026-08-08";

export const SIGNUP_EINGABE = z.object({
  name: z.string().trim().min(2, "Bitte Ihren Namen angeben."),
  firmenname: z.string().trim().min(2, "Bitte den Firmennamen angeben."),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  telefon: z.string().trim().max(40).optional().or(z.literal("")),
  passwort: z.string().superRefine((wert, ctx) => {
    const pruefung = pruefePasswort(wert);
    if (!pruefung.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: pruefung.grund });
  }),
  wunschtarif: z.enum(PLAN_TIERS).optional(),
  agb: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätigen Sie AGB und Datenschutzerklärung." }),
  }),
});

export type SignupEingabe = z.infer<typeof SIGNUP_EINGABE>;

export type AntragErgebnis =
  | { status: "neu_angelegt"; requestId: string; token: string }
  | { status: "bereits_vergeben" }
  | { status: "zu_haeufig" };

/** Mindestabstand zwischen zwei Mails an dieselbe Adresse. Diese Sperre steht in
 *  der Datenbank, weil das In-Memory-Rate-Limit auf Vercel nur pro Instanz
 *  greift und ein zweiter Serverprozess sonst munter weiter verschickt. */
const MAIL_ABSTAND_MS = 5 * 60 * 1000;

/**
 * Legt einen Antrag an – oder meldet, dass die Adresse belegt ist.
 *
 * Der Unterschied ist NUR fuer die Wahl der Mail gedacht. Nach aussen muss die
 * aufrufende Server Action in beiden Faellen dieselbe Antwort geben, sonst wird
 * das Formular zum Kontopruefer.
 *
 * Ein noch unbestaetigter Antrag (Status "neu") ist wiederholbar: der Aufruf
 * entwertet die alten Bestaetigungslinks und liefert ein frisches Token –
 * die gespeicherten Daten des offenen Antrags bleiben dabei unangetastet.
 * Nach aussen ununterscheidbar von einer Erstanmeldung.
 */
export async function erstelleAntrag(
  eingabe: SignupEingabe,
  meta: { ip: string | null }
): Promise<AntragErgebnis> {
  const email = eingabe.email.trim().toLowerCase();

  // Hash BEVOR Existenzabfragen – alle Pfade zahlen gleiche Kosten,
  // sonst ist Timing-Angriff möglich (ob Adresse existiert, verrät sich durch Antwortzeit).
  // Vgl. getDummyPasswordHash in session.ts – gleiches Muster.
  const passwordHash = hashPassword(eingabe.passwort);

  const [nutzer, vorhanden] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.signupRequest.findUnique({ where: { email } }),
  ]);
  // Belegt ist eine Adresse nur durch ein echtes Konto oder durch einen bereits
  // bestaetigten/freigegebenen Antrag. Ein Antrag im Status "neu" belegt sie
  // ausdruecklich NICHT: Wer den Bestaetigungslink nie angeklickt hat (Mail im
  // Spam, Versand gescheitert, schlicht vergessen), muss einen neuen anfordern
  // koennen. Sonst waere die Adresse fuer immer verbrannt – und ein Dritter
  // koennte fremde Adressen vorregistrieren und die Betroffenen damit dauerhaft
  // von der Registrierung aussperren.
  const belegt =
    Boolean(nutzer) || vorhanden?.status === "bestaetigt" || vorhanden?.status === "freigegeben";

  // Wiederholte Versuche auf dieselbe Adresse duerfen keine Mailflut ausloesen –
  // gleich, welche der beiden Mails es waere.
  if (vorhanden?.letzteMailAm && Date.now() - vorhanden.letzteMailAm.getTime() < MAIL_ABSTAND_MS) {
    return { status: "zu_haeufig" };
  }
  if (nutzer?.letzteHinweisMailAm && Date.now() - nutzer.letzteHinweisMailAm.getTime() < MAIL_ABSTAND_MS) {
    return { status: "zu_haeufig" };
  }

  if (belegt) {
    if (vorhanden) {
      await prisma.signupRequest.update({
        where: { id: vorhanden.id },
        data: { letzteMailAm: new Date() },
      });
    }
    if (nutzer) {
      await prisma.user.update({
        where: { id: nutzer.id },
        data: { letzteHinweisMailAm: new Date() },
      });
    }
    return { status: "bereits_vergeben" };
  }

  // Wiederholung auf einen noch OFFENEN Antrag: der vorhandene Datensatz wird
  // ausdruecklich NICHT angefasst – kein neuer passwordHash, kein neuer Name,
  // keine neue Firma. Sonst koennte ein Dritter einen fremden offenen Antrag
  // mit SEINEM Passwort ueberschreiben; das Opfer bekaeme die
  // Bestaetigungsmail, klickte sie (es hat sich ja selbst angemeldet), und das
  // bei der Freigabe entstehende Konto truege das Passwort des Angreifers.
  // Ausgeloest wird deshalb nur: alte Links entwerten, neuen erzeugen, Mail
  // erneut verschicken. Nach aussen ist das von einer Erstanmeldung nicht zu
  // unterscheiden (gleiche Antwort, gleiche Weiterleitung).
  if (vorhanden && vorhanden.status === "neu") {
    await prisma.signupRequest.update({
      where: { id: vorhanden.id },
      data: { letzteMailAm: new Date() },
    });
    await entwerteOffeneToken("email_bestaetigung", { signupRequestId: vorhanden.id });
    const { token } = await erstelleToken({
      zweck: "email_bestaetigung",
      signupRequestId: vorhanden.id,
      gueltigSekunden: TOKEN_GUELTIGKEIT.email_bestaetigung,
    });
    return { status: "neu_angelegt", requestId: vorhanden.id, token };
  }

  // Ab hier: es gibt gar keinen Antrag oder nur einen abgelehnten. Der
  // abgelehnte wird mit den neuen Daten ueberschrieben – dort ist niemandes
  // offener Vorgang zu schuetzen, der Interessent meldet sich neu an.
  const daten = {
    email,
    passwordHash,
    name: eingabe.name.trim(),
    firmenname: eingabe.firmenname.trim(),
    telefon: eingabe.telefon?.trim() || null,
    wunschtarif: eingabe.wunschtarif ?? null,
    status: "neu" as const,
    agbVersion: AGB_VERSION,
    agbAkzeptiertAm: new Date(),
    agbIp: meta.ip,
    letzteMailAm: new Date(),
  };

  const antrag = vorhanden
    ? await prisma.signupRequest.update({ where: { id: vorhanden.id }, data: daten })
    : await prisma.signupRequest.create({ data: daten });

  // Der Wiederanlauf nach einer Ablehnung entwertet die Links der frueheren
  // Mails. Sonst blieben mehrere gueltige Links zu derselben Adresse im Umlauf –
  // und ein alter Link wuerde einen inzwischen ueberschriebenen Antrag bestaetigen.
  if (vorhanden) {
    await entwerteOffeneToken("email_bestaetigung", { signupRequestId: antrag.id });
  }

  const { token } = await erstelleToken({
    zweck: "email_bestaetigung",
    signupRequestId: antrag.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.email_bestaetigung,
  });

  return { status: "neu_angelegt", requestId: antrag.id, token };
}

export type BestaetigungVorschau =
  | { ok: true; firmenname: string; bereitsBestaetigt: boolean }
  | { ok: false; grund: "ungueltig" | "abgelehnt" };

/**
 * Lesende Vorschau fuer die Bestaetigungsseite – veraendert NICHTS.
 *
 * Die Seite darf das Token nicht beim Rendern verbrauchen: Link-Scanner in
 * Firmen-Mailservern rufen die URL vor dem Menschen ab und wuerden den Link
 * entwerten. Bestaetigt wird deshalb erst per Knopfdruck (bestaetigeEmail),
 * wie bei /passwort-neu und /einladung auch.
 */
export async function liesBestaetigung(token: string): Promise<BestaetigungVorschau> {
  const treffer = await findeToken(token, "email_bestaetigung");
  if (!treffer?.signupRequestId) return { ok: false, grund: "ungueltig" };

  const antrag = await prisma.signupRequest.findUnique({ where: { id: treffer.signupRequestId } });
  if (!antrag) return { ok: false, grund: "ungueltig" };
  if (antrag.status === "abgelehnt") return { ok: false, grund: "abgelehnt" };

  return {
    ok: true,
    firmenname: antrag.firmenname,
    bereitsBestaetigt: antrag.status !== "neu",
  };
}

export type BestaetigungErgebnis =
  | { ok: true; email: string; firmenname: string }
  | { ok: false; grund: "ungueltig" | "abgelehnt" };

export async function bestaetigeEmail(token: string): Promise<BestaetigungErgebnis> {
  const treffer = await verbraucheToken(token, "email_bestaetigung");
  if (!treffer?.signupRequestId) return { ok: false, grund: "ungueltig" };

  const antrag = await prisma.signupRequest.findUnique({ where: { id: treffer.signupRequestId } });
  if (!antrag) return { ok: false, grund: "ungueltig" };
  if (antrag.status === "abgelehnt") return { ok: false, grund: "abgelehnt" };
  // Schon bestaetigt oder bereits freigegeben: nicht zurueckdrehen.
  if (antrag.status !== "neu") {
    return { ok: true, email: antrag.email, firmenname: antrag.firmenname };
  }

  await prisma.signupRequest.update({
    where: { id: antrag.id },
    data: { status: "bestaetigt", emailBestaetigtAm: new Date() },
  });

  return { ok: true, email: antrag.email, firmenname: antrag.firmenname };
}
