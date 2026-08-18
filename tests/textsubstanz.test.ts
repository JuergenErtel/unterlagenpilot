import { describe, it, expect } from "vitest";
import {
  MIN_TEXTSUBSTANZ,
  hatTextgrundlage,
  textSubstanz,
} from "@/lib/documents/textsubstanz";

/**
 * Die Werte stammen aus der Produktionsdatenbank (Fall Topcic, 18.08.2026) –
 * der Regressionsfall ist die Datei, die als "Grundbuchauszug" eingestuft war,
 * obwohl sie ein Ausweis-Scan ohne jeden erkannten Text ist.
 */
const AUSWEIS_MATE_OCR =
  "![img-0.jpeg](img-0.jpeg)\n\n![img-1.jpeg](img-1.jpeg)\n\n![img-2.jpeg](img-2.jpeg)";

const ECHTER_AUSWEIS_OCR = `REPUBLIKA HRVATSKA
REPUBLIC OF CROATIA
OSOBNA ISKAZNICA
IDENTITY CARD
TOPCIC
JADRANKA
DATUM RODENJA
DATE OF BIRTH
24 07 1968`;

describe("textSubstanz", () => {
  it("zaehlt Bildplatzhalter nicht als Text", () => {
    // Roh sind das 79 Zeichen – genau daran hat die Kette geglaubt, es liege
    // Text vor.
    expect(AUSWEIS_MATE_OCR.length).toBeGreaterThan(70);
    expect(textSubstanz(AUSWEIS_MATE_OCR)).toBeLessThan(5);
  });

  it("zaehlt Leerraum nicht mit", () => {
    expect(textSubstanz("  a\n\n b \t c  ")).toBe(3);
  });

  it("vertraegt null und Leerstring", () => {
    expect(textSubstanz(null)).toBe(0);
    expect(textSubstanz(undefined)).toBe(0);
    expect(textSubstanz("")).toBe(0);
  });
});

describe("hatTextgrundlage", () => {
  it("verneint den Scan, aus dem ein 'Grundbuchauszug' erfunden wurde", () => {
    expect(hatTextgrundlage(AUSWEIS_MATE_OCR)).toBe(false);
  });

  it("bejaht einen echten Personalausweis – das textaermste echte Dokument", () => {
    expect(hatTextgrundlage(ECHTER_AUSWEIS_OCR)).toBe(true);
  });

  it("liegt mit Abstand unter dem echten Ausweis (222 Zeichen gemessen)", () => {
    // Die Schwelle darf nie so hoch wandern, dass ein echter Ausweis
    // durchfaellt – sonst verschwinden korrekt erkannte Dokumente aus der
    // Checkliste, und das Heilmittel waere schlimmer als die Krankheit.
    expect(MIN_TEXTSUBSTANZ).toBeLessThan(200);
    expect(MIN_TEXTSUBSTANZ).toBeGreaterThan(10);
  });

  it("entscheidet genau an der Schwelle", () => {
    expect(hatTextgrundlage("x".repeat(MIN_TEXTSUBSTANZ - 1))).toBe(false);
    expect(hatTextgrundlage("x".repeat(MIN_TEXTSUBSTANZ))).toBe(true);
  });
});
