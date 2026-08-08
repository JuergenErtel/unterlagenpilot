import { describe, it, expect } from "vitest";
import { CHECKLIST_TEMPLATES } from "@/lib/checklists/templates";

const alle = Object.values(CHECKLIST_TEMPLATES).flatMap((t) => t.items);

describe("Kundenhinweise je Unterlage", () => {
  it("erklaert jede kundensichtbare Position in ganzen Saetzen", () => {
    const duenn = alle
      .filter((i) => i.customerDescription.trim().length < 40)
      .map((i) => i.key);
    expect(duenn).toEqual([]);
  });

  it("nennt zu jeder kundensichtbaren Position ein Beispiel", () => {
    const ohne = alle.filter((i) => !i.example || i.example.trim().length === 0).map((i) => i.key);
    expect(ohne).toEqual([]);
  });

  it("sagt zu jeder Position auch, worauf zu achten ist", () => {
    // Der Grund der ganzen Task: "was gebraucht wird" allein reicht nicht –
    // ohne einen Hinweis auf Vollstaendigkeit/Aktualitaet/Lesbarkeit laedt der
    // Kunde z. B. nur eine Seite hoch und der Vermittler muss nachfassen.
    // Diese Marker kommen tatsaechlich in den formulierten Hinweisen vor
    // (nicht als exakte Phrasen, sondern als Wortstaemme, damit "beiden
    // Seiten", "alle Seiten" und "allen Anlagen" gleichermassen erkannt
    // werden) – anders als der vorherige Fachbegriffe-Test (der keinen der
    // gesuchten Begriffe je in einem Text findet und daher nie rot werden
    // konnte), faengt dieser Test echte Regressionen ab.
    const marker = ["seite", "vollständig", "aktuell", "lesbar", "anlage", "unterschrieben", "älter"];
    const ohneHinweis = alle
      .filter((i) => !marker.some((wort) => i.customerDescription.toLowerCase().includes(wort)))
      .map((i) => i.key);
    expect(ohneHinweis).toEqual([]);
  });
});
