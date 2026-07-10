import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/cases/service", () => ({
  getCaseAggregate: vi.fn(async () => ({ missing: [], readiness: { score: 80 } })),
}));

const ctx = {
  organizationId: "org-A",
  organizationName: "Org A",
  userId: "user-1",
  userName: "Tester",
  role: "vermittler",
  isDemo: false,
};

const caseFindUnique = vi.fn();
const caseFindUniqueOrThrow = vi.fn();
const caseFindFirst = vi.fn();
const caseFindMany = vi.fn();
const caseCreate = vi.fn();
const caseUpdate = vi.fn();
const documentFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: (...a: unknown[]) => caseFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => caseFindUniqueOrThrow(...a),
      findFirst: (...a: unknown[]) => caseFindFirst(...a),
      findMany: (...a: unknown[]) => caseFindMany(...a),
      create: (...a: unknown[]) => caseCreate(...a),
      update: (...a: unknown[]) => caseUpdate(...a),
    },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
  },
}));

import { runAiCheck, createCase } from "@/lib/actions/cases";

beforeEach(() => {
  [caseFindUnique, caseFindUniqueOrThrow, caseFindFirst, caseFindMany, caseCreate, caseUpdate, documentFindMany].forEach((m) => m.mockReset());
});

describe("runAiCheck – Status-Guard & Revert", () => {
  it("lässt einen exportierten Fall unverändert (kein Zurücksetzen)", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "exportiert" });
    await runAiCheck("case-A");
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("stellt bei einem Fehler während der Prüfung den vorherigen Status wieder her", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "unterlagen_fehlen" });
    caseUpdate.mockResolvedValue({});
    documentFindMany.mockRejectedValue(new Error("DB weg"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runAiCheck("case-A")).rejects.toThrow("DB weg");

    // 1. Update: ki_pruefung_laeuft, letztes Update: revert auf unterlagen_fehlen
    const statuses = caseUpdate.mock.calls.map((c) => (c[0] as { data: { status?: string } }).data.status);
    expect(statuses[0]).toBe("ki_pruefung_laeuft");
    expect(statuses[statuses.length - 1]).toBe("unterlagen_fehlen");
  });
});

describe("createCase – Fallnummer-Race", () => {
  it("versucht bei Nummern-Kollision (P2002) mit neuer Nummer erneut", async () => {
    caseFindMany
      .mockResolvedValueOnce([{ caseNumber: "UP-2026-0004" }])
      .mockResolvedValueOnce([{ caseNumber: "UP-2026-0005" }]);
    caseCreate
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockResolvedValueOnce({ id: "case-new", caseNumber: "UP-2026-0006" });

    const fd = new FormData();
    fd.set("vorname", "Max");
    await createCase(fd);

    expect(caseCreate).toHaveBeenCalledTimes(2);
    const secondData = (caseCreate.mock.calls[1]![0] as { data: { caseNumber: string } }).data;
    expect(secondData.caseNumber).toBe("UP-2026-0006");
  });

  it("vergibt jenseits von 9999 die numerisch nächste Nummer", async () => {
    // Regression: `orderBy: { caseNumber: "desc" }` sortiert lexikografisch, also
    // gilt "UP-2026-9999" > "UP-2026-10000". Die Vergabe erzeugte dann dauerhaft
    // erneut 10000 → P2002 bei jedem Versuch, Fallanlage unmöglich.
    caseFindMany.mockResolvedValue([
      { caseNumber: "UP-2026-9999" },
      { caseNumber: "UP-2026-10000" },
      { caseNumber: "UP-2026-0001" },
    ]);
    caseCreate.mockResolvedValue({ id: "case-new", caseNumber: "UP-2026-10001" });

    const fd = new FormData();
    fd.set("vorname", "Max");
    await createCase(fd);

    const data = (caseCreate.mock.calls[0]![0] as { data: { caseNumber: string } }).data;
    expect(data.caseNumber).toBe("UP-2026-10001");
  });
});
