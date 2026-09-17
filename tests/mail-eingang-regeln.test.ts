import { describe, it, expect } from "vitest";
import {
  absenderAdresse,
  brauchbareAnhaenge,
  anhangName,
  MAX_ANHAENGE_JE_MAIL,
  istAnAdressiert,
} from "@/lib/eingang/mail-regeln";

/**
 * Die Regeln des Mail-Eingangs. Bewusst reine Funktionen: Was eine
 * weitergeleitete Kundenmail mitbringt, laesst sich so ohne Postfach pruefen.
 */

describe("absenderAdresse", () => {
  it("zieht die Adresse aus einem Kopf mit Anzeigenamen", () => {
    expect(absenderAdresse('Jürgen Ertel <Juergen.Ertel@GMX.de>')).toBe("juergen.ertel@gmx.de");
  });

  it("nimmt eine nackte Adresse", () => {
    expect(absenderAdresse("  info@codingbrothers.de ")).toBe("info@codingbrothers.de");
  });

  it("antwortet null, wenn nichts Brauchbares dasteht", () => {
    expect(absenderAdresse(undefined)).toBeNull();
    expect(absenderAdresse("")).toBeNull();
    expect(absenderAdresse("Kein Absender")).toBeNull();
  });

  it("nimmt nur die erste Adresse, wenn mehrere dastehen", () => {
    expect(absenderAdresse("a@example.com, b@example.com")).toBe("a@example.com");
  });
});

describe("brauchbareAnhaenge", () => {
  const anhang = (o: Partial<Record<string, unknown>> = {}) => ({
    filename: "gehalt.pdf",
    contentType: "application/pdf",
    content: Buffer.alloc(40_000, 1),
    related: false,
    ...o,
  });

  it("nimmt eine angehaengte PDF", () => {
    expect(brauchbareAnhaenge([anhang()])).toHaveLength(1);
  });

  it("laesst eingebettete Bilder liegen (Signatur, Briefkopf)", () => {
    // `related: true` setzt mailparser fuer alles, worauf der HTML-Teil per
    // cid: verweist - das ist nie eine Unterlage, sondern das Firmenlogo.
    expect(brauchbareAnhaenge([anhang({ related: true, contentType: "image/png" })])).toHaveLength(0);
  });

  it("laesst winzige Bilder liegen, auch ohne cid-Verweis", () => {
    // Zaehlpixel und Logos kommen auch als normaler Anhang. Eine echte
    // Unterlage - abfotografiert oder gescannt - ist nie 4 KB klein.
    expect(
      brauchbareAnhaenge([anhang({ contentType: "image/gif", content: Buffer.alloc(4_000) })])
    ).toHaveLength(0);
  });

  it("behaelt eine kleine PDF - nur Bilder werden nach Groesse gewogen", () => {
    expect(brauchbareAnhaenge([anhang({ content: Buffer.alloc(4_000) })])).toHaveLength(1);
  });

  it("wirft leere Teile weg", () => {
    expect(brauchbareAnhaenge([anhang({ content: Buffer.alloc(0) })])).toHaveLength(0);
  });

  it("deckelt die Zahl je Mail", () => {
    const viele = Array.from({ length: MAX_ANHAENGE_JE_MAIL + 5 }, () => anhang());
    expect(brauchbareAnhaenge(viele)).toHaveLength(MAX_ANHAENGE_JE_MAIL);
  });
});

describe("anhangName", () => {
  it("nimmt den Namen aus der Mail", () => {
    expect(anhangName("Gehalt März.pdf", "application/pdf", 0)).toBe("Gehalt März.pdf");
  });

  it("erfindet einen Namen, wenn keiner dasteht - je Anhang einen eigenen", () => {
    const a = anhangName(undefined, "image/jpeg", 0);
    const b = anhangName(undefined, "image/jpeg", 1);
    expect(a).toMatch(/^mail_\d{14}\.jpg$/);
    expect(b).toMatch(/^mail_\d{14}-2\.jpg$/);
    expect(a).not.toBe(b);
  });

  it("haengt eine Endung an, wenn der Name keine hat", () => {
    expect(anhangName("Scan", "application/pdf", 0)).toBe("Scan.pdf");
  });
});

describe("istAnAdressiert", () => {
  const ZIEL = "unterlagen@baufidesk.de";

  it("erkennt die Adresse im Empfängerfeld", () => {
    expect(istAnAdressiert(["Unterlagen <Unterlagen@BaufiDesk.de>"], ZIEL)).toBe(true);
  });

  it("erkennt sie neben anderen Empfängern", () => {
    expect(istAnAdressiert(["kunde@example.com", "unterlagen@baufidesk.de"], ZIEL)).toBe(true);
  });

  it("weist eine Mail ab, die an eine andere Adresse desselben Postfachs ging", () => {
    // Der entscheidende Fall: Der Alias liegt auf dem Sammelpostfach
    // webmaster@. Post an webmaster@ geht uns nichts an - wir duerfen sie
    // nicht einmal als gelesen markieren.
    expect(istAnAdressiert(["webmaster@baufidesk.de"], ZIEL)).toBe(false);
  });

  it("weist eine Mail ohne Empfängerangabe ab", () => {
    expect(istAnAdressiert([], ZIEL)).toBe(false);
  });

  it("lässt sich nicht von einem Präfix täuschen", () => {
    expect(istAnAdressiert(["nicht-unterlagen@baufidesk.de"], ZIEL)).toBe(false);
  });
});
