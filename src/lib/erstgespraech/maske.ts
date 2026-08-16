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
 *
 * `Schritt.umfang` spielt hier bewusst KEINE Rolle: Die Maske iteriert direkt
 * ueber KATALOG statt ueber `sichtbareSchritte`, das den kurzen Weg filtert.
 * Wer alles zeigt – der Vermittler am Telefon –, nimmt immer die volle Kette,
 * unabhaengig davon, ob der jeweilige Schritt "kurz" oder "voll" traegt.
 */

export interface MaskenFeld {
  /** Eindeutig in der Maske: "p2.personen.vorname" bzw. "objekt_preis.kaufpreis". */
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
    "haushalt.anzahl": String(antragstellerZahl),
    /*
     * Zwei Steuerfragen des Bogens haben im Fall keine Entsprechung. Im
     * Gespraech werden sie mit "ja" beantwortet, weil das ANGEBOTSRELEVANTE
     * Felder freischaltet (Objektdaten, Maklerprovision) – und weil eine
     * Antwort "keine Maklergebuehr" hier eine 0 ist, keine ausgeblendete
     * Zeile.
     */
    "vorhaben.stand": "gefunden",
    "objekt_preis.makler": "ja",
  };
  if (typeof art === "string" && art in ART_ZU_KATALOG) {
    a["vorhaben.art"] = ART_ZU_KATALOG[art as FinancingType];
  }
  for (const person of [1, 2] as const) {
    const beruf = liesRoh(stand, "employment", "beschaeftigungsart", person);
    if (typeof beruf === "string" && beruf !== "") a[`p${person}.personen.beruf_art`] = beruf;
  }
  return a;
}

/** Ein Feld des Katalogs, das direkt in den Fall schreibt. */
type SchreibbaresFeld = Feld & { ziel: { entitaet: string; feld: string } };

/**
 * Eine Auspraegung eines Katalogfelds – bei Personenspalten je Person.
 *
 * Feldkoernig, nicht schrittkoernig: Seit dem Katalogschnitt buendelt EINE
 * Seite Fragen, von denen je nach Vorhaben nur ein Teil gilt ("Um welche
 * Immobilie geht es?" traegt Kaufpreis, Baukosten UND Restschuld). Ganze
 * Seiten ein- oder auszublenden brachte deshalb entweder zu viel oder zu
 * wenig – die Entscheidung gehoert ans Feld.
 */
interface Kandidat {
  schrittIndex: number;
  feld: SchreibbaresFeld;
  person?: 1 | 2;
}

/** Die Felder der Seite "beruf_details", die zum selbstaendigen Zweig gehoeren. */
const SELBSTSTAENDIGEN_FELDER = new Set(["firma", "rechtsform", "beteiligung", "gruendung"]);

function sichtbarImGespraech(k: Kandidat, antworten: Antworten, stand: Fallstand): boolean {
  const schritt = KATALOG[k.schrittIndex]!;

  /*
   * Ist die Berufsart offen, haelt der Bogen beide Zweige zu ("lieber weniger
   * fragen als nach dem Falschen"). Im Gespraech gilt das Gegenteil: Der
   * Vermittler sieht sonst nicht, wonach er fragen soll – und Probezeit und
   * Befristung zaehlt die Reifeleiste mit. Also beide Zweige zeigen.
   *
   * Zugeordnet wird ueber die SCHEMA-Werte (ANGESTELLT/SELBSTSTAENDIG oben),
   * nicht ueber die Kundensprache des Katalogs: Der Fallstand liefert
   * "geschaeftsfuehrer", ein Wort, das der Bogen gar nicht kennt.
   */
  if (schritt.id === "beruf_details") {
    const art = antwortWert(antworten, `p${k.person ?? 1}.personen.beruf_art`);
    if (art === "") return true;
    const arten = SELBSTSTAENDIGEN_FELDER.has(k.feld.id) ? SELBSTSTAENDIG : ANGESTELLT;
    return arten.includes(art);
  }

  /*
   * Das Schema kennt nur "neubau", der Katalog trennt den Kauf vom Bautraeger
   * (kauf_neubau) vom eigenen Bauvorhaben. Welcher von beiden es wird, zeigt
   * sich oft erst im Gespraech – bei Neubau also beides zeigen: Kaufpreis und
   * Baukosten.
   */
  if (
    schritt.id === "objekt_preis" &&
    (k.feld.id === "grundstueck" || k.feld.id === "bau") &&
    stand.caseFelder.financingType === "neubau"
  ) {
    return true;
  }

  if (schritt.sichtbar && !schritt.sichtbar(antworten, k.person)) return false;
  return k.feld.sichtbar ? k.feld.sichtbar(antworten, k.person) : true;
}

