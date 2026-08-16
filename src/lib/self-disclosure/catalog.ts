import type { Antworten, Schritt } from "@/lib/self-disclosure/types";

/**
 * Der Fragenkatalog. Reihenfolge im Array = Reihenfolge im Bogen.
 *
 * Dreizehn SEITEN statt vierunddreissig Einzelfragen: Die ersten sechs tragen
 * `umfang: "kurz"` und bilden den oeffentlichen Anfragebogen, die sieben
 * dahinter kommen nur hinter dem persoenlichen Link dazu. Vorher stand auf
 * jedem Bildschirm genau eine Frage – bei zwei Antragstellern neununddreissig
 * Bildschirme, und Juergens Befund dazu lautete: "Das macht kaum einer mit."
 *
 * Fragetexte, Optionen, Hinweise und Zielfelder sind dabei unveraendert
 * uebernommen; es wurde nur neu gruppiert. Was frueher als Bedingung am
 * SCHRITT hing, haengt jetzt am FELD (`Feld.sichtbar`) – denn auf einer
 * gebuendelten Seite gehoert je nach Vorhaben nur ein Teil der Felder dorthin.
 */

/** Liest eine Antwort als String; "" gilt als nicht beantwortet. */
export const wert = (a: Antworten, k: string): string =>
  typeof a[k] === "string" ? (a[k] as string) : "";

const KAUFZWEIG = ["kauf_neubau", "kauf_bestand", "eigenes_bauvorhaben"];

/**
 * Ohne Angabe zur Finanzierungsart gilt der Kaufzweig: Er trägt den Bogen, und
 * eine übersprungene erste Frage darf nicht fast alles Weitere verschlucken.
 */
const istKauf = (a: Antworten): boolean => {
  const art = wert(a, "vorhaben.art");
  return art === "" || KAUFZWEIG.includes(art);
};

/** Genau diese Finanzierungsarten – eine fehlende Antwort zaehlt NICHT dazu. */
const istArt =
  (...arten: string[]) =>
  (a: Antworten): boolean =>
    arten.includes(wert(a, "vorhaben.art"));

/*
 * FELDGRUPPEN: Felder, die sich EINE Bedingung teilen – dieselbe Funktion,
 * nicht bloss denselben Wortlaut.
 *
 * Das ist keine Sparsamkeit beim Tippen, sondern eine Aussage: Diese Fragen
 * werden gemeinsam sichtbar und ergeben nur gemeinsam Sinn. Vor dem
 * Katalogschnitt sagte das die Schrittgrenze ("Bei wem sind Sie
 * beschaeftigt?" war EIN Bildschirm); seit die Fragen auf gebuendelten Seiten
 * nebeneinanderstehen, sagt es die geteilte Bedingung.
 *
 * Die Maske fuers Erstgespraech liest diese Kopplung aus (`mitgehendeGeschwister`
 * in erstgespraech/maske.ts): Zieht sie ein Feld einer Gruppe herein, weil die
 * Reifeleiste es verlangt, kommt die ganze Gruppe mit. Ohne das fiel zweimal
 * still etwas heraus – der ORT des Objekts ausserhalb des Kaufzweigs und
 * "Beschaeftigt seit" bei der Beschaeftigungsart "sonstiges" (Minijob).
 *
 * Wer eine Gruppe aufloest, muss also wissen, was er tut. Wer eine Bedingung
 * versehentlich zweimal notiert statt sie zu teilen, bekommt keinen Fehler,
 * aber einen roten Test (siehe erstgespraech-maske.test.ts).
 */

/** Grundstueckspreis und Baukosten – frueher der Schritt "Was kosten Grundstück und Bau?". */
const istEigenesBauvorhaben = istArt("eigenes_bauvorhaben");
/** Geplante Arbeiten und ihre Kosten – frueher "Was möchten Sie modernisieren?". */
const istModernisierung = istArt("modernisierung");
/** Restschuld und Ende der Zinsbindung – frueher "Wie hoch ist Ihre Restschuld?". */
const istAnschlussfinanzierung = istArt("anschlussfinanzierung");

