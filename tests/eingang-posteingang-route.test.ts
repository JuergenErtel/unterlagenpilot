import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Die Ein-Aktion-Route fuer den Apple-Kurzbefehl. Sie ist mit Absicht
 * nachsichtig gegenueber dem, was ein von Hand zusammengeklickter Kurzbefehl
 * schickt – aber nicht gegenueber fehlenden Schluesseln.
 */

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const resolveGeraeteToken = vi.fn();
vi.mock("@/lib/security/geraete-token", () => ({
  resolveGeraeteToken: (...a: unknown[]) => resolveGeraeteToken(...a),
}));

const nimmDateiAn = vi.fn();
vi.mock("@/lib/eingang/service", () => ({
  nimmDateiAn: (...a: unknown[]) => nimmDateiAn(...a),
}));

import { __resetRateLimits } from "@/lib/auth/rate-limit";
import { POST } from "@/app/api/eingang/posteingang/route";

const KONTEXT = {
  tokenId: "gt-1",
  bezeichnung: "iPhone",
  ctx: {
    organizationId: "org-1",
    organizationName: "Coding Brothers",
    userId: "user-1",
    userName: "Juergen",
    role: "vermittler",
    platformAdmin: false,
    backofficeRolle: null,
    isDemo: false,
  },
};

function pdf(name = "gehalt.pdf", typ = "application/pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: typ });
}

function anfrage(opts: { token?: string; feld?: string; datei?: File }) {
  const form = new FormData();
  if (opts.datei) form.set(opts.feld ?? "datei", opts.datei);
  return new Request("https://baufidesk.de/api/eingang/posteingang", {
    method: "POST",
    body: form,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  }) as never;
}

beforeEach(() => {
  __resetRateLimits();
  resolveGeraeteToken.mockReset();
  nimmDateiAn.mockReset();
  resolveGeraeteToken.mockResolvedValue(KONTEXT);
  nimmDateiAn.mockResolvedValue({ ok: true, id: "e1", name: "gehalt.pdf" });
});

describe("Posteingang-Route – Zugang", () => {
  it("weist ohne Schluessel ab", async () => {
    const res = await POST(anfrage({ datei: pdf() }));
    expect(res.status).toBe(401);
    expect(nimmDateiAn).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Schluessel ab", async () => {
    resolveGeraeteToken.mockResolvedValue(null);
    const res = await POST(anfrage({ token: "bd_falsch", datei: pdf() }));
    expect(res.status).toBe(401);
  });
});

describe("Posteingang-Route – Datei", () => {
  it("nimmt die Datei an und antwortet mit einer Meldung fuers Handy", async () => {
    const res = await POST(anfrage({ token: "bd_ok", datei: pdf() }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; meldung: string };
    expect(body.ok).toBe(true);
    expect(body.meldung).toContain("Posteingang");
    expect(nimmDateiAn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: "user-1" })
    );
  });

  it("findet die Datei auch unter einem anderen Feldnamen", async () => {
    // Wer den Kurzbefehl von Hand baut, tippt den Feldnamen selbst – ein
    // Tippfehler darf nicht wie ein kaputter Server aussehen.
    const res = await POST(anfrage({ token: "bd_ok", feld: "Datei", datei: pdf() }));
    expect(res.status).toBe(200);
  });

  it("verlangt ueberhaupt eine Datei", async () => {
    const res = await POST(anfrage({ token: "bd_ok" }));
    expect(res.status).toBe(400);
    expect(nimmDateiAn).not.toHaveBeenCalled();
  });

  it("vergibt einen Namen, wenn der Kurzbefehl keinen mitschickt", async () => {
    // Geteilte Fotos kommen oft als "file" oder ganz ohne Namen an; eine
    // namenlose Zeile im Posteingang koennte niemand zuordnen.
    await POST(anfrage({ token: "bd_ok", datei: pdf("file", "image/jpeg") }));
    const args = nimmDateiAn.mock.calls[0]?.[0] as { file: { name: string } };
    expect(args.file.name).toMatch(/^geteilt_\d+\.jpg$/);
  });

  it("behaelt einen brauchbaren Namen bei", async () => {
    await POST(anfrage({ token: "bd_ok", datei: pdf("Gehaltsabrechnung Mai.pdf") }));
    const args = nimmDateiAn.mock.calls[0]?.[0] as { file: { name: string } };
    expect(args.file.name).toBe("Gehaltsabrechnung Mai.pdf");
  });

  it("reicht die Ablehnung des Dienstes verstaendlich durch", async () => {
    nimmDateiAn.mockResolvedValue({ ok: false, name: "x.exe", grund: "Dateityp nicht erlaubt." });
    const res = await POST(anfrage({ token: "bd_ok", datei: pdf("x.exe") }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { fehler: string };
    expect(body.fehler).toContain("Dateityp");
  });
});
