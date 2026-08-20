/**
 * Die Aufgabenliste „Heute".
 *
 * Ein Fall, eine Aufgabe. Welche das ist, entscheidet die Prioritätsleiter
 * (`next-step.ts`) – sie zeigt bauartbedingt genau einen Schritt. Diese Datei
 * entscheidet nur zwei Dinge darüber hinaus: **wie dringend** die Aufgabe ist
 * und **in welcher Reihenfolge** sie steht.
 *
 * Warum das Zusammenlegen: Bis hierher standen „Heute dran" (Schritte) und
 * „Heute fällig" (Wiedervorlagen, Fristen, Bank-Nachforderungen) als zwei
 * getrennte Abschnitte im Dashboard, obwohl sie dieselbe Frage beantworten.
 * Ein Fall mit überfälliger Wiedervorlage stand dort zweimal, und keine der
 * beiden Listen war nach Dringlichkeit sortiert.
 *
 * Der Termin kommt vom FALL (Wiedervorlage, nächste offene Frist), die
 * Aufgabe von der LEITER. Das ist Absicht: Die Leiter kennt keine Daten – ihre
 * Sprosse `fristen` heißt nur „der Fall ist eingereicht", nicht „am 21.08.
 * läuft etwas ab".
 *
 * Rein und ohne Uhr: `jetzt` kommt herein, damit die Bänder testbar sind.
 */

import type { NextStep } from "@/lib/cases/next-step";
import { tageDifferenz } from "@/lib/datum";

/**
 * Schritte, die keine Aufgabe sind und deshalb nie auf der Liste stehen.
 *
 * `vertrieb_laeuft` ist ein Zustand, kein Auftrag: Ab dem Finanzierungs-
 * vorschlag führt BaufiDesk den Fall nicht mehr, er läuft in Europace weiter
 * (siehe `laeuftAusserhalb`). Stünde er hier, wäre die Heute-Liste wieder das,
 * was die Leiter vor dem 16.08. war – eine Mahnung für längst Erledigtes.
 */
export const NICHT_AUF_HEUTE: ReadonlySet<NextStep["key"]> = new Set<NextStep["key"]>([
  "vertrieb_laeuft",
  "erledigt",
]);

/** Schritte, bei denen der Anruf selbst die Aufgabe ist. */
const KONTAKT_SCHRITTE: ReadonlySet<NextStep["key"]> = new Set<NextStep["key"]>([
  "kontakt_aufnehmen",
]);

export type Dringlichkeit = "ueberfaellig" | "heute" | "diese_woche" | "ohne_termin";

/** Reihenfolge der Bänder auf der Seite – von dringend nach ruhig. */
export const DRINGLICHKEIT_REIHENFOLGE: readonly Dringlichkeit[] = [
  "ueberfaellig",
  "heute",
  "diese_woche",
  "ohne_termin",
] as const;

export const DRINGLICHKEIT_LABEL: Record<Dringlichkeit, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute",
  diese_woche: "Diese Woche",
  ohne_termin: "Ohne Termin",
};

/** Ab wie vielen Tagen Vorlauf eine Frist noch „diese Woche" heißt. */
const WOCHE_TAGE = 7;

/**
 * Wohin ein Haken schreibt.
 *
 * - `erstgespraech` / `wiedervorlage`: an das vorhandene Feld am Fall. Damit
 *   weiß es die ganze Anwendung – Fallakte, Kanban, Prioritätsleiter.
 * - `vermerk`: in die Tabelle `AufgabeErledigt`, für alles, wofür es kein
 *   solches Feld gibt.
 *
 * Bewusst ein vollständiger Record und keine `if`-Kette mit Rückfall: Kommt in
 * `next-step.ts` eine Sprosse dazu, meckert `tsc` hier. Eine Kette mit
 * `default: "vermerk"` hätte den neuen Schritt stillschweigend geschluckt –
 * und wenn er ein eigenes Tatsachenfeld hat, wüsste hinterher nur die
 * Heute-Liste Bescheid.
 */
export type Abhakart = "erstgespraech" | "wiedervorlage" | "vermerk";

export const ABHAKART: Record<NextStep["key"], Abhakart> = {
  erstgespraech: "erstgespraech",
  wiedervorlage_faellig: "wiedervorlage",

  ki_laeuft: "vermerk",
  ki_fehler: "vermerk",
  erstkontakt_email_fehlt: "vermerk",
  erstkontakt_vorbereiten: "vermerk",
  erstkontakt_entwurf: "vermerk",
  kontakt_aufnehmen: "vermerk",
  vertrieb_laeuft: "vermerk",
  selbstauskunft_eingegangen: "vermerk",
  dokumente_freigeben: "vermerk",
  kundendaten: "vermerk",
  kritische_hinweise: "vermerk",
  machbarkeit: "vermerk",
  unterlagen_luecken: "vermerk",
  unterlagen_anfordern: "vermerk",
  selbstauskunft_wartet: "vermerk",
  fristen: "vermerk",
  erledigt: "vermerk",
  einreichung: "vermerk",
};

