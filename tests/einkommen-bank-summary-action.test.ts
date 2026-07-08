// tests/einkommen-bank-summary-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const applicantFindFirst = vi.fn();
const selfEmpFindFirst = vi.fn();
const selfEmpUpdate = vi.fn();
const selfEmpCreate = vi.fn();
const caseFindUniqueOrThrow = vi.fn();
const docCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: { findFirst: (...a: unknown[]) => applicantFindFirst(...a) },
    selfEmploymentRecord: {
      findFirst: (...a: unknown[]) => selfEmpFindFirst(...a),
      update: (...a: unknown[]) => selfEmpUpdate(...a),
      create: (...a: unknown[]) => selfEmpCreate(...a),
    },
    case: { findUniqueOrThrow: (...a: unknown[]) => caseFindUniqueOrThrow(...a) },
    document: { create: (...a: unknown[]) => docCreate(...a) },
  },
}));

const put = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, getStorage: () => ({ put }) };
});
const renderEinkommensanalyse = vi.fn();
vi.mock("@/lib/pdf/renderer", () => ({ renderEinkommensanalyse: (...a: unknown[]) => renderEinkommensanalyse(...a) }));
vi.mock("@/lib/pdf/case-pdf", () => ({ getBrokerInfo: vi.fn(async () => ({ name: "Makler" })), pdfFileName: () => "Bankzusammenfassung.pdf" }));

import { createSelfEmployedBankSummaryAction } from "@/lib/actions/einkommen";

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue({ ctx: { organizationId: "org-A", userId: "u1" } });
  applicantFindFirst.mockReset().mockResolvedValue({ id: "app-1", vorname: "Angelina", nachname: "Sadykow" });
  selfEmpFindFirst.mockReset().mockResolvedValue(null);
  selfEmpUpdate.mockReset().mockResolvedValue({});
  selfEmpCreate.mockReset().mockResolvedValue({});
  caseFindUniqueOrThrow.mockReset().mockResolvedValue({ caseNumber: "2026-0007", applicants: [{ id: "app-1", vorname: "Angelina", nachname: "Sadykow", position: 1 }] });
  renderEinkommensanalyse.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 test"));
  put.mockReset().mockResolvedValue({ storageKey: "organizations/org-A/cases/case-A/documents/x_Bankzusammenfassung.pdf" });
  docCreate.mockReset().mockResolvedValue({ id: "pdfdoc-1" });
});

const input = {
  applicantPosition: 1,
  selfEmployment: { firma: "Sadykow Consulting", rechtsform: "Einzelunternehmen", gruendungsjahr: 2019 },
  jahre: [2023, 2024],
  rows: [{ kennzahl: "gewinn", label: "Gewinn / Jahresüberschuss", cells: { 2023: 91000, 2024: 96000 }, trend: "steigend" }],
  docNotes: [{ label: "BWA 2024", notiz: "" }],
  einkommensansatzJahr: 88000,
};

describe("createSelfEmployedBankSummaryAction", () => {
  it("speichert Stammdaten, rendert PDF mit Begleittext und legt Dokument ab", async () => {
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.documentId).toBe("pdfdoc-1");
    expect(selfEmpFindFirst).toHaveBeenCalled();
    expect(selfEmpCreate).toHaveBeenCalled();
    expect(selfEmpUpdate).not.toHaveBeenCalled();

    // Exact payload assertion for create
    expect(selfEmpCreate).toHaveBeenCalledWith({
      data: {
        applicantId: "app-1",
        firma: "Sadykow Consulting",
        rechtsform: "Einzelunternehmen",
        gruendungsdatum: new Date(Date.UTC(2019, 0, 1, 12))
      }
    });

    // Begleittext with firma + gewinn amount
    const renderArg = renderEinkommensanalyse.mock.calls[0]![0] as { begleittext?: { paragraphs: string[] } };
    expect(renderArg.begleittext).toBeTruthy();
    const begleitext = renderArg.begleittext!.paragraphs.join("\n");
    expect(begleitext).toContain("Sadykow Consulting");
    expect(begleitext).toMatch(/91\.?000|2023/);
  });

  it("aktualisiert vorhandene Stammdaten statt neu anzulegen", async () => {
    selfEmpFindFirst.mockResolvedValue({ id: "ser-1" });
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.documentId).toBe("pdfdoc-1");
    expect(selfEmpUpdate).toHaveBeenCalled();
    expect(selfEmpCreate).not.toHaveBeenCalled();

    // Exact payload assertion for update
    expect(selfEmpUpdate).toHaveBeenCalledWith({
      where: { id: "ser-1" },
      data: {
        firma: "Sadykow Consulting",
        rechtsform: "Einzelunternehmen",
        gruendungsdatum: new Date(Date.UTC(2019, 0, 1, 12))
      }
    });
  });

  it("liefert Fehler, wenn der gewählte Antragsteller fehlt", async () => {
    applicantFindFirst.mockResolvedValue(null);
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.error).toBeTruthy();
  });
});
