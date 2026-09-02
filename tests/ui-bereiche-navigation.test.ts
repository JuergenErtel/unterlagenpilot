import { describe, it, expect } from "vitest";
import { BACKOFFICE_GRUPPEN, PORTAL_GRUPPEN, navGruppenFuer, zeigeUmschalter, navGruppen } from "@/components/sidebar-nav";
import { bereichAusPfad, verfuegbareBereiche, LEERE_ZAEHLER, type BackofficeZaehler } from "@/lib/backoffice/bereich";

/**
 * Navigation und Bereichsumschalter als reine Regeln: Wer nur einen Bereich
 * hat, sieht keinen Umschalter; die Backoffice-Leiste ist nach Arbeitstag
 * gegliedert und jeder handlungsrelevante Eintrag traegt einen Zaehler.
 */
describe("Bereichsumschalter", () => {
  it("erscheint nicht fuer Nutzer mit genau einem Bereich", () => {
    expect(zeigeUmschalter({ vertrieb: true, backoffice: false, portal: false })).toBe(false);
    expect(zeigeUmschalter({ vertrieb: true, backoffice: true, portal: false })).toBe(true);
    expect(zeigeUmschalter({ vertrieb: true, backoffice: true, portal: true })).toBe(true);
  });

  it("leitet den Bereich aus dem Pfad ab, faellt sonst auf den Vertrieb zurueck", () => {
    expect(bereichAusPfad("/backoffice")).toBe("backoffice");
    expect(bereichAusPfad("/backoffice/auftraege/x")).toBe("backoffice");
    expect(bereichAusPfad("/portal/rueckfragen")).toBe("portal");
    expect(bereichAusPfad("/backoffice-irgendwas")).toBe("vertrieb");
    expect(bereichAusPfad("/cases/1")).toBe("vertrieb");
  });

  it("listet nur sichtbare Bereiche in fester Reihenfolge", () => {
    expect(verfuegbareBereiche({ vertrieb: true, backoffice: false, portal: true })).toEqual(["vertrieb", "portal"]);
  });
});

describe("Backoffice-Navigation", () => {
  const eintraege = BACKOFFICE_GRUPPEN.flatMap((g) => g.items);

  it("ist nach Uebersicht, Arbeitstag, Klaerungsbedarf und Verwaltung gegliedert", () => {
    expect(BACKOFFICE_GRUPPEN.map((g) => g.label)).toEqual(["Übersicht", "Mein Arbeitstag", "Klärungsbedarf", "Verwaltung"]);
  });

  it("nennt den taeglichen Arbeitsplatz \"Jetzt bearbeiten\" und nicht \"Bearbeitungsqueue\"", () => {
    const queue = eintraege.find((e) => e.href === "/backoffice/queue");
    expect(queue?.label).toBe("Jetzt bearbeiten");
    expect(eintraege.some((e) => /queue/i.test(e.label))).toBe(false);
  });

  it("haengt an jeden handlungsrelevanten Eintrag einen Zaehler", () => {
    const mitZaehler = eintraege.filter((e) => e.zaehler).map((e) => e.href).sort();
    expect(mitZaehler).toEqual(
      ["/backoffice/dokumentenpruefung", "/backoffice/fehlende-unterlagen", "/backoffice/qualitaetskontrolle", "/backoffice/queue", "/backoffice/rueckfragen", "/backoffice/uebergabe"].sort()
    );
    const schluessel = new Set<keyof BackofficeZaehler>(Object.keys(LEERE_ZAEHLER) as Array<keyof BackofficeZaehler>);
    for (const e of eintraege) if (e.zaehler) expect(schluessel.has(e.zaehler)).toBe(true);
  });

  it("enthaelt keine internen Begriffe im Portal", () => {
    const labels = PORTAL_GRUPPEN.flatMap((g) => g.items.map((i) => i.label)).join(" ");
    for (const verboten of ["Queue", "Audit", "Mandant", "Storage", "Pipeline", "KI"]) {
      expect(labels).not.toContain(verboten);
    }
  });

  it("liefert je Bereich die passende Leiste und laesst den Vertrieb unveraendert", () => {
    expect(navGruppenFuer("backoffice", true)).toBe(BACKOFFICE_GRUPPEN);
    expect(navGruppenFuer("portal", true)).toBe(PORTAL_GRUPPEN);
    expect(navGruppenFuer("vertrieb", false)).toEqual(navGruppen(false));
    expect(navGruppenFuer("backoffice", true).flatMap((g) => g.items).some((i) => i.href.startsWith("/admin"))).toBe(false);
  });
});
