import { describe, expect, it } from "vitest";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Schritt } from "@/lib/self-disclosure/types";

const SCHRITT: Schritt = {
  id: "probe",
  // Pflichtangabe seit Aufgabe 3 (siehe types.ts); fuer diesen Test ohne
  // Bedeutung, deshalb der neutrale Wert.
  umfang: "voll",
  abschnitt: "vorhaben",
  frage: "Testfrage",
  felder: [
    { id: "immer", label: "Immer da", typ: "text" },
    {
      id: "nur_kauf",
      label: "Nur beim Kauf",
      typ: "betrag",
      sichtbar: (a) => a["probe.art"] === "kauf",
    },
    {
      id: "nur_person2",
      label: "Nur fuer die zweite Person",
      typ: "text",
      sichtbar: (_a, person) => person === 2,
    },
  ],
};

describe("sichtbareFelder", () => {
  it("zeigt Felder ohne Bedingung immer", () => {
    expect(sichtbareFelder(SCHRITT, {}).map((f) => f.id)).toContain("immer");
  });

  it("haelt ein Feld zurueck, solange die Steuerantwort fehlt", () => {
    // Gleiche Regel wie bei den Schritten: Fehlt die Antwort, bleibt der
    // Zweig zu. Sonst zeigte der erste Bildschirm alles auf einmal.
    expect(sichtbareFelder(SCHRITT, {}).map((f) => f.id)).not.toContain("nur_kauf");
  });

  it("zeigt das Feld, sobald die Steuerantwort passt", () => {
    expect(sichtbareFelder(SCHRITT, { "probe.art": "kauf" }).map((f) => f.id)).toContain("nur_kauf");
  });

  it("reicht die Person an die Bedingung durch", () => {
    expect(sichtbareFelder(SCHRITT, {}, 1).map((f) => f.id)).not.toContain("nur_person2");
    expect(sichtbareFelder(SCHRITT, {}, 2).map((f) => f.id)).toContain("nur_person2");
  });

  it("behaelt die Reihenfolge des Katalogs bei", () => {
    const ids = sichtbareFelder(SCHRITT, { "probe.art": "kauf" }, 2).map((f) => f.id);
    expect(ids).toEqual(["immer", "nur_kauf", "nur_person2"]);
  });
});
