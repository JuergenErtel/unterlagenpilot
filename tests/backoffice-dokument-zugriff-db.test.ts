import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
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
    // requireCaseAccess ruft intern das echte requireContext (Cookies) - hier
    // ueber den zentralen Guard nachgebaut, der den gemockten Kontext nutzt.
    requireCaseAccess: vi.fn(async (caseId: string, opt?: { schreibend?: boolean }) => {
      const zug = await import("@/lib/auth/akte-zugriff");
      const r = await zug.requireAkteAccess(caseId, opt);
      return { ctx: r.ctx, caseRow: { id: r.akte.id, organizationId: r.akte.organizationId, status: r.akte.status, akteArt: r.akte.akteArt } };
    }),
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/**
 * Negative Sicherheitstests: Die Kenntnis einer Dokument-ID reicht fuer
 * nichts. Jede Rolle, die NICHT darf, bekommt dieselbe Antwort wie "gibt es
 * nicht" (404 / NEXT_NOT_FOUND), und es passiert keine Mutation.
 *
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-dokument-zugriff-db.test.ts
 */
describe.runIf(RUN)("Dokumentzugriff (PGlite)", () => {
  let prisma: any;
  let zugriff: typeof import("@/lib/auth/akte-zugriff");
  let cases: typeof import("@/lib/actions/cases");
  let review: typeof import("@/lib/actions/review");
  let aufteilung: typeof import("@/lib/actions/aufteilung");
  let download: typeof import("@/app/api/documents/[id]/download/route");
  let zipRoute: typeof import("@/app/api/cases/[id]/zip/route");
  let dsgvoRoute: typeof import("@/app/api/cases/[id]/dsgvo/route");
  let portalRoute: typeof import("@/lib/backoffice/portal-route");
  let portalDok: typeof import("@/app/api/portal/auftraege/[id]/dokumente/[documentId]/route");
  let uploadLink: typeof import("@/lib/security/upload-link");
  let kontext: typeof import("@/lib/auth/context");

  const org = { A: "", B: "", C: "", D: "" };
  const nutzer: Record<string, any> = {};
  let vertriebsAkte: string;
  let vertriebsDok: string;
  let boAkte: string;
  let boDok: string;
  let boAuftrag: string;
  let boAkteFertig: string;
  let boDokFertig: string;
  let auftragC2: string;
  let dokC2: string;

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
  const als = (u: any | null) => { aktuellerNutzer = u ? ctx(u) : null; };

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

  async function dokument(orgId: string, caseId: string, name: string) {
    const storage = (await import("@/lib/storage")).getStorage();
    const buffer = await pdf(`Testdokument ${name}`);
    const stored = await storage.put({ organizationId: orgId, caseId, originalName: name, mimeType: "application/pdf", buffer });
    const d = await prisma.document.create({
      data: {
        caseId,
        originalName: name,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        scanStatus: "virus_scan_clean",
        classificationStatus: "fertig",
        documentType: "gehaltsabrechnung",
        readable: true,
      },
    });
    return d.id as string;
  }

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    for (const [k, slug] of [["A", "dz-a"], ["B", "dz-b"], ["C", "dz-c"], ["D", "dz-d"]] as const) {
      org[k] = (await prisma.organization.create({ data: { name: `Org ${k}`, slug } })).id;
    }
    await prisma.featureFlag.create({ data: { organizationId: org.A, key: "backoffice", enabled: true } });
    const mk = async (key: string, orgId: string, role: string, rolle: string | null) => {
      nutzer[key] = await prisma.user.create({ data: { organizationId: orgId, email: `${key}@dz.de`, name: key, role, backofficeRolle: rolle } });
    };
    await mk("vermittler", org.A, "vermittler", null);
    await mk("orgAdmin", org.A, "org_admin", null);
    await mk("manager", org.A, "org_admin", "manager");
    await mk("bearbeiter1", org.A, "teammitglied", "bearbeiter");
    await mk("bearbeiter2", org.A, "teammitglied", "bearbeiter");
    await mk("pruefer", org.A, "teammitglied", "pruefer");
    await mk("fremd", org.B, "org_admin", "manager");
    await mk("cAdmin", org.C, "org_admin", null);
    await mk("cMit", org.C, "teammitglied", null);
    await mk("dAdmin", org.D, "org_admin", null);

    vertriebsAkte = (await prisma.case.create({ data: { organizationId: org.A, caseNumber: "UP-DZ-1" } })).id;
    vertriebsDok = await dokument(org.A, vertriebsAkte, "vertrieb.pdf");

    const agC = await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: org.A, organizationId: org.C, name: "AG C" } });
    const kontaktMit = await prisma.backofficeAuftraggeberKontakt.create({ data: { auftraggeberId: agC.id, name: "cMit", userId: nutzer.cMit.id, darfAlleAuftraegeSehen: false } });
    const agD = await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: org.A, organizationId: org.D, name: "AG D" } });

    boAkte = (await prisma.case.create({ data: { organizationId: org.A, caseNumber: "BO-DZ-1", akteArt: "backoffice" } })).id;
    boDok = await dokument(org.A, boAkte, "backoffice.pdf");
    boAuftrag = (await prisma.backofficeAuftrag.create({
      data: { backofficeOrganizationId: org.A, auftragsnummer: "BO-DZ-1", auftraggeberId: agC.id, kontaktId: kontaktMit.id, caseId: boAkte, aktenbezeichnung: "BO1", auftragsart: "basis_pruefung", status: "in_aufbereitung" },
    })).id;

    // Auftrag von Auftraggeber D (Org D) - fuer "A sieht nie B"
    const akteD = (await prisma.case.create({ data: { organizationId: org.A, caseNumber: "BO-DZ-2", akteArt: "backoffice" } })).id;
    dokC2 = await dokument(org.A, akteD, "auftraggeber-d.pdf");
    auftragC2 = (await prisma.backofficeAuftrag.create({
      data: { backofficeOrganizationId: org.A, auftragsnummer: "BO-DZ-2", auftraggeberId: agD.id, caseId: akteD, aktenbezeichnung: "BO2", auftragsart: "basis_pruefung", status: "uebergeben", uebergebenAm: new Date() },
    })).id;

    // Abgeschlossener Auftrag - lesen ja, schreiben nein
    boAkteFertig = (await prisma.case.create({ data: { organizationId: org.A, caseNumber: "BO-DZ-3", akteArt: "backoffice" } })).id;
    boDokFertig = await dokument(org.A, boAkteFertig, "fertig.pdf");
    await prisma.backofficeAuftrag.create({
      data: { backofficeOrganizationId: org.A, auftragsnummer: "BO-DZ-3", auftraggeberId: agC.id, caseId: boAkteFertig, aktenbezeichnung: "BO3", auftragsart: "basis_pruefung", status: "abgeschlossen" },
    });

    zugriff = await import("@/lib/auth/akte-zugriff");
    cases = await import("@/lib/actions/cases");
    review = await import("@/lib/actions/review");
    aufteilung = await import("@/lib/actions/aufteilung");
    download = await import("@/app/api/documents/[id]/download/route");
    zipRoute = await import("@/app/api/cases/[id]/zip/route");
    dsgvoRoute = await import("@/app/api/cases/[id]/dsgvo/route");
    portalRoute = await import("@/lib/backoffice/portal-route");
    portalDok = await import("@/app/api/portal/auftraege/[id]/dokumente/[documentId]/route");
    uploadLink = await import("@/lib/security/upload-link");
    kontext = await import("@/lib/auth/context");
  }, 180_000);

  const req = (url = "http://localhost/x") => new (require("next/server").NextRequest)(url);
  const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

  async function statusVon(fn: () => Promise<Response>): Promise<number> {
    return (await fn()).status;
  }

  // -------------------------------------------------------------------------
  it("Fremde Organisation: Vorschau, Download, Metadaten, Mutation, Export - alles 404", async () => {
    als(nutzer.fremd);
    await expect(zugriff.requireDocumentAccess(vertriebsDok)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await statusVon(() => download.GET(req("http://localhost/x?preview=1"), params({ id: vertriebsDok })))).toBe(404);
    expect(await statusVon(() => download.GET(req(), params({ id: boDok })))).toBe(404);
    expect(await statusVon(() => zipRoute.GET(req(), params({ id: boAkte })))).toBe(404);
    expect(await statusVon(() => dsgvoRoute.GET(req(), params({ id: boAkte })))).toBe(404);
    await expect(cases.setDocumentReview(boDok, "akzeptiert")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(review.reclassifyDocument(boDok, "personalausweis")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(review.assignDocumentApplicant(boDok, null)).rejects.toThrow("NEXT_NOT_FOUND");
    const unveraendert = await prisma.document.findUnique({ where: { id: boDok } });
    expect(unveraendert.reviewStatus).toBe("offen");
    expect(unveraendert.documentType).toBe("gehaltsabrechnung");
  }, 60_000);

  it("Gleiche Organisation ohne Backoffice-Rolle: kein Zugriff auf Backoffice-Dokumente - Vertriebsdokumente bleiben erreichbar", async () => {
    als(nutzer.vermittler);
    // Vertriebsakte: darf
    expect((await zugriff.requireDocumentAccess(vertriebsDok)).dokument.caseId).toBe(vertriebsAkte);
    expect(await statusVon(() => download.GET(req(), params({ id: vertriebsDok })))).toBe(200);
    // Backoffice-Akte: darf nicht - identische Antwort wie "gibt es nicht"
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(zugriff.requireDocumentAccess("gibt-es-nicht")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await statusVon(() => download.GET(req("http://localhost/x?preview=1"), params({ id: boDok })))).toBe(404);
    expect(await statusVon(() => zipRoute.GET(req(), params({ id: boAkte })))).toBe(404);
    expect(await statusVon(() => dsgvoRoute.GET(req(), params({ id: boAkte })))).toBe(404);
    await expect(cases.setDocumentReview(boDok, "abgelehnt", "x")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(cases.reopenDocument(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(review.reclassifyDocument(boDok, "personalausweis")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(zugriff.requireAkteAccess(boAkte)).rejects.toThrow("NEXT_NOT_FOUND");
    // Org-Admin ohne Backoffice-Rolle ebenso
    als(nutzer.orgAdmin);
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    // Fehlversuche stehen im Audit - nur mit IDs
    const audits = await prisma.auditLog.findMany({ where: { action: "access.denied", entityId: boDok } });
    expect(audits.length).toBeGreaterThan(0);
    for (const a of audits) {
      const meta = JSON.stringify(a.metadata ?? {});
      expect(meta).not.toContain("backoffice.pdf");
      expect(meta).not.toContain("organizations/");
    }
  }, 60_000);

  it("Backoffice-Bearbeiter: nur eigene und freie Auftraege - Manager und Pruefer alle", async () => {
    als(nutzer.bearbeiter1);
    expect((await zugriff.requireDocumentAccess(boDok)).dokument.akteArt).toBe("backoffice");
    await prisma.backofficeAuftrag.update({ where: { id: boAuftrag }, data: { bearbeiterId: nutzer.bearbeiter2.id } });
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await statusVon(() => download.GET(req(), params({ id: boDok })))).toBe(404);
    als(nutzer.bearbeiter2);
    expect((await zugriff.requireDocumentAccess(boDok, { schreibend: true })).dokument.id).toBe(boDok);
    als(nutzer.pruefer);
    expect((await zugriff.requireDocumentAccess(boDok)).dokument.id).toBe(boDok);
    als(nutzer.manager);
    expect(await statusVon(() => download.GET(req(), params({ id: boDok })))).toBe(200);
    expect(await statusVon(() => zipRoute.GET(req(), params({ id: boAkte })))).toBe(200);
    await prisma.backofficeAuftrag.update({ where: { id: boAuftrag }, data: { bearbeiterId: null } });
  }, 60_000);

  it("Abgeschlossener Auftrag: lesen ja, schreiben nein", async () => {
    als(nutzer.manager);
    expect((await zugriff.requireDocumentAccess(boDokFertig)).dokument.id).toBe(boDokFertig);
    await expect(zugriff.requireDocumentAccess(boDokFertig, { schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(cases.setDocumentReview(boDokFertig, "akzeptiert")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(kontext.requireCaseAccess(boAkteFertig, { schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await kontext.requireCaseAccess(boAkteFertig)).caseRow.id).toBe(boAkteFertig);
  }, 60_000);

  it("Portal: Auftraggeber C sieht nie Dokumente von Auftraggeber D, Kontaktbindung greift, IDs umgehen den Filter nicht", async () => {
    als(nutzer.cAdmin);
    let r = await portalRoute.ladePortalAuftragFuerRoute(boAuftrag);
    expect(r.status).toBe(200);
    expect(await statusVon(() => portalDok.GET(req(), params({ id: boAuftrag, documentId: boDok })))).toBe(200);
    // Dokument aus dem Auftrag von D ueber den EIGENEN Auftrag anfordern
    expect(await statusVon(() => portalDok.GET(req(), params({ id: boAuftrag, documentId: dokC2 })))).toBe(404);
    // Auftrag von D direkt
    expect((await portalRoute.ladePortalAuftragFuerRoute(auftragC2)).status).toBe(404);
    expect(await statusVon(() => portalDok.GET(req(), params({ id: auftragC2, documentId: dokC2 })))).toBe(404);
    // Vertriebsdokument von A ueber den Auftrag anfordern
    expect(await statusVon(() => portalDok.GET(req(), params({ id: boAuftrag, documentId: vertriebsDok })))).toBe(404);
    // Portal-Nutzer haben KEINEN internen Zugriff
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await statusVon(() => download.GET(req(), params({ id: boDok })))).toBe(404);

    // Mitarbeiter mit Kontaktbindung: nur der Auftrag, an dem sein Kontakt haengt
    als(nutzer.cMit);
    expect((await portalRoute.ladePortalAuftragFuerRoute(boAuftrag)).status).toBe(200);
    await prisma.backofficeAuftrag.update({ where: { id: boAuftrag }, data: { kontaktId: null } });
    expect((await portalRoute.ladePortalAuftragFuerRoute(boAuftrag)).status).toBe(404);
    expect(await statusVon(() => portalDok.GET(req(), params({ id: boAuftrag, documentId: boDok })))).toBe(404);

    als(nutzer.dAdmin);
    expect((await portalRoute.ladePortalAuftragFuerRoute(boAuftrag)).status).toBe(404);
    als(nutzer.fremd);
    expect((await portalRoute.ladePortalAuftragFuerRoute(boAuftrag)).status).toBe(404);
  }, 60_000);

  it("Nicht angemeldet: 401 an Routen, Redirect in Actions, keine signierte URL", async () => {
    als(null);
    expect(await statusVon(() => download.GET(req(), params({ id: vertriebsDok })))).toBe(401);
    expect(await statusVon(() => zipRoute.GET(req(), params({ id: vertriebsAkte })))).toBe(401);
    expect(await statusVon(() => dsgvoRoute.GET(req(), params({ id: vertriebsAkte })))).toBe(401);
    expect(await statusVon(() => portalDok.GET(req(), params({ id: boAuftrag, documentId: boDok })))).toBe(401);
    await expect(zugriff.requireDocumentAccess(vertriebsDok)).rejects.toThrow("NEXT_REDIRECT");
    await expect(cases.setDocumentReview(vertriebsDok, "akzeptiert")).rejects.toThrow("NEXT_REDIRECT");
  }, 60_000);

  it("Manipulierte Beziehungen: Formular-caseId, Link-IDs und Auftrags-IDs zaehlen nicht - die Datenbank entscheidet", async () => {
    als(nutzer.vermittler);
    // Aufteilen: Backoffice-Dokument mit eigener Vertriebs-caseId untergeschoben
    const fd = new FormData();
    fd.set("documentId", boDok);
    fd.set("caseId", vertriebsAkte);
    await expect(aufteilung.aufteilenAction(fd)).rejects.toThrow("NEXT_NOT_FOUND");

    // Upload-Link einer Backoffice-Akte ueber die eigene Vertriebsakte widerrufen
    const link = await uploadLink.createSecureUploadLink(boAkte, new Date(Date.now() + 86_400_000), { organizationId: org.A, actorUserId: nutzer.manager.id });
    await cases.deactivateUploadLinkAction(vertriebsAkte, link.linkId);
    expect((await prisma.uploadLink.findUnique({ where: { id: link.linkId } })).active).toBe(true);

    // Backoffice-Manager mit der RICHTIGEN Akte darf widerrufen
    als(nutzer.manager);
    await cases.deactivateUploadLinkAction(boAkte, link.linkId);
    expect((await prisma.uploadLink.findUnique({ where: { id: link.linkId } })).active).toBe(false);
  }, 60_000);

  it("Upload-Token: nur Upload, gebunden an die Akte, tot nach Ablauf und Widerruf", async () => {
    const link = await uploadLink.createSecureUploadLink(boAkte, new Date(Date.now() + 86_400_000), { organizationId: org.A, actorUserId: nutzer.manager.id });
    const token = link.url.split("/").pop()!;
    const access = await kontext.resolveUploadToken(token);
    expect(access?.caseId).toBe(boAkte);
    // Das Token ist kein Login: Aktionen mit Kontext bleiben verschlossen
    als(null);
    await expect(zugriff.requireDocumentAccess(boDok)).rejects.toThrow("NEXT_REDIRECT");
    // Widerruf
    await prisma.uploadLink.update({ where: { id: link.linkId }, data: { active: false } });
    expect(await kontext.resolveUploadToken(token)).toBeNull();
    // Ablauf
    await prisma.uploadLink.update({ where: { id: link.linkId }, data: { active: true, expiresAt: new Date(Date.now() - 1000) } });
    expect(await kontext.resolveUploadToken(token)).toBeNull();
    // Ein fremdes Token oeffnet nichts
    expect(await kontext.resolveUploadToken("nicht-vorhanden-1234567890abcdef")).toBeNull();
  }, 60_000);

  it("Berechtigte Aktion laeuft durch - der Guard sperrt nicht zu viel", async () => {
    als(nutzer.manager);
    await cases.setDocumentReview(boDok, "abgelehnt", "Unscharf");
    expect((await prisma.document.findUnique({ where: { id: boDok } })).reviewStatus).toBe("abgelehnt");
    await cases.reopenDocument(boDok);
    expect((await prisma.document.findUnique({ where: { id: boDok } })).reviewStatus).toBe("offen");
    als(nutzer.vermittler);
    await cases.setDocumentReview(vertriebsDok, "abgelehnt", "Unscharf");
    expect((await prisma.document.findUnique({ where: { id: vertriebsDok } })).reviewStatus).toBe("abgelehnt");
  }, 60_000);
});
