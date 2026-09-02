import { describe, it, expect } from "vitest";
import {
  darfAuftragSehen,
  sichtbarkeitsFilter,
  darfPortalAuftragSehen,
  istAuftraggeberAdmin,
  type PortalAuftraggeber,
} from "@/lib/backoffice/sichtbarkeit";
import {
  AUFTRAGSARTEN,
  LEISTUNGSBAUSTEINE,
  bereinigeLeistungen,
  ergebnisseFuer,
  auftragsartLabel,
  leistungsLabel,
  ERGEBNIS_LABELS,
} from "@/lib/backoffice/leistungen";
import {
  AKTE_ARTEN,
  BACKOFFICE_STATUS,
  BACKOFFICE_STATUS_LABELS,
  BACKOFFICE_STATUS_PORTAL_LABELS,
  BACKOFFICE_ROLLEN,
  BACKOFFICE_ROLLE_LABELS,
  BACKOFFICE_PRIORITAETEN,
  BACKOFFICE_PRIORITAET_LABELS,
  BACKOFFICE_RUECKFRAGE_STATUS,
  BACKOFFICE_RUECKFRAGE_STATUS_LABELS,
  BACKOFFICE_ABRECHNUNGSMODELLE,
  BACKOFFICE_ABRECHNUNGSMODELL_LABELS,
  BACKOFFICE_ABRECHNUNGSSTATUS,
  BACKOFFICE_ABRECHNUNGSSTATUS_LABELS,
  BACKOFFICE_TERMINAL_STATUS,
} from "@/lib/domain/enums";

// ---------------------------------------------------------------------------
// Backoffice-Seite
// ---------------------------------------------------------------------------

const ORG_A = "org-A";
const ORG_B = "org-B";

const manager = { userId: "u-m", organizationId: ORG_A, backofficeRolle: "manager" as const };
const pruefer = { userId: "u-p", organizationId: ORG_A, backofficeRolle: "pruefer" as const };
const bearbeiter = { userId: "u-b1", organizationId: ORG_A, backofficeRolle: "bearbeiter" as const };
const ohneRolle = { userId: "u-x", organizationId: ORG_A, backofficeRolle: null };

const frei = { backofficeOrganizationId: ORG_A, bearbeiterId: null };
const eigener = { backofficeOrganizationId: ORG_A, bearbeiterId: "u-b1" };
const fremder = { backofficeOrganizationId: ORG_A, bearbeiterId: "u-b2" };
const andereOrg = { backofficeOrganizationId: ORG_B, bearbeiterId: null };

describe("darfAuftragSehen", () => {
  it("lässt einen Manager alles in der eigenen Organisation sehen", () => {
    expect(darfAuftragSehen(manager, frei)).toBe(true);
    expect(darfAuftragSehen(manager, eigener)).toBe(true);
    expect(darfAuftragSehen(manager, fremder)).toBe(true);
  });

  it("lässt einen Manager nichts in einer fremden Organisation sehen", () => {
    expect(darfAuftragSehen(manager, andereOrg)).toBe(false);
  });

  it("lässt einen Prüfer alle Aufträge der eigenen Organisation sehen", () => {
    expect(darfAuftragSehen(pruefer, fremder)).toBe(true);
    expect(darfAuftragSehen(pruefer, andereOrg)).toBe(false);
  });

  it("lässt einen Bearbeiter nur eigene und unzugewiesene Aufträge sehen", () => {
    expect(darfAuftragSehen(bearbeiter, frei)).toBe(true);
    expect(darfAuftragSehen(bearbeiter, eigener)).toBe(true);
    expect(darfAuftragSehen(bearbeiter, fremder)).toBe(false);
    expect(darfAuftragSehen(bearbeiter, andereOrg)).toBe(false);
  });

  it("lässt ohne Backoffice-Rolle nichts sehen", () => {
    expect(darfAuftragSehen(ohneRolle, frei)).toBe(false);
    expect(darfAuftragSehen(ohneRolle, eigener)).toBe(false);
  });
});

