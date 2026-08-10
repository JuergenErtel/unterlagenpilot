import { bewerte, type Auslaufband, type Urteil } from "./bewertung";
import { HEBEL, type HebelDefinition } from "./hebel";
import { kleinsterWert, type Ziel } from "./suche";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

export interface HebelErgebnis {
  key: string;
  titel: string;
  sorte: HebelDefinition["sorte"];
  anwendbar: boolean;
  /** Warum nicht anwendbar – oder warum es auch am Maximum nicht reicht. */
  grund?: string;
  wertText?: string;
  preis?: string;
  vorher: Urteil;
  nachher?: Urteil;
  reichtAllein: boolean;
  /**
   * Dasselbe Ergebnis bei guenstigerem und unguenstigerem Zinsaufschlag.
   * Fehlt, wenn der Aufschlag das Ergebnis nicht bewegt – dann waere die
   * Angabe nur Rauschen.
   */
  spanne?: { guenstig: string; unguenstig: string };
}

export interface PaarErgebnis {
  aKey: string;
  aTitel: string;
  aText: string;
  bKey: string;
  bTitel: string;
  bText: string;
  nachher: Urteil;
}

export interface SolverErgebnis {
  modus: "rettung" | "optimierung";
  ausgangslage: Urteil;
  diagnose: string;
  hebel: HebelErgebnis[];
  paare: PaarErgebnis[];
  annahmen: Annahmen;
  nebenkosten: NebenkostenAufstellung;
  bundeslandUnsicher: boolean;
}

/** Naechstbesseres Band – das Ziel im Optimierungsmodus. */
function naechstesBand(band: Auslaufband): number | null {
  switch (band) {
    case "darueber":
      return 110;
    case "bis110":
      return 100;
    case "bis100":
      return 90;
    case "bis90":
      return 80;
    case "bis80":
      return 60;
    default:
      return null;
  }
}

function diagnoseText(u: Urteil, a: Annahmen): string {
  const auslaufReisst = u.auslauf > a.auslaufObergrenze;
  const haushaltReisst = u.ueberschuss < a.ueberschussPuffer;

  if (auslaufReisst && haushaltReisst)
    return "Der Fall scheitert an beidem: Der Beleihungsauslauf liegt über der Grenze, und der Haushalt trägt die Rate nicht.";
  if (haushaltReisst) return "Der Fall scheitert am Haushalt, nicht am Eigenkapital.";
  if (auslaufReisst)
    return "Der Fall scheitert am Beleihungsauslauf – für diesen Anteil findet sich kein Finanzierer.";
  return "Der Fall trägt.";
}

/**
 * Dasselbe Ergebnis bei guenstigerem und unguenstigerem Zinsaufschlag.
 *
 * Es gibt keinen "richtigen" Aufschlag – er haengt von Bank, Produkt und
 * Tagesmarkt ab. Statt Praezision vorzutaeuschen, beziffert der Solver seine
 * eigene Unsicherheit. Wo der Aufschlag nichts bewegt (etwa bei einem Fall, der
 * rein am Beleihungsauslauf scheitert), bleibt die Angabe weg.
 */
function spanneFuer(
  h: HebelDefinition,
  e: SolverEingabe,
  a: Annahmen,
  ziel: Ziel,
  mitte: number
): HebelErgebnis["spanne"] {
  const d = a.aufschlagUnschaerfe;
  if (d <= 0) return undefined;

  const variante = (vz: number): Annahmen => ({
    ...a,
    aufschlagBis80: Math.max(a.aufschlagBis80 + vz * d, 0),
    aufschlagBis90: Math.max(a.aufschlagBis90 + vz * d, 0),
    aufschlagBis100: Math.max(a.aufschlagBis100 + vz * d, 0),
    aufschlagBis110: Math.max(a.aufschlagBis110 + vz * d, 0),
  });

  const g = kleinsterWert(h, e, variante(-1), ziel);
  const u = kleinsterWert(h, e, variante(+1), ziel);
  if (!g || !u) return undefined;
  if (g.wert === mitte && u.wert === mitte) return undefined;

  return { guenstig: h.formatWert(e, g.wert), unguenstig: h.formatWert(e, u.wert) };
}

