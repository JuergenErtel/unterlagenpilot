import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ({ organizationId: "org-1", userId: "user-1" })),
}));
const redirectMock = vi.fn((url: string) => { throw new Error("REDIRECT:" + url); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectMock(u) }));
const importCaseById = vi.fn();
vi.mock("@/lib/platforms/connectors", () => ({
  FinLinkConnector: class { importCaseById = importCaseById; },
}));
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { case: { findUnique: (a: unknown) => findUnique(a) } } }));

afterEach(() => vi.clearAllMocks());

function fd(id: string) { const f = new FormData(); f.set("finlinkId", id); return f; }

describe("importFromFinLink", () => {
  it("gibt den angelegten Fall zurück, statt serverseitig umzuleiten", async () => {
    // Die Weiterleitung gehört dem Client: Solange die Action mit redirect()
    // endet, endet der Ladezustand des Knopfes erst, wenn die Navigation
    // durch ist – bleibt sie aus, hängt der Knopf für immer (28.08.2026).
    importCaseById.mockResolvedValue({ ok: true, importedCaseIds: ["case-9"], message: "ok" });
    findUnique.mockResolvedValue({ caseNumber: "UP-2026-0030" });
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("FL-1"));
    expect(res.fall).toEqual({ id: "case-9", caseNumber: "UP-2026-0030" });
    expect(res.error).toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("liefert den Fall auch dann, wenn die Fallnummer nicht zu lesen ist", async () => {
    // Ohne Nummer bleibt der Weg zum Fall trotzdem offen – die ID genügt.
    importCaseById.mockResolvedValue({ ok: true, importedCaseIds: ["case-7"], message: "ok" });
    findUnique.mockResolvedValue(null);
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("FL-2"));
    expect(res.fall?.id).toBe("case-7");
    expect(res.fall?.caseNumber).toBeUndefined();
  });

  it("gibt einen Fehler zurück, wenn die ID leer ist", async () => {
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("  "));
    expect(res.error).toMatch(/Vorgangs-ID/i);
    expect(importCaseById).not.toHaveBeenCalled();
  });

  it("reicht die Connector-Fehlermeldung durch", async () => {
    importCaseById.mockResolvedValue({ ok: false, importedCaseIds: [], message: "FinLink-Vorgang nicht gefunden. Bitte ID prüfen." });
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("nope"));
    expect(res.error).toMatch(/nicht gefunden/i);
    expect(res.fall).toBeUndefined();
  });
});
