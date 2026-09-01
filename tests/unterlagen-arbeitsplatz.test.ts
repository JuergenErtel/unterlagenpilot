import { describe, expect, it } from "vitest";
import {
  baueArbeitsplatz,
  abschnittFortschritt,
  arbeitsplatzUeberblick,
  ersterEinstieg,
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

describe("arbeitsplatzUeberblick", () => {
  it("zaehlt Eingang, Ungeprueftes und offene Anforderungen getrennt", () => {
    const a = baueArbeitsplatz(
      [
        position({ key: "perso", documentType: "personalausweis", status: "vorhanden" }),
        position({ key: "gehalt", documentType: "gehaltsabrechnung", status: "unvollstaendig" }),
        position({ key: "gb", documentType: "grundbuchauszug", status: "offen" }),
      ],
      [
        dok({ id: "p1", documentType: "personalausweis", reviewStatus: "akzeptiert" }),
        dok({ id: "g1", documentType: "gehaltsabrechnung", reviewStatus: "offen" }),
        dok({ id: "s1", documentType: "sonstige", reviewStatus: "offen" }),
        dok({ id: "e1" }),
        dok({ id: "e2" }),
      ]
    );
    expect(arbeitsplatzUeberblick(a)).toEqual({
      eingang: 2,
      zuPruefen: 2,
      fehlend: 2,
      erfuellt: 1,
      gesamt: 3,
    });
  });
});

describe("ersterEinstieg", () => {
  it("beginnt im Eingang, wenn dort etwas liegt", () => {
    const a = baueArbeitsplatz(
      [position({ key: "perso", documentType: "personalausweis" })],
      [dok({ id: "p1", documentType: "personalausweis" }), dok({ id: "e1" })]
    );
    expect(ersterEinstieg(a)).toEqual({ dokumentId: "e1", positionKey: null });
  });

  it("zeigt sonst das erste ungepruefte Dokument mit seiner Position", () => {
    const a = baueArbeitsplatz(
      [
        position({ key: "perso", documentType: "personalausweis", status: "vorhanden" }),
        position({ key: "gehalt", documentType: "gehaltsabrechnung" }),
      ],
      [
        dok({ id: "p1", documentType: "personalausweis", reviewStatus: "akzeptiert" }),
        dok({ id: "g1", documentType: "gehaltsabrechnung", reviewStatus: "offen" }),
      ]
    );
    expect(ersterEinstieg(a)).toEqual({ dokumentId: "g1", positionKey: "gehalt" });
  });

  it("faellt auf die erste offene Anforderung zurueck, wenn nichts zu pruefen ist", () => {
    const a = baueArbeitsplatz(
      [
        position({ key: "perso", documentType: "personalausweis", status: "vorhanden" }),
        position({ key: "gb", documentType: "grundbuchauszug", status: "offen" }),
      ],
      [dok({ id: "p1", documentType: "personalausweis", reviewStatus: "akzeptiert" })]
    );
    expect(ersterEinstieg(a)).toEqual({ dokumentId: null, positionKey: "gb" });
  });

  it("startet nie leer, solange irgendein Dokument existiert", () => {
    const a = baueArbeitsplatz(
      [position({ key: "perso", documentType: "personalausweis", status: "vorhanden" })],
      [dok({ id: "p1", documentType: "personalausweis", reviewStatus: "akzeptiert" })]
    );
    expect(ersterEinstieg(a).dokumentId).toBe("p1");
  });
});
