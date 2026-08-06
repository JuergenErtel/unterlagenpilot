import { describe, it, expect, vi, beforeEach } from "vitest";

// Der Hintergrundlauf soll im Test sofort ausgeführt werden.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const documentCreate = vi.fn();
const documentUpdate = vi.fn();
const applicantFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      create: (...a: unknown[]) => documentCreate(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    put: vi.fn(async () => ({ storageKey: "k", mimeType: "application/pdf", sizeBytes: 10 })),
    remove: vi.fn(),
  }),
  isStorageKeyForCase: () => true,
}));
vi.mock("@/lib/security/virus-scan", () => ({
  getVirusScanner: () => ({ name: "mock", scan: async () => ({ verdict: "clean", engine: "mock", demo: true }) }),
}));
vi.mock("@/lib/security/file-validation", () => ({
  validateUpload: () => ({ ok: true, mimeType: "application/pdf" }),
}));
vi.mock("@/lib/documents/heic", () => ({
  normalizeUploadFile: async (f: unknown) => ({ file: f }),
}));
vi.mock("@/lib/ai", () => ({
  getOCRProvider: () => ({
    extractText: async () => ({ fullText: "Gehaltsabrechnung Thomas Colell", pageCount: 1, pages: [] }),
  }),
}));
vi.mock("@/lib/ai/service", () => ({
  AIService: class {
    async classifyDocument() {
      return { documentType: "gehaltsabrechnung", confidence: 0.9, detectedApplicant: "Thomas Colell" };
    }
    async extractFields() {
      return { fields: [], warnings: [] };
    }
  },
}));

import { processUpload } from "@/lib/documents/pipeline";

beforeEach(() => {
  [documentCreate, documentUpdate, applicantFindMany].forEach((m) => m.mockReset());
  documentCreate.mockResolvedValue({ id: "doc-1" });
  documentUpdate.mockResolvedValue({});
  applicantFindMany.mockResolvedValue([
    { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
    { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
  ]);
});

function upload() {
  return processUpload({
    organizationId: "org-1",
    caseId: "case-1",
    file: { name: "scan.pdf", type: "application/pdf", size: 10, buffer: Buffer.from("x") },
    uploadSource: "kunde",
  });
}

/** Letzter update()-Aufruf – das ist der Abschluss der Hintergrund-Analyse. */
function lastUpdateData(): Record<string, unknown> {
  const call = documentUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
  return call.data;
}

describe("Persistenz des erkannten Antragstellers", () => {
  it("schreibt den von der KI erkannten Namen auf das Dokument", async () => {
    await upload();
    // Die OCR/KI-Analyse läuft über after() im Hintergrund weiter (siehe
    // pipeline.ts) und wird von processUpload() bewusst nicht abgewartet –
    // genau das verhindert, dass der Upload-Request blockiert. Der Mock von
    // "next/server" ruft den Callback zwar sofort auf, wartet aber ebenfalls
    // nicht auf dessen Promise-Kette. Deshalb hier auf den finalen
    // update()-Aufruf warten statt ihn synchron zu erwarten.
    await vi.waitFor(() => {
      expect(lastUpdateData().detectedApplicant).toBe("Thomas Colell");
    });
  });
});