const ANGESTELLT = ["angestellter", "arbeiter", "beamter"];
const SELBSTSTAENDIG = ["selbststaendiger", "handwerker", "freiberufler"];

/**
 * Prüft die Berufsart der GERADE gefragten Person – Person 1 kann angestellt
 * und Person 2 selbstständig sein. Ist die Art übersprungen, bleiben beide
 * Zweige zu: Wir fragen lieber weniger als nach dem Falschen.
 */
const hatBerufsart = (a: Antworten, arten: string[], person: 1 | 2 = 1): boolean =>
  arten.includes(wert(a, `p${person}.personen.beruf_art`));

/** Trägt diese Person überhaupt einen der beiden Berufszweige? */
const hatBerufszweig = (a: Antworten, person: 1 | 2 = 1): boolean =>
  hatBerufsart(a, ANGESTELLT, person) || hatBerufsart(a, SELBSTSTAENDIG, person);

/*
 * Drei Feldgruppen im Berufsteil – die drei frueheren Schritte. Beruf und
 * Arbeitgeber bleiben bewusst von der Vertragsdauer getrennt: "Wer ist Ihr
 * Arbeitgeber?" und "Seit wann, befristet, Probezeit?" sind zwei Fragen, und
 * die Maske fuers Erstgespraech soll die zweite auch dann stellen koennen,
 * wenn sie die erste nicht braucht (Minijob).
 */
const nurArbeitgeber = (a: Antworten, person?: 1 | 2): boolean =>
  hatBerufsart(a, ANGESTELLT, person);
const nurVertragsdauer = (a: Antworten, person?: 1 | 2): boolean =>
  hatBerufsart(a, ANGESTELLT, person);
const nurSelbststaendig = (a: Antworten, person?: 1 | 2): boolean =>
  hatBerufsart(a, SELBSTSTAENDIG, person);

const istGefunden = (a: Antworten): boolean => wert(a, "vorhaben.stand") === "gefunden";

