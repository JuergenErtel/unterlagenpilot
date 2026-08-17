import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CASE_STATUSES } from "@/lib/domain/enums";
import { computeNextStep, laeuftAusserhalb } from "@/lib/cases/next-step";
import type { NextStepInput } from "@/lib/cases/next-step";
import type { CockpitData } from "@/lib/cases/cockpit";
import type { KontaktStand } from "@/lib/cases/kontakt";

/** Cockpit-Ausschnitt plus Erstkontakt-, Erstgespräch-, Kontakt- und Wiedervorlage-Stand – zusammen das, was die Fallseite liefert. */
type TestInput = CockpitData &
  Pick<
    NextStepInput,
    | "erstkontakt"
    | "erstgespraech"
    | "kontakt"
    | "wiedervorlageFaellig"
    | "verloren"
    | "leadPhase"
  >;

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
  kontakt?: NextStepInput["kontakt"];
  wiedervorlageFaellig?: NextStepInput["wiedervorlageFaellig"];
  verloren?: NextStepInput["verloren"];
  leadPhase?: NextStepInput["leadPhase"];
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
    leadPhase: over.leadPhase ?? "neu",
    erstkontakt: over.erstkontakt,
    erstgespraech: over.erstgespraech,
    kontakt: over.kontakt,
    wiedervorlageFaellig: over.wiedervorlageFaellig,
    verloren: over.verloren,
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

  it("verschwindet nach dem Abhaken auch aus 'Wartet außerdem' – trotz offener Angaben", () => {
    // Juergens Ansage vom 17.08.2026 (Fall UP-2026-0019, Beyerle): "Ich habe das
    // Erstgespraech abgehakt – es steht aber immer noch als ToDo im Fall."
    //
    // Bis dahin war genau das Absicht: Die Sprosse trat zurueck, und
    // `ermittleWartende` nahm sie ohne `gefuehrtAm`-Waechter sofort wieder auf,
    // damit die ~35 offenen Angaben auffindbar bleiben. Aus Sicht des
    // Vermittlers war der Haken damit wirkungslos – der Fall mahnte weiter
    // dieselbe Aufgabe an, die er gerade erledigt gemeldet hatte.
    //
    // Auffindbar bleibt die Maske trotzdem: Die Werkzeugspalte der Fallseite
    // hat einen Dauer-Einstieg "Erstgespräch führen" samt "N offen"
    // (cases/[id]/page.tsx) – bewusst UNABHAENGIG von der Fallreise gebaut.
    // Ein Werkzeug ist kein ToDo; nur die Fallreise mahnt.
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6, gefuehrtAm: new Date("2026-08-14") },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
    expect(s.wartet ?? []).not.toContainEqual({
      label: "Erstgespräch führen",
      href: "/cases/c1/erstgespraech",
    });
  });

  it("bleibt ohne Haken als wartender Schritt sichtbar, wenn ein hoeherer Schritt es verdraengt", () => {
    // Die Gegenprobe zum Test darueber: OHNE Haken darf der verdraengte
    // Schritt nicht spurlos verschwinden – die Leiter zeigt bauartbedingt nur
    // EINEN Schritt (Fall UP-2026-0007). Nur der Haken bringt ihn zum
    // Schweigen, nicht die Verdraengung.
    const s = computeNextStep(
      cockpit({
        counts: { pruefbereit: 2 },
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
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

/** Kontaktstand-Attrappe – nur die Felder, die die Leiter liest. */
function stand(over: Partial<KontaktStand> = {}): KontaktStand {
  return {
    jeErreicht: false,
    versuche: 0,
    letzterVersuchAm: null,
    naechsterAb: null,
    faellig: true,
    abbruchFaellig: false,
    fristTage: 3,
    ...over,
  };
}

describe("Kontaktaufnahme in der Leiter", () => {
  it("steht vor dem Erstgespraech, solange niemand erreicht wurde", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("kontakt_aufnehmen");
  });

  it("nennt den Versuchsstand im Text", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 2 }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.title).toContain("3. Versuch");
  });

  it("tritt zurueck, sobald das Erstgespraech als gefuehrt abgehakt ist", () => {
    // Ein gefuehrtes Gespraech IST der Beweis, dass Kontakt bestand – auch
    // wenn niemand daneben "Erreicht" angeklickt hat. Ohne diese Regel
    // widersprach sich die Leiter: Sie rief zum ERSTEN Anruf auf, waehrend
    // dasselbe Gespraech nebenan als gefuehrt vermerkt war.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: false },
        erstgespraech: { offeneAngaben: 12, gefuehrtAm: new Date("2026-08-15") },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
    expect(schritt.key).toBe("erstkontakt_entwurf");
  });

  it("schlaegt keinen Abbruch mehr vor, wenn das Erstgespraech gefuehrt wurde – auch nach Fristablauf", () => {
    // Nachtrag zur Abschlusspruefung: Die Sprosse trat beim gefuehrten
    // Gespraech zurueck, der Hinweis in "wartet" nicht – derselbe
    // Selbstwiderspruch eine Ebene tiefer. Ein gefuehrtes Gespraech beweist,
    // dass Kontakt bestand; dann darf nichts mehr zum Aufgeben raten.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6, gefuehrtAm: new Date("2026-08-15") },
        kontakt: {
          stand: stand({ versuche: 4, abbruchFaellig: true, faellig: false }),
          telefon: "0170 1234567",
        },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
    expect((schritt.wartet ?? []).some((w) => w.label.includes("nicht erreichbar"))).toBe(false);
  });

  it("verlinkt den Abbruchvorschlag ins Board, wo der Fall als verloren markiert werden kann", () => {
    // Die Fallseite kennt keinen Weg zu "verloren" – `setzeVerloren` haengt
    // ausschliesslich am LossDialog des Boards (/dashboard). Ein Vorschlag
    // ohne Ausfahrt ist keiner.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        kontakt: { stand: stand({ versuche: 4, abbruchFaellig: true }), telefon: "0170 1234567" },
      })
    );
    const hinweis = (schritt.wartet ?? []).find((w) => w.label.includes("nicht erreichbar"));
    expect(hinweis?.href).toBe("/dashboard");
    expect(hinweis?.label).toContain("verloren");
  });

  it("tritt zurueck, sobald der Kunde erreicht wurde", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ jeErreicht: true, faellig: false }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("erstgespraech");
  });

  it("schweigt, solange der Abstand laeuft", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 1, faellig: false }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("erstgespraech");
  });

  it("bietet nach Fristablauf den Abbruch nur als Vorschlag in \"wartet\" an, nicht als Hauptschritt", () => {
    // Nachbesserung: abbruchFaellig ist monoton (einmal wahr, nie wieder
    // falsch) – als Hauptschritt haette das die Leiter fuer immer hier
    // festgehalten. Solange noch ein Versuch faellig ist, bleibt
    // kontakt_aufnehmen der Hauptschritt; der Abbruch ist nur ein Hinweis.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 4, abbruchFaellig: true }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("kontakt_aufnehmen");
    expect(schritt.wartet).toContainEqual({
      label: "Kunde seit 3 Tagen nicht erreichbar – im Board als verloren markieren?",
      href: "/dashboard",
    });
  });

  it("kommt trotz abgelaufener Kontakt-Frist zu den fachlichen Schritten durch, sobald kein Versuch mehr faellig ist", () => {
    // Genau die Falle, die die Nachbesserung schliesst: Ein Kunde, der
    // telefonisch nie erreicht wurde, aber schriftlich mitarbeitet (Mail-
    // Antwort, Upload, Selbstauskunft), darf nicht fuer immer auf "aufgeben?"
    // haengen bleiben. Machbarkeit, Luecken, Fristen und Einreichung bleiben
    // erreichbar; der Abbruch bleibt als Hinweis sichtbar.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        kontakt: {
          stand: stand({ versuche: 4, abbruchFaellig: true, faellig: false }),
          telefon: "0170 1234567",
        },
      })
    );
    expect(schritt.key).toBe("einreichung");
    expect(schritt.wartet).toContainEqual({
      label: "Kunde seit 3 Tagen nicht erreichbar – im Board als verloren markieren?",
      href: "/dashboard",
    });
  });

  it("weist auf die fehlende Telefonnummer hin, statt stumm zu verschwinden", () => {
    // Ein Lead ohne Nummer ist ein Problem, keine Erledigung.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: null },
      })
    );
    expect(schritt.key).toBe("kontakt_aufnehmen");
    expect(schritt.reason).toContain("Telefonnummer");
  });

  it("erscheint nicht bei abgegebenen Faellen", () => {
    const schritt = computeNextStep(
      cockpit({
        status: "uebertragen",
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
  });

  it("erscheint nicht mehr, wenn der Fall verloren ist – auch nicht als Hinweis in \"wartet\"", () => {
    // "Verloren" ist KEIN Status, sondern verlorenAm am Fall – die
    // LOCKED_CASE_STATUSES fangen es deshalb nicht ab.
    const schritt = computeNextStep(
      cockpit({
        verloren: true,
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ abbruchFaellig: true }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
    expect(schritt.wartet ?? []).not.toContainEqual({
      label: "Kunde seit 3 Tagen nicht erreichbar – im Board als verloren markieren?",
      href: "/dashboard",
    });
  });

  it("wird von der Dokumentfreigabe verdraengt", () => {
    const schritt = computeNextStep(
      cockpit({
        counts: { pruefbereit: 3 },
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("dokumente_freigeben");
  });
});

describe("Wiedervorlage in der Leiter", () => {
  it("mahnt eine faellige Wiedervorlage an", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        wiedervorlageFaellig: true,
      })
    );
    expect(schritt.key).toBe("wiedervorlage_faellig");
  });

  it("schlaegt auch dann zu, wenn der Erstkontakt noch nicht versendet ist", () => {
    // Der Bug vor der Nachbesserung: Der Erstkontakt-Zweig kehrt auf JEDEM
    // Pfad per return zurueck, die Wiedervorlage-Pruefung weiter unten wurde
    // nie erreicht – ausgerechnet fuer den Normalfall "Kunde bat um Rueckruf
    // naechste Woche", solange die Erstkontakt-Mail noch nicht raus ist.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        wiedervorlageFaellig: true,
      })
    );
    expect(schritt.key).toBe("wiedervorlage_faellig");
  });

  it("schweigt ohne faellige Wiedervorlage", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        wiedervorlageFaellig: false,
      })
    );
    expect(schritt.key).not.toBe("wiedervorlage_faellig");
  });

  it("fuehrt zur Verwaltungsseite, nicht zur Fallseite – die Sprosse soll mahnen, aber nicht unentrinnbar sein", () => {
    // Controller-Entscheidung (14.08.2026): Die Sprosse hat kein "erledigt"-
    // Gegenstueck und steht weit vorn in der Leiter. Ein reiner Datumsvergleich
    // wuerde ein altes, nie geraeumtes Datum den Fall dauerhaft hier
    // festhalten und alles darunter verdecken – dieselbe Falle wie bei
    // kontakt_aufgeben. Das Feld Wiedervorlage liegt auf der Verwaltungsseite
    // und laesst sich dort verschieben oder raeumen – der cta muss dorthin
    // fuehren, nicht zurueck auf die Fallseite, die die Sprosse ja gerade zeigt.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        wiedervorlageFaellig: true,
      })
    );
    expect(schritt.key).toBe("wiedervorlage_faellig");
    expect(schritt.cta?.href).toBe("/cases/c1/verwaltung");
  });
});


