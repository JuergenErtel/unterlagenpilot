import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: async () => ({ organizationId: "org-A", userId: "user-1" }),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://baufidesk.de" }) }));

const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const auditFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadformular: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  },
}));

import { ladeFormularStand, formularEinrichten } from "@/lib/actions/anfrage-verwaltung";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [findFirst, create, update, auditFindMany].forEach((m) => m.mockReset());
  auditFindMany.mockResolvedValue([]);
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
});
