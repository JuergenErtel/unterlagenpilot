import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn(async (_caseId: string) => ({ ctx }));
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (caseId: string) => requireCaseAccess(caseId),
}));

const caseUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { case: { update: (...a: unknown[]) => caseUpdate(...a) } },
}));

import { setCaseNotes } from "@/lib/actions/case-management";
import { NOTIZEN_MAX_ZEICHEN } from "@/lib/cases/notizen";

function form(text: string) {
  const f = new FormData();
  f.set("notes", text);
  return f;
}

beforeEach(() => {
  caseUpdate.mockReset();
  caseUpdate.mockResolvedValue({});
  requireCaseAccess.mockClear();
});

describe("setCaseNotes", () => {
  it("speichert den getrimmten Text am Fall", async () => {
    const state = await setCaseNotes("case-A", {}, form("  Kunde meldet sich nach dem Urlaub.  "));
    expect(state).toEqual({ ok: true });
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    expect(caseUpdate.mock.calls[0]![0]).toMatchObject({
      where: { id: "case-A" },
      data: { notes: "Kunde meldet sich nach dem Urlaub." },
    });
  });

  it("laesst Zeilenumbrueche im Inneren stehen", async () => {
    await setCaseNotes("case-A", {}, form("Zeile 1\nZeile 2"));
    expect(caseUpdate.mock.calls[0]![0].data.notes).toBe("Zeile 1\nZeile 2");
  });

  it("leert das Feld auf null statt auf einen leeren String", async () => {
    // Sonst muesste jede Abfrage nach "hat der Fall Notizen?" den leeren
    // String zusaetzlich abfangen.
    await setCaseNotes("case-A", {}, form("   \n  "));
    expect(caseUpdate.mock.calls[0]![0].data.notes).toBeNull();
  });

  it("schreibt nichts, wenn der Text die Obergrenze reisst", async () => {
    const state = await setCaseNotes("case-A", {}, form("x".repeat(NOTIZEN_MAX_ZEICHEN + 1)));
    expect(state.error).toBeTruthy();
    expect(state.ok).toBeUndefined();
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("prueft vorher den Zugriff auf den Fall", async () => {
    await setCaseNotes("case-B", {}, form("Notiz"));
    expect(requireCaseAccess).toHaveBeenCalledWith("case-B");
  });
});
