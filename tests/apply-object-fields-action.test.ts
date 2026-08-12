import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ctx),
  requireCaseAccess: vi.fn(async () => ({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } })),
}));

const ctx = {
  organizationId: "org-A",
  organizationName: "Org A",
  userId: "user-1",
  userName: "Tester",
  role: "vermittler",
  isDemo: false,
};

const documentFindUnique = vi.fn();
const documentUpdate = vi.fn();
const extractedFindMany = vi.fn();
const applicantFindUnique = vi.fn();
const applicantFindMany = vi.fn();
const applicantUpdate = vi.fn();
const caseFindUnique = vi.fn();
const propertyUpsert = vi.fn();
const financingUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findUnique: (...a: unknown[]) => documentFindUnique(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    extractedFieldRecord: { findMany: (...a: unknown[]) => extractedFindMany(...a) },
    applicant: {
      findUnique: (...a: unknown[]) => applicantFindUnique(...a),
      findMany: (...a: unknown[]) => applicantFindMany(...a),
      update: (...a: unknown[]) => applicantUpdate(...a),
    },
    case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
    property: { upsert: (...a: unknown[]) => propertyUpsert(...a) },
    financingRequest: { upsert: (...a: unknown[]) => financingUpsert(...a) },
  },
}));

import { setDocumentReview } from "@/lib/actions/cases";

beforeEach(() => {
  [documentFindUnique, documentUpdate, extractedFindMany, applicantFindUnique, applicantFindMany, applicantUpdate, caseFindUnique, propertyUpsert, financingUpsert].forEach((m) => m.mockReset());
  documentFindUnique.mockResolvedValue({
    caseId: "case-A",
    applicantId: null,
    case: { organizationId: "org-A" },
  });
  // Zwei Antragsteller → keine sichere Zuordnung, Stammdaten-Übernahme bleibt aus.
  applicantFindMany.mockResolvedValue([{ id: "app-1" }, { id: "app-2" }]);
});

function mockDoc(documentType: string) {
  documentUpdate.mockResolvedValue({ caseId: "case-A", documentType });
}

const EXPOSE_FIELDS = [
  { key: "objektadresse", label: "Objektadresse", value: "Musterstraße 12, 76744 Wörth", correctedValue: null },
  { key: "kaufpreis", label: "Kaufpreis", value: "410.000 €", correctedValue: "420.000 €" },
  { key: "wohnflaeche", label: "Wohnfläche (m²)", value: "142", correctedValue: null },
];

describe("setDocumentReview – Objektdaten-Übernahme beim Akzeptieren", () => {
  it("übernimmt Exposé-Felder in Property und FinancingRequest (korrigierter Wert gewinnt)", async () => {
    mockDoc("expose");
    extractedFindMany.mockResolvedValue(EXPOSE_FIELDS);
    caseFindUnique.mockResolvedValue({ property: null, financingRequest: null });

    await setDocumentReview("doc-1", "akzeptiert");

    expect(propertyUpsert).toHaveBeenCalledTimes(1);
    const propArgs = propertyUpsert.mock.calls[0]![0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    expect(propArgs.where).toEqual({ caseId: "case-A" });
    expect(propArgs.update).toMatchObject({ street: "Musterstraße 12", zip: "76744", city: "Wörth", wohnflaeche: 142 });
    expect(propArgs.create).toMatchObject({ caseId: "case-A", wohnflaeche: 142 });

    expect(financingUpsert).toHaveBeenCalledTimes(1);
    const finArgs = financingUpsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(finArgs.update).toEqual({ kaufpreis: 420000 });
  });

  it("füllt nur leere Felder (vorhandene Objektdaten bleiben)", async () => {
    mockDoc("expose");
    extractedFindMany.mockResolvedValue(EXPOSE_FIELDS);
    caseFindUnique.mockResolvedValue({
      property: { street: "Bestandsweg 1", zip: "10115", city: "Berlin", wohnflaeche: null },
      financingRequest: { kaufpreis: 400000 },
    });

    await setDocumentReview("doc-1", "akzeptiert");

    const propArgs = propertyUpsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(propArgs.update).toEqual({ wohnflaeche: 142 });
    expect(financingUpsert).not.toHaveBeenCalled();
  });

  it("lädt jedes befüllbare Objektfeld zum Leer-Prüfen – sonst überschreibt es Vorhandenes", async () => {
    // Ein Feld, das die Aktion nicht selektiert, sieht in computeObjectUpdate
    // wie ein leeres aus. Dieser Fall hält den Prisma-Select und die Matcher
    // zusammen: alles hier ist gesetzt, also darf nichts geschrieben werden.
    mockDoc("expose");
    extractedFindMany.mockResolvedValue([
      { key: "nutzflaeche", label: "Nutzfläche", value: "195,1", correctedValue: null },
      { key: "objektzustand", label: "Objektzustand", value: "Gepflegt", correctedValue: null },
      { key: "anzahl_garage_stellplatz", label: "Anzahl Garage/Stellplatz", value: "3", correctedValue: null },
      { key: "wohneinheiten", label: "Anzahl Wohneinheiten", value: "4", correctedValue: null },
      { key: "hausgeld", label: "Hausgeld", value: "320 €", correctedValue: null },
      { key: "mieteinnahmen", label: "Mieteinnahmen monatlich", value: "1.450 €", correctedValue: null },
    ]);
    caseFindUnique.mockResolvedValue({
      property: {
        nutzflaeche: 80,
        zustand: "renovierungsbedürftig",
        stellplaetze: 1,
        anzahlWohneinheiten: 2,
        hausgeldMonatlich: 250,
        mieteinnahmenMonatlich: 900,
      },
      financingRequest: null,
    });

    await setDocumentReview("doc-1", "akzeptiert");

    expect(propertyUpsert).not.toHaveBeenCalled();
  });

  it("lässt Nicht-Objekt-Dokumente aus (Gehaltsabrechnung schreibt nie Objektdaten)", async () => {
    mockDoc("gehaltsabrechnung");
    extractedFindMany.mockResolvedValue(EXPOSE_FIELDS);

    await setDocumentReview("doc-1", "akzeptiert");

    expect(propertyUpsert).not.toHaveBeenCalled();
    expect(financingUpsert).not.toHaveBeenCalled();
  });

  it("übernimmt nichts beim Ablehnen", async () => {
    mockDoc("expose");

    await setDocumentReview("doc-1", "abgelehnt");

    expect(extractedFindMany).not.toHaveBeenCalled();
    expect(propertyUpsert).not.toHaveBeenCalled();
    expect(financingUpsert).not.toHaveBeenCalled();
  });

  it("blockiert die Freigabe nicht, wenn die Objekt-Übernahme fehlschlägt (best effort)", async () => {
    mockDoc("expose");
    extractedFindMany.mockResolvedValue(EXPOSE_FIELDS);
    caseFindUnique.mockResolvedValue({ property: null, financingRequest: null });
    propertyUpsert.mockRejectedValue(new Error("DB weg"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(setDocumentReview("doc-1", "akzeptiert")).resolves.toBeUndefined();

    errSpy.mockRestore();
  });
});
