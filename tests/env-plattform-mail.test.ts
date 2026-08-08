import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * PLATFORM_ADMIN_EMAIL ohne Formatpruefung hiess: Ein Tippfehler bleibt still –
 * die Benachrichtigung "neue Anmeldung wartet" geht nie raus, und niemand
 * merkt es. Der Wert bleibt optional, muss aber eine Adresse sein, wenn er da ist.
 */
async function frischesEnv() {
  vi.resetModules();
  const { getEnv } = await import("@/lib/env");
  return getEnv;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PLATFORM_ADMIN_EMAIL", () => {
  it("darf fehlen", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", undefined);
    const getEnv = await frischesEnv();
    expect(getEnv().PLATFORM_ADMIN_EMAIL).toBeUndefined();
  });

  it("darf leer sein – eine geleerte Variable verhindert den Start nicht", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "");
    const getEnv = await frischesEnv();
    expect(getEnv().PLATFORM_ADMIN_EMAIL).toBeFalsy();
  });

  it("nimmt eine gueltige Adresse an", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "betreiber@baufidesk.de");
    const getEnv = await frischesEnv();
    expect(getEnv().PLATFORM_ADMIN_EMAIL).toBe("betreiber@baufidesk.de");
  });

  it("weist einen Tippfehler beim Start ab, statt still nichts zu versenden", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "betreiber-at-baufidesk.de");
    const getEnv = await frischesEnv();
    expect(() => getEnv()).toThrow(/Umgebungskonfiguration/);
  });
});
