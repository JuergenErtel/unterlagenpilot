import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const h = vi.hoisted(() => ({
  stateFindUnique: vi.fn(),
  stateUpsert: vi.fn(),
  caseUpdate: vi.fn(),
  createCaseFromCanonical: vi.fn(),
  fetchVorgang: vi.fn(),
  fetchLeadsPage: vi.fn(),
  bereiteErstkontaktVor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leadSyncState: { findUnique: h.stateFindUnique, upsert: h.stateUpsert },
    case: { update: h.caseUpdate },
  },
}));

vi.mock("@/lib/platforms/case-writer", () => ({
  createCaseFromCanonical: h.createCaseFromCanonical,
}));

vi.mock("@/lib/platforms/finlink/client", () => ({
  finlinkKonfigurationsLuecke: () => null,
  getFinLinkClient: () => ({
    fetchVorgang: h.fetchVorgang,
    fetchLeadsPage: h.fetchLeadsPage,
    listLeads: vi.fn(),
  }),
}));

vi.mock("@/lib/platforms/finlink/mapping", () => ({
  finlinkToCanonical: () => ({ platformIds: { finlinkId: "L1" }, applicants: [] }),
}));

vi.mock("@/lib/cases/erstkontakt", () => ({
  bereiteErstkontaktVor: h.bereiteErstkontaktVor,
}));

import { syncFinLinkLeads } from "@/lib/platforms/finlink/sync";

const ctx = { organizationId: "org-A", userId: "u1" };
const marke = new Date("2026-08-07T10:00:00Z");

function rohLead(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    createdAt,
    sourceType: "ImmoscoutLead",
    source: null,
    einwilligungKontakt: true,
    einwilligungMarketing: null,
    ...extra,
  };
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.stateFindUnique.mockResolvedValue({ id: "s1", syncedUntil: marke });
  h.stateUpsert.mockResolvedValue({});
  h.caseUpdate.mockResolvedValue({});
  h.createCaseFromCanonical.mockResolvedValue({ caseId: "c1", caseNumber: "UP-1", deduped: false });
  h.fetchVorgang.mockResolvedValue({ id: "L1", antragsteller: [] });
  h.fetchLeadsPage.mockResolvedValue([rohLead("L1", "2026-08-07T11:00:00Z")]);
  h.bereiteErstkontaktVor.mockResolvedValue({ status: "vorbereitet" });
});

describe("syncFinLinkLeads", () => {
  it("legt für einen neuen Lead einen Fall an und setzt die Quelle", async () => {
    const r = await syncFinLinkLeads(ctx);
    expect(r.status).toBe("ok");
    expect(r.angelegt).toBe(1);
    const arg = h.caseUpdate.mock.calls[0]![0] as {
      data: { quelle: string; quelleDetail: string; einwilligungKontakt: boolean };
    };
    expect(arg.data.quelle).toBe("immoscout24");
    expect(arg.data.quelleDetail).toBe("ImmoscoutLead");
    expect(arg.data.einwilligungKontakt).toBe(true);
    expect(h.bereiteErstkontaktVor).toHaveBeenCalledWith("c1");
  });

  it("bricht den Import nicht ab, wenn die Erstkontakt-Vorbereitung scheitert", async () => {
    h.bereiteErstkontaktVor.mockRejectedValue(new Error("kaputt"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await syncFinLinkLeads(ctx);
    expect(r.status).toBe("ok");
    expect(r.angelegt).toBe(1);
  });

  it("schiebt die Marke auf den neuesten verarbeiteten Lead", async () => {
    await syncFinLinkLeads(ctx);
    const arg = h.stateUpsert.mock.calls[0]![0] as { update: { syncedUntil: Date } };
    expect(arg.update.syncedUntil.toISOString()).toBe("2026-08-07T11:00:00.000Z");
  });

  it("meldet 'nicht konfiguriert', wenn kein Client da ist", async () => {
    const r = await syncFinLinkLeads(ctx, { client: null });
    expect(r.status).toBe("nicht_konfiguriert");
    expect(h.stateUpsert).not.toHaveBeenCalled();
  });

  it("lässt die Marke bei einem API-Fehler stehen", async () => {
    h.fetchLeadsPage.mockRejectedValue(new Error("502 Bad Gateway"));
    const r = await syncFinLinkLeads(ctx);
    expect(r.status).toBe("fehler");
    const arg = h.stateUpsert.mock.calls[0]![0] as {
      update: { lastError: string; syncedUntil?: Date };
    };
    expect(arg.update.lastError).toContain("502");
    expect(arg.update.syncedUntil).toBeUndefined();
  });

  it("überspringt einen kaputten Lead, blockiert den Rest aber nicht", async () => {
    h.fetchLeadsPage.mockResolvedValue([
      rohLead("L1", "2026-08-07T11:00:00Z"),
      rohLead("L2", "2026-08-07T12:00:00Z"),
    ]);
    h.fetchVorgang.mockImplementation(async (id: string) => {
      if (id === "L1") throw new Error("Antwort unparsebar");
      return { id, antragsteller: [] };
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await syncFinLinkLeads(ctx);
    expect(r.angelegt).toBe(1);
    expect(r.uebersprungen).toEqual(["L1"]);
    // Marke rückt trotzdem vor – ein kaputter Datensatz darf den Zufluss nicht
    // dauerhaft blockieren.
    const arg = h.stateUpsert.mock.calls[0]![0] as { update: { syncedUntil: Date } };
    expect(arg.update.syncedUntil.toISOString()).toBe("2026-08-07T12:00:00.000Z");
  });

  it("zählt eine Dublette nicht als Neuanlage", async () => {
    h.createCaseFromCanonical.mockResolvedValue({
      caseId: "c1",
      caseNumber: "UP-1",
      deduped: true,
    });
    const r = await syncFinLinkLeads(ctx);
    expect(r.angelegt).toBe(0);
    expect(h.caseUpdate).not.toHaveBeenCalled();
  });

  it("setzt beim ersten Lauf nur den Stichtag und legt nichts an", async () => {
    h.stateFindUnique.mockResolvedValue(null);
    const jetzt = new Date("2026-08-07T13:00:00Z");
    const r = await syncFinLinkLeads(ctx, { jetzt });
    expect(r.angelegt).toBe(0);
    expect(h.fetchLeadsPage).not.toHaveBeenCalled();
    const arg = h.stateUpsert.mock.calls[0]![0] as { create: { syncedUntil: Date } };
    expect(arg.create.syncedUntil.toISOString()).toBe(jetzt.toISOString());
  });
});
