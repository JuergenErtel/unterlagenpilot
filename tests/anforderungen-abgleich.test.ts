import { describe, it, expect } from "vitest";
import { gleicheAb, zaehle, type AbgleichAnforderung } from "@/lib/anforderungen/abgleich";
import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

const position = (
  key: string,
  name: string,
  documentType: ResolvedChecklistItem["documentType"]
): ResolvedChecklistItem => ({
  key,
  name,
  customerDescription: name,
  documentType,
  level: "zwingend",
  scope: "allgemein",
  platforms: ["europace"],
  status: "offen",
  matchedDocuments: 0,
  customerVisible: true,
  effectiveRequiredCount: 1,
});

const anforderung = (
  id: string,
  bezeichnung: string,
  documentType: AbgleichAnforderung["documentType"],
  extra: Partial<AbgleichAnforderung> = {}
): AbgleichAnforderung => ({
  id,
  bezeichnung,
  documentType,
  liegtVor: false,
  ausgeblendet: false,
  ...extra,
});

describe("Abgleich", () => {
  it("erkennt eine Deckung ueber den Dokumenttyp", () => {
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis")],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.perso" });
  });

  it("erkennt eine Deckung ueber den Namen, wenn kein Dokumenttyp da ist", () => {
    const b = gleicheAb(
      [anforderung("r1", "Grundbuchauszug", null)],
      [position("tpl.gb", "Grundbuchauszug", null)]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.gb" });
  });

  it("gleicht Namen unabhaengig von Umlauten und Grossschreibung ab", () => {
    const b = gleicheAb(
      [anforderung("r1", "TEILUNGSERKLAERUNG", null)],
      [position("tpl.te", "Teilungserklärung", null)]
    );
    expect(b.some((x) => x.art === "deckt_sich")).toBe(true);
  });

  it("meldet eine Anforderung ohne Gegenstueck als neu", () => {
    const b = gleicheAb(
      [anforderung("r1", "Nachweis Eigenkapital", "eigenkapitalnachweis")],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "neu", anforderungId: "r1" });
  });

  it("meldet unsere Position ohne Gegenstueck, loescht sie aber nicht", () => {
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis")],
      [
        position("tpl.perso", "Personalausweis", "personalausweis"),
        position("tpl.gb", "Grundbuchauszug", "grundbuchauszug"),
      ]
    );
    expect(b).toContainEqual({ art: "bank_verlangt_nicht", positionKey: "tpl.gb" });
  });

  it("ueberspringt Ausgeblendetes vollstaendig", () => {
    const b = gleicheAb(
      [anforderung("r1", "Irgendwas", null, { ausgeblendet: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b.some((x) => "anforderungId" in x && x.anforderungId === "r1")).toBe(false);
  });

  it("macht aus liegtVor keine offene Position", () => {
    const b = gleicheAb(
      [anforderung("r1", "Nachweis Eigenkapital", "eigenkapitalnachweis", { liegtVor: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "erledigt", anforderungId: "r1" });
    expect(b.some((x) => x.art === "neu")).toBe(false);
  });

  it("laesst liegtVor am Abgleich teilnehmen", () => {
    // Sonst truege unsere Position faelschlich "verlangt die Bank nicht".
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis", { liegtVor: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.perso" });
    expect(b.some((x) => x.art === "bank_verlangt_nicht")).toBe(false);
  });

  it("erzeugt keine Dublette, wenn zwei Anforderungen denselben Typ tragen", () => {
    // Bank verlangt Gehaltsabrechnung fuer beide Antragsteller; wir haben EINE
    // Position mit perApplicant. Beide muessen sich darauf decken.
    const b = gleicheAb(
      [
        anforderung("r1", "Einkommensnachweis AS1", "gehaltsabrechnung"),
        anforderung("r2", "Einkommensnachweis AS2", "gehaltsabrechnung"),
      ],
      [position("tpl.gehalt", "Gehaltsabrechnungen", "gehaltsabrechnung")]
    );
    expect(b.filter((x) => x.art === "deckt_sich")).toHaveLength(2);
    expect(b.some((x) => x.art === "neu")).toBe(false);
  });

  it("zaehlt die vier Arten", () => {
    const z = zaehle([
      { art: "deckt_sich", anforderungId: "r1", positionKey: "p1" },
      { art: "neu", anforderungId: "r2" },
      { art: "neu", anforderungId: "r3" },
      { art: "erledigt", anforderungId: "r4" },
      { art: "bank_verlangt_nicht", positionKey: "p2" },
    ]);
    expect(z).toEqual({ decktSich: 1, neu: 2, erledigt: 1, verlangtBankNicht: 1 });
  });
});
