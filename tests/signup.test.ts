import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as PasswortRegeln from "@/lib/auth/passwort-regeln";
import type * as Signup from "@/lib/auth/signup";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

const db = { users: [] as Array<Record<string, unknown>>, requests: [] as Array<Record<string, unknown>> };

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        db.users.find((u) => u.email === where.email) ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.users.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    signupRequest: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        db.requests.find((r) => r.email === where.email || r.id === where.id) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `r${db.requests.length + 1}`, ...data };
        db.requests.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.requests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

vi.mock("@/lib/auth/tokens", () => ({
  TOKEN_GUELTIGKEIT: { email_bestaetigung: 172800, passwort_reset: 3600, einladung: 604800 },
  erstelleToken: vi.fn(async () => ({ id: "t1", token: "klartext-token", expiresAt: new Date() })),
  verbraucheToken: vi.fn(async (token: string) =>
    token === "klartext-token" ? { id: "t1", userId: null, signupRequestId: "r1" } : null
  ),
  findeToken: vi.fn(async (token: string) =>
    token === "klartext-token" ? { id: "t1", userId: null, signupRequestId: "r1" } : null
  ),
  entwerteOffeneToken: vi.fn(async () => {}),
}));

const gueltig = {
  name: "Anna Beispiel",
  firmenname: "Beispiel Finanz GmbH",
  email: "anna@beispiel.de",
  passwort: "einLangesGeheimwort2026",
  agb: true,
  wunschtarif: "pro" as const,
} as const;

beforeEach(() => {
  db.users = [];
  db.requests = [];
  // Nur die Aufrufzaehler zuruecksetzen, die Implementierungen der Mocks
  // bleiben erhalten (vi.clearAllMocks, nicht resetAllMocks).
  vi.clearAllMocks();
});

describe("Passwortregeln", () => {
  it("verlangt mindestens 12 Zeichen", async () => {
    const { pruefePasswort } = await import("@/lib/auth/passwort-regeln");
    expect(pruefePasswort("kurz123").ok).toBe(false);
    expect(pruefePasswort("einLangesGeheimwort2026").ok).toBe(true);
  });

  it("weist offensichtliche Passwoerter ab", async () => {
    const { pruefePasswort } = await import("@/lib/auth/passwort-regeln");
    expect(pruefePasswort("passwort1234").ok).toBe(false);
    expect(pruefePasswort("123456789012").ok).toBe(false);
  });
});

describe("Antrag anlegen", () => {
  it("verlangt das AGB-Haekchen", async () => {
    const { SIGNUP_EINGABE } = await import("@/lib/auth/signup");
    expect(SIGNUP_EINGABE.safeParse({ ...gueltig, agb: false }).success).toBe(false);
  });

  it("normalisiert die Adresse und legt den Antrag an", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    const res = await erstelleAntrag({ ...gueltig, email: "  Anna@Beispiel.DE " }, { ip: "1.2.3.4" });
    expect(res.status).toBe("neu_angelegt");
    expect(db.requests[0]!.email).toBe("anna@beispiel.de");
  });

  it("speichert das Passwort nur als Hash", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    expect(db.requests[0]!.passwordHash).not.toContain("einLangesGeheimwort2026");
    expect(String(db.requests[0]!.passwordHash).startsWith("scrypt$")).toBe(true);
  });

  it("haelt den AGB-Nachweis fest", async () => {
    const { erstelleAntrag, AGB_VERSION } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: "1.2.3.4" });
    expect(db.requests[0]!.agbVersion).toBe(AGB_VERSION);
    expect(db.requests[0]!.agbAkzeptiertAm).toBeInstanceOf(Date);
    expect(db.requests[0]!.agbIp).toBe("1.2.3.4");
  });

  it("verraet nicht, dass eine Adresse schon vergeben ist", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    db.users.push({ email: "anna@beispiel.de" });
    const res = await erstelleAntrag(gueltig, { ip: null });
    // Eigener Rueckgabewert fuer die Mailwahl – die Server Action macht daraus
    // nach aussen dieselbe Antwort wie bei Erfolg.
    expect(res.status).toBe("bereits_vergeben");
    expect(db.requests).toHaveLength(0);
  });

  it("bremst schnelle Wiederholungen auf dieselbe Adresse", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    // Zweiter Anlauf unmittelbar danach: der Antrag steht schon auf "neu",
    // die letzte Mail ist Sekunden alt.
    const zweiter = await erstelleAntrag(gueltig, { ip: null });
    expect(zweiter.status).toBe("zu_haeufig");
    expect(db.requests).toHaveLength(1);
  });

  it("laesst einen unbestaetigten Antrag nach der Mailsperre erneut anfordern", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    const { entwerteOffeneToken } = await import("@/lib/auth/tokens");
    const erster = await erstelleAntrag(gueltig, { ip: null });
    expect(erster.status).toBe("neu_angelegt");

    // Die Bestaetigungsmail liegt laenger als MAIL_ABSTAND_MS zurueck – genau
    // die Lage, in der jemand den Link nie angeklickt hat.
    db.requests[0]!.letzteMailAm = new Date(Date.now() - 6 * 60 * 1000);

    const zweiter = await erstelleAntrag(gueltig, { ip: null });
    // Kein "bereits_vergeben": der Trichter bleibt offen.
    expect(zweiter.status).toBe("neu_angelegt");
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]!.status).toBe("neu");
    // Die alten Links sind entwertet, es gibt nur einen gueltigen.
    expect(entwerteOffeneToken).toHaveBeenCalledWith("email_bestaetigung", {
      signupRequestId: "r1",
    });
  });

  it("sperrt die Adresse, sobald der Antrag bestaetigt ist", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    db.requests[0]!.status = "bestaetigt";
    db.requests[0]!.letzteMailAm = new Date(Date.now() - 6 * 60 * 1000);
    const zweiter = await erstelleAntrag(gueltig, { ip: null });
    expect(zweiter.status).toBe("bereits_vergeben");
  });

  it("bremst schnelle Wiederholungen auch fuer bestehende User ohne Antrag", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    // Direkt angelegter User (z.B. Betreiber, Seed-Daten) hat keinen SignupRequest
    db.users.push({ id: "u1", email: "anna@beispiel.de", letzteHinweisMailAm: null });
    const res1 = await erstelleAntrag(gueltig, { ip: null });
    expect(res1.status).toBe("bereits_vergeben");
    // letzteHinweisMailAm wurde gesetzt
    expect(db.users[0]!.letzteHinweisMailAm).toBeInstanceOf(Date);
    // Zweiter Anlauf unmittelbar danach: Sperre greift
    const res2 = await erstelleAntrag(gueltig, { ip: null });
    expect(res2.status).toBe("zu_haeufig");
  });
});

