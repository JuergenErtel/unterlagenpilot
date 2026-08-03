// tests/einkommen-bank-summary-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const applicantFindFirst = vi.fn();
const selfEmpUpsert = vi.fn();
const caseFindUniqueOrThrow = vi.fn();
const docCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: { findFirst: (...a: unknown[]) => applicantFindFirst(...a) },
    selfEmploymentRecord: {
      upsert: (...a: unknown[]) => selfEmpUpsert(...a),
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
  selfEmpUpsert.mockReset().mockResolvedValue({});
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

    // Upsert statt findFirst+create/update: race-sicher über den Unique-Key applicantId.
    expect(selfEmpUpsert).toHaveBeenCalledWith({
      where: { applicantId: "app-1" },
      update: {
        firma: "Sadykow Consulting",
        rechtsform: "Einzelunternehmen",
        gruendungsdatum: new Date(Date.UTC(2019, 0, 1, 12)),
      },
      create: {
        applicantId: "app-1",
        firma: "Sadykow Consulting",
        rechtsform: "Einzelunternehmen",
        gruendungsdatum: new Date(Date.UTC(2019, 0, 1, 12)),
      },
    });

    // Begleittext with firma + gewinn amount
    const renderArg = renderEinkommensanalyse.mock.calls[0]![0] as { begleittext?: { paragraphs: string[] } };
    expect(renderArg.begleittext).toBeTruthy();
    const begleitext = renderArg.begleittext!.paragraphs.join("\n");
    expect(begleitext).toContain("Sadykow Consulting");
    expect(begleitext).toMatch(/91\.?000|2023/);
  });

  it("nutzt für den Begleittext alle ausgewerteten Unterlagen, nicht nur die mit Notiz", async () => {
    const res = await createSelfEmployedBankSummaryAction("case-A", {
      ...input,
      docNotes: [{ label: "BWA 2024", notiz: "vorläufig" }],
      documents: [{ label: "BWA 2024" }, { label: "Jahresabschluss 2023" }],
    } as never);
    expect(res.documentId).toBe("pdfdoc-1");
    const renderArg = renderEinkommensanalyse.mock.calls[0]![0] as { begleittext?: { paragraphs: string[] } };
    const begleitext = renderArg.begleittext!.paragraphs.join("\n");
    expect(begleitext).toContain("BWA 2024");
    expect(begleitext).toContain("Jahresabschluss 2023");
  });

  it("fällt ohne documents-Feld auf die docNotes-Labels zurück", async () => {
    const res = await createSelfEmployedBankSummaryAction("case-A", {
      ...input,
      docNotes: [{ label: "BWA 2024", notiz: "" }],
    } as never);
    expect(res.documentId).toBe("pdfdoc-1");
    const renderArg = renderEinkommensanalyse.mock.calls[0]![0] as { begleittext?: { paragraphs: string[] } };
    expect(renderArg.begleittext!.paragraphs.join("\n")).toContain("BWA 2024");
  });

  it("liefert Fehler, wenn der gewählte Antragsteller fehlt", async () => {
    applicantFindFirst.mockResolvedValue(null);
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.error).toBeTruthy();
  });
});
