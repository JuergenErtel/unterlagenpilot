import { describe, it, expect } from "vitest";
import { waehleKandidaten, istBuendelKandidat, zuKandidat, type Kandidat } from "@/lib/buendelung/kandidaten";

function k(over: Partial<Kandidat> = {}): Kandidat {
  return {
    id: "d1",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    pageCount: 1,
    reviewStatus: "offen",
    ocrStatus: "fertig",
    readable: true,
    zusammengefuegtInId: null,
    documentType: null,
    period: null,
    createdAt: new Date("2026-08-28T10:00:00Z"),
    text: "Gehaltsabrechnung Mai 2026",
    ...over,
  };
}

describe("waehleKandidaten", () => {
  it("nimmt zwei Fotos", () => {
    expect(waehleKandidaten([k({ id: "a" }), k({ id: "b" })]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("nimmt ein einseitiges PDF", () => {
    const kandidaten = waehleKandidaten([
      k({ id: "a" }),
      k({ id: "b", mimeType: "application/pdf", originalName: "scan.pdf" }),
    ]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst ein mehrseitiges PDF liegen - das ist bereits ein Dokument", () => {
    const kandidaten = waehleKandidaten([
      k({ id: "a" }),
      k({ id: "b" }),
      k({ id: "c", mimeType: "application/pdf", pageCount: 6 }),
    ]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("fasst ein freigegebenes Dokument nicht an", () => {
    // Die Freigabe ist eine Entscheidung des Vermittlers. Buendeln wuerde sie
    // stillschweigend zuruecknehmen.
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", reviewStatus: "akzeptiert" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine Seite ohne lesbaren Text liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", readable: false })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine Seite mit unfertiger Texterkennung liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", ocrStatus: "laeuft" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine bereits gebuendelte Seite liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", zusammengefuegtInId: "z1" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("ein einzelner Kandidat ergibt keinen Lauf", () => {
    expect(waehleKandidaten([k({ id: "a" }), k({ id: "b", reviewStatus: "akzeptiert" })])).toEqual([]);
  });

  it("das Praedikat allein entscheidet ueber EINE Seite - ohne Mindestanzahl", () => {
    // Die Fallakte braucht die Frage je Zeile; waehleKandidaten() gibt bei nur
    // einem Treffer bewusst nichts zurueck.
    expect(istBuendelKandidat(k())).toBe(true);
    expect(istBuendelKandidat(k({ pageCount: 6, mimeType: "application/pdf" }))).toBe(false);
    expect(istBuendelKandidat(k({ reviewStatus: "akzeptiert" }))).toBe(false);
  });

  it("sortiert nach Uploadzeit - das ist die Ausgangsordnung, die die KI umstellen darf", () => {
    const spaet = k({ id: "spaet", createdAt: new Date("2026-08-28T12:00:00Z") });
    const frueh = k({ id: "frueh", createdAt: new Date("2026-08-28T09:00:00Z") });
    expect(waehleKandidaten([spaet, frueh]).map((x) => x.id)).toEqual(["frueh", "spaet"]);
  });
});

// Schlussbefund 8: DIESELBE Abbildung fuer alle drei Aufrufer (Erkennungslauf,
// Zusammenfuegen, Auswahlkaestchen in der Fallakte) - direkt getestet, damit
// eine kuenftige vierte Kopie oder ein Auseinanderlaufen der drei Aufrufer
// sofort auffiele.
describe("zuKandidat", () => {
  const roh = {
    id: "d1",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    pageCount: 1,
    reviewStatus: "offen",
    ocrStatus: "fertig",
    readable: true,
    zusammengefuegtInId: null,
    documentType: "gehaltsabrechnung",
    period: "2026-05",
    createdAt: new Date("2026-08-28T10:00:00Z"),
  };

  it("uebernimmt alle Strukturfelder unveraendert", () => {
    expect(zuKandidat(roh)).toEqual({ ...roh, text: "" });
  });

  it("nimmt den Text als optionales zweites Argument - Standard ist leer", () => {
    expect(zuKandidat(roh, "Gehaltsabrechnung Mai").text).toBe("Gehaltsabrechnung Mai");
    expect(zuKandidat(roh).text).toBe("");
  });

  it("das Ergebnis besteht dieselbe Pruefung wie ein von Hand gebauter Kandidat", () => {
    expect(istBuendelKandidat(zuKandidat(roh))).toBe(
      istBuendelKandidat(k({ ...roh, documentType: roh.documentType as Kandidat["documentType"], text: "" }))
    );
  });
});
