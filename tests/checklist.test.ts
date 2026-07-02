import { describe, it, expect } from "vitest";
import {
  selectTemplateKeys,
  buildChecklistForCase,
} from "@/lib/checklists/engine";
import { computeReadiness } from "@/lib/documents/readiness";

describe("Checklisten-Logik", () => {
  it("wählt passende Templates für Angestellten + EFH", () => {
    const keys = selectTemplateKeys({
      employmentType: "angestellter",
      financingType: "kauf",
      propertyType: "einfamilienhaus",
      applicantCount: 2,
    });
    expect(keys).toContain("angestellter_kauf");
    expect(keys).toContain("einfamilienhaus");
    expect(keys).toContain("mehrere_antragsteller");
  });

  it("wählt Selbstständigen-Template", () => {
    const keys = selectTemplateKeys({ employmentType: "selbststaendiger", financingType: "kauf" });
    expect(keys).toContain("selbststaendiger_kauf");
  });

  it("markiert fehlende Pflichtunterlage als offen", () => {
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf", propertyType: "einfamilienhaus" },
      [] // keine Dokumente
    );
    const grundbuch = list.find((i) => i.key === "grundbuchauszug");
    expect(grundbuch?.status).toBe("offen");
  });

  it("erkennt unvollständige Anzahl (Ausweis 1 von 2)", () => {
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf" },
      [{ documentType: "personalausweis", reviewStatus: "akzeptiert", readable: true }]
    );
    const ausweis = list.find((i) => i.key === "personalausweis");
    expect(ausweis?.status).toBe("unvollstaendig");
  });

  it("ein unlesbarer Alt-Upload blockiert nicht eine mit lesbaren Dokumenten erfüllte Position", () => {
    // Gehaltsabrechnungen: requiredCount 3. 3 lesbare + 1 unlesbarer -> vorhanden.
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf" },
      [
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true },
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true },
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true },
        { documentType: "gehaltsabrechnung", reviewStatus: "offen", readable: false },
      ]
    );
    const gehalt = list.find((i) => i.key === "gehaltsabrechnung");
    expect(gehalt?.status).toBe("vorhanden");
  });

  it("zu wenige lesbare Dokumente bleiben unvollständig (2 lesbar + 1 unlesbar bei requiredCount 3)", () => {
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf" },
      [
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true },
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true },
        { documentType: "gehaltsabrechnung", reviewStatus: "offen", readable: false },
      ]
    );
    const gehalt = list.find((i) => i.key === "gehaltsabrechnung");
    expect(gehalt?.status).toBe("unvollstaendig");
  });

  it("Readiness-Score bleibt gedeckelt bei offenen Pflichtunterlagen", () => {
    const list = buildChecklistForCase({ employmentType: "angestellter", financingType: "kauf" }, []);
    const r = computeReadiness({ checklist: list });
    expect(r.score).toBeLessThanOrEqual(90);
    expect(r.mandatoryOpen).toBeGreaterThan(0);
  });
});
