import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// after() sammelt die Hintergrund-Arbeit ein, damit Tests sie gezielt ausführen können.
const afterCallbacks: Array<() => void | Promise<void>> = [];
vi.mock("next/server", () => ({
  after: vi.fn((cb: () => void | Promise<void>) => {
    afterCallbacks.push(cb);
  }),
}));
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
const documentUpdateMany = vi.fn();

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
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      updateMany: (...a: unknown[]) => documentUpdateMany(...a),
    },
  },
}));

import { runAiCheck, createCase } from "@/lib/actions/cases";

beforeEach(() => {
  [caseFindUnique, caseFindUniqueOrThrow, caseFindFirst, caseFindMany, caseCreate, caseUpdate, documentFindMany, documentUpdateMany].forEach((m) => m.mockReset());
  afterCallbacks.length = 0;
});

describe("runAiCheck – Status-Guard, Hintergrundlauf & Revert", () => {
  it("lässt einen exportierten Fall unverändert (kein Zurücksetzen)", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "exportiert", updatedAt: new Date() });
    await runAiCheck("case-A");
    expect(caseUpdate).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("startet keine zweite Prüfung, solange eine frische läuft", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "ki_pruefung_laeuft", updatedAt: new Date() });
    await runAiCheck("case-A");
    expect(caseUpdate).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("erlaubt den Neustart, wenn ein läuft-Status veraltet ist (abgestürzter Lauf)", async () => {
    const alt = new Date(Date.now() - 11 * 60 * 1000);
    caseFindUniqueOrThrow.mockResolvedValue({ status: "ki_pruefung_laeuft", updatedAt: alt });
    caseUpdate.mockResolvedValue({});
    documentUpdateMany.mockResolvedValue({});
    await runAiCheck("case-A");
    expect(afterCallbacks).toHaveLength(1);
  });

  it("kehrt sofort zurück und verarbeitet die Dokumente im Hintergrund", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "unterlagen_fehlen", updatedAt: new Date() });
    caseUpdate.mockResolvedValue({});
    documentUpdateMany.mockResolvedValue({});
    documentFindMany.mockResolvedValue([]);

    await runAiCheck("case-A");

    // Aktion selbst: nur Status auf "läuft" + Dokumente markieren, keine KI-Arbeit.
    const statuses = caseUpdate.mock.calls.map((c) => (c[0] as { data: { status?: string } }).data.status);
    expect(statuses).toEqual(["ki_pruefung_laeuft"]);
    expect(documentUpdateMany).toHaveBeenCalledTimes(1);
    expect(documentFindMany).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    // Hintergrundlauf: verarbeitet Dokumente und setzt den Endstatus.
    await afterCallbacks[0]!();
    expect(documentFindMany).toHaveBeenCalledTimes(1);
    const allStatuses = caseUpdate.mock.calls.map((c) => (c[0] as { data: { status?: string } }).data.status);
    expect(allStatuses[allStatuses.length - 1]).toBe("vermittlerpruefung_erforderlich");
  });

  it("stellt bei einem Fehler im Hintergrundlauf den vorherigen Status wieder her", async () => {
    caseFindUniqueOrThrow.mockResolvedValue({ status: "unterlagen_fehlen", updatedAt: new Date() });
    caseUpdate.mockResolvedValue({});
    documentUpdateMany.mockResolvedValue({});
    documentFindMany.mockRejectedValue(new Error("DB weg"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runAiCheck("case-A");
    // Der Hintergrundlauf darf nicht werfen (niemand fängt ihn) – er räumt selbst auf.
    await expect(afterCallbacks[0]!()).resolves.toBeUndefined();

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
