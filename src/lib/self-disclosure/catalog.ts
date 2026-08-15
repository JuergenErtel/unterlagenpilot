import type { Antworten, Schritt } from "@/lib/self-disclosure/types";

/**
 * Der Fragenkatalog. Reihenfolge im Array = Reihenfolge im Bogen.
 *
 * Abschnitt A folgt der FinLink-Strecke Frage für Frage (eine Frage pro
 * Bildschirm); die späteren Abschnitte fassen Zusammengehöriges, sonst käme der
 * Bogen auf über 70 Bildschirme.
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
  const art = wert(a, "finanzierungsart.art");
  return art === "" || KAUFZWEIG.includes(art);
};

const ANGESTELLT = ["angestellter", "arbeiter", "beamter"];
const SELBSTSTAENDIG = ["selbststaendiger", "handwerker", "freiberufler"];

/**
 * Prüft die Berufsart der GERADE gefragten Person – Person 1 kann angestellt
 * und Person 2 selbstständig sein. Ist die Art übersprungen, bleiben beide
 * Zweige zu: Wir fragen lieber weniger als nach dem Falschen.
 */
const hatBerufsart = (a: Antworten, arten: string[], person: 1 | 2 = 1): boolean =>
  arten.includes(wert(a, `p${person}.beruf_art.art`));

const istGefunden = (a: Antworten): boolean => wert(a, "objektstand.stand") === "gefunden";

