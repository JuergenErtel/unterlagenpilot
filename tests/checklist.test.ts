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

  it("ein Personalausweis-Dokument pro Person erfüllt die Position", () => {
    // 05.08., Fall Colell: Der Perso kommt praktisch immer als EIN PDF mit
    // Vorder- UND Rückseite. requiredCount 2 verlangte zwei Dateien pro Person
    // und meldete "unvollständig", obwohl der Ausweis vollständig vorlag. Ob
    // beide Seiten enthalten sind, prüft der Vermittler im Review – nicht die
    // Dateizählung.
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf" },
      [{ documentType: "personalausweis", reviewStatus: "akzeptiert", readable: true }]
    );
    const ausweis = list.find((i) => i.key === "personalausweis");
    expect(ausweis?.status).toBe("vorhanden");
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

describe("Checkliste bei mehreren Antragstellern", () => {
  const zweiAntragsteller = {
    employmentType: "angestellter" as const,
    financingType: "kauf" as const,
    applicantCount: 2,
    applicantIds: ["app-1", "app-2"],
  };

  it("gilt NICHT als erfüllt, wenn nur Antragsteller 1 seine Unterlagen geliefert hat", () => {
    // Regression: das Template "mehrere_antragsteller" war ein No-op (Dedupe nach key),
    // und das Dokument-Matching ignorierte den Antragsteller – 3 Gehaltsabrechnungen
    // von Person 1 färbten die Position grün, obwohl von Person 2 nichts vorlag.
    const list = buildChecklistForCase(zweiAntragsteller, [
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, applicantId: "app-1" },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, applicantId: "app-1" },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, applicantId: "app-1" },
    ]);
    const gehalt = list.find((i) => i.key === "gehaltsabrechnung");
    expect(gehalt?.status).toBe("unvollstaendig");
    expect(gehalt?.effectiveRequiredCount).toBe(6); // 3 je Person
  });

  it("ist erfüllt, wenn beide Antragsteller ihr Soll liefern", () => {
    const docs = ["app-1", "app-2"].flatMap((applicantId) =>
      [1, 2, 3].map(() => ({
        documentType: "gehaltsabrechnung" as const,
        reviewStatus: "akzeptiert",
        readable: true,
        applicantId,
      }))
    );
    const list = buildChecklistForCase(zweiAntragsteller, docs);
    expect(list.find((i) => i.key === "gehaltsabrechnung")?.status).toBe("vorhanden");
  });

  it("rechnet nicht zugeordnete Dokumente keinem Antragsteller an", () => {
    const list = buildChecklistForCase(zweiAntragsteller, [
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: null },
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: null },
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: null },
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: null },
    ]);
    const ausweis = list.find((i) => i.key === "personalausweis");
    expect(ausweis?.status).toBe("unvollstaendig");
  });

  it("je ein zugeordneter Personalausweis pro Antragsteller erfüllt die Position", () => {
    // Colell-Konstellation: beide Ausweise vorhanden und korrekt zugeordnet.
    const list = buildChecklistForCase(zweiAntragsteller, [
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: "app-1" },
      { documentType: "personalausweis", reviewStatus: "offen", readable: true, applicantId: "app-2" },
    ]);
    const ausweis = list.find((i) => i.key === "personalausweis");
    expect(ausweis?.status).toBe("vorhanden");
    expect(ausweis?.effectiveRequiredCount).toBe(2); // 1 je Person
  });

  it("verlangt bei einem Antragsteller unverändert nur das einfache Soll", () => {
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf", applicantCount: 1, applicantIds: ["app-1"] },
      [1, 2, 3].map(() => ({
        documentType: "gehaltsabrechnung" as const,
        reviewStatus: "akzeptiert",
        readable: true,
        applicantId: "app-1",
      }))
    );
    const gehalt = list.find((i) => i.key === "gehaltsabrechnung");
    expect(gehalt?.status).toBe("vorhanden");
    expect(gehalt?.effectiveRequiredCount).toBe(3);
  });
});

describe("Aktualitätsprüfung mit unbekanntem Dokumentalter", () => {
  it("lässt ein undatiertes Dokument veraltete Unterlagen nicht kaschieren", () => {
    // Regression: `m.ageDays ?? 0` wertete "Alter unbekannt" als "0 Tage alt";
    // ein einziges undatiertes Dokument verhinderte den Status "nicht_aktuell".
    const list = buildChecklistForCase({ employmentType: "angestellter", financingType: "kauf" }, [
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: 240 },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: 270 },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: null },
    ]);
    expect(list.find((i) => i.key === "gehaltsabrechnung")?.status).toBe("nicht_aktuell");
  });

  it("bleibt 'vorhanden', wenn mindestens ein datiertes Dokument aktuell ist", () => {
    const list = buildChecklistForCase({ employmentType: "angestellter", financingType: "kauf" }, [
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: 240 },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: 30 },
      { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", readable: true, ageDays: null },
    ]);
    expect(list.find((i) => i.key === "gehaltsabrechnung")?.status).toBe("vorhanden");
  });
});