export const KATALOG: Schritt[] = [
  // ══════════════════════════════ Der kurze Bogen ══════════════════════════
  // Sechs Seiten. Was hier steht, entscheidet darueber, ob aus einem Besucher
  // ein Lead wird – jede weitere Frage ist an dieser Stelle am teuersten.
  {
    id: "vorhaben",
    umfang: "kurz",
    abschnitt: "vorhaben",
    frage: "Was möchten Sie finanzieren?",
    felder: [
      {
        id: "art",
        label: "Finanzierungsart",
        typ: "auswahl",
        ziel: { entitaet: "case", feld: "financingType" },
        optionen: [
          { wert: "kauf_neubau", label: "Kauf Neubau" },
          { wert: "kauf_bestand", label: "Kauf Bestandsimmobilie" },
          { wert: "eigenes_bauvorhaben", label: "Eigenes Bauvorhaben" },
          { wert: "modernisierung", label: "Modernisierung" },
          { wert: "anschlussfinanzierung", label: "Anschlussfinanzierung" },
          { wert: "kapitalbeschaffung", label: "Kapitalbeschaffung" },
        ],
      },
      {
        id: "stand",
        label: "Stand der Suche",
        typ: "auswahl",
        sichtbar: istKauf,
        abhaengigVon: "vorhaben.art",
        optionen: [
          { wert: "gefunden", label: "Immobilie gefunden" },
          { wert: "nicht_besichtigt", label: "Noch nicht besichtigt" },
        ],
      },
      {
        id: "nutzung",
        label: "Nutzung",
        typ: "auswahl",
        ziel: { entitaet: "property", feld: "nutzung" },
        sichtbar: istKauf,
        abhaengigVon: "vorhaben.art",
        optionen: [
          { wert: "selbstnutzung", label: "Selbst bewohnen" },
          { wert: "vermietet", label: "Vermieten" },
          { wert: "gemischt", label: "Teilweise vermieten" },
        ],
      },
    ],
  },
  {
    id: "objekt_preis",
    umfang: "kurz",
    abschnitt: "vorhaben",
    frage: "Um welche Immobilie geht es?",
    felder: [
      {
        id: "plz",
        label: "PLZ",
        typ: "text",
        hinweis:
          "Wenn Sie noch unsicher sind, genügt eine PLZ aus dem Bundesland – die Kaufnebenkosten unterscheiden sich je Bundesland.",
        ziel: { entitaet: "property", feld: "zip" },
        sichtbar: istKauf,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "ort",
        label: "Ort",
        typ: "text",
        ziel: { entitaet: "property", feld: "city" },
        sichtbar: istKauf,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "kaufpreis",
        label: "Kaufpreis",
        typ: "betrag",
        hinweis:
          "Nur der Preis der Immobilie, ohne Nebenkosten. Noch kein konkreter Preis? Dann Ihr Budget.",
        ziel: { entitaet: "financingRequest", feld: "kaufpreis" },
        /*
         * Schliesst `grundstueck` aus (siehe dort): Beide schreiben nach
         * `financingRequest.kaufpreis`. Waeren beide zugleich sichtbar,
         * entschiede die Reihenfolge im Katalog, welche Antwort gewinnt.
         */
        sichtbar: (a) => {
          const art = wert(a, "vorhaben.art");
          return art === "" || art === "kauf_neubau" || art === "kauf_bestand";
        },
        abhaengigVon: "vorhaben.art",
      },
      {
        /*
         * ACHTUNG, Namensgleichheit mit `objekt_details.grundstueck`: HIER ist
         * der Grundstueckspreis in Euro (Kaufpreis-Anteil beim eigenen
         * Bauvorhaben), DORT die Grundstuecksflaeche in m². Zulaessig, weil die
         * Antwortschluessel sich durch die Seite unterscheiden
         * ("objekt_preis.grundstueck" vs. "objekt_details.grundstueck") – beim
         * Lesen aber leicht zu verwechseln.
         */
        id: "grundstueck",
        label: "Grundstückspreis",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "kaufpreis" },
        sichtbar: istEigenesBauvorhaben,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "bau",
        label: "Baukosten",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "baukosten" },
        sichtbar: istEigenesBauvorhaben,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "vorhaben",
        label: "Geplante Arbeiten",
        typ: "text",
        sichtbar: istModernisierung,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "modernisierung",
        label: "Geschätzte Kosten",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "modernisierungskosten" },
        sichtbar: istModernisierung,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "restschuld",
        label: "Restschuld",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
        /*
         * Restschuld, Kapitalbedarf und `finanzierungswunsch.darlehen` zeigen
         * ALLE DREI auf `financingRequest.darlehenswunsch`. Ihre Bedingungen
         * schliessen sich deshalb gegenseitig aus – hier die
         * Anschlussfinanzierung, dort die Kapitalbeschaffung, und die
         * Darlehenssumme genau dann, wenn keines von beiden vorliegt.
         */
        sichtbar: istAnschlussfinanzierung,
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "kapitalbedarf",
        label: "Benötigter Betrag",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
        sichtbar: istArt("kapitalbeschaffung"),
        abhaengigVon: "vorhaben.art",
      },
      {
        /*
         * Der Nenner des Beleihungsauslaufs, wenn es keinen Kaufpreis gibt.
         *
         * Beim Kauf ist der Kaufpreis beides zugleich: das, was finanziert
         * wird, UND der Massstab der Bank. Bei diesen drei Arten faellt das
         * auseinander – der Kunde besitzt die Immobilie bereits. Ohne diese
         * Frage blieb die Machbarkeits-Ampel bei der Haelfte aller
         * Vorhabensarten grau (16.08.2026).
         */
        id: "objektwert",
        label: "Geschätzter Wert der Immobilie",
        typ: "betrag",
        hinweis: "Ein Schätzwert genügt – was die Immobilie heute am Markt wert wäre.",
        ziel: { entitaet: "property", feld: "objektwert" },
        sichtbar: (a) => {
          const art = wert(a, "vorhaben.art");
          return (
            art === "anschlussfinanzierung" ||
            art === "kapitalbeschaffung" ||
            art === "modernisierung"
          );
        },
        abhaengigVon: "vorhaben.art",
      },
      {
        /*
         * NICHT bei der Anschlussfinanzierung: Dort WIRD die Restschuld
         * abgeloest, sie steht eine Frage weiter oben unter ihrem eigenen
         * Namen. Hier geht es um ein Darlehen, das BESTEHEN BLEIBT und
         * Beleihungsraum verbraucht, den das neue nicht mehr hat.
         *
         * Ohne diese Frage waeren 100.000 Euro Kapitalbeschaffung auf eine
         * Immobilie von 300.000 Euro immer 33 % Auslauf – auch wenn darauf
         * noch 200.000 Euro liegen und es in Wahrheit 100 % sind.
         */
        id: "bestehende_grundschuld",
        label: "Restschuld eines laufenden Darlehens auf dieser Immobilie",
        typ: "betrag",
        hinweis:
          "Nur, wenn die Immobilie noch finanziert ist. Die Monatsrate bitte weiter hinten bei den laufenden Krediten angeben.",
        ziel: { entitaet: "property", feld: "bestehendeGrundschuld" },
        sichtbar: (a) => {
          const art = wert(a, "vorhaben.art");
          return art === "kapitalbeschaffung" || art === "modernisierung";
        },
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "wohnflaeche",
        label: "Wohnfläche in m²",
        typ: "zahl",
        ziel: { entitaet: "property", feld: "wohnflaeche" },
        sichtbar: istGefunden,
        abhaengigVon: "vorhaben.stand",
      },
      {
        /*
         * Die Ja/Nein-Frage steht HIER, ihre HOEHE eine Seite weiter auf
         * "Wie soll die Finanzierung aussehen?".
         *
         * Sie standen einmal beide auf dieser Seite, und das Prozentfeld war
         * damit im Ablauf unerreichbar: Der Server rechnet die Feldliste vor
         * dem Absenden, es gibt keine clientseitige Neuauswertung, und
         * `speichereAntwort` springt danach auf die FOLGENDE Seite. Fehlt die
         * Provision, rechnet die Machbarkeit mit 0 % Courtage – die Ampel wird
         * nicht grau, sondern zu OPTIMISTISCH.
         *
         * Die Hoehe wandert und nicht diese Frage: Auf Seite 1 stuende sonst
         * eine vierte Frage, und zwar bevor der Besucher ueberhaupt gesagt hat,
         * was er finanzieren will – dort ist jede zusaetzliche Frage am
         * teuersten (siehe Kopf dieser Datei).
         */
        id: "makler",
        label: "Maklergebühr",
        typ: "auswahl",
        sichtbar: istKauf,
        abhaengigVon: "vorhaben.art",
        optionen: [
          { wert: "ja", label: "Ja, es fällt eine an" },
          { wert: "nein", label: "Provisionsfrei" },
          { wert: "unbekannt", label: "Weiß ich nicht" },
        ],
      },
    ],
  },
  {
    id: "finanzierungswunsch",
    umfang: "kurz",
    abschnitt: "vorhaben",
    frage: "Wie soll die Finanzierung aussehen?",
    felder: [
      {
        id: "eigenkapital",
        label: "Eigenkapital",
        typ: "betrag",
        hinweis: "Noch nicht entschieden? Dann der Betrag, den Sie höchstens einbringen könnten.",
        ziel: { entitaet: "financingRequest", feld: "eigenkapital" },
      },
      {
        id: "darlehen",
        label: "Gewünschte Darlehenssumme",
        typ: "betrag",
        hinweis: "Meist Kaufpreis plus Nebenkosten minus Eigenkapital – ein Schätzwert genügt.",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
        /*
         * Anschlussfinanzierung und Kapitalbeschaffung fragen denselben Betrag
         * schon unter ihrem eigenen Namen ("Restschuld", "Benötigter Betrag").
         * Zweimal nach demselben Zielfeld zu fragen, wäre in beiden Modi
         * verwirrend – und in der Maske fürs Erstgespräch stünden zwei
         * Eingaben auf derselben Spalte.
         */
        sichtbar: (a) => {
          const art = wert(a, "vorhaben.art");
          return art !== "anschlussfinanzierung" && art !== "kapitalbeschaffung";
        },
        abhaengigVon: "vorhaben.art",
      },
      {
        id: "wunschrate",
        label: "Wunschrate monatlich",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "wunschrateMonatlich" },
      },
      {
        /*
         * Steht auf DIESER Seite, obwohl die Maklergebuehr inhaltlich zum
         * Objekt gehoert: Ihre Steuerantwort ("objekt_preis.makler") liegt eine
         * Seite davor, und nur so kreuzt die Abhaengigkeit eine Seitengrenze.
         * Nebeneinander waere das Feld im Ablauf unerreichbar – siehe die
         * Begruendung bei "objekt_preis.makler".
         */
        id: "makler_hoehe",
        label: "Maklergebühr in Prozent",
        typ: "prozent_oder_betrag",
        ziel: { entitaet: "financingRequest", feld: "maklerprovisionProzent" },
        sichtbar: (a) => wert(a, "objekt_preis.makler") === "ja",
        abhaengigVon: "objekt_preis.makler",
      },
    ],
  },
  {
    /*
     * Steht VOR den Personen-Spalten und nicht dahinter: Erst muss feststehen,
     * wie viele Spalten die naechste Seite bekommt.
     */
    id: "haushalt",
    umfang: "kurz",
    abschnitt: "haushalt",
    frage: "Wer finanziert, und wer lebt im Haushalt?",
    felder: [
      {
        id: "anzahl",
        label: "Antragsteller",
        typ: "auswahl",
        hinweis: "Verheiratete stellen den Antrag in der Regel gemeinsam.",
        optionen: [
          { wert: "1", label: "Alleine" },
          { wert: "2", label: "Mit einer weiteren Person" },
        ],
      },
      {
        id: "kinder",
        label: "Anzahl Kinder",
        typ: "zahl",
        hinweis: "Einmal für den ganzen Haushalt – nicht je Person.",
        ziel: { entitaet: "applicant", feld: "anzahlKinder" },
      },
    ],
  },
  {
    id: "personen",
    umfang: "kurz",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wer sind Sie?",
    felder: [
      { id: "vorname", label: "Vorname", typ: "text", ziel: { entitaet: "applicant", feld: "vorname" } },
      { id: "nachname", label: "Nachname", typ: "text", ziel: { entitaet: "applicant", feld: "nachname" } },
      { id: "email", label: "E-Mail", typ: "text", ziel: { entitaet: "applicant", feld: "email" } },
      { id: "telefon", label: "Telefon", typ: "text", ziel: { entitaet: "applicant", feld: "phone" } },
      {
        id: "beruf_art",
        label: "Arbeitsverhältnis",
        typ: "auswahl",
        ziel: { entitaet: "employment", feld: "beschaeftigungsart" },
        // Die neun FinLink-Optionen; die Abbildung auf EmploymentType passiert
        // erst bei der Übernahme, damit der Bogen die vertraute Auswahl zeigt.
        optionen: [
          { wert: "angestellter", label: "Angestellte/r" },
          { wert: "arbeiter", label: "Arbeiter/in" },
          { wert: "selbststaendiger", label: "Selbstständige/r" },
          { wert: "handwerker", label: "Selbstständige/r Handwerker/in" },
          { wert: "freiberufler", label: "Freiberufler/in" },
          { wert: "beamter", label: "Beamter/in" },
          { wert: "privatier", label: "Privatier/Privatière" },
          { wert: "rentner", label: "Rentner/in" },
          { wert: "sonstiges", label: "Anderes" },
        ],
      },
      {
        id: "netto",
        label: "Netto monatlich",
        typ: "betrag",
        hinweis: "Bitte Ihr eigenes Einkommen, nicht das des Haushalts.",
        ziel: { entitaet: "income", feld: "nettoMonatlich" },
      },
    ],
  },
  {
    id: "verpflichtungen",
    umfang: "kurz",
    abschnitt: "haushalt",
    frage: "Haben Sie laufende Kredite oder Leasingverträge?",
    felder: [
      {
        id: "liste",
        label: "Verpflichtungen",
        typ: "text",
        hinweis: "Art, Gläubiger, Restschuld, Monatsrate, Ablösung geplant",
        ziel: { entitaet: "liability", liste: true },
      },
    ],
  },

  // ═══════════════════════ Nur hinter dem persoenlichen Link ═══════════════
  // Sieben weitere Seiten. Wer hier ankommt, ist bereits Kunde – hier darf es
  // ausfuehrlich werden.
  {
    id: "person_details",
    umfang: "voll",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wie lauten Ihre persönlichen Angaben?",
    felder: [
      {
        id: "anrede",
        label: "Anrede",
        typ: "auswahl",
        ziel: { entitaet: "applicant", feld: "anrede" },
        optionen: [
          { wert: "herr", label: "Herr" },
          { wert: "frau", label: "Frau" },
        ],
      },
      {
        id: "geburtsdatum",
        label: "Geburtsdatum",
        typ: "datum",
        ziel: { entitaet: "applicant", feld: "geburtsdatum" },
      },
      { id: "geburtsort", label: "Geburtsort", typ: "text", ziel: { entitaet: "applicant", feld: "geburtsort" } },
      {
        id: "staatsangehoerigkeit",
        label: "Staatsangehörigkeit",
        typ: "text",
        ziel: { entitaet: "applicant", feld: "staatsangehoerigkeit" },
      },
      {
        id: "familienstand",
        label: "Familienstand",
        typ: "auswahl",
        ziel: { entitaet: "applicant", feld: "familienstand" },
        optionen: [
          { wert: "ledig", label: "Ledig" },
          { wert: "verheiratet", label: "Verheiratet" },
          { wert: "geschieden", label: "Geschieden" },
          { wert: "verwitwet", label: "Verwitwet" },
          { wert: "eingetragene_partnerschaft", label: "Eingetragene Partnerschaft" },
          { wert: "getrennt_lebend", label: "Getrennt lebend" },
        ],
      },
      { id: "strasse", label: "Straße und Hausnummer", typ: "text", ziel: { entitaet: "applicant", feld: "street" } },
      { id: "plz", label: "PLZ", typ: "text", ziel: { entitaet: "applicant", feld: "zip" } },
      { id: "ort", label: "Ort", typ: "text", ziel: { entitaet: "applicant", feld: "city" } },
    ],
  },
  {
    id: "beruf_details",
    umfang: "voll",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Was machen Sie beruflich?",
    /*
     * Die Bedingung steht ZWEIMAL – am Schritt und an jedem Feld –, und beide
     * Male aus einem eigenen Grund:
     *  - Am SCHRITT entscheidet sie, ob es die Spalte dieser Person ueberhaupt
     *    gibt (`sichtbareSchritte` rechnet `personen` als echte Teilmenge).
     *    Ohne sie bekaeme ein Rentner eine Seite ohne ein einziges Feld.
     *  - Am FELD entscheidet sie, WELCHE Haelfte der Seite die Spalte zeigt.
     *    Ein gemischtes Paar bekommt so links die Arbeitgeber-, rechts die
     *    Firmenfragen – frueher waren das zwei getrennte Schritte.
     */
    sichtbar: (a, person) => hatBerufszweig(a, person),
    felder: [
      {
        id: "beruf",
        label: "Beruf",
        typ: "text",
        ziel: { entitaet: "employment", feld: "beruf" },
        sichtbar: nurArbeitgeber,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "arbeitgeber",
        label: "Arbeitgeber",
        typ: "text",
        ziel: { entitaet: "employment", feld: "arbeitgeber" },
        sichtbar: nurArbeitgeber,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "arbeitgeber_adresse",
        label: "Anschrift des Arbeitgebers",
        typ: "text",
        ziel: { entitaet: "employment", feld: "arbeitgeberAdresse" },
        sichtbar: nurArbeitgeber,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "seit",
        label: "Beschäftigt seit",
        typ: "datum",
        ziel: { entitaet: "employment", feld: "eintrittsdatum" },
        sichtbar: nurVertragsdauer,
        abhaengigVon: "personen.beruf_art",
      },
      {
        // Ankreuzfeld statt Datum: Ein Vertragsende ist fuer die Mehrheit der
        // Faelle (unbefristet) nie ausfuellbar, die Vorbelegung "nein" ist
        // bereits die Antwort (Entscheidung des Vermittlers vom 13.08.2026).
        // "befristetBis" (Datum) bleibt als Spalte fuer den FinLink-Import
        // und die Anzeige bestehen, ist aber keine Frage mehr.
        id: "befristet",
        label: "Arbeitsvertrag befristet?",
        typ: "ja_nein",
        ziel: { entitaet: "employment", feld: "befristet" },
        sichtbar: nurVertragsdauer,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "probezeit",
        label: "Noch in der Probezeit",
        typ: "ja_nein",
        ziel: { entitaet: "employment", feld: "inProbezeit" },
        sichtbar: nurVertragsdauer,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "firma",
        label: "Firma",
        typ: "text",
        ziel: { entitaet: "selfEmployment", feld: "firma" },
        sichtbar: nurSelbststaendig,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "rechtsform",
        label: "Rechtsform",
        typ: "text",
        ziel: { entitaet: "selfEmployment", feld: "rechtsform" },
        sichtbar: nurSelbststaendig,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "beteiligung",
        label: "Beteiligung in Prozent",
        typ: "zahl",
        ziel: { entitaet: "selfEmployment", feld: "beteiligungProzent" },
        sichtbar: nurSelbststaendig,
        abhaengigVon: "personen.beruf_art",
      },
      {
        id: "gruendung",
        label: "Gegründet am",
        typ: "datum",
        ziel: { entitaet: "selfEmployment", feld: "gruendungsdatum" },
        sichtbar: nurSelbststaendig,
        abhaengigVon: "personen.beruf_art",
      },
    ],
  },
  {
    id: "einnahmen",
    umfang: "voll",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Wie hoch sind Ihre Einnahmen?",
    hinweis: "Bitte Ihr eigenes Einkommen, nicht das des Haushalts.",
    felder: [
      { id: "brutto", label: "Brutto monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "bruttoMonatlich" } },
      {
        id: "sonderzahlungen",
        label: "Sonderzahlungen im Jahr",
        typ: "betrag",
        ziel: { entitaet: "income", feld: "einmalzahlungenJaehrlich" },
      },
      {
        id: "miete",
        label: "Mieteinnahmen monatlich",
        typ: "betrag",
        ziel: { entitaet: "income", feld: "mieteinnahmen" },
      },
      {
        id: "sonstige",
        label: "Sonstige Einnahmen monatlich",
        typ: "betrag",
        ziel: { entitaet: "income", feld: "sonstigeEinnahmen" },
      },
    ],
  },
  {
    id: "haushalt_ausgaben",
    umfang: "voll",
    abschnitt: "haushalt",
    frage: "Welche festen Ausgaben haben Sie?",
    // Kein Ziel: Das Schema kennt weder Warmmiete noch Unterhalt. Die Werte
    // bleiben im Bogen und erscheinen im Eingang zur Kenntnis.
    felder: [
      { id: "warmmiete", label: "Derzeitige Warmmiete monatlich", typ: "betrag" },
      { id: "unterhalt", label: "Unterhaltszahlungen monatlich", typ: "betrag" },
    ],
  },
  {
    id: "eigenkapital_herkunft",
    umfang: "voll",
    abschnitt: "eigenkapital",
    frage: "Woraus besteht Ihr Eigenkapital?",
    felder: [
      {
        id: "liste",
        label: "Eigenkapital",
        typ: "text",
        hinweis: "Bankguthaben, Bausparvertrag, Wertpapiere, Schenkung, Verkaufserlös, Eigenleistung",
        ziel: { entitaet: "asset", liste: true },
      },
    ],
  },
  {
    id: "objekt_details",
    umfang: "voll",
    abschnitt: "objekt",
    frage: "Was können Sie uns über die Immobilie sagen?",
    /*
     * Diese Bedingung bleibt am SCHRITT statt an jedem Feld: Sie gilt hier fuer
     * ALLE Felder der Seite (frueher waren es vier eigene Schritte, alle mit
     * `istGefunden`). Am Feld haengend bliebe eine Seite uebrig, auf der kein
     * einziges Feld sichtbar ist – ein leerer Bildschirm mit "Weiter".
     */
    sichtbar: istGefunden,
    felder: [
      {
        id: "objektart",
        label: "Objektart",
        typ: "auswahl",
        ziel: { entitaet: "property", feld: "objektart" },
        optionen: [
          { wert: "eigentumswohnung", label: "Eigentumswohnung" },
          { wert: "einfamilienhaus", label: "Einfamilienhaus" },
          { wert: "doppelhaushaelfte", label: "Doppelhaushälfte" },
          { wert: "reihenhaus", label: "Reihenhaus" },
          { wert: "mehrfamilienhaus", label: "Mehrfamilienhaus" },
          { wert: "grundstueck", label: "Grundstück" },
        ],
      },
      {
        id: "strasse",
        label: "Straße und Hausnummer",
        typ: "text",
        ziel: { entitaet: "property", feld: "street" },
      },
      {
        /*
         * ACHTUNG, Namensgleichheit mit `objekt_preis.grundstueck`: HIER ist
         * die Grundstuecksflaeche in m², DORT der Grundstueckspreis in Euro.
         * Verschiedene Seiten, verschiedene Antwortschluessel – aber beim
         * Lesen leicht zu verwechseln.
         */
        id: "grundstueck",
        label: "Grundstücksfläche in m²",
        typ: "zahl",
        ziel: { entitaet: "property", feld: "grundstuecksflaeche" },
      },
      { id: "baujahr", label: "Baujahr", typ: "zahl", ziel: { entitaet: "property", feld: "baujahr" } },
      { id: "zimmer", label: "Zimmer", typ: "zahl", ziel: { entitaet: "property", feld: "anzahlZimmer" } },
      { id: "stellplaetze", label: "Stellplätze", typ: "zahl", ziel: { entitaet: "property", feld: "stellplaetze" } },
      {
        id: "hausgeld",
        label: "Hausgeld monatlich",
        typ: "betrag",
        ziel: { entitaet: "property", feld: "hausgeldMonatlich" },
      },
      {
        id: "mieteinnahmen",
        label: "Mieteinnahmen monatlich",
        typ: "betrag",
        ziel: { entitaet: "property", feld: "mieteinnahmenMonatlich" },
      },
    ],
  },
  {
    id: "konditionen",
    umfang: "voll",
    abschnitt: "vorhaben",
    frage: "Welche Konditionen wünschen Sie sich?",
    hinweis: "Wünsche, keine Zusagen – die Bank entscheidet über die Konditionen.",
    felder: [
      {
        id: "zinsbindung",
        label: "Zinsbindung in Jahren",
        typ: "zahl",
        hinweis: "Üblich sind 5, 10, 15, 20 oder 30 Jahre.",
        ziel: { entitaet: "financingRequest", feld: "zinsbindungJahre" },
      },
      {
        id: "sondertilgung",
        label: "Sondertilgung pro Jahr in Prozent",
        // Prozent statt ja/nein: Europace erwartet einen Satz
        // (annuitaetendetails.sondertilgungJaehrlich). Aus einem "ja" muesste
        // BaufiDesk sonst eine Zahl erfinden, die niemand gesagt hat.
        typ: "zahl",
        hinweis: "5 % pro Jahr ist marktüblich. 0 = keine Sondertilgung gewünscht.",
        ziel: { entitaet: "financingRequest", feld: "sondertilgungProzentJaehrlich" },
      },
      {
        id: "zinsbindung_ende",
        label: "Zinsbindung endet am",
        typ: "datum",
        sichtbar: istAnschlussfinanzierung,
        abhaengigVon: "vorhaben.art",
      },
    ],
  },
];

/**
 * Wie viele Antragsteller der Bogen abfragt. Ohne Angabe: einer – der häufigere
 * Fall, und ein übersprungener Schritt soll den Bogen nicht verdoppeln.
 */
export function anzahlAntragsteller(a: Antworten): 1 | 2 {
  return wert(a, "haushalt.anzahl") === "2" ? 2 : 1;
}
