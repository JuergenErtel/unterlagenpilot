import { describe, it, expect } from "vitest";
import { aktiverBereich, fallBereiche } from "@/components/case/case-nav";

/**
 * Die Bereichsleiste ueber den Fall-Unterseiten. Der Unterlagen-Arbeitsplatz
 * war drei Klicks tief versteckt (Fallakte -> Dokumente -> Oeffnen); seit
 * 01.09.2026 ist er ein Reiter wie die anderen Bereiche.
 */
describe("Fall-Bereichsleiste", () => {
  it("fuehrt direkt zum Unterlagen-Arbeitsplatz", () => {
    expect(fallBereiche("abc").map((b) => b.href)).toContain("/cases/abc/unterlagen");
  });

  it("markiert die Fallakte nur bei exaktem Pfad", () => {
    expect(aktiverBereich("/cases/abc", "abc")).toBe("/cases/abc");
    expect(aktiverBereich("/cases/abc/unterlagen", "abc")).toBe("/cases/abc/unterlagen");
  });

  it("markiert auf Unterseiten ohne Reiter nichts", () => {
    expect(aktiverBereich("/cases/abc/wohnflaeche", "abc")).toBeNull();
  });
});
