import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (id: string) => ({ ctx, caseRow: { id, organizationId: "org-A" } })),
}));

const caseUpdate = vi.fn();
const caseUpdateMany = vi.fn();
const missingCreate = vi.fn();
const missingUpdate = vi.fn();
const missingCount = vi.fn();
const deadlineCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { update: (...a: unknown[]) => caseUpdate(...a), updateMany: (...a: unknown[]) => caseUpdateMany(...a) },
    missingDocumentRequest: {
      create: (...a: unknown[]) => missingCreate(...a),
      update: (...a: unknown[]) => missingUpdate(...a),
      count: (...a: unknown[]) => missingCount(...a),
      findUnique: vi.fn(async () => ({ caseId: "case-A", case: { organizationId: "org-A" } })),
    },
    caseDeadline: { create: (...a: unknown[]) => deadlineCreate(...a) },
  },
}));

import { setCaseBank, addBankRequest, resolveMissingRequest } from "@/lib/actions/case-management";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [caseUpdate, caseUpdateMany, missingCreate, missingUpdate, missingCount, deadlineCreate].forEach((m) => m.mockReset());
  caseUpdate.mockResolvedValue({});
  caseUpdateMany.mockResolvedValue({ count: 1 });
  missingCreate.mockResolvedValue({});
  missingUpdate.mockResolvedValue({});
  deadlineCreate.mockResolvedValue({});
  missingCount.mockResolvedValue(0);
});

describe("setCaseBank", () => {
  it("bevorzugt den Freitext gegenüber der Auswahl", async () => {
    await setCaseBank("case-A", fd({ bankName: "ING", bankNameFree: "Meine Hausbank" }));
    expect(caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { bankName: "Meine Hausbank" } }));
  });

  it("nimmt die Auswahl, wenn kein Freitext gesetzt ist", async () => {
    await setCaseBank("case-A", fd({ bankName: "ING" }));
    expect(caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { bankName: "ING" } }));
  });
});

describe("addBankRequest", () => {
  it("erfasst die Nachforderung und setzt den Status auf bank_nachforderung", async () => {
    await addBankRequest("case-A", fd({ title: "Aktuelle Gehaltsabrechnung", dueDate: "2026-08-01" }));
    expect(missingCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requestSource: "bank", title: "Aktuelle Gehaltsabrechnung" }) })
    );
    // Frist wird zusätzlich als Deadline angelegt.
    expect(deadlineCreate).toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "bank_nachforderung" } }));
  });

  it("legt ohne Titel nichts an", async () => {
    await addBankRequest("case-A", fd({ dueDate: "2026-08-01" }));
    expect(missingCreate).not.toHaveBeenCalled();
  });
});

describe("resolveMissingRequest", () => {
  it("setzt den Fall zurück auf 'eingereicht', wenn keine Bank-Nachforderung mehr offen ist", async () => {
    missingCount.mockResolvedValue(0);
    await resolveMissingRequest("req-1");
    expect(missingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolved: true }) })
    );
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "case-A", status: "bank_nachforderung" }, data: { status: "uebertragen" } })
    );
  });

  it("belässt den Status, solange noch Nachforderungen offen sind", async () => {
    missingCount.mockResolvedValue(2);
    await resolveMissingRequest("req-1");
    expect(caseUpdateMany).not.toHaveBeenCalled();
  });
});
