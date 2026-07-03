import { describe, it, expect, vi, afterEach } from "vitest";

// Muss vor dem ersten getEnv()-Aufruf gesetzt werden.
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "UnterlagenPilot <noreply@example.de>";

import { sendEmail, isEmailConfigured } from "@/lib/email/resend";

afterEach(() => vi.unstubAllGlobals());

describe("Resend-E-Mail-Client", () => {
  it("isEmailConfigured ist true, wenn Key + Absender gesetzt sind", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it("sendet mit korrektem Payload an die Resend-API und liefert die id", async () => {
    let url = "";
    let init: { headers: Record<string, string>; body: string } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, i: never) => {
        url = u;
        init = i;
        return { ok: true, json: async () => ({ id: "email_123" }) };
      })
    );

    const res = await sendEmail({ to: "kunde@example.de", subject: "Betreff", text: "Hallo" });

    expect(res.id).toBe("email_123");
    expect(url).toBe("https://api.resend.com/emails");
    expect(init!.headers.Authorization).toBe("Bearer re_test_key");
    const payload = JSON.parse(init!.body);
    expect(payload.from).toBe("UnterlagenPilot <noreply@example.de>");
    expect(payload.to).toBe("kunde@example.de");
    expect(payload.subject).toBe("Betreff");
    expect(payload.text).toBe("Hallo");
  });

  it("wirft mit Antwort-Body bei HTTP-Fehler (für Log-Diagnose)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => '{"message":"domain not verified"}',
      }))
    );

    await expect(sendEmail({ to: "x@y.de", subject: "s", text: "t" })).rejects.toThrow(/422/);
    await expect(sendEmail({ to: "x@y.de", subject: "s", text: "t" })).rejects.toThrow(/domain not verified/);
  });
});
