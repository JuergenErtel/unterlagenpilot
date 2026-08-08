import { describe, it, expect, vi, beforeEach } from "vitest";

const ctx = { organizationId: "o1", userId: "u1" };
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx,
    caseRow: { id: caseId, organizationId: "o1" },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const vorbereiten = vi.fn();
vi.mock("@/lib/cases/erstkontakt", () => ({ bereiteErstkontaktVor: vorbereiten }));

const db = { fall: null as any, nachrichten: [] as any[] };
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findUnique: vi.fn(async () => db.fall) },
    generatedMessage: {
      findFirst: vi.fn(async () => db.nachrichten[0] ?? null),
    },
  },
}));

beforeEach(() => {
  vorbereiten.mockReset();
  db.fall = {
    id: "c1",
    erstkontaktVorbereitetAm: null,
    applicants: [{ email: "anna@example.de" }],
  };
  db.nachrichten = [];
});

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

describe("Erstkontakt-Stand", () => {
  it("meldet 'noch nicht vorbereitet' fuer einen frischen Fall", async () => {
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    await expect(ladeErstkontaktStand("c1")).resolves.toMatchObject({
      vorbereitetAm: null,
      messageId: null,
      versendetAm: null,
      empfaenger: "anna@example.de",
    });
  });

  it("meldet den Entwurf, sobald einer da ist", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.nachrichten = [{ id: "msg1", sent: false, createdAt: new Date("2026-08-08") }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.messageId).toBe("msg1");
    expect(stand.versendetAm).toBeNull();
  });

  it("meldet den Versand, sobald die Nachricht raus ist", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.nachrichten = [{ id: "msg1", sent: true, createdAt: new Date("2026-08-08") }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.versendetAm).not.toBeNull();
  });
});

describe("Erstkontakt vorbereiten (Action)", () => {
  it("prueft den Fallzugriff, bevor sie etwas tut", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
  });

  it("reicht die handelnde Person weiter", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    expect(vorbereiten).toHaveBeenCalledWith("c1", { actorUserId: "u1" });
  });

  it("tut ohne caseId nichts", async () => {
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({}));
    expect(vorbereiten).not.toHaveBeenCalled();
  });
});
