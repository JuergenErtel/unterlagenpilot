import { describe, it, expect } from "vitest";
import { bewerte } from "@/lib/machbarkeit/bewertung";
import { baueEingabe } from "@/lib/machbarkeit/eingabe";
import { ampelFuer } from "@/lib/machbarkeit/ampel";
import { VORGABE_ANNAHMEN, type SolverEingabe } from "@/lib/machbarkeit/types";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Antworten } from "@/lib/self-disclosure/types";
import type { CanonicalCase } from "@/lib/domain/canonical";

const seite = (id: string) => KATALOG.find((s) => s.id === id)!;
const felderVon = (id: string, a: Antworten) => sichtbareFelder(seite(id), a).map((f) => f.id);

/**
 * Die drei Vorhabensarten ohne Kaufpreis: Anschlussfinanzierung,
 * Kapitalbeschaffung, Modernisierung.
 *
 * Bis zum 16.08.2026 verlangte die Rechnung zwingend einen Kaufpreis und
 * lieferte fuer diese Arten immer "grau". Der Kaufpreis trug dabei ZWEI
 * Rollen: Er war das, was finanziert wird, UND der Massstab, an dem die Bank
 * den Auslauf misst. Bei diesen drei Arten fallen beide auseinander.
 */

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 0,
  modernisierungskosten: 0,
  objektwert: null,
  weitererDarlehensbedarf: 0,
  darlehensbedarfVerhandelbar: false,
  vorrangigeRestschuld: 0,
  inventarAnteil: 0,
  nebenkostenErfasst: null,
  maklerprovisionProzent: 0,
  bundesland: "bayern",
  grunderwerbsteuerProzentOverride: null,
  eigenkapital: 0,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  wunschrateMonatlich: null,
  nettoEinkommen: 4_000,
  zusatzEinnahmen: 0,
  zusatzErwachsene: 0,
  kredite: [],
  abzuloesendeRestschuld: 0,
  bestehendeRaten: 0,
  applicantCount: 1,
  anzahlKinder: 0,
  wohnflaeche: 100,
  hausgeldMonatlich: null,
  mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

