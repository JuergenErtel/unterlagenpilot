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

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    extractedFieldRecord: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { reviewExtractedField } from "@/lib/actions/review";

const ownField = {
  id: "f1",
  document: { caseId: "case-A", case: { organizationId: "org-A" } },
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  update.mockResolvedValue({ id: "f1" });
});

describe("reviewExtractedField", () => {
  it("verweigert Zugriff auf Felder fremder Organisationen", async () => {
    findUnique.mockResolvedValue({
      id: "f1",
      document: { caseId: "case-B", case: { organizationId: "org-B" } },
    });
    await expect(reviewExtractedField("f1", "akzeptieren")).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("akzeptieren: markiert als geprüft, ohne den Wert zu ändern", async () => {
    findUnique.mockResolvedValue(ownField);
    await reviewExtractedField("f1", "akzeptieren");
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.reviewed).toBe(true);
    expect(data.correctedValue).toBeUndefined();
  });

  it("korrigieren: speichert den korrigierten Wert und markiert als geprüft", async () => {
    findUnique.mockResolvedValue(ownField);
    await reviewExtractedField("f1", "korrigieren", "4.200,00");
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.correctedValue).toBe("4.200,00");
    expect(data.reviewed).toBe(true);
  });

  it("korrigieren ohne Wert wird abgelehnt", async () => {
    findUnique.mockResolvedValue(ownField);
    await expect(reviewExtractedField("f1", "korrigieren", "   ")).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("ignorieren: leert den Wert (Feld gilt als nicht vorhanden) und markiert als geprüft", async () => {
    findUnique.mockResolvedValue(ownField);
    await reviewExtractedField("f1", "ignorieren");
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.correctedValue).toBe("");
    expect(data.reviewed).toBe(true);
  });
});