describe("Vertrieb laeuft ausserhalb", () => {
  /*
   * Juergens Befund vom 15.08.2026: Ein Fall, den er im Kanban auf "Zusage"
   * gezogen hat, mahnte weiter Erstgespraech und fehlende Unterlagen an. Grund:
   * Die Leiter las nur den FALLSTATUS (Unterlagen, Einreichung) und war fuer die
   * LEADPHASE (Vertrieb) blind – dabei ist "Zusage" die eine Phase, die
   * ausschliesslich er selbst setzt.
   *
   * Entscheidung: Ab "Finanzierungsvorschlag" fuehrt BaufiDesk den Fall nicht
   * mehr; ab da laeuft die Arbeit in Europace.
   */
  const laufend = {
    counts: { docsMissing: 3, pruefbereit: 2 },
    missingCustomerFields: ["geburtsdatum"],
    erstgespraech: { offeneAngaben: 12 },
  };

  for (const phase of ["finanzierungsvorschlag", "kreditpruefung_eingereicht", "zusage"]) {
    it(`mahnt bei Phase ${phase} nichts mehr an`, () => {
      const schritt = computeNextStep(cockpit({ ...laufend, leadPhase: phase }));
      expect(schritt.key).toBe("vertrieb_laeuft");
    });
  }

  it("nennt den Stand im Titel, statt eine leere Karte zu zeigen", () => {
    expect(computeNextStep(cockpit({ ...laufend, leadPhase: "zusage" })).title).toContain("Zusage");
    expect(
      computeNextStep(cockpit({ ...laufend, leadPhase: "kreditpruefung_eingereicht" })).title
    ).toContain("Bank");
  });

  it("sagt, wie man die Leiter zurueckholt", () => {
    // Ohne diesen Hinweis waere die Sprosse eine Sackgasse: Wer die Fuehrung
    // doch wieder braucht, muesste raten.
    const schritt = computeNextStep(cockpit({ ...laufend, leadPhase: "zusage" }));
    expect(schritt.reason).toMatch(/Phase/i);
  });

  for (const phase of ["neu", "anfrage_erstellt", "selbstauskunft_laeuft"]) {
    it(`fuehrt bei Phase ${phase} unveraendert weiter`, () => {
      const schritt = computeNextStep(cockpit({ ...laufend, leadPhase: phase }));
      expect(schritt.key).not.toBe("vertrieb_laeuft");
    });
  }

  it("fuehrt ohne Phasenangabe unveraendert weiter", () => {
    // Aufrufer, die die Phase nicht laden, sollen sich verhalten wie bisher.
    expect(computeNextStep(cockpit(laufend)).key).not.toBe("vertrieb_laeuft");
  });

  it("laesst eine Nachforderung der Bank durch", () => {
    // Die kommt von aussen und ist genau dann wichtig, wenn der Fall bei der
    // Bank liegt – sie darf nicht von der Stillstellung verdeckt werden.
    const schritt = computeNextStep(
      cockpit({ ...laufend, leadPhase: "zusage", status: "bank_nachforderung" })
    );
    expect(schritt.key).not.toBe("vertrieb_laeuft");
  });

  it("laesst eine faellige Wiedervorlage durch", () => {
    const schritt = computeNextStep(
      cockpit({ ...laufend, leadPhase: "zusage", wiedervorlageFaellig: true })
    );
    expect(schritt.key).toBe("wiedervorlage_faellig");
  });

  it("laesst einen KI-Fehler durch", () => {
    const schritt = computeNextStep(
      cockpit({ ...laufend, leadPhase: "zusage", counts: { ...laufend.counts, docsFehler: 1 } })
    );
    expect(schritt.key).toBe("ki_fehler");
  });

  it("bietet auch keine Nebenaufgaben mehr an", () => {
    /*
     * Der erste Anlauf am 16.08.2026 stellte nur die HAUPTsprosse still. Die
     * Liste "Wartet ausserdem" wird von einer eigenen Funktion gebaut, die nur
     * den Fallstatus liest – sie sagte weiter "Erstgespraech fuehren", obwohl
     * die Karte darueber schon "Zusage liegt vor" meldete. Genau das hat
     * Juergen gemeldet.
     */
    const schritt = computeNextStep(
      cockpit({ ...laufend, leadPhase: "zusage", counts: { ...laufend.counts, pruefbereit: 2 } })
    );
    expect(schritt.key).toBe("vertrieb_laeuft");
    expect(schritt.wartet ?? []).toEqual([]);
  });

  it("bleibt bei abgeschlossenen Faellen bei der Abschlussmeldung", () => {
    const schritt = computeNextStep(
      cockpit({ ...laufend, leadPhase: "zusage", status: "abgeschlossen" })
    );
    expect(schritt.key).toBe("erledigt");
  });
});

describe("laeuftAusserhalb", () => {
  /*
   * Eigene Ausfuhr, weil dasselbe Wissen sonst ein viertes Mal gerechnet wuerde:
   * Die Lead-Karte im Kanban hatte ihre EIGENE Regel fuer "Erstgespraech
   * fuehren" (kein Gespraech + keine Nachricht) und kannte die Phase nicht –
   * deshalb stand der Knopf am 16.08.2026 weiter auf Karten in "Zusage",
   * obwohl die Leiter laengst schwieg.
   */
  it("gilt ab dem Finanzierungsvorschlag", () => {
    for (const p of ["finanzierungsvorschlag", "kreditpruefung_eingereicht", "zusage", "abgeschlossen"]) {
      expect(laeuftAusserhalb(p)).toBe(true);
    }
  });

  it("gilt davor nicht", () => {
    for (const p of ["neu", "anfrage_erstellt", "selbstauskunft_laeuft"]) {
      expect(laeuftAusserhalb(p)).toBe(false);
    }
  });

  it("gilt ohne Angabe nicht", () => {
    expect(laeuftAusserhalb(undefined)).toBe(false);
    expect(laeuftAusserhalb("")).toBe(false);
  });
});
