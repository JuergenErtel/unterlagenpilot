import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/**
 * Zugriffsschutz des Backoffice gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-zugriff-db.test.ts
 */
describe.runIf(RUN)("Backoffice-Zugriff (PGlite)", () => {
  let prisma: any;
  let zugriff: typeof import("@/lib/backoffice/zugriff");
  let auftraege: typeof import("@/lib/backoffice/auftraege");
  let ctxModul: typeof import("@/lib/auth/context");
  const org = { A: "", B: "", C: "", D: "", E: "" };
  const nutzer: Record<string, any> = {};
  let a1: string;
  let a2: string;
  let a3: string;
  let boAkte: string;

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

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    for (const [k, slug] of [["A", "bo-zugriff-a"], ["B", "bo-zugriff-b"], ["C", "bo-zugriff-c"], ["D", "bo-zugriff-d"], ["E", "bo-zugriff-e"]]) {
      org[k as keyof typeof org] = (await prisma.organization.create({ data: { name: `Org ${k}`, slug } })).id;
    }
    await prisma.featureFlag.create({ data: { organizationId: org.A, key: "backoffice", enabled: true } });
    await prisma.featureFlag.create({ data: { organizationId: org.E, key: "backoffice", enabled: false } });
    const mk = async (key: string, orgId: string, role: string, rolle: string | null) => {
      nutzer[key] = await prisma.user.create({ data: { organizationId: orgId, email: `${key}@t.de`, name: key, role, backofficeRolle: rolle } });
    };
    await mk("manager", org.A, "org_admin", "manager");
    await mk("bearbeiter1", org.A, "teammitglied", "bearbeiter");
    await mk("bearbeiter2", org.A, "teammitglied", "bearbeiter");
    await mk("pruefer", org.A, "teammitglied", "pruefer");
    await mk("vermittler", org.A, "vermittler", null);
    await mk("bUser", org.B, "org_admin", null);
    await mk("cAdmin", org.C, "org_admin", null);
    await mk("cMit", org.C, "teammitglied", null);
    await mk("dAdmin", org.D, "org_admin", null);
    await mk("eManager", org.E, "org_admin", "manager");

    const agC = await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: org.A, organizationId: org.C, name: "AG C" } });
    const kontaktMit = await prisma.backofficeAuftraggeberKontakt.create({ data: { auftraggeberId: agC.id, name: "cMit", userId: nutzer.cMit.id, darfAlleAuftraegeSehen: false } });
    const agY = await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: org.A, name: "AG Y" } });

    const akte = async (nr: string) => (await prisma.case.create({ data: { organizationId: org.A, caseNumber: nr, akteArt: "backoffice" } })).id;
    boAkte = await akte("BO-1");
    const mkAuftrag = async (nr: string, auftraggeberId: string, caseId: string, kontaktId: string | null) =>
      (await prisma.backofficeAuftrag.create({ data: { backofficeOrganizationId: org.A, auftragsnummer: nr, auftraggeberId, caseId, kontaktId, aktenbezeichnung: nr, auftragsart: "basis_pruefung" } })).id;
    a1 = await mkAuftrag("BO-1", agC.id, boAkte, kontaktMit.id);
    a2 = await mkAuftrag("BO-2", agC.id, await akte("BO-2"), null);
    a3 = await mkAuftrag("BO-3", agY.id, await akte("BO-3"), null);

    zugriff = await import("@/lib/backoffice/zugriff");
    auftraege = await import("@/lib/backoffice/auftraege");
    ctxModul = await import("@/lib/auth/context");
  }, 180_000);

  it("requireBackoffice: Rolle UND Flag noetig", async () => {
    als(nutzer.manager);
    expect((await zugriff.requireBackoffice()).backofficeRolle).toBe("manager");
    als(nutzer.vermittler);
    await expect(zugriff.requireBackoffice()).rejects.toThrow("NEXT_NOT_FOUND");
    als(nutzer.eManager);
    await expect(zugriff.requireBackoffice()).rejects.toThrow("NEXT_NOT_FOUND");
  }, 60_000);

  it("requireBackofficeAuftrag: Bearbeiter sehen nur eigene und freie Auftraege, fremde Organisationen nichts", async () => {
    als(nutzer.bearbeiter1);
    expect((await zugriff.requireBackofficeAuftrag(a1)).auftrag.id).toBe(a1);
    await prisma.backofficeAuftrag.update({ where: { id: a1 }, data: { bearbeiterId: nutzer.bearbeiter2.id } });
    await expect(zugriff.requireBackofficeAuftrag(a1)).rejects.toThrow("NEXT_NOT_FOUND");
    als(nutzer.manager);
    expect((await zugriff.requireBackofficeAuftrag(a1)).auftrag.id).toBe(a1);
    als(nutzer.pruefer);
    expect((await zugriff.requireBackofficeAuftrag(a1)).auftrag.id).toBe(a1);
    als(nutzer.bUser);
    await expect(zugriff.requireBackofficeAuftrag(a1)).rejects.toThrow("NEXT_NOT_FOUND");
  }, 60_000);

  it("Portal: Auftraggeber A sieht niemals Auftraggeber B, Mitarbeiter nur ihre Kontakt-Auftraege", async () => {
    als(nutzer.cAdmin);
    expect((await zugriff.requirePortalAuftrag(a1)).auftrag.id).toBe(a1);
    expect((await zugriff.requirePortalAuftrag(a2)).auftrag.id).toBe(a2);
    await expect(zugriff.requirePortalAuftrag(a3)).rejects.toThrow("NEXT_NOT_FOUND");

    als(nutzer.cMit);
    expect((await zugriff.requirePortalAuftrag(a1)).auftrag.id).toBe(a1);
    await expect(zugriff.requirePortalAuftrag(a2)).rejects.toThrow("NEXT_NOT_FOUND");
    const pctx = await zugriff.requirePortal();
    const zeilen = await auftraege.ladeAuftragZeilen(zugriff.portalAuftraegeFilter(pctx));
    expect(zeilen.map((z) => z.id)).toEqual([a1]);

    als(nutzer.dAdmin);
    await expect(zugriff.requirePortal()).rejects.toThrow("NEXT_NOT_FOUND");
    als(nutzer.vermittler);
    await expect(zugriff.requirePortal()).rejects.toThrow("NEXT_NOT_FOUND");
  }, 60_000);

  it("Backoffice-Akten bleiben Vermittlern ohne Rolle verborgen", async () => {
    expect(await ctxModul.darfBackofficeAkteSehen(ctx(nutzer.vermittler), boAkte)).toBe(false);
    expect(await ctxModul.darfBackofficeAkteSehen(ctx(nutzer.manager), boAkte)).toBe(true);
    // a1 ist bearbeiter2 zugewiesen -> bearbeiter1 sieht die Akte nicht
    expect(await ctxModul.darfBackofficeAkteSehen(ctx(nutzer.bearbeiter1), boAkte)).toBe(false);
    expect(await ctxModul.darfBackofficeAkteSehen(ctx(nutzer.bearbeiter2), boAkte)).toBe(true);

    const sichtbar = await prisma.case.findFirst({ where: { id: boAkte, ...ctxModul.akteSichtbarWhere(ctx(nutzer.vermittler)) } });
    expect(sichtbar).toBeNull();
    const fuerManager = await prisma.case.findFirst({ where: { id: boAkte, ...ctxModul.akteSichtbarWhere(ctx(nutzer.manager)) } });
    expect(fuerManager?.id).toBe(boAkte);
  }, 60_000);

  it("ladeBereiche: Backoffice nur mit Rolle und Flag, Portal nur fuer verknuepfte Organisationen", async () => {
    expect(await zugriff.ladeBereiche(ctx(nutzer.vermittler))).toEqual({ vertrieb: true, backoffice: false, portal: false });
    expect(await zugriff.ladeBereiche(ctx(nutzer.manager))).toEqual({ vertrieb: true, backoffice: true, portal: false });
    expect(await zugriff.ladeBereiche(ctx(nutzer.eManager))).toEqual({ vertrieb: true, backoffice: false, portal: false });
    expect(await zugriff.ladeBereiche(ctx(nutzer.cAdmin))).toEqual({ vertrieb: true, backoffice: false, portal: true });
    expect(await zugriff.ladeBereiche(ctx(nutzer.cMit))).toEqual({ vertrieb: true, backoffice: false, portal: true });
    expect(await zugriff.ladeBereiche(ctx(nutzer.dAdmin))).toEqual({ vertrieb: true, backoffice: false, portal: false });
  }, 60_000);
});
