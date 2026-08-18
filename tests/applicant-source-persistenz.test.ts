import { describe, it, expect, vi, beforeEach } from "vitest";

// Der Hintergrundlauf soll im Test sofort ausgeführt werden.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
// Der Detektiv laeuft am Ende der Pipeline und braucht Modelle, die diese
// Prisma-Attrappe nicht kennt. Hier geht es um die Antragsteller-Zuordnung –
// der Detektiv wird stillgelegt, statt einen gefangenen Fehler ins Testprotokoll
// zu schreiben. Dass ein Detektiv-Ausfall die Analyse nicht kippt, prueft
// tests/pipeline.test.ts.
vi.mock("@/lib/detektiv/service", () => ({
  runReferenceExtraction: vi.fn(async () => undefined),
  reconcileCase: vi.fn(async () => ({ angelegt: 0, erledigt: 0 })),
}));

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
    // Echter Abrechnungstext: Ohne Textgrundlage stuft die Kette seit dem
    // 18.08.2026 nicht mehr ein (siehe textsubstanz.ts), und der Test pruefte
    // dann nicht mehr die Zuordnung, sondern nur noch die neue Sperre.
    extractText: async () => ({
      fullText:
        "Entgeltabrechnung Mai 2026 Arbeitnehmer Thomas Colell Steuerklasse 1 Bruttobezuege 4.200,00 EUR Nettoverdienst 2.610,45 EUR Sozialversicherung",
      pageCount: 1,
      pages: [],
    }),
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

/**
 * Der Abschluss der Hintergrund-Analyse. Bewusst NICHT einfach der letzte
 * update()-Aufruf: danach laeuft noch der Unterlagen-Detektiv und setzt
 * `referenceStatus`. Gesucht ist der Aufruf, der die Analyse festschreibt –
 * erkennbar an `extractionStatus`.
 */
function lastUpdateData(): Record<string, unknown> {
  const call = documentUpdate.mock.calls
    .map((c) => c[0] as { data: Record<string, unknown> })
    .reverse()
    .find((c) => c.data && "extractionStatus" in c.data);
  return call?.data ?? {};
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

  it("ordnet den erkannten Antragsteller automatisch zu und markiert die Herkunft", async () => {
    await upload();
    await vi.waitFor(() => {
      expect(lastUpdateData().applicantId).toBe("a2");
      expect(lastUpdateData().applicantSource).toBe("auto");
    });
  });
});
