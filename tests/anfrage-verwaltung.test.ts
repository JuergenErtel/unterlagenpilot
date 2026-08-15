import { describe, it, expect, vi, beforeEach } from "vitest";

const auditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: async () => ({ organizationId: "org-A", userId: "user-1" }),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://baufidesk.de" }) }));

const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const auditFindMany = vi.fn();
const linkFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadformular: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
    selfDisclosureLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
  },
}));

import { ladeFormularStand, formularEinrichten, formularUmschalten } from "@/lib/actions/anfrage-verwaltung";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [findFirst, create, update, auditFindMany, auditMock, linkFindFirst].forEach((m) => m.mockReset());
  auditFindMany.mockResolvedValue([]);
  // Standard: kein Bogen haengt am Formular, der Slug bleibt aenderbar.
  linkFindFirst.mockResolvedValue(null);
});

describe("ladeFormularStand", () => {
  it("meldet 'noch keins', solange keins eingerichtet ist", async () => {
    findFirst.mockResolvedValue(null);
    await expect(ladeFormularStand()).resolves.toMatchObject({ slug: null, url: null });
  });

  it("liefert Adresse und die letzten Einladungen", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    auditFindMany.mockResolvedValue([
      { metadata: { email: "max@example.de" }, createdAt: new Date("2026-08-15T10:00:00Z") },
    ]);
    const stand = await ladeFormularStand();
    expect(stand.url).toBe("https://baufidesk.de/anfrage/ertel");
    expect(stand.einladungen[0]?.email).toBe("max@example.de");
  });

  it("meldet den Slug als aenderbar, solange kein Bogen dranhaengt", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    linkFindFirst.mockResolvedValue(null);
    await expect(ladeFormularStand()).resolves.toMatchObject({ kannSlugAendern: true });
  });

  it("meldet den Slug als gesperrt, sobald ein Bogen dranhaengt", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    linkFindFirst.mockResolvedValue({ id: "link-1" });
    await expect(ladeFormularStand()).resolves.toMatchObject({ kannSlugAendern: false });
  });
});

describe("formularEinrichten", () => {
  it("legt das Formular mit normalisiertem Slug an", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "form-1" });
    await formularEinrichten(form({ slug: "Jürgen Ertel" }));
    expect((create as any).mock.calls[0][0].data.slug).toBe("juergen-ertel");
    expect((create as any).mock.calls[0][0].data.organizationId).toBe("org-A");
  });

  it("weist einen unbrauchbaren Slug ab", async () => {
    findFirst.mockResolvedValue(null);
    const res = await formularEinrichten(form({ slug: "???" }));
    expect(res.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("meldet einen bereits vergebenen Slug verstaendlich", async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await formularEinrichten(form({ slug: "ertel" }));
    expect(res.error).toMatch(/vergeben/i);
  });

  it("aendert den Slug eines vorhandenen Formulars, solange kein Bogen dranhaengt", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "alt", aktiv: true });
    linkFindFirst.mockResolvedValue(null);
    update.mockResolvedValue({ id: "form-1" });
    const res = await formularEinrichten(form({ slug: "Neuer Name" }));
    expect(res.error).toBeUndefined();
    expect(update).toHaveBeenCalledWith({ where: { id: "form-1" }, data: { slug: "neuer-name" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("verweigert die Slug-Aenderung, sobald ein Bogen dranhaengt", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "alt", aktiv: true });
    linkFindFirst.mockResolvedValue({ id: "link-1" });
    const res = await formularEinrichten(form({ slug: "neu" }));
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("meldet eine bereits vergebene neue Adresse beim Aendern verstaendlich", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "alt", aktiv: true });
    linkFindFirst.mockResolvedValue(null);
    update.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await formularEinrichten(form({ slug: "vergeben" }));
    expect(res.error).toMatch(/vergeben/i);
  });
});

describe("formularUmschalten", () => {
  it("schaltet ein aktives Formular ab", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    await formularUmschalten();
    expect(update).toHaveBeenCalledWith({ where: { id: "form-1" }, data: { aktiv: false } });
  });

  it("schaltet ein abgeschaltetes Formular wieder ein", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: false });
    await formularUmschalten();
    expect(update).toHaveBeenCalledWith({ where: { id: "form-1" }, data: { aktiv: true } });
  });

  it("tut nichts, wenn noch kein Formular eingerichtet ist", async () => {
    findFirst.mockResolvedValue(null);
    await formularUmschalten();
    expect(update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("schreibt den neuen Zustand ins Pruefprotokoll", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    await formularUmschalten();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-A",
        userId: "user-1",
        action: "case.updated",
        entityType: "leadformular",
        entityId: "form-1",
        metadata: { aktiv: false },
      })
    );
  });
});
