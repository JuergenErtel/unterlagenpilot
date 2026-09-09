import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Der Geraete-Eingang ist ein zweiter Weg in dieselben Akten – er umgeht das
 * Site-Gate und die Session. Geprueft wird deshalb vor allem, was er NICHT
 * darf: ohne Token nichts, mit fremdem Token nichts, in fremde Akten nichts.
 */

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const resolveGeraeteToken = vi.fn();
vi.mock("@/lib/security/geraete-token", () => ({
  resolveGeraeteToken: (...a: unknown[]) => resolveGeraeteToken(...a),
}));

const caseFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { case: { findMany: (...a: unknown[]) => caseFindMany(...a) } },
}));

const ladeAkteFuerGeraet = vi.fn();
vi.mock("@/lib/auth/akte-zugriff", () => ({
  ladeAkteFuerGeraet: (...a: unknown[]) => ladeAkteFuerGeraet(...a),
}));
vi.mock("@/lib/auth/context", () => ({
  eigeneAkteWhere: (ctx: { organizationId: string }) => ({ organizationId: ctx.organizationId }),
}));

const processUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({
  processUpload: (...a: unknown[]) => processUpload(...a),
}));

import { __resetRateLimits } from "@/lib/auth/rate-limit";
import { GET as faelleGET } from "@/app/api/eingang/faelle/route";
import { POST as uploadPOST } from "@/app/api/eingang/upload/route";

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

const AKTE = {
  id: "c1",
  organizationId: "org-1",
  akteArt: "vertrieb",
  status: "neu",
  caseNumber: "UP-2026-0002",
};

function anfrageFaelle(token?: string) {
  return new Request("https://baufidesk.de/api/eingang/faelle", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as never;
}

function anfrageUpload(opts: { token?: string; caseId?: string; datei?: File }) {
  const form = new FormData();
  if (opts.caseId !== undefined) form.set("caseId", opts.caseId);
  if (opts.datei) form.set("datei", opts.datei);
  return new Request("https://baufidesk.de/api/eingang/upload", {
    method: "POST",
    body: form,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  }) as never;
}

function pdf(name = "gehaltsabrechnung.pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: "application/pdf" });
}

beforeEach(() => {
  __resetRateLimits();
  resolveGeraeteToken.mockReset();
  caseFindMany.mockReset();
  ladeAkteFuerGeraet.mockReset();
  processUpload.mockReset();
  resolveGeraeteToken.mockResolvedValue(KONTEXT);
  caseFindMany.mockResolvedValue([]);
  ladeAkteFuerGeraet.mockResolvedValue({ status: 200, ctx: KONTEXT.ctx, akte: AKTE, fremd: false });
  processUpload.mockResolvedValue({ ok: true, fileName: "gehaltsabrechnung.pdf" });
});

describe("Geraete-Eingang – Zugang", () => {
  it("weist eine Anfrage ohne Token ab", async () => {
    const res = await faelleGET(anfrageFaelle());
    expect(res.status).toBe(401);
    expect(resolveGeraeteToken).not.toHaveBeenCalled();
  });

  it("weist ein unbekanntes Token ab", async () => {
    resolveGeraeteToken.mockResolvedValue(null);
    expect((await faelleGET(anfrageFaelle("bd_falsch"))).status).toBe(401);
    expect((await uploadPOST(anfrageUpload({ token: "bd_falsch", caseId: "c1", datei: pdf() }))).status).toBe(401);
  });

  it("nimmt das Token auch ohne Bearer-Praefix an", async () => {
    // Kurzbefehle setzen Header von Hand – ein vergessenes "Bearer " ist der
    // wahrscheinlichste Tippfehler und darf nicht wie ein falsches Token wirken.
    const res = await faelleGET(anfrageFaelle("bd_gueltig"));
    expect(res.status).toBe(200);
    const roh = new Request("https://baufidesk.de/api/eingang/faelle", {
      headers: { authorization: "bd_gueltig" },
    }) as never;
    expect((await faelleGET(roh)).status).toBe(200);
  });
});

describe("Geraete-Eingang – Fallliste", () => {
  it("fragt nur Akten der eigenen Organisation ab", async () => {
    await faelleGET(anfrageFaelle("bd_gueltig"));
    const args = caseFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ organizationId: "org-1" });
  });

  it("liefert Fallnummer und Namen als eine Zeile zum Antippen", async () => {
    caseFindMany.mockResolvedValue([
      {
        id: "c1",
        caseNumber: "UP-2026-0002",
        applicants: [{ vorname: "Anna", nachname: "Schmidt" }],
      },
      { id: "c2", caseNumber: "UP-2026-0003", applicants: [] },
    ]);
    const res = await faelleGET(anfrageFaelle("bd_gueltig"));
    const body = (await res.json()) as { faelle: { id: string; bezeichnung: string }[] };
    expect(body.faelle[0]).toEqual({ id: "c1", bezeichnung: "UP-2026-0002 · Anna Schmidt" });
    // Ein Fall ohne Antragsteller darf nicht als leere Zeile erscheinen.
    expect(body.faelle[1]?.bezeichnung).toBe("UP-2026-0003");
  });
});

describe("Geraete-Eingang – Upload", () => {
  it("nimmt eine Datei an und reicht sie an die bestehende Pipeline weiter", async () => {
    const res = await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1", datei: pdf() }));
    expect(res.status).toBe(200);
    expect(processUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        caseId: "c1",
        uploadSource: "vermittler",
        actorUserId: "user-1",
      })
    );
  });

  it("fragt den zentralen Guard schreibend – mit dem Kontext des Tokens", async () => {
    await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1", datei: pdf() }));
    expect(ladeAkteFuerGeraet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
      "c1",
      { schreibend: true }
    );
  });

  it("gibt der Pipeline keine Antragstellerzuordnung mit", () => {
    // Am Handy waehlt niemand den Antragsteller; ein geratener Wert waere als
    // "manuell" gestempelt und danach von der Namenserkennung unantastbar.
    return uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1", datei: pdf() })).then(() => {
      expect(processUpload).toHaveBeenCalledWith(
        expect.objectContaining({ applicantId: null, applicantName: null })
      );
    });
  });

  it("verlangt eine Datei", async () => {
    const res = await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1" }));
    expect(res.status).toBe(400);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("verlangt einen Fall", async () => {
    const res = await uploadPOST(anfrageUpload({ token: "bd_gueltig", datei: pdf() }));
    expect(res.status).toBe(400);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("antwortet auf eine verwehrte oder unbekannte Akte mit 404, nie mit 403", async () => {
    // Ein 403 verriete, dass es diesen Fall gibt.
    ladeAkteFuerGeraet.mockResolvedValue({ status: 404 });
    const res = await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "fremd", datei: pdf() }));
    expect(res.status).toBe(404);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("laedt in die Organisation DER AKTE, nicht in die des Tokens", async () => {
    ladeAkteFuerGeraet.mockResolvedValue({
      status: 200,
      ctx: KONTEXT.ctx,
      akte: { ...AKTE, organizationId: "org-2" },
      fremd: true,
    });
    await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1", datei: pdf() }));
    expect(processUpload).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-2" }));
  });

  it("meldet eine von der Pipeline abgelehnte Datei als Fehler zurueck", async () => {
    processUpload.mockResolvedValue({ ok: false, fileName: "virus.pdf", reason: "Virenfund" });
    const res = await uploadPOST(anfrageUpload({ token: "bd_gueltig", caseId: "c1", datei: pdf("virus.pdf") }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { fehler: string };
    expect(body.fehler).toContain("Virenfund");
  });
});
