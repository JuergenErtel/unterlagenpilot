import { berechneHaushalt } from "@/lib/haushalt/rechnung";
import { berechneNebenkosten } from "./nebenkosten";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

export type Auslaufband = "bis60" | "bis80" | "bis90" | "bis100" | "bis110" | "darueber";

export const BAND_LABELS: Record<Auslaufband, string> = {
  bis60: "bis 60 % – beste Kondition (Realkreditgrenze)",
  bis80: "bis 80 % – Standardkondition",
  bis90: "bis 90 % – Aufschlag",
  bis100: "bis 100 % – Vollfinanzierung",
  bis110: "bis 110 % – Nebenkosten mitfinanziert",
  darueber: "über 110 % – praktisch nicht darstellbar",
};

export interface Urteil {
  darlehen: number;
  beleihungswert: number;
  auslauf: number;
  band: Auslaufband;
  zinsProzent: number;
  /** Monatliche Rate des Baudarlehens. */
  rate: number;
  /** Monatliche Rate eines etwaigen Ratenkredits. */
  ratenkreditRate: number;
  /**
   * Um wie viel die Rate ueber der Wunschrate des Kunden liegt; 0 = gehalten,
   * null = keine Wunschrate genannt.
   *
   * Bewusst nie negativ: "Du liegst 400 Euro unter deinem Wunsch" ist keine
   * Aussage, die jemand braucht -- gehalten ist gehalten.
   */
  wunschrateAbweichung: number | null;
  ueberschuss: number;
  machbar: boolean;
  nebenkosten: NebenkostenAufstellung;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function bandFuer(auslauf: number): Auslaufband {
  if (auslauf <= 60) return "bis60";
  if (auslauf <= 80) return "bis80";
  if (auslauf <= 90) return "bis90";
  if (auslauf <= 100) return "bis100";
  if (auslauf <= 110) return "bis110";
  return "darueber";
}

/** Aufschlag des Bandes in Prozentpunkten gegenueber dem Basiszins. */
function aufschlagFuer(band: Auslaufband, a: Annahmen): number {
  switch (band) {
    case "bis60":
      return 0;
    case "bis80":
      return a.aufschlagBis80;
    case "bis90":
      return a.aufschlagBis90;
    case "bis100":
      return a.aufschlagBis100;
    default:
      return a.aufschlagBis110;
  }
}

/** Annuitaetenrate eines Ratenkredits (fester Zins, feste Laufzeit). */
function ratenkreditRate(betrag: number, zinsProzent: number, monate: number): number {
  if (betrag <= 0 || monate <= 0) return 0;
  const i = zinsProzent / 100 / 12;
  if (i === 0) return r2(betrag / monate);
  return r2((betrag * i) / (1 - Math.pow(1 + i, -monate)));
}

/**
 * Der einzige Ort, an dem "machbar" definiert wird.
 *
 * Wichtig: Der Zinsaufschlag haengt vom Auslaufband ab und erhoeht die Rate.
 * Ein Fall scheitert deshalb nie "am Auslauf", sondern daran, dass der Haushalt
 * den zum Auslauf gehoerenden Zins nicht mehr traegt. Genau diese Kopplung
 * macht die numerische Suche noetig – analytisch muesste man sie von Hand
 * aufloesen.
 */
export function bewerte(e: SolverEingabe, a: Annahmen): Urteil {
  const nebenkosten = berechneNebenkosten(e, a);

  const darlehen = r2(
    Math.max(
      e.kaufpreis +
        e.modernisierungskosten +
        e.weitererDarlehensbedarf +
        nebenkosten.summe +
        e.abzuloesendeRestschuld -
        e.eigenkapital -
        e.eigenleistung -
        e.ratenkreditAnteil,
      0
    )
  );

  // Inventar ist nicht beleihbar; eine Zusatzsicherheit erweitert den Nenner.
  // Ohne eigenen Objektwert ist der Kaufpreis der Massstab – so rechnet ein
  // Kauf nach der Trennung der beiden Rollen unveraendert weiter.
  const beleihungswert = r2(
    Math.max((e.objektwert ?? e.kaufpreis) - e.inventarAnteil, 0) + e.zusatzsicherheitBeleihungsraum
  );

  // Eine vorrangige Grundschuld steht im Rang VOR dem neuen Darlehen: Sie
  // verbraucht Beleihungsraum, ohne mitfinanziert zu werden. Nur im Zaehler
  // des Auslaufs, nie im Darlehen – sonst zahlte der Haushalt ihre Rate
  // zweimal.
  const auslauf =
    beleihungswert > 0 ? r2(((darlehen + e.vorrangigeRestschuld) / beleihungswert) * 100) : Infinity;
  const band = bandFuer(auslauf);

  // Ein konkreter Sollzins gilt fuer das AKTUELLE Band; andere Baender ergeben
  // sich ueber die Abstaende der Aufschlagstabelle.
  const zinsProzent =
    e.sollzinsProzent != null ? r2(e.sollzinsProzent) : r2(a.basiszinsProzent + aufschlagFuer(band, a));

  const rate = r2((darlehen * ((zinsProzent + e.tilgungProzent) / 100)) / 12);
  const rkRate = ratenkreditRate(
    e.ratenkreditAnteil,
    a.ratenkreditZinsProzent,
    a.ratenkreditLaufzeitMonate
  );

  // berechneHaushalt bleibt unveraendert; gesteuert wird ueber die Eingaben.
  const h = berechneHaushalt(
    {
      income: [
        {
          applicantPosition: 1,
          nettoMonatlich: e.nettoEinkommen,
          sonstigeEinnahmen: e.zusatzEinnahmen,
        },
      ],
      liabilities: [{ monatlicheRate: e.bestehendeRaten + rkRate, abzuloesen: false }],
      property: {
        wohnflaeche: e.wohnflaeche,
        hausgeldMonatlich: e.hausgeldMonatlich ?? undefined,
        mieteinnahmenMonatlich: e.mieteinnahmenMonatlich,
      },
      financing: { darlehensbetrag: darlehen, sollzinsProzent: zinsProzent },
      applicantCount: e.applicantCount + e.zusatzErwachsene,
      anzahlKinder: e.anzahlKinder,
    },
    { tilgungProzent: e.tilgungProzent }
  );

  // Die Wunschrate faerbt die Ampel NICHT (Entscheidung des Vermittlers vom
  // 13.08.2026): `machbar` bleibt die Bankensicht aus Auslauf und
  // Haushaltsueberschuss. Ein verfehlter Wunsch ist ein Gespraechsthema, kein
  // K.o. -- sonst gaelten Faelle als "nicht darstellbar", die jede Bank
  // finanziert.
  const machbar = auslauf <= a.auslaufObergrenze && h.ueberschuss >= a.ueberschussPuffer;

  return {
    darlehen,
    beleihungswert,
    auslauf,
    band,
    zinsProzent,
    rate,
    ratenkreditRate: rkRate,
    wunschrateAbweichung:
      e.wunschrateMonatlich != null && e.wunschrateMonatlich > 0
        ? Math.max(0, r2(rate + rkRate - e.wunschrateMonatlich))
        : null,
    ueberschuss: h.ueberschuss,
    machbar,
    nebenkosten,
  };
}
