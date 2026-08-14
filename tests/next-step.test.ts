import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CASE_STATUSES } from "@/lib/domain/enums";
import { computeNextStep } from "@/lib/cases/next-step";
import type { NextStepInput } from "@/lib/cases/next-step";
import type { CockpitData } from "@/lib/cases/cockpit";

/** Cockpit-Ausschnitt plus Erstkontakt- und Erstgespräch-Stand – zusammen das, was die Fallseite liefert. */
type TestInput = CockpitData & Pick<NextStepInput, "erstkontakt" | "erstgespraech">;

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
  erstgespraech?: NextStepInput["erstgespraech"];
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
    machbarkeit: null,
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
    erstgespraech: over.erstgespraech,
    anforderungsAbgleich: null,
  };
}

describe("computeNextStep – Fälle nach der Einreichung", () => {
  /**
   * Die Stufe prüfte auf den Status "eingereicht" – den es in `CaseStatus`
   * nie gab (gültig ist `uebertragen`, beschriftet „Bei Bank eingereicht").
   * Der Zweig war damit toter Code: Ein an die Bank übergebener Fall bekam
   * die Anweisung „Einreichung vorbereiten", die er längst hinter sich hat.
   */
  it("verfolgt Fristen, sobald der Fall bei der Bank liegt", () => {
    const s = computeNextStep(
      cockpit({
        status: "uebertragen",
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
      })
    );
    expect(s.key).toBe("fristen");
  });

  it("verfolgt Fristen auch bei einer Bank-Nachforderung", () => {
    const s = computeNextStep(
      cockpit({
        status: "bank_nachforderung",
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
      })
    );
    expect(s.key).toBe("fristen");
  });

  it("schickt einen abgeschlossenen Fall nicht in die Einreichung", () => {
    // Die Fallseite berechnet den Schritt für JEDEN Fall, auch für erledigte –
    // anders als das Dashboard, das terminale Status herausfiltert.
    for (const status of ["abgeschlossen", "archiviert"] as const) {
      const s = computeNextStep(
        cockpit({
          status,
          erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        })
      );
      expect(s.key).toBe("erledigt");
      expect(s.cta).toBeUndefined();
    }
  });

  it("meldet auch bei einem erledigten Fall keine wartenden Schritte", () => {
    const s = computeNextStep(cockpit({ status: "abgeschlossen", counts: { pruefbereit: 2 } }));
    expect(s.key).toBe("erledigt");
    expect(s.wartet).toBeUndefined();
  });
});

