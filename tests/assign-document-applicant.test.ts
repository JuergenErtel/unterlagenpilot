import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ({
    organizationId: "org-A",
    organizationName: "Org A",
    userId: "user-1",
    userName: "Tester",
    role: "vermittler",
    isDemo: false,
  })),
}));

const documentFindUnique = vi.fn();
const documentUpdate = vi.fn();
const applicantFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findUnique: (...a: unknown[]) => documentFindUnique(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    applicant: { findFirst: (...a: unknown[]) => applicantFindFirst(...a) },
  },
}));

import { assignDocumentApplicant } from "@/lib/actions/review";

const ownDoc = {
  id: "d1",
  caseId: "case-A",
  originalName: "scan.pdf",
  period: "2026-05",
  documentType: "gehaltsabrechnung",
  case: { organizationId: "org-A" },
};

beforeEach(() => {
  [documentFindUnique, documentUpdate, applicantFindFirst].forEach((m) => m.mockReset());
  documentFindUnique.mockResolvedValue(ownDoc);
  documentUpdate.mockResolvedValue({});
  applicantFindFirst.mockResolvedValue({ vorname: "Erika", nachname: "Mustermann" });
});

describe("assignDocumentApplicant", () => {
  it("ordnet ein Dokument dem Antragsteller zu und benennt die Datei neu", async () => {
    await assignDocumentApplicant("d1", "app-2");
    const arg = documentUpdate.mock.calls[0]![0] as { data: { applicantId: string; generatedName: string } };
    expect(arg.data.applicantId).toBe("app-2");
    expect(arg.data.generatedName).toContain("Erika");
  });

  it("hebt die Zuordnung wieder auf (applicantId null)", async () => {
    await assignDocumentApplicant("d1", null);
    const arg = documentUpdate.mock.calls[0]![0] as { data: { applicantId: string | null } };
    expect(arg.data.applicantId).toBeNull();
    expect(applicantFindFirst).not.toHaveBeenCalled();
  });

  it("verweigert Dokumente fremder Organisationen (Tenant-Isolation)", async () => {
    documentFindUnique.mockResolvedValue({ ...ownDoc, case: { organizationId: "org-B" } });
    await expect(assignDocumentApplicant("d1", "app-2")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("verweigert einen Antragsteller aus einem FREMDEN Fall", async () => {
    // findFirst filtert auf caseId – ein fallfremder Antragsteller findet sich nicht.
    applicantFindFirst.mockResolvedValue(null);
    await expect(assignDocumentApplicant("d1", "app-fremd")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("sucht den Antragsteller immer fallbezogen", async () => {
    await assignDocumentApplicant("d1", "app-2");
    expect(applicantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app-2", caseId: "case-A" } })
    );
  });
});
