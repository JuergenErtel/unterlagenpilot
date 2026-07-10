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
const caseUpdateMany = vi.fn();
const documentFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: (...a: unknown[]) => caseFindUnique(...a),
      delete: (...a: unknown[]) => caseDelete(...a),
      updateMany: (...a: unknown[]) => caseUpdateMany(...a),
    },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
  },
}));

const storageRemove = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ remove: (k: string) => storageRemove(k) }),
  casePathPrefix: (orgId: string, caseId: string) => `organizations/${orgId}/cases/${caseId}/documents/`,
}));

import { deleteCase, archiveCase, unarchiveCase } from "@/lib/actions/case-lifecycle";

beforeEach(() => {
  [redirect, auditMock, caseFindUnique, caseDelete, caseUpdateMany, documentFindMany, storageRemove].forEach((m) => m.mockReset());
  redirect.mockImplementation((..._a: unknown[]) => { throw new Error("NEXT_REDIRECT"); });
  caseFindUnique.mockResolvedValue({ caseNumber: "UP-2026-0001" });
  documentFindMany.mockResolvedValue([{ storageKey: "k1" }, { storageKey: "k2" }]);
  caseDelete.mockResolvedValue({});
  caseUpdateMany.mockResolvedValue({ count: 1 });
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

  it("entfernt Storage-Dateien VOR dem DB-Delete (sonst gehen die storageKeys verloren)", async () => {
    const order: string[] = [];
    storageRemove.mockImplementation(() => { order.push("storage"); return Promise.resolve(); });
    caseDelete.mockImplementation(() => { order.push("delete"); return Promise.resolve({}); });
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(order.indexOf("storage")).toBeLessThan(order.indexOf("delete"));
  });

  it("protokolliert NACH dem Löschen (kein Löschnachweis für einen noch existierenden Fall)", async () => {
    const order: string[] = [];
    auditMock.mockImplementation(() => { order.push("audit"); });
    caseDelete.mockImplementation(() => { order.push("delete"); return Promise.resolve({}); });
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(order.indexOf("delete")).toBeLessThan(order.indexOf("audit"));
  });

  it("bricht nicht ab, wenn eine Storage-Datei nicht entfernbar ist", async () => {
    storageRemove.mockRejectedValue(new Error("storage weg"));
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(caseDelete).toHaveBeenCalled();
  });

  it("protokolliert die Anzahl verwaister Dateien, statt den Fehler zu verschlucken", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    storageRemove.mockRejectedValue(new Error("storage weg"));
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "case.deleted",
        metadata: expect.objectContaining({ storageErrors: 2 }),
      })
    );
    errSpy.mockRestore();
  });

  it("schreibt NIEMALS storageKeys ins Audit-Log (sie enthalten Dateinamen = personenbezogene Daten)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    storageRemove.mockRejectedValue(new Error("storage weg"));
    await expect(deleteCase("case-A")).rejects.toThrow("NEXT_REDIRECT");
    const meta = (auditMock.mock.calls.at(-1)![0] as { metadata: Record<string, unknown> }).metadata;
    expect(JSON.stringify(meta)).not.toContain("k1");
    expect(JSON.stringify(meta)).not.toContain("k2");
    // Zum Aufräumen genügt der Präfix – er enthält nur IDs.
    expect(meta.orphanPrefix).toContain("case-A");
    errSpy.mockRestore();
  });
});

describe("archiveCase", () => {
  it("setzt den Status auf archiviert und merkt sich den Vorstatus", async () => {
    caseFindUnique.mockResolvedValue({ status: "abgeschlossen" });
    await archiveCase("case-A");
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "archiviert", statusBeforeArchive: "abgeschlossen" } })
    );
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "case.archived" }));
  });

  it("archiviert einen bereits archivierten Fall nicht erneut (Vorstatus bliebe sonst 'archiviert')", async () => {
    caseFindUnique.mockResolvedValue({ status: "archiviert" });
    await archiveCase("case-A");
    expect(caseUpdateMany).not.toHaveBeenCalled();
  });
});

describe("unarchiveCase", () => {
  it("stellt den Status wieder her, in dem der Fall archiviert wurde", async () => {
    caseFindUnique.mockResolvedValue({ status: "archiviert", statusBeforeArchive: "abgeschlossen" });
    await unarchiveCase("case-A");
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "abgeschlossen", statusBeforeArchive: null } })
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ from: "archiviert", to: "abgeschlossen" }) })
    );
  });

  it("fällt auf 'unterlagen_fehlen' zurück, wenn kein Vorstatus gespeichert ist (Altbestand)", async () => {
    caseFindUnique.mockResolvedValue({ status: "archiviert", statusBeforeArchive: null });
    await unarchiveCase("case-A");
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "unterlagen_fehlen", statusBeforeArchive: null } })
    );
  });

  it("tut nichts, wenn der Fall gar nicht archiviert ist", async () => {
    caseFindUnique.mockResolvedValue({ status: "einreichungsfertig", statusBeforeArchive: null });
    await unarchiveCase("case-A");
    expect(caseUpdateMany).not.toHaveBeenCalled();
  });
});