export function abhakartFuer(key: NextStep["key"]): Abhakart {
  return ABHAKART[key];
}

/**
 * Kurzbezeichnung einer Sprosse – für die Rückgängig-Zeile, wo nur der
 * Schlüssel gespeichert ist und der ausformulierte Titel der Leiter (der
 * Zahlen enthält: „4 Dokumente freigeben") nicht mehr zur Verfügung steht.
 */
export const SCHRITT_LABEL: Record<NextStep["key"], string> = {
  ki_laeuft: "KI-Prüfung läuft",
  ki_fehler: "KI-Prüfung unterbrochen",
  erstkontakt_email_fehlt: "E-Mail-Adresse ergänzen",
  erstkontakt_vorbereiten: "Erstkontakt vorbereiten",
  erstkontakt_entwurf: "Erstkontakt versenden",
  erstgespraech: "Erstgespräch führen",
  kontakt_aufnehmen: "Kontakt aufnehmen",
  wiedervorlage_faellig: "Wiedervorlage",
  vertrieb_laeuft: "Vertrieb läuft",
  selbstauskunft_eingegangen: "Selbstauskunft prüfen",
  dokumente_freigeben: "Dokumente freigeben",
  kundendaten: "Kundendaten ergänzen",
  kritische_hinweise: "Kritische Hinweise klären",
  machbarkeit: "Machbarkeit prüfen",
  unterlagen_luecken: "Unterlagenlücken schließen",
  unterlagen_anfordern: "Unterlagen anfordern",
  selbstauskunft_wartet: "Selbstauskunft beim Kunden",
  fristen: "Fristen im Blick behalten",
  erledigt: "Erledigt",
  einreichung: "Einreichung vorbereiten",
};

/** Was die Liste je Fall an Rohdaten braucht. */
export interface AufgabeRoh {
  caseId: string;
  caseNumber: string;
  name: string;
  step: NextStep;
  /** Einreichungs-Reifegrad 0..100 – ordnet das Band „ohne Termin". */
  readiness: number;
  /** Anlage des Falls – ordnet die Kontaktaufnahmen (ältester Lead zuerst). */
  angelegtAm: Date;
  wiedervorlage: Date | null;
  naechsteFrist: { title: string; dueDate: Date } | null;
  offeneBankforderungen: number;
  telefon: string | null;
  /** Bereits von Hand abgehakt – für genau diesen Schritt. */
  bereitsAbgehakt: boolean;
}

export interface HeuteAufgabe {
  caseId: string;
  caseNumber: string;
  name: string;
  schritt: NextStep["key"];
  titel: string;
  grund: string;
  cta: { label: string; href: string } | null;
  dringlichkeit: Dringlichkeit;
  /** Der Termin, der die Dringlichkeit bestimmt hat; null heißt: keiner. */
  faelligAm: Date | null;
  /** Woher der Termin kommt – für den Satz unter dem Titel. */
  terminGrund: "wiedervorlage" | "frist" | "bank_nachforderung" | null;
  /** Titel der Frist, falls sie den Termin gestellt hat. */
  fristTitel: string | null;
  /** Ganze Kalendertage überfällig; 0, wenn nicht überfällig. */
  tageUeberfaellig: number;
  abhaken: Abhakart;
  readiness: number;
  telefon: string | null;
  /** Nur für die Sortierung im Band „heute" gebraucht. */
  angelegtAm: Date;
}

/** Der früheste harte Termin am Fall – und woher er stammt. */
function termin(
  a: AufgabeRoh
): { am: Date; grund: "wiedervorlage" | "frist"; fristTitel: string | null } | null {
  const kandidaten: Array<{ am: Date; grund: "wiedervorlage" | "frist"; fristTitel: string | null }> = [];
  if (a.wiedervorlage) kandidaten.push({ am: a.wiedervorlage, grund: "wiedervorlage", fristTitel: null });
  if (a.naechsteFrist) {
    kandidaten.push({ am: a.naechsteFrist.dueDate, grund: "frist", fristTitel: a.naechsteFrist.title });
  }
  const frueheste = kandidaten.sort((x, y) => x.am.getTime() - y.am.getTime())[0];
  return frueheste ?? null;
}

