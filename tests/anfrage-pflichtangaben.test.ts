import { describe, expect, it } from "vitest";
import {
  fehlendeKontaktangaben,
  KONTAKT_SCHLUESSEL,
} from "@/lib/self-disclosure/pflichtangaben";

const vollstaendig = {
  [KONTAKT_SCHLUESSEL.nachname]: "Mustermann",
  [KONTAKT_SCHLUESSEL.email]: "max@example.de",
  [KONTAKT_SCHLUESSEL.telefon]: "0170 1234567",
};

describe("fehlendeKontaktangaben", () => {
  it("meldet nichts, wenn alles da ist", () => {
    expect(fehlendeKontaktangaben(vollstaendig)).toEqual([]);
  });

  it("meldet alle drei bei einem leeren Bogen", () => {
    expect(fehlendeKontaktangaben({})).toEqual(["nachname", "email", "telefon"]);
  });

  it("zaehlt Leerzeichen nicht als Angabe", () => {
    expect(fehlendeKontaktangaben({ ...vollstaendig, [KONTAKT_SCHLUESSEL.nachname]: "   " })).toEqual([
      "nachname",
    ]);
  });

  it("verlangt ein @ in der Adresse", () => {
    // Ohne diese Pruefung entstuende ein Fall mit einer Adresse, an die nie
    // etwas ankommt – und niemand merkt es.
    expect(fehlendeKontaktangaben({ ...vollstaendig, [KONTAKT_SCHLUESSEL.email]: "keine-adresse" })).toEqual([
      "email",
    ]);
  });

  it("liest die Angaben des ERSTEN Antragstellers", () => {
    // Die Personenschritte tragen das Praefix p1./p2. – wer das vergisst,
    // prueft ein Feld, das es nie gibt, und laesst jeden Bogen durch.
    expect(KONTAKT_SCHLUESSEL.nachname).toBe("p1.person_name.nachname");
    expect(KONTAKT_SCHLUESSEL.email).toBe("p1.person_kontakt.email");
  });
});
