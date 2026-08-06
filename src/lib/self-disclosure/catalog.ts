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
];

/**
 * Wie viele Antragsteller der Bogen abfragt. Ohne Angabe: einer – der häufigere
 * Fall, und ein übersprungener Schritt soll den Bogen nicht verdoppeln.
 */
export function anzahlAntragsteller(a: Antworten): 1 | 2 {
  return wert(a, "anzahl_antragsteller.anzahl") === "2" ? 2 : 1;
}