describe("Bewertung ohne Kaufpreis", () => {
  it("misst den Auslauf am Objektwert, wenn kein Kaufpreis erfasst ist", () => {
    // Reine Modernisierung: 60.000 Euro Kosten auf eine Immobilie, die
    // 300.000 Euro wert ist.
    const u = bewerte(
      eingabe({ modernisierungskosten: 60_000, objektwert: 300_000 }),
      VORGABE_ANNAHMEN
    );
    expect(u.darlehen).toBe(60_000);
    expect(u.beleihungswert).toBe(300_000);
    expect(u.auslauf).toBe(20);
  });

  it("erhebt keine Grunderwerbsteuer, wo kein Kaufpreis steht", () => {
    // Der Grundbetrag in `kaufpreis` zu schreiben waere der naheliegende
    // Kurzschluss gewesen – und haette 6,5 % Grunderwerbsteuer und 2 %
    // Notarkosten auf eine Modernisierung gerechnet.
    const u = bewerte(
      eingabe({ modernisierungskosten: 60_000, objektwert: 300_000 }),
      VORGABE_ANNAHMEN
    );
    expect(u.nebenkosten.summe).toBe(0);
  });

  it("erhoeht das Darlehen um den weiteren Bedarf, ohne den Beleihungswert zu heben", () => {
    // Anschlussfinanzierung: 180.000 Euro abzuloesen, Objekt 300.000 Euro wert.
    const u = bewerte(
      eingabe({ weitererDarlehensbedarf: 180_000, objektwert: 300_000 }),
      VORGABE_ANNAHMEN
    );
    expect(u.darlehen).toBe(180_000);
    expect(u.auslauf).toBe(60);
  });

  it("rechnet eine bestehende Grundschuld in den Auslauf", () => {
    // Der Fall, an dem sich die Ampel sonst verrechnet: 100.000 Euro
    // Kapitalbeschaffung auf ein Objekt von 300.000 Euro sind nicht 33 %
    // Auslauf, wenn darauf noch 200.000 Euro Restschuld liegen.
    const u = bewerte(
      eingabe({
        weitererDarlehensbedarf: 100_000,
        objektwert: 300_000,
        vorrangigeRestschuld: 200_000,
      }),
      VORGABE_ANNAHMEN
    );
    expect(u.darlehen).toBe(100_000);
    expect(u.auslauf).toBe(100);
  });

  it("laesst die vorrangige Restschuld aus dem Darlehen heraus", () => {
    // Sie verbraucht Beleihungsraum, wird aber nicht mitfinanziert – sonst
    // zahlte der Haushalt ihre Rate zweimal: einmal beim laufenden Kredit,
    // einmal im neuen Darlehen.
    const mit = bewerte(
      eingabe({
        weitererDarlehensbedarf: 100_000,
        objektwert: 300_000,
        vorrangigeRestschuld: 200_000,
      }),
      VORGABE_ANNAHMEN
    );
    const ohne = bewerte(
      eingabe({ weitererDarlehensbedarf: 100_000, objektwert: 300_000 }),
      VORGABE_ANNAHMEN
    );
    expect(mit.darlehen).toBe(ohne.darlehen);
    // Teurer wird es trotzdem – aber ueber das Auslaufband, nicht ueber die
    // Darlehenssumme.
    expect(mit.auslauf).toBeGreaterThan(ohne.auslauf);
    expect(mit.zinsProzent).toBeGreaterThan(ohne.zinsProzent);
  });

  it("laesst den Kauf unveraendert: ohne Objektwert bleibt der Kaufpreis der Massstab", () => {
    // Regressionsriegel. Fuer Kauf und Neubau ist `objektwert` null und
    // `weitererDarlehensbedarf` null – es muss exakt dasselbe herauskommen
    // wie vor der Trennung der beiden Rollen.
    const u = bewerte(
      eingabe({ kaufpreis: 400_000, eigenkapital: 100_000, bundesland: "bayern" }),
      VORGABE_ANNAHMEN
    );
    expect(u.beleihungswert).toBe(400_000);
    // 400.000 + 3,5 % GrESt + 2 % Notar − 100.000 Eigenkapital
    expect(u.darlehen).toBe(322_000);
    expect(u.auslauf).toBe(80.5);
  });
});

const fall = (financing: Record<string, unknown>, property: Record<string, unknown> = {}) =>
  ({
    applicants: [{ position: 1, vorname: "A", nachname: "B" }],
    employment: [],
    income: [{ applicantPosition: 1, nettoMonatlich: 4_000 }],
    liabilities: [],
    assets: [],
    property: { plz: "80331", ort: "München", wohnflaeche: 90, ...property },
    financing,
    platformIds: {},
  }) as unknown as CanonicalCase;

const opts = { applicantCount: 1, anzahlKinder: 0 };

