import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn(async () => ctx) }));

const ctx = { organizationId: "org-A", userId: "user-1" };

const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => isEmailConfigured(),
}));

const messageFindUnique = vi.fn();
const messageUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    generatedMessage: {
      findUnique: (...a: unknown[]) => messageFindUnique(...a),
      update: (...a: unknown[]) => messageUpdate(...a),
    },
  },
}));

import { sendMessageByEmail } from "@/lib/actions/messages";

function msg(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    caseId: "case-A",
    channel: "email",
    subject: "Fehlende Unterlagen",
    body: "Bitte laden Sie …",
    sent: false,
    case: {
      organizationId: "org-A",
      applicants: [{ position: 1, email: "kunde@example.de" }],
    },
    ...over,
  };
}

beforeEach(() => {
  [sendEmail, isEmailConfigured, messageFindUnique, messageUpdate].forEach((m) => m.mockReset());
  isEmailConfigured.mockReturnValue(true);
  sendEmail.mockResolvedValue({ id: "email_1" });
  messageUpdate.mockResolvedValue({});
});

describe("sendMessageByEmail", () => {
  it("sendet an die Antragsteller-E-Mail und markiert die Nachricht als versendet", async () => {
    messageFindUnique.mockResolvedValue(msg());
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(true);
    expect(res.to).toBe("kunde@example.de");
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(messageUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sent: true }) }));
  });

  it("verweigert fremde Organisationen (Tenant)", async () => {
    messageFindUnique.mockResolvedValue(msg({ case: { organizationId: "org-B", applicants: [] } }));
    await expect(sendMessageByEmail("m1")).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("meldet Fehler, wenn E-Mail-Versand nicht konfiguriert ist", async () => {
    isEmailConfigured.mockReturnValue(false);
    messageFindUnique.mockResolvedValue(msg());
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/nicht konfiguriert|nicht eingerichtet/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("meldet Fehler, wenn keine Empfänger-E-Mail hinterlegt ist", async () => {
    messageFindUnique.mockResolvedValue(msg({ case: { organizationId: "org-A", applicants: [{ position: 1, email: null }] } }));
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/E-Mail/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sendet Nicht-E-Mail-Kanäle (z.B. WhatsApp) nicht", async () => {
    messageFindUnique.mockResolvedValue(msg({ channel: "whatsapp" }));
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sendet eine bereits versendete Nachricht nicht erneut", async () => {
    messageFindUnique.mockResolvedValue(msg({ sent: true }));
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("gibt einen Fehler zurück (kein Crash), wenn der Versand fehlschlägt", async () => {
    messageFindUnique.mockResolvedValue(msg());
    sendEmail.mockRejectedValue(new Error("Resend HTTP 422: domain not verified"));
    const res = await sendMessageByEmail("m1");
    expect(res.ok).toBe(false);
    expect(messageUpdate).not.toHaveBeenCalled();
  });
});
