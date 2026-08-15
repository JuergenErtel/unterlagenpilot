import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-real-ip", "1.2.3.4"]]) }));

const redirect = vi.fn((ziel: string) => {
  throw Object.assign(new Error("REDIRECT"), { ziel });
});
vi.mock("next/navigation", () => ({ redirect: (z: string) => redirect(z) }));

const formularZuSlug = vi.fn();
vi.mock("@/lib/leadformular/service", () => ({
  formularZuSlug: (...a: unknown[]) => formularZuSlug(...a),
}));

const createAnfrageLink = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  createAnfrageLink: (...a: unknown[]) => createAnfrageLink(...a),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

const disclosureCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { selfDisclosure: { create: (...a: unknown[]) => disclosureCreate(...a) } },
}));

import { starteAnfrage } from "@/lib/actions/anfrage";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

/** Fängt den redirect() ab, den Server Actions per Ausnahme auslösen. */
async function starten(slug: string, werte: Record<string, string>) {
  try {
    return { ergebnis: await starteAnfrage(slug, form(werte)), ziel: null as string | null };
  } catch (e) {
    if ((e as Error).message === "REDIRECT") {
      return { ergebnis: undefined, ziel: (e as { ziel: string }).ziel };
    }
    throw e;
  }
}

beforeEach(() => {
  [formularZuSlug, createAnfrageLink, checkRateLimit, disclosureCreate, redirect].forEach((m) =>
    m.mockReset()
  );
  formularZuSlug.mockResolvedValue({ id: "form-1", organizationId: "org-A", brokerId: "user-1" });
  checkRateLimit.mockResolvedValue({ ok: true, remaining: 4 });
  createAnfrageLink.mockResolvedValue({ linkId: "link-1", token: "TOK", url: "u", expiresAt: new Date() });
  disclosureCreate.mockResolvedValue({ id: "bogen-1" });
  // mockReset() oben wischt auch die Wurf-Implementierung aus der
  // vi.fn(...)-Deklaration weg (anders als mockClear()) – ohne diese Zeile
  // gibt der Mock ab dem zweiten Test still "undefined" zurueck statt zu werfen.
  redirect.mockImplementation((ziel: string) => {
    throw Object.assign(new Error("REDIRECT"), { ziel });
  });
});

describe("starteAnfrage", () => {
  it("legt Link und Bogen an und schickt auf den naechsten Schritt", async () => {
    const { ziel } = await starten("ertel", { art: "kauf_bestand" });
    expect(createAnfrageLink).toHaveBeenCalledTimes(1);
    // Non-null-Assertions: noUncheckedIndexedAccess macht Mock-Aufrufe sonst
    // "possibly undefined" -- hier ist der Aufruf durch die Erwartung oben
    // (toHaveBeenCalledTimes) bereits belegt.
    expect(disclosureCreate.mock.calls[0]![0]!.data.linkId).toBe("link-1");
    expect(disclosureCreate.mock.calls[0]![0]!.data.caseId).toBeUndefined();
    expect(disclosureCreate.mock.calls[0]![0]!.data.answers).toEqual({
      "finanzierungsart.art": "kauf_bestand",
    });
    expect(ziel).toBe("/selbstauskunft/TOK/objektstand");
  });

  it("legt nichts an, wenn das Honigtoepfchen gefuellt ist", async () => {
    // Und meldet trotzdem Erfolg: Wer "erkannt" zurueckgibt, verraet seine
    // Erkennung an den naechsten Versuch.
    const { ergebnis } = await starten("ertel", { art: "kauf_bestand", website: "http://spam" });
    expect(ergebnis).toEqual({ danke: true });
    expect(createAnfrageLink).not.toHaveBeenCalled();
    expect(disclosureCreate).not.toHaveBeenCalled();
  });

  it("legt nichts an, wenn die IP-Grenze erreicht ist", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfterSec: 3600 });
    const { ergebnis } = await starten("ertel", { art: "kauf_bestand" });
    expect(ergebnis?.error).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("legt nichts an, wenn das Formular unbekannt oder abgeschaltet ist", async () => {
    formularZuSlug.mockResolvedValue(null);
    const { ergebnis } = await starten("gibtsnicht", { art: "kauf_bestand" });
    expect(ergebnis?.error).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("weist einen ungueltigen Wert ab, statt ihn zu speichern", async () => {
    const { ergebnis } = await starten("ertel", { art: "brieftaube" });
    expect(ergebnis?.fieldErrors).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("laesst den ersten Schritt leer und geht trotzdem weiter", async () => {
    // Der Katalog kennt keine Pflichtfelder – auch nicht im ersten Schritt.
    const { ziel } = await starten("ertel", {});
    expect(disclosureCreate.mock.calls[0]![0]!.data.answers).toEqual({});
    expect(ziel).toContain("/selbstauskunft/TOK/");
  });

  it("gibt zwei Besuchern getrennte Boegen", async () => {
    // Der Kern des Entwurfs: Der Dauerlink ERZEUGT Boegen, statt einer zu
    // sein. Bekaemen beide denselben Link, laese der zweite Interessent die
    // Antworten des ersten.
    createAnfrageLink
      .mockResolvedValueOnce({ linkId: "link-A", token: "TOK-A", url: "u", expiresAt: new Date() })
      .mockResolvedValueOnce({ linkId: "link-B", token: "TOK-B", url: "u", expiresAt: new Date() });

    const erster = await starten("ertel", { art: "kauf_bestand" });
    const zweiter = await starten("ertel", { art: "kauf_bestand" });

    expect(disclosureCreate.mock.calls[0]![0]!.data.linkId).toBe("link-A");
    expect(disclosureCreate.mock.calls[1]![0]!.data.linkId).toBe("link-B");
    expect(erster.ziel).not.toBe(zweiter.ziel);
  });
});
