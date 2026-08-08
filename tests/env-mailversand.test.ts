import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * MAILVERSAND ist die Sicherheitsstufe fuer den Mailversand (drei Stufen,
 * siehe src/lib/email/resend.ts). Die Vorgabe "nur_intern" muss auch dann
 * gelten, wenn die Variable fehlt ODER einen unbekannten Wert traegt - ein
 * Tippfehler in Vercel darf niemals dazu fuehren, dass die App entweder
 * abstuerzt oder (schlimmer) ungeprueft an Kunden sendet.
 */
async function frischesEnv() {
  vi.resetModules();
  const { getEnv } = await import("@/lib/env");
  return getEnv;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MAILVERSAND", () => {
  it("ist 'nur_intern', wenn die Variable fehlt", async () => {
    vi.stubEnv("MAILVERSAND", undefined);
    const getEnv = await frischesEnv();
    expect(getEnv().MAILVERSAND).toBe("nur_intern");
  });

  it("ist 'nur_intern', wenn die Variable einen unbekannten Wert traegt", async () => {
    vi.stubEnv("MAILVERSAND", "an"); // alter Wert aus KUNDENVERSAND, jetzt ungueltig
    const getEnv = await frischesEnv();
    expect(getEnv().MAILVERSAND).toBe("nur_intern");
  });

  it("nimmt 'kunden' an, wenn ausdruecklich gesetzt", async () => {
    vi.stubEnv("MAILVERSAND", "kunden");
    const getEnv = await frischesEnv();
    expect(getEnv().MAILVERSAND).toBe("kunden");
  });

  it("nimmt 'aus' an, wenn ausdruecklich gesetzt", async () => {
    vi.stubEnv("MAILVERSAND", "aus");
    const getEnv = await frischesEnv();
    expect(getEnv().MAILVERSAND).toBe("aus");
  });

  it("die alten Variablen KUNDENVERSAND / KUNDENVERSAND_NUR_AN existieren nicht mehr", async () => {
    const getEnv = await frischesEnv();
    const env = getEnv() as Record<string, unknown>;
    expect(env).not.toHaveProperty("KUNDENVERSAND");
    expect(env).not.toHaveProperty("KUNDENVERSAND_NUR_AN");
  });
});
