import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const resolveToken = vi.fn();
// ALLE drei Ausfuhren nachbilden: src/lib/actions/self-disclosure.ts
// importiert auch deactivateSelfDisclosureLink. Fehlt eine im Mock,
// scheitert schon der Import des Moduls – mit einer Meldung, die nach einem
// Testfehler aussieht, aber keiner ist.
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolveToken(...a),
  createSelfDisclosureLink: vi.fn(),
  deactivateSelfDisclosureLink: vi.fn(),
}));

const gebaereFall = vi.fn();
vi.mock("@/lib/leadformular/fallgeburt", () => ({
  gebaereFall: (...a: unknown[]) => gebaereFall(...a),
}));

const disclosureFindUnique = vi.fn();
const disclosureUpdateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      findUnique: (...a: unknown[]) => disclosureFindUnique(...a),
      updateMany: (...a: unknown[]) => disclosureUpdateMany(...a),
      update: vi.fn(),
    },
  },
}));

import { sendeAb } from "@/lib/actions/self-disclosure";
import { KONTAKT_SCHLUESSEL } from "@/lib/self-disclosure/pflichtangaben";

const vollstaendig = {
  [KONTAKT_SCHLUESSEL.nachname]: "Mustermann",
  [KONTAKT_SCHLUESSEL.email]: "max@example.de",
  [KONTAKT_SCHLUESSEL.telefon]: "0170 1234567",
};

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [resolveToken, gebaereFall, disclosureFindUnique, disclosureUpdateMany].forEach((m) => m.mockReset());
  resolveToken.mockResolvedValue({ linkId: "link-1", caseId: null, organizationId: "org-A" });
  disclosureFindUnique.mockResolvedValue({
    id: "bogen-1",
    submittedAt: null,
    answers: vollstaendig,
    link: { formular: { id: "form-1", organizationId: "org-A", brokerId: "user-1" } },
  });
  disclosureUpdateMany.mockResolvedValue({ count: 1 });
  gebaereFall.mockResolvedValue("case-neu");
});

describe("sendeAb beim Anfrageformular", () => {
  it("gebaert den Fall, wenn Kontaktdaten und Einwilligung da sind", async () => {
    const res = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(res?.error).toBeUndefined();
    expect(gebaereFall).toHaveBeenCalledTimes(1);
  });

  it("gebaert keinen Fall ohne Einwilligung", async () => {
    const res = await sendeAb("TOK", form({}));
    expect(res?.error).toBeTruthy();
    expect(gebaereFall).not.toHaveBeenCalled();
  });

  it("gebaert keinen Fall ohne Kontaktdaten", async () => {
    disclosureFindUnique.mockResolvedValue({
      id: "bogen-1",
      submittedAt: null,
      answers: {},
      link: { formular: { id: "form-1", organizationId: "org-A", brokerId: "user-1" } },
    });
    const res = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(res?.fieldErrors).toBeTruthy();
    expect(gebaereFall).not.toHaveBeenCalled();
  });

  it("gebaert bei zwei gleichzeitigen Klicks nur einmal", async () => {
    // Die Reservierung ueber submittedAt ist atomar: Der zweite Klick
    // bekommt count 0 und darf nichts mehr tun.
    disclosureUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await sendeAb("TOK", form({ einwilligung: "ja" }));
    const zweiter = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(gebaereFall).toHaveBeenCalledTimes(1);
    expect(zweiter?.error).toBeTruthy();
  });

  it("laesst den fallgebundenen Bogen unveraendert durch", async () => {
    resolveToken.mockResolvedValue({ linkId: "link-1", caseId: "case-A", organizationId: "org-A" });
    disclosureFindUnique.mockResolvedValue({
      id: "bogen-1",
      submittedAt: null,
      answers: {},
      link: { formular: null },
    });
    const res = await sendeAb("TOK");
    expect(res?.error).toBeUndefined();
    expect(gebaereFall).not.toHaveBeenCalled();
  });
});
