import { describe, it, expect } from "vitest";
import { statusAnzeige, BEKANNTE_STATUS } from "@/lib/banken/status";

describe("Statusanzeige", () => {
  it("kennt genau fuenf Werte", () => {
    expect(BEKANNTE_STATUS).toHaveLength(5);
  });

  it("stellt eine Ablehnung als Blocker dar", () => {
    const a = statusAnzeige("NICHT_MACHBAR");
    expect(a.ton).toBe("blocker");
    expect(a.label).toMatch(/nicht machbar/i);
    expect(a.istUrteil).toBe(true);
  });

  it("stellt einen Vorbehalt als Pruefpunkt dar", () => {
    expect(statusAnzeige("VORBEHALTLICH").ton).toBe("review");
  });

  it("stellt Machbarkeit als bereit dar", () => {
    expect(statusAnzeige("MACHBAR").ton).toBe("ready");
  });

  it("behandelt Information als neutral und NICHT als Urteil", () => {
    const a = statusAnzeige("INFORMATION");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
  });

  it("beschriftet 'Keine Angabe' als fehlende Aeusserung, nicht als Ablehnung", () => {
    const a = statusAnzeige("KEINE_ANGABE");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
    expect(a.label).toMatch(/nicht geäußert|keine Angabe/i);
    expect(a.label).not.toMatch(/nicht machbar|abgelehnt/i);
  });

  it("stuerzt bei einem unbekannten sechsten Wert nicht ab", () => {
    const a = statusAnzeige("VIELLEICHT_IRGENDWANN");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
    expect(a.label.length).toBeGreaterThan(0);
  });
});
