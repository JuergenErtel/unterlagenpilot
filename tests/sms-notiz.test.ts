import { describe, it, expect } from "vitest";
import { notizAnhaengen, smsNotizZeile } from "@/lib/kontakt/sms-nachfass";

describe("smsNotizZeile", () => {
  it("nennt Datum, deutsche Uhrzeit, Empfänger und Text", () => {
    const z = smsNotizZeile(new Date("2026-10-16T07:52:00Z"), "+49 170 1234567", "Hallo");
    expect(z).toBe("SMS verschickt am 16.10.2026 um 09:52 Uhr an +49 170 1234567:\n„Hallo“");
  });
  it("kommt ohne Empfänger und Text aus", () => {
    expect(smsNotizZeile(new Date("2026-01-05T12:00:00Z"), null, " ")).toBe("SMS verschickt am 05.01.2026 um 13:00 Uhr.");
  });
});

describe("notizAnhaengen", () => {
  it("hängt mit Leerzeile an", () => {
    expect(notizAnhaengen("alt\n\n", "neu", 100)).toBe("alt\n\nneu");
  });
  it("füllt einen leeren Block", () => {
    expect(notizAnhaengen(null, "neu", 100)).toBe("neu");
  });
  it("lässt einen vollen Block in Ruhe", () => {
    expect(notizAnhaengen("x".repeat(98), "neu", 100)).toBeNull();
  });
});
