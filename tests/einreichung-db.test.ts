import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
  process.env.APP_BASE_URL = "https://test.local";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Einreichungslink gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/einreichung-db.test.ts
 */
describe.runIf(RUN)("Einreichungslink (PGlite)", () => {
  let prisma: any;
  let mod: typeof import("@/lib/backoffice/einreichung");
  let orgB: string;
  let orgOhneFlag: string;
  let manager: any;
  let ag: string;
  let agIntern: string;
  let agOhneFlag: string;
  let token: string;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    orgB = (await prisma.organization.create({ data: { name: "Backoffice B", slug: "einr-b" } })).id;
    orgOhneFlag = (await prisma.organization.create({ data: { name: "Ohne Flag", slug: "einr-o" } })).id;
    await prisma.featureFlag.create({ data: { organizationId: orgB, key: "backoffice", enabled: true } });
    manager = await prisma.user.create({
      data: { organizationId: orgB, email: "m@einr.de", name: "M", role: "org_admin", backofficeRolle: "manager" },
    });
    ag = (
      await prisma.backofficeAuftraggeber.create({
        data: { backofficeOrganizationId: orgB, name: "Makler Müller", abrechnungsmodell: "abo", kontingentMonatlich: 3 },
      })
    ).id;
    agIntern = (
      await prisma.backofficeAuftraggeber.create({
        data: { backofficeOrganizationId: orgB, organizationId: orgB, name: "Eigen", abrechnungsmodell: "intern" },
      })
    ).id;
    agOhneFlag = (await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: orgOhneFlag, name: "X" } })).id;
    mod = await import("@/lib/backoffice/einreichung");
  }, 180_000);

  it("erzeugt einen Link, Klartext nur einmal, Hash in der DB", async () => {
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.url.startsWith("https://test.local/einreichen/")).toBe(true);
    token = r.wert.url.split("/einreichen/")[1]!;
    const zeile = await prisma.backofficeEinreichungsLink.findFirst({ where: { auftraggeberId: ag, aktiv: true } });
    expect(zeile.tokenHash).not.toBe(token);
  });

  it("verweigert den Link fuer das Modell intern und fuer fremde Auftraggeber", async () => {
    expect((await mod.erzeugeEinreichungsLink({ auftraggeberId: agIntern, backofficeOrganizationId: orgB, userId: manager.id })).ok).toBe(false);
    expect((await mod.erzeugeEinreichungsLink({ auftraggeberId: agOhneFlag, backofficeOrganizationId: orgB, userId: manager.id })).ok).toBe(false);
  });

  it("loest das Token auf; unbekannt, deaktiviert und Flag aus sehen gleich aus (null)", async () => {
    const ziel = await mod.loeseEinreichungsToken(token);
    expect(ziel?.auftraggeberName).toBe("Makler Müller");
    expect(ziel?.backofficeName).toBe("Backoffice B");
    expect(await mod.loeseEinreichungsToken("gibt-es-nicht")).toBeNull();
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: agOhneFlag, backofficeOrganizationId: orgOhneFlag, userId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await mod.loeseEinreichungsToken(r.wert.url.split("/einreichen/")[1]!)).toBeNull();
  });

  it("reicheEin erzeugt Backoffice-Akte, Auftrag mit Quelle einreichung, zwei Antragsteller und einen Upload-Link", async () => {
    const ziel = (await mod.loeseEinreichungsToken(token))!;
    const r = await mod.reicheEin(ziel, {
      antragsteller1: { vorname: "Erika", nachname: "Muster", email: "e@m.de" },
      antragsteller2: { vorname: "Max", nachname: "Muster" },
      auftragsart: "basis_pruefung",
      referenzExtern: "MM-17",
      hinweise: "Bitte Eile",
      ansprechperson: { name: "Frau Müller", email: "mueller@makler.de", phone: "0171" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const auftrag = await prisma.backofficeAuftrag.findUnique({ where: { id: r.wert.auftragId } });
    expect(auftrag.quelle).toBe("einreichung");
    expect(auftrag.auftraggeberId).toBe(ag);
    expect(auftrag.hinweiseAuftraggeber).toContain("Frau Müller");
    expect(auftrag.hinweiseAuftraggeber).toContain("Bitte Eile");
    expect(auftrag.referenzExtern).toBe("MM-17");
    const akte = await prisma.case.findUnique({ where: { id: r.wert.caseId }, include: { applicants: true, uploadLinks: true } });
    expect(akte.akteArt).toBe("backoffice");
    expect(akte.organizationId).toBe(orgB);
    expect(akte.applicants.map((a: any) => a.vorname).sort()).toEqual(["Erika", "Max"]);
    expect(akte.uploadLinks).toHaveLength(1);
    expect(r.wert.uploadToken.length).toBeGreaterThan(10);
    const link = await prisma.backofficeEinreichungsLink.findFirst({ where: { auftraggeberId: ag, aktiv: true } });
    expect(link.einreichungen).toBe(1);
    expect(link.zuletztGenutzt).toBeTruthy();
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    expect(await prisma.case.count({ where: { organizationId: orgB, ...nurVertrieb } })).toBe(0);
    const ereignis = await prisma.backofficeAuftragEreignis.findFirst({ where: { auftragId: r.wert.auftragId, art: "angelegt" } });
    expect(ereignis.text).toContain("Einreichungslink");
    expect(ereignis.sichtbarFuerAuftraggeber).toBe(true);
  });

  it("Erneuern deaktiviert den alten Link, Deaktivieren laesst keinen aktiven zurueck", async () => {
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(r.ok).toBe(true);
    expect(await mod.loeseEinreichungsToken(token)).toBeNull();
    expect(await prisma.backofficeEinreichungsLink.count({ where: { auftraggeberId: ag, aktiv: true } })).toBe(1);
    const d = await mod.deaktiviereEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(d.ok).toBe(true);
    expect((await mod.ladeEinreichungsLinkStand(ag)).aktiv).toBe(false);
  });
});
