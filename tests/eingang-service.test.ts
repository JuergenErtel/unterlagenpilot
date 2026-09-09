import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Der Posteingang haelt Dateien, die noch keiner Akte gehoeren – der einzige
 * Ort im System ohne Fall, an dem Kundenunterlagen liegen. Geprueft wird
 * deshalb: nichts Ungeprueftes kommt herein, nichts Fremdes kommt heraus.
 */

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const validateUpload = vi.fn();
vi.mock("@/lib/security/file-validation", () => ({
  validateUpload: (...a: unknown[]) => validateUpload(...a),
}));

const scan = vi.fn();
vi.mock("@/lib/security/virus-scan", () => ({
  getVirusScanner: () => ({ scan: (...a: unknown[]) => scan(...a) }),
}));

vi.mock("@/lib/documents/heic", () => ({
  normalizeUploadFile: async (file: unknown) => ({ file, converted: false }),
}));

const put = vi.fn();
const get = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/storage", async (original) => {
  const echt = await original<typeof import("@/lib/storage")>();
  return {
    ...echt,
    getStorage: () => ({ put, get, remove }),
  };
});

const processUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({
  processUpload: (...a: unknown[]) => processUpload(...a),
}));

const create = vi.fn();
const findFirst = vi.fn();
const del = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    eingangsdatei: {
      create: (...a: unknown[]) => create(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      delete: (...a: unknown[]) => del(...a),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { nimmDateiAn, ordneEingangZu, verwirfEingang } from "@/lib/eingang/service";
import { eingangPathPrefix } from "@/lib/storage";

const ORG = "org-1";
const SCHLUESSEL = `${eingangPathPrefix(ORG)}abc_gehalt.pdf`;

function datei(name = "gehalt.pdf") {
  return { name, type: "application/pdf", size: 4, buffer: Buffer.from("%PDF") };
}

function zeile(ueberschreibungen: Record<string, unknown> = {}) {
  return {
    id: "e1",
    storageKey: SCHLUESSEL,
    originalName: "gehalt.pdf",
    mimeType: "application/pdf",
    organizationId: ORG,
    ...ueberschreibungen,
  };
}

beforeEach(() => {
  validateUpload.mockReset();
  scan.mockReset();
  put.mockReset();
  get.mockReset();
  remove.mockReset();
  processUpload.mockReset();
  create.mockReset();
  findFirst.mockReset();
  del.mockReset();

  validateUpload.mockReturnValue({ ok: true, mimeType: "application/pdf" });
  scan.mockResolvedValue({ verdict: "clean" });
  put.mockResolvedValue({ storageKey: SCHLUESSEL, sizeBytes: 4, mimeType: "application/pdf" });
  create.mockResolvedValue({ id: "e1" });
  get.mockResolvedValue(Buffer.from("%PDF"));
  remove.mockResolvedValue(undefined);
  del.mockResolvedValue({ id: "e1" });
  processUpload.mockResolvedValue({ ok: true, fileName: "gehalt.pdf", documentId: "d1" });
});

describe("Posteingang – Annahme", () => {
  it("legt eine geprüfte Datei ab und merkt sie sich", async () => {
    const r = await nimmDateiAn({ organizationId: ORG, userId: "u1", file: datei() });
    expect(r.ok).toBe(true);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG }));
    expect(create).toHaveBeenCalled();
  });

  it("legt im Posteingang-Pfad der Organisation ab, nicht in einer Akte", async () => {
    await nimmDateiAn({ organizationId: ORG, userId: "u1", file: datei() });
    const args = put.mock.calls[0]?.[0] as { caseId: string };
    expect(args.caseId).toBe("_eingang");
    expect(eingangPathPrefix(ORG)).toContain(ORG);
  });

  it("speichert NICHTS, wenn die Prüfung die Datei ablehnt", async () => {
    validateUpload.mockReturnValue({ ok: false, error: "Dateityp nicht erlaubt." });
    const r = await nimmDateiAn({ organizationId: ORG, userId: "u1", file: datei("boese.exe") });
    expect(r.ok).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("speichert NICHTS bei einem Virenfund", async () => {
    // Anders als beim Upload in eine Akte gibt es hier keine Quarantaenezeile,
    // die einen Fund festhalten koennte – also gar nicht erst ablegen.
    scan.mockResolvedValue({ verdict: "infected" });
    const r = await nimmDateiAn({ organizationId: ORG, userId: "u1", file: datei() });
    expect(r.ok).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("speichert NICHTS, wenn der Scan gar nicht durchlief", async () => {
    scan.mockResolvedValue({ verdict: "error" });
    const r = await nimmDateiAn({ organizationId: ORG, userId: "u1", file: datei() });
    expect(r.ok).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("Posteingang – Zuordnen", () => {
  const auftrag = {
    eingangId: "e1",
    caseId: "c1",
    caseOrganizationId: ORG,
    organizationId: ORG,
    actorUserId: "u1",
  };

  it("gibt die Datei an die normale Upload-Pipeline und raeumt auf", async () => {
    findFirst.mockResolvedValue(zeile());
    const r = await ordneEingangZu(auftrag);
    expect(r.ok).toBe(true);
    expect(processUpload).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "c1", organizationId: ORG, uploadSource: "vermittler" })
    );
    expect(del).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(SCHLUESSEL);
  });

  it("sucht die Zeile nur innerhalb der eigenen Organisation", async () => {
    findFirst.mockResolvedValue(null);
    const r = await ordneEingangZu({ ...auftrag, organizationId: "org-fremd" });
    expect(r.ok).toBe(false);
    const args = findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ id: "e1", organizationId: "org-fremd" });
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("weist einen Speicherpfad ausserhalb des eigenen Posteingangs ab", async () => {
    // Zweiter Riegel: Selbst wenn eine Zeile mit fremdem Pfad in der Datenbank
    // staende, darf sie nichts oeffnen.
    findFirst.mockResolvedValue(zeile({ storageKey: "organizations/org-2/cases/c9/documents/x.pdf" }));
    const r = await ordneEingangZu(auftrag);
    expect(r.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("laesst die Datei liegen, wenn die Pipeline sie ablehnt", async () => {
    // Sonst waere sie weg, ohne je in einer Akte angekommen zu sein.
    findFirst.mockResolvedValue(zeile());
    processUpload.mockResolvedValue({ ok: false, fileName: "gehalt.pdf", reason: "Virenfund" });
    const r = await ordneEingangZu(auftrag);
    expect(r.ok).toBe(false);
    expect(r.grund).toContain("Virenfund");
    expect(del).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("raeumt eine Karteileiche weg, deren Datei verschwunden ist", async () => {
    findFirst.mockResolvedValue(zeile());
    get.mockResolvedValue(null);
    const r = await ordneEingangZu(auftrag);
    expect(r.ok).toBe(false);
    expect(del).toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("speichert in die Organisation DER AKTE", async () => {
    findFirst.mockResolvedValue(zeile());
    await ordneEingangZu({ ...auftrag, caseOrganizationId: "org-2" });
    expect(processUpload).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-2" }));
  });
});

describe("Posteingang – Wegwerfen", () => {
  it("loescht Zeile und Datei", async () => {
    findFirst.mockResolvedValue(zeile());
    const r = await verwirfEingang({ eingangId: "e1", organizationId: ORG, actorUserId: "u1" });
    expect(r.ok).toBe(true);
    expect(del).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(SCHLUESSEL);
  });

  it("wirft nichts weg, was einer anderen Organisation gehoert", async () => {
    findFirst.mockResolvedValue(null);
    const r = await verwirfEingang({ eingangId: "e1", organizationId: "org-fremd", actorUserId: "u1" });
    expect(r.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
