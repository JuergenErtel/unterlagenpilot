import { describe, it, expect } from "vitest";
import { computeNextStep } from "@/lib/cases/next-step";
import type { CockpitData } from "@/lib/cases/cockpit";

/** Minimal-Cockpit; Tests überschreiben nur, was für die jeweilige Stufe zählt. */
function cockpit(over: {
  status?: string;
  counts?: Partial<CockpitData["counts"]>;
  missingCustomerFields?: string[];
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    erstelltVorTagen: number | null;
  };
}): CockpitData {
  return {
    caseId: "c1",
    caseNumber: "UP-2026-0001",
    applicantNames: "Test",
    status: over.status ?? "unterlagen_fehlen",
    score: 50,
    scoreTone: "review",
    scoreLabel: "Teilweise vollständig",
    blockers: [],
    platformReadiness: [],
    roadmap: [],
    nextActions: [],
    missingGroups: [],
    counts: {
      docsPresent: 0,
      docsMissing: 0,
      pruefbereit: 0,
      warnings: 0,
      criticals: 0,
      docsFehler: 0,
      docsLaufend: 0,
      ...over.counts,
    },
    missingCustomerFields: over.missingCustomerFields ?? [],
    selbstauskunft: over.selbstauskunft,
  };
}

describe("computeNextStep – Prioritätsleiter", () => {
  it("KI läuft schlägt alles", () => {
    const s = computeNextStep(
      cockpit({ status: "ki_pruefung_laeuft", counts: { pruefbereit: 3, docsFehler: 2 }, missingCustomerFields: ["x"] })
    );
    expect(s.key).toBe("ki_laeuft");
    expect(s.cta).toBeUndefined();
  });

  it("KI-Fehler vor Dokument-Freigabe", () => {
    const s = computeNextStep(cockpit({ counts: { docsFehler: 2, pruefbereit: 3 } }));
    expect(s.key).toBe("ki_fehler");
  });

  it("eine eingegangene Selbstauskunft steht vor der Dokumentfreigabe", () => {
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 3 },
        selbstauskunft: { eingegangen: true, begonnen: true, erstelltVorTagen: 2 },
      })
    );
    expect(s.key).toBe("selbstauskunft_eingegangen");
    expect(s.cta?.href).toContain("selbstauskunft");
  });

  it("eine laufende KI-Prüfung schlägt auch die Selbstauskunft", () => {
    const s = computeNextStep(
      cockpit({
        status: "ki_pruefung_laeuft",
        selbstauskunft: { eingegangen: true, begonnen: true, erstelltVorTagen: 2 },
      })
    );
    expect(s.key).toBe("ki_laeuft");
  });

  it("erinnert an eine verschickte, nicht begonnene Selbstauskunft", () => {
    const s = computeNextStep(
      cockpit({ selbstauskunft: { eingegangen: false, begonnen: false, erstelltVorTagen: 5 } })
    );
    expect(s.key).toBe("selbstauskunft_wartet");
  });

  it("erinnert nicht, solange der Link frisch ist", () => {
    const s = computeNextStep(
      cockpit({ selbstauskunft: { eingegangen: false, begonnen: false, erstelltVorTagen: 1 } })
    );
    expect(s.key).not.toBe("selbstauskunft_wartet");
  });

  it("erinnert nicht, wenn der Kunde bereits begonnen hat", () => {
    const s = computeNextStep(
      cockpit({ selbstauskunft: { eingegangen: false, begonnen: true, erstelltVorTagen: 9 } })
    );
    expect(s.key).not.toBe("selbstauskunft_wartet");
  });

  it("prüfbereite Dokumente führen ins fallbezogene Review", () => {
    const s = computeNextStep(cockpit({ counts: { pruefbereit: 3 }, missingCustomerFields: ["Geburtsdatum"] }));
    expect(s.key).toBe("dokumente_freigeben");
    expect(s.cta?.href).toBe("/review?case=c1");
    expect(s.title).toContain("3 Dokumente");
  });

  it("fehlende Pflicht-Kundendaten vor fehlenden Unterlagen", () => {
    const s = computeNextStep(cockpit({ counts: { docsMissing: 5 }, missingCustomerFields: ["Geburtsdatum Anna"] }));
    expect(s.key).toBe("kundendaten");
    expect(s.reason).toContain("Geburtsdatum Anna");
  });

  it("kritische Hinweise vor Unterlagen-Anforderung", () => {
    const s = computeNextStep(cockpit({ counts: { criticals: 1, docsMissing: 5 } }));
    expect(s.key).toBe("kritische_hinweise");
  });

  it("fehlende Unterlagen mit Sekundäraktionen", () => {
    const s = computeNextStep(cockpit({ counts: { docsMissing: 4 } }));
    expect(s.key).toBe("unterlagen_anfordern");
    expect(s.secondary?.length).toBe(2);
  });

  it("eingereichter Fall verweist auf Fristen/Verwaltung", () => {
    const s = computeNextStep(cockpit({ status: "eingereicht" }));
    expect(s.key).toBe("fristen");
  });

  it("leerer, sauberer Fall endet bei der Einreichung", () => {
    const s = computeNextStep(cockpit({}));
    expect(s.key).toBe("einreichung");
    expect(s.tone).toBe("ready");
  });

  it("Singular-Formulierungen stimmen", () => {
    expect(computeNextStep(cockpit({ counts: { pruefbereit: 1 } })).title).toContain("1 Dokument prüfen");
    expect(computeNextStep(cockpit({ counts: { docsMissing: 1 } })).title).toContain("1 Unterlage anfordern");
  });
});
