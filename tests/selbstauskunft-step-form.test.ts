import { describe, it, expect } from "vitest";
// Aus `spalten.ts`, nicht mehr aus `step-form.tsx`: Jene Datei traegt
// "use client". Dass ein Test sie trotzdem importieren konnte, war der Grund,
// warum niemandem auffiel, dass die Schrittseite `spaltenPersonen()` beim
// echten Request gar nicht aufrufen kann (Client-Referenz im Server-Graph).
import {
  spaltenPersonen,
  personenSchluessel,
  zeigeSpaltenUeberschrift,
} from "@/lib/self-disclosure/spalten";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import { KATALOG } from "@/lib/self-disclosure/catalog";

/**
 * Bewacht genau die Falle dieser Aufgabe, aber auf der Darstellungsseite:
 * `spaltenPersonen` entscheidet, welche Person(en) SchrittFelder bekommt –
 * und muss DIESELBE Personen-Liste ergeben wie `schrittSchema` intern
 * verwendet (`personen ?? [undefined]`). Weichen sie voneinander ab, baut das
 * Formular Feldnamen mit einem anderen Präfix als das Schema erwartet, und
 * `.strip()` wirft die Antwort lautlos weg.
 */
describe("spaltenPersonen", () => {
  it("liefert einen Aufruf ohne Person, wenn der Schritt keine Spalten hat", () => {
    expect(spaltenPersonen(undefined)).toEqual([undefined]);
  });

  it("liefert einen Aufruf MIT Person 1, wenn personenSpalten nur einen Antragsteller zeigt", () => {
    // Der Fehler, den diese Aufgabe beheben soll: Ohne diese Zeile raet man
    // leicht, eine einzelne Spalte brauche keine Person – dabei braucht sie
    // die Person 1, weil `defaults` und `schrittSchema` sie mit Praefix "p1."
    // erwarten.
    expect(spaltenPersonen([1])).toEqual([1]);
  });

  it("liefert zwei Aufrufe bei zwei Spalten", () => {
    expect(spaltenPersonen([1, 2])).toEqual([1, 2]);
  });

  it("liefert Formularschluessel, die schrittSchema unveraendert durchlaesst", () => {
    // Der eigentliche End-zu-End-Beweis: Fuer jede Personen-Konstellation
    // baut `spaltenPersonen` + `personenSchluessel` genau die Formularnamen,
    // die `schrittSchema` fuer DIESELBE Konstellation erwartet – keine
    // Antwort verschwindet hinter .strip().
    const schritt = KATALOG.find((s) => s.personenSpalten)!;
    const feld = schritt.felder.find((f) => f.typ === "text")!.id;
    const faelle: Array<(1 | 2)[] | undefined> = [undefined, [1], [1, 2]];
    for (const personen of faelle) {
      const spalten = spaltenPersonen(personen);
      const daten: Record<string, string> = {};
      for (const person of spalten) {
        daten[personenSchluessel(schritt.id, feld, person)] = "wert";
      }
      const geprueft = schrittSchema(schritt, personen).parse(daten);
      expect(Object.keys(geprueft)).toHaveLength(spalten.length);
    }
  });
});

/**
 * Der Fund: `SichtbarerSchritt.personen` ist eine ECHTE Teilmenge. Bei
 * "Person 1 Rentnerin, Person 2 angestellt" traegt die Berufsseite
 * `personen === [2]` – EINE Spalte, die die Fragen des Partners zeigt. Ohne
 * Ueberschrift traegt die Rentnerin dort ihre eigenen Angaben ein, und sie
 * landen unter "p2." beim zweiten Antragsteller.
 */
describe("zeigeSpaltenUeberschrift", () => {
  it("zeigt eine Ueberschrift ueber jeder von zwei Spalten", () => {
    expect(zeigeSpaltenUeberschrift(2, 1, true)).toBe(true);
    expect(zeigeSpaltenUeberschrift(2, 2, true)).toBe(true);
  });

  it("zeigt sie auch ueber einer EINZELNEN Spalte, wenn der Haushalt zu zweit ist", () => {
    expect(zeigeSpaltenUeberschrift(1, 2, true)).toBe(true);
    expect(zeigeSpaltenUeberschrift(1, 1, true)).toBe(true);
  });

  it("laesst sie beim einzigen Antragsteller weg", () => {
    // "Sie" ueber der einzigen Spalte des einzigen Antragstellers erklaert
    // nichts und macht die Seite nur voller.
    expect(zeigeSpaltenUeberschrift(1, 1, false)).toBe(false);
  });

  it("laesst sie bei einer Seite ohne Personenbezug weg", () => {
    expect(zeigeSpaltenUeberschrift(1, undefined, true)).toBe(false);
  });
});
