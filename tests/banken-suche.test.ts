import { describe, it, expect } from "vitest";
import { normalisiere, kanonisch, passtZurSuche } from "@/lib/banken/suche";

describe("Namenssuche", () => {
  it("loest Umlaute auf", () => {
    expect(normalisiere("München")).toBe("muenchen");
  });

  it("behandelt zerlegte Umlaute (u + Trema) wie zusammengesetzte", () => {
    expect(normalisiere("Fu\u0308rth")).toBe("fuerth");
    expect(passtZurSuche("VR Bank im su\u0308dlichen Franken", "südlichen")).toBe(true);
  });

  it("findet Umlautorte ueber die ae-Schreibweise", () => {
    expect(passtZurSuche("Sparkasse München", "muenchen")).toBe(true);
    expect(passtZurSuche("Sparkasse München", "münchen")).toBe(true);
  });

  it("ignoriert Gross- und Kleinschreibung", () => {
    expect(passtZurSuche("Berliner Sparkasse", "SPARKASSE")).toBe(true);
  });

  it("findet Teiltreffer mitten im Namen", () => {
    expect(passtZurSuche("VR-Bank Main-Rhön eG", "rhoen")).toBe(true);
  });

  it("liefert bei leerer Suche alles", () => {
    expect(passtZurSuche("Irgendeine Bank", "")).toBe(true);
    expect(passtZurSuche("Irgendeine Bank", "   ")).toBe(true);
  });

  it("schliesst Nichttreffer aus", () => {
    expect(passtZurSuche("1822direkt", "sparkasse")).toBe(false);
  });
});

/*
 * Europace fuehrt die Institute unter Kurzformen: 203 "Spk", 55 "KSK", 17 "SSK",
 * 93 "VoBa"/"Voba", 9 "VB", 24 "Raiba", 7 "RB", 22 "VR-Bank". Wer "Sparkasse
 * Westmuensterland" tippt, fand bis 08.09.2026 nichts – der Datensatz heisst
 * "Spk Westmuensterland".
 */
describe("Abkuerzungen der Institutsgruppen", () => {
  it("findet eine Spk ueber 'Sparkasse'", () => {
    expect(passtZurSuche("Spk Westmünsterland", "Sparkasse Westmünsterland")).toBe(true);
    expect(passtZurSuche("Spk Westmünsterland", "sparkasse westmuensterland")).toBe(true);
  });

  it("findet eine ausgeschriebene Sparkasse ueber 'Spk'", () => {
    expect(passtZurSuche("Berliner Sparkasse", "Berliner Spk")).toBe(true);
    expect(passtZurSuche("Erzgebirgssparkasse", "spk")).toBe(true);
  });

  it("findet KSK und SSK ueber Kreissparkasse / Stadtsparkasse – und ueber 'Sparkasse'", () => {
    expect(passtZurSuche("KSK Köln", "Kreissparkasse Köln")).toBe(true);
    expect(passtZurSuche("SSK Bocholt", "Stadtsparkasse Bocholt")).toBe(true);
    expect(passtZurSuche("KSK Köln", "Sparkasse Köln")).toBe(true);
    expect(passtZurSuche("Kreissparkasse Köln", "KSK Köln")).toBe(true);
  });

  it("findet VoBa, VB und Volksbank gegenseitig", () => {
    expect(passtZurSuche("VoBa Westmünsterland", "Volksbank Westmünsterland")).toBe(true);
    expect(passtZurSuche("Voba Franken", "volksbank franken")).toBe(true);
    expect(passtZurSuche("VB Viersen", "Volksbank Viersen")).toBe(true);
    expect(passtZurSuche("Volksbank Nottuln eG", "VoBa Nottuln")).toBe(true);
  });

  it("findet Raiba und RB ueber Raiffeisenbank", () => {
    expect(passtZurSuche("Raiba Eifel", "Raiffeisenbank Eifel")).toBe(true);
    expect(passtZurSuche("RB im Kreis Calw", "Raiffeisenbank im Kreis Calw")).toBe(true);
    expect(passtZurSuche("Raiffeisenbank Isar-Loisachtal", "raiba isar")).toBe(true);
  });

  it("nimmt VR-Bank, VR Bank und VRB als dasselbe", () => {
    expect(passtZurSuche("VR-Bank Main-Rhön eG", "VR Bank Main Rhön")).toBe(true);
    expect(passtZurSuche("VRB Neckar", "VR-Bank Neckar")).toBe(true);
  });

  it("ersetzt Kurzformen nur als ganzes Wort", () => {
    // "rb" steckt in "Herborn", "vb" in "Havbach" – das darf nicht zu
    // "Raiffeisenbank" bzw. "Volksbank" werden.
    expect(kanonisch("Herborn")).toBe("herborn");
    expect(passtZurSuche("Sparkasse Herborn", "raiffeisenbank")).toBe(false);
  });

  it("laesst echte Nichttreffer weiter aussen vor", () => {
    expect(passtZurSuche("1822direkt", "sparkasse")).toBe(false);
    expect(passtZurSuche("Spk Aachen", "sparkasse westmuensterland")).toBe(false);
  });
});

