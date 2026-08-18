import { describe, it, expect, vi, beforeEach } from "vitest";
import { planRematch, type RematchDocument } from "@/lib/documents/applicant-match";

/**
 * Der KI-Prüflauf wendet dieselbe Regel an wie das nachträgliche Umhängen:
 * angefasst wird nur, was unzugeordnet oder automatisch zugeordnet ist.
 * Diese Tests halten die Regel an der Nahtstelle des Prüflaufs fest.
 */
const paar = [
  { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
  { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
];

function doc(over: Partial<RematchDocument>): RematchDocument {
  return { id: "d1", applicantId: null, applicantSource: null, detectedApplicant: null, ...over };
}

describe("KI-Prüflauf: Zuordnungsregel", () => {
  it("ordnet ein frisch erkanntes, unzugeordnetes Dokument zu", () => {
    expect(planRematch([doc({ detectedApplicant: "Thomas Colell" })], paar)).toEqual([
      { documentId: "d1", applicantId: "a2" },
    ]);
  });

  it("überschreibt die Handkorrektur des Vermittlers nicht", () => {
    expect(
      planRematch(
        [doc({ applicantId: "a1", applicantSource: "manuell", detectedApplicant: "Thomas Colell" })],
        paar
      )
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ab hier: die Naht selbst. Die Tests oben würden auch dann grün bleiben, wenn
// der Prüflauf planRematch gar nicht aufriefe – deshalb läuft hier der echte
// Hintergrundlauf gegen gemockte DB und KI.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterCallbacks: Array<() => void | Promise<void>> = [];
vi.mock("next/server", () => ({
  after: vi.fn((cb: () => void | Promise<void>) => {
    afterCallbacks.push(cb);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ctx),
  requireCaseAccess: vi.fn(async () => ({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } })),
}));
vi.mock("@/lib/cases/service", () => ({
  getCaseAggregate: vi.fn(async () => ({ missing: [], readiness: { score: 80 } })),
}));

const ctx = { organizationId: "org-A", userId: "user-1" };

// Die KI erkennt auf jedem Dokument Thomas – wen der Prüflauf daraus macht,
// entscheidet allein die Zuordnungsregel.
vi.mock("@/lib/ai/service", () => ({
  AIService: class {
    async classifyDocument() {
      return { documentType: "personalausweis", confidence: 0.9, detectedApplicant: "Thomas Colell" };
    }
    async extractFields() {
      return { fields: [], warnings: [] };
    }
  },
}));

const caseFindUniqueOrThrow = vi.fn();
const caseUpdate = vi.fn();
const documentFindMany = vi.fn();
const documentUpdate = vi.fn();
const documentUpdateMany = vi.fn();
const applicantFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUniqueOrThrow: (...a: unknown[]) => caseFindUniqueOrThrow(...a),
      update: (...a: unknown[]) => caseUpdate(...a),
    },
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
      updateMany: (...a: unknown[]) => documentUpdateMany(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

import { runAiCheck } from "@/lib/actions/cases";

const gespeichertesDoc = {
  id: "d1",
  applicantId: null as string | null,
  applicantSource: null as string | null,
  documentType: "personalausweis",
  // Echter Ausweistext, kein Stichwort: Seit dem 18.08.2026 stuft der
  // Prueflauf Dokumente ohne Textgrundlage gar nicht mehr ein (siehe
  // textsubstanz.ts). Ein Zwei-Wort-Fixture liefe an dieser Regel auf und
  // pruefte die Zuordnung dann gar nicht mehr.
  pages: [
    {
      ocrText:
        "BUNDESREPUBLIK DEUTSCHLAND PERSONALAUSWEIS IDENTITY CARD Name Colell Vorname Thomas Geburtsdatum 12.03.1981 Staatsangehoerigkeit DEUTSCH",
    },
  ],
  extractedFields: [],
};

/** Führt den kompletten Prüflauf inkl. Hintergrundarbeit aus. */
async function pruefungLaufenLassen(): Promise<{ applicantId?: string; applicantSource?: string }> {
  await runAiCheck("case-A");
  await afterCallbacks[0]!();
  const call = documentUpdate.mock.calls[0]![0] as {
    data: { applicantId?: string; applicantSource?: string };
  };
  return call.data;
}

beforeEach(() => {
  [caseFindUniqueOrThrow, caseUpdate, documentFindMany, documentUpdate, documentUpdateMany, applicantFindMany].forEach(
    (m) => m.mockReset()
  );
  afterCallbacks.length = 0;
  caseFindUniqueOrThrow.mockResolvedValue({ status: "unterlagen_fehlen", updatedAt: new Date() });
  caseUpdate.mockResolvedValue({});
  documentUpdate.mockResolvedValue({});
  documentUpdateMany.mockResolvedValue({});
  applicantFindMany.mockResolvedValue(paar);
});

describe("KI-Prüflauf: Naht zur Zuordnung", () => {
  it("schreibt die erkannte Person mitsamt Herkunft 'auto' ins Dokument", async () => {
    documentFindMany.mockResolvedValue([{ ...gespeichertesDoc }]);
    const data = await pruefungLaufenLassen();
    expect(data.applicantId).toBe("a2");
    expect(data.applicantSource).toBe("auto");
  });

  it("rührt eine von Hand zugeordnete Person nicht an", async () => {
    documentFindMany.mockResolvedValue([
      { ...gespeichertesDoc, applicantId: "a1", applicantSource: "manuell" },
    ]);
    const data = await pruefungLaufenLassen();
    expect(data.applicantId).toBeUndefined();
    expect(data.applicantSource).toBeUndefined();
  });
});
