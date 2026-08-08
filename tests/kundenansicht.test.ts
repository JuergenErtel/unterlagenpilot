import { describe, it, expect } from "vitest";
import {
  baueKundenfortschritt,
  fehlmengeHinweis,
  fortschrittHinweis,
} from "@/lib/upload/kundenansicht";

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

/**
 * Dokument mit Zeitstempel. `minute` legt die Reihenfolge fest – massgeblich
 * ist je Position der juengste Stand.
 */
function dok(
  documentType: string,
  reviewStatus: string,
  extra: { reviewNote?: string | null; minute?: number } = {}
) {
  return {
    documentType,
    reviewStatus,
    reviewNote: extra.reviewNote ?? null,
    createdAt: new Date(2026, 7, 8, 10, extra.minute ?? 0),
  };
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
      dokumente: [dok("personalausweis", "offen")],
    });
    expect(f.positionen[0]!.zustand).toBe("eingegangen");
  });

  it("zaehlt nur angenommene Unterlagen als erledigt", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("a"), pos("b")],
      dokumente: [dok("a", "akzeptiert"), dok("b", "offen")],
    });
    expect(f.erledigt).toBe(1);
    expect(f.gesamt).toBe(2);
    expect(f.prozent).toBe(50);
  });

  it("nennt bei einer Ablehnung den Grund", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt." })],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "abgelehnt", grund: "Seite 2 fehlt." });
  });

  it("bleibt ohne Ablehnungsgrund verstaendlich", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [dok("gehaltsabrechnung", "abgelehnt")],
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
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt.", minute: 1 }),
        dok("gehaltsabrechnung", "akzeptiert", { minute: 2 }),
      ],
    });
    expect(f.positionen[0]!.zustand).toBe("angenommen");
    expect(f.positionen[0]!.grund).toBeUndefined();
  });

  it("zaehlt eingegangene, noch ungeprüfte Unterlagen sichtbar mit", () => {
    // Der Kunde hat abends alles hochgeladen. Vorher meldete die Seite bis zur
    // Pruefung "0 von 12 / 0 %" – der Balken blieb leer.
    const f = baueKundenfortschritt({
      positionen: [pos("a"), pos("b"), pos("c"), pos("d")],
      dokumente: [dok("a", "offen"), dok("b", "offen"), dok("c", "akzeptiert")],
    });
    expect(f.erledigt).toBe(1);
    expect(f.eingereicht).toBe(3);
    expect(f.prozent).toBe(25);
    expect(f.prozentEingereicht).toBe(75);
  });

  it("zaehlt eine abgelehnte Position nicht als eingereicht – dort muss der Kunde handeln", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("a"), pos("b")],
      dokumente: [dok("a", "abgelehnt", { reviewNote: "Seite 2 fehlt." }), dok("b", "offen")],
    });
    expect(f.eingereicht).toBe(1);
    expect(f.prozentEingereicht).toBe(50);
  });

  it("fordert nicht mehr zum Hochladen auf, wenn alles eingegangen ist", () => {
    expect(fortschrittHinweis({ erledigt: 0, eingereicht: 12, gesamt: 12 })).toBe(
      "Alles eingegangen – wir prüfen Ihre Unterlagen. Sie müssen aktuell nichts weiter tun."
    );
  });

  it("fordert weiter zum Hochladen auf, solange etwas offen ist", () => {
    expect(fortschrittHinweis({ erledigt: 0, eingereicht: 11, gesamt: 12 })).toContain(
      "Laden Sie die noch offenen Unterlagen hoch"
    );
  });

  it("meldet bei vollstaendiger Annahme, dass es geschafft ist", () => {
    expect(fortschrittHinweis({ erledigt: 12, eingereicht: 12, gesamt: 12 })).toContain("Geschafft");
  });

  it("quittiert einen neuen Upload nach einer Ablehnung als eingegangen", () => {
    // Der Kunde hat die Ablehnung gelesen und dieselbe Unterlage neu
    // hochgeladen. Vorher gewann weiter der alte, abgelehnte Datensatz – rot,
    // mit altem Grund. Fuer seinen zweiten Versuch bekam er keine Quittung.
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt.", minute: 1 }),
        dok("gehaltsabrechnung", "offen", { minute: 2 }),
      ],
    });
    expect(f.positionen[0]!.zustand).toBe("eingegangen");
    expect(f.positionen[0]!.grund).toBeUndefined();
  });

  it("bleibt ohne neuen Upload bei der Ablehnung, samt Grund", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        dok("gehaltsabrechnung", "offen", { minute: 1 }),
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt.", minute: 2 }),
      ],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "abgelehnt", grund: "Seite 2 fehlt." });
  });

  it("zeigt nach einer zweiten Ablehnung den neuen Grund, nicht den alten", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt.", minute: 1 }),
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Unscharf fotografiert.", minute: 2 }),
      ],
    });
    expect(f.positionen[0]).toMatchObject({
      zustand: "abgelehnt",
      grund: "Unscharf fotografiert.",
    });
  });

  it("wertet unabhaengig von der Reihenfolge der Eingabe aus", () => {
    // Die Datenbankabfrage garantiert keine Sortierung – massgeblich ist der
    // Zeitstempel, nicht die Position im Array.
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        dok("gehaltsabrechnung", "offen", { minute: 2 }),
        dok("gehaltsabrechnung", "abgelehnt", { reviewNote: "Seite 2 fehlt.", minute: 1 }),
      ],
    });
    expect(f.positionen[0]!.zustand).toBe("eingegangen");
  });

  it("meldet eine Position mit mehreren verlangten Dokumenten erst als teilweise, nicht als angenommen", () => {
    // z.B. Personalausweis bei zwei Antragstellern (perApplicant): ein
    // akzeptiertes Dokument darf die Position nicht faelschlich abschliessen,
    // solange der zweite Antragsteller noch nichts eingereicht hat.
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2 })],
      dokumente: [dok("personalausweis", "akzeptiert")],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "teilweise", verlangt: 2, akzeptiert: 1 });
    expect(f.erledigt).toBe(0);
    expect(f.prozent).toBe(0);
  });

  it("meldet eine Position mit mehreren verlangten Dokumenten als angenommen, sobald alle da sind", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2 })],
      dokumente: [
        dok("personalausweis", "akzeptiert", { minute: 1 }),
        dok("personalausweis", "akzeptiert", { minute: 2 }),
      ],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "angenommen", verlangt: 2, akzeptiert: 2 });
    expect(f.erledigt).toBe(1);
    expect(f.prozent).toBe(100);
  });

  it("zaehlt zwei Dokumente desselben Antragstellers nicht als vollstaendig", () => {
    // Personalausweis bei zwei Antragstellern: Anna hat Vorder- und Rueckseite
    // hochgeladen, beide angenommen. Ohne Antragstellerbezug galt die Position
    // damit als erledigt, obwohl von Bernd nichts vorliegt.
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2, perApplicant: true })],
      dokumente: [
        { ...dok("personalausweis", "akzeptiert", { minute: 1 }), applicantId: "anna" },
        { ...dok("personalausweis", "akzeptiert", { minute: 2 }), applicantId: "anna" },
      ],
      applicantIds: ["anna", "bernd"],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "teilweise", verlangt: 2, akzeptiert: 1 });
  });

  it("meldet die Position als angenommen, sobald jeder Antragsteller geliefert hat", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2, perApplicant: true })],
      dokumente: [
        { ...dok("personalausweis", "akzeptiert", { minute: 1 }), applicantId: "anna" },
        { ...dok("personalausweis", "akzeptiert", { minute: 2 }), applicantId: "bernd" },
      ],
      applicantIds: ["anna", "bernd"],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "angenommen", akzeptiert: 2 });
  });

  it("rechnet noch nicht zugeordnete Dokumente weiter mit", () => {
    // Ueber den gemeinsamen Link verraet die Datei nicht, wer sie hochgeladen
    // hat; der Vermittler ordnet erst spaeter zu. Bis dahin darf der Kunde
    // seine angenommenen Unterlagen nicht verlieren.
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2, perApplicant: true })],
      dokumente: [
        dok("personalausweis", "akzeptiert", { minute: 1 }),
        dok("personalausweis", "akzeptiert", { minute: 2 }),
      ],
      applicantIds: ["anna", "bernd"],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "angenommen", akzeptiert: 2 });
  });

  it("fuellt bei einem zugeordneten und einem offenen Dokument beide Plaetze", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis", { effectiveRequiredCount: 2, perApplicant: true })],
      dokumente: [
        { ...dok("personalausweis", "akzeptiert", { minute: 1 }), applicantId: "anna" },
        dok("personalausweis", "akzeptiert", { minute: 2 }),
      ],
      applicantIds: ["anna", "bernd"],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "angenommen", akzeptiert: 2 });
  });

  it("schickt bei einer teilweise erfuellten Position nicht den Falschen los", () => {
    // Bei einer Position je Antragsteller fehlt die Unterlage beim
    // MITantragsteller – "Bitte reichen Sie die restliche Unterlage nach" las
    // sich fuer den Leser wie sein eigenes Versaeumnis.
    const text = fehlmengeHinweis(2, 1);
    expect(text).toContain("1 von 2");
    expect(text).toContain("Mitantragstellers");
    expect(text).not.toMatch(/reichen Sie/i);
  });

  it("verhaelt sich bei effectiveRequiredCount 1 wie bisher (Regressionsschutz)", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis")],
      dokumente: [dok("personalausweis", "akzeptiert")],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "angenommen", verlangt: 1, akzeptiert: 1 });
    expect(f.erledigt).toBe(1);
    expect(f.prozent).toBe(100);
  });
});
