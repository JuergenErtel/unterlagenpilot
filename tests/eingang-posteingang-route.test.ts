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

function anfrage(opts: { token?: string; feld?: string; datei?: File; dateien?: File[] }) {
  const form = new FormData();
  // Mehrere Dateien landen unter DEMSELBEN Feldnamen - genau so schickt der
  // Kurzbefehl eine Mehrfachauswahl aus dem Teilen-Menue.
  for (const d of opts.dateien ?? (opts.datei ? [opts.datei] : [])) {
    form.append(opts.feld ?? "datei", d);
  }
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

/**
 * Der Bugfix vom 10.09.2026: Juergen teilte in WhatsApp mehrere Bilder auf
 * einmal, bekam am Handy "liegt im Posteingang" - und im Posteingang lag ein
 * einziges Bild. Die Route nahm die erste Datei und warf den Rest weg, ohne
 * dass es irgendwo auffiel.
 *
 * Zwei Lehren stehen in diesen Tests:
 *  - Jede mitgeschickte Datei wird angenommen.
 *  - Die Meldung nennt eine ZAHL. Schickt das Handy weniger, als der Nutzer
 *    markiert hat, sieht er es sofort am Handy statt Tage spaeter in der Akte.
 */
describe("Posteingang-Route – mehrere Dateien in einer Anfrage", () => {
  function bilder(n: number) {
    return Array.from({ length: n }, (_, i) => pdf(`bild-${i + 1}.jpg`, "image/jpeg"));
  }

  it("nimmt ALLE mitgeschickten Dateien an, nicht nur die erste", async () => {
    nimmDateiAn.mockImplementation(async (a: { file: { name: string } }) => ({
      ok: true,
      id: a.file.name,
      name: a.file.name,
    }));
    const res = await POST(anfrage({ token: "bd_ok", dateien: bilder(3) }));
    expect(res.status).toBe(200);
    expect(nimmDateiAn).toHaveBeenCalledTimes(3);
    const namen = nimmDateiAn.mock.calls.map((c) => (c[0] as { file: { name: string } }).file.name);
    expect(namen).toEqual(["bild-1.jpg", "bild-2.jpg", "bild-3.jpg"]);
  });

  it("nennt die Anzahl in der Meldung fuers Handy", async () => {
    nimmDateiAn.mockImplementation(async (a: { file: { name: string } }) => ({
      ok: true,
      id: a.file.name,
      name: a.file.name,
    }));
    const res = await POST(anfrage({ token: "bd_ok", dateien: bilder(3) }));
    const body = (await res.json()) as { ok: boolean; meldung: string; angenommen: number };
    expect(body.angenommen).toBe(3);
    expect(body.meldung).toContain("3 Dateien");
  });

  it("nennt bei einer einzelnen Datei weiter ihren Namen", async () => {
    // Gemeldet wird der Name, den der DIENST zurueckgibt - er kann ihn
    // aendern (HEIC wird zu .jpg).
    nimmDateiAn.mockImplementation(async (a: { file: { name: string } }) => ({
      ok: true,
      id: a.file.name,
      name: a.file.name,
    }));
    const res = await POST(anfrage({ token: "bd_ok", datei: pdf("Gehalt Mai.pdf") }));
    const body = (await res.json()) as { meldung: string; angenommen: number };
    expect(body.angenommen).toBe(1);
    expect(body.meldung).toContain("Gehalt Mai.pdf");
  });

  it("gibt unbenannten Dateien derselben Anfrage verschiedene Namen", async () => {
    // Geteilte Fotos heissen oft "file". Bekaemen sie alle denselben
    // Ersatznamen, staenden im Posteingang drei ununterscheidbare Zeilen.
    await POST(anfrage({ token: "bd_ok", dateien: [pdf("file", "image/jpeg"), pdf("file", "image/jpeg"), pdf("file", "image/jpeg")] }));
    const namen = nimmDateiAn.mock.calls.map((c) => (c[0] as { file: { name: string } }).file.name);
    expect(new Set(namen).size).toBe(3);
  });

  it("laesst die anderen durch, wenn eine Datei abgelehnt wird – und sagt es", async () => {
    nimmDateiAn.mockImplementation(async (a: { file: { name: string } }) =>
      a.file.name === "bild-2.jpg"
        ? { ok: false, name: a.file.name, grund: "Dateityp nicht erlaubt." }
        : { ok: true, id: a.file.name, name: a.file.name }
    );
    const res = await POST(anfrage({ token: "bd_ok", dateien: bilder(3) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; meldung: string; angenommen: number; abgelehnt: number };
    expect(body.ok).toBe(true);
    expect(body.angenommen).toBe(2);
    expect(body.abgelehnt).toBe(1);
    expect(body.meldung).toContain("bild-2.jpg");
  });

  it("antwortet mit 422, wenn KEINE Datei angenommen wurde", async () => {
    nimmDateiAn.mockResolvedValue({ ok: false, name: "x.exe", grund: "Dateityp nicht erlaubt." });
    const res = await POST(anfrage({ token: "bd_ok", dateien: bilder(2) }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; fehler: string };
    expect(body.ok).toBe(false);
    expect(body.fehler).toContain("Dateityp");
  });

  it("verarbeitet hoechstens 25 Dateien und verschweigt den Rest nicht", async () => {
    nimmDateiAn.mockImplementation(async (a: { file: { name: string } }) => ({
      ok: true,
      id: a.file.name,
      name: a.file.name,
    }));
    const res = await POST(anfrage({ token: "bd_ok", dateien: bilder(30) }));
    expect(nimmDateiAn).toHaveBeenCalledTimes(25);
    const body = (await res.json()) as { meldung: string };
    expect(body.meldung).toContain("5");
  });
});
