import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((..._a: unknown[]) => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
const auditMock = vi.fn();

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (id: string) => ({ ctx, caseRow: { id, organizationId: "org-A" } })),
}));

const caseFindUnique = vi.fn();
const caseDelete = vi.fn();
const caseUpdate = vi.fn();
const documentFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: (...a: unknown[]) => caseFindUnique(...a),
      delete: (...a: unknown[]) => caseDelete(...a),
      update: (...a: unknown[]) => caseUpdate(...a),
    },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
  },
}));

const storageRemove = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ remove: (k: string) => storageRemove(k) }) }));

import { deleteCase, archiveCase } from "@/lib/actions/case-lifecycle";

beforeEach(() => {
  [redirect, auditMock, caseFindUnique, caseDelete, caseUpdate, documentFindMany, storageRemove].forEach((m) => m.mockReset());
  redirect.mockImplementation((..._a: unknown[]) => { throw new Error("NEXT_REDIRECT"); });
  caseFindUnique.mockResolvedValue({ caseNumber: "UP-2026-0001" });
  documentFindMany.mockResolvedValue([{ storageKey: "k1" }, { storageKey: "k2" }]);
  caseDelete.mockResolvedValue({});
  caseUpdate.mockResolvedValue({});
  storageRemove.mockResolvedValue(undefined);
});

describe("deleteCase", () => {
  it("löscht den Fall, entfernt die Storage-Dateien und protokolliert die Löschung", async () => {
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(caseDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "case-A" } }));
    expect(storageRemove).toHaveBeenCalledWith("k1");
    expect(storageRemove).toHaveBeenCalledWith("k2");
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "case.deleted" }));
    expect(redirect).toHaveBeenCalledWith("/cases");
  });

  it("protokolliert vor dem Löschen (Audit bleibt auch nach Cascade erhalten)", async () => {
    const order: string[] = [];
    auditMock.mockImplementation(() => { order.push("audit"); });
    caseDelete.mockImplementation(() => { order.push("delete"); return Promise.resolve({}); });
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(order.indexOf("audit")).toBeLessThan(order.indexOf("delete"));
  });

  it("bricht nicht ab, wenn eine Storage-Datei nicht entfernbar ist", async () => {
    storageRemove.mockRejectedValue(new Error("storage weg"));
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(caseDelete).toHaveBeenCalled();
  });
});

describe("archiveCase", () => {
  it("setzt den Status auf archiviert", async () => {
    await archiveCase("case-A");
    expect(caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "archiviert" } }));
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "case.archived" }));
  });
});
