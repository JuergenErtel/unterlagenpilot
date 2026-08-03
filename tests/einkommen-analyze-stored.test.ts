import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { document: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const get = vi.fn();
const createSignedUrl = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, getStorage: () => ({ get, createSignedUrl }) };
});

const analyzeSelfEmployedDocs = vi.fn();
vi.mock("@/lib/ai/service", () => ({ AIService: class { analyzeSelfEmployedDocs = (...a: unknown[]) => analyzeSelfEmployedDocs(...a); } }));

import { analyzeStoredSelfEmployedDocs } from "@/lib/actions/einkommen";

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue({ ctx: { organizationId: "org-A", userId: "u1" } });
  findMany.mockReset();
  get.mockReset();
  createSignedUrl.mockReset().mockResolvedValue("https://signed/doc.pdf");
  analyzeSelfEmployedDocs.mockReset().mockResolvedValue({
    docs: [{ dokumenttyp: "bwa", jahr: 2024, kennzahlen: { gewinn: 96000, umsatz: 200000 }, notiz: "", konfidenz: 0.9 }],
  });
});

describe("analyzeStoredSelfEmployedDocs", () => {
  it("baut aus PDF-Dokumenten die Kennzahlen-Matrix", async () => {
    findMany.mockResolvedValue([
      {
        id: "doc-1",
        originalName: "bwa.pdf",
        mimeType: "application/pdf",
        storageKey: "organizations/org-A/cases/case-A/documents/x_bwa.pdf",
        scanStatus: "ready_for_ocr",
        case: { organizationId: "org-A" },
      },
    ]);
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-1"]);
    expect(res.error).toBeUndefined();
    expect(res.matrix?.rows.some((r) => r.kennzahl === "gewinn")).toBe(true);
    expect(createSignedUrl).toHaveBeenCalled();
  });

  it("liefert docLabels aller ausgewerteten Dokumente – auch ohne Notiz", async () => {
    findMany.mockResolvedValue([
      {
        id: "doc-1",
        originalName: "unterlagen.pdf",
        mimeType: "application/pdf",
        storageKey: "organizations/org-A/cases/case-A/documents/x_unterlagen.pdf",
        scanStatus: "ready_for_ocr",
        case: { organizationId: "org-A" },
      },
    ]);
    analyzeSelfEmployedDocs.mockResolvedValue({
      docs: [
        { dokumenttyp: "bwa", jahr: 2024, kennzahlen: { gewinn: 96000 }, notiz: "", konfidenz: 0.9 },
        { dokumenttyp: "jahresabschluss", jahr: 2023, kennzahlen: { gewinn: 91000 }, notiz: "vorläufig", konfidenz: 0.8 },
      ],
    });
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-1"]);
    expect(res.error).toBeUndefined();
    // Nur das Dokument mit Notiz landet in docNotes …
    expect(res.docNotes).toEqual([{ label: "Jahresabschluss 2023", notiz: "vorläufig" }]);
    // … aber ALLE ausgewerteten Dokumente in docLabels (für den Begleittext).
    expect(res.docLabels).toEqual(["BWA 2024", "Jahresabschluss 2023"]);
  });

  it("verweigert fremde Dokumente (Tenant-Isolation)", async () => {
    findMany.mockResolvedValue([]); // findMany filtert per organizationId -> nichts
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-x"]);
    expect(res.matrix).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it("überspringt Dokumente mit fehlgeschlagenem Virenscan (nicht an KI gesendet)", async () => {
    findMany.mockResolvedValue([
      {
        id: "doc-2",
        originalName: "infected.pdf",
        mimeType: "application/pdf",
        storageKey: "organizations/org-A/cases/case-A/documents/x_infected.pdf",
        scanStatus: "virus_scan_failed",
        case: { organizationId: "org-A" },
      },
    ]);
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-2"]);
    expect(res.matrix).toBeNull();
    expect(res.error).toBeTruthy();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(analyzeSelfEmployedDocs).not.toHaveBeenCalled();
  });
});
