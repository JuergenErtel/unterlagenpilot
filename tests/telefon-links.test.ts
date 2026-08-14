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

  it("lehnt zu kurze Nummern nach 00-Normalisierung ab", () => {
    // "00170 1234567" → nach Ziffernfilter: 001701234567 (12 Ziffern)
    // → nach 00-Strippen: 1701234567 (10 Ziffern)
    // 10 Ziffern sind zu kurz für eine internationale Nummer (Minimum E.164: 11)
    expect(waLink("00170 1234567")).toBeNull();
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
});
