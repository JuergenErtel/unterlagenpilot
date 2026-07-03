import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ctx),
  requireCaseAccess: vi.fn(async () => ({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } })),
}));

const count = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const create = vi.fn();
const del = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: {
      count: (...a: unknown[]) => count(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      create: (...a: unknown[]) => create(...a),
      delete: (...a: unknown[]) => del(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { addApplicant, removeApplicant } from "@/lib/actions/case-edit";

beforeEach(() => {
  [count, findFirst, findUnique, findMany, create, del, update].forEach((m) => m.mockReset());
});

describe("addApplicant", () => {
  it("legt einen zweiten Antragsteller an Position 2 an", async () => {
    count.mockResolvedValue(1);
    findFirst.mockResolvedValue({ position: 1 });
    create.mockResolvedValue({ id: "a2" });
    await addApplicant("case-A");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ caseId: "case-A", position: 2 }) })
    );
  });

  it("legt keinen dritten Antragsteller an (Cap bei 2)", async () => {
    count.mockResolvedValue(2);
    await addApplicant("case-A");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("removeApplicant", () => {
  const owner = { caseId: "case-A", position: 2, case: { organizationId: "org-A" } };

  it("verweigert fremde Organisationen (Tenant)", async () => {
    findUnique.mockResolvedValue({ ...owner, case: { organizationId: "org-B" } });
    await expect(removeApplicant("a2")).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
  });

  it("entfernt keinen Antragsteller, wenn es der letzte ist", async () => {
    findUnique.mockResolvedValue(owner);
    count.mockResolvedValue(1);
    await removeApplicant("a2");
    expect(del).not.toHaveBeenCalled();
  });

  it("löscht den Antragsteller und nummeriert verbleibende neu", async () => {
    findUnique.mockResolvedValue({ caseId: "case-A", position: 1, case: { organizationId: "org-A" } });
    count.mockResolvedValue(2);
    del.mockResolvedValue({});
    // Nach dem Löschen verbleibt der frühere Antragsteller 2 -> muss auf Position 1 rutschen.
    findMany.mockResolvedValue([{ id: "a2", position: 2 }]);
    update.mockResolvedValue({});
    await removeApplicant("a1");
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1" } }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a2" }, data: { position: 1 } })
    );
  });
});
