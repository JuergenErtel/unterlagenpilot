import { describe, expect, it } from "vitest";
import { waLink, telLink } from "@/lib/kontakt/telefon";

describe("waLink", () => {
  it("macht aus einer deutschen Nummer mit fuehrender Null eine internationale", () => {
    expect(waLink("0170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("versteht die Schreibweise mit +49", () => {
    expect(waLink("+49 170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("versteht die Schreibweise mit 0049", () => {
    expect(waLink("0049 170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("laesst Trennzeichen und Klammern unbeachtet", () => {
    expect(waLink("(0170) 123-4567")).toBe("https://wa.me/491701234567");
  });

  it("gibt null zurueck, wenn nichts Brauchbares dasteht", () => {
    // Lieber kein Link als ein Link auf eine falsche Nummer.
    expect(waLink(null)).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink("kenne ich nicht")).toBeNull();
    expect(waLink("123")).toBeNull();
  });

  it("lehnt Durchwahlen ab (zu lange fuer WhatsApp)", () => {
    // "030 12345678-100" → nach Ziffernfilter: 03012345678100 (14 Ziffern)
    // → mit Ländercode 49: 493012345678100 (15 Ziffern, maximal E.164, aber zu lang für deutsche Nummer)
    // Durchwahlen sind hier die 100 am Ende, die Nummer selbst wird nicht richtig erkannt.
    expect(waLink("030 12345678-100")).toBeNull();
  });

  it("akzeptiert echte kurze Berliner Festnetznummern", () => {
    // "030 123456" → nach Ziffernfilter: 030123456 (9 Ziffern)
    // → normiert: 49 + 30123456 = 4930123456 (10 Ziffern)
    // Das ist real: Berliner Vorwahl 030 (2 Ziffern), 6-stellige Rufnummer.
    // Deutsche Nummern: 9–13 Ziffern nach Normalisierung erlaubt.
    expect(waLink("030 123456")).toBe("https://wa.me/4930123456");
  });

  it("akzeptiert echte kurze Münchner Festnetznummern", () => {
    // "089 12345" → nach Ziffernfilter: 08912345 (8 Ziffern)
    // → normiert: 49 + 8912345 = 498912345 (9 Ziffern)
    // Das ist real: Münchner Vorwahl 089 (3 Ziffern), 5-stellige Rufnummer.
    // Deutsche Nummern: 9–13 Ziffern nach Normalisierung erlaubt.
    expect(waLink("089 12345")).toBe("https://wa.me/498912345");
  });

  it("deutet die doppelte Null vor einer Mobilnummer als Tippfehler, nicht als Ausland", () => {
    // "00170 1234567" → nach Ziffernfilter: 001701234567 (12 Ziffern)
    // → nach 00-Strippen: 1701234567 (10 Ziffern).
    // Frueher galt das als Auslandsnummer und ergab einen Link auf eine
    // nordamerikanisch aussehende FREMDE Nummer – genau das, was der
    // Dateikopf ausschliessen will. Es gibt keinen Laendercode 15/16/17;
    // zehnstellig und mit einer deutschen Mobilvorwahl beginnend ist das
    // fast sicher "0170 1234567" mit einer Null zu viel.
    expect(waLink("00170 1234567")).toBe("https://wa.me/491701234567");
    expect(waLink("00160 1234567")).toBe("https://wa.me/491601234567");
  });

  it("greift bewusst NUR bei genau zehn Ziffern", () => {
    // Eine elfstellige Restnummer ("00151 12345678") waere zwar auch als
    // deutsche Mobilnummer denkbar – aber genauso als nordamerikanische
    // Nummer (Laendercode 1 + zehn Ziffern). Bei Gleichstand gilt der
    // Dateikopf: im Zweifel die Nummer NICHT umdeuten.
    expect(waLink("00151 12345678")).toBe("https://wa.me/15112345678");
  });

  it("laesst echte Auslandsnummern nach dem 00-Strippen unangetastet", () => {
    // Wien-Mobil: "0043 664 1234567" → 436641234567 (12 Ziffern, beginnt mit 43).
    expect(waLink("0043 664 1234567")).toBe("https://wa.me/436641234567");
    // Nordamerika: "001 555 1234567" → 15551234567 (11 Ziffern) – die
    // Ausnahme greift nur bei GENAU zehn Ziffern.
    expect(waLink("001 555 1234567")).toBe("https://wa.me/15551234567");
  });

  it("akzeptiert gueltige 13-stellige internationale Nummern", () => {
    // "+49 170 12345678" → nach Ziffernfilter: 4917012345678 (13 Ziffern)
    // Das ist gültig: 49 (Ländercode) + 170 (Vorwahl) + 12345678 (8-stellig) = 13 total
    // Für deutsche Nummern ist das die Obergrenze (49 + 11 Ziffern ohne die führende 0)
    expect(waLink("+49 170 12345678")).toBe("https://wa.me/4917012345678");
  });
});

describe("telLink", () => {
  it("uebernimmt die Nummer unveraendert bis auf Leerzeichen", () => {
    expect(telLink("0170 1234567")).toBe("tel:01701234567");
  });

  it("gibt null zurueck ohne Nummer", () => {
    expect(telLink(null)).toBeNull();
    expect(telLink("  ")).toBeNull();
  });

  it("lehnt zu lange Nummern mit Durchwahl ab", () => {
    // "030 12345678-100" → nach Ziffernfilter: 03012345678100 (14 Ziffern)
    // Das sind 14 Ziffern für tel:, was noch unter E.164-Limit (15) liegt,
    // aber 03012345678100 ist keine gültige deutsche Nummer (Durchwahl ist getarnt).
    // Die 100 am Ende ist die Durchwahl, die tel: stumm mitdial würde.
    expect(telLink("030 12345678-100")).toBeNull();
  });

  it("akzeptiert gueltige 13-stellige deutsche Nummern", () => {
    // "0170 12345678" → nach Ziffernfilter: 017012345678 (12 Ziffern)
    // Das ist eine gültige deutsche Nummer (Vorwahl 170 mit 8-stelliger Anschluss)
    expect(telLink("0170 12345678")).toBe("tel:017012345678");
  });

  it("akzeptiert echte kurze Berliner Festnetznummern", () => {
    // "030 123456" → nach Ziffernfilter: 030123456 (9 Ziffern)
    // Das ist real: Berliner Vorwahl 030, 6-stellige Rufnummer.
    // Deutsche Nummern: 9–13 Ziffern erlaubt.
    expect(telLink("030 123456")).toBe("tel:030123456");
  });

  it("akzeptiert echte kurze Münchner Festnetznummern", () => {
    // "089 12345" → nach Ziffernfilter: 08912345 (8 Ziffern)
    // Das ist real: Münchner Vorwahl 089, 5-stellige Rufnummer.
    // Deutsche Nummern: 9–13 Ziffern erlaubt.
    expect(telLink("089 12345")).toBe("tel:08912345");
  });
});