describe("sichtbarkeitsFilter", () => {
  it("beschränkt Manager und Prüfer nur auf die Organisation", () => {
    expect(sichtbarkeitsFilter(manager)).toEqual({ backofficeOrganizationId: ORG_A });
    expect(sichtbarkeitsFilter(pruefer)).toEqual({ backofficeOrganizationId: ORG_A });
  });

  it("beschränkt Bearbeiter zusätzlich auf eigene und unzugewiesene Aufträge", () => {
    expect(sichtbarkeitsFilter(bearbeiter)).toEqual({
      backofficeOrganizationId: ORG_A,
      OR: [{ bearbeiterId: null }, { bearbeiterId: "u-b1" }],
    });
  });

  it("stimmt mit darfAuftragSehen überein", () => {
    const auftraege = [frei, eigener, fremder];
    const filter = sichtbarkeitsFilter(bearbeiter);
    const perFilter = auftraege.filter(
      (a) => a.backofficeOrganizationId === filter.backofficeOrganizationId && (filter.OR ?? [{ bearbeiterId: a.bearbeiterId }]).some((o) => o.bearbeiterId === a.bearbeiterId)
    );
    const perRegel = auftraege.filter((a) => darfAuftragSehen(bearbeiter, a));
    expect(perFilter).toEqual(perRegel);
  });
});

// ---------------------------------------------------------------------------
// Portal-Seite
// ---------------------------------------------------------------------------

const ORG_C = "org-C";
const KONTAKT_MIT = "k-mit";
const KONTAKT_ALLE = "k-alle";

const cAdmin = { userId: "u-cadmin", organizationId: ORG_C, role: "org_admin" as const };
const cWhiteLabel = { userId: "u-cwl", organizationId: ORG_C, role: "white_label_admin" as const };
const cMit = { userId: "u-cmit", organizationId: ORG_C, role: "teammitglied" as const };
const cAlle = { userId: "u-calle", organizationId: ORG_C, role: "vermittler" as const };
const cOhneKontakt = { userId: "u-cohne", organizationId: ORG_C, role: "teammitglied" as const };
const cInaktiv = { userId: "u-cinaktiv", organizationId: ORG_C, role: "teammitglied" as const };
const dAdmin = { userId: "u-dadmin", organizationId: "org-D", role: "org_admin" as const };

const auftraggeberC: PortalAuftraggeber = {
  organizationId: ORG_C,
  kontakte: [
    { id: KONTAKT_MIT, userId: "u-cmit", darfAlleAuftraegeSehen: false, aktiv: true },
    { id: KONTAKT_ALLE, userId: "u-calle", darfAlleAuftraegeSehen: true, aktiv: true },
    { id: "k-inaktiv", userId: "u-cinaktiv", darfAlleAuftraegeSehen: true, aktiv: false },
  ],
};

const auftraggeberOhneOrg: PortalAuftraggeber = { organizationId: null, kontakte: [] };

