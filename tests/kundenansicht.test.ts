import { describe, it, expect } from "vitest";
import { baueKundenfortschritt } from "@/lib/upload/kundenansicht";

function pos(key: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    name: `Position ${key}`,
    customerDescription: `Bitte laden Sie ${key} hoch.`,
    example: `Beispiel ${key}`,
    documentType: key,
    status: "offen",
    customerVisible: true,
    level: "zwingend",
    scope: "fall",
    platforms: [],
    matchedDocuments: 0,
    effectiveRequiredCount: 1,
    ...extra,
  } as never;
}

describe("Kundensicht auf den Unterlagenstand", () => {
  it("zeigt offene Positionen mit Beschreibung und Beispiel", () => {
    const f = baueKundenfortschritt({ positionen: [pos("personalausweis")], dokumente: [] });
    expect(f.positionen[0]).toMatchObject({
      zustand: "offen",
      beschreibung: "Bitte laden Sie personalausweis hoch.",
      beispiel: "Beispiel personalausweis",
    });
    expect(f.prozent).toBe(0);
  });

  it("zeigt ein hochgeladenes, noch ungeprueftes Dokument als eingegangen", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis")],
      dokumente: [{ documentType: "personalausweis", reviewStatus: "offen", reviewNote: null }],
    });
    expect(f.positionen[0]!.zustand).toBe("eingegangen");
  });

  it("zaehlt nur angenommene Unterlagen als erledigt", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("a"), pos("b")],
      dokumente: [
        { documentType: "a", reviewStatus: "akzeptiert", reviewNote: null },
        { documentType: "b", reviewStatus: "offen", reviewNote: null },
      ],
    });
    expect(f.erledigt).toBe(1);
    expect(f.gesamt).toBe(2);
    expect(f.prozent).toBe(50);
  });

  it("nennt bei einer Ablehnung den Grund", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        {
          documentType: "gehaltsabrechnung",
          reviewStatus: "abgelehnt",
          reviewNote: "Seite 2 fehlt.",
        },
      ],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "abgelehnt", grund: "Seite 2 fehlt." });
  });

  it("bleibt ohne Ablehnungsgrund verstaendlich", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        { documentType: "gehaltsabrechnung", reviewStatus: "abgelehnt", reviewNote: null },
      ],
    });
    expect(f.positionen[0]!.zustand).toBe("abgelehnt");
    expect(f.positionen[0]!.grund).toBeUndefined();
  });

  it("blendet Positionen aus, die den Kunden nichts angehen", () => {
    const intern = {
      ...(pos("intern_pruefung") as unknown as Record<string, unknown>),
      customerVisible: false,
    } as never;
    const f = baueKundenfortschritt({ positionen: [pos("a"), intern], dokumente: [] });
    expect(f.positionen).toHaveLength(1);
    expect(f.gesamt).toBe(1);
  });

  it("meldet 100 Prozent, wenn nichts verlangt wird", () => {
    const f = baueKundenfortschritt({ positionen: [], dokumente: [] });
    expect(f.prozent).toBe(100);
    expect(f.gesamt).toBe(0);
  });

  it("haengt keinen alten Ablehnungsgrund an eine spaetere Annahme", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        { documentType: "gehaltsabrechnung", reviewStatus: "abgelehnt", reviewNote: "Seite 2 fehlt." },
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", reviewNote: null },
      ],
    });
    expect(f.positionen[0]!.zustand).toBe("angenommen");
    expect(f.positionen[0]!.grund).toBeUndefined();
  });
});
