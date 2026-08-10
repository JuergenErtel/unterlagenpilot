import { describe, it, expect } from "vitest";
import {
  GRUNDERWERBSTEUER,
  GRESt_STAND,
  bundeslandAusPlzOrt,
} from "@/lib/machbarkeit/bundesland";

describe("Grunderwerbsteuersaetze", () => {
  it("kennt alle 16 Bundeslaender", () => {
    expect(Object.keys(GRUNDERWERBSTEUER)).toHaveLength(16);
  });

  it("liegt ueberall im gesetzlich moeglichen Rahmen", () => {
    for (const [land, satz] of Object.entries(GRUNDERWERBSTEUER)) {
      expect(satz, land).toBeGreaterThanOrEqual(3.5);
      expect(satz, land).toBeLessThanOrEqual(6.5);
    }
  });

  it("nennt einen Stand – Saetze aendern sich per Landesgesetz", () => {
    expect(GRESt_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("hat fuer Bayern den bundesweit niedrigsten Satz", () => {
    expect(GRUNDERWERBSTEUER.bayern).toBe(3.5);
  });
});

describe("Bundesland aus PLZ und Ort", () => {
  it("erkennt eine eindeutige PLZ sicher", () => {
    expect(bundeslandAusPlzOrt("80331", "München")).toEqual({ bundesland: "bayern", sicher: true });
  });

  it("erkennt Berlin", () => {
    expect(bundeslandAusPlzOrt("10115", "Berlin")?.bundesland).toBe("berlin");
  });

  it("loest eine grenzueberschreitende PLZ ueber den Ort auf", () => {
    // 65391 laeuft ueber die Landesgrenze: Lorch liegt in Hessen,
    // Sauerthal in Rheinland-Pfalz.
    expect(bundeslandAusPlzOrt("65391", "Lorch")?.bundesland).toBe("hessen");
    expect(bundeslandAusPlzOrt("65391", "Sauerthal")?.bundesland).toBe("rheinland_pfalz");
  });

  it("meldet unsicher, wenn die PLZ mehrdeutig ist und der Ort nicht hilft", () => {
    expect(bundeslandAusPlzOrt("65391", null)?.sicher).toBe(false);
    expect(bundeslandAusPlzOrt("65391", "Irgendwo")?.sicher).toBe(false);
  });

  it("ordnet Hamburger Stadtteile Hamburg zu, Nachbarorte aber nicht", () => {
    // Die Quelle fuehrt Hamburger Stadtteile faelschlich unter Schleswig-Holstein.
    expect(bundeslandAusPlzOrt("21039", "Hamburg Bergedorf")?.bundesland).toBe("hamburg");
    expect(bundeslandAusPlzOrt("21039", "Börnsen")?.bundesland).toBe("schleswig_holstein");
  });

  it("liefert null bei fehlender PLZ – lieber nichts als geraten", () => {
    expect(bundeslandAusPlzOrt(null, "München")).toBeNull();
    expect(bundeslandAusPlzOrt("", "München")).toBeNull();
    expect(bundeslandAusPlzOrt("803", "München")).toBeNull();
  });

  it("ignoriert Leerzeichen und Schreibweise des Orts", () => {
    expect(bundeslandAusPlzOrt("34346", "  hann. münden ")?.bundesland).toBe("niedersachsen");
  });
});