export function loese(
  e: SolverEingabe,
  a: Annahmen,
  bundeslandUnsicher: boolean
): SolverErgebnis {
  const ausgangslage = bewerte(e, a);
  const modus: SolverErgebnis["modus"] = ausgangslage.machbar ? "optimierung" : "rettung";

  // Im Rettungsmodus ist das Ziel Machbarkeit, im Optimierungsmodus das
  // naechstbessere Auslaufband – sonst waere das Werkzeug bei gesunden Faellen
  // leer, und gerade dort wird Geld verdient.
  const grenze = naechstesBand(ausgangslage.band);
  const ziel: Ziel =
    modus === "rettung"
      ? (u) => u.machbar
      : (u) => u.machbar && grenze != null && u.auslauf <= grenze;

  const hebel: HebelErgebnis[] = HEBEL.map((h) => {
    const anw = h.anwendbar(e, a);
    if (!anw.ok) {
      return {
        key: h.key,
        titel: h.titel,
        sorte: h.sorte,
        anwendbar: false,
        grund: anw.grund,
        vorher: ausgangslage,
        reichtAllein: false,
      };
    }
    const treffer = kleinsterWert(h, e, a, ziel);
    if (!treffer) {
      return {
        key: h.key,
        titel: h.titel,
        sorte: h.sorte,
        anwendbar: true,
        grund: `Auch ${h.formatWert(e, anw.max)} löst es nicht.`,
        vorher: ausgangslage,
        reichtAllein: false,
      };
    }
    return {
      key: h.key,
      titel: h.titel,
      sorte: h.sorte,
      anwendbar: true,
      wertText: h.formatWert(e, treffer.wert),
      preis: h.preis(e, treffer.wert),
      vorher: ausgangslage,
      nachher: treffer.urteil,
      reichtAllein: true,
      spanne: spanneFuer(h, e, a, ziel, treffer.wert),
    };
  });

  // Reihenfolge: datengestuetzte Treffer, hypothetische Treffer, dann der Rest.
  // Keine erfundene Rangfolge ueber verschiedene Einheiten hinweg.
  const rang = (h: HebelErgebnis) =>
    h.reichtAllein ? (h.sorte === "datengestuetzt" ? 0 : 1) : h.anwendbar ? 2 : 3;
  hebel.sort((x, y) => rang(x) - rang(y));

  const paare = hebel.some((h) => h.reichtAllein) ? [] : suchePaare(e, a, ziel);

  return {
    modus,
    ausgangslage,
    diagnose:
      modus === "optimierung" && grenze != null
        ? `Der Fall trägt. Mit einem Auslauf unter ${grenze} % kommen Sie in die bessere Kondition.`
        : diagnoseText(ausgangslage, a),
    hebel,
    paare,
    annahmen: a,
    nebenkosten: ausgangslage.nebenkosten,
    bundeslandUnsicher,
  };
}

/**
 * Paare, wenn kein einzelner Hebel reicht. Grobes 10x10-Raster je Paar – wer
 * drei Stellschrauben gleichzeitig braucht, hat kein Finanzierungs-, sondern
 * ein Objektproblem.
 */
function suchePaare(e: SolverEingabe, a: Annahmen, ziel: Ziel): PaarErgebnis[] {
  const nutzbar = HEBEL.filter((h) => h.anwendbar(e, a).ok);
  const treffer: PaarErgebnis[] = [];

  for (let i = 0; i < nutzbar.length; i++) {
    for (let j = i + 1; j < nutzbar.length; j++) {
      const h1 = nutzbar[i];
      const h2 = nutzbar[j];
      if (!h1 || !h2) continue;
      const a1 = h1.anwendbar(e, a);
      const a2 = h2.anwendbar(e, a);
      if (!a1.ok || !a2.ok) continue;

      let gefunden: PaarErgebnis | null = null;
      for (let x = 1; x <= 10 && !gefunden; x++) {
        for (let y = 1; y <= 10 && !gefunden; y++) {
          const w1 = (a1.max / 10) * x;
          const w2 = (a2.max / 10) * y;
          const u = bewerte(h2.anwenden(h1.anwenden(e, w1), w2), a);
          if (ziel(u)) {
            gefunden = {
              aKey: h1.key,
              aTitel: h1.titel,
              aText: h1.formatWert(e, w1),
              bKey: h2.key,
              bTitel: h2.titel,
              bText: h2.formatWert(e, w2),
              nachher: u,
            };
          }
        }
      }
      if (gefunden) treffer.push(gefunden);
      if (treffer.length >= 3) return treffer; // drei Vorschlaege reichen
    }
  }
  return treffer;
}
