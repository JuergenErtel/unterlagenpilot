import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => "127.0.0.1" })) }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_RATE_MAX: 20, UPLOAD_RATE_WINDOW_SEC: 60, APP_BASE_URL: "https://app.example.com" }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const requireUploadTokenAccess = vi.fn();
const resolveUploadToken = vi.fn();
const consumeUploadSlot = vi.fn();
const releaseUploadSlot = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireUploadTokenAccess: (...a: unknown[]) => requireUploadTokenAccess(...a),
  resolveUploadToken: (...a: unknown[]) => resolveUploadToken(...a),
  consumeUploadSlot: (...a: unknown[]) => consumeUploadSlot(...a),
  releaseUploadSlot: (...a: unknown[]) => releaseUploadSlot(...a),
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
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
  },
}));

import { customerUploadOne, finishCustomerUpload } from "@/lib/actions/upload";
import { buildUploadNotification } from "@/lib/email/notifications";

function pdf(name = "a.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}
function form(...files: File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fd;
}

const access = { caseId: "case-A", organizationId: "org-A", linkId: "link-1" };
const caseWithBroker = {
  id: "case-A",
  caseNumber: "2026-0007",
  applicants: [{ id: "app-1", vorname: "Max", nachname: "Mustermann" }],
  broker: { email: "makler@example.com", name: "Makler" },
};

beforeEach(() => {
  requireUploadTokenAccess.mockReset();
  requireUploadTokenAccess.mockResolvedValue(access);
  resolveUploadToken.mockReset();
  resolveUploadToken.mockResolvedValue(access);
  consumeUploadSlot.mockReset();
  consumeUploadSlot.mockResolvedValue(true);
  releaseUploadSlot.mockReset();
  releaseUploadSlot.mockResolvedValue(undefined);
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
});

describe("Upload-Benachrichtigung an den Vermittler", () => {
  it("lädt pro Aufruf genau eine Datei hoch, OHNE dabei zu benachrichtigen", async () => {
    const res = await customerUploadOne("tok", form(pdf()));
    expect(res.uploaded).toBe(1);
    expect(consumeUploadSlot).toHaveBeenCalledTimes(1); // Kontingent atomar verbraucht
    expect(sendEmail).not.toHaveBeenCalled(); // Mail erst beim Abschluss
  });

  it("benachrichtigt den Vermittler genau einmal beim Abschluss (finishCustomerUpload)", async () => {
    await finishCustomerUpload("tok", 4);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(arg.to).toBe("makler@example.com");
    expect(arg.subject).toContain("2026-0007");
  });

  it("benachrichtigt auch dann, wenn das Upload-Kontingent aufgebraucht ist (Single-Use-Link)", async () => {
    // Regression: finishCustomerUpload lief früher über die Kontingent-Prüfung und
    // wurde bei maxUploads=1 nach der ersten Datei still übersprungen – der
    // Vermittler erfuhr nie vom Upload.
    requireUploadTokenAccess.mockResolvedValue(null); // Limit erreicht
    await finishCustomerUpload("tok", 1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("lehnt den Upload ab, wenn kein Kontingent mehr frei ist", async () => {
    consumeUploadSlot.mockResolvedValue(false);
    const res = await customerUploadOne("tok", form(pdf()));
    expect(res.uploaded).toBe(0);
    expect(res.error).toMatch(/Kontingent/i);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("gibt das Kontingent zurück, wenn die Datei abgelehnt wurde", async () => {
    processUpload.mockResolvedValue({ ok: false, reason: "Virus" });
    const res = await customerUploadOne("tok", form(pdf()));
    expect(res.uploaded).toBe(0);
    expect(releaseUploadSlot).toHaveBeenCalledWith("link-1");
  });

  it("gibt das Kontingent auch bei einer Exception in der Pipeline zurück", async () => {
    // Sonst verfiele bei jedem Serverfehler stillschweigend ein Upload-Kontingent.
    processUpload.mockRejectedValue(new Error("Storage down"));
    await expect(customerUploadOne("tok", form(pdf()))).rejects.toThrow("Storage down");
    expect(releaseUploadSlot).toHaveBeenCalledWith("link-1");
  });

  it("übergibt aus dem Kundenlink keine Antragsteller-Zuordnung – das übernimmt der Namensabgleich in der Pipeline", async () => {
    // Über den gemeinsamen Link lädt jeder Beteiligte hoch, die Quelle verrät
    // nicht wessen Datei es ist. customerUploadOne löst deshalb keine
    // Zuordnung mehr selbst auf (siehe applicant-source-persistenz.test.ts
    // für den tatsächlichen Namensabgleich in der Hintergrund-Analyse).
    await customerUploadOne("tok", form(pdf()));
    const callArg = processUpload.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("applicantId");
    expect(callArg).not.toHaveProperty("applicantName");
  });

  it("sendet keine E-Mail, wenn kein Vermittler zugeordnet ist", async () => {
    caseFindUnique.mockResolvedValue({ ...caseWithBroker, broker: null });
    await finishCustomerUpload("tok", 2);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sendet keine E-Mail, wenn der Mailversand nicht konfiguriert ist", async () => {
    isEmailConfigured.mockReturnValue(false);
    await finishCustomerUpload("tok", 2);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lässt den Abschluss erfolgreich, wenn der Mailversand fehlschlägt", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockRejectedValue(new Error("Resend down"));
    await expect(finishCustomerUpload("tok", 1)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("sendet keine E-Mail, wenn keine Datei erfolgreich war (count 0)", async () => {
    await finishCustomerUpload("tok", 0);
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
