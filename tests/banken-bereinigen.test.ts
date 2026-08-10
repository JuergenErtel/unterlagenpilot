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

/**
 * Diese Faelle stammen aus einem Sicherheitsbefund: Ein Bereiniger, der nur
 * EINMAL ueber die Zeichenkette laeuft und Tags loescht, kann zwei Reste zu
 * einem neuen, lebenden Tag verkleben. Deshalb wird jedes "<", das keinen
 * erlaubten Tag eroeffnet, zu "&lt;" – dann gibt es nichts zu verkleben.
 */
describe("HTML-Bereinigung – Umgehungsversuche", () => {
  it("verklebt keine Reste zu einem neuen Tag", () => {
    const r = bereinigeHtml("<<div>img src=x onerror=alert(1)>");
    expect(r).not.toMatch(/<img/i);
    expect(r).not.toMatch(/<[a-z]/i);
  });

  it("verklebt auch bei geschachtelten Resten nicht", () => {
    const r = bereinigeHtml("<<p>script>alert(1)</<p>script>");
    expect(r).not.toMatch(/<script/i);
  });

  it("laesst kein rohes < stehen, das ein Tag eroeffnen koennte", () => {
    for (const roh of ["a < b", "<x<img src=x onerror=alert(1)>", "<<<img src=x>"]) {
      const r = bereinigeHtml(roh);
      expect(r).not.toMatch(/<(?!\/?(p|br|ul|ol|li|strong|em|b|i)>)/i);
    }
  });

  it("laesst sich nicht durch ein > im Attributwert austricksen", () => {
    const r = bereinigeHtml('<img alt="harmlos>" onerror="alert(1)">Text');
    expect(r).not.toMatch(/onerror|alert/i);
    expect(r).toContain("Text");
  });

  it("entfernt unvollstaendige gefaehrliche Tags am Ende", () => {
    expect(bereinigeHtml("Text <script src=//boese.example/x.js")).not.toMatch(/script/i);
    expect(bereinigeHtml("Text <script>alert(1)")).not.toMatch(/script|alert/i);
  });

  it("entfernt svg und math samt Inhalt", () => {
    const r = bereinigeHtml("<svg><desc><p>drin</p></desc></svg>nachher");
    expect(r).not.toMatch(/svg|desc|drin/i);
    expect(r).toContain("nachher");
  });

  it("entfernt Kommentare und Verarbeitungsanweisungen", () => {
    expect(bereinigeHtml("A<!-- <script>alert(1)</script> -->B")).toBe("AB");
    expect(bereinigeHtml("A<!DOCTYPE html>B")).toBe("AB");
  });

  it("behaelt erlaubte Tags auch mit Attributen, aber ohne die Attribute", () => {
    const r = bereinigeHtml('<p class="ck" style="x">Text</p>');
    expect(r).toBe("<p>Text</p>");
  });

  it("erzeugt bei mehrfacher Anwendung nichts Neues", () => {
    const einmal = bereinigeHtml("<<div>img src=x onerror=alert(1)>");
    expect(bereinigeHtml(einmal)).toBe(einmal);
  });
});