describe("Eingabe-Aufbereitung je Vorhabensart", () => {
  it("nimmt bei der Anschlussfinanzierung den Darlehenswunsch als weiteren Bedarf", () => {
    const r = baueEingabe(
      {
        ...fall({ darlehenswunsch: 180_000 }, { objektwert: 300_000 }),
        financingType: "anschlussfinanzierung",
      },
      opts
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eingabe.weitererDarlehensbedarf).toBe(180_000);
      expect(r.eingabe.objektwert).toBe(300_000);
    }
  });

  it("behandelt die Umschuldung wie die Anschlussfinanzierung", () => {
    const r = baueEingabe(
      {
        ...fall({ darlehenswunsch: 180_000 }, { objektwert: 300_000 }),
        financingType: "umschuldung",
      },
      opts
    );
    expect(r.ok && r.eingabe.weitererDarlehensbedarf).toBe(180_000);
  });

  it("nimmt bei der Kapitalbeschaffung den benoetigten Betrag als weiteren Bedarf", () => {
    const r = baueEingabe(
      {
        ...fall({ darlehenswunsch: 100_000 }, { objektwert: 300_000 }),
        financingType: "kapitalbeschaffung",
      },
      opts
    );
    expect(r.ok && r.eingabe.weitererDarlehensbedarf).toBe(100_000);
  });

  it("nimmt den Darlehenswunsch beim Kauf NICHT als weiteren Bedarf", () => {
    // Beim Kauf ist der Darlehenswunsch die Schaetzung des Kunden fuer das,
    // was die Rechnung selbst aus Kaufpreis, Nebenkosten und Eigenkapital
    // ermittelt. Ihn zu addieren wuerde das Darlehen verdoppeln.
    const r = baueEingabe(
      { ...fall({ kaufpreis: 400_000, darlehenswunsch: 350_000 }), financingType: "kauf" },
      opts
    );
    expect(r.ok && r.eingabe.weitererDarlehensbedarf).toBe(0);
  });

  it("uebernimmt die bestehende Grundschuld als vorrangige Restschuld", () => {
    const r = baueEingabe(
      {
        ...fall(
          { darlehenswunsch: 100_000 },
          { objektwert: 300_000, bestehendeGrundschuld: 200_000 }
        ),
        financingType: "kapitalbeschaffung",
      },
      opts
    );
    expect(r.ok && r.eingabe.vorrangigeRestschuld).toBe(200_000);
  });

  it("benennt den fehlenden Wert der Immobilie statt eines Kaufpreises", () => {
    const r = baueEingabe(
      { ...fall({ modernisierungskosten: 60_000 }), financingType: "modernisierung" },
      opts
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fehlend.join(" ")).toMatch(/Wert der Immobilie/);
      // Nach einem Kaufpreis zu fragen, den es bei einer Modernisierung nicht
      // gibt, hat den Vermittler bisher ratlos gelassen.
      expect(r.fehlend.join(" ")).not.toMatch(/Kaufpreis/);
    }
  });

  it("benennt bei der Anschlussfinanzierung die fehlende Restschuld", () => {
    const r = baueEingabe(
      { ...fall({}, { objektwert: 300_000 }), financingType: "anschlussfinanzierung" },
      opts
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Restschuld/);
  });

  it("benennt bei der Kapitalbeschaffung den fehlenden Betrag", () => {
    const r = baueEingabe(
      { ...fall({}, { objektwert: 300_000 }), financingType: "kapitalbeschaffung" },
      opts
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Darlehensbetrag/);
  });

  it("verlangt beim Kauf weiterhin einen Kaufpreis", () => {
    const r = baueEingabe({ ...fall({ eigenkapital: 50_000 }), financingType: "kauf" }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Kaufpreis oder Baukosten/);
  });

  it("nimmt den Kaufpreis als Objektwert, solange keiner erfasst ist", () => {
    const r = baueEingabe({ ...fall({ kaufpreis: 400_000 }), financingType: "kauf" }, opts);
    expect(r.ok && r.eingabe.objektwert).toBeNull();
  });

  /*
   * Der stehen gebliebene Kaufpreis (22.08.2026, Fall UP-2026-0015).
   *
   * Ein Fall wird von "Kauf" auf "Kapitalbeschaffung" umgestellt; der alte
   * Kaufpreis bleibt in der Datenbank stehen, weil ihn niemand loescht. Er
   * darf ab dann weder finanziert werden noch Grunderwerbsteuer ausloesen.
   */
  it("finanziert einen stehen gebliebenen Kaufpreis bei der Kapitalbeschaffung nicht mit", () => {
    const r = baueEingabe(
      {
        ...fall({ kaufpreis: 310_000, darlehenswunsch: 270_000 }, { objektwert: 415_000 }),
        financingType: "kapitalbeschaffung",
      },
      opts
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eingabe.kaufpreis).toBe(0);
    expect(r.eingabe.weitererDarlehensbedarf).toBe(270_000);

    const u = bewerte(r.eingabe, VORGABE_ANNAHMEN);
    // Nur der Darlehensbetrag, keine erfundene Grunderwerbsteuer.
    expect(u.darlehen).toBe(270_000);
    expect(u.nebenkosten.summe).toBe(0);
    // 270.000 von 415.000 – vorher waren es 151 % aus 310.000 + 270.000 + NK.
    expect(u.auslauf).toBe(65.06);
  });

  it("laesst den stehen gebliebenen Kaufpreis den Massstab sein, wenn kein Objektwert erfasst ist", () => {
    // Ohne diesen Rueckfall waere der Beleihungswert 0 und der Auslauf
    // unendlich – schlimmer als die alte Doppelzaehlung.
    const r = baueEingabe(
      { ...fall({ kaufpreis: 400_000, darlehenswunsch: 100_000 }), financingType: "kapitalbeschaffung" },
      opts
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eingabe.kaufpreis).toBe(0);
    expect(r.eingabe.objektwert).toBe(400_000);
    expect(bewerte(r.eingabe, VORGABE_ANNAHMEN).auslauf).toBe(25);
  });

  it("finanziert einen stehen gebliebenen Kaufpreis auch bei der Modernisierung nicht mit", () => {
    const r = baueEingabe(
      {
        ...fall({ kaufpreis: 310_000, modernisierungskosten: 60_000 }, { objektwert: 300_000 }),
        financingType: "modernisierung",
      },
      opts
    );
    expect(r.ok && r.eingabe.kaufpreis).toBe(0);
    expect(r.ok && bewerte(r.eingabe, VORGABE_ANNAHMEN).darlehen).toBe(60_000);
  });
});

