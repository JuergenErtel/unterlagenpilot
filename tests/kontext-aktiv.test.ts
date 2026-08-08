import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const nutzer = {
  gefunden: true,
  active: true,
  orgVorhanden: true,
  organizationId: "o1",
  organizationName: "Beispiel Finanz",
  name: "Anna",
  role: "org_admin" as const,
};

// Mutierbarer Env-Zustand statt vi.doMock/vi.resetModules: einfacher und ohne
// die Gefahr, hoisted vi.mock-Registrierungen versehentlich zu deregistrieren.
const envState = {
  AUTH_MODE: "session" as "session" | "demo",
};

// Mutierbarer Zustand fuer den Demo-Fallback (erster aktiver Nutzer).
const demoNutzer: {
  vorhanden: boolean;
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  role: "org_admin";
} = {
  vorhanden: false,
  id: "demo-u1",
  organizationId: "demo-o1",
  organizationName: "Demo Finanz",
  name: "Demo-Nutzer",
  role: "org_admin",
};

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret-1234567890",
    AUTH_MODE: envState.AUTH_MODE,
    SESSION_COOKIE_NAME: "up_session",
    SESSION_TTL_HOURS: 12,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      // Organisation wird verschachtelt mitgeladen (eine Abfrage statt zwei) –
      // der Mock bildet das nach: `organization` ist Teil derselben Antwort.
      findUnique: vi.fn(async () =>
        nutzer.gefunden
          ? {
              id: "u1",
              active: nutzer.active,
              organizationId: nutzer.organizationId,
              name: nutzer.name,
              role: nutzer.role,
              organization: nutzer.orgVorhanden ? { name: nutzer.organizationName } : null,
            }
          : null
      ),
      findFirst: vi.fn(async () =>
        demoNutzer.vorhanden
          ? {
              id: demoNutzer.id,
              organizationId: demoNutzer.organizationId,
              name: demoNutzer.name,
              role: demoNutzer.role,
              organization: { name: demoNutzer.organizationName },
            }
          : null
      ),
    },
  },
}));

let cookieWert: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieWert ? { value: cookieWert } : undefined) }),
}));

beforeEach(() => {
  cookieWert = undefined;
  nutzer.gefunden = true;
  nutzer.active = true;
  nutzer.orgVorhanden = true;
  nutzer.organizationId = "o1";
  nutzer.role = "org_admin";
  envState.AUTH_MODE = "session";
  demoNutzer.vorhanden = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function sessionCookieFuer(): Promise<string> {
  const { createSessionToken } = await import("@/lib/auth/session");
  return createSessionToken({ sub: "u1", org: "o1", role: "org_admin", name: "Anna" });
}

describe("Kontext aus der Session", () => {
  it("laesst einen aktiven Nutzer durch", async () => {
    cookieWert = await sessionCookieFuer();
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({ userId: "u1", organizationId: "o1" });
  });

  it("sperrt einen deaktivierten Nutzer trotz gueltigem Cookie aus", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.active = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("sperrt aus, wenn der Nutzer geloescht wurde", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.gefunden = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("sperrt aus, wenn die Organisation nicht mehr existiert", async () => {
    // Ergaenzung zur Nachbesserung nach Task-Pruefung: der Kontext darf nicht
    // durchfallen, wenn die Organisation des Nutzers (z.B. geloescht) fehlt.
    cookieWert = await sessionCookieFuer();
    nutzer.orgVorhanden = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("nimmt Rolle und Organisation aus der DB, nicht aus dem Cookie", async () => {
    // Cookie behauptet o1/org_admin – die DB sagt o2/teammitglied. Die DB gewinnt,
    // sonst behielte ein herabgestufter Nutzer seine Rechte bis zum Ablauf.
    cookieWert = await sessionCookieFuer();
    nutzer.organizationId = "o2";
    nutzer.role = "teammitglied" as never;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({
      organizationId: "o2",
      role: "teammitglied",
    });
  });
});

describe("Demo-Modus in Produktion", () => {
  // Verhaltenstest statt Zeichenketten-Test (Nachbesserung nach Task-Pruefung):
  // eine Bedingung wie `... || hintertuer` liesse einen reinen Quelltext-Regex-
  // Test gruen durchrutschen, obwohl `&&` vor `||` bindet und der Schutz in
  // Produktion umgangen wuerde. Hier wird tatsaechlich geprueft, was
  // `getCurrentContext()` zurueckgibt – kein gueltiger Session-Cookie liegt vor
  // (siehe globaler beforeEach), der Demo-Zweig ist also grundsaetzlich erreichbar.
  it("liefert null in Produktion, obwohl AUTH_MODE=demo gesetzt ist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    envState.AUTH_MODE = "demo";
    demoNutzer.vorhanden = true; // waere ohne die Sperre ein Treffer
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("liefert ausserhalb der Produktion den Demo-Nutzer, wenn AUTH_MODE=demo gesetzt ist", async () => {
    vi.stubEnv("NODE_ENV", "development");
    envState.AUTH_MODE = "demo";
    demoNutzer.vorhanden = true;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({ isDemo: true, userId: "demo-u1" });
  });
});
