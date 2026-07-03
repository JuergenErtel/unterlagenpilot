import { describe, it, expect, vi, beforeEach } from "vitest";
import { unzipSync } from "fflate";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({ getCurrentContext: vi.fn(async () => ctx) }));

const caseFindUnique = vi.fn();
const documentFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
  },
}));

const storageGet = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ get: (k: string) => storageGet(k) }) }));

import { GET } from "@/app/api/cases/[id]/zip/route";

function req() {
  return new Request("http://localhost/api/cases/case-A/zip") as never;
}
const params = Promise.resolve({ id: "case-A" });

beforeEach(() => {
  [caseFindUnique, documentFindMany, storageGet].forEach((m) => m.mockReset());
  caseFindUnique.mockResolvedValue({ organizationId: "org-A", caseNumber: "UP-2026-0001" });
});

describe("ZIP-Export-Route", () => {
  it("erzeugt ein gültiges ZIP mit den umbenannten Dateien", async () => {
    documentFindMany.mockResolvedValue([
      { generatedName: "Gehaltsabrechnung_Max_2026-05.pdf", originalName: "a.pdf", storageKey: "k1", scanStatus: "ready_for_ocr", reviewStatus: "akzeptiert" },
      { generatedName: null, originalName: "IMG_1234.jpg", storageKey: "k2", scanStatus: "ready_for_ocr", reviewStatus: "offen" },
    ]);
    storageGet.mockImplementation(async (k: string) => Buffer.from(`inhalt-${k}`));

    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("Fall_UP-2026-0001_Unterlagen.zip");

    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    expect(Object.keys(files).sort()).toEqual(["Gehaltsabrechnung_Max_2026-05.pdf", "IMG_1234.jpg"]);
    expect(new TextDecoder().decode(files["IMG_1234.jpg"]!)).toBe("inhalt-k2");
  });

  it("überspringt Dateien, deren Bytes fehlen, packt aber den Rest", async () => {
    documentFindMany.mockResolvedValue([
      { generatedName: "Da.pdf", originalName: "a.pdf", storageKey: "vorhanden", scanStatus: "ready_for_ocr", reviewStatus: "akzeptiert" },
      { generatedName: "Weg.pdf", originalName: "b.pdf", storageKey: "fehlt", scanStatus: "ready_for_ocr", reviewStatus: "akzeptiert" },
    ]);
    storageGet.mockImplementation(async (k: string) => (k === "vorhanden" ? Buffer.from("x") : null));

    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["Da.pdf"]);
  });

  it("404 für fremde Organisation (Tenant-Isolation)", async () => {
    caseFindUnique.mockResolvedValue({ organizationId: "org-B", caseNumber: "UP-2026-0009" });
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it("404, wenn es keine exportierbaren Dokumente gibt", async () => {
    documentFindMany.mockResolvedValue([
      { generatedName: "x.pdf", originalName: "x.pdf", storageKey: "k", scanStatus: "rejected", reviewStatus: "offen" },
    ]);
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });
});
