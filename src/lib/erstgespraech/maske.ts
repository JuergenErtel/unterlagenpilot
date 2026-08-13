import { KATALOG, wert as antwortWert } from "@/lib/self-disclosure/catalog";
import type { Abschnitt as AbschnittId, Antworten, Feld, FeldTyp } from "@/lib/self-disclosure/types";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { ANGEBOTSRELEVANTE_ZIELE, type Reife } from "@/lib/erstgespraech/reife";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  FINANCING_TYPES,
  FINANCING_TYPE_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  USAGE_TYPES,
  USAGE_TYPE_LABELS,
  type FinancingType,
} from "@/lib/domain/enums";

/**
 * Aus dem Fragenkatalog die Maske fuers Erstgespraech bauen.
 *
 * Es gibt EINEN Katalog. Der Kunde beantwortet ihn Bildschirm fuer Bildschirm,
 * der Vermittler sieht denselben Bestand als eine Seite zum Durchtelefonieren.
 * Nur drei Dinge unterscheiden die beiden Ansichten – und jedes hat einen
 * Grund, der hier steht:
 *
 *  1. Nur Felder MIT einem Zielfeld. Der Vermittler tippt direkt in den Fall;
 *     eine Angabe ohne Speicherort (Warmmiete, "Immobilie schon gefunden?")
 *     waere hier ein Feld, das beim Verlassen nichts tut. Listen-Ziele
 *     (Verpflichtungen, Eigenkapitalpositionen) haben eigene Masken.
 *  2. Die Verzweigungen laufen ueber den FALLSTAND statt ueber frueher gegebene
 *     Antworten – der Vermittler hat keinen Bogen ausgefuellt.
 *  3. Bei Enum-Spalten stehen die Werte des Schemas zur Auswahl, nicht die
 *     Kundensprache des Bogens (siehe ENUM_OPTIONEN).
 *
 * Die bindende Zusage darueber: Jede Angabe, die die Reifeleiste zaehlt, MUSS
 * in der Maske auch eingebbar sein (`ergaenzeUnerreichbare`). Eine Leiste, die
 * etwas anmahnt, wofuer es kein Feld gibt, waere eine Sackgasse.
 */

export interface MaskenFeld {
  /** Eindeutig in der Maske: "p2.person_name.vorname" bzw. "kaufpreis.betrag". */
  schluessel: string;
  label: string;
  typ: FeldTyp;
  hinweis?: string;
  optionen?: { wert: string; label: string }[];
  ziel: { entitaet: string; feld: string };
  person?: 1 | 2;
  /** Vorbelegung, bereits so geschrieben, wie sie zurueckgelesen wird. */
  wert: string;
  /** Zaehlt die Reifeleiste diese Angabe? */
  angebotsrelevant: boolean;
}

export interface MaskenAbschnitt {
  id: AbschnittId;
  titel: string;
  felder: MaskenFeld[];
  /** Angebotsrelevante Angaben dieses Abschnitts – gefuellt und insgesamt. */
  gefuellt: number;
  relevant: number;
}

const ABSCHNITT_TITEL: Record<AbschnittId, string> = {
  vorhaben: "Vorhaben und Finanzierung",
  person: "Zur Person",
  beruf: "Beruf und Einkommen",
  haushalt: "Haushalt",
  eigenkapital: "Eigenkapital",
  objekt: "Das Objekt",
};

const ABSCHNITT_REIHENFOLGE: AbschnittId[] = [
  "vorhaben",
  "person",
  "beruf",
  "haushalt",
  "eigenkapital",
  "objekt",
];

/**
 * Auswahlfelder, deren Zielspalte ein Enum ist.
 *
 * Der Katalog bietet dem Kunden vertraute Formulierungen an ("Arbeiter/in",
 * "Kauf Bestandsimmobilie"); auf die Schemawerte abgebildet werden sie erst
 * bei der UEBERNAHME des Bogens. Die Maske schreibt dagegen direkt in die
 * Spalte – sie muss deshalb die Werte anbieten, die das Schema kennt. Sonst
 * landete "arbeiter" in einer EmploymentType-Spalte und Prisma wirft.
 */
const ENUM_OPTIONEN: Record<string, { wert: string; label: string }[]> = {
  "case.financingType": FINANCING_TYPES.map((w) => ({ wert: w, label: FINANCING_TYPE_LABELS[w] })),
  "employment.beschaeftigungsart": EMPLOYMENT_TYPES.map((w) => ({
    wert: w,
    label: EMPLOYMENT_TYPE_LABELS[w],
  })),
  "applicant.familienstand": MARITAL_STATUSES.map((w) => ({
    wert: w,
    label: MARITAL_STATUS_LABELS[w],
  })),
  "property.objektart": PROPERTY_TYPES.map((w) => ({ wert: w, label: PROPERTY_TYPE_LABELS[w] })),
  "property.nutzung": USAGE_TYPES.map((w) => ({ wert: w, label: USAGE_TYPE_LABELS[w] })),
};

