import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ UPLOAD_RATE_MAX: 60, UPLOAD_RATE_WINDOW_SEC: 600 }) }));

const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));
const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
const processUpload = vi.fn();
const processStoredUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({
  processUpload: (...a: unknown[]) => processUpload(...a),
  processStoredUpload: (...a: unknown[]) => processStoredUpload(...a),
}));
const createSignedUploadUrl = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    getStorage: () => ({ createSignedUploadUrl: (...a: unknown[]) => createSignedUploadUrl(...a) }),
  };
});

import { einkommenUploadOne, processEinkommenStoredUpload, requestEinkommenUploadSlot } from "@/lib/actions/einkommen";
import { casePathPrefix } from "@/lib/storage";

const ctx = { ctx: { organizationId: "org-A", userId: "u1" }, caseRow: { id: "case-A" } };
function fd(file: File) { const f = new FormData(); f.append("files", file); return f; }
const pdf = () => new File([new Uint8Array([1, 2, 3])], "bwa.pdf", { type: "application/pdf" });

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue(ctx);
  checkRateLimit.mockReset().mockResolvedValue({ ok: true });
  processUpload.mockReset().mockResolvedValue({ ok: true, documentId: "doc-1", fileName: "bwa.pdf" });
  processStoredUpload.mockReset().mockResolvedValue({ ok: true, documentId: "doc-2", fileName: "bwa.pdf" });
  createSignedUploadUrl.mockReset().mockResolvedValue({ uploadUrl: "https://x/put", storageKey: casePathPrefix("org-A", "case-A") + "abc_bwa.pdf" });
});

describe("einkommenUploadOne", () => {
  it("gibt die documentId der kleinen Datei zurück", async () => {
    const res = await einkommenUploadOne("case-A", fd(pdf()));
    expect(res.documentId).toBe("doc-1");
    expect(processUpload).toHaveBeenCalled();
  });
  it("meldet Rate-Limit als Fehler", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 30 });
    const res = await einkommenUploadOne("case-A", fd(pdf()));
    expect(res.error).toContain("30");
  });
});

describe("processEinkommenStoredUpload", () => {
  it("verarbeitet gespeicherte Datei und gibt documentId zurück", async () => {
    const key = casePathPrefix("org-A", "case-A") + "abc_bwa.pdf";
    const res = await processEinkommenStoredUpload("case-A", { storageKey: key, originalName: "bwa.pdf", mimeType: "application/pdf", sizeBytes: 3 });
    expect(res.documentId).toBe("doc-2");
  });
  it("lehnt fremden storageKey ab", async () => {
    const res = await processEinkommenStoredUpload("case-A", { storageKey: "organizations/org-B/cases/x/documents/y.pdf", originalName: "y.pdf", mimeType: "application/pdf", sizeBytes: 3 });
    expect(res.error).toBeTruthy();
    expect(processStoredUpload).not.toHaveBeenCalled();
  });
});

describe("requestEinkommenUploadSlot", () => {
  it("liefert Upload-URL + storageKey", async () => {
    const res = await requestEinkommenUploadSlot("case-A", "bwa.pdf", "application/pdf");
    expect("uploadUrl" in res && res.uploadUrl).toBeTruthy();
  });
});
