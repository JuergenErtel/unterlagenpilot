/**
 * Die SMS nach einem erfolglosen Anruf: Textbausteine und wann die Fallseite
 * sie anbietet. Reine Funktionen, keine DB, keine Uhr (`jetzt` kommt herein –
 * dieselbe Regel wie in `kontakt.ts`).
 *
 * BaufiDesk verschickt die SMS nicht. Es baut nur den Text, den Jürgen in
 * der Nachrichten-App seines iPhones abschickt.
 */

import { renderTemplate } from "@/lib/messages/render";

/** Der Text sagt "eben nicht erreicht" – nach einem halben Tag stimmt das nicht mehr. */
export const SMS_NACHFASS_FENSTER_STUNDEN = 12;

/** Kanäle, die als Kontaktvermerk zählen. Notizen und Wiedervorlagen nicht. */
const KONTAKT_KINDS = new Set(["telefon", "whatsapp", "sms"]);

export interface SmsNachfassEingabe {
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  ort?: string | null;
  plz?: string | null;
  beraterName: string;
  website?: string | null;
}

export interface KontaktVermerk {
  kind: string;
  ergebnis: "erreicht" | "nicht_erreicht" | null;
  createdAt: Date;
}

function sauber(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** "https://www.baufivergleicher.de/" → "baufivergleicher.de". */
export function websiteKurz(url: string | null | undefined): string {
  return sauber(url)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/**
 * Jeder Baustein bringt sein eigenes führendes Leerzeichen mit oder ist leer.
 * So entsteht ohne Ort kein "Immobilie in ." und ohne Website keine leere
 * Klammer – die Vorlage selbst muss davon nichts wissen.
 */
export function smsNachfassVars(e: SmsNachfassEingabe) {
  const vorname = sauber(e.vorname);
  const nachname = sauber(e.nachname);
  const anredeWort = e.anrede === "frau" ? "Frau" : e.anrede === "herr" ? "Herr" : "";

  let smsAnrede = "Guten Tag,";
  if (anredeWort && nachname) smsAnrede = `Guten Tag ${anredeWort} ${nachname},`;
  else if (vorname || nachname) smsAnrede = `Guten Tag ${[vorname, nachname].filter(Boolean).join(" ")},`;

  const ort = sauber(e.ort) || sauber(e.plz);
  const web = websiteKurz(e.website);

  return {
    smsAnrede,
    objektOrt: ort ? ` für eine Immobilie in ${ort}` : "",
    beraterName: sauber(e.beraterName),
    beraterWebsite: web ? ` (${web})` : "",
  };
}

/**
 * Bietet die Fallseite gerade die SMS an? Ja, wenn der jüngste
 * Kontaktvermerk ein erfolgloser ANRUF ist und höchstens zwölf Stunden alt.
 *
 * Eine SMS danach ist selbst der jüngste Vermerk und schließt das Angebot
 * damit von allein – es braucht keinen eigenen Zustand.
 */
export function smsAngebotOffen(vermerke: KontaktVermerk[], jetzt: Date): boolean {
  const juengster = vermerke
    .filter((v) => KONTAKT_KINDS.has(v.kind))
    .reduce<KontaktVermerk | null>((j, v) => (!j || v.createdAt > j.createdAt ? v : j), null);
  if (!juengster) return false;
  if (juengster.kind !== "telefon" || juengster.ergebnis !== "nicht_erreicht") return false;
  return jetzt.getTime() - juengster.createdAt.getTime() <= SMS_NACHFASS_FENSTER_STUNDEN * 3600_000;
}

/**
 * Füllt die (ggf. vom Vermittler umformulierte) Vorlage. Mehrfach-Leerzeichen
 * werden zusammengezogen und Leerzeichen vor Satzzeichen entfernt: Ein
 * weggelassener Baustein darf in einer SMS keine Lücke hinterlassen, die wie
 * ein Tippfehler aussieht. Nötig wird das, sobald jemand die Vorlage selbst
 * umformuliert und vor einen Baustein ein Leerzeichen setzt ("Anfrage {{objektOrt}}.").
 */
export function renderSmsNachfass(body: string, e: SmsNachfassEingabe): string {
  return renderTemplate(body, smsNachfassVars(e))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .trim();
}
