import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Mailversand kennt drei Stufen (MAILVERSAND):
 * - "kunden":     Normalbetrieb, Mail geht an die adressierte Person.
 * - "nur_intern": Testbetrieb, ALLES (auch Kundenmails) geht an die
 *                 Betreiberadresse (PLATFORM_ADMIN_EMAIL); die ursprüngliche
 *                 Adresse steht sichtbar in Betreff und Text.
 * - "aus":        Nichts verlässt das System, sendEmail wirft.
 *
 * Vorgabe ist "nur_intern" – wer nichts setzt, schreibt nie versehentlich
 * einen echten Kunden an.
 */

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
    MAILVERSAND: "kunden",
    PLATFORM_ADMIN_EMAIL: "betreiber@baufidesk.de",
  };
});

function letzterAufruf() {
  const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(init.body as string) as { to: string; subject: string; text: string };
}

const kundenmail = {
  to: "kunde@example.de",
  subject: "Ihre Unterlagen",
  text: "Bitte laden Sie hoch.",
  empfaenger: "kunde" as const,
};

describe("Mailversand-Stufe 'kunden'", () => {
  it("sendet an die adressierte Person (Kundenmail)", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).resolves.toMatchObject({ id: "m1" });
    expect(letzterAufruf().to).toBe("kunde@example.de");
    expect(letzterAufruf().subject).toBe("Ihre Unterlagen");
  });

  it("sendet auch interne Mails an die adressierte Person", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({ ...kundenmail, to: "kollege@baufidesk.de", empfaenger: "intern" });
    expect(letzterAufruf().to).toBe("kollege@baufidesk.de");
  });
});

describe("Mailversand-Stufe 'nur_intern' (Testbetrieb)", () => {
  beforeEach(() => {
    env.MAILVERSAND = "nur_intern";
  });

  it("schickt eine Kundenmail an die Betreiberadresse und nennt die ursprüngliche im Betreff", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).resolves.toMatchObject({ id: "m1" });
    const gesendet = letzterAufruf();
    expect(gesendet.to).toBe("betreiber@baufidesk.de");
    expect(gesendet.subject).toContain("kunde@example.de");
    expect(gesendet.text).toContain("kunde@example.de");
  });

  it("leitet auch eine interne Mail an einen Dritten auf die Betreiberadresse um", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({ ...kundenmail, to: "interessent@fremd.de", empfaenger: "intern" });
    const gesendet = letzterAufruf();
    expect(gesendet.to).toBe("betreiber@baufidesk.de");
    expect(gesendet.subject).toContain("interessent@fremd.de");
  });

  it("leitet eine interne Mail NICHT doppelt um, wenn sie ohnehin an die Betreiberadresse geht", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({
      to: "betreiber@baufidesk.de",
      subject: "Neue Anmeldung wartet",
      text: "Ein Interessent hat sich registriert.",
      empfaenger: "intern",
    });
    const gesendet = letzterAufruf();
    expect(gesendet.to).toBe("betreiber@baufidesk.de");
    // Betreff/Text bleiben unveraendert - kein sinnloser Verweis auf sich selbst.
    expect(gesendet.subject).toBe("Neue Anmeldung wartet");
    expect(gesendet.text).toBe("Ein Interessent hat sich registriert.");
  });

  it("verschickt ohne gesetzte PLATFORM_ADMIN_EMAIL gar nichts (fail-closed)", async () => {
    env.PLATFORM_ADMIN_EMAIL = undefined;
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(/ausgeschaltet/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verschickt auch bei leerer PLATFORM_ADMIN_EMAIL nichts (fail-closed)", async () => {
    env.PLATFORM_ADMIN_EMAIL = "";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(/ausgeschaltet/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Mailversand-Stufe 'aus'", () => {
  it("verschickt nichts und wirft einen erkennbaren Fehler", async () => {
    env.MAILVERSAND = "aus";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(/ausgeschaltet/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blockt auch interne Mails", async () => {
    env.MAILVERSAND = "aus";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ ...kundenmail, to: "kollege@baufidesk.de", empfaenger: "intern" })
    ).rejects.toThrow(/ausgeschaltet/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Vorgabe ohne gesetzte Variable", () => {
  it("ist 'nur_intern' - eine Kundenmail geht NICHT an den Kunden", async () => {
    delete env.MAILVERSAND;
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail(kundenmail);
    expect(letzterAufruf().to).toBe("betreiber@baufidesk.de");
    expect(letzterAufruf().to).not.toBe("kunde@example.de");
  });
});

describe("Fehlermeldung", () => {
  it("nennt im Fehler weder Betreff noch Inhalt", async () => {
    env.MAILVERSAND = "aus";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("Bitte laden Sie hoch"),
      })
    );
  });
});