const ampelOpts = { applicantCount: 1, anzahlKinder: 0, verloren: false, abgeschlossen: false };

describe("Ampel je Vorhabensart", () => {
  it("faerbt eine Modernisierung, sobald der Objektwert bekannt ist", () => {
    const a = ampelFuer(
      {
        ...fall({ modernisierungskosten: 60_000 }, { objektwert: 300_000 }),
        financingType: "modernisierung",
      },
      ampelOpts,
      VORGABE_ANNAHMEN
    );
    expect(a!.farbe).toBe("gruen");
  });

  it("bleibt grau und nennt den Wert der Immobilie, solange er fehlt", () => {
    const a = ampelFuer(
      { ...fall({ modernisierungskosten: 60_000 }), financingType: "modernisierung" },
      ampelOpts,
      VORGABE_ANNAHMEN
    );
    expect(a!.farbe).toBe("grau");
    expect(a!.grund).toMatch(/Wert der Immobilie/);
  });

  it("schlaegt eine kleinere Darlehenssumme vor statt eines kleineren Objekts", () => {
    // Kapitalbeschaffung weit ueber dem Beleihungsraum. "Objekt bis X Euro"
    // waere hier sinnlos – der Kunde besitzt es bereits.
    const a = ampelFuer(
      {
        ...fall({ darlehenswunsch: 400_000 }, { objektwert: 300_000 }),
        financingType: "kapitalbeschaffung",
      },
      ampelOpts,
      VORGABE_ANNAHMEN
    );
    expect(a!.text).not.toMatch(/Objekt bis/);
    expect(a!.text).toMatch(/Darlehen bis/);
  });
});

describe("Bogen: die beiden Fragen, die den Nenner liefern", () => {
  it("fragt den Objektwert bei Anschlussfinanzierung, Kapitalbeschaffung und Modernisierung", () => {
    for (const art of ["anschlussfinanzierung", "kapitalbeschaffung", "modernisierung"]) {
      expect(felderVon("objekt_preis", { "vorhaben.art": art }), art).toContain("objektwert");
    }
  });

  it("fragt den Objektwert nicht beim Kauf – dort ist der Kaufpreis der Massstab", () => {
    for (const art of ["kauf_bestand", "kauf_neubau", "eigenes_bauvorhaben"]) {
      expect(felderVon("objekt_preis", { "vorhaben.art": art }), art).not.toContain("objektwert");
    }
  });

  it("fragt die bestehende Grundschuld nur bei Kapitalbeschaffung und Modernisierung", () => {
    for (const art of ["kapitalbeschaffung", "modernisierung"]) {
      expect(felderVon("objekt_preis", { "vorhaben.art": art }), art).toContain(
        "bestehende_grundschuld"
      );
    }
    // Bei der Anschlussfinanzierung WIRD die Restschuld abgeloest – sie steht
    // dort schon unter ihrem eigenen Namen und waere hier eine zweite Frage
    // nach demselben Betrag.
    expect(felderVon("objekt_preis", { "vorhaben.art": "anschlussfinanzierung" })).not.toContain(
      "bestehende_grundschuld"
    );
  });

  it("stellt beide Fragen schon im kurzen Bogen", () => {
    // Sie sind der Zweck des kurzen Bogens: ohne sie bleibt die Ampel grau.
    expect(seite("objekt_preis").umfang).toBe("kurz");
  });
});
