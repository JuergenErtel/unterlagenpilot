import { describe, it, expect } from "vitest";
import { bereinigeHtml } from "@/lib/banken/bereinigen";

describe("HTML-Bereinigung – was durchkommt", () => {
  it("behaelt erlaubte Auszeichnung", () => {
    const r = bereinigeHtml("<p>Ein <strong>wichtiger</strong> Hinweis.</p>");
    expect(r).toContain("<p>");
    expect(r).toContain("<strong>");
    expect(r).toContain("wichtiger");
  });

  it("behaelt Listen", () => {
    const r = bereinigeHtml("<ul><li>eins</li><li>zwei</li></ul>");
    expect(r).toContain("<ul>");
    expect(r).toContain("<li>");
  });

  it("laesst reinen Text unveraendert", () => {
    expect(bereinigeHtml("Nur Text ohne Auszeichnung")).toBe("Nur Text ohne Auszeichnung");
  });
});

describe("HTML-Bereinigung – was NICHT durchkommt", () => {
  it("entfernt Skripte samt Inhalt", () => {
    const r = bereinigeHtml('<p>Hallo</p><script>alert("xss")</script>');
    expect(r).not.toMatch(/script/i);
    expect(r).not.toContain("alert");
    expect(r).toContain("Hallo");
  });

  it("entfernt Ereignis-Attribute", () => {
    const r = bereinigeHtml('<p onclick="stehlen()">Text</p>');
    expect(r).not.toMatch(/onclick/i);
    expect(r).toContain("Text");
  });

  it("entfernt Bilder mit onerror", () => {
    const r = bereinigeHtml('<img src=x onerror="alert(1)">');
    expect(r).not.toMatch(/img|onerror|alert/i);
  });

  it("entfernt Verweise – auch harmlos aussehende", () => {
    const r = bereinigeHtml('<a href="https://example.com">Klick</a>');
    expect(r).not.toMatch(/<a[\s>]/i);
    expect(r).toContain("Klick");
  });

  it("entfernt style-Attribute und iframes", () => {
    const r = bereinigeHtml('<p style="position:fixed">A</p><iframe src="x"></iframe>');
    expect(r).not.toMatch(/style=|iframe/i);
    expect(r).toContain("A");
  });

  it("kommt mit leerer und fehlender Eingabe zurecht", () => {
    expect(bereinigeHtml("")).toBe("");
    expect(bereinigeHtml(null as unknown as string)).toBe("");
  });
});
