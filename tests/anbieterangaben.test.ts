import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ANBIETER, ANBIETER_ZEILE } from "@/lib/legal/anbieter";

/**
 * Waechter gegen die Abweichung, die es schon einmal gab: Anschrift und
 * Kontaktadresse standen in Impressum, AGB, Datenschutzerklaerung und AVV
 * ausgeschrieben – und die drei Rechtstexte nannten den Ort verkuerzt als
 * "76744 Woerth", waehrend im Handelsregister "Woerth am Rhein" steht.
 *
 * Kein Test der Rechtstexte selbst, sondern ihrer EINEN Quelle.
 */
const RECHTSSEITEN = ["agb", "datenschutz", "avv", "impressum"];

function seiteLesen(name: string): string {
  return readFileSync(join(process.cwd(), "src", "app", name, "page.tsx"), "utf-8");
}

describe("Anbieterangaben", () => {
  it("nennen den Ort so, wie er im Register steht", () => {
    expect(ANBIETER.ort).toBe("76744 Wörth am Rhein");
    expect(ANBIETER_ZEILE).toContain(ANBIETER.firma);
    expect(ANBIETER_ZEILE).toContain(ANBIETER.strasse);
    expect(ANBIETER_ZEILE).toContain(ANBIETER.ort);
  });

  it("stehen in keiner Rechtsseite ausgeschrieben", () => {
    for (const name of RECHTSSEITEN) {
      const quelle = seiteLesen(name);
      expect(quelle, `${name}: Postleitzahl ausgeschrieben`).not.toMatch(/76744/);
      expect(quelle, `${name}: Strasse ausgeschrieben`).not.toMatch(/Ottstr/);
      expect(quelle, `${name}: E-Mail ausgeschrieben`).not.toMatch(/info@codingbrothers/);
    }
  });

  it("werden von jeder Rechtsseite aus der gemeinsamen Quelle gelesen", () => {
    // Sonst wäre der Test oben auch dann grün, wenn eine Seite die Angaben
    // schlicht gar nicht mehr nennt.
    for (const name of RECHTSSEITEN) {
      expect(seiteLesen(name), `${name}`).toContain("@/lib/legal/anbieter");
    }
  });

  it("führen die Impressumspflicht-Angaben, die § 5 DDG verlangt", () => {
    expect(ANBIETER.register).toMatch(/HRB/);
    expect(ANBIETER.vertreten).toBeTruthy();
    expect(ANBIETER.email).toMatch(/@/);
  });

  it("machen aus der Impressumsseite keine Seite hinter dem Gate", () => {
    // Eine Impressumspflicht läuft ins Leere, wenn die Seite ein Passwort
    // verlangt (§ 5 DDG: "leicht erkennbar, unmittelbar erreichbar").
    const middleware = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf-8");
    expect(middleware).toContain('"/impressum"');
  });
});

describe("Rechtsseiten", () => {
  it("verweisen aufs Impressum, statt die vollen Angaben zu wiederholen", () => {
    for (const name of ["agb", "datenschutz"]) {
      expect(seiteLesen(name), `${name}`).toContain('href="/impressum"');
    }
  });

  it("sind vollständig – jede erwartete Seite existiert", () => {
    const vorhanden = readdirSync(join(process.cwd(), "src", "app")).filter((e) =>
      statSync(join(process.cwd(), "src", "app", e)).isDirectory()
    );
    for (const name of RECHTSSEITEN) expect(vorhanden).toContain(name);
  });
});
