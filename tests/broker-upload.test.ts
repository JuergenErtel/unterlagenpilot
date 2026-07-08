import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_RATE_MAX: 20, UPLOAD_RATE_WINDOW_SEC: 60, UPLOAD_MAX_MB: 20 }),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

const processUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({
  processUpload: (...a: unknown[]) => processUpload(...a),
}));

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { applicant: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));

const ctxCaseAccess = {
  ctx: {
    organizationId: "org-A",
    organizationName: "Org A",
    userId: "user-1",
    userName: "Tester",
    role: "vermittler",
    isDemo: false,
  },
  caseRow: { id: "case-A", organizationId: "org-A" },
};

import { brokerUploadOne } from "@/lib/actions/upload";

function pdf(name = "a.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

/** Ein Request = genau eine Datei (Feld "files") + Antragsteller-Position. */
function fileForm(position: string, file: File): FormData {
  const fd = new FormData();
  fd.set("applicantPosition", position);
  fd.append("files", file);
  return fd;
}

beforeEach(() => {
  requireCaseAccess.mockReset();
  requireCaseAccess.mockResolvedValue(ctxCaseAccess);
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ ok: true });
  processUpload.mockReset();
  processUpload.mockResolvedValue({ ok: true, fileName: "f" });
  findFirst.mockReset();
});

describe("brokerUploadOne", () => {
  it("verweigert den Upload in einen fremden Fall", async () => {
    requireCaseAccess.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(brokerUploadOne("case-B", fileForm("1", pdf()))).rejects.toThrow();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("löst Antragsteller-Position 2 auf und reicht ihn an die Pipeline durch", async () => {
    findFirst.mockResolvedValue({ id: "app-2", vorname: "Erika", nachname: "Muster" });
    const res = await brokerUploadOne("case-A", fileForm("2", pdf()));
    expect(res.uploaded).toBe(1);
    expect(findFirst).toHaveBeenCalled();
    const arg = processUpload.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.applicantId).toBe("app-2");
    expect(arg.applicantName).toBe("Erika Muster");
    expect(arg.uploadSource).toBe("vermittler");
  });

  it("lädt bei 'none' ohne Antragsteller-Zuordnung hoch", async () => {
    await brokerUploadOne("case-A", fileForm("none", pdf()));
    expect(findFirst).not.toHaveBeenCalled();
    const arg = processUpload.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.applicantId).toBeNull();
    expect(arg.applicantName).toBeNull();
  });

  it("meldet abgelehnte Dateien zurück, ohne zu werfen", async () => {
    processUpload.mockResolvedValue({ ok: false, fileName: "a.pdf", reason: "abgelehnt" });
    const res = await brokerUploadOne("case-A", fileForm("none", pdf()));
    expect(res.uploaded).toBe(0);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0]!.reason).toBe("abgelehnt");
  });

  it("blockiert bei überschrittenem Rate-Limit", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 30 });
    const res = await brokerUploadOne("case-A", fileForm("1", pdf()));
    expect(res.error).toContain("30");
    expect(processUpload).not.toHaveBeenCalled();
  });
});
