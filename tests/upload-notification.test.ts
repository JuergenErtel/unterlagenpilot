import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => "127.0.0.1" })) }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_RATE_MAX: 20, UPLOAD_RATE_WINDOW_SEC: 60, APP_BASE_URL: "https://app.example.com" }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const requireUploadTokenAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireUploadTokenAccess: (...a: unknown[]) => requireUploadTokenAccess(...a),
  requireCaseAccess: vi.fn(),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

const processUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({ processUpload: (...a: unknown[]) => processUpload(...a) }));

const isEmailConfigured = vi.fn();
const sendEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  isEmailConfigured: () => isEmailConfigured(),
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

const caseFindUnique = vi.fn();
const uploadLinkUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
    uploadLink: { update: (...a: unknown[]) => uploadLinkUpdate(...a) },
  },
}));

import { customerUpload } from "@/lib/actions/upload";
import { buildUploadNotification } from "@/lib/email/notifications";

function pdf(name = "a.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}
function form(...files: File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fd;
}

const caseWithBroker = {
  id: "case-A",
  caseNumber: "2026-0007",
  applicants: [{ id: "app-1", vorname: "Max", nachname: "Mustermann" }],
  broker: { email: "makler@example.com", name: "Makler" },
};

beforeEach(() => {
  requireUploadTokenAccess.mockReset();
  requireUploadTokenAccess.mockResolvedValue({ caseId: "case-A", organizationId: "org-A", linkId: "link-1" });
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ ok: true });
  processUpload.mockReset();
  processUpload.mockResolvedValue({ ok: true, fileName: "a.pdf" });
  isEmailConfigured.mockReset();
  isEmailConfigured.mockReturnValue(true);
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ id: "mail-1" });
  caseFindUnique.mockReset();
  caseFindUnique.mockResolvedValue(caseWithBroker);
  uploadLinkUpdate.mockReset();
  uploadLinkUpdate.mockResolvedValue({});
});

describe("Upload-Benachrichtigung an den Vermittler", () => {
  it("benachrichtigt den zuständigen Vermittler nach erfolgreichem Upload", async () => {
    const res = await customerUpload("tok", { uploaded: 0, rejected: [] }, form(pdf()));
    expect(res.uploaded).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(arg.to).toBe("makler@example.com");
    expect(arg.subject).toContain("2026-0007");
  });

  it("sendet keine E-Mail, wenn kein Vermittler zugeordnet ist", async () => {
    caseFindUnique.mockResolvedValue({ ...caseWithBroker, broker: null });
    const res = await customerUpload("tok", { uploaded: 0, rejected: [] }, form(pdf()));
    expect(res.uploaded).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sendet keine E-Mail, wenn der Mailversand nicht konfiguriert ist", async () => {
    isEmailConfigured.mockReturnValue(false);
    await customerUpload("tok", { uploaded: 0, rejected: [] }, form(pdf()));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lässt den Upload erfolgreich, wenn der Mailversand fehlschlägt", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockRejectedValue(new Error("Resend down"));
    const res = await customerUpload("tok", { uploaded: 0, rejected: [] }, form(pdf()));
    expect(res.uploaded).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("sendet keine E-Mail, wenn kein Upload erfolgreich war", async () => {
    processUpload.mockResolvedValue({ ok: false, fileName: "a.pdf", reason: "abgelehnt" });
    await customerUpload("tok", { uploaded: 0, rejected: [] }, form(pdf()));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("buildUploadNotification", () => {
  it("enthält Fallnummer, Kundenname, Dateianzahl und Link", () => {
    const { subject, text } = buildUploadNotification({
      caseNumber: "2026-0007",
      kundeName: "Max Mustermann",
      count: 3,
      caseUrl: "https://app.example.com/cases/case-A",
    });
    expect(subject).toContain("2026-0007");
    expect(text).toContain("Max Mustermann");
    expect(text).toContain("3");
    expect(text).toContain("https://app.example.com/cases/case-A");
  });
});
