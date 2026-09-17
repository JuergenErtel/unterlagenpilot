import { describe, it, expect } from "vitest";
import { BACKOFFICE_GRUPPEN, PORTAL_GRUPPEN, SORTIERER_GRUPPEN, navGruppenFuer, zeigeUmschalter, navGruppen } from "@/components/sidebar-nav";
import {
  bereichAusPfad,
  verfuegbareBereiche,
  ersterBereich,
  sichtbarerBereich,
  LEERE_ZAEHLER,
  type Bereiche,
  type BackofficeZaehler,
} from "@/lib/backoffice/bereich";

/** Kurzschreibweise: nur die genannten Bereiche sind an. */
function b(teil: Partial<Bereiche>): Bereiche {
  return { vertrieb: false, sortierer: false, backoffice: false, portal: false, ...teil };
}

/**
 * Navigation und Bereichsumschalter als reine Regeln: Wer nur einen Bereich
 * hat, sieht keinen Umschalter; die Backoffice-Leiste ist nach Arbeitstag
 * gegliedert und jeder handlungsrelevante Eintrag traegt einen Zaehler.
 */
describe("Bereichsumschalter", () => {
  it("erscheint nicht fuer Nutzer mit genau einem Bereich", () => {
    expect(zeigeUmschalter(b({ vertrieb: true }))).toBe(false);
    expect(zeigeUmschalter(b({ sortierer: true }))).toBe(false);
    expect(zeigeUmschalter(b({ vertrieb: true, backoffice: true }))).toBe(true);
    expect(zeigeUmschalter(b({ vertrieb: true, sortierer: true }))).toBe(true);
  });

  it("leitet den Bereich aus dem Pfad ab, faellt sonst auf den Vertrieb zurueck", () => {
    expect(bereichAusPfad("/backoffice")).toBe("backoffice");
    expect(bereichAusPfad("/backoffice/auftraege/x")).toBe("backoffice");
    expect(bereichAusPfad("/portal/rueckfragen")).toBe("portal");
    expect(bereichAusPfad("/sortierer")).toBe("sortierer");
    expect(bereichAusPfad("/sortierer/abc")).toBe("sortierer");
    expect(bereichAusPfad("/backoffice-irgendwas")).toBe("vertrieb");
    expect(bereichAusPfad("/cases/1")).toBe("vertrieb");
  });

  it("listet nur sichtbare Bereiche in fester Reihenfolge", () => {
    expect(verfuegbareBereiche(b({ vertrieb: true, portal: true }))).toEqual(["vertrieb", "portal"]);
    expect(verfuegbareBereiche(b({ vertrieb: true, sortierer: true, backoffice: true }))).toEqual([
      "vertrieb",
      "sortierer",
      "backoffice",
    ]);
  });
});

/**
 * Bis zum 17.09.2026 war der Vertrieb fuer jeden da und diente als sicherer
 * Rueckfall. Wer BaufiDesk nur als Unterlagensortierer nutzt, hat ihn nicht -
 * und landete mit der alten Regel auf einer Seite, die ihm 404 antwortet.
 */
describe("Nutzer ohne Vertrieb", () => {
  const nurSortierer = b({ sortierer: true });

  it("faellt auf den Sortierer zurueck, nicht auf den Vertrieb", () => {
    expect(ersterBereich(nurSortierer)).toBe("sortierer");
    expect(sichtbarerBereich("/cases/1", nurSortierer)).toBe("sortierer");
    expect(sichtbarerBereich("/heute", nurSortierer)).toBe("sortierer");
  });

  it("bleibt im Sortierer, wenn der Pfad dorthin zeigt", () => {
    expect(sichtbarerBereich("/sortierer/abc", nurSortierer)).toBe("sortierer");
  });

  it("aendert nichts fuer den gewoehnlichen Vertriebsnutzer", () => {
    const normal = b({ vertrieb: true, sortierer: true });
    expect(ersterBereich(normal)).toBe("vertrieb");
    expect(sichtbarerBereich("/cases/1", normal)).toBe("vertrieb");
    expect(sichtbarerBereich("/sortierer", normal)).toBe("sortierer");
  });

  it("antwortet auch fuer ein Konto ganz ohne Bereich, statt zu schleifen", () => {
    expect(ersterBereich(b({}))).toBe("vertrieb");
  });
});

describe("Sortierer-Navigation", () => {
  it("ist ein Werkzeug, kein Arbeitsbereich - eine Gruppe, wenige Eintraege", () => {
    expect(SORTIERER_GRUPPEN).toHaveLength(1);
    const hrefs = SORTIERER_GRUPPEN.flatMap((g) => g.items).map((i) => i.href);
    expect(hrefs).toContain("/sortierer");
    // Keine Fallakte, keine Pipeline: Wer nur sortiert, sieht kein CRM.
    expect(hrefs.some((h) => h.startsWith("/cases") || h.startsWith("/pipeline"))).toBe(false);
  });

  it("liefert die Sortierer-Leiste fuer den Bereich sortierer", () => {
    expect(navGruppenFuer("sortierer", true)).toBe(SORTIERER_GRUPPEN);
    expect(navGruppenFuer("sortierer", true).flatMap((g) => g.items).some((i) => i.href.startsWith("/admin"))).toBe(false);
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
