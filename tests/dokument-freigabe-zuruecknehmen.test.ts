import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ctx),
  requireCaseAccess: vi.fn(async () => ({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } })),
}));
vi.mock("@/lib/auth/akte-zugriff", () => ({
  requireDocumentAccess: vi.fn(async (id: string) => {
    const d = await documentFindUnique({ where: { id } });
    if (!d || d.case?.organizationId !== "org-A") throw new Error("NEXT_NOT_FOUND");
    return { ctx, dokument: { id, caseId: d.caseId, organizationId: "org-A", akteArt: "vertrieb", caseStatus: d.case?.status ?? "neu" } };
  }),
}));

const ctx = {
  organizationId: "org-A",
  organizationName: "Org A",
  userId: "user-1",
  userName: "Tester",
  role: "vermittler",
  isDemo: false,
};

const auditMock = vi.fn();
const documentFindUnique = vi.fn();
const documentUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findUnique: (...a: unknown[]) => documentFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => documentFindUnique(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
  },
}));

import { reopenDocument } from "@/lib/actions/cases";

function mockDoc(reviewStatus: string, caseStatus = "unterlagen_fehlen", organizationId = "org-A") {
  documentFindUnique.mockResolvedValue({
    caseId: "case-A",
    reviewStatus,
    case: { organizationId, status: caseStatus },
  });
}

beforeEach(() => {
  [auditMock, documentFindUnique, documentUpdate].forEach((m) => m.mockReset());
  documentUpdate.mockResolvedValue({ caseId: "case-A" });
});

describe("reopenDocument", () => {
  it("verweigert den Zugriff auf Dokumente fremder Organisationen", async () => {
    mockDoc("akzeptiert", "unterlagen_fehlen", "org-B");
    await expect(reopenDocument("doc-1")).rejects.toThrow();
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("holt ein freigegebenes Dokument zurück auf offen", async () => {
    mockDoc("akzeptiert");
    await reopenDocument("doc-1");
    const data = (documentUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.reviewStatus).toBe("offen");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "doc-1", metadata: { reviewStatus: "offen", vorher: "akzeptiert" } })
    );
  });

  it("entfernt beim Zurücknehmen einer Ablehnung den Grund für den Kunden", async () => {
    mockDoc("abgelehnt");
    await reopenDocument("doc-1");
    const data = (documentUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.reviewStatus).toBe("offen");
    expect(data.reviewNote).toBeNull();
  });

  it("rührt strukturelle Zustände nicht an (ersetzt/duplikat)", async () => {
    for (const status of ["ersetzt", "duplikat", "offen"]) {
      documentUpdate.mockClear();
      mockDoc(status);
      await reopenDocument("doc-1");
      expect(documentUpdate, status).not.toHaveBeenCalled();
    }
  });

  it("lässt einen bereits eingereichten Fall unangetastet", async () => {
    for (const caseStatus of ["exportiert", "uebertragen", "abgeschlossen", "archiviert"]) {
      documentUpdate.mockClear();
      mockDoc("akzeptiert", caseStatus);
      await reopenDocument("doc-1");
      expect(documentUpdate, caseStatus).not.toHaveBeenCalled();
    }
  });
});
