import { describe, expect, it } from "vitest";
import {
  baueArbeitsplatz,
  abschnittFortschritt,
  type ArbeitsplatzDokument,
} from "@/lib/unterlagen/arbeitsplatz";
import type { DocumentType } from "@/lib/domain/enums";

const dok = (o: Partial<ArbeitsplatzDokument> & { id: string }): ArbeitsplatzDokument => ({
  name: o.id,
  originalName: o.id,
  mimeType: "application/pdf",
  documentType: null,
  applicantId: null,
  applicantSource: null,
  reviewStatus: "offen",
  readable: true,
  classificationStatus: "fertig",
  extractionStatus: "fertig",
  hochgeladenAm: "2026-08-31T08:00:00.000Z",
  hochgeladenAmText: "31.08.26, 10:00 Uhr",
  ...o,
});

const position = (o: {
  key: string;
  name?: string;
  documentType?: DocumentType | null;
  status?: "offen" | "vorhanden" | "unvollstaendig" | "nicht_aktuell" | "abgelehnt" | "nicht_erforderlich";
  level?: string;
}) => ({
  key: o.key,
  name: o.name ?? o.key,
  level: (o.level ?? "zwingend") as never,
  status: o.status ?? "offen",
  documentType: o.documentType ?? null,
  effectiveRequiredCount: 1,
});

describe("baueArbeitsplatz", () => {
  it("haengt aktive Dokumente an die Position ihres Typs, gruppiert nach Aktenaufbau", () => {
    const ap = baueArbeitsplatz(
      [
        position({ key: "personalausweis", documentType: "personalausweis" }),
        position({ key: "gehaltsabrechnung", documentType: "gehaltsabrechnung" }),
      ],
      [dok({ id: "a", documentType: "gehaltsabrechnung" })]
    );
    expect(ap.abschnitte.map((a) => a.titel)).toEqual(["Person", "Einkommen"]);
    const einkommen = ap.abschnitte[1]!.positionen[0]!;
    expect(einkommen.dokumente.map((d) => d.id)).toEqual(["a"]);
    expect(ap.abschnitte[0]!.positionen[0]!.dokumente).toHaveLength(0);
  });

  it("gibt ein Dokument bei zwei Positionen mit demselben Typ nur der ersten", () => {
    const ap = baueArbeitsplatz(
      [
        position({ key: "basis", documentType: "kontoauszug" }),
        position({ key: "bank_extra", documentType: "kontoauszug" }),
      ],
      [dok({ id: "a", documentType: "kontoauszug" })]
    );
    const [erste, zweite] = ap.abschnitte[0]!.positionen;
    expect(erste!.dokumente).toHaveLength(1);
    expect(zweite!.dokumente).toHaveLength(0);
  });

  it("legt Dokumente ohne Typ in den Eingang, fremde Typen zu 'weitere'", () => {
    const ap = baueArbeitsplatz(
      [position({ key: "personalausweis", documentType: "personalausweis" })],
      [dok({ id: "ohne-typ" }), dok({ id: "sonstig", documentType: "sonstige" })]
    );
    expect(ap.eingang.map((d) => d.id)).toEqual(["ohne-typ"]);
    expect(ap.weitere.map((d) => d.id)).toEqual(["sonstig"]);
  });

  it("stapelt ersetzte/abgelehnte/Duplikat-Versionen hinter der Position statt sie zu zeigen", () => {
    const ap = baueArbeitsplatz(
      [position({ key: "expose", documentType: "expose" })],
      [
        dok({ id: "aktuell", documentType: "expose", reviewStatus: "akzeptiert" }),
        dok({ id: "alt", documentType: "expose", reviewStatus: "ersetzt" }),
        dok({ id: "doppelt", documentType: "expose", reviewStatus: "duplikat" }),
        dok({ id: "verwaist", reviewStatus: "abgelehnt" }),
      ]
    );
    const p = ap.abschnitte[0]!.positionen[0]!;
    expect(p.dokumente.map((d) => d.id)).toEqual(["aktuell"]);
    expect(p.stapel.map((d) => d.id).sort()).toEqual(["alt", "doppelt"]);
    // Aussortiertes ohne Position darf nicht stillschweigend verschwinden.
    expect(ap.aussortiert.map((d) => d.id)).toEqual(["verwaist"]);
  });

  it("laesst nicht erforderliche Positionen weg und zaehlt Fortschritt nur ueber den Rest", () => {
    const ap = baueArbeitsplatz(
      [
        position({ key: "expose", documentType: "expose", status: "vorhanden" }),
        position({ key: "grundbuchauszug", documentType: "grundbuchauszug", status: "offen" }),
        position({ key: "mietvertrag", documentType: "mietvertrag", status: "nicht_erforderlich" }),
      ],
      []
    );
    const objekt = ap.abschnitte[0]!;
    expect(objekt.positionen.map((p) => p.key)).toEqual(["expose", "grundbuchauszug"]);
    expect(abschnittFortschritt(objekt)).toEqual({ erfuellt: 1, gesamt: 2 });
  });
});
