import { describe, it, expect } from "vitest";
import { buildChecklistForCase, fehltFuerSatz } from "@/lib/checklists/engine";

/**
 * Fall Topcic (UP-2026-0015), 16.08.2026.
 *
 * Beide Ausweisdateien hingen an Antragsteller 1 – auch die von Antragsteller
 * 2. Die Position blieb dadurch zu Recht offen, aber die Meldung dazu lautete
 * `matchedDocuments: 2` bei `effectiveRequiredCount: 2`: fallweite Zahlen zu
 * einem personenbezogen gerechneten Status. Auf dem Schirm stand also „2 von 2
 * da" UND „fehlt", und nirgends, um wen es geht. Genau deshalb war der Fehler
 * für den Vermittler nicht auffindbar.
 */

const EINGABE = {
  employmentType: "angestellter" as const,
  financingType: "kauf" as const,
  propertyType: "einfamilienhaus" as const,
  applicantCount: 2,
  applicantIds: ["a1", "a2"],
};

function ausweis(applicantId: string | null) {
  return {
    documentType: "personalausweis" as const,
    reviewStatus: "akzeptiert" as const,
    applicantId,
  };
}

describe("Checkliste – wer eine personenbezogene Position offen hat", () => {
  it("nennt den Antragsteller, dem der Ausweis fehlt", () => {
    // Beide Ausweise auf Person 1 – genau der Zustand im Fall Topcic.
    const liste = buildChecklistForCase(EINGABE, [ausweis("a1"), ausweis("a1")]);
    const perso = liste.find((i) => i.key === "personalausweis");

    expect(perso?.status).toBe("unvollstaendig");
    expect(perso?.offeneAntragsteller).toEqual(["a2"]);
  });

  it("meldet niemanden, wenn jede Person ihren Ausweis hat", () => {
    const liste = buildChecklistForCase(EINGABE, [ausweis("a1"), ausweis("a2")]);
    const perso = liste.find((i) => i.key === "personalausweis");

    expect(perso?.status).toBe("vorhanden");
    expect(perso?.offeneAntragsteller).toEqual([]);
  });

  it("meldet beide, wenn gar kein Ausweis da ist", () => {
    const liste = buildChecklistForCase(EINGABE, []);
    const perso = liste.find((i) => i.key === "personalausweis");

    expect(perso?.status).toBe("offen");
    expect(perso?.offeneAntragsteller).toEqual(["a1", "a2"]);
  });

  it("zählt ein unzugeordnetes Dokument keiner Person gut", () => {
    // Ein Dokument ohne Zuordnung kann niemandes Soll erfüllen – sonst gälte
    // die Position als erfüllt, obwohl von Person 2 nichts vorliegt.
    const liste = buildChecklistForCase(EINGABE, [ausweis("a1"), ausweis(null)]);
    const perso = liste.find((i) => i.key === "personalausweis");

    expect(perso?.offeneAntragsteller).toEqual(["a2"]);
  });

  it("lässt die Liste bei fallweiten Positionen leer", () => {
    // Der Grundbuchauszug gilt fürs Objekt, nicht für eine Person. Dort wäre
    // eine Personenliste eine Falschaussage.
    const liste = buildChecklistForCase(EINGABE, []);
    const grundbuch = liste.find((i) => i.key === "grundbuchauszug");

    expect(grundbuch?.status).toBe("offen");
    expect(grundbuch?.offeneAntragsteller).toEqual([]);
  });

  it("lässt die Liste bei einem einzelnen Antragsteller leer", () => {
    // Bei einer Person ist „wer fehlt" keine Frage – die Antwort wäre immer
    // dieselbe und die Anzeige nur länger.
    const liste = buildChecklistForCase(
      { ...EINGABE, applicantCount: 1, applicantIds: ["a1"] },
      []
    );
    const perso = liste.find((i) => i.key === "personalausweis");

    expect(perso?.status).toBe("offen");
    expect(perso?.offeneAntragsteller).toEqual([]);
  });
});

describe("fehltFuerSatz – der Zusatz auf dem Schirm", () => {
  const PAAR = [
    { id: "a1", position: 1, vorname: "Mate", nachname: "Topcic" },
    { id: "a2", position: 2, vorname: "Jadranka", nachname: "Topcic" },
  ];

  it("nennt die Person beim Namen", () => {
    expect(fehltFuerSatz(["a2"], PAAR)).toBe("Fehlt noch für: Jadranka Topcic.");
  });

  it("nennt beide, mit „und“ verbunden", () => {
    expect(fehltFuerSatz(["a1", "a2"], PAAR)).toBe("Fehlt noch für: Mate Topcic und Jadranka Topcic.");
  });

  it("schweigt, wenn niemand offen ist", () => {
    expect(fehltFuerSatz([], PAAR)).toBeNull();
  });

  it("schweigt bei einem einzelnen Antragsteller", () => {
    // Dort ist „für wen" keine Frage – der Satz wäre nur Lärm.
    expect(fehltFuerSatz(["a1"], [PAAR[0]!])).toBeNull();
  });

  it("weicht auf die Position aus, wenn kein Name da ist", () => {
    // Aus einem Lead kommt oft nur eine E-Mail. „Antragsteller 2" ist eine
    // brauchbare Auskunft, eine leere Zeichenkette nicht.
    const ohneNamen = [
      { id: "a1", position: 1, vorname: "Mate", nachname: "Topcic" },
      { id: "a2", position: 2, vorname: null, nachname: null },
    ];
    expect(fehltFuerSatz(["a2"], ohneNamen)).toBe("Fehlt noch für: Antragsteller 2.");
  });

  it("schweigt, wenn die offene Kennung zu niemandem gehört", () => {
    // Ein geloeschter Antragsteller darf keinen halben Satz erzeugen.
    expect(fehltFuerSatz(["weg"], PAAR)).toBeNull();
  });
});
