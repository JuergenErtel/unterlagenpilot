import { describe, it, expect } from "vitest";
import { followUpsFor, LAST_RULES } from "@/lib/detektiv/rules";
import type { DocReference } from "@/lib/detektiv/types";

const ref = (over: Partial<DocReference>): DocReference => ({
  kind: "last",
  label: "",
  urkundeDatum: null,
  urkundenNummer: null,
  notar: null,
  abteilung: null,
  laufendeNummer: null,
  sourcePage: 1,
  sourceQuote: "Zitat",
  confidence: 0.9,
  ...over,
});

describe("Folgeregel-Katalog – Bestandsverzeichnis", () => {
  it("macht aus jedem Nachtrag eine eigene Position mit Datum und Nummer im Titel", () => {
    const out = followUpsFor(
      ref({
        kind: "nachtrag",
        label: "2. Nachtrag zur Teilungserklärung",
        urkundeDatum: "2011-08-11",
        urkundenNummer: "789/2011",
      }),
      "grundbuchauszug"
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("referenz_fehlt");
    expect(out[0]!.resolution).toBe("neue_position");
    expect(out[0]!.documentType).toBe("teilungserklaerung");
    expect(out[0]!.title).toContain("2. Nachtrag zur Teilungserklärung");
    expect(out[0]!.title).toContain("11.08.2011");
    expect(out[0]!.title).toContain("789/2011");
  });

  it("erzeugt fuer die Bezugsurkunde Teilungserklaerung eine Position", () => {
    const out = followUpsFor(
      ref({ kind: "bezugsurkunde", label: "Teilungserklärung", urkundeDatum: "1998-03-12" }),
      "grundbuchauszug"
    );
    expect(out[0]!.documentType).toBe("teilungserklaerung");
  });

  it("erzeugt fuer erwaehnte Anlagen einen anlage_fehlt-Befund", () => {
    const out = followUpsFor(ref({ kind: "anlage", label: "Aufteilungsplan" }), "teilungserklaerung");
    expect(out[0]!.code).toBe("anlage_fehlt");
    expect(out[0]!.resolution).toBe("neue_position");
  });
});

describe("Folgeregel-Katalog – Abteilung II", () => {
  it("Erbbaurecht verlangt Vertrag UND Beleihungszustimmung", () => {
    const out = followUpsFor(ref({ label: "Erbbaurecht", abteilung: "II" }), "grundbuchauszug");
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/Erbbaurechtsvertrag/);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/Zustimmung/);
    expect(out.every((f) => f.code === "folgeunterlage_noetig")).toBe(true);
  });

  it("Sanierungsvermerk verlangt die Genehmigung nach Paragraf 144 BauGB", () => {
    const out = followUpsFor(ref({ label: "Sanierungsvermerk", abteilung: "II" }), "grundbuchauszug");
    expect(out[0]!.reason).toContain("144");
  });

  it("Wegerecht ist ein reiner Hinweis ohne Unterlage", () => {
    const out = followUpsFor(ref({ label: "Geh- und Fahrtrecht", abteilung: "II" }), "grundbuchauszug");
    expect(out).toHaveLength(1);
    expect(out[0]!.hinweisOnly).toBe(true);
    expect(out[0]!.documentType).toBeNull();
  });

  it("Nießbrauch und Wohnrecht verlangen Loeschungsbewilligung oder Bewertung", () => {
    for (const label of ["Nießbrauch", "Wohnungsrecht"]) {
      const out = followUpsFor(ref({ label, abteilung: "II" }), "grundbuchauszug");
      expect(out.length, label).toBeGreaterThan(0);
      expect(out[0]!.hinweisOnly, label).toBe(false);
    }
  });

  it("ignoriert eine unbekannte Last, statt etwas zu erfinden", () => {
    expect(
      followUpsFor(ref({ label: "Irgendwas Unbekanntes", abteilung: "II" }), "grundbuchauszug")
    ).toEqual([]);
  });
});

describe("Folgeregel-Katalog – Abteilung III", () => {
  it("jede Grundschuld verlangt eine Lastenfreistellung", () => {
    const out = followUpsFor(
      ref({ kind: "grundpfandrecht", label: "Grundschuld 250.000 EUR Sparkasse", abteilung: "III" }),
      "grundbuchauszug"
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toMatch(/Lastenfreistellung|Löschungsbewilligung/);
  });
});

describe("Folgeregel-Katalog – Kaufvertrag und WEG", () => {
  it("Bautraegervertrag zieht vier Unterlagen nach", () => {
    const out = followUpsFor(ref({ kind: "last", label: "Bauträgervertrag" }), "kaufvertragsentwurf");
    expect(out).toHaveLength(4);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/MaBV/);
  });

  it("beschlossene Sonderumlage verlangt den Beschluss", () => {
    const out = followUpsFor(ref({ kind: "last", label: "Sonderumlage" }), "weg_protokoll");
    expect(out[0]!.code).toBe("folgeunterlage_noetig");
  });
});

describe("Katalog-Hygiene", () => {
  it("hat eindeutige Regelschluessel", () => {
    const keys = LAST_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("jede Folge hat einen kundentauglichen Titel ohne interne Kuerzel", () => {
    for (const r of LAST_RULES) {
      for (const f of r.requires) {
        expect(f.title, r.key).not.toMatch(/[a-z]+_[a-z]+/);
        expect(f.title.length, r.key).toBeGreaterThan(5);
      }
    }
  });
});
