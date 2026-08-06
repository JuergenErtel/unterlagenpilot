import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const documentFindMany = vi.fn();
const documentUpdate = vi.fn();
const applicantFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

import { rematchCaseDocuments } from "@/lib/documents/rematch";

beforeEach(() => {
  [documentFindMany, documentUpdate, applicantFindMany].forEach((m) => m.mockReset());
  documentUpdate.mockResolvedValue({});
  applicantFindMany.mockResolvedValue([
    { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
    { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
  ]);
});

const basisDoc = {
  id: "d1",
  applicantId: "a1",
  applicantSource: "auto",
  detectedApplicant: "Thomas Colell",
  documentType: "personalausweis",
  period: null,
  originalName: "ausweis.pdf",
};

describe("rematchCaseDocuments", () => {
  it("hängt automatisch zugeordnete Dokumente auf die erkannte Person um", async () => {
    documentFindMany.mockResolvedValue([basisDoc]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(1);
    const arg = documentUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { applicantId: string; applicantSource: string; generatedName?: string };
    };
    expect(arg.where.id).toBe("d1");
    expect(arg.data.applicantId).toBe("a2");
    expect(arg.data.applicantSource).toBe("auto");
    expect(arg.data.generatedName).toContain("Thomas");
  });

  it("lässt manuelle Zuordnungen unangetastet", async () => {
    documentFindMany.mockResolvedValue([{ ...basisDoc, applicantSource: "manuell" }]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(0);
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("tut nichts, solange der zweite Antragsteller noch namenlos ist", async () => {
    applicantFindMany.mockResolvedValue([
      { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
      { id: "a2", position: 2, vorname: null, nachname: null },
    ]);
    documentFindMany.mockResolvedValue([basisDoc]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(0);
  });
});
