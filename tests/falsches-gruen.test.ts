import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildChecklistForCase } from "@/lib/checklists/engine";

/**
 * Regressionsschutz fuer den Topcic-Fund (18.08.2026): `Ausweis_Mate.pdf` war
 * als **Grundbuchauszug** gefuehrt – Konfidenz 0,98, vom Vermittler
 * freigegeben – und die Checkliste meldete "Grundbuchauszug vorhanden",
 * obwohl im Fall keiner lag.
 *
 * Die Wurzel: Die OCR hatte fuer diese Datei nichts als Bildplatzhalter
 * geliefert. Das Klassifikationsschema verlangt einen Typ, also hat das Modell
 * einen erfunden. Drei Stellen muessen zusammen halten, damit daraus kein
 * falsches Gruen mehr wird – jede einzeln ist eine Luecke.
 */

// ---------------------------------------------------------------------------
// 1. Die Checkliste selbst
// ---------------------------------------------------------------------------

describe("Falsches Gruen: die Checkliste", () => {
  it("zaehlt ein nicht lesbares Dokument nicht als vorhanden – auch freigegeben nicht", () => {
    const liste = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf", propertyType: "einfamilienhaus" },
      [{ documentType: "grundbuchauszug", reviewStatus: "akzeptiert", readable: false }]
    );
    const grundbuch = liste.find((i) => i.documentType === "grundbuchauszug");
    expect(grundbuch).toBeDefined();
    expect(grundbuch!.status).not.toBe("vorhanden");
  });

  it("zaehlt dasselbe Dokument, sobald es lesbar ist", () => {
    const liste = buildChecklistForCase(
      { employmentType: "angestellter", financingType: "kauf", propertyType: "einfamilienhaus" },
      [{ documentType: "grundbuchauszug", reviewStatus: "akzeptiert", readable: true }]
    );
    expect(liste.find((i) => i.documentType === "grundbuchauszug")!.status).toBe("vorhanden");
  });
});

// ---------------------------------------------------------------------------
// 2. Der KI-Prueflauf und die Freigabe
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

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ctx),
  requireCaseAccess: vi.fn(async () => ({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } })),
}));
vi.mock("@/lib/auth/akte-zugriff", () => ({
  requireDocumentAccess: vi.fn(async (id: string) => {
    const d = await documentFindUnique({ where: { id } });
    if (!d || d.case?.organizationId !== "org-A") throw new Error("NEXT_NOT_FOUND");
    return { ctx, dokument: { id, caseId: d.caseId, organizationId: "org-A", akteArt: "vertrieb", caseStatus: d.case?.status ?? "neu" } };
  }),
}));
vi.mock("@/lib/cases/service", () => ({
  getCaseAggregate: vi.fn(async () => ({ missing: [], readiness: { score: 80 } })),
}));

// `vi.hoisted`, weil vi.mock-Fabriken vor den Modul-Konstanten laufen: Ein
// direkt hier deklarierter Spy waere zum Zeitpunkt des Mocks noch nicht da.
const { classifySpy } = vi.hoisted(() => ({ classifySpy: vi.fn() }));
vi.mock("@/lib/ai/service", () => ({
  AIService: class {
    async classifyDocument(...a: unknown[]) {
      return classifySpy(...a);
    }
    async extractFields() {
      return { fields: [], warnings: [] };
    }
  },
}));

const caseFindUniqueOrThrow = vi.fn();
const caseUpdate = vi.fn();
const documentFindMany = vi.fn();
const documentFindUnique = vi.fn();
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
      findUnique: (...a: unknown[]) => documentFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => documentFindUnique(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
      updateMany: (...a: unknown[]) => documentUpdateMany(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

import { runAiCheck, setDocumentReview } from "@/lib/actions/cases";

/** Genau der OCR-Ertrag von Ausweis_Mate.pdf aus der Produktionsdatenbank. */
const NUR_BILDER = "![img-0.jpeg](img-0.jpeg)\n\n![img-1.jpeg](img-1.jpeg)\n\n![img-2.jpeg](img-2.jpeg)";

beforeEach(() => {
  [
    caseFindUniqueOrThrow,
    caseUpdate,
    documentFindMany,
    documentFindUnique,
    documentUpdate,
    documentUpdateMany,
    applicantFindMany,
    classifySpy,
  ].forEach((m) => m.mockReset());
  afterCallbacks.length = 0;
  caseFindUniqueOrThrow.mockResolvedValue({ status: "unterlagen_fehlen", updatedAt: new Date() });
  caseUpdate.mockResolvedValue({});
  documentUpdate.mockResolvedValue({ caseId: "case-A", documentType: null });
  documentUpdateMany.mockResolvedValue({});
  applicantFindMany.mockResolvedValue([]);
  classifySpy.mockResolvedValue({
    documentType: "grundbuchauszug",
    confidence: 0.98,
    detectedApplicant: null,
  });
});

describe("Falsches Gruen: der KI-Prueflauf", () => {
  it("stuft eine Datei ohne Textgrundlage gar nicht erst ein", async () => {
    documentFindMany.mockResolvedValue([
      { id: "d1", applicantId: null, applicantSource: null, documentType: null, pages: [{ ocrText: NUR_BILDER }], extractedFields: [] },
    ]);
    await runAiCheck("case-A");
    await afterCallbacks[0]!();

    expect(classifySpy).not.toHaveBeenCalled();
    const daten = documentUpdate.mock.calls[0]![0].data;
    expect(daten.readable).toBe(false);
    // Kein erfundener Typ – und ein von Hand gesetzter bliebe unangetastet.
    expect(daten.documentType).toBeUndefined();
  });

  it("stuft ein Dokument mit Text weiterhin ein", async () => {
    documentFindMany.mockResolvedValue([
      {
        id: "d2",
        applicantId: null,
        applicantSource: null,
        documentType: null,
        pages: [{ ocrText: "Grundbuch von Woerth Blatt 1234 Abteilung II Lasten und Beschraenkungen" }],
        extractedFields: [],
      },
    ]);
    await runAiCheck("case-A");
    await afterCallbacks[0]!();

    expect(classifySpy).toHaveBeenCalledTimes(1);
    expect(documentUpdate.mock.calls[0]![0].data.readable).toBe(true);
  });
});

describe("Falsches Gruen: die Freigabe", () => {
  it("gibt ein nicht lesbares Dokument nicht frei", async () => {
    documentFindUnique.mockResolvedValue({
      caseId: "case-A",
      applicantId: null,
      readable: false,
      case: { organizationId: "org-A" },
    });
    await setDocumentReview("d1", "akzeptiert");
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("laesst das Ablehnen zu – es ist der Ausweg", async () => {
    documentFindUnique.mockResolvedValue({
      caseId: "case-A",
      applicantId: null,
      readable: false,
      case: { organizationId: "org-A" },
    });
    await setDocumentReview("d1", "abgelehnt", "Unlesbarer Scan");
    expect(documentUpdate).toHaveBeenCalledTimes(1);
  });
});
