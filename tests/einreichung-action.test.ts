import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const reicheEin = vi.fn();
const loeseEinreichungsToken = vi.fn();
const checkRateLimit = vi.fn(async () => ({ ok: true }));
const redirect = vi.fn((u: string) => {
  throw new Error("NEXT_REDIRECT:" + u);
});

vi.mock("@/lib/backoffice/einreichung", () => ({ reicheEin, loeseEinreichungsToken }));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-real-ip", "1.2.3.4"]]) }));

const ziel = { linkId: "l1", auftraggeberId: "ag", backofficeOrganizationId: "b", auftraggeberName: "Makler", backofficeName: "BO" };

function fd(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

const gueltig = {
  vorname1: "Erika",
  nachname1: "Muster",
  email1: "e@m.de",
  phone1: "",
  vorname2: "",
  nachname2: "",
  auftragsart: "basis_pruefung",
  referenz: "MM-1",
  hinweise: "",
  ansprechName: "Frau Müller",
  ansprechEmail: "m@m.de",
  ansprechPhone: "",
  firmenzusatz: "",
};

describe("einreichungAbsendenAction", () => {
  beforeEach(() => {
    reicheEin.mockReset();
    loeseEinreichungsToken.mockReset();
    checkRateLimit.mockClear();
    redirect.mockClear();
    loeseEinreichungsToken.mockResolvedValue(ziel);
    reicheEin.mockResolvedValue({ ok: true, wert: { auftragsnummer: "BO-2026-0001", auftragId: "a", caseId: "c", uploadToken: "tok" } });
  });

  it("Honeypot gefuellt: leitet scheinbar erfolgreich weiter, legt nichts an", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    await expect(einreichungAbsendenAction("t", {}, fd({ ...gueltig, firmenzusatz: "Bot GmbH" }))).rejects.toThrow("NEXT_REDIRECT:/einreichen/t/danke");
    expect(reicheEin).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("Rate-Limit greift vor der Datenbank", async () => {
    checkRateLimit.mockResolvedValueOnce({ ok: false, retryAfterSec: 60 } as never);
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd(gueltig));
    expect(r.error).toMatch(/später/);
    expect(loeseEinreichungsToken).not.toHaveBeenCalled();
  });

  it("ungueltiges Token: neutrale Fehlermeldung", async () => {
    loeseEinreichungsToken.mockResolvedValueOnce(null);
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd(gueltig));
    expect(r.error).toMatch(/nicht mehr gültig/);
    expect(reicheEin).not.toHaveBeenCalled();
  });

  it("Pflichtfelder: Name des Antragstellers, Auftragsart, Ansprechperson", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd({ ...gueltig, nachname1: "", auftragsart: "", ansprechName: "" }));
    expect(r.fieldErrors).toMatchObject({ nachname1: expect.any(String), auftragsart: expect.any(String), ansprechName: expect.any(String) });
    expect(reicheEin).not.toHaveBeenCalled();
  });

  it("gueltig: reicht ein und leitet mit Nummer und Upload-Token weiter", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    await expect(einreichungAbsendenAction("t", {}, fd(gueltig))).rejects.toThrow("NEXT_REDIRECT:/einreichen/t/danke?nr=BO-2026-0001&upload=tok");
    expect(reicheEin).toHaveBeenCalledWith(
      ziel,
      expect.objectContaining({
        antragsteller1: expect.objectContaining({ vorname: "Erika", nachname: "Muster" }),
        antragsteller2: null,
        auftragsart: "basis_pruefung",
        ansprechperson: expect.objectContaining({ name: "Frau Müller" }),
      })
    );
  });

  it("Vertrag: /einreichen liegt vor dem Site-Gate", () => {
    const mw = readFileSync(resolve(__dirname, "../src/middleware.ts"), "utf-8");
    expect(mw).toMatch(/"\/einreichen",/);
  });
});
