import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((u: string) => {
    throw new Error("NEXT_REDIRECT:" + u);
  }),
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
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/**
 * Cross-Org-Uebergabe gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts
 *
 * A = Vertrieb (Eigentuemer der Akte), B = Backoffice-Partner, C = Dritter.
 * Der Auftrag von B an der Akte von A ist die Zugriffsbruecke: B sieht die
 * Unterlagen, nicht den Vertrieb; A sieht alles wie bisher; C nichts.
 */
describe.runIf(RUN)("Cross-Org-Uebergabe (PGlite)", () => {
  let prisma: any;
  let ctxModul: typeof import("@/lib/auth/context");
  let zugriff: typeof import("@/lib/auth/akte-zugriff");
  let service: typeof import("@/lib/backoffice/service");
  const org = { A: "", B: "", C: "" };
  const nutzer: Record<string, any> = {};
  let akteA: string;
  let dokA: string;
  let agAinB: string;
  let auftragId: string;

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
  const als = (u: any) => {
    aktuellerNutzer = ctx(u);
  };

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    for (const [k, slug] of [
      ["A", "xorg-a"],
      ["B", "xorg-b"],
      ["C", "xorg-c"],
    ]) {
      org[k as keyof typeof org] = (await prisma.organization.create({ data: { name: `Org ${k}`, slug } })).id;
    }
    await prisma.featureFlag.create({ data: { organizationId: org.B, key: "backoffice", enabled: true } });
    await prisma.featureFlag.create({ data: { organizationId: org.C, key: "backoffice", enabled: true } });
    const mk = async (key: string, orgId: string, role: string, rolle: string | null) => {
      nutzer[key] = await prisma.user.create({
        data: { organizationId: orgId, email: `${key}@x.de`, name: key, role, backofficeRolle: rolle },
      });
    };
    await mk("aVermittler", org.A, "vermittler", null);
    await mk("bManager", org.B, "org_admin", "manager");
    await mk("bBearbeiter1", org.B, "teammitglied", "bearbeiter");
    await mk("bBearbeiter2", org.B, "teammitglied", "bearbeiter");
    await mk("bOhneRolle", org.B, "vermittler", null);
    await mk("cManager", org.C, "org_admin", "manager");

    agAinB = (
      await prisma.backofficeAuftraggeber.create({
        data: { backofficeOrganizationId: org.B, organizationId: org.A, name: "Vertrieb A", abrechnungsmodell: "partner" },
      })
    ).id;

    akteA = (
      await prisma.case.create({
        data: {
          organizationId: org.A,
          caseNumber: "UP-2026-0100",
          quelle: "immoscout24",
          leadPhase: "selbstauskunft_laeuft",
          status: "upload_offen",
        },
      })
    ).id;
    dokA = (
      await prisma.document.create({
        data: {
          caseId: akteA,
          originalName: "gehalt.pdf",
          storageKey: `${org.A}/${akteA}/gehalt.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 10,
          uploadSource: "kunde",
          scanStatus: "virus_scan_clean",
          classificationStatus: "fertig",
          documentType: "gehaltsabrechnung",
          readable: true,
        },
      })
    ).id;

    ctxModul = await import("@/lib/auth/context");
    zugriff = await import("@/lib/auth/akte-zugriff");
    service = await import("@/lib/backoffice/service");
  }, 180_000);

  it("erzeugeAuftrag nimmt eine Akte des Auftraggebers an (Cross-Org)", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: org.B,
      auftraggeberId: agAinB,
      caseId: akteA,
      aktenbezeichnung: "Muster",
      auftragsart: "basis_pruefung",
      quelle: "vertrieb_uebergabe",
      erstelltVonId: nutzer.aVermittler.id,
    });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    auftragId = e.wert.id;
    const akte = await prisma.case.findUnique({ where: { id: akteA } });
    expect(akte.akteArt).toBe("vertrieb");
    expect(akte.organizationId).toBe(org.A);
    expect(akte.leadPhase).toBe("selbstauskunft_laeuft");
  });

  it("erzeugeAuftrag lehnt eine Akte ab, die weder B noch dem Auftraggeber gehoert", async () => {
    const fremd = (await prisma.case.create({ data: { organizationId: org.C, caseNumber: "UP-2026-0101" } })).id;
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: org.B,
      auftraggeberId: agAinB,
      caseId: fremd,
      auftragsart: "basis_pruefung",
      quelle: "manuell",
      erstelltVonId: nutzer.bManager.id,
    });
    expect(e.ok).toBe(false);
  });

  it("B-Manager sieht das Dokument der Fremdakte ueber akteSichtbarWhere", async () => {
    als(nutzer.bManager);
    const r = await zugriff.requireDocumentAccess(dokA);
    expect(r.dokument.organizationId).toBe(org.A);
  });

  it("requireAkteAccess verweigert die Fremdakte ohne Opt-in und erlaubt sie mit", async () => {
    als(nutzer.bManager);
    await expect(zugriff.requireAkteAccess(akteA)).rejects.toThrow("NEXT_NOT_FOUND");
    const r = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true });
    expect(r.fremd).toBe(true);
    const s = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true, schreibend: true });
    expect(s.akte.id).toBe(akteA);
  });

  it("entscheideAktenzugriff: A-Vermittler eigene Akte, B ohne Rolle 404, C 404", async () => {
    const akte = { id: akteA, organizationId: org.A, akteArt: "vertrieb" as const };
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.aVermittler), akte, {})).toEqual({ erlaubt: true, fremd: false });
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.bOhneRolle), akte, { fremdakteErlaubt: true })).toEqual({ erlaubt: false });
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.cManager), akte, { fremdakteErlaubt: true })).toEqual({ erlaubt: false });
  });

  it("B-Bearbeiter: frei ja, fremd zugewiesen nein", async () => {
    const akte = { id: akteA, organizationId: org.A, akteArt: "vertrieb" as const };
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter1), akte, { fremdakteErlaubt: true })).erlaubt).toBe(true);
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { bearbeiterId: nutzer.bBearbeiter2.id } });
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter1), akte, { fremdakteErlaubt: true })).erlaubt).toBe(false);
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter2), akte, { fremdakteErlaubt: true })).erlaubt).toBe(true);
    als(nutzer.bBearbeiter1);
    await expect(zugriff.requireDocumentAccess(dokA)).rejects.toThrow("NEXT_NOT_FOUND");
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { bearbeiterId: null } });
  });

  it("nach Abschluss: lesen ja, schreiben nein", async () => {
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { status: "abgeschlossen" } });
    als(nutzer.bManager);
    const r = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true });
    expect(r.fremd).toBe(true);
    await expect(zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true, schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(zugriff.requireDocumentAccess(dokA, { schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { status: "in_aufbereitung" } });
  });

  it("A-Akte taucht in keiner Vertriebsliste von B auf", async () => {
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    const n = await prisma.case.count({ where: { organizationId: org.B, ...nurVertrieb } });
    expect(n).toBe(0);
  });

  it("ladeUebergabeZiele: A sieht B als Partner, kein eigenes Backoffice; C sieht nur sich", async () => {
    const { ladeUebergabeZiele } = await import("@/lib/backoffice/uebergabe-ziele");
    const zieleA = await ladeUebergabeZiele(org.A);
    expect(zieleA.map((z) => z.schluessel)).toEqual([agAinB]);
    expect(zieleA[0]!.backofficeOrganizationId).toBe(org.B);
    expect(zieleA[0]!.intern).toBe(false);
    const zieleC = await ladeUebergabeZiele(org.C);
    expect(zieleC.map((z) => z.schluessel)).toEqual(["intern"]);
  });
});
