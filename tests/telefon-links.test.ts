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
});

describe("telLink", () => {
  it("uebernimmt die Nummer unveraendert bis auf Leerzeichen", () => {
    expect(telLink("0170 1234567")).toBe("tel:01701234567");
  });

  it("gibt null zurueck ohne Nummer", () => {
    expect(telLink(null)).toBeNull();
    expect(telLink("  ")).toBeNull();
  });
});
