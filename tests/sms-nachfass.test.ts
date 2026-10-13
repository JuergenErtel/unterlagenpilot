import { describe, expect, it } from "vitest";
import { renderSmsNachfass, smsAngebotOffen, smsNachfassVars, websiteKurz } from "@/lib/kontakt/sms-nachfass";
import { DEFAULT_TEMPLATES, EDITABLE_TEMPLATES, templateKey } from "@/lib/messages/render";

const basis = { beraterName: "Jürgen Ertel" };

describe("smsNachfassVars", () => {
  it("nutzt Anrede und Nachnamen", () => {
    const v = smsNachfassVars({ ...basis, anrede: "frau", vorname: "Anna", nachname: "Müller" });
    expect(v.smsAnrede).toBe("Guten Tag Frau Müller,");
  });

  it("nimmt ohne Anrede den vollen Namen", () => {
    expect(smsNachfassVars({ ...basis, vorname: "Max", nachname: "Müller" }).smsAnrede).toBe("Guten Tag Max Müller,");
    expect(smsNachfassVars({ ...basis, anrede: "herr", vorname: "Max" }).smsAnrede).toBe("Guten Tag Max,");
  });

  it("grüßt ohne Namen neutral", () => {
    expect(smsNachfassVars({ ...basis, vorname: "  ", nachname: null }).smsAnrede).toBe("Guten Tag,");
  });

  it("nennt den Ort, sonst die PLZ, sonst nichts", () => {
    expect(smsNachfassVars({ ...basis, ort: "Leipzig", plz: "04109" }).objektOrt).toBe(" für eine Immobilie in Leipzig");
    expect(smsNachfassVars({ ...basis, ort: " ", plz: "04109" }).objektOrt).toBe(" für eine Immobilie in 04109");
    expect(smsNachfassVars({ ...basis }).objektOrt).toBe("");
  });

  it("setzt die Website in Klammern oder lässt sie weg", () => {
    expect(smsNachfassVars({ ...basis, website: "https://www.baufivergleicher.de/" }).beraterWebsite).toBe(" (baufivergleicher.de)");
    expect(smsNachfassVars({ ...basis, website: null }).beraterWebsite).toBe("");
    expect(smsNachfassVars({ ...basis }).beraterName).toBe("Jürgen Ertel");
  });
});

describe("websiteKurz", () => {
  it("entfernt Schema, www und Schrägstrich", () => {
    expect(websiteKurz("https://www.baufivergleicher.de/")).toBe("baufivergleicher.de");
    expect(websiteKurz("http://baufivergleicher.de")).toBe("baufivergleicher.de");
    expect(websiteKurz("www.baufivergleicher.de")).toBe("baufivergleicher.de");
    expect(websiteKurz("  ")).toBe("");
    expect(websiteKurz(undefined)).toBe("");
  });
});

describe("smsAngebotOffen", () => {
  const jetzt = new Date("2026-10-13T12:00:00Z");
  const vor = (stunden: number) => new Date(jetzt.getTime() - stunden * 3600_000);

  it("ist offen direkt nach einem erfolglosen Anruf", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(0.1) }], jetzt)).toBe(true);
  });

  it("schließt nach 12 Stunden", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(12) }], jetzt)).toBe(true);
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(12.01) }], jetzt)).toBe(false);
  });

  it("schließt, sobald danach eine SMS vermerkt ist", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
          { kind: "sms", ergebnis: null, createdAt: vor(0.5) },
        ],
        jetzt
      )
    ).toBe(false);
  });

  it("ist zu, wenn der letzte Vermerk erreicht oder WhatsApp war", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "erreicht", createdAt: vor(0.1) }], jetzt)).toBe(false);
    expect(
      smsAngebotOffen(
        [
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
          { kind: "whatsapp", ergebnis: "nicht_erreicht", createdAt: vor(0.5) },
        ],
        jetzt
      )
    ).toBe(false);
  });

  it("öffnet wieder beim nächsten erfolglosen Anruf nach einer SMS", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "sms", ergebnis: null, createdAt: vor(30) },
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
        ],
        jetzt
      )
    ).toBe(true);
  });

  it("ignoriert Notizen und andere Vermerke und hängt nicht an der Reihenfolge der Eingabe", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "notiz", ergebnis: null, createdAt: vor(0.1) },
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
        ],
        jetzt
      )
    ).toBe(true);
    expect(smsAngebotOffen([], jetzt)).toBe(false);
  });
});

describe("renderSmsNachfass", () => {
  const vorlage = DEFAULT_TEMPLATES[templateKey("nicht_erreicht", "sms")]?.body ?? "";

  it("ergibt den abgestimmten Text", () => {
    expect(
      renderSmsNachfass(vorlage, {
        anrede: "frau",
        nachname: "Müller",
        ort: "Leipzig",
        beraterName: "Jürgen Ertel",
        website: "https://www.baufivergleicher.de",
      })
    ).toBe(
      "Guten Tag Frau Müller, vielen Dank für Ihre Finanzierungsanfrage für eine Immobilie in Leipzig. " +
        "Ich habe Sie eben leider telefonisch nicht erreicht. Wann kann ich Sie am besten erreichen? " +
        "Viele Grüße, Jürgen Ertel (baufivergleicher.de)"
    );
  });

  it("bleibt ohne Name, Ort und Website ein ganzer Satz", () => {
    const text = renderSmsNachfass(vorlage, { beraterName: "Jürgen Ertel" });
    expect(text).toBe(
      "Guten Tag, vielen Dank für Ihre Finanzierungsanfrage. Ich habe Sie eben leider telefonisch nicht erreicht. " +
        "Wann kann ich Sie am besten erreichen? Viele Grüße, Jürgen Ertel"
    );
  });

  it("räumt doppelte Leerzeichen einer umformulierten Vorlage auf", () => {
    expect(renderSmsNachfass("  {{smsAnrede}}  hallo {{objektOrt}}  ", { beraterName: "X" })).toBe("Guten Tag, hallo");
  });

  it("ist in der Vorlagenverwaltung bearbeitbar", () => {
    expect(EDITABLE_TEMPLATES.some((t) => t.type === "nicht_erreicht" && t.channel === "sms")).toBe(true);
  });
});
