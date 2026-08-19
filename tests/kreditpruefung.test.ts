import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async () => ({
    ctx: { organizationId: "org-A", userId: "user-1" },
    caseRow: { id: "case-A", organizationId: "org-A" },
  })),
}));

const upsert = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    kreditpruefung: { upsert: (...a: unknown[]) => upsert(...a) },
    case: { findUnique: vi.fn() },
  },
}));

import { speichereKreditpruefung } from "@/lib/actions/kreditpruefung";
import { fehlendeAngaben, type KreditpruefungStand } from "@/lib/cases/kreditpruefung";

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  Object.entries(werte).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

async function gespeichert(werte: Record<string, string>) {
  upsert.mockReset();
  upsert.mockResolvedValue({});
  await speichereKreditpruefung("case-A", form(werte));
  return (upsert.mock.calls[0]![0] as { create: Record<string, unknown> }).create;
}

const stand = (over: Partial<KreditpruefungStand> = {}): KreditpruefungStand => ({
  bank: "ING",
  darlehenssumme: 320000,
  sollzinsProzent: 3.45,
  zinsbindungJahre: 10,
  rateMonatlich: 1480,
  tilgungProzent: null,
  plattform: null,
  quelle: "manuell",
  eingereichtAm: null,
  notiz: null,
  leer: false,
  ...over,
});

beforeEach(() => upsert.mockReset());

describe("speichereKreditpruefung – deutsche Zahleingabe", () => {
  it("liest Tausenderpunkt und Dezimalkomma richtig", async () => {
    const d = await gespeichert({
      bank: "  ING  ",
      darlehenssumme: "320.000 €",
      sollzinsProzent: "3,45 %",
      zinsbindungJahre: "10",
      rateMonatlich: "1.480",
    });
    expect(d.bank).toBe("ING");
    expect(d.darlehenssumme).toBe(320000);
    expect(d.sollzinsProzent).toBe(3.45);
    expect(d.zinsbindungJahre).toBe(10);
    expect(d.rateMonatlich).toBe(1480);
  });

  it("macht aus einem englisch getippten Dezimalpunkt keine 345", async () => {
    // "3.45" ist kein Tausendertrenner – dahinter stehen nur zwei Ziffern.
    const d = await gespeichert({ sollzinsProzent: "3.45" });
    expect(d.sollzinsProzent).toBe(3.45);
  });

  it("speichert leere Felder als null statt als 0", async () => {
    const d = await gespeichert({ bank: "ING", darlehenssumme: "", sollzinsProzent: "   " });
    expect(d.darlehenssumme).toBeNull();
    expect(d.sollzinsProzent).toBeNull();
  });

  it("rundet die Zinsbindung auf ganze Jahre", async () => {
    const d = await gespeichert({ zinsbindungJahre: "10,4" });
    expect(d.zinsbindungJahre).toBe(10);
  });
});

describe("fehlendeAngaben", () => {
  it("nennt ohne Datensatz alle fünf Angaben", () => {
    expect(fehlendeAngaben(null)).toHaveLength(5);
  });

  it("lässt Rate ODER Tilgung genügen", () => {
    expect(fehlendeAngaben(stand({ rateMonatlich: 1480, tilgungProzent: null }))).toEqual([]);
    expect(fehlendeAngaben(stand({ rateMonatlich: null, tilgungProzent: 2 }))).toEqual([]);
    expect(fehlendeAngaben(stand({ rateMonatlich: null, tilgungProzent: null }))).toEqual([
      "Rate oder Tilgung",
    ]);
  });

  it("wertet einen Zinssatz von 0 nicht als fehlend", () => {
    // 0 % ist eine Antwort (Förderdarlehen), keine Lücke.
    expect(fehlendeAngaben(stand({ sollzinsProzent: 0 }))).toEqual([]);
  });
});
