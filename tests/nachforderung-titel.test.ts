import { describe, it, expect } from "vitest";
import { nachforderungTitel, nachforderungVorlage } from "@/lib/documents/nachforderung";

describe("nachforderungTitel", () => {
  it("nennt in der Nachforderung, warum die vorhandene Unterlage nicht reicht", () => {
    expect(
      nachforderungTitel({ name: "Wohnflächenberechnung", nachforderungGruende: ["Nicht bankkonform, Berechnung nach WoFlV erforderlich."] })
    ).toBe("Wohnflächenberechnung – vorhandene Fassung wird nicht anerkannt: Nicht bankkonform, Berechnung nach WoFlV erforderlich.");
  });

  it("laesst eine gewoehnlich fehlende Position unveraendert", () => {
    expect(nachforderungTitel({ name: "Personalausweis", nachforderungGruende: [] })).toBe("Personalausweis");
    expect(nachforderungTitel({ name: "Personalausweis" })).toBe("Personalausweis");
  });
});

describe("nachforderungVorlage", () => {
  it("belegt die Wohnflaechenberechnung mit dem haeufigsten Grund vor", () => {
    expect(nachforderungVorlage("wohnflaechenberechnung")).toMatch(/Wohnflächenverordnung/);
  });
  it("hat fuer jeden anderen Typ einen allgemeinen Satz mit Verb", () => {
    expect(nachforderungVorlage("expose")).toMatch(/nachreichen/);
    expect(nachforderungVorlage(null)).toMatch(/nachreichen/);
  });
});