describe("Ersetzte Dokumente", () => {
  it("ein ersetztes Dokument erfüllt keine Checklistenposition mehr", () => {
    // Nach dem Auftrennen eines Sammel-PDFs steht das Original auf "ersetzt".
    // Zaehlte es weiter mit, saehe die Checkliste Original UND Teile.
    const list = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf" },
      [{ documentType: "personalausweis", reviewStatus: "ersetzt", readable: true }]
    );
    expect(list.find((i) => i.key === "personalausweis")?.status).toBe("offen");
  });
});

describe("Gemischtes Paar: selbstständig + angestellt", () => {
  /**
   * Juergen im Praxistest (12.08.2026): "es fehlen die Anforderungen für
   * Selbständige. Es werden Gehaltsabrechnungen gefordert, die er gar nicht
   * hat." Fall UP-2026-0007: Er selbststaendig (Arzt), sie angestellt in
   * seiner Praxis. Bis dahin kannte der Fall genau EINE Beschaeftigungsart –
   * eine der beiden Listen musste falsch sein.
   */
  const paar = {
    financingType: "kauf" as const,
    propertyType: "einfamilienhaus" as const,
    applicantCount: 2,
    applicantIds: ["a1", "a2"],
    applicants: [
      { id: "a1", employmentType: "selbststaendiger" as const },
      { id: "a2", employmentType: "angestellter" as const },
    ],
  };

  it("waehlt die Vorlagen BEIDER Beschaeftigungsarten", () => {
    const keys = selectTemplateKeys(paar);
    expect(keys).toContain("selbststaendiger_kauf");
    expect(keys).toContain("angestellter_kauf");
  });

  it("verlangt Gehaltsabrechnungen nur von der Angestellten", () => {
    const list = buildChecklistForCase(paar, []);
    const gehalt = list.find((p) => p.key === "gehaltsabrechnung");
    expect(gehalt).toBeDefined();
    // Eine Person, nicht zwei – er hat keine Gehaltsabrechnungen.
    expect(gehalt!.effectiveRequiredCount).toBe(3);
  });

  it("verlangt BWA und Jahresabschluss, die vorher ganz fehlten", () => {
    const list = buildChecklistForCase(paar, []);
    for (const key of ["bwa", "jahresabschluss"]) {
      expect(list.find((p) => p.key === key), `Position ${key} fehlt`).toBeDefined();
    }
  });

  it("verlangt den Ausweis weiterhin von beiden", () => {
    const list = buildChecklistForCase(paar, []);
    const ausweis = list.find((p) => p.key === "personalausweis");
    expect(ausweis!.effectiveRequiredCount).toBe(2);
  });

  it("laesst eine Position ganz weg, wenn sie auf niemanden zutrifft", () => {
    const nurSelbststaendig = {
      ...paar,
      applicantCount: 1,
      applicantIds: ["a1"],
      applicants: [{ id: "a1", employmentType: "selbststaendiger" as const }],
    };
    const list = buildChecklistForCase(nurSelbststaendig, []);
    expect(list.find((p) => p.key === "gehaltsabrechnung")).toBeUndefined();
  });

  it("bleibt ohne Angabe zur Beschaeftigung beim bisherigen Verhalten", () => {
    const list = buildChecklistForCase(
      { financingType: "kauf", applicantCount: 2, applicantIds: ["a1", "a2"] },
      []
    );
    expect(list.find((p) => p.key === "gehaltsabrechnung")).toBeDefined();
  });
});

describe("Freiberufler", () => {
  it("verlangt vom Freiberufler EUER statt Bilanz", () => {
    const eingabe = {
      financingType: "kauf" as const,
      applicantCount: 1,
      applicantIds: ["a1"],
      applicants: [{ id: "a1", employmentType: "freiberufler" as const }],
    };
    const list = buildChecklistForCase(eingabe, []);
    const schluessel = list.map((p) => p.key);
    expect(schluessel).toContain("euer");
    expect(schluessel).toContain("bwa");
    expect(schluessel).not.toContain("jahresabschluss");
    expect(schluessel).not.toContain("susa");
    expect(schluessel).not.toContain("gehaltsabrechnung");
  });
});