/**
 * Finanzierungsart des Falls in die Sprache des Katalogs uebersetzen – nur
 * fuer die Verzweigungen, nie zum Schreiben.
 */
const ART_ZU_KATALOG: Record<FinancingType, string> = {
  kauf: "kauf_bestand",
  neubau: "kauf_neubau",
  anschlussfinanzierung: "anschlussfinanzierung",
  umschuldung: "anschlussfinanzierung",
  modernisierung: "modernisierung",
  kapitalbeschaffung: "kapitalbeschaffung",
};

const ANGESTELLT = ["angestellter", "beamter"];
const SELBSTSTAENDIG = ["selbststaendiger", "freiberufler", "geschaeftsfuehrer", "gesellschafter"];

/** Liest den aktuellen Wert einer Zielspalte aus dem Fallstand. */
function liesRoh(stand: Fallstand, quelle: string, feld: string, person: 1 | 2): unknown {
  if (quelle === "case") return stand.caseFelder[feld];
  if (quelle === "property") return stand.property?.[feld];
  if (quelle === "financingRequest") return stand.financingRequest?.[feld];
  const satz = stand.applicants.find((a) => a.position === person);
  if (!satz) return undefined;
  if (quelle === "applicant") return satz[feld];
  // employment, income und selfEmployment haengen als Liste am Antragsteller;
  // der erste Satz ist der aktuelle – so liest ihn auch die Reife.
  const liste = satz[quelle] as Array<Record<string, unknown>> | undefined;
  return liste?.[0]?.[feld];
}

/**
 * Den Wert so schreiben, wie ihn `wandleWert(..., "de")` zurueckliest.
 *
 * Das ist kein Schoenheitsthema: Ein unveraendert stehengelassenes Feld darf
 * beim Verlassen nicht plötzlich einen anderen Wert speichern. Betraege
 * bekommen deutsche Tausenderpunkte (895.000 -> 895000), reine Zahlen keine –
 * ein Baujahr "1.998" saehe aus wie ein Tippfehler.
 */
export function formatiereWert(typ: FeldTyp, roh: unknown): string {
  if (roh === null || roh === undefined) return "";
  if (roh instanceof Date) return roh.toISOString().slice(0, 10);
  if (typeof roh === "boolean") return roh ? "ja" : "nein";
  if (typeof roh === "number") {
    if (!Number.isFinite(roh)) return "";
    const gruppiert = typ === "betrag" || typ === "prozent_oder_betrag";
    return roh.toLocaleString("de-DE", { useGrouping: gruppiert, maximumFractionDigits: 6 });
  }
  return String(roh);
}

/** Was der Fall ueber die Verzweigungsfragen des Katalogs schon weiss. */
function ableiteAntworten(stand: Fallstand, antragstellerZahl: 1 | 2): Antworten {
  const art = stand.caseFelder.financingType;
  const a: Antworten = {
    "anzahl_antragsteller.anzahl": String(antragstellerZahl),
    /*
     * Zwei Steuerfragen des Bogens haben im Fall keine Entsprechung. Im
     * Gespraech werden sie mit "ja" beantwortet, weil das ANGEBOTSRELEVANTE
     * Felder freischaltet (Objektdaten, Maklerprovision) – und weil eine
     * Antwort "keine Maklergebuehr" hier eine 0 ist, keine ausgeblendete
     * Zeile.
     */
    "objektstand.stand": "gefunden",
    "maklergebuehr.faellt_an": "ja",
  };
  if (typeof art === "string" && art in ART_ZU_KATALOG) {
    a["finanzierungsart.art"] = ART_ZU_KATALOG[art as FinancingType];
  }
  for (const person of [1, 2] as const) {
    const beruf = liesRoh(stand, "employment", "beschaeftigungsart", person);
    if (typeof beruf === "string" && beruf !== "") a[`p${person}.beruf_art.art`] = beruf;
  }
  return a;
}

/** Eine Auspraegung eines Katalogschritts – bei Personenschritten je Person. */
interface Kandidat {
  schrittIndex: number;
  person?: 1 | 2;
}

