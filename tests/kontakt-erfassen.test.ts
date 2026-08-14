import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn(async (_caseId: string) => ({ ctx }));
// requireCaseAccess wird in src/lib/actions/case-management.ts aus
// "@/lib/auth/context" importiert (nicht "@/lib/auth/guards") – hier geprüft.
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (caseId: string) => requireCaseAccess(caseId) }));

const noteCount = vi.fn();
const noteCreate = vi.fn();
const caseUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    caseNote: { count: (...a: unknown[]) => noteCount(...a), create: (...a: unknown[]) => noteCreate(...a) },
    case: { update: (...a: unknown[]) => caseUpdate(...a) },
  },
}));

import { kontaktVersuchErfassen } from "@/lib/actions/case-management";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [noteCount, noteCreate, caseUpdate].forEach((m) => m.mockReset());
  noteCount.mockResolvedValue(0);
  noteCreate.mockResolvedValue({ id: "n1" });
});

describe("kontaktVersuchErfassen", () => {
  it("legt einen Telefon-Vermerk mit Ergebnis an", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(noteCreate).toHaveBeenCalledTimes(1);
    const daten = noteCreate.mock.calls[0]![0].data;
    expect(daten.kind).toBe("telefon");
    expect(daten.ergebnis).toBe("nicht_erreicht");
    expect(daten.caseId).toBe("case-A");
    expect(daten.authorId).toBe("user-1");
  });

  it("zaehlt den Versuch im Text hoch", async () => {
    noteCount.mockResolvedValue(2);
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(noteCreate.mock.calls[0]![0].data.body).toContain("3. Versuch");
  });

  it("setzt bei 'erreicht' auf Wunsch eine Wiedervorlage", async () => {
    await kontaktVersuchErfassen(
      "case-A",
      form({ kanal: "telefon", ergebnis: "erreicht", wiedervorlage: "2026-08-20" })
    );
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    expect(caseUpdate.mock.calls[0]![0].data.wiedervorlage).toBeInstanceOf(Date);
  });

  it("setzt ohne Datum keine Wiedervorlage", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "erreicht" }));
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Kanal ab, statt ihn zu erfinden", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "brieftaube", ergebnis: "nicht_erreicht" }));
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("weist ein unbekanntes Ergebnis ab", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "vielleicht" }));
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("prueft den Fallzugriff", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(requireCaseAccess).toHaveBeenCalledWith("case-A");
  });
});