const zielSchluessel = (entitaet: string, feld: string, person?: 1 | 2): string =>
  `${entitaet}.${feld}.${person ?? 1}`;

/** Felder eines Schritts, die ueberhaupt in die Maske gehoeren. */
function schreibbareFelder(schrittIndex: number): SchreibbaresFeld[] {
  return KATALOG[schrittIndex]!.felder.filter(
    (f): f is SchreibbaresFeld => !!f.ziel && "feld" in f.ziel
  );
}

/** Alle Auspraegungen des Katalogs, in Katalogreihenfolge. */
function alleKandidaten(antragstellerZahl: 1 | 2): Kandidat[] {
  const alle: Kandidat[] = [];
  KATALOG.forEach((schritt, schrittIndex) => {
    const spalten: Array<1 | 2 | undefined> = schritt.personenSpalten
      ? Array.from({ length: antragstellerZahl }, (_, i) => (i + 1) as 1 | 2)
      : [undefined];
    for (const person of spalten) {
      for (const feld of schreibbareFelder(schrittIndex)) alle.push({ schrittIndex, feld, person });
    }
  });
  return alle;
}

/**
 * Die Nachbarfelder, die mit einem nachgezogenen Feld MITGEHEN muessen.
 *
 * Der Fund, der diese Funktion erzwungen hat: Bei Anschlussfinanzierung,
 * Umschuldung, Kapitalbeschaffung und Modernisierung fehlte der ORT des
 * Objekts in der Maske. PLZ und Ort sind dort beide unsichtbar (kein
 * Kaufzweig); die Reifeleiste verlangt `property.zip`, also wurde die PLZ
 * nachgezogen – der Ort aber nicht, denn er ist nicht angebotsrelevant und
 * wurde deshalb nie gesucht. Solange die Maske ganze SCHRITTE hereinzog, kam
 * er als Nachbar im selben Schritt automatisch mit; feldweise nicht mehr.
 *
 * Zwei Bedingungen, damit genau das mitkommt und nichts weiter:
 *
 *  1. Das Nachbarfeld hat KEIN eigenes Reife-Ziel. Was die Leiste selbst
 *     zaehlt, holt sich die Schleife oben ohnehin – und was sie fuer diesen
 *     Fall NICHT zaehlt (die Grundstuecksgroesse einer Eigentumswohnung), ist
 *     bewusst weggefallen und darf nicht durch die Hintertuer zurueck.
 *  2. Es teilt sich die BEDINGUNG des nachgezogenen Felds – dieselbe Funktion,
 *     nicht bloss derselbe Wert. Genau diese geteilte Bedingung ist die Spur
 *     des alten Schritts: PLZ und Ort hingen beide an `istKauf` und wurden
 *     immer gemeinsam sichtbar. Baukosten und Modernisierungskosten stehen
 *     zwar auf derselben Seite, haben aber ihre eigenen Bedingungen – sie
 *     gehoeren nicht zum Ort und sollen bei einer Anschlussfinanzierung auch
 *     nicht danebenstehen.
 *
 * Bricht ein kuenftiger Umbau diese Kopplung (zwei gleich gemeinte, aber
 * getrennt notierte Bedingungen sind NICHT dieselbe Funktion), faellt das
 * nicht still aus: Der Test "jede Zielspalte des Katalogs ist in mindestens
 * einer Finanzierungsart eingebbar" faengt es.
 */
