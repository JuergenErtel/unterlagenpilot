import { describe, it, expect } from "vitest";
import { dokumenttypFuer, antragstellerFuer, bezeichnungFuer } from "@/lib/anforderungen/zuordnung";
import type { ApplicantCandidate } from "@/lib/documents/applicant-match";

const zwei: ApplicantCandidate[] = [
  { id: "a1", position: 1, vorname: "Max", nachname: "Mustermann" },
  { id: "a2", position: 2, vorname: "Erika", nachname: "Musterfrau" },
];

describe("Kategorie -> Dokumenttyp", () => {
  it("findet den eindeutigen Typ", () => {
    expect(dokumenttypFuer(["Gehaltsabrechnung"])).toBe("gehaltsabrechnung");
    expect(dokumenttypFuer(["Ausweis"])).toBe("personalausweis");
    expect(dokumenttypFuer(["Teilungserklaerung"])).toBe("teilungserklaerung");
  });

  it("waehlt bei Mehrdeutigkeit nach fester Rangfolge", () => {
    // BWA ist Ziel von bwa, susa, jahresabschluss UND euer. Gewinnen muss der,
    // der in DOCUMENT_TYPES zuerst steht - sonst haengt das Ergebnis an der
    // Schluesselreihenfolge eines Objekts.
    expect(dokumenttypFuer(["BWA"])).toBe("bwa");
    // Bauplan ist Ziel von grundriss, ansichten UND skizze - eine
    // Bauplan-Anforderung der Bank meint zuerst den Grundriss.
    expect(dokumenttypFuer(["Bauplan"])).toBe("grundriss");
  });

  it("liefert null fuer Sonstiges", () => {
    // "Sonstiges" ist der Sammelkorb dreier Typen und sagt nichts aus.
    expect(dokumenttypFuer(["Sonstiges"])).toBeNull();
  });

  it("liefert null fuer Unbekanntes und Leeres", () => {
    expect(dokumenttypFuer(["Gibtsnicht"])).toBeNull();
    expect(dokumenttypFuer([])).toBeNull();
    expect(dokumenttypFuer(undefined)).toBeNull();
  });

  it("nimmt die erste Kategorie, die passt", () => {
    expect(dokumenttypFuer(["Gibtsnicht", "Ausweis"])).toBe("personalausweis");
  });
});

describe("Bezug -> Antragsteller", () => {
  it("ordnet ueber den Namen zu", () => {
    expect(antragstellerFuer({ typ: "antragsteller", name: "Erika Musterfrau" }, zwei)).toBe("a2");
  });

  it("ignoriert Bezuege, die keine Person sind", () => {
    expect(antragstellerFuer({ typ: "immobilie", name: "Hauptstr. 1" }, zwei)).toBeNull();
    expect(antragstellerFuer({ typ: "vorhaben", name: "Kauf" }, zwei)).toBeNull();
  });

  it("kommt ohne Bezug zurecht", () => {
    expect(antragstellerFuer(undefined, zwei)).toBeNull();
  });

  it("liefert null, wenn der Name auf niemanden eindeutig passt", () => {
    expect(antragstellerFuer({ typ: "antragsteller", name: "Klaus Kleber" }, zwei)).toBeNull();
  });
});

describe("Bezeichnung", () => {
  it("bevorzugt die Kurzbezeichnung", () => {
    expect(bezeichnungFuer({ id: "1", kurzbezeichnung: "Perso", text: "Ausweisdokument" })).toBe("Perso");
  });

  it("faellt auf text und dann auf code zurueck", () => {
    expect(bezeichnungFuer({ id: "1", text: "Ausweisdokument" })).toBe("Ausweisdokument");
    expect(bezeichnungFuer({ id: "1", code: "AW01" })).toBe("AW01");
  });

  it("nennt die Anforderung notfalls unbenannt statt leer", () => {
    expect(bezeichnungFuer({ id: "1" })).toBe("Unbenannte Anforderung");
  });
});