function sichtbarImGespraech(
  schrittIndex: number,
  person: 1 | 2 | undefined,
  antworten: Antworten,
  stand: Fallstand
): boolean {
  const schritt = KATALOG[schrittIndex]!;

  /*
   * Ist die Berufsart offen, haelt der Bogen beide Zweige zu ("lieber weniger
   * fragen als nach dem Falschen"). Im Gespraech gilt das Gegenteil: Der
   * Vermittler sieht sonst nicht, wonach er fragen soll – und Probezeit und
   * Befristung zaehlt die Reifeleiste mit. Also beide Zweige zeigen.
   */
  if (["beruf_arbeitgeber", "beruf_dauer", "beruf_selbststaendig"].includes(schritt.id)) {
    const art = antwortWert(antworten, `p${person ?? 1}.beruf_art.art`);
    if (art === "") return true;
    const arten = schritt.id === "beruf_selbststaendig" ? SELBSTSTAENDIG : ANGESTELLT;
    return arten.includes(art);
  }

  /*
   * Das Schema kennt nur "neubau", der Katalog trennt den Kauf vom Bautraeger
   * (kauf_neubau) vom eigenen Bauvorhaben. Welcher von beiden es wird, zeigt
   * sich oft erst im Gespraech – bei Neubau also beides zeigen: Kaufpreis und
   * Baukosten.
   */
  if (schritt.id === "baukosten" && stand.caseFelder.financingType === "neubau") return true;

  return schritt.sichtbar ? schritt.sichtbar(antworten, person) : true;
}

const zielSchluessel = (entitaet: string, feld: string, person?: 1 | 2): string =>
  `${entitaet}.${feld}.${person ?? 1}`;

/** Alle Auspraegungen des Katalogs, in Katalogreihenfolge. */
function alleKandidaten(antragstellerZahl: 1 | 2): Kandidat[] {
  const alle: Kandidat[] = [];
  KATALOG.forEach((schritt, schrittIndex) => {
    if (schritt.jeAntragsteller) {
      for (let p = 1; p <= antragstellerZahl; p++) alle.push({ schrittIndex, person: p as 1 | 2 });
    } else {
      alle.push({ schrittIndex });
    }
  });
  return alle;
}

/** Felder eines Schritts, die ueberhaupt in die Maske gehoeren. */
function schreibbareFelder(schrittIndex: number): Array<Feld & { ziel: { entitaet: string; feld: string } }> {
  return KATALOG[schrittIndex]!.felder.filter(
    (f): f is Feld & { ziel: { entitaet: string; feld: string } } => !!f.ziel && "feld" in f.ziel
  );
}

/**
 * Nachziehen, was sonst unerreichbar waere.
 *
 * Die Verzweigungen des Katalogs blenden je nach Finanzierungsart Schritte aus
 * (bei einer Modernisierung z. B. die Objektmasse). Was die Leiste anmahnt,
 * muss die Maske aber anbieten: fuer jede noch nicht abgedeckte Angabe den
 * ersten Katalogschritt hinzunehmen, der sie traegt.
 *
 * Das gilt in BEIDE Richtungen – hier steht auch der Grund, warum die Reife
 * die Arbeitsvertrags-Angaben an die Beschaeftigungsart bindet
 * (`nurBeiBeschaeftigung`, reife.ts): Weil `inProbezeit` und `befristet` nur
 * im Schritt `beruf_dauer` vorkommen, zog diese Funktion den Schritt fuer
 * JEDEN Fall herein – und die Maske fragte auch den Rentner nach
 * "Beschaeftigt seit". Zaehlt die Reife die beiden Angaben fuer ihn nicht
 * mehr, entfaellt der Schritt hier von selbst.
 */
function ergaenzeUnerreichbare(
  sichtbare: Kandidat[],
  reife: Reife,
  antragstellerZahl: 1 | 2
): Kandidat[] {
  const abgedeckt = new Set<string>();
  for (const k of sichtbare) {
    for (const feld of schreibbareFelder(k.schrittIndex)) {
      abgedeckt.add(zielSchluessel(feld.ziel.entitaet, feld.ziel.feld, k.person));
    }
  }

  const ergaenzt = [...sichtbare];
  for (const r of reife.felder) {
    const gesucht = zielSchluessel(r.quelle, r.schluessel, r.person);
    if (abgedeckt.has(gesucht)) continue;
    const traeger = alleKandidaten(antragstellerZahl).find(
      (k) =>
        (k.person ?? 1) === (r.person ?? 1) &&
        schreibbareFelder(k.schrittIndex).some(
          (f) => f.ziel.entitaet === r.quelle && f.ziel.feld === r.schluessel
        )
    );
    if (!traeger) continue;
    if (!ergaenzt.some((k) => k.schrittIndex === traeger.schrittIndex && k.person === traeger.person)) {
      ergaenzt.push(traeger);
    }
    for (const feld of schreibbareFelder(traeger.schrittIndex)) {
      abgedeckt.add(zielSchluessel(feld.ziel.entitaet, feld.ziel.feld, traeger.person));
    }
  }
  return ergaenzt;
}