function mitgehendeGeschwister(
  traeger: Kandidat,
  alle: Kandidat[],
  abgedeckt: ReadonlySet<string>
): Kandidat[] {
  if (!traeger.feld.sichtbar) return [];
  return alle.filter(
    (n) =>
      n.schrittIndex === traeger.schrittIndex &&
      n.person === traeger.person &&
      n.feld.sichtbar === traeger.feld.sichtbar &&
      !ANGEBOTSRELEVANTE_ZIELE.has(`${n.feld.ziel.entitaet}.${n.feld.ziel.feld}`) &&
      !abgedeckt.has(zielSchluessel(n.feld.ziel.entitaet, n.feld.ziel.feld, n.person))
  );
}

/**
 * Nachziehen, was sonst unerreichbar waere.
 *
 * Die Verzweigungen des Katalogs blenden je nach Finanzierungsart Felder aus
 * (bei einer Anschlussfinanzierung z. B. PLZ und Nutzung des Objekts). Was die
 * Leiste anmahnt, muss die Maske aber anbieten: fuer jede noch nicht
 * abgedeckte Angabe das erste Katalogfeld hinzunehmen, das sie traegt.
 *
 * Feldweise statt schrittweise, seit eine Seite mehrere Fragen buendelt: Die
 * Seite "Was moechten Sie finanzieren?" ist IMMER sichtbar, ihr Feld "Nutzung"
 * bei einer Anschlussfinanzierung dagegen nicht – schrittweise gerechnet galt
 * die Angabe als abgedeckt und fiel doch aus der Maske.
 *
 * Das gilt in BEIDE Richtungen – hier steht auch der Grund, warum die Reife
 * die Arbeitsvertrags-Angaben an die Beschaeftigungsart bindet
 * (`nurBeiBeschaeftigung`, reife.ts): Weil `inProbezeit` und `befristet` nur
 * im angestellten Zweig vorkommen, zog diese Funktion sie fuer JEDEN Fall
 * herein – und die Maske fragte auch den Rentner nach "Beschaeftigt seit".
 * Zaehlt die Reife die beiden Angaben fuer ihn nicht mehr, entfaellt die Frage
 * hier von selbst.
 */
function ergaenzeUnerreichbare(sichtbare: Kandidat[], reife: Reife, alle: Kandidat[]): Kandidat[] {
  const abgedeckt = new Set(
    sichtbare.map((k) => zielSchluessel(k.feld.ziel.entitaet, k.feld.ziel.feld, k.person))
  );

  const ergaenzt = [...sichtbare];
  const hinzu = (k: Kandidat) => {
    ergaenzt.push(k);
    abgedeckt.add(zielSchluessel(k.feld.ziel.entitaet, k.feld.ziel.feld, k.person));
  };

  for (const r of reife.felder) {
    const gesucht = zielSchluessel(r.quelle, r.schluessel, r.person);
    if (abgedeckt.has(gesucht)) continue;
    const traeger = alle.find(
      (k) =>
        (k.person ?? 1) === (r.person ?? 1) &&
        k.feld.ziel.entitaet === r.quelle &&
        k.feld.ziel.feld === r.schluessel
    );
    if (!traeger) continue;
    hinzu(traeger);
    for (const nachbar of mitgehendeGeschwister(traeger, alle, abgedeckt)) hinzu(nachbar);
  }
  return ergaenzt;
}

