import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SystemStatusItem } from "@/lib/system/status";

/**
 * Der Betreiber muss die aktuelle Mailversand-Stufe im Systemstatus sehen,
 * ohne danach suchen zu müssen (src/lib/system/status.ts) – insbesondere in
 * den beiden nicht-normalen Stufen, damit niemand glaubt, eine Mail sei
 * hinausgegangen, obwohl sie umgeleitet oder gar nicht verschickt wurde.
 */

let env: Record<string, unknown> = {};
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

vi.mock("@/lib/db", () => ({
  prisma: {
    platformConnection: {
      findMany: vi.fn(async () => [
        { platform: "europace", configured: true },
        { platform: "finlink", configured: true },
        { platform: "ehyp_home", configured: true },
      ]),
    },
  },
}));

function basisEnv() {
  return {
    AUTH_MODE: "session",
    STORAGE_PROVIDER: "supabase",
    AI_PROVIDER: "azure-openai",
    OCR_PROVIDER: "mistral",
    VIRUS_SCANNER: "clamav",
    CLAMAV_HOST: "127.0.0.1",
    MAILVERSAND: "kunden",
    PLATFORM_ADMIN_EMAIL: "betreiber@baufidesk.de",
  };
}

beforeEach(() => {
  vi.resetModules();
  env = basisEnv();
});

function mailItem(items: SystemStatusItem[]) {
  return items.find((i) => i.key === "mailversand");
}

describe("Systemstatus: Mailversand-Stufe", () => {
  it("zeigt 'kunden' als aktiven Normalbetrieb", async () => {
    const { getSystemStatus } = await import("@/lib/system/status");
    const status = await getSystemStatus("org-1");
    const item = mailItem(status.items);
    expect(item?.mode).toBe("active");
    expect(item?.value).toMatch(/Kunden/);
  });

  it("zeigt 'nur_intern' deutlich sichtbar (Achtung) mit Betreiberadresse", async () => {
    env.MAILVERSAND = "nur_intern";
    const { getSystemStatus } = await import("@/lib/system/status");
    const status = await getSystemStatus("org-1");
    const item = mailItem(status.items);
    expect(item?.mode).toBe("warn");
    expect(item?.value).toContain("betreiber@baufidesk.de");
  });

  it("zeigt 'nur_intern' ohne PLATFORM_ADMIN_EMAIL als faktisch aus (nicht als funktionierenden Testbetrieb)", async () => {
    env.MAILVERSAND = "nur_intern";
    env.PLATFORM_ADMIN_EMAIL = undefined;
    const { getSystemStatus } = await import("@/lib/system/status");
    const status = await getSystemStatus("org-1");
    const item = mailItem(status.items);
    expect(item?.mode).toBe("off");
  });

  it("zeigt 'aus' deutlich als ausgeschaltet", async () => {
    env.MAILVERSAND = "aus";
    const { getSystemStatus } = await import("@/lib/system/status");
    const status = await getSystemStatus("org-1");
    const item = mailItem(status.items);
    expect(item?.mode).toBe("off");
    expect(item?.value).toMatch(/Ausgeschaltet/);
  });

  it("gilt bei 'kunden' nicht mehr automatisch als Pilotgrund, aber bei 'nur_intern'/'aus' schon", async () => {
    const { getSystemStatus } = await import("@/lib/system/status");
    const statusKunden = await getSystemStatus("org-1");
    expect(statusKunden.pilot).toBe(false);

    vi.resetModules();
    env = { ...basisEnv(), MAILVERSAND: "nur_intern" };
    const { getSystemStatus: getSystemStatus2 } = await import("@/lib/system/status");
    const statusNurIntern = await getSystemStatus2("org-1");
    expect(statusNurIntern.pilot).toBe(true);
  });
});

/**
 * Der Betreiber muss sehen, OB ueberhaupt echt gescannt wird. Bisher meldete
 * der Status nur ClamAV als aktiv – mit Cloudmersive stand dort weiter
 * "Mock (Demo)", obwohl echt gescannt wurde. Falschmeldung in beide
 * Richtungen ist gefaehrlich: sie macht den Status wertlos.
 */
describe("Systemstatus – Virenscan", () => {
  const virusEintrag = async () => {
    const { getSystemStatus } = await import("@/lib/system/status");
    const status = await getSystemStatus("org-1");
    return status.items.find((i: SystemStatusItem) => i.key === "virus");
  };

  it("meldet den Mock als Demo", async () => {
    env = { ...basisEnv(), VIRUS_SCANNER: "mock" };
    const v = await virusEintrag();
    expect(v?.mode).toBe("demo");
  });

  it("meldet ClamAV mit Host als aktiv", async () => {
    env = { ...basisEnv(), VIRUS_SCANNER: "clamav", CLAMAV_HOST: "clam.intern" };
    expect((await virusEintrag())?.mode).toBe("active");
  });

  it("meldet ClamAV ohne Host als Demo, mit Hinweis", async () => {
    env = { ...basisEnv(), VIRUS_SCANNER: "clamav", CLAMAV_HOST: undefined };
    const v = await virusEintrag();
    expect(v?.mode).toBe("demo");
    expect(v?.hint).toMatch(/CLAMAV_HOST/);
  });

  it("meldet Cloudmersive mit Schluessel als aktiv", async () => {
    env = { ...basisEnv(), VIRUS_SCANNER: "cloudmersive", CLOUDMERSIVE_API_KEY: "geheim" };
    expect((await virusEintrag())?.mode).toBe("active");
  });

  it("meldet Cloudmersive ohne Schluessel als Demo, mit Hinweis", async () => {
    env = { ...basisEnv(), VIRUS_SCANNER: "cloudmersive" };
    const v = await virusEintrag();
    expect(v?.mode).toBe("demo");
    expect(v?.hint).toMatch(/CLOUDMERSIVE_API_KEY/);
  });
});