function einstufen(
  a: AufgabeRoh,
  jetzt: Date
): Pick<HeuteAufgabe, "dringlichkeit" | "faelligAm" | "terminGrund" | "fristTitel" | "tageUeberfaellig"> {
  const t = termin(a);

  if (t) {
    // In KALENDERTAGEN, nicht in Stunden: Eine heute früh um 9 fällige
    // Wiedervorlage ist um 10 Uhr nicht „überfällig", sie ist heute dran.
    const tage = tageDifferenz(jetzt, t.am);
    const gemeinsam = { faelligAm: t.am, terminGrund: t.grund, fristTitel: t.fristTitel };
    if (tage > 0) return { dringlichkeit: "ueberfaellig", tageUeberfaellig: tage, ...gemeinsam };
    if (tage === 0) return { dringlichkeit: "heute", tageUeberfaellig: 0, ...gemeinsam };
    if (-tage <= WOCHE_TAGE) return { dringlichkeit: "diese_woche", tageUeberfaellig: 0, ...gemeinsam };
    // Weiter weg als eine Woche: Der Termin bleibt am Eintrag stehen, drängt
    // aber nicht. Sonst stünde jede Zinsbindung mit sechs Monaten Restlauf
    // dauerhaft im oberen Drittel der Liste.
    return { dringlichkeit: "ohne_termin", tageUeberfaellig: 0, ...gemeinsam };
  }

  // Die Bank wartet. Ein Datum steht dafür nirgends – liegen lassen darf man
  // es trotzdem nicht, und in der Praxis hängt daran eine Zusage.
  if (a.offeneBankforderungen > 0) {
    return {
      dringlichkeit: "ueberfaellig",
      faelligAm: null,
      terminGrund: "bank_nachforderung",
      fristTitel: null,
      tageUeberfaellig: 0,
    };
  }

  // Ein frischer Lead hat naturgemäß keinen Termin und einen niedrigen
  // Reifegrad – ohne diese Regel versänke der Anruf ganz unten, obwohl die
  // Antwortzeit über den Lead entscheidet.
  if (KONTAKT_SCHRITTE.has(a.step.key)) {
    return {
      dringlichkeit: "heute",
      faelligAm: null,
      terminGrund: null,
      fristTitel: null,
      tageUeberfaellig: 0,
    };
  }

  return {
    dringlichkeit: "ohne_termin",
    faelligAm: null,
    terminGrund: null,
    fristTitel: null,
    tageUeberfaellig: 0,
  };
}

const BAND_RANG = new Map(DRINGLICHKEIT_REIHENFOLGE.map((d, i) => [d, i]));

/**
 * Aus Rohdaten die sortierte Aufgabenliste.
 *
 * Bewusst ohne Deckel: Die alte Dashboard-Liste hörte nach sechs Einträgen
 * auf, und was dahinter lag, existierte für den Vermittler nicht.
 */
export function ordneAufgaben(roh: AufgabeRoh[], jetzt: Date): HeuteAufgabe[] {
  const aufgaben: HeuteAufgabe[] = [];

  for (const a of roh) {
    if (NICHT_AUF_HEUTE.has(a.step.key)) continue;
    if (a.bereitsAbgehakt) continue;
    aufgaben.push({
      caseId: a.caseId,
      caseNumber: a.caseNumber,
      name: a.name,
      schritt: a.step.key,
      titel: a.step.title,
      grund: a.step.reason,
      cta: a.step.cta ?? null,
      abhaken: abhakartFuer(a.step.key),
      readiness: a.readiness,
      telefon: a.telefon,
      angelegtAm: a.angelegtAm,
      ...einstufen(a, jetzt),
    });
  }

  return aufgaben.sort((x, y) => {
    const band = (BAND_RANG.get(x.dringlichkeit) ?? 99) - (BAND_RANG.get(y.dringlichkeit) ?? 99);
    if (band !== 0) return band;

    switch (x.dringlichkeit) {
      case "ueberfaellig":
        // Am längsten liegen geblieben zuerst. Die Bank-Nachforderung ohne
        // Datum (tageUeberfaellig 0) landet damit unter den datierten – sie
        // ist dringend, aber wie dringend, weiß niemand.
        return y.tageUeberfaellig - x.tageUeberfaellig;
      case "heute": {
        // Der Anruf zuerst, danach die datierten Aufgaben. Unter den Anrufen
        // der älteste Lead – er wartet am längsten auf eine Antwort.
        const anruf = Number(KONTAKT_SCHRITTE.has(y.schritt)) - Number(KONTAKT_SCHRITTE.has(x.schritt));
        if (anruf !== 0) return anruf;
        if (KONTAKT_SCHRITTE.has(x.schritt)) return x.angelegtAm.getTime() - y.angelegtAm.getTime();
        return (x.faelligAm?.getTime() ?? 0) - (y.faelligAm?.getTime() ?? 0);
      }
      case "diese_woche":
        return (x.faelligAm?.getTime() ?? 0) - (y.faelligAm?.getTime() ?? 0);
      case "ohne_termin":
        // Der unfertigste Fall zuerst: Dort ist am meisten zu holen.
        return x.readiness - y.readiness;
    }
  });
}

/** Gruppiert die fertige Liste für die Anzeige, leere Bänder fallen weg. */
export function nachBaendern(
  aufgaben: HeuteAufgabe[]
): Array<{ dringlichkeit: Dringlichkeit; label: string; aufgaben: HeuteAufgabe[] }> {
  return DRINGLICHKEIT_REIHENFOLGE.map((d) => ({
    dringlichkeit: d,
    label: DRINGLICHKEIT_LABEL[d],
    aufgaben: aufgaben.filter((a) => a.dringlichkeit === d),
  })).filter((b) => b.aufgaben.length > 0);
}