export const KATALOG: Schritt[] = [
  {
    id: "finanzierungsart",
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
    ],
  },
  {
    id: "objektstand",
    abschnitt: "vorhaben",
    frage: "Haben Sie bereits eine Immobilie gefunden?",
    sichtbar: istKauf,
    felder: [
      {
        id: "stand",
        label: "Stand der Suche",
        typ: "auswahl",
        optionen: [
          { wert: "gefunden", label: "Immobilie gefunden" },
          { wert: "nicht_besichtigt", label: "Noch nicht besichtigt" },
        ],
      },
    ],
  },
  {
    id: "nutzung",
    abschnitt: "vorhaben",
    frage: "Wie möchten Sie die Immobilie nutzen?",
    sichtbar: istKauf,
    felder: [
      {
        id: "art",
        label: "Nutzung",
        typ: "auswahl",
        ziel: { entitaet: "property", feld: "nutzung" },
        optionen: [
          { wert: "selbstnutzung", label: "Selbst bewohnen" },
          { wert: "vermietet", label: "Vermieten" },
          { wert: "gemischt", label: "Teilweise vermieten" },
        ],
      },
    ],
  },
  {
    id: "objekt_ort",
    abschnitt: "vorhaben",
    frage: "In welcher Stadt liegt die Immobilie?",
    hinweis:
      "Wenn Sie noch unsicher sind, genügt eine PLZ aus dem Bundesland – die Kaufnebenkosten unterscheiden sich je Bundesland.",
    sichtbar: istKauf,
    felder: [
      { id: "plz", label: "PLZ", typ: "text", ziel: { entitaet: "property", feld: "zip" } },
      { id: "ort", label: "Ort", typ: "text", ziel: { entitaet: "property", feld: "city" } },
    ],
  },
  {
    id: "kaufpreis",
    abschnitt: "vorhaben",
    frage: "Wie hoch ist der Kaufpreis?",
    hinweis:
      "Nur der Preis der Immobilie, ohne Nebenkosten. Noch kein konkreter Preis? Dann Ihr Budget.",
    sichtbar: (a) => {
      const art = wert(a, "finanzierungsart.art");
      return art === "" || art === "kauf_neubau" || art === "kauf_bestand";
    },
    felder: [
      {
        id: "betrag",
        label: "Kaufpreis",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "kaufpreis" },
      },
    ],
  },
  {
    id: "baukosten",
    abschnitt: "vorhaben",
    frage: "Was kosten Grundstück und Bau?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "eigenes_bauvorhaben",
    felder: [
      {
        id: "grundstueck",
        label: "Grundstückspreis",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "kaufpreis" },
      },
      {
        id: "bau",
        label: "Baukosten",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "baukosten" },
      },
    ],
  },
  {
    id: "modernisierungskosten",
    abschnitt: "vorhaben",
    frage: "Was möchten Sie modernisieren?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "modernisierung",
    felder: [
      { id: "vorhaben", label: "Geplante Arbeiten", typ: "text" },
      {
        id: "betrag",
        label: "Geschätzte Kosten",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "modernisierungskosten" },
      },
    ],
  },
  {
    id: "restschuld",
    abschnitt: "vorhaben",
    frage: "Wie hoch ist Ihre Restschuld?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "anschlussfinanzierung",
    felder: [
      {
        id: "betrag",
        label: "Restschuld",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
      },
      { id: "zinsbindung_ende", label: "Zinsbindung endet am", typ: "datum" },
    ],
  },
  {
    id: "kapitalbedarf",
    abschnitt: "vorhaben",
    frage: "Welchen Betrag benötigen Sie?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "kapitalbeschaffung",
    felder: [
      {
        id: "betrag",
        label: "Benötigter Betrag",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
      },
    ],
  },
  {
    id: "eigenkapital",
    abschnitt: "vorhaben",
    frage: "Wie viel Eigenkapital möchten Sie einsetzen?",
    hinweis: "Noch nicht entschieden? Dann der Betrag, den Sie höchstens einbringen könnten.",
    felder: [
      {
        id: "betrag",
        label: "Eigenkapital",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "eigenkapital" },
      },
    ],
  },
  {
    id: "darlehen",
    abschnitt: "vorhaben",
    frage: "Wie hoch soll das Darlehen sein?",
    hinweis: "Meist Kaufpreis plus Nebenkosten minus Eigenkapital – ein Schätzwert genügt.",
    /*
     * Anschlussfinanzierung und Kapitalbeschaffung fragen denselben Betrag
     * schon unter ihrem eigenen Namen ("Restschuld", "Benötigter Betrag").
     * Zweimal nach demselben Zielfeld zu fragen, wäre in beiden Modi verwirrend
     * – und in der Maske fürs Erstgespräch stünden zwei Eingaben auf derselben
     * Spalte.
     */
    sichtbar: (a) => {
      const art = wert(a, "finanzierungsart.art");
      return art !== "anschlussfinanzierung" && art !== "kapitalbeschaffung";
    },
    felder: [
      {
        id: "betrag",
        label: "Gewünschte Darlehenssumme",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" },
      },
    ],
  },
  {
    id: "kondition",
    abschnitt: "vorhaben",
    frage: "Wie soll die Finanzierung aussehen?",
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
        id: "wunschrate",
        label: "Wunschrate monatlich",
        typ: "betrag",
        ziel: { entitaet: "financingRequest", feld: "wunschrateMonatlich" },
      },
    ],
  },
  {
    id: "maklergebuehr",
    abschnitt: "vorhaben",
    frage: "Fällt beim Kauf eine Maklergebühr an?",
    sichtbar: istKauf,
    felder: [
      {
        id: "faellt_an",
        label: "Maklergebühr",
        typ: "auswahl",
        optionen: [
          { wert: "ja", label: "Ja, es fällt eine an" },
          { wert: "nein", label: "Provisionsfrei" },
          { wert: "unbekannt", label: "Weiß ich nicht" },
        ],
      },
    ],
  },
  {
    id: "maklergebuehr_hoehe",
    abschnitt: "vorhaben",
    frage: "Wie hoch sind die Maklergebühren?",
    sichtbar: (a) => wert(a, "maklergebuehr.faellt_an") === "ja",
    felder: [
      {
        id: "hoehe",
        label: "Maklergebühr in Prozent",
        typ: "prozent_oder_betrag",
        ziel: { entitaet: "financingRequest", feld: "maklerprovisionProzent" },
      },
    ],
  },
  {
    id: "anzahl_antragsteller",
    abschnitt: "vorhaben",
    frage: "Möchten Sie alleine oder mit einer weiteren Person finanzieren?",
    hinweis: "Verheiratete stellen den Antrag in der Regel gemeinsam.",
    felder: [
      {
        id: "anzahl",
        label: "Antragsteller",
        typ: "auswahl",
        optionen: [
          { wert: "1", label: "Alleine" },
          { wert: "2", label: "Mit einer weiteren Person" },
        ],
      },
    ],
  },

  // ------------------------------------------------------ B · Zur Person
  {
    id: "person_name",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wie heißen Sie?",
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
      { id: "vorname", label: "Vorname", typ: "text", ziel: { entitaet: "applicant", feld: "vorname" } },
      { id: "nachname", label: "Nachname", typ: "text", ziel: { entitaet: "applicant", feld: "nachname" } },
    ],
  },
  {
    id: "person_geburt",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wann und wo sind Sie geboren?",
    felder: [
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
    ],
  },
  {
    id: "person_familienstand",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wie ist Ihr Familienstand?",
    felder: [
      {
        id: "stand",
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
    ],
  },
  {
    id: "person_anschrift",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wo wohnen Sie derzeit?",
    felder: [
      { id: "strasse", label: "Straße und Hausnummer", typ: "text", ziel: { entitaet: "applicant", feld: "street" } },
      { id: "plz", label: "PLZ", typ: "text", ziel: { entitaet: "applicant", feld: "zip" } },
      { id: "ort", label: "Ort", typ: "text", ziel: { entitaet: "applicant", feld: "city" } },
    ],
  },
  {
    id: "person_kontakt",
    abschnitt: "person",
    personenSpalten: true,
    frage: "Wie erreichen wir Sie?",
    felder: [
      { id: "email", label: "E-Mail", typ: "text", ziel: { entitaet: "applicant", feld: "email" } },
      { id: "telefon", label: "Telefon", typ: "text", ziel: { entitaet: "applicant", feld: "phone" } },
    ],
  },

  // ------------------------------------------------ C · Beruf und Einkommen
  {
    id: "beruf_art",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "In welchem Arbeitsverhältnis sind Sie beschäftigt?",
    felder: [
      {
        id: "art",
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
    ],
  },
  {
    id: "beruf_arbeitgeber",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Bei wem sind Sie beschäftigt?",
    sichtbar: (a, person) => hatBerufsart(a, ANGESTELLT, person),
    felder: [
      { id: "beruf", label: "Beruf", typ: "text", ziel: { entitaet: "employment", feld: "beruf" } },
      { id: "arbeitgeber", label: "Arbeitgeber", typ: "text", ziel: { entitaet: "employment", feld: "arbeitgeber" } },
      {
        id: "arbeitgeber_adresse",
        label: "Anschrift des Arbeitgebers",
        typ: "text",
        ziel: { entitaet: "employment", feld: "arbeitgeberAdresse" },
      },
    ],
  },
  {
    id: "beruf_dauer",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Seit wann sind Sie dort beschäftigt?",
    sichtbar: (a, person) => hatBerufsart(a, ANGESTELLT, person),
    felder: [
      { id: "seit", label: "Beschäftigt seit", typ: "datum", ziel: { entitaet: "employment", feld: "eintrittsdatum" } },
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
      },
      {
        id: "probezeit",
        label: "Noch in der Probezeit",
        typ: "ja_nein",
        ziel: { entitaet: "employment", feld: "inProbezeit" },
      },
    ],
  },
  {
    id: "beruf_selbststaendig",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Erzählen Sie uns von Ihrer Tätigkeit",
    sichtbar: (a, person) => hatBerufsart(a, SELBSTSTAENDIG, person),
    felder: [
      { id: "firma", label: "Firma", typ: "text", ziel: { entitaet: "selfEmployment", feld: "firma" } },
      { id: "rechtsform", label: "Rechtsform", typ: "text", ziel: { entitaet: "selfEmployment", feld: "rechtsform" } },
      {
        id: "beteiligung",
        label: "Beteiligung in Prozent",
        typ: "zahl",
        ziel: { entitaet: "selfEmployment", feld: "beteiligungProzent" },
      },
      {
        id: "gruendung",
        label: "Gegründet am",
        typ: "datum",
        ziel: { entitaet: "selfEmployment", feld: "gruendungsdatum" },
      },
    ],
  },
  {
    id: "einkommen",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Wie hoch ist Ihr Einkommen?",
    hinweis: "Bitte Ihr eigenes Einkommen, nicht das des Haushalts.",
    felder: [
      { id: "netto", label: "Netto monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "nettoMonatlich" } },
      { id: "brutto", label: "Brutto monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "bruttoMonatlich" } },
      {
        id: "sonderzahlungen",
        label: "Sonderzahlungen im Jahr",
        typ: "betrag",
        ziel: { entitaet: "income", feld: "einmalzahlungenJaehrlich" },
      },
    ],
  },
  {
    id: "weitere_einnahmen",
    abschnitt: "beruf",
    personenSpalten: true,
    frage: "Haben Sie weitere Einnahmen?",
    felder: [
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

  // -------------------------------------- D · Haushalt und Verpflichtungen
  {
    id: "haushalt_kinder",
    abschnitt: "haushalt",
    frage: "Wie viele Kinder leben in Ihrem Haushalt?",
    hinweis: "Einmal für den ganzen Haushalt – nicht je Person.",
    felder: [
      { id: "anzahl", label: "Anzahl Kinder", typ: "zahl", ziel: { entitaet: "applicant", feld: "anzahlKinder" } },
    ],
  },
  {
    id: "haushalt_ausgaben",
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
    id: "verpflichtungen",
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

  // ------------------------------------------ E · Eigenkapital im Einzelnen
  {
    id: "eigenkapital_positionen",
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

  // ------------------------------------------------------- F · Das Objekt
  {
    id: "objekt_art",
    abschnitt: "objekt",
    frage: "Um welche Art von Immobilie handelt es sich?",
    sichtbar: istGefunden,
    felder: [
      {
        id: "art",
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
    ],
  },
  {
    id: "objekt_adresse",
    abschnitt: "objekt",
    frage: "Wie lautet die Adresse der Immobilie?",
    sichtbar: istGefunden,
    felder: [
      {
        id: "strasse",
        label: "Straße und Hausnummer",
        typ: "text",
        ziel: { entitaet: "property", feld: "street" },
      },
    ],
  },
  {
    id: "objekt_masse",
    abschnitt: "objekt",
    frage: "Wie groß ist die Immobilie?",
    sichtbar: istGefunden,
    felder: [
      { id: "wohnflaeche", label: "Wohnfläche in m²", typ: "zahl", ziel: { entitaet: "property", feld: "wohnflaeche" } },
      {
        id: "grundstueck",
        label: "Grundstücksfläche in m²",
        typ: "zahl",
        ziel: { entitaet: "property", feld: "grundstuecksflaeche" },
      },
      { id: "baujahr", label: "Baujahr", typ: "zahl", ziel: { entitaet: "property", feld: "baujahr" } },
      { id: "zimmer", label: "Zimmer", typ: "zahl", ziel: { entitaet: "property", feld: "anzahlZimmer" } },
      { id: "stellplaetze", label: "Stellplätze", typ: "zahl", ziel: { entitaet: "property", feld: "stellplaetze" } },
    ],
  },
  {
    id: "objekt_kosten",
    abschnitt: "objekt",
    frage: "Fallen laufende Kosten oder Einnahmen an?",
    sichtbar: istGefunden,
    felder: [
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
];

/**
 * Wie viele Antragsteller der Bogen abfragt. Ohne Angabe: einer – der häufigere
 * Fall, und ein übersprungener Schritt soll den Bogen nicht verdoppeln.
 */
export function anzahlAntragsteller(a: Antworten): 1 | 2 {
  return wert(a, "anzahl_antragsteller.anzahl") === "2" ? 2 : 1;
}
