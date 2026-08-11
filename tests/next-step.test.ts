import { describe, it, expect } from "vitest";
import { computeNextStep } from "@/lib/cases/next-step";
import type { NextStepInput } from "@/lib/cases/next-step";
import type { CockpitData } from "@/lib/cases/cockpit";

/** Cockpit-Ausschnitt plus Erstkontakt-Stand – zusammen das, was die Fallseite liefert. */
type TestInput = CockpitData & Pick<NextStepInput, "erstkontakt">;

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
  erstkontakt?: NextStepInput["erstkontakt"];
}): TestInput {
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
      offeneBefunde: 0,
      machbarkeitBlockiert: false,
      ...over.counts,
    },
    missingCustomerFields: over.missingCustomerFields ?? [],
    selbstauskunft: over.selbstauskunft,
    erstkontakt: over.erstkontakt,
    anforderungsAbgleich: null,
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

describe("computeNextStep – Erstkontakt in der Prioritätsleiter", () => {
  it("fehlende E-Mail-Adresse blockiert den Erstkontakt vor allem anderen", () => {
    const s = computeNextStep(
      cockpit({
        counts: { docsMissing: 3 },
        erstkontakt: { empfaenger: null, vorbereitet: false, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_email_fehlt");
    expect(s.cta?.href).toBe("/cases/c1/edit");
  });

  it("liegt eine Adresse vor, muss der Erstkontakt erst vorbereitet werden", () => {
    const s = computeNextStep(
      cockpit({ erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: false, versendet: false } })
    );
    expect(s.key).toBe("erstkontakt_vorbereiten");
    // Keine Primäraktion als Link – das Vorbereiten läuft über die Server-Action-Form
    // in der Fallseite (wie bei ki_fehler), nicht über einen next-step-Link.
    expect(s.cta).toBeUndefined();
  });

  it("liegt ein vorbereiteter, unversendeter Entwurf vor, führt der Schritt zur Nachrichtenseite", () => {
    const s = computeNextStep(
      cockpit({ erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false } })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
    expect(s.reason).toContain("kunde@example.com");
    expect(s.cta?.href).toBe("/cases/c1/messages");
  });

  it("ein unversendeter Erstkontakt schlägt fehlende Kundendaten, kritische Hinweise und fehlende Unterlagen", () => {
    const s = computeNextStep(
      cockpit({
        counts: { docsMissing: 5, criticals: 1 },
        missingCustomerFields: ["Geburtsdatum"],
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
  });

  it("ein unversendeter Erstkontakt schlägt eine eingegangene Selbstauskunft", () => {
    const s = computeNextStep(
      cockpit({
        selbstauskunft: { eingegangen: true, begonnen: true, erstelltVorTagen: 2 },
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
  });

  it("ein unversendeter Erstkontakt schlägt prüfbereite Dokumente", () => {
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 2 },
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
  });

  it("eine laufende KI-Prüfung schlägt auch einen unversendeten Erstkontakt", () => {
    const s = computeNextStep(
      cockpit({
        status: "ki_pruefung_laeuft",
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false },
      })
    );
    expect(s.key).toBe("ki_laeuft");
  });

  it("ein versendeter Erstkontakt taucht nicht mehr in der Leiter auf", () => {
    const s = computeNextStep(
      cockpit({ erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: true } })
    );
    expect(s.key).toBe("einreichung");
  });

  it("ohne geladenen Erstkontakt-Stand bleibt die Leiter wie zuvor (z. B. im Dashboard-Batch)", () => {
    const s = computeNextStep(cockpit({ counts: { docsMissing: 3 } }));
    expect(s.key).toBe("unterlagen_anfordern");
  });
});

describe("Stufe: Lücken in den Unterlagen", () => {
  const versendet = { empfaenger: "a@b.de", vorbereitet: true, versendet: true };

  it("meldet offene Befunde, bevor Unterlagen angefordert werden", () => {
    const s = computeNextStep(
      cockpit({ counts: { docsMissing: 3, offeneBefunde: 4 }, erstkontakt: versendet })
    );
    expect(s.key).toBe("unterlagen_luecken");
    expect(s.title).toContain("4");
    expect(s.cta?.href).toContain("/cases/c1");
  });

  it("tritt hinter kritische Hinweise zurueck", () => {
    const s = computeNextStep(
      cockpit({ counts: { docsMissing: 3, offeneBefunde: 4, criticals: 2 }, erstkontakt: versendet })
    );
    expect(s.key).toBe("kritische_hinweise");
  });

  it("verhaelt sich unveraendert, wenn keine Befunde offen sind", () => {
    const s = computeNextStep(cockpit({ counts: { docsMissing: 3 }, erstkontakt: versendet }));
    expect(s.key).toBe("unterlagen_anfordern");
  });
});

describe("Stufe: Machbarkeit", () => {
  const versendet = { empfaenger: "a@b.de", vorbereitet: true, versendet: true };

  it("meldet einen nicht darstellbaren Fall vor allem Unterlagen-Kram", () => {
    const s = computeNextStep(
      cockpit({
        counts: { docsMissing: 3, offeneBefunde: 2, machbarkeitBlockiert: true },
        erstkontakt: versendet,
      })
    );
    expect(s.key).toBe("machbarkeit");
    expect(s.cta?.href).toContain("/machbarkeit");
  });

  it("tritt hinter kritische Hinweise zurueck", () => {
    const s = computeNextStep(
      cockpit({ counts: { criticals: 1, machbarkeitBlockiert: true }, erstkontakt: versendet })
    );
    expect(s.key).toBe("kritische_hinweise");
  });

  it("schweigt, wenn der Fall traegt", () => {
    const s = computeNextStep(
      cockpit({ counts: { docsMissing: 3, machbarkeitBlockiert: false }, erstkontakt: versendet })
    );
    expect(s.key).toBe("unterlagen_anfordern");
  });
});
