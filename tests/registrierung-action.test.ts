import { describe, it, expect, vi, beforeEach } from "vitest";

const gesendet: Array<{ to: string; subject: string }> = [];

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    APP_BASE_URL: "https://baufidesk.de",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "BaufiDesk <noreply@baufidesk.de>",
    PLATFORM_ADMIN_EMAIL: "juergen.ertel@gmx.de",
  }),
}));
const isEmailConfiguredMock = vi.fn(() => true);
vi.mock("@/lib/email/resend", () => ({
  isEmailConfigured: () => isEmailConfiguredMock(),
  sendEmail: vi.fn(async (input: { to: string; subject: string }) => {
    gesendet.push(input);
    return { id: "m1" };
  }),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true, remaining: 9, retryAfterSec: 0 })),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-real-ip", "1.2.3.4"]]),
}));

const erstelleAntrag = vi.fn();
vi.mock("@/lib/auth/signup", async (orig) => {
  const echt = await (orig() as Promise<Record<string, unknown>>);
  return { ...echt, erstelleAntrag };
});

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

const eingabe = {
  name: "Anna Beispiel",
  firmenname: "Beispiel Finanz GmbH",
  email: "anna@beispiel.de",
  passwort: "einSicheresLangesWort2026",
  wunschtarif: "pro",
  agb: "on",
};

beforeEach(() => {
  gesendet.length = 0;
  erstelleAntrag.mockReset();
  isEmailConfiguredMock.mockReset();
  isEmailConfiguredMock.mockReturnValue(true);
});

describe("Registrierungs-Action", () => {
  it("verschickt Bestaetigungs- und Betreibermail bei einem neuen Antrag", async () => {
    erstelleAntrag.mockResolvedValue({ status: "neu_angelegt", requestId: "r1", token: "tok" });
    const { registriere } = await import("@/lib/actions/registrierung");
    await expect(registriere({}, form(eingabe))).resolves.toMatchObject({ ok: true });
    expect(gesendet.map((m) => m.to)).toContain("anna@beispiel.de");
    expect(gesendet).toHaveLength(1); // Betreibermail erst nach der Bestaetigung
  });

  it("antwortet bei vergebener Adresse genauso wie bei Erfolg", async () => {
    erstelleAntrag.mockResolvedValue({ status: "bereits_vergeben" });
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form(eingabe));
    expect(antwort).toMatchObject({ ok: true });
    // aber eine ANDERE Mail
    expect(gesendet[0]?.subject).toContain("bereits");
  });

  it("meldet Feldfehler ohne Mailversand", async () => {
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form({ ...eingabe, passwort: "kurz" }));
    expect(antwort.feldFehler?.passwort).toBeTruthy();
    expect(gesendet).toHaveLength(0);
    expect(erstelleAntrag).not.toHaveBeenCalled();
  });

  it("verlangt das AGB-Haekchen", async () => {
    const { registriere } = await import("@/lib/actions/registrierung");
    const ohneHaken = { ...eingabe };
    delete (ohneHaken as Record<string, string>).agb;
    const antwort = await registriere({}, form(ohneHaken));
    expect(antwort.feldFehler?.agb).toBeTruthy();
    expect(erstelleAntrag).not.toHaveBeenCalled();
  });

  it("antwortet bei zu haeufigen Versuchen genauso wie bei Erfolg, aber ohne Mail", async () => {
    erstelleAntrag.mockResolvedValue({ status: "zu_haeufig" });
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form(eingabe));
    expect(antwort).toMatchObject({ ok: true });
    expect(gesendet).toHaveLength(0);
  });

  it("lehnt ohne konfigurierten Mailversand ab, bevor ein Antrag entsteht", async () => {
    isEmailConfiguredMock.mockReturnValue(false);
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form(eingabe));
    expect(antwort.error).toBeTruthy();
    expect(erstelleAntrag).not.toHaveBeenCalled();
    expect(gesendet).toHaveLength(0);
  });
});
