import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { setzePhase, setzeVerloren, hebeVerlustAuf } from "@/lib/actions/lead-phase";

beforeEach(() => {
  [requireCaseAccess, findUnique, update, audit].forEach((m) => m.mockReset());
  requireCaseAccess.mockResolvedValue({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } });
  findUnique.mockResolvedValue({ leadPhase: "neu", verlorenAm: null, verlorenGrund: null });
  update.mockResolvedValue({});
});

describe("setzePhase", () => {
  it("schreibt Phase und Zeitstempel", async () => {
    await setzePhase("case-A", "selbstauskunft_laeuft");
    const arg = update.mock.calls[0]![0] as { data: { leadPhase: string; leadPhaseSeit: Date } };
    expect(arg.data.leadPhase).toBe("selbstauskunft_laeuft");
    expect(arg.data.leadPhaseSeit).toBeInstanceOf(Date);
    expect(audit).toHaveBeenCalled();
  });

  it("tut nichts, wenn die Phase schon stimmt", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzePhase("case-A", "zusage");
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Phasenwert ab", async () => {
    const res = await setzePhase("case-A", "raumschiff");
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("erlaubt auch das Zurückstufen von Hand", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzePhase("case-A", "anfrage_erstellt");
    const arg = update.mock.calls[0]![0] as { data: { leadPhase: string } };
    expect(arg.data.leadPhase).toBe("anfrage_erstellt");
  });
});

describe("setzeVerloren", () => {
  it("schreibt Datum und Grund, ohne die Phase zu ändern", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzeVerloren("case-A", "kondition");
    const arg = update.mock.calls[0]![0] as {
      data: { verlorenAm: Date; verlorenGrund: string; leadPhase?: string };
    };
    expect(arg.data.verlorenAm).toBeInstanceOf(Date);
    expect(arg.data.verlorenGrund).toBe("kondition");
    expect(arg.data.leadPhase).toBeUndefined();
  });

  it("hängt eine Notiz an den Grund", async () => {
    await setzeVerloren("case-A", "sonstiges", "Kunde hat geerbt");
    const arg = update.mock.calls[0]![0] as { data: { verlorenGrund: string } };
    expect(arg.data.verlorenGrund).toContain("sonstiges");
    expect(arg.data.verlorenGrund).toContain("Kunde hat geerbt");
  });

  it("weist einen unbekannten Grund ab", async () => {
    const res = await setzeVerloren("case-A", "keine-lust");
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("hebeVerlustAuf", () => {
  it("löscht Datum und Grund", async () => {
    findUnique.mockResolvedValue({
      leadPhase: "zusage",
      verlorenAm: new Date(),
      verlorenGrund: "kondition",
    });
    await hebeVerlustAuf("case-A");
    const arg = update.mock.calls[0]![0] as { data: { verlorenAm: null; verlorenGrund: null } };
    expect(arg.data.verlorenAm).toBeNull();
    expect(arg.data.verlorenGrund).toBeNull();
  });

  it("tut nichts bei einem Fall, der gar nicht verloren ist", async () => {
    await hebeVerlustAuf("case-A");
    expect(update).not.toHaveBeenCalled();
  });
});
