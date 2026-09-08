import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  rolle: "org_admin" as string,
  upsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/context", async () => {
  const echt = await vi.importActual<typeof import("@/lib/auth/context")>("@/lib/auth/context");
  return {
    roleAtLeast: echt.roleAtLeast,
    requireContext: vi.fn(async () => ({
      organizationId: "org-1",
      userId: "user-1",
      role: h.rolle,
    })),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/db", () => ({ prisma: { leadSyncState: { upsert: h.upsert } } }));
vi.mock("@/lib/platforms/finlink/sync", () => ({ syncFinLinkLeads: vi.fn() }));

import { setzeLeadAbgleich } from "@/lib/actions/lead-sync";

beforeEach(() => {
  h.rolle = "org_admin";
  h.upsert.mockReset().mockResolvedValue({});
  h.audit.mockReset().mockResolvedValue(undefined);
});

describe("setzeLeadAbgleich", () => {
  it("schaltet ab und merkt sich den Zeitpunkt", async () => {
    const r = await setzeLeadAbgleich(false);
    expect(r.ok).toBe(true);
    const arg = h.upsert.mock.calls[0]![0] as {
      update: { aktiv: boolean; pausiertAm: Date | null };
    };
    expect(arg.update.aktiv).toBe(false);
    expect(arg.update.pausiertAm).toBeInstanceOf(Date);
  });

  it("rückt beim Einschalten den Stichtag vor, damit kein Schwall nachkommt", async () => {
    // Ohne diese Zeile holte der erste Lauf nach der Pause alles nach, was
    // zwischenzeitlich aufgelaufen ist – Dutzende Fälle auf einen Schlag.
    const r = await setzeLeadAbgleich(true);
    expect(r.ok).toBe(true);
    const arg = h.upsert.mock.calls[0]![0] as {
      update: { aktiv: boolean; syncedUntil: Date; pausiertAm: null };
    };
    expect(arg.update.aktiv).toBe(true);
    expect(arg.update.syncedUntil).toBeInstanceOf(Date);
    expect(arg.update.pausiertAm).toBeNull();
  });

  it("legt die Zeile mit Stichtag an, wenn es noch keine gibt", async () => {
    await setzeLeadAbgleich(false);
    const arg = h.upsert.mock.calls[0]![0] as {
      create: { aktiv: boolean; syncedUntil: Date };
    };
    expect(arg.create.aktiv).toBe(false);
    expect(arg.create.syncedUntil).toBeInstanceOf(Date);
  });

  it("schreibt einen Audit-Eintrag – sonst sähe das Aus wie ein stiller Ausfall", async () => {
    await setzeLeadAbgleich(false);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "leadimport.geschaltet", organizationId: "org-1" })
    );
  });

  it("lässt ein Teammitglied den Zufluss nicht abstellen", async () => {
    h.rolle = "teammitglied";
    const r = await setzeLeadAbgleich(false);
    expect(r.ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