export function baueMaske(
  stand: Fallstand,
  antragstellerZahl: 1 | 2,
  reife: Reife
): MaskenAbschnitt[] {
  const antworten = ableiteAntworten(stand, antragstellerZahl);
  const alle = alleKandidaten(antragstellerZahl);
  const sichtbare = alle.filter((k) => sichtbarImGespraech(k, antworten, stand));
  const kandidaten = ergaenzeUnerreichbare(sichtbare, reife, alle);

  const relevanteZiele = new Map(
    reife.felder.map((r) => [zielSchluessel(r.quelle, r.schluessel, r.person), r])
  );
  /*
   * Dieselben Ziele OHNE Person – fuer den Filter weiter unten.
   *
   * Ziele, die die Reife nur einmal je Fall zaehlt (`jePerson: false`, etwa
   * Strasse und Familienstand), stehen in `relevanteZiele` allein unter
   * Position 1. Fragte der Filter dort mit `person: 2` nach, ging die Frage fuer
   * den zweiten Antragsteller verloren. Ob eine Angabe fuer diesen Fall zaehlt,
   * haengt aber am Ziel, nicht an der Person.
   */
  const relevanteZielBasen = new Set(
    reife.felder.map((r) => `${r.quelle}.${r.schluessel}`)
  );

  const abschnitte = new Map<AbschnittId, MaskenAbschnitt>();
  // Ein Zielfeld bekommt genau EIN Eingabefeld. Sonst schrieben zwei Eingaben
  // auf dieselbe Spalte und die zuletzt verlassene gewaenne – z. B.
  // "Kaufpreis" und "Grundstueckspreis" beim Neubau.
  const belegt = new Set<string>();

  for (const k of kandidaten) {
    const schritt = KATALOG[k.schrittIndex]!;
    const feld = k.feld;
    const person = k.person;
    const zielKey = zielSchluessel(feld.ziel.entitaet, feld.ziel.feld, person);
    if (belegt.has(zielKey)) continue;

    const relevant = relevanteZiele.get(zielKey);
    /*
     * Die Gegenrichtung zu `ergaenzeUnerreichbare`: Eine angebotsrelevante
     * Angabe, die die Reife fuer DIESEN Fall nicht zaehlt, gibt es hier nicht
     * – dann darf die Maske sie auch nicht fragen.
     *
     * Bei den Arbeitsvertrags-Angaben fiel das noch von selbst weg, weil sie
     * allein im angestellten Zweig stehen. Die Grundstuecksgroesse steht
     * dagegen NEBEN Baujahr und Zimmerzahl auf der Objektseite: Die Seite
     * bleibt sichtbar, also bliebe auch die Frage nach dem Grundstueck einer
     * Eigentumswohnung stehen. Gleiches bei der Maklergebuehr einer
     * Anschlussfinanzierung – der Katalog blendet nur die Ja/Nein-Frage aus,
     * das Prozentfeld haengt an der im Gespraech hart gesetzten Antwort "ja".
     *
     * Nur angebotsrelevante Ziele werden so gefiltert: Baukosten oder
     * Warmmiete zaehlt die Reife nie, sie sollen aber gefragt werden.
     */
    const zielBasis = `${feld.ziel.entitaet}.${feld.ziel.feld}`;
    if (!relevanteZielBasen.has(zielBasis) && ANGEBOTSRELEVANTE_ZIELE.has(zielBasis)) continue;
    belegt.add(zielKey);

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
        antragstellerZahl > 1 && person ? `${feld.label} · Antragsteller ${person}` : feld.label,
      typ: feld.typ,
      hinweis: feld.hinweis,
      optionen: ENUM_OPTIONEN[`${feld.ziel.entitaet}.${feld.ziel.feld}`] ?? feld.optionen,
      ziel: { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld },
      person,
      wert: formatiereWert(feld.typ, liesRoh(stand, feld.ziel.entitaet, feld.ziel.feld, person ?? 1)),
      angebotsrelevant: !!relevant,
    });

    if (relevant) {
      abschnitt.relevant += 1;
      if (relevant.gefuellt) abschnitt.gefuellt += 1;
    }
  }

  return ABSCHNITT_REIHENFOLGE.map((id) => abschnitte.get(id)).filter(
    (a): a is MaskenAbschnitt => !!a && a.felder.length > 0
  );
}