describe("computeNextStep – wartende Schritte", () => {
  it("verliert die Dokumentfreigabe nicht, wenn ein höherer Schritt sie verdrängt", () => {
    // Genau der Fall UP-2026-0007: Exposé ausgewertet und freigabebereit,
    // aber der Erstkontakt steht darüber – die Freigabe war dadurch unsichtbar.
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 1 },
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_vorbereiten");
    expect(s.wartet).toEqual([
      { label: "1 Dokument prüfen & freigeben", href: "/review?case=c1" },
    ]);
  });

  it("nennt die Freigabe nicht doppelt, wenn sie selbst der Hauptschritt ist", () => {
    const s = computeNextStep(cockpit({ counts: { pruefbereit: 2 } }));
    expect(s.key).toBe("dokumente_freigeben");
    expect(s.wartet).toBeUndefined();
  });

  it("meldet nichts Wartendes, solange kein Dokument freigabebereit ist", () => {
    const s = computeNextStep(
      cockpit({
        missingCustomerFields: ["Geburtsdatum Anna"],
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
      })
    );
    expect(s.wartet).toBeUndefined();
  });

  it("zählt mehrere wartende Dokumente im Plural", () => {
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 3 },
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: false },
      })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
    expect(s.wartet?.[0]!.label).toBe("3 Dokumente prüfen & freigeben");
  });

  it("meldet während des KI-Laufs nichts Wartendes (die Dokumente sind noch nicht bereit)", () => {
    const s = computeNextStep(cockpit({ status: "ki_pruefung_laeuft", counts: { pruefbereit: 2, docsLaufend: 2 } }));
    expect(s.key).toBe("ki_laeuft");
    expect(s.wartet).toBeUndefined();
  });
});

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
    // Bis 12.08.2026 stand hier "eingereicht" – ein Wert, den CASE_STATUSES
    // nicht kennt. Der Test bestaetigte damit dieselbe Erfindung wie der Code
    // und hielt den toten Zweig am Leben. Gueltig ist "uebertragen".
    const s = computeNextStep(cockpit({ status: "uebertragen" }));
    expect(s.key).toBe("fristen");
  });

  it("kennt nur Status, die es wirklich gibt", () => {
    // Wachhund gegen die Wiederholung: Jeder Statuswert, auf den die Leiter
    // prueft, muss im Enum stehen.
    const quelle = readFileSync(new URL("../src/lib/cases/next-step.ts", import.meta.url), "utf8");
    const geprueft = [...quelle.matchAll(/c\.status === "([a-z_]+)"/g)].map((m) => m[1]!);
    expect(geprueft.length).toBeGreaterThan(0);
    for (const s of geprueft) expect(CASE_STATUSES).toContain(s);
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

describe("computeNextStep – Erstgespräch", () => {
  it("führt nach dem Erstkontakt ins Erstgespräch, solange Angaben fehlen", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.cta?.href).toBe("/cases/c1/erstgespraech");
  });

  it("überspringt das Erstgespräch, wenn alle Angaben stehen", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 0 },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
  });

  it("ist bei einem frischen Lead die ERSTE Aufgabe – noch vor dem Erstkontakt", () => {
    // Juergens Ansage (14.08.2026): "Erstgespraech ist die 1. Aufgabe nach
    // Leadeingang." Vorher gewann hier "Erstkontakt pruefen & senden" – der
    // Lead bekam also eine Mail, bevor ihn jemand angerufen hatte.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: false },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.cta?.href).toBe("/cases/c1/erstgespraech");
  });

  it("laesst dem Erstkontakt den Vortritt, sobald das Gespräch abgehakt ist", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: false },
        erstgespraech: { offeneAngaben: 6, gefuehrtAm: new Date("2026-08-14") },
      })
    );
    expect(s.key).toBe("erstkontakt_entwurf");
  });

  it("draengt sich nicht vor, wenn die E-Mail-Adresse fehlt – das ist ein Blocker", () => {
    // Ohne Adresse kann spaeter weder Erstkontakt noch Nachforderung raus.
    // Der Blocker bleibt vorn, sonst faellt er erst nach dem Gespraech auf.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: null, vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstkontakt_email_fehlt");
  });

  it("tritt zurück, sobald das Gespräch als geführt abgehakt ist – auch mit offenen Angaben", () => {
    // Der Kern des Hakens: Die Reifeleiste zaehlt ~35 Angaben, von denen etliche
    // zu Recht leer bleiben (keine weiteren Einkuenfte, kein Konditionswunsch).
    // Ohne Haken blieb die Leiter fuer immer hier stehen und verdeckte
    // Machbarkeit, Unterlagen, Fristen und Einreichung – sie zeigt bauartbedingt
    // nur EINEN Schritt.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6, gefuehrtAm: new Date("2026-08-14") },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
  });

  it("bleibt nach dem Abhaken als wartender Schritt sichtbar, solange Angaben fehlen", () => {
    // Zurueckgetreten heisst nicht verschwunden: die offenen Angaben sind weiter
    // erledigbar und sollen auffindbar bleiben.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6, gefuehrtAm: new Date("2026-08-14") },
      })
    );
    expect(s.wartet).toContainEqual({
      label: "Erstgespräch führen",
      href: "/cases/c1/erstgespraech",
    });
  });

  it("meldet nach dem Abhaken nichts mehr, wenn auch keine Angabe mehr offen ist", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 0, gefuehrtAm: new Date("2026-08-14") },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
    expect(s.wartet ?? []).not.toContainEqual({
      label: "Erstgespräch führen",
      href: "/cases/c1/erstgespraech",
    });
  });

  it("laesst den fertigen Erstkontakt-Entwurf sichtbar, wenn es ihn verdrängt", () => {
    // Die Umkehr vom 14.08.2026: Frueher gewann der Erstkontakt und das
    // Erstgespraech stand unter "Wartet ausserdem" – jetzt andersherum. Die
    // Zusage dahinter bleibt dieselbe: Ein fertiger, sofort erledigbarer
    // Schritt darf nicht spurlos verschwinden, weil die Leiter nur EINEN
    // Schritt zeigt. Genau daran scheiterte im Juli die Dokumentfreigabe.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: true, versendet: false },
        erstgespraech: { offeneAngaben: 4 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.wartet).toEqual([
      { label: "Erstkontakt prüfen & senden", href: "/cases/c1/messages" },
    ]);
  });

  it("nennt den Erstkontakt nicht als wartend, wenn er noch gar nicht vorbereitet ist", () => {
    // Unvorbereitet gibt es nichts zu pruefen – der Hinweis waere eine
    // Sackgasse statt eines Wegweisers.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.com", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 4 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.wartet ?? []).toEqual([]);
  });

  it("nennt das Erstgespräch nicht doppelt, wenn es selbst der Hauptschritt ist", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.wartet).toBeUndefined();
  });

  it("meldet das Erstgespräch nicht als wartend, solange die KI-Prüfung läuft", () => {
    const s = computeNextStep(
      cockpit({
        status: "ki_pruefung_laeuft",
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 4 },
      })
    );
    expect(s.key).toBe("ki_laeuft");
    expect(s.wartet).toBeUndefined();
  });

  // Kritischer Fund aus der Prüfung: Solange offene Angaben JEDEN anderen
  // Hauptschritt schlagen, liefern praktisch alle Fälle denselben nächsten
  // Schritt – die Leiter führt dann nicht mehr. Freigabebereite Dokumente und
  // kritische Hinweise sind fachlich dringlicher als das Erstgespräch und
  // müssen es weiterhin verdrängen.
  it("verdrängt das Erstgespräch nicht mehr die Dokumentfreigabe", () => {
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 2 },
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("dokumente_freigeben");
    // Bleibt trotzdem sichtbar, statt spurlos zu verschwinden.
    expect(s.wartet).toEqual([{ label: "Erstgespräch führen", href: "/cases/c1/erstgespraech" }]);
  });

  it("verdrängt das Erstgespräch nicht mehr kritische Hinweise", () => {
    const s = computeNextStep(
      cockpit({
        counts: { criticals: 1 },
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("kritische_hinweise");
    expect(s.wartet).toEqual([{ label: "Erstgespräch führen", href: "/cases/c1/erstgespraech" }]);
  });

  it("führt weiterhin vor Machbarkeit und fehlenden Unterlagen ins Erstgespräch", () => {
    // Die Umsortierung darf die bestehende Reihenfolge unterhalb nicht kippen.
    const s = computeNextStep(
      cockpit({
        counts: { docsMissing: 5, machbarkeitBlockiert: true },
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstgespraech");
  });

  // Kritischer Fund: Für abgegebene Fälle ist die Maske schreibgeschützt
  // (LOCKED_CASE_STATUSES) – "Erstgespräch führen" wäre dort eine Sackgasse.
  it("schickt einen exportierten Fall nicht ins schreibgeschützte Erstgespräch", () => {
    const s = computeNextStep(cockpit({ status: "exportiert", erstgespraech: { offeneAngaben: 6 } }));
    expect(s.key).not.toBe("erstgespraech");
    expect(s.key).toBe("einreichung");
    expect(s.wartet).toBeUndefined();
  });

  it("schickt einen bei der Bank eingereichten Fall nicht ins Erstgespräch, sondern auf Fristen", () => {
    const s = computeNextStep(cockpit({ status: "uebertragen", erstgespraech: { offeneAngaben: 6 } }));
    expect(s.key).toBe("fristen");
    expect(s.wartet).toBeUndefined();
  });

  it("schickt einen Fall mit Bank-Nachforderung nicht ins Erstgespräch (nicht gesperrt, aber erledigt)", () => {
    // bank_nachforderung steht NICHT in LOCKED_CASE_STATUSES – die Maske wäre
    // technisch bedienbar, fachlich gehört der Fall aber auf "Fristen".
    const s = computeNextStep(cockpit({ status: "bank_nachforderung", erstgespraech: { offeneAngaben: 6 } }));
    expect(s.key).toBe("fristen");
    expect(s.wartet).toBeUndefined();
  });
});