describe("Bestaetigungsseite (nur lesend)", () => {
  it("schlaegt das Token nach, ohne es zu verbrauchen", async () => {
    const { erstelleAntrag, liesBestaetigung } = await import("@/lib/auth/signup");
    const { verbraucheToken } = await import("@/lib/auth/tokens");
    await erstelleAntrag(gueltig, { ip: null });

    const res = await liesBestaetigung("klartext-token");
    expect(res).toMatchObject({ ok: true, bereitsBestaetigt: false });
    // Der blosse Seitenaufruf (auch der eines Link-Scanners) darf nichts aendern.
    expect(verbraucheToken).not.toHaveBeenCalled();
    expect(db.requests[0]!.status).toBe("neu");
  });

  it("meldet ein unbekanntes Token als ungueltig", async () => {
    const { liesBestaetigung } = await import("@/lib/auth/signup");
    await expect(liesBestaetigung("falsch")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  });

  it("nennt einen bereits bestaetigten Antrag beim Namen", async () => {
    const { erstelleAntrag, liesBestaetigung } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    db.requests[0]!.status = "bestaetigt";
    await expect(liesBestaetigung("klartext-token")).resolves.toMatchObject({
      ok: true,
      bereitsBestaetigt: true,
    });
  });

  it("gibt zu einem abgelehnten Antrag keinen Grund nach aussen", async () => {
    const { erstelleAntrag, liesBestaetigung } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    db.requests[0]!.status = "abgelehnt";
    await expect(liesBestaetigung("klartext-token")).resolves.toMatchObject({
      ok: false,
      grund: "abgelehnt",
    });
  });
});

describe("E-Mail bestaetigen", () => {
  it("setzt den Antrag auf bestaetigt", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    const res = await bestaetigeEmail("klartext-token");
    expect(res).toMatchObject({ ok: true, firmenname: "Beispiel Finanz GmbH" });
    expect(db.requests[0]!.status).toBe("bestaetigt");
    expect(db.requests[0]!.emailBestaetigtAm).toBeInstanceOf(Date);
  });

  it("weist ein falsches Token ab", async () => {
    const { bestaetigeEmail } = await import("@/lib/auth/signup");
    await expect(bestaetigeEmail("falsch")).resolves.toMatchObject({ ok: false, grund: "ungueltig" });
  });

  it("bestaetigt einen abgelehnten Antrag nicht nachtraeglich", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    db.requests[0]!.status = "abgelehnt";
    await expect(bestaetigeEmail("klartext-token")).resolves.toMatchObject({ ok: false, grund: "abgelehnt" });
  });
});
