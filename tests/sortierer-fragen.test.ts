import { describe, it, expect } from "vitest";
import {
  naechsteFrage,
  offeneFragen,
  type SortierDokument,
  type SortierBuendel,
} from "@/lib/sortierer/fragen";

/**
 * Der Sortierer fragt NUR, wo es etwas zu entscheiden gibt. Wer bei 30
 * Bildern 30 Fragen beantworten muss, nimmt wieder den Ordner auf dem
 * Schreibtisch - diese Regeln sind deshalb die eigentliche Produktqualitaet.
 */

const doc = (o: Partial<SortierDokument> & { id: string }): SortierDokument => ({
  name: `${o.id}.jpg`,
  documentType: null,
  zusammengefuegtInId: null,
  vorschlagId: null,
  readable: true,
  entschieden: false,
  ...o,
});

const buendel = (o: Partial<SortierBuendel> & { id: string }): SortierBuendel => ({
  titel: "Kaufvertrag",
  seitenIds: [],
  entschieden: false,
  ...o,
});

describe("naechsteFrage", () => {
  it("schweigt, wenn alles klar ist", () => {
    const docs = [doc({ id: "a", documentType: "gehaltsabrechnung" })];
    expect(naechsteFrage(docs, [])).toBeNull();
    expect(offeneFragen(docs, [])).toBe(0);
  });

  it("fragt zuerst nach den Buendeln, dann nach losen Seiten", () => {
    // Die Buendel zuerst: Sie bilden die Gruppen, in die eine lose Seite
    // ueberhaupt erst einsortiert werden kann. Andersherum muesste der
    // Nutzer eine Seite zuordnen, bevor er die Ziele kennt.
    const docs = [
      doc({ id: "s1", vorschlagId: "b1" }),
      doc({ id: "s2", vorschlagId: "b1" }),
      doc({ id: "lose" }),
    ];
    const b = [buendel({ id: "b1", seitenIds: ["s1", "s2"] })];
    expect(naechsteFrage(docs, b)).toMatchObject({ art: "buendel", buendelId: "b1" });
    expect(offeneFragen(docs, b)).toBe(2);
  });

  it("fragt nach einem entschiedenen Buendel nicht noch einmal", () => {
    const docs = [doc({ id: "s1", vorschlagId: "b1" })];
    const b = [buendel({ id: "b1", seitenIds: ["s1"], entschieden: true })];
    expect(naechsteFrage(docs, b)).toBeNull();
  });

  it("fragt bei einer Seite ohne erkannten Typ, wohin sie gehoert", () => {
    const frage = naechsteFrage([doc({ id: "x", name: "IMG_1.jpg" })], []);
    expect(frage).toMatchObject({ art: "seite", documentId: "x", name: "IMG_1.jpg" });
  });

  it("fragt NICHT bei einer Seite, deren Typ sicher erkannt ist", () => {
    // Genau hier entsteht der Unterschied zwischen einem Werkzeug und einem
    // Fragebogen: Was die Maschine kann, fragt sie nicht nach.
    expect(naechsteFrage([doc({ id: "x", documentType: "personalausweis" })], [])).toBeNull();
  });

  it("fragt auch bei unlesbarer Seite, selbst wenn ein Typ dasteht", () => {
    // Ein Typ ohne lesbaren Text ist geraten (siehe falsches-gruen).
    const frage = naechsteFrage(
      [doc({ id: "x", documentType: "gehaltsabrechnung", readable: false })],
      []
    );
    expect(frage).toMatchObject({ art: "seite", documentId: "x" });
  });

  it("fragt eine bereits entschiedene Seite NICHT erneut", () => {
    // Der Berater hat "eigenes Dokument" geantwortet. Die Seite hat immer
    // noch keinen erkannten Typ - trotzdem ist sie erledigt.
    expect(naechsteFrage([doc({ id: "x", entschieden: true })], [])).toBeNull();
  });

  it("laesst Seiten in Ruhe, die schon in einem Buendel aufgegangen sind", () => {
    const docs = [doc({ id: "s1", zusammengefuegtInId: "fertig" })];
    expect(naechsteFrage(docs, [])).toBeNull();
  });

  it("bietet der losen Seite die fertigen Buendel als Ziel an", () => {
    const docs = [doc({ id: "lose" }), doc({ id: "s1", zusammengefuegtInId: "b-fertig" })];
    const frage = naechsteFrage(docs, [buendel({ id: "b1", entschieden: true })]);
    expect(frage).toMatchObject({ art: "seite", documentId: "lose" });
    if (frage?.art === "seite") {
      expect(frage.ziele.map((z) => z.id)).toContain("b-fertig");
    }
  });

  it("zaehlt die offenen Fragen, damit der Fortschritt sichtbar ist", () => {
    const docs = [doc({ id: "a" }), doc({ id: "b" }), doc({ id: "c", documentType: "expose" })];
    expect(offeneFragen(docs, [])).toBe(2);
  });
});
