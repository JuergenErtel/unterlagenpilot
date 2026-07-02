import { describe, it, expect, vi, beforeEach } from "vitest";

// editApplicant hängt an Next-Runtime + DB → für den reinen Authz-Test mocken.
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
  prisma: { applicant: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));

import { editApplicant } from "@/lib/actions/case-edit";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe("editApplicant – Tenant-Isolation", () => {
  it("verweigert das Update, wenn der Antragsteller zu einer fremden Organisation gehört", async () => {
    findUnique.mockResolvedValue({ caseId: "case-B", case: { organizationId: "org-B" } });

    await expect(editApplicant("applicant-fremd", form({ vorname: "Hacker" }))).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("führt das Update aus, wenn der Antragsteller zur eigenen Organisation gehört", async () => {
    findUnique.mockResolvedValue({ caseId: "case-A", case: { organizationId: "org-A" } });
    update.mockResolvedValue({ caseId: "case-A" });

    await editApplicant("applicant-eigen", form({ vorname: "Max" }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("ignoriert ein ungültiges Geburtsdatum statt einen Serverfehler auszulösen", async () => {
    findUnique.mockResolvedValue({ caseId: "case-A", case: { organizationId: "org-A" } });
    update.mockResolvedValue({ caseId: "case-A" });

    await editApplicant("applicant-eigen", form({ geburtsdatum: "kein-datum" }));
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.geburtsdatum).toBeUndefined();
  });
});
