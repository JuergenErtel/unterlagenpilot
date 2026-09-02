import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
  process.env.VIRUS_SCANNER = "mock";
  process.env.MAILVERSAND = "aus";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => {
  const echt = (await orig()) as Record<string, unknown>;
  return { ...echt, after: vi.fn() };
});
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((u: string) => { throw new Error("NEXT_REDIRECT:" + u); }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const sendEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  isEmailConfigured: () => true,
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

let aktuellerNutzer: any = null;
vi.mock("@/lib/auth/context", async (orig) => {
  const echt = (await orig()) as Record<string, unknown>;
  return {
    ...echt,
    getCurrentContext: vi.fn(async () => aktuellerNutzer),
    requireContext: vi.fn(async () => {
      if (!aktuellerNutzer) throw new Error("NEXT_REDIRECT:/login");
      return aktuellerNutzer;
    }),
    requireCaseAccess: vi.fn(async (caseId: string, opt?: { schreibend?: boolean }) => {
      const zug = await import("@/lib/auth/akte-zugriff");
      const r = await zug.requireAkteAccess(caseId, opt);
      return { ctx: r.ctx, caseRow: { id: r.akte.id, organizationId: r.akte.organizationId, status: r.akte.status, akteArt: r.akte.akteArt } };
    }),
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/** Synthetische Kennungen - kommen in keinem Log und keinem Audit vor. */
const SYNTH_IBAN = "DE00 1234 5678 9012 3456 00";
const SYNTH_AUSWEIS = "L01X00T47";
const SYNTH_STEUER_ID = "12 345 678 901";

/**
 * Der vollstaendige Backoffice-Prozess mit ausschliesslich synthetischen Daten:
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-pilot-durchlauf-db.test.ts
 */
describe.runIf(RUN)("Pilotdurchlauf Backoffice (PGlite, synthetisch)", () => {
  let prisma: any;
  let service: typeof import("@/lib/backoffice/service");
  let cases: typeof import("@/lib/actions/cases");
  let pipeline: typeof import("@/lib/documents/pipeline");
  let aggregat: typeof import("@/lib/cases/service");
  let heute: typeof import("@/lib/cases/heute-daten");
  let dashboard: typeof import("@/lib/cases/dashboard");
  let zugriff: typeof import("@/lib/backoffice/zugriff");
  let auftraegeMod: typeof import("@/lib/backoffice/auftraege");

  const org = { backoffice: "", auftraggeber: "" };
  const nutzer: Record<string, any> = {};
  let auftraggeberId = "";
  let kontaktId = "";
  let auftragId = "";
  let caseId = "";
  const dokumentIds: string[] = [];

  const ctx = (u: any) => ({
    organizationId: u.organizationId,
    organizationName: "x",
    userId: u.id,
    userName: u.name,
    role: u.role,
    platformAdmin: false,
    backofficeRolle: u.backofficeRolle,
    isDemo: false,
  });
  const als = (u: any) => { aktuellerNutzer = ctx(u); };
  const akteur = (u: any) => ({ userId: u.id, organizationId: u.organizationId, backofficeRolle: u.backofficeRolle });

  async function pdf(text: string): Promise<Buffer> {
    const PDFDocument = (await import("pdfkit")).default;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const teile: Buffer[] = [];
      doc.on("data", (d: Buffer) => teile.push(d));
      doc.on("end", () => resolve(Buffer.concat(teile)));
      doc.on("error", reject);
      doc.text(text);
      doc.end();
    });
  }

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    org.backoffice = (await prisma.organization.create({ data: { name: "Test-Backoffice GmbH", slug: "pilot-backoffice" } })).id;
    org.auftraggeber = (await prisma.organization.create({ data: { name: "Test-Vermittlung KG", slug: "pilot-vermittlung" } })).id;
    await prisma.featureFlag.create({ data: { organizationId: org.backoffice, key: "backoffice", enabled: true } });
    const mk = async (key: string, orgId: string, role: string, rolle: string | null) => {
      nutzer[key] = await prisma.user.create({ data: { organizationId: orgId, email: `${key}@pilot.test`, name: `Synth ${key}`, role, backofficeRolle: rolle } });
    };
    await mk("manager", org.backoffice, "org_admin", "manager");
    await mk("bearbeiter", org.backoffice, "teammitglied", "bearbeiter");
    await mk("pruefer", org.backoffice, "teammitglied", "pruefer");
    await mk("vermittler", org.backoffice, "vermittler", null);
    await mk("agAdmin", org.auftraggeber, "org_admin", null);
    // Ein bestehender Vertriebsfall im Backoffice-Haus, damit die
    // Vertriebslisten etwas zu zeigen haetten - und das Backoffice nicht.
    await prisma.case.create({ data: { organizationId: org.backoffice, caseNumber: "UP-PILOT-0001", quelle: "immoscout24" } });

    service = await import("@/lib/backoffice/service");
    cases = await import("@/lib/actions/cases");
    pipeline = await import("@/lib/documents/pipeline");
    aggregat = await import("@/lib/cases/service");
    heute = await import("@/lib/cases/heute-daten");
    dashboard = await import("@/lib/cases/dashboard");
    zugriff = await import("@/lib/backoffice/zugriff");
    auftraegeMod = await import("@/lib/backoffice/auftraege");
  }, 180_000);

  it("1-3 Auftraggeber anlegen, Organisation verknuepfen, Ansprechpartner anlegen", async () => {
    const ag = await prisma.backofficeAuftraggeber.create({
      data: {
        backofficeOrganizationId: org.backoffice,
        organizationId: org.auftraggeber,
        name: "Test-Vermittlung KG",
        abrechnungsmodell: "abo",
        kontingentMonatlich: 10,
        slaTage: 3,
      },
    });
    auftraggeberId = ag.id;
    kontaktId = (await prisma.backofficeAuftraggeberKontakt.create({
      data: { auftraggeberId, name: "Synth Kontakt", email: "agadmin@pilot.test", userId: nutzer.agAdmin.id },
    })).id;
    // Portal sieht den Backoffice-Partner
    als(nutzer.agAdmin);
    const portal = await zugriff.requirePortal();
    expect(portal.auftraggeber.map((a) => a.id)).toEqual([auftraggeberId]);
    expect(portal.istAdmin).toBe(true);
  }, 60_000);

  it("4-7 Auftrag mit Antragsteller, Leistungsbausteinen, Prioritaet und Frist anlegen", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: org.backoffice,
      auftraggeberId,
      kontaktId,
      antragsteller: { vorname: "Erika", nachname: "Musterfrau", email: "erika@pilot.test" },
      auftragsart: "vollstaendige_aufbereitung",
      leistungen: ["unterlagen_pruefen", "daten_erfassen", "plausibilitaet", "nachforderung"],
      prioritaet: "hoch",
      financingType: "kauf",
      employmentType: "angestellter",
      quelle: "portal",
      erstelltVonId: nutzer.agAdmin.id,
    });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    auftragId = e.wert.id;
    caseId = e.wert.caseId;
    const a = await prisma.backofficeAuftrag.findUnique({ where: { id: auftragId } });
    expect(a.prioritaet).toBe("hoch");
    expect(a.faelligAm).toBeTruthy();
    expect(a.leistungen).toEqual(["unterlagen_pruefen", "daten_erfassen", "plausibilitaet", "nachforderung"]);
    const frist = await service.setzePrioritaetUndFrist(auftragId, { prioritaet: "dringend" }, akteur(nutzer.manager));
    expect(frist.ok).toBe(true);
    // Der Bearbeiter darf die Steuerung nicht
    expect((await service.setzePrioritaetUndFrist(auftragId, { prioritaet: "niedrig" }, akteur(nutzer.bearbeiter))).ok).toBe(false);
  }, 60_000);

  it("8 Bearbeiter zuweisen und Auftrag in die Aufbereitung nehmen", async () => {
    expect((await service.weiseZu(auftragId, nutzer.bearbeiter.id, akteur(nutzer.manager))).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId, nach: "auftrag_pruefen", akteur: akteur(nutzer.bearbeiter) })).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId, nach: "in_aufbereitung", akteur: akteur(nutzer.bearbeiter) })).ok).toBe(true);
  }, 60_000);

  it("9-10 Synthetische Dokumente hochladen, klassifizieren, fehlende Unterlagen erkennen", async () => {
    const dateien = [
      ["gehaltsabrechnung_2026-07.pdf", `Gehaltsabrechnung Juli 2026 Erika Musterfrau Brutto 4.200,00 Netto 2.780,00 IBAN ${SYNTH_IBAN}`],
      ["personalausweis.pdf", `Personalausweis Bundesrepublik Deutschland Musterfrau Erika Nr. ${SYNTH_AUSWEIS}`],
      ["steuerbescheid_2025.pdf", `Einkommensteuerbescheid 2025 Finanzamt Musterstadt Steuer-ID ${SYNTH_STEUER_ID}`],
    ] as const;
    for (const [name, text] of dateien) {
      const buffer = await pdf(text);
      const r = await pipeline.processUpload({
        organizationId: org.backoffice,
        caseId,
        file: { name, type: "application/pdf", size: buffer.byteLength, buffer },
        uploadSource: "vermittler",
        actorUserId: nutzer.agAdmin.id,
      });
      expect(r.ok, `${name}: ${r.reason ?? ""}`).toBe(true);
      dokumentIds.push(r.documentId!);
      await pipeline.analysiereDokument(r.documentId!);
    }
    const docs = await prisma.document.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
    expect(docs).toHaveLength(3);
    for (const d of docs) {
      expect(d.scanStatus).not.toBe("virus_scan_failed");
      expect(d.classificationStatus).toBe("fertig");
    }
    const agg = await aggregat.getCaseAggregate(caseId);
    expect(agg.documentCount).toBe(3);
    expect(agg.missing.length).toBeGreaterThan(0);
    const zeile = (await auftraegeMod.ladeAuftragZeilen({ id: auftragId }))[0]!;
    expect(zeile.fehlendeUnterlagen).toBeGreaterThan(0);
    expect(zeile.ungepruefteDokumente).toBeGreaterThan(0);
  }, 120_000);

  it("11-13 Rueckfrage als Entwurf, bewusst gestellt, nichts versendet, intern beantwortet", async () => {
    const r = await prisma.backofficeRueckfrage.create({
      data: { auftragId, betreff: "Kaufvertragsentwurf", frage: "Liegt der notarielle Entwurf bereits vor?" },
    });
    // Ein Entwurf ist im Portal unsichtbar
    expect((await auftraegeMod.ladeRueckfragen(auftragId, true)).map((x: any) => x.id)).not.toContain(r.id);
    expect((await service.stelleRueckfrage(r.id, akteur(nutzer.bearbeiter))).ok).toBe(true);
    expect((await auftraegeMod.ladeRueckfragen(auftragId, true)).map((x: any) => x.id)).toContain(r.id);
    expect((await prisma.backofficeAuftrag.findUnique({ where: { id: auftragId } })).status).toBe("rueckfrage_auftraggeber");
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await service.beantworteRueckfrage(r.id, "Ja, der Entwurf liegt vor und wird hochgeladen.", { userId: nutzer.agAdmin.id })).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId, nach: "in_aufbereitung", akteur: akteur(nutzer.bearbeiter) })).ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  }, 60_000);

  it("14-16 Dokumente pruefen, Auffaelligkeit vorhanden, Bearbeitung abschliessen", async () => {
    als(nutzer.bearbeiter);
    for (const id of dokumentIds) await cases.setDocumentReview(id, "akzeptiert");
    const akzeptiert = await prisma.document.count({ where: { caseId, reviewStatus: "akzeptiert" } });
    expect(akzeptiert).toBe(3);
    // Ein Vermittler ohne Backoffice-Rolle kommt an dieselben Dokumente nicht heran
    als(nutzer.vermittler);
    await expect(cases.reopenDocument(dokumentIds[0]!)).rejects.toThrow("NEXT_NOT_FOUND");
    // Auffaelligkeit: Plausibilitaet oder Dokumentwarnung muss sichtbar sein
    const agg = await aggregat.getCaseAggregate(caseId);
    const warnungen = await prisma.documentWarning.count({ where: { document: { caseId } } });
    expect(agg.plausibility.length + warnungen).toBeGreaterThan(0);
    // interne Notiz mit synthetischer Kennung - darf nie ins Audit
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { interneNotizen: `Pruefhinweis: IBAN ${SYNTH_IBAN} stimmt mit Kontoauszug ueberein` } });
    expect((await service.wechsleStatus({ auftragId, nach: "qualitaetskontrolle", akteur: akteur(nutzer.bearbeiter) })).ok).toBe(true);
  }, 60_000);

  it("17-20 Qualitaetskontrolle durch andere Person, Vier-Augen, Freigabe, einreichungsfertig", async () => {
    expect((await service.gibQualitaetFrei(auftragId, null, akteur(nutzer.bearbeiter))).ok).toBe(false);
    expect((await service.uebergib(auftragId, akteur(nutzer.bearbeiter))).ok).toBe(false);
    const frei = await service.gibQualitaetFrei(auftragId, "Geprueft: Unterlagen vollstaendig fuer Basis", akteur(nutzer.pruefer));
    expect(frei.ok).toBe(true);
    const a = await prisma.backofficeAuftrag.findUnique({ where: { id: auftragId } });
    expect(a.status).toBe("einreichungsfertig");
    expect(a.qualitaetFreigegebenVonId).toBe(nutzer.pruefer.id);
    expect(a.qualitaetFreigegebenAm).toBeTruthy();
  }, 60_000);

  it("21-24 Uebergabe, Abnahme, Abschluss, Kontingent genau einmal", async () => {
    expect((await service.uebergib(auftragId, akteur(nutzer.bearbeiter))).ok).toBe(true);
    // Portal sieht das Ergebnis, den Verlauf ohne interne Eintraege
    als(nutzer.agAdmin);
    const { auftrag } = await zugriff.requirePortalAuftrag(auftragId);
    expect(auftrag.uebergebenAm).toBeTruthy();
    const verlaufExtern = await auftraegeMod.ladeVerlauf(auftragId, true);
    expect(verlaufExtern.every((e: any) => e.sichtbarFuerAuftraggeber)).toBe(true);
    expect(verlaufExtern.some((e: any) => e.art === "uebergabe")).toBe(true);
    expect((await service.nimmAb(auftragId, "Vielen Dank", { userId: nutzer.agAdmin.id, organizationId: org.backoffice })).ok).toBe(true);
    expect((await service.wechsleStatus({ auftragId, nach: "abgeschlossen", akteur: akteur(nutzer.manager) })).ok).toBe(true);
    const ereignisse = await prisma.backofficeKontingentEreignis.findMany({ where: { auftraggeberId } });
    expect(ereignisse).toHaveLength(1);
    expect(ereignisse[0].art).toBe("verbrauch");
    expect(ereignisse[0].menge).toBe(1);
    // Zweite Uebergabe ist nicht moeglich, ein zweiter Verbrauch entsteht nicht
    expect((await service.uebergib(auftragId, akteur(nutzer.manager))).ok).toBe(false);
    expect(await prisma.backofficeKontingentEreignis.count({ where: { auftraggeberId } })).toBe(1);
    // Abgeschlossen: keine Dokument-Mutation mehr, Lesen weiter moeglich
    als(nutzer.manager);
    await expect(cases.reopenDocument(dokumentIds[0]!)).rejects.toThrow("NEXT_NOT_FOUND");
    const zug = await import("@/lib/auth/akte-zugriff");
    expect((await zug.requireDocumentAccess(dokumentIds[0]!)).dokument.caseId).toBe(caseId);
  }, 60_000);

  it("25-26 Audit-Log vollstaendig und ohne sensible Klartexte", async () => {
    const audits = await prisma.auditLog.findMany({ where: { organizationId: org.backoffice } });
    const aktionen = new Set(audits.map((a: any) => a.action));
    for (const erwartet of [
      "backoffice.auftrag_erstellt",
      "backoffice.zugewiesen",
      "backoffice.status_geaendert",
      "backoffice.rueckfrage_gestellt",
      "backoffice.rueckfrage_beantwortet",
      "backoffice.qc_freigegeben",
      "backoffice.uebergeben",
      "backoffice.abgenommen",
      // Die Pipeline protokolliert den Upload als Scan-Ereignis; das
      // Portal ergaenzt backoffice.dokument_hochgeladen in der Action.
      "document.scanned",
      "document.reviewed",
      "access.denied",
    ]) {
      expect(aktionen.has(erwartet), `Audit-Aktion fehlt: ${erwartet}`).toBe(true);
    }
    const gesamt = JSON.stringify(audits.map((a: any) => a.metadata ?? {}));
    for (const geheim of [SYNTH_IBAN, SYNTH_IBAN.replace(/\s/g, ""), SYNTH_AUSWEIS, SYNTH_STEUER_ID, "Pruefhinweis", "Liegt der notarielle", "organizations/"]) {
      expect(gesamt, `Audit-Metadaten enthalten: ${geheim}`).not.toContain(geheim);
    }
    // Der Verlauf traegt die Begruendungen (fachlich noetig), aber nie die internen Notizen
    const verlauf = await prisma.backofficeAuftragEreignis.findMany({ where: { auftragId } });
    expect(JSON.stringify(verlauf)).not.toContain(SYNTH_IBAN);
  }, 60_000);

  it("27 Der Auftrag erscheint nirgends im Vertrieb", async () => {
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    expect(await prisma.case.count({ where: { organizationId: org.backoffice, ...nurVertrieb } })).toBe(1);
    const h = await heute.ladeHeute(org.backoffice);
    expect(h.aufgaben.some((a: any) => a.caseId === caseId)).toBe(false);
    const d = await dashboard.getDashboardData(org.backoffice);
    expect(d.kpis.offen).toBe(1);
    expect(d.kpis.neueLeads).toBe(1);
    // Kein Vertriebsfeld wurde vom Backoffice angefasst
    const akte = await prisma.case.findUnique({ where: { id: caseId } });
    expect(akte.leadPhase).toBe("neu");
    expect(akte.quelle).toBe("unbekannt");
    expect(akte.verlorenAm).toBeNull();
    expect(akte.abschlussdatum).toBeNull();
    expect(akte.darlehensbetrag).toBeNull();
    expect(akte.courtageProzent).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  }, 60_000);
});
