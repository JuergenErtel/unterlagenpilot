import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseDirekteinreicher,
  ansprechpartnerAusTabelle,
  klartext,
  feldAusBeschriftung,
} from "@/lib/banken/direkteinreicher/parsen";
import { bankNameAusTitel, vergleichsname, ordneZu } from "@/lib/banken/direkteinreicher/zuordnen";

const ULM = readFileSync("tests/fixtures/direkteinreicher-spk-ulm.html", "utf8");

describe("Direkteinreicherinformationen lesen", () => {
  it("liest aus dem Ulm-Artikel zwei Ansprechpartner mit Funktion, Telefon und E-Mail", () => {
    const info = parseDirekteinreicher(ULM);
    expect(info.ansprechpartner).toEqual([
      {
        name: "Philipp Häußler",
        funktion: "Vermittlerberater",
        telefon: "0731 101-1939",
        email: "vermittlerservice@spkulm.de",
      },
      {
        name: "Yvonne Wilhelm",
        funktion: "Vertretung: Vermittlerberater",
        telefon: "0731 101-1975",
        email: "vermittlerservice@spkulm.de",
      },
    ]);
  });

  it("liest die Anschrift als Zeilen, ohne Leerzellen", () => {
    const info = parseDirekteinreicher(ULM);
    expect(info.anschrift).toBe("Vermittlerservice Sparkasse Ulm\nNeue Strasse 60\n89073 Ulm");
    expect(info.hinweise).toBeNull();
  });

  it("versteht auch die Bauart 'eine Zeile je Person'", () => {
    const html = `<table><tr><th>Name</th><th>Funktion</th><th>Telefon</th><th>E-Mail</th></tr>
      <tr><td>Max Muster</td><td>Vermittlerbetreuer</td><td>0221 123</td><td>max@bank.de</td></tr>
      <tr><td>Erika Beispiel</td><td></td><td>0221 456</td><td></td></tr></table>`;
    const info = parseDirekteinreicher(html);
    expect(info.ansprechpartner).toEqual([
      { name: "Max Muster", funktion: "Vermittlerbetreuer", telefon: "0221 123", email: "max@bank.de" },
      { name: "Erika Beispiel", funktion: "", telefon: "0221 456", email: "" },
    ]);
  });

  it("gibt Tabellen ohne erkennbare Beschriftung nicht als Personen aus", () => {
    expect(ansprechpartnerAusTabelle([["Montag", "9-17 Uhr"], ["Freitag", "9-14 Uhr"]])).toBeNull();
  });

  it("verliert Fliesstext und fremde Tabellen nicht – sie landen in den Hinweisen", () => {
    const html = `<h2>Erreichbarkeit</h2><p>Mo–Fr 9–17 Uhr</p>
      <table><tr><td>Servicezeit</td><td>9-17 Uhr</td></tr></table>` + ULM;
    const info = parseDirekteinreicher(html);
    expect(info.hinweise).toContain("Mo–Fr 9–17 Uhr");
    expect(info.hinweise).toContain("Servicezeit · 9-17 Uhr");
    expect(info.ansprechpartner).toHaveLength(2);
  });

  it("setzt Zeilenumbrueche an Blockgrenzen statt Woerter zusammenzukleben", () => {
    expect(klartext("<p>Neue Strasse 60</p><p>89073 Ulm</p>")).toBe("Neue Strasse 60\n89073 Ulm");
    expect(klartext("a&nbsp;b &amp; c")).toBe("a b & c");
  });

  it("erkennt die gaengigen Beschriftungen", () => {
    expect(feldAusBeschriftung("Telefonnummer")).toBe("telefon");
    expect(feldAusBeschriftung("Tel.:")).toBe("telefon");
    expect(feldAusBeschriftung("E-Mail-Adresse")).toBe("email");
    expect(feldAusBeschriftung("Ansprechpartner/in")).toBe("name");
    expect(feldAusBeschriftung("0731 101-1939")).toBeNull();
  });
});

describe("Artikel der Bank zuordnen", () => {
  const banken = [
    { id: "1", name: "Spk Ulm" },
    { id: "2", name: "Spk Neu-Ulm - Illertissen" },
    { id: "3", name: "VoBa Ulm-Biberach" },
    { id: "4", name: "KSK Köln" },
    { id: "5", name: "Volksbank Nottuln eG" },
  ];

  it("zieht den Banknamen aus dem Titel", () => {
    expect(bankNameAusTitel("Sparkasse Ulm - Direkteinreicherinformationen")).toBe("Sparkasse Ulm");
    expect(bankNameAusTitel("KSK Köln – Direkteinreicher-Informationen")).toBe("KSK Köln");
    expect(bankNameAusTitel("Sparkasse Ulm - Formular-Center")).toBeNull();
  });

  it("gleicht Kurzform und Rechtsform an", () => {
    expect(vergleichsname("Volksbank Nottuln eG")).toBe(vergleichsname("VoBa Nottuln"));
    expect(vergleichsname("Kreissparkasse Köln")).toBe(vergleichsname("KSK Köln"));
  });

  it("trifft exakt, nicht per Teilstring", () => {
    expect(ordneZu("Sparkasse Ulm", banken)?.id).toBe("1");
    expect(ordneZu("Volksbank Ulm-Biberach eG", banken)?.id).toBe("3");
    expect(ordneZu("Ulm", banken)).toBeNull();
    expect(ordneZu("Sparkasse Ulmer Land", banken)).toBeNull();
  });
});
