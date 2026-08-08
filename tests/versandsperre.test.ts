import { describe, it, expect, vi, beforeEach } from "vitest";

let env: Record<string, unknown> = {};
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) });
  env = {
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "BaufiDesk <noreply@baufidesk.de>",
    KUNDENVERSAND: "aus",
    KUNDENVERSAND_NUR_AN: undefined,
  };
});

const kundenmail = {
  to: "kunde@example.de",
  subject: "Ihre Unterlagen",
  text: "Bitte laden Sie hoch.",
  empfaenger: "kunde" as const,
};

describe("Versandsperre", () => {
  it("laesst interne Mails immer durch", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ ...kundenmail, to: "juergen@baufidesk.de", empfaenger: "intern" })
    ).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blockt Kundenmails, solange KUNDENVERSAND nicht auf 'an' steht", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(/gesperrt/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("laesst Kundenmails durch, wenn KUNDENVERSAND auf 'an' steht", async () => {
    env.KUNDENVERSAND = "an";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).resolves.toMatchObject({ id: "m1" });
  });

  it("laesst mit Testliste NUR die aufgefuehrten Adressen durch", async () => {
    env.KUNDENVERSAND = "an";
    env.KUNDENVERSAND_NUR_AN = "test@baufidesk.de, juergen.ertel@gmx.de";
    const { sendEmail } = await import("@/lib/email/resend");

    await expect(sendEmail(kundenmail)).rejects.toThrow(/gesperrt/i);
    await expect(
      sendEmail({ ...kundenmail, to: "Test@baufidesk.de" })
    ).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blockt auch bei Testliste, wenn KUNDENVERSAND aus ist", async () => {
    env.KUNDENVERSAND = "aus";
    env.KUNDENVERSAND_NUR_AN = "test@baufidesk.de";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ ...kundenmail, to: "test@baufidesk.de" })
    ).rejects.toThrow(/gesperrt/i);
  });

  it("nennt im Fehler weder Betreff noch Inhalt", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("Bitte laden Sie hoch"),
      })
    );
  });
});
