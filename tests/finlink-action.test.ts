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

afterEach(() => vi.clearAllMocks());

function fd(id: string) { const f = new FormData(); f.set("finlinkId", id); return f; }

describe("importFromFinLink", () => {
  it("leitet bei Erfolg auf den neuen Fall um", async () => {
    importCaseById.mockResolvedValue({ ok: true, importedCaseIds: ["case-9"], message: "ok" });
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    await expect(importFromFinLink({}, fd("FL-1"))).rejects.toThrow("REDIRECT:/cases/case-9");
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
  });
});
