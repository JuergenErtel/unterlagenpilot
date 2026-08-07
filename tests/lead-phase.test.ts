import { describe, it, expect } from "vitest";
import { schlagePhaseVor, phasenIndex, type PhasenSignale } from "@/lib/cases/lead-phase";

function signale(over: Partial<PhasenSignale> = {}): PhasenSignale {
  return {
    leadPhase: "neu",
    verlorenAm: null,
    status: "neu",
    abschlussdatum: null,
    hatLink: false,
    hatGesendeteNachricht: false,
    selbstauskunftBegonnen: false,
    dokumenteVorhanden: false,
    ...over,
  };
}

describe("schlagePhaseVor", () => {
  it("schlägt für einen frischen Fall ohne Aktivität nichts vor", () => {
    expect(schlagePhaseVor(signale())).toBeNull();
  });

  it("schlägt 'Anfrage erstellt' vor, sobald ein Link existiert", () => {
    expect(schlagePhaseVor(signale({ hatLink: true }))).toBe("anfrage_erstellt");
  });

  it("schlägt 'Anfrage erstellt' auch bei einer gesendeten Nachricht vor", () => {
    expect(schlagePhaseVor(signale({ hatGesendeteNachricht: true }))).toBe("anfrage_erstellt");
  });

  it("schlägt 'Selbstauskunft läuft' vor, sobald der Kunde begonnen hat", () => {
    expect(schlagePhaseVor(signale({ hatLink: true, selbstauskunftBegonnen: true }))).toBe(
      "selbstauskunft_laeuft"
    );
  });

  it("wertet eingegangene Dokumente wie einen begonnenen Bogen", () => {
    expect(schlagePhaseVor(signale({ dokumenteVorhanden: true }))).toBe("selbstauskunft_laeuft");
  });

  it("schlägt 'Kreditprüfung eingereicht' vor, wenn der Fall exportiert wurde", () => {
    expect(schlagePhaseVor(signale({ status: "exportiert" }))).toBe("kreditpruefung_eingereicht");
    expect(schlagePhaseVor(signale({ status: "uebertragen" }))).toBe("kreditpruefung_eingereicht");
  });

  it("schlägt 'Finanzierung abgeschlossen' bei Abschlussdatum oder Status vor", () => {
    expect(schlagePhaseVor(signale({ abschlussdatum: new Date() }))).toBe("abgeschlossen");
    expect(schlagePhaseVor(signale({ status: "abgeschlossen" }))).toBe("abgeschlossen");
  });

  it("schlägt nie rückwärts vor", () => {
    // Fall steht schon auf Zusage; ein Dokument darf ihn nicht zurückholen.
    expect(
      schlagePhaseVor(signale({ leadPhase: "zusage", dokumenteVorhanden: true, hatLink: true }))
    ).toBeNull();
  });

  it("schlägt nichts vor, wenn die Phase bereits stimmt", () => {
    expect(schlagePhaseVor(signale({ leadPhase: "anfrage_erstellt", hatLink: true }))).toBeNull();
  });

  it("schlägt bei einem verlorenen Fall nichts vor", () => {
    expect(schlagePhaseVor(signale({ verlorenAm: new Date(), status: "exportiert" }))).toBeNull();
  });

  it("schlägt Finanzierungsvorschlag und Zusage nie vor – dafür gibt es kein Signal", () => {
    const alle = [
      signale({ hatLink: true }),
      signale({ dokumenteVorhanden: true }),
      signale({ status: "einreichungsfertig", dokumenteVorhanden: true }),
      signale({ status: "bank_nachforderung" }),
    ].map(schlagePhaseVor);
    expect(alle).not.toContain("finanzierungsvorschlag");
    expect(alle).not.toContain("zusage");
  });

  it("kennt die Reihenfolge der Phasen", () => {
    expect(phasenIndex("neu")).toBe(0);
    expect(phasenIndex("abgeschlossen")).toBe(6);
    expect(phasenIndex("quatsch")).toBe(-1);
  });
});
