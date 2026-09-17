import { describe, it, expect } from "vitest";
import {
  aktiverFallBereich,
  aktiverBereich,
  fallBereiche,
  backofficeBereiche,
  UNTERSEITE_BEREICH,
} from "@/components/case/case-nav";

/**
 * Die Bereichsleiste ueber den Fall-Unterseiten.
 *
 * Seit 17.09.2026 traegt sie genau DREI Eintraege und ist zugleich die
 * Umschaltung der Fallakte. Vorher standen hier acht - und in der Fallakte
 * darunter noch einmal dieselben Ziele als Werkzeuge.
 */
describe("Fall-Bereichsleiste im Vertrieb", () => {
  it("hat genau drei Eintraege", () => {
    expect(fallBereiche("abc").map((b) => b.label)).toEqual([
      "Dokumente",
      "Beratung",
      "Einreichung",
    ]);
  });

  it("schaltet die Fallakte ueber die Adresse um, nicht ueber Unterseiten", () => {
    // Verlinkbar und mit funktionierendem Zurueck-Knopf - beides ginge
    // verloren, wenn der Bereich nur im Browserzustand staende.
    expect(fallBereiche("abc")[0]!.href).toBe("/cases/abc?tab=dokumente");
  });

  it("nimmt den Bereich auf der Fallakte aus ?tab=", () => {
    expect(aktiverFallBereich("/cases/abc", "abc", "beratung")).toBe("beratung");
    expect(aktiverFallBereich("/cases/abc", "abc", "einreichung")).toBe("einreichung");
  });

  it("faellt ohne ?tab= auf Dokumente zurueck", () => {
    expect(aktiverFallBereich("/cases/abc", "abc", null)).toBe("dokumente");
    expect(aktiverFallBereich("/cases/abc", "abc", "quatsch")).toBe("dokumente");
  });

  it("ordnet jede Unterseite einem der drei Bereiche zu", () => {
    // Ohne Zuordnung stuende der Berater vor einer Leiste, die nichts
    // markiert - er waere "irgendwo im Fall", ohne zu wissen wo.
    expect(aktiverFallBereich("/cases/abc/unterlagen", "abc")).toBe("dokumente");
    expect(aktiverFallBereich("/cases/abc/haushalt", "abc")).toBe("beratung");
    expect(aktiverFallBereich("/cases/abc/erstgespraech", "abc")).toBe("beratung");
    expect(aktiverFallBereich("/cases/abc/verwaltung", "abc")).toBe("einreichung");
    expect(aktiverFallBereich("/cases/abc/summary", "abc")).toBe("einreichung");
  });

  it("markiert auch eine tiefere Unterseite noch richtig", () => {
    expect(aktiverFallBereich("/cases/abc/unterlagen/xyz", "abc")).toBe("dokumente");
  });

  it("laesst eine unbekannte Unterseite nicht ins Leere zeigen", () => {
    expect(aktiverFallBereich("/cases/abc/neuerkram", "abc")).toBe("dokumente");
  });

  it("kennt zu jedem Bereichswert der Zuordnung einen Eintrag der Leiste", () => {
    const werte = new Set(Object.values(UNTERSEITE_BEREICH));
    const labels = fallBereiche("abc").map((b) => b.href.split("tab=")[1]);
    for (const w of werte) expect(labels).toContain(w);
  });
});

describe("Backoffice-Leiste", () => {
  it("bleibt nach Unterseiten gegliedert", () => {
    // Ein Backoffice-Auftrag hat keine Leadphase und keine Beratung - die
    // Vertriebseinteilung passt dort nicht.
    const b = backofficeBereiche("abc", "auf-1");
    expect(aktiverBereich("/cases/abc/haushalt", "abc", b)).toBe("/cases/abc/haushalt");
    expect(aktiverBereich("/cases/abc/wohnflaeche", "abc", b)).toBeNull();
  });
});