export function baueMaske(
  stand: Fallstand,
  antragstellerZahl: 1 | 2,
  reife: Reife
): MaskenAbschnitt[] {
  const antworten = ableiteAntworten(stand, antragstellerZahl);
  const sichtbare = alleKandidaten(antragstellerZahl).filter((k) =>
    sichtbarImGespraech(k.schrittIndex, k.person, antworten, stand)
  );
  const kandidaten = ergaenzeUnerreichbare(sichtbare, reife, antragstellerZahl);

  const relevanteZiele = new Map(
    reife.felder.map((r) => [zielSchluessel(r.quelle, r.schluessel, r.person), r])
  );

  const abschnitte = new Map<AbschnittId, MaskenAbschnitt>();
  // Ein Zielfeld bekommt genau EIN Eingabefeld. Sonst schrieben zwei Eingaben
  // auf dieselbe Spalte und die zuletzt verlassene gewaenne – z. B.
  // "Kaufpreis" und "Grundstueckspreis" beim Neubau.
  const belegt = new Set<string>();

  for (const k of kandidaten) {
    const schritt = KATALOG[k.schrittIndex]!;
    for (const feld of schreibbareFelder(k.schrittIndex)) {
      const zielKey = zielSchluessel(feld.ziel.entitaet, feld.ziel.feld, k.person);
      if (belegt.has(zielKey)) continue;

      const relevant = relevanteZiele.get(zielKey);
      /*
       * Die Gegenrichtung zu `ergaenzeUnerreichbare`: Eine angebotsrelevante
       * Angabe, die die Reife fuer DIESEN Fall nicht zaehlt, gibt es hier nicht
       * – dann darf die Maske sie auch nicht fragen.
       *
       * Bei den Arbeitsvertrags-Angaben fiel das noch von selbst weg, weil sie
       * allein im Schritt `beruf_dauer` stehen. Die Grundstuecksgroesse steht
       * dagegen NEBEN Wohnflaeche und Baujahr in "Wie gross ist die
       * Immobilie?": Der Schritt bleibt sichtbar, also blieb auch die Frage
       * nach dem Grundstueck einer Eigentumswohnung stehen. Gleiches bei der
       * Maklergebuehr einer Anschlussfinanzierung – der Katalog blendet nur die
       * Ja/Nein-Frage aus, das Prozentfeld haengt an der im Gespraech hart
       * gesetzten Antwort "ja".
       *
       * Nur angebotsrelevante Ziele werden so gefiltert: Baukosten oder
       * Warmmiete zaehlt die Reife nie, sie sollen aber gefragt werden.
       */
      if (!relevant && ANGEBOTSRELEVANTE_ZIELE.has(`${feld.ziel.entitaet}.${feld.ziel.feld}`)) {
        continue;
      }
      belegt.add(zielKey);

      const person = k.person;
      const abschnitt =
        abschnitte.get(schritt.abschnitt) ??
        {
          id: schritt.abschnitt,
          titel: ABSCHNITT_TITEL[schritt.abschnitt],
          felder: [],
          gefuellt: 0,
          relevant: 0,
        };
      abschnitte.set(schritt.abschnitt, abschnitt);

      abschnitt.felder.push({
        schluessel: person ? `p${person}.${schritt.id}.${feld.id}` : `${schritt.id}.${feld.id}`,
        label:
          antragstellerZahl > 1 && person
            ? `${feld.label} · Antragsteller ${person}`
            : feld.label,
        typ: feld.typ,
        hinweis: feld.hinweis,
        optionen: ENUM_OPTIONEN[`${feld.ziel.entitaet}.${feld.ziel.feld}`] ?? feld.optionen,
        ziel: { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld },
        person,
        wert: formatiereWert(
          feld.typ,
          liesRoh(stand, feld.ziel.entitaet, feld.ziel.feld, person ?? 1)
        ),
        angebotsrelevant: !!relevant,
      });

      if (relevant) {
        abschnitt.relevant += 1;
        if (relevant.gefuellt) abschnitt.gefuellt += 1;
      }
    }
  }

  return ABSCHNITT_REIHENFOLGE.map((id) => abschnitte.get(id)).filter(
    (a): a is MaskenAbschnitt => !!a && a.felder.length > 0
  );
}
