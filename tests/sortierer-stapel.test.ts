import { describe, it, expect } from "vitest";
import { stapelName, verbleibendeTage, STAPEL_LEBENSDAUER_TAGE } from "@/lib/sortierer/service";

/**
 * Der Stapelname kommt aus dem INHALT, nicht aus einem Eingabefeld - er ist
 * das Einzige, woran der Nutzer drei Stapel nebeneinander unterscheidet.
 */
describe("stapelName", () => {
  it("nennt den erkannten Typ", () => {
    expect(stapelName(["kaufvertragsentwurf"], 4)).toBe("Kaufvertragsentwurf");
  });

  it("zaehlt weitere Typen dazu - sprachlich richtig", () => {
    // "1 weiteres" (Dokument), ab zwei "weitere". Faellt sonst genau beim
    // zweiten Versuch auf, also dem, der ueber Vertrauen entscheidet.
    expect(stapelName(["kaufvertragsentwurf", "gehaltsabrechnung"], 5)).toMatch(/\+ 1 weiteres$/);
    expect(stapelName(["kaufvertragsentwurf", "gehaltsabrechnung", "expose"], 6)).toMatch(
      /\+ 2 weitere$/
    );
  });

  it("zaehlt jeden Typ nur einmal", () => {
    expect(stapelName(["gehaltsabrechnung", "gehaltsabrechnung"], 2)).toBe("Gehaltsabrechnung");
  });

  it("faellt auf die Dateizahl zurueck, solange nichts erkannt ist", () => {
    expect(stapelName([null, null], 2)).toBe("2 Dateien");
    expect(stapelName([null], 1)).toBe("1 Datei");
    expect(stapelName([], 0)).toBe("Leerer Stapel");
  });
});

describe("verbleibendeTage", () => {
  const jetzt = new Date("2026-09-17T12:00:00Z");

  it("zeigt am Anlagetag die volle Frist", () => {
    expect(verbleibendeTage(jetzt, jetzt)).toBe(STAPEL_LEBENSDAUER_TAGE);
  });

  it("zaehlt herunter", () => {
    const vorFuenfTagen = new Date(jetzt.getTime() - 5 * 86_400_000);
    expect(verbleibendeTage(vorFuenfTagen, jetzt)).toBe(STAPEL_LEBENSDAUER_TAGE - 5);
  });

  it("wird nie negativ", () => {
    // Ein ueberfaelliger Stapel (Cron lief noch nicht) darf nicht "-3 Tage"
    // anzeigen - das liest sich wie ein Fehler, nicht wie eine Frist.
    const langeHer = new Date(jetzt.getTime() - 40 * 86_400_000);
    expect(verbleibendeTage(langeHer, jetzt)).toBe(0);
  });
});
