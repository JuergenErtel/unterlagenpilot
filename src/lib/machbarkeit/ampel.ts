import type { CanonicalCase } from "@/lib/domain/canonical";
import type { Bundesland } from "./bundesland";
import { baueEingabe } from "./eingabe";
import { bewerte } from "./bewertung";
import { kleinsterWert } from "./suche";
import { HEBEL } from "./hebel";
import type { Annahmen, SolverEingabe } from "./types";

export type AmpelFarbe = "gruen" | "gelb" | "rot" | "grau";

export interface Ampel {
  farbe: AmpelFarbe;
  /** Eine Zeile – mehr Platz hat eine Kanban-Karte nicht. */
  text: string;
  /** Ausfuehrlicher, fuer das title-Attribut. */
  grund: string;
}

export interface AmpelOptionen {
  applicantCount: number;
  anzahlKinder: number;
  verloren: boolean;
  abgeschlossen: boolean;
  grunderwerbsteuerProzentOverride?: number | null;
  bundeslandOverride?: Bundesland | null;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;

/**
 * Bis hierhin gilt ein Lead als unkompliziert platzierbar.
 *
 * Nicht die Machbarkeitsgrenze (die liegt bei 110 %), sondern die Grenze fuer
 * die Farbe: Darueber werden die Nebenkosten mitfinanziert, das ist spuerbar
 * teurer und die Anbieterauswahl schrumpft.
 *
 * Belegt an 200 echten Leads: ohne diese Grenze waeren 83 % der Karten gruen
 * und die Ampel sortierte nichts mehr.
 */
const GRUEN_BIS_AUSLAUF = 100;

/**
 * "Wie viel Darlehen traegt der Fall?" – das Gegenstueck zu "Objekt bis X"
 * fuer die Arten ohne Kaufpreis. Der Kunde besitzt die Immobilie bereits; ihm
 * ein kleineres Objekt zu empfehlen, waere kein Rat.
 */
function darlehensHebel(
  e: SolverEingabe,
  a: Annahmen,
  ziel: (u: { machbar: boolean }) => boolean
): Ampel | null {
  const h = HEBEL.find((x) => x.key === "darlehenssumme");
  const gefunden = h ? kleinsterWert(h, e, a, ziel) : null;
  if (!gefunden) return null;

  const tragbar = Math.max(e.weitererDarlehensbedarf - gefunden.wert, 0);
  return {
    farbe: "gelb",
    text: `Darlehen bis ${eur(tragbar)}`,
    grund: `Statt ${eur(e.weitererDarlehensbedarf)} trägt der Fall ein Darlehen bis ${eur(
      tragbar
    )} – bei ${pct(gefunden.urteil.auslauf)} Beleihungsauslauf und ${eur(
      gefunden.urteil.ueberschuss
    )} Haushaltsüberschuss.`,
  };
}

/**
 * Verkuerzte Sicht auf den Machbarkeits-Solver fuer eine Kanban-Karte.
 *
 * Rechnet bewusst NICHT alle Hebel durch, sondern nur die zwei Fragen, die im
 * Erstgespraech zaehlen: Wie viel Eigenkapital fehlt? Welcher Kaufpreis waere
 * tragbar?
 *
 * Rueckgabe `null` heisst "keine Ampel anzeigen" (verloren oder abgeschlossen).
 * Das ist streng zu unterscheiden von grau: `null` = wir zeigen bewusst nichts,
 * grau = wir wissen es nicht.
 */
export function ampelFuer(c: CanonicalCase, opts: AmpelOptionen, a: Annahmen): Ampel | null {
  if (opts.verloren || opts.abgeschlossen) return null;

  const eingabe = baueEingabe(c, {
    applicantCount: Math.max(opts.applicantCount, 1),
    anzahlKinder: opts.anzahlKinder,
    grunderwerbsteuerProzentOverride: opts.grunderwerbsteuerProzentOverride ?? null,
    bundeslandOverride: opts.bundeslandOverride ?? null,
  });

  // Grau ist KEIN Urteil, sondern eine Datenluecke. Eine Luecke als Absage zu
  // lesen waere der Fehler, der das Werkzeug unbrauchbar macht.
  if (!eingabe.ok) {
    return {
      farbe: "grau",
      text: "Daten unvollständig",
      grund: `Für eine Machbarkeitsaussage fehlt: ${eingabe.fehlend.join(", ")}.`,
    };
  }

  const e = eingabe.eingabe;
  const start = bewerte(e, a);
  if (start.machbar) {
    const grund = `Beleihungsauslauf ${pct(start.auslauf)}, Haushaltsüberschuss ${eur(
      start.ueberschuss
    )} bei ${eur(start.rate + start.ratenkreditRate)} Rate.`;

    if (start.auslauf <= GRUEN_BIS_AUSLAUF) {
      return { farbe: "gruen", text: `trägt · ${pct(start.auslauf)} Auslauf`, grund };
    }
    // Traegt, aber die Nebenkosten laufen mit ins Darlehen: machbar, nur nicht
    // ohne Weiteres – deshalb gelb statt gruen.
    return {
      farbe: "gelb",
      text: `trägt · Nebenkosten mitfinanziert (${pct(start.auslauf)})`,
      grund: `${grund} Über 100 % Auslauf werden die Nebenkosten mitfinanziert – deutlich teurer und nur bei starker Bonität.`,
    };
  }

  const ziel = (u: { machbar: boolean }) => u.machbar;

  // Bei einer Kapitalbeschaffung steht die Darlehenssumme VOR dem
  // Eigenkapital: Wer Kapital beschaffen will, hat keines uebrig – "braucht
  // 70.000 € mehr EK" waere die einzige Antwort, die ihm sicher nichts nuetzt.
  // Er will wissen, wie viel er bekommt.
  if (e.darlehensbedarfVerhandelbar) {
    const vorab = darlehensHebel(e, a, ziel);
    if (vorab) return vorab;
  }

  const ekHebel = HEBEL.find((h) => h.key === "eigenkapital");
  const ek = ekHebel ? kleinsterWert(ekHebel, e, a, ziel) : null;
  if (ek) {
    return {
      farbe: "gelb",
      text: `braucht ${eur(ek.wert)} mehr EK`,
      grund: `Mit ${eur(ek.wert)} zusätzlichem Eigenkapital sinkt der Beleihungsauslauf auf ${pct(
        ek.urteil.auslauf
      )} und der Haushalt trägt (${eur(ek.urteil.ueberschuss)} Überschuss). Aktuell: ${pct(
        start.auslauf
      )} Auslauf, ${eur(start.ueberschuss)} Überschuss.`,
    };
  }

  const kpHebel = HEBEL.find((h) => h.key === "kaufpreis");
  const kp = kpHebel ? kleinsterWert(kpHebel, e, a, ziel) : null;
  if (kp) {
    const tragbar = Math.max(e.kaufpreis - kp.wert, 0);
    return {
      farbe: "gelb",
      text: `Objekt bis ${eur(tragbar)}`,
      grund: `Mehr Eigenkapital allein löst es nicht. Bei einem Kaufpreis bis ${eur(
        tragbar
      )} statt ${eur(e.kaufpreis)} trägt der Fall.`,
    };
  }

  const dl = darlehensHebel(e, a, ziel);
  if (dl) return dl;

  return {
    farbe: "rot",
    text: "trägt auch dann nicht",
    grund: `Weder zusätzliches Eigenkapital noch ein kleineres Objekt lösen es: Der Haushalt trägt die Rate auch ohne Darlehensanteil nicht. Aktuell ${eur(
      start.ueberschuss
    )} Überschuss.`,
  };
}
