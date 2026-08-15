import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: vi.fn() }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

const resolve = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolve(...a),
  createSelfDisclosureLink: vi.fn(),
  deactivateSelfDisclosureLink: vi.fn(),
}));

const upsert = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      upsert: (...a: unknown[]) => upsert(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { speichereAntwort } from "@/lib/actions/self-disclosure";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [resolve, upsert, findUnique, redirect, checkRateLimit].forEach((m) => m.mockReset());
  resolve.mockResolvedValue({ linkId: "link-1", caseId: "case-1", organizationId: "org-1" });
  findUnique.mockResolvedValue({ answers: {}, submittedAt: null });
  upsert.mockResolvedValue({});
  checkRateLimit.mockResolvedValue({ ok: true, remaining: 199, retryAfterSec: 0 });
});

describe("speichereAntwort", () => {
  it("schreibt die Antwort unter dem Schlüssel aus Schritt und Feld", async () => {
    await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    const arg = upsert.mock.calls[0]![0] as { create: { answers: Record<string, unknown> } };
    expect(arg.create.answers["finanzierungsart.art"]).toBe("kauf_bestand");
  });

  it("lässt einen leeren Schritt zu und speichert nichts davon", async () => {
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "" }));
    expect(res).toBeUndefined();
    const arg = upsert.mock.calls[0]![0] as { create: { answers: Record<string, unknown> } };
    expect(arg.create.answers["kaufpreis.betrag"]).toBeUndefined();
  });

  it("löscht mit einem leeren Feld keine frühere Antwort", async () => {
    findUnique.mockResolvedValue({ answers: { "kaufpreis.betrag": 400000 }, submittedAt: null });
    await speichereAntwort("tok", "kaufpreis", form({ betrag: "" }));
    const arg = upsert.mock.calls[0]![0] as { update: { answers: Record<string, unknown> } };
    expect(arg.update.answers["kaufpreis.betrag"]).toBe(400000);
  });

  it("meldet einen unlesbaren Betrag zurück, ohne zu speichern", async () => {
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "dreitausend" }));
    expect(res?.fieldErrors?.betrag).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("weist ein ungültiges Token ab", async () => {
    resolve.mockResolvedValue(null);
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "1" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("nimmt nach dem Absenden keine Änderung mehr an", async () => {
    findUnique.mockResolvedValue({ answers: {}, submittedAt: new Date() });
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "1" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("weist einen Schritt ab, der nicht zum Bogen gehört", async () => {
    const res = await speichereAntwort("tok", "gibtesnicht", form({ x: "1" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("merkt sich den erreichten Schritt", async () => {
    await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    const arg = upsert.mock.calls[0]![0] as { update: { currentStep: string } };
    expect(arg.update.currentStep).toBe("objektstand");
  });

  it("schickt nach dem letzten Schritt zur Zusammenfassung", async () => {
    const { sichtbareSchritte } = await import("@/lib/self-disclosure/navigation");
    const letzter = sichtbareSchritte({}).at(-1)!;
    await speichereAntwort("tok", letzter.id, form({}));
    const arg = upsert.mock.calls[0]![0] as { update: { currentStep: string } };
    expect(arg.update.currentStep).toBe("zusammenfassung");
  });

  it("weist zu viele Schritte je Bogen und Stunde ab", async () => {
    // Seit dem Anfrageformular praegt sich jeder Besucher seinen eigenen Link
    // selbst - ohne Deckel waere das die groesste neue Angriffsflaeche.
    checkRateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfterSec: 1800 });
    const res = await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("zaehlt die Grenze ueber die linkId, nicht die IP", async () => {
    await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    expect(checkRateLimit.mock.calls[0]![0]).toBe("selbstauskunft:schritt:link-1");
  });

  it("speichert einen Schritt auch ohne Fall", async () => {
    // Formular-Bogen: Der Fall entsteht erst beim Absenden. Bis dahin darf
    // kein Schreibvorgang eine caseId verlangen.
    resolve.mockResolvedValue({ linkId: "link-1", caseId: null, organizationId: "org-A" });
    findUnique.mockResolvedValue({ answers: {}, submittedAt: null });

    await speichereAntwort("TOK", "finanzierungsart", form({ art: "kauf_bestand" }));

    const daten = upsert.mock.calls[0]![0] as { create: { caseId?: string | null; linkId: string } };
    // Nicht nur "null" – das Feld darf beim falllosen Bogen gar nicht erst
    // gesetzt werden, sonst verlangt Prisma spaeter faelschlich einen Wert.
    expect("caseId" in daten.create).toBe(false);
    expect(daten.create.linkId).toBe("link-1");
  });
});
