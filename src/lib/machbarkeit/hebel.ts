import type { Annahmen, SolverEingabe } from "./types";

export type Anwendbarkeit =
  | { ok: true; max: number; schritt: number }
  | { ok: false; grund: string };

export interface HebelDefinition {
  key: string;
  /** Kundentauglich – erscheint so in der Oberflaeche. */
  titel: string;
  /**
   * datengestuetzt: steckt schon im Fall, nur zeigen wenn vorhanden.
   * hypothetisch:   steht nirgends; der Solver rechnet die noetige Groesse aus,
   *                 und die Antwort ist eine Frage an den Kunden.
   */
  sorte: "datengestuetzt" | "hypothetisch";
  /** true = ganzzahlige Werte 0..max vollstaendig durchprobieren. */
  diskret: boolean;
  /** true = Werte sind Prozentpunkte, nicht Euro (keine 100er-Rundung). */
  schrittIstProzent?: boolean;
  anwendbar: (e: SolverEingabe, a: Annahmen) => Anwendbarkeit;
  anwenden: (e: SolverEingabe, wert: number) => SolverEingabe;
  formatWert: (e: SolverEingabe, wert: number) => string;
  /** Was der Hebel kostet – Nebenwirkung in Klartext. */
  preis: (e: SolverEingabe, wert: number) => string;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Die fuenf wirksamsten Kredite – mehr Kombinationen lohnen nicht. */
const kreditKandidaten = (e: SolverEingabe) =>
  [...e.kredite].sort((x, y) => y.rate - x.rate).slice(0, 5);

export const HEBEL: HebelDefinition[] = [
  {
    key: "eigenkapital",
    titel: "Mehr Eigenkapital einbringen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.max(e.kaufpreis, 50_000), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, eigenkapital: e.eigenkapital + w }),
    formatWert: (_e, w) => `${eur(w)} zusätzlich`,
    preis: () => "Der Betrag muss verfügbar und gegenüber der Bank nachweisbar sein.",
  },
  {
    key: "eigenleistung",
    titel: "Eigenleistung anrechnen lassen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e, a) => {
      if (!e.istNeubauOderModernisierung)
        return { ok: false, grund: "Nur bei Neubau oder Modernisierung anrechenbar." };
      // Bewusst an den Modernisierungskosten, nicht am Kaufpreis: beim Neubau
      // steckt im Kaufpreis auch das Grundstueck, ein Deckel darauf waere zu hoch.
      const max = Math.round((e.modernisierungskosten * a.eigenleistungDeckelProzent) / 100);
      if (max <= 0) return { ok: false, grund: "Keine Bau- oder Modernisierungskosten erfasst." };
      return { ok: true, max, schritt: 100 };
    },
    anwenden: (e, w) => ({ ...e, eigenleistung: e.eigenleistung + w }),
    formatWert: (_e, w) => `${eur(w)} anerkannte Eigenleistung`,
    preis: () =>
      "Muss als Handwerksleistung nachgewiesen werden; Banken deckeln Höhe und Art unterschiedlich.",
  },
  {
    key: "tilgung",
    titel: "Anfangstilgung senken",
    sorte: "datengestuetzt",
    diskret: false,
    schrittIstProzent: true,
    anwendbar: (e, a) => {
      const spielraum = Math.round((e.tilgungProzent - a.mindestTilgungProzent) * 100) / 100;
      if (spielraum <= 0)
        return { ok: false, grund: `Die Tilgung liegt bereits bei ${e.tilgungProzent} %.` };
      return { ok: true, max: spielraum, schritt: 0.05 };
    },
    anwenden: (e, w) => ({
      ...e,
      tilgungProzent: Math.round((e.tilgungProzent - w) * 100) / 100,
    }),
    formatWert: (e, w) =>
      `Tilgung ${e.tilgungProzent} % → ${Math.round((e.tilgungProzent - w) * 100) / 100} %`,
    preis: () => "Deutlich längere Laufzeit und insgesamt mehr Zinskosten.",
  },
  {
    key: "konsumkredit",
    titel: "Konsumkredit mitfinanzieren",
    sorte: "datengestuetzt",
    diskret: true,
    anwendbar: (e) => {
      const n = kreditKandidaten(e).length;
      if (n === 0) return { ok: false, grund: "Keine laufenden Kredite mit Rate erfasst." };
      return { ok: true, max: Math.pow(2, n) - 1, schritt: 1 };
    },
    anwenden: (e, maske) => {
      const gewaehlt = kreditKandidaten(e).filter((_k, i) => (maske >> i) & 1);
      const ids = new Set(gewaehlt.map((k) => k.id));
      return {
        ...e,
        abzuloesendeRestschuld:
          e.abzuloesendeRestschuld + gewaehlt.reduce((s, k) => s + k.restschuld, 0),
        bestehendeRaten: e.kredite.filter((k) => !ids.has(k.id)).reduce((s, k) => s + k.rate, 0),
      };
    },
    formatWert: (e, maske) =>
      kreditKandidaten(e)
        .filter((_k, i) => (maske >> i) & 1)
        .map((k) => `${k.bezeichnung} (${eur(k.restschuld)}, ${eur(k.rate)}/Monat)`)
        .join(", "),
    preis: () => "Die Restschuld erhöht das Darlehen und damit den Beleihungsauslauf.",
  },
  {
    key: "kaufpreis",
    titel: "Kaufpreis nachverhandeln",
    sorte: "datengestuetzt",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.2), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, kaufpreis: Math.max(e.kaufpreis - w, 0) }),
    formatWert: (e, w) => `${eur(w)} weniger (${eur(e.kaufpreis)} → ${eur(e.kaufpreis - w)})`,
    preis: () => "Der Verkäufer muss mitgehen – ohne Zusage ist das kein belastbarer Weg.",
  },
  {
    key: "inventar",
    titel: "Inventar aus dem Kaufpreis herausrechnen",
    sorte: "datengestuetzt",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.15), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, inventarAnteil: e.inventarAnteil + w }),
    formatWert: (_e, w) => `${eur(w)} als Inventar ausweisen`,
    preis: () =>
      "Spart Grunderwerbsteuer, senkt aber den Beleihungswert – der Auslauf steigt, und das Inventar ist aus Eigenkapital zu zahlen.",
  },
  {
    key: "ratenkredit",
    titel: "Nebenkosten über einen Ratenkredit finanzieren",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.15), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, ratenkreditAnteil: e.ratenkreditAnteil + w }),
    formatWert: (_e, w) => `${eur(w)} über einen Ratenkredit`,
    preis: () => "Kurze Laufzeit und hoher Zins – die Rate belastet den Haushalt spürbar.",
  },
  {
    key: "einnahmen",
    titel: "Einnahmen erhöhen (gleicher Haushalt)",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: () => ({ ok: true, max: 3_000, schritt: 10 }),
    anwenden: (e, w) => ({ ...e, zusatzEinnahmen: e.zusatzEinnahmen + w }),
    formatWert: (_e, w) => `${eur(w)} mehr netto im Monat`,
    preis: () => "Muss dauerhaft und über Nachweise belegbar sein.",
  },
  {
    key: "weiterer_darlehensnehmer",
    titel: "Weiteren Darlehensnehmer aufnehmen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: () => ({ ok: true, max: 4_000, schritt: 10 }),
    anwenden: (e, w) => ({
      ...e,
      zusatzEinnahmen: e.zusatzEinnahmen + w,
      zusatzErwachsene: e.zusatzErwachsene + 1,
    }),
    formatWert: (_e, w) => `mit mindestens ${eur(w)} netto im Monat`,
    preis: () =>
      "Die zweite Person bringt ihre Lebenshaltungspauschale mit und haftet in voller Höhe mit.",
  },
  {
    key: "zusatzsicherheit",
    titel: "Weiteres Objekt als Zusatzsicherheit stellen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.max(e.kaufpreis, 100_000), schritt: 1_000 }),
    anwenden: (e, w) => ({
      ...e,
      zusatzsicherheitBeleihungsraum: e.zusatzsicherheitBeleihungsraum + w,
    }),
    formatWert: (_e, w) => `${eur(w)} freier Beleihungsraum`,
    preis: () =>
      "Freier Beleihungsraum = Verkehrswert × Beleihungssatz − bestehende Grundschulden. Das weitere Objekt wird mitbelastet.",
  },
];