describe("darfPortalAuftragSehen", () => {
  it("lässt den Admin der verknüpften Organisation jeden Auftrag sehen", () => {
    expect(darfPortalAuftragSehen(cAdmin, auftraggeberC, null)).toBe(true);
    expect(darfPortalAuftragSehen(cAdmin, auftraggeberC, KONTAKT_MIT)).toBe(true);
    expect(darfPortalAuftragSehen(cWhiteLabel, auftraggeberC, null)).toBe(true);
  });

  it("lässt den Admin einer fremden Organisation nichts sehen", () => {
    expect(darfPortalAuftragSehen(dAdmin, auftraggeberC, null)).toBe(false);
  });

  it("lässt niemanden Aufträge eines Auftraggebers ohne Organisationsverknüpfung sehen", () => {
    expect(darfPortalAuftragSehen(cAdmin, auftraggeberOhneOrg, null)).toBe(false);
  });

  it("lässt ein Mitglied mit Kontakt „darf alle“ jeden Auftrag sehen", () => {
    expect(darfPortalAuftragSehen(cAlle, auftraggeberC, null)).toBe(true);
    expect(darfPortalAuftragSehen(cAlle, auftraggeberC, KONTAKT_MIT)).toBe(true);
  });

  it("lässt ein Mitglied ohne „darf alle“ nur Aufträge am eigenen Kontakt sehen", () => {
    expect(darfPortalAuftragSehen(cMit, auftraggeberC, KONTAKT_MIT)).toBe(true);
    expect(darfPortalAuftragSehen(cMit, auftraggeberC, KONTAKT_ALLE)).toBe(false);
    expect(darfPortalAuftragSehen(cMit, auftraggeberC, null)).toBe(false);
  });

  it("lässt ein Mitglied ohne Kontakt nichts sehen", () => {
    expect(darfPortalAuftragSehen(cOhneKontakt, auftraggeberC, null)).toBe(false);
    expect(darfPortalAuftragSehen(cOhneKontakt, auftraggeberC, KONTAKT_MIT)).toBe(false);
  });

  it("zählt einen inaktiven Kontakt nicht", () => {
    expect(darfPortalAuftragSehen(cInaktiv, auftraggeberC, null)).toBe(false);
    expect(darfPortalAuftragSehen(cInaktiv, auftraggeberC, "k-inaktiv")).toBe(false);
  });
});

