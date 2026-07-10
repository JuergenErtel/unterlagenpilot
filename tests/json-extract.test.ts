import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai/json-extract";

describe("extractJson", () => {
  it("parst direkt gültiges JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parst JSON aus einem Codeblock", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("findet JSON hinter erklärendem Vorspann", () => {
    expect(extractJson('Hier das Ergebnis:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("ignoriert geschweifte Klammern INNERHALB von Strings", () => {
    // Regression: der Klammer-Scan zählte "}" im String-Wert mit und schnitt das
    // Objekt zu früh ab – gültige KI-Antworten schlugen fehl.
    const text = 'Antwort:\n{"notiz": "Gewinn }2023 gestiegen", "wert": 42}';
    expect(extractJson(text)).toEqual({ notiz: "Gewinn }2023 gestiegen", wert: 42 });
  });

  it("behandelt escapte Anführungszeichen korrekt", () => {
    const text = 'Text davor {"zitat": "er sagte \\"} fertig\\"", "n": 1} Text danach';
    expect(extractJson(text)).toEqual({ zitat: 'er sagte "} fertig"', n: 1 });
  });

  it("kommt mit verschachtelten Objekten zurecht", () => {
    const text = 'Vorspann {"a": {"b": {"c": "}}"}}, "d": 2}';
    expect(extractJson(text)).toEqual({ a: { b: { c: "}}" } }, d: 2 });
  });

  it("wirft, wenn kein JSON enthalten ist", () => {
    expect(() => extractJson("nur Text")).toThrow();
  });
});
