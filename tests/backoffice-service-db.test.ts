import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock-Anbieter erzwingen, bevor irgendein Import greift (getEnv cached).
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Der Backoffice-Kern gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-service-db.test.ts
 */
describe.runIf(RUN)("Backoffice-Service (PGlite)", () => {
  let prisma: any;
  let service: typeof import("@/lib/backoffice/service");
  let orgA: string;
  let orgB: string;
  let manager: any;
  let bearbeiter1: any;
  let bearbeiter2: any;
  let pruefer: any;
  let agX: string;
  let agY: string;
  let vertriebsFall: string;

  const akteur = (u: any, rolle: "manager" | "bearbeiter" | "pruefer" | null = u.backofficeRolle) => ({
    userId: u.id,
    organizationId: u.organizationId,
    backofficeRolle: rolle,
  });

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const a = await prisma.organization.create({ data: { name: "Backoffice A", slug: "bo-service-a" } });
    const b = await prisma.organization.create({ data: { name: "Fremd B", slug: "bo-service-b" } });
    orgA = a.id;
    orgB = b.id;
    const nutzer = async (email: string, rolle: string | null, orgId = orgA) =>
      prisma.user.create({ data: { organizationId: orgId, email, name: email, role: "vermittler", backofficeRolle: rolle } });
    manager = await nutzer("m@a.de", "manager");
    bearbeiter1 = await nutzer("b1@a.de", "bearbeiter");
    bearbeiter2 = await nutzer("b2@a.de", "bearbeiter");
    pruefer = await nutzer("p@a.de", "pruefer");
    agX = (await prisma.backofficeAuftraggeber.create({
      data: { backofficeOrganizationId: orgA, name: "Auftraggeber X", abrechnungsmodell: "abo", kontingentMonatlich: 5 },
    })).id;
    agY = (await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: orgA, name: "Auftraggeber Y" } })).id;
    vertriebsFall = (await prisma.case.create({
      data: { organizationId: orgA, caseNumber: "UP-2026-0001", quelle: "immoscout24", leadPhase: "selbstauskunft_laeuft", status: "upload_offen" },
    })).id;
    service = await import("@/lib/backoffice/service");
  }, 180_000);

  it("legt einen externen Auftrag samt Backoffice-Akte an, ohne Vertriebsfelder anzufassen", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA,
      auftraggeberId: agX,
      antragsteller: { vorname: "Max", nachname: "Muster" },
      auftragsart: "basis_pruefung",
      quelle: "manuell",
      erstelltVonId: manager.id,
    });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.wert.auftragsnummer).toMatch(/^BO-\d{4}-0001$/);
    const akte = await prisma.case.findUnique({ where: { id: e.wert.caseId }, include: { applicants: true } });
    expect(akte.akteArt).toBe("backoffice");
    expect(akte.caseNumber).toBe(e.wert.auftragsnummer);
    expect(akte.quelle).toBe("unbekannt");
    expect(akte.leadPhase).toBe("neu");
    expect(akte.applicants).toHaveLength(1);
    const auftrag = await prisma.backofficeAuftrag.findUnique({ where: { id: e.wert.id } });
    expect(auftrag.faelligAm).toBeTruthy();
    expect(auftrag.leistungen).toEqual(["unterlagen_pruefen", "nachforderung"]);

    const zwei = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA,
      auftraggeberId: agX,
      antragsteller: { nachname: "Zwei" },
      auftragsart: "wohnflaeche",
      quelle: "manuell",
      erstelltVonId: manager.id,
    });
    expect(zwei.ok && zwei.wert.auftragsnummer.endsWith("0002")).toBe(true);
  }, 60_000);

  it("weist unbekannte Auftragsart und fremden Kontakt ab", async () => {
    const falsch = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agX, auftragsart: "gibt_es_nicht", quelle: "manuell", erstelltVonId: null,
    });
    expect(falsch.ok).toBe(false);
    const kontaktY = await prisma.backofficeAuftraggeberKontakt.create({ data: { auftraggeberId: agY, name: "K" } });
    const fremd = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agX, kontaktId: kontaktY.id, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: null,
    });
    expect(fremd.ok).toBe(false);
  }, 60_000);

  it("interne Uebergabe: Vertriebsakte bleibt Vertriebsakte, zweiter aktiver Auftrag und fremde Akte werden abgewiesen", async () => {
    const eigener = await service.eigenerAuftraggeber(orgA);
    const vorher = await prisma.case.findUnique({ where: { id: vertriebsFall } });
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: eigener, caseId: vertriebsFall, auftragsart: "vollstaendige_aufbereitung", quelle: "vertrieb_uebergabe", erstelltVonId: manager.id,
    });
    expect(e.ok).toBe(true);
    const nachher = await prisma.case.findUnique({ where: { id: vertriebsFall } });
    expect(nachher.akteArt).toBe("vertrieb");
    expect(nachher.status).toBe(vorher.status);
    expect(nachher.leadPhase).toBe(vorher.leadPhase);
    expect(nachher.quelle).toBe(vorher.quelle);

    const doppelt = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: eigener, caseId: vertriebsFall, auftragsart: "basis_pruefung", quelle: "vertrieb_uebergabe", erstelltVonId: manager.id,
    });
    expect(doppelt.ok).toBe(false);

    const fremdeAkte = await prisma.case.create({ data: { organizationId: orgB, caseNumber: "UP-B-1" } });
    const fremd = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: eigener, caseId: fremdeAkte.id, auftragsart: "basis_pruefung", quelle: "vertrieb_uebergabe", erstelltVonId: manager.id,
    });
    expect(fremd.ok).toBe(false);
  }, 60_000);

  it("Vertriebslisten und Tarifzaehler sehen die Backoffice-Akten nicht", async () => {
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    const alle = await prisma.case.count({ where: { organizationId: orgA } });
    const vertrieb = await prisma.case.count({ where: { organizationId: orgA, ...nurVertrieb } });
    expect(alle).toBeGreaterThan(vertrieb);
    expect(vertrieb).toBe(1);

    const boAkten = await prisma.case.findMany({ where: { organizationId: orgA, akteArt: "backoffice" }, select: { id: true } });
    const boIds = new Set(boAkten.map((c: any) => c.id));

    const { ladeHeute } = await import("@/lib/cases/heute-daten");
    const heute = await ladeHeute(orgA);
    expect(heute.aufgaben.some((a: any) => boIds.has(a.caseId))).toBe(false);

    const { getDashboardData } = await import("@/lib/cases/dashboard");
    const dash = await getDashboardData(orgA);
    expect(dash.kpis.offen).toBe(1);

    const starter = await prisma.plan.create({ data: { tier: "starter", name: "Starter", features: [] } });
    await prisma.subscription.create({ data: { organizationId: orgA, planId: starter.id, status: "active" } });
    const { checkLimit } = await import("@/lib/saas/plans");
    const limit = await checkLimit(orgA, "monthlyCases");
    expect(limit.used).toBe(1);
  }, 120_000);

  it("Statuswechsel: Uebernahme durch Bearbeiter, Sperre fuer andere, Audit ohne Freitext, Vertriebsfelder unveraendert", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agY, antragsteller: { nachname: "Status" }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!e.ok) throw new Error(e.grund);
    const id = e.wert.id;

    const w1 = await service.wechsleStatus({ auftragId: id, nach: "auftrag_pruefen", akteur: akteur(bearbeiter1) });
    expect(w1.ok).toBe(true);
    const nachW1 = await prisma.backofficeAuftrag.findUnique({ where: { id } });
    expect(nachW1.bearbeiterId).toBe(bearbeiter1.id);

    const w2 = await service.wechsleStatus({ auftragId: id, nach: "in_aufbereitung", akteur: akteur(bearbeiter2) });
    expect(w2.ok).toBe(false);

    const falsch = await service.wechsleStatus({ auftragId: id, nach: "uebergeben", akteur: akteur(manager) });
    expect(falsch.ok).toBe(false);

    const w3 = await service.wechsleStatus({ auftragId: id, nach: "in_aufbereitung", akteur: akteur(bearbeiter1) });
    expect(w3.ok).toBe(true);

    const akte = await prisma.case.findUnique({ where: { id: e.wert.caseId } });
    expect(akte.status).toBe("neu");
    expect(akte.leadPhase).toBe("neu");

    const ereignisse = await prisma.backofficeAuftragEreignis.findMany({ where: { auftragId: id, art: "status_wechsel" } });
    expect(ereignisse.length).toBeGreaterThanOrEqual(2);
    const audits = await prisma.auditLog.findMany({ where: { entityId: id, action: "backoffice.status_geaendert" } });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    for (const a of audits) expect(JSON.stringify(a.metadata)).not.toContain("Freitext");
  }, 60_000);

  it("Race: zwei gleichzeitige Wechsel vom selben Ausgangsstatus gewinnen nicht beide", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agY, antragsteller: { nachname: "Race" }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!e.ok) throw new Error(e.grund);
    const [r1, r2] = await Promise.all([
      service.wechsleStatus({ auftragId: e.wert.id, nach: "auftrag_pruefen", akteur: akteur(manager) }),
      service.wechsleStatus({ auftragId: e.wert.id, nach: "abgelehnt", akteur: akteur(manager), begruendung: "Doppelt" }),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);

    const f = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agY, antragsteller: { nachname: "Race2" }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!f.ok) throw new Error(f.grund);
    const [u1, u2] = await Promise.all([
      service.uebernehmeAuftrag(f.wert.id, akteur(bearbeiter1)),
      service.uebernehmeAuftrag(f.wert.id, akteur(bearbeiter2)),
    ]);
    expect([u1.ok, u2.ok].filter(Boolean)).toHaveLength(1);
  }, 60_000);

  async function bisQc(name: string, auftraggeberId = agX) {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId, antragsteller: { nachname: name }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!e.ok) throw new Error(e.grund);
    for (const nach of ["auftrag_pruefen", "in_aufbereitung", "qualitaetskontrolle"] as const) {
      const w = await service.wechsleStatus({ auftragId: e.wert.id, nach, akteur: akteur(bearbeiter1) });
      if (!w.ok) throw new Error(w.grund);
    }
    return e.wert;
  }

  it("Qualitaetskontrolle: Vier-Augen, Freigabe, Rueckgabe mit interner Begruendung", async () => {
    const a = await bisQc("QC");
    const selbst = await service.gibQualitaetFrei(a.id, null, akteur(bearbeiter1));
    expect(selbst.ok).toBe(false);
    const ohne = await service.gibZurNachbearbeitung(a.id, "", akteur(pruefer));
    expect(ohne.ok).toBe(false);
    const frei = await service.gibQualitaetFrei(a.id, "Passt", akteur(pruefer));
    expect(frei.ok).toBe(true);
    const nach = await prisma.backofficeAuftrag.findUnique({ where: { id: a.id } });
    expect(nach.status).toBe("einreichungsfertig");
    expect(nach.qualitaetFreigegebenAm).toBeTruthy();

    const zurueck = await service.gibZurNachbearbeitung(a.id, "Gehaltsabrechnung fehlt", akteur(pruefer));
    expect(zurueck.ok).toBe(true);
    const ev = await prisma.backofficeAuftragEreignis.findFirst({ where: { auftragId: a.id, art: "qc_rueckgabe" } });
    expect(ev.sichtbarFuerAuftraggeber).toBe(false);
    expect((await prisma.backofficeAuftrag.findUnique({ where: { id: a.id } })).status).toBe("nachbearbeitung");
  }, 60_000);

  it("Uebergabe nur nach Freigabe, genau ein Kontingentverbrauch, intern kostenlos", async () => {
    const a = await bisQc("Uebergabe");
    const zuFrueh = await service.uebergib(a.id, akteur(bearbeiter1));
    expect(zuFrueh.ok).toBe(false);
    expect((await service.gibQualitaetFrei(a.id, null, akteur(pruefer))).ok).toBe(true);
    expect((await service.uebergib(a.id, akteur(bearbeiter1))).ok).toBe(true);
    let ev = await prisma.backofficeKontingentEreignis.findMany({ where: { auftragId: a.id } });
    expect(ev).toHaveLength(1);
    expect(ev[0].art).toBe("verbrauch");
    expect(ev[0].menge).toBe(1);

    // Zweiter Zyklus: Nachbearbeitung -> QC -> Freigabe -> erneute Uebergabe
    expect((await service.fordereNachbearbeitungAn(a.id, "Bitte Seite 2 ergänzen", { userId: manager.id })).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId: a.id, nach: "qualitaetskontrolle", akteur: akteur(bearbeiter1) })).ok).toBe(true);
    expect((await service.gibQualitaetFrei(a.id, null, akteur(pruefer))).ok).toBe(true);
    expect((await service.uebergib(a.id, akteur(bearbeiter1))).ok).toBe(true);
    ev = await prisma.backofficeKontingentEreignis.findMany({ where: { auftragId: a.id } });
    expect(ev).toHaveLength(1);

    expect((await service.nimmAb(a.id, "Danke", { userId: manager.id, organizationId: orgA })).ok).toBe(true);
    expect((await service.nimmAb(a.id, null, { userId: manager.id, organizationId: orgA })).ok).toBe(false);

    const eigener = await service.eigenerAuftraggeber(orgA);
    const intern = await bisQc("Intern", eigener);
    expect((await service.gibQualitaetFrei(intern.id, null, akteur(pruefer))).ok).toBe(true);
    expect((await service.uebergib(intern.id, akteur(bearbeiter1))).ok).toBe(true);
    expect(await prisma.backofficeKontingentEreignis.count({ where: { auftragId: intern.id } })).toBe(0);
  }, 60_000);

  it("Rueckfragen: Entwurf stellen setzt den Wartezustand, Antwort nur einmal", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agY, antragsteller: { nachname: "Rueckfrage" }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!e.ok) throw new Error(e.grund);
    await service.wechsleStatus({ auftragId: e.wert.id, nach: "auftrag_pruefen", akteur: akteur(manager) });
    const r = await prisma.backofficeRueckfrage.create({ data: { auftragId: e.wert.id, betreff: "Kaufvertrag", frage: "Liegt der Entwurf vor?" } });
    expect((await service.stelleRueckfrage(r.id, akteur(manager))).ok).toBe(true);
    expect((await prisma.backofficeAuftrag.findUnique({ where: { id: e.wert.id } })).status).toBe("rueckfrage_auftraggeber");
    expect((await service.stelleRueckfrage(r.id, akteur(manager))).ok).toBe(false);
    expect((await service.beantworteRueckfrage(r.id, "Ja, anbei.", { userId: manager.id })).ok).toBe(true);
    expect((await service.beantworteRueckfrage(r.id, "Nochmal", { userId: manager.id })).ok).toBe(false);
  }, 60_000);

  it("Pause blockt Statuswechsel, Fortsetzen hebt sie auf", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: orgA, auftraggeberId: agY, antragsteller: { nachname: "Pause" }, auftragsart: "basis_pruefung", quelle: "manuell", erstelltVonId: manager.id,
    });
    if (!e.ok) throw new Error(e.grund);
    expect((await service.pausiere(e.wert.id, "Urlaub", akteur(manager))).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId: e.wert.id, nach: "auftrag_pruefen", akteur: akteur(manager) })).ok).toBe(false);
    expect((await service.setzeFort(e.wert.id, akteur(manager))).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId: e.wert.id, nach: "auftrag_pruefen", akteur: akteur(manager) })).ok).toBe(true);
  }, 60_000);
});
