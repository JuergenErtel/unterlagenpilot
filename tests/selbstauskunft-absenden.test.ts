import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: vi.fn() }));

const resolve = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolve(...a),
  createSelfDisclosureLink: vi.fn(),
  deactivateSelfDisclosureLink: vi.fn(),
}));

const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      update: vi.fn(),
    },
  },
}));

import { sendeAb } from "@/lib/actions/self-disclosure";

beforeEach(() => {
  [resolve, findUnique, updateMany].forEach((m) => m.mockReset());
  resolve.mockResolvedValue({ linkId: "link-1", caseId: "case-1", organizationId: "org-1" });
  updateMany.mockResolvedValue({ count: 1 });
});

describe("sendeAb", () => {
  it("sendet einen Bogen mit Lücken ab – Pflichtfelder gibt es nicht", async () => {
    // Fallgebunden: link.formular bleibt null, der Fall existiert schon.
    findUnique.mockResolvedValue({ id: "sd-1", submittedAt: null, answers: {}, link: { formular: null } });
    const res = await sendeAb("tok");
    expect(res).toBeUndefined();
    const arg = updateMany.mock.calls[0]![0] as { data: { submittedAt: Date } };
    expect(arg.data.submittedAt).toBeInstanceOf(Date);
  });

  it("lässt sich nicht zweimal absenden", async () => {
    findUnique.mockResolvedValue({ id: "sd-1", submittedAt: new Date() });
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("weist ein ungültiges Token ab", async () => {
    resolve.mockResolvedValue(null);
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("sendet nichts ab, wenn noch gar kein Bogen existiert", async () => {
    findUnique.mockResolvedValue(null);
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
