import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentType } from "@/lib/domain/enums";

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

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { reclassifyDocument } from "@/lib/actions/review";

const ownDoc = {
  id: "d1",
  caseId: "case-A",
  originalName: "scan_2026.pdf",
  period: null,
  case: { organizationId: "org-A" },
  applicant: { vorname: "Max", nachname: "Mustermann" },
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  update.mockResolvedValue({ id: "d1", caseId: "case-A" });
});

describe("reclassifyDocument", () => {
  it("verweigert Zugriff auf Dokumente fremder Organisationen", async () => {
    findUnique.mockResolvedValue({ ...ownDoc, case: { organizationId: "org-B" } });
    await expect(reclassifyDocument("d1", "gehaltsabrechnung")).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("setzt den neuen Typ und erzeugt den Dateinamen deterministisch neu", async () => {
    findUnique.mockResolvedValue(ownDoc);
    await reclassifyDocument("d1", "gehaltsabrechnung");
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.documentType).toBe("gehaltsabrechnung");
    expect(String(data.generatedName)).toContain("Gehaltsabrechnung");
    expect(String(data.generatedName)).toContain("Max_Mustermann");
    expect(data.classificationStatus).toBe("fertig");
  });

  it("lehnt einen ungültigen Dokumenttyp ab", async () => {
    findUnique.mockResolvedValue(ownDoc);
    await expect(reclassifyDocument("d1", "quatsch" as DocumentType)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