describe("istAuftraggeberAdmin", () => {
  it("erkennt Organisations- und White-Label-Admins", () => {
    expect(istAuftraggeberAdmin("org_admin")).toBe(true);
    expect(istAuftraggeberAdmin("white_label_admin")).toBe(true);
    expect(istAuftraggeberAdmin("vermittler")).toBe(false);
    expect(istAuftraggeberAdmin("teammitglied")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leistungskatalog
// ---------------------------------------------------------------------------

describe("Leistungskatalog", () => {
  it("entfernt beim Bereinigen unbekannte und doppelte Schlüssel und sortiert nach Katalog", () => {
    const r = bereinigeLeistungen(["haushaltsrechnung", "quatsch", "unterlagen_pruefen", "haushaltsrechnung", ""]);
    expect(r).toEqual(["unterlagen_pruefen", "haushaltsrechnung"]);
  });

  it("liefert für eine leere Auswahl eine leere Liste", () => {
    expect(bereinigeLeistungen([])).toEqual([]);
  });

  it("sammelt Ergebnisse ohne Doppelte in fester Reihenfolge", () => {
    const r = ergebnisseFuer(["einreichung_vorbereiten", "unterlagen_pruefen", "wohnflaeche"]);
    expect(r).toEqual(["checkliste", "dokumente", "wohnflaeche", "einreichung"]);
  });

  it("liefert für unbekannte oder ergebnislose Leistungen nichts", () => {
    expect(ergebnisseFuer(["quatsch"])).toEqual([]);
    expect(ergebnisseFuer(["individuell"])).toEqual([]);
  });

  it("verweist in jeder Auftragsart nur auf bekannte Leistungsbausteine", () => {
    const bekannt = new Set(LEISTUNGSBAUSTEINE.map((l) => l.key));
    for (const art of AUFTRAGSARTEN) {
      expect(art.leistungen.length, art.key).toBeGreaterThan(0);
      for (const key of art.leistungen) expect(bekannt.has(key), `${art.key} → ${key}`).toBe(true);
    }
  });

  it("verwendet in jedem Baustein nur bekannte Ergebnisarten", () => {
    for (const l of LEISTUNGSBAUSTEINE) {
      for (const e of l.ergebnisse) expect(ERGEBNIS_LABELS[e], `${l.key} → ${e}`).toBeTruthy();
    }
  });

  it("hat eindeutige Schlüssel in Auftragsarten und Bausteinen", () => {
    const arten = AUFTRAGSARTEN.map((a) => a.key);
    const bausteine = LEISTUNGSBAUSTEINE.map((l) => l.key);
    expect(new Set(arten).size).toBe(arten.length);
    expect(new Set(bausteine).size).toBe(bausteine.length);
  });

  it("fällt bei unbekannten Schlüsseln auf den Schlüssel selbst zurück", () => {
    expect(auftragsartLabel("basis_pruefung")).toBe("Basis-Unterlagenprüfung");
    expect(auftragsartLabel("unbekannt")).toBe("unbekannt");
    expect(leistungsLabel("wohnflaeche")).toBe("Wohnflächenberechnung");
    expect(leistungsLabel("unbekannt")).toBe("unbekannt");
  });
});

// ---------------------------------------------------------------------------
// Enums und Labels
// ---------------------------------------------------------------------------

describe("Backoffice-Enums und Labels", () => {
  it("hat für jeden Status ein internes und ein Portal-Label", () => {
    for (const s of BACKOFFICE_STATUS) {
      expect(BACKOFFICE_STATUS_LABELS[s], s).toBeTruthy();
      expect(BACKOFFICE_STATUS_PORTAL_LABELS[s], s).toBeTruthy();
    }
    expect(Object.keys(BACKOFFICE_STATUS_LABELS).sort()).toEqual([...BACKOFFICE_STATUS].sort());
    expect(Object.keys(BACKOFFICE_STATUS_PORTAL_LABELS).sort()).toEqual([...BACKOFFICE_STATUS].sort());
  });

  it("hält die Innenansicht aus den Portal-Labels heraus", () => {
    // Qualitaetskontrolle, Einreichungsreife und Nachbearbeitung sind fuer den
    // Auftraggeber schlicht "in Bearbeitung".
    expect(BACKOFFICE_STATUS_PORTAL_LABELS.qualitaetskontrolle).toBe("In Bearbeitung");
    expect(BACKOFFICE_STATUS_PORTAL_LABELS.nachbearbeitung).toBe("In Bearbeitung");
    expect(BACKOFFICE_STATUS_PORTAL_LABELS.einreichungsfertig).toBe("In Bearbeitung");
  });

  it("kennt genau drei terminale Status, alle aus dem Enum", () => {
    expect([...BACKOFFICE_TERMINAL_STATUS].sort()).toEqual(["abgelehnt", "abgeschlossen", "storniert"]);
    for (const s of BACKOFFICE_TERMINAL_STATUS) expect(BACKOFFICE_STATUS).toContain(s);
  });

  it("hat für jede Rolle, Priorität, jeden Rückfrage- und Abrechnungswert ein Label", () => {
    const paare: Array<[readonly string[], Record<string, string>]> = [
      [BACKOFFICE_ROLLEN, BACKOFFICE_ROLLE_LABELS],
      [BACKOFFICE_PRIORITAETEN, BACKOFFICE_PRIORITAET_LABELS],
      [BACKOFFICE_RUECKFRAGE_STATUS, BACKOFFICE_RUECKFRAGE_STATUS_LABELS],
      [BACKOFFICE_ABRECHNUNGSMODELLE, BACKOFFICE_ABRECHNUNGSMODELL_LABELS],
      [BACKOFFICE_ABRECHNUNGSSTATUS, BACKOFFICE_ABRECHNUNGSSTATUS_LABELS],
    ];
    for (const [werte, labels] of paare) {
      expect(Object.keys(labels).sort()).toEqual([...werte].sort());
      for (const w of werte) expect(labels[w]).toBeTruthy();
    }
  });

  it("kennt genau die zwei Aktenarten", () => {
    expect([...AKTE_ARTEN]).toEqual(["vertrieb", "backoffice"]);
  });
});
