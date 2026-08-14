import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __resetRateLimits } from "@/lib/auth/rate-limit";
import { POST } from "@/app/api/gate/route";
import { SITE_GATE_COOKIE, verifyGatePassword } from "@/lib/security/site-gate";

/**
 * Das Site-Gate ist im Pilotbetrieb die einzige Hürde zwischen dem offenen
 * Internet und echten Kundendaten – und es schützt ein GETEILTES Passwort, also
 * die schwächste Art von Geheimnis. Ohne Bremse kann es beliebig oft geraten
 * werden; die Domain wird nachweislich automatisiert abgeklopft (Sonden auf
 * `.env`, `/.git/HEAD`, PHP-Hintertüren, mehrmals pro Woche).
 *
 * Es läuft absichtlich das echte In-Memory-Rate-Limit mit (kein Mock): geprüft
 * werden soll die Verdrahtung, nicht ein nachgebauter Zähler.
 */

const PASSWORT = "geheim-pilot-2026";

function anfrage(passwort: string, ip = "203.0.113.7", next = "/dashboard") {
  const form = new FormData();
  form.set("password", passwort);
  form.set("next", next);
  return new Request("https://baufidesk.de/api/gate", {
    method: "POST",
    body: form,
    headers: { "x-real-ip": ip },
  }) as never;
}

function ziel(res: Response): string {
  return res.headers.get("location") ?? "";
}

function gateCookie(res: Response): string | null {
  const roh = res.headers.get("set-cookie") ?? "";
  return roh.includes(`${SITE_GATE_COOKIE}=`) ? roh : null;
}

beforeEach(() => {
  __resetRateLimits();
  vi.stubEnv("SITE_GATE_PASSWORD", PASSWORT);
  vi.stubEnv("LOGIN_RATE_MAX", "5");
  vi.stubEnv("LOGIN_RATE_WINDOW_SEC", "300");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Site-Gate", () => {
  it("lässt mit richtigem Passwort durch und setzt das Cookie", async () => {
    const res = await POST(anfrage(PASSWORT));
    expect(res.status).toBe(303);
    expect(ziel(res)).toContain("/dashboard");
    expect(gateCookie(res)).toBeTruthy();
  });

  it("weist ein falsches Passwort ab, ohne Cookie", async () => {
    const res = await POST(anfrage("falsch"));
    expect(res.status).toBe(303);
    expect(ziel(res)).toContain("/gate?error=1");
    expect(gateCookie(res)).toBeNull();
  });

  it("stoppt das Durchprobieren: nach fünf Fehlversuchen zieht das RICHTIGE Passwort nicht mehr", async () => {
    // Das ist der eigentliche Zweck. Ein Angreifer, der raten darf, bis er
    // trifft, kommt sonst irgendwann durch – und dahinter liegen echte
    // Kundendaten.
    for (let i = 0; i < 5; i++) {
      const res = await POST(anfrage(`versuch-${i}`));
      expect(ziel(res)).toContain("error=1");
    }

    const res = await POST(anfrage(PASSWORT));
    expect(ziel(res)).toContain("error=zu-viele");
    expect(gateCookie(res)).toBeNull();
  });

  it("sperrt nur die auffällige Adresse, nicht alle Besucher", async () => {
    for (let i = 0; i < 5; i++) await POST(anfrage("falsch", "198.51.100.1"));

    const anderer = await POST(anfrage(PASSWORT, "203.0.113.99"));
    expect(gateCookie(anderer)).toBeTruthy();
  });

  it("merkt sich das Ziel auch beim Abweisen – niemand landet nach dem Warten woanders", async () => {
    for (let i = 0; i < 5; i++) await POST(anfrage("falsch"));
    const res = await POST(anfrage("falsch", "203.0.113.7", "/cases/abc"));
    expect(ziel(res)).toContain("next=%2Fcases%2Fabc");
  });

  it("bremst nicht, wenn das Gate gar nicht aktiv ist", async () => {
    vi.stubEnv("SITE_GATE_PASSWORD", "");
    for (let i = 0; i < 8; i++) {
      const res = await POST(anfrage("egal"));
      expect(res.status).toBe(303);
      expect(ziel(res)).toContain("/dashboard");
    }
  });

  it("nimmt kein fremdes Weiterleitungsziel an (kein Open Redirect)", async () => {
    const res = await POST(anfrage(PASSWORT, "203.0.113.7", "//boese.example/pfad"));
    expect(ziel(res)).not.toContain("boese.example");
  });
});

describe("verifyGatePassword", () => {
  it("erkennt das richtige Passwort", async () => {
    await expect(verifyGatePassword(PASSWORT, PASSWORT)).resolves.toBe(true);
  });

  it("weist ein falsches ab – auch wenn es nur um ein Zeichen abweicht", async () => {
    await expect(verifyGatePassword(PASSWORT + "x", PASSWORT)).resolves.toBe(false);
    await expect(verifyGatePassword(PASSWORT.slice(0, -1), PASSWORT)).resolves.toBe(false);
  });

  it("weist Leeres und Nicht-Zeichenketten ab, statt daran zu scheitern", async () => {
    // Ein Formularfeld kann auch eine Datei liefern; das darf keinen 500er geben.
    await expect(verifyGatePassword("", PASSWORT)).resolves.toBe(false);
    await expect(verifyGatePassword(null, PASSWORT)).resolves.toBe(false);
    await expect(verifyGatePassword(new File([], "x"), PASSWORT)).resolves.toBe(false);
  });
});
