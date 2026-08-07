import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: vi.fn(),
  createSelfDisclosureLink: vi.fn(),
  deactivateSelfDisclosureLink: vi.fn(),
}));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a),
}));

// vi.mock wird an den Dateianfang gehoben – die Mocks müssen daher über
// vi.hoisted entstehen, sonst sind sie in der Factory noch nicht initialisiert.
const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  const m = {
    disclosureFindFirst: fn(),
    disclosureUpdate: fn(),
    applicantFindMany: fn(),
    applicantUpdate: fn(),
    applicantCreate: fn(),
    caseFindUnique: fn(),
    propertyFindUnique: fn(),
    propertyUpsert: fn(),
    financingFindUnique: fn(),
    financingUpsert: fn(),
    incomeFindFirst: fn(),
    incomeCreate: fn(),
    incomeUpdate: fn(),
    employmentFindFirst: fn(),
    employmentCreate: fn(),
    employmentUpdate: fn(),
    selfEmploymentUpsert: fn(),
  };
  const modelle = {
    selfDisclosure: { findFirst: m.disclosureFindFirst, update: m.disclosureUpdate },
    applicant: {
      findMany: m.applicantFindMany,
      update: m.applicantUpdate,
      create: m.applicantCreate,
    },
    case: { findUnique: m.caseFindUnique },
    property: { findUnique: m.propertyFindUnique, upsert: m.propertyUpsert },
    financingRequest: { findUnique: m.financingFindUnique, upsert: m.financingUpsert },
    incomeRecord: {
      findFirst: m.incomeFindFirst,
      create: m.incomeCreate,
      update: m.incomeUpdate,
    },
    employmentRecord: {
      findFirst: m.employmentFindFirst,
      create: m.employmentCreate,
      update: m.employmentUpdate,
    },
    selfEmploymentRecord: { upsert: m.selfEmploymentUpsert },
  };
  return { ...m, modelle };
});

const {
  disclosureFindFirst,
  disclosureUpdate,
  applicantFindMany,
  applicantUpdate,
  applicantCreate,
  caseFindUnique,
  propertyFindUnique,
  propertyUpsert,
  financingFindUnique,
  financingUpsert,
  incomeFindFirst,
  incomeCreate,
  incomeUpdate,
  employmentFindFirst,
  employmentCreate,
  employmentUpdate,
  selfEmploymentUpsert,
} = h;

vi.mock("@/lib/db", () => ({
  prisma: {
    ...h.modelle,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.modelle),
  },
}));

import { uebernehmen } from "@/lib/actions/self-disclosure";

const alleMocks = [
  requireCaseAccess,
  disclosureFindFirst,
  disclosureUpdate,
  applicantFindMany,
  applicantUpdate,
  applicantCreate,
  caseFindUnique,
  propertyFindUnique,
  propertyUpsert,
  financingFindUnique,
  financingUpsert,
  incomeFindFirst,
  incomeCreate,
  incomeUpdate,
  employmentFindFirst,
  employmentCreate,
  employmentUpdate,
  selfEmploymentUpsert,
];

beforeEach(() => {
  alleMocks.forEach((m) => m.mockReset());
  requireCaseAccess.mockResolvedValue({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } });
  caseFindUnique.mockResolvedValue({ status: "unterlagen_fehlen", financingType: null });
  propertyFindUnique.mockResolvedValue(null);
  financingFindUnique.mockResolvedValue(null);
  applicantFindMany.mockResolvedValue([{ id: "a1", position: 1 }]);
  applicantUpdate.mockResolvedValue({});
  applicantCreate.mockResolvedValue({ id: "a2", position: 2 });
  disclosureUpdate.mockResolvedValue({});
  incomeFindFirst.mockResolvedValue(null);
  incomeCreate.mockResolvedValue({});
  employmentFindFirst.mockResolvedValue(null);
  employmentCreate.mockResolvedValue({});
  disclosureFindFirst.mockResolvedValue({
    id: "sd-1",
    caseId: "case-A",
    answers: { "p1.person_name.vorname": "Thomas" },
  });
});

describe("uebernehmen", () => {
  it("schreibt nur die ausgewählten Vorschläge", async () => {
    await uebernehmen("case-A", ["p1.person_name.vorname"]);
    const arg = applicantUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(arg.where.id).toBe("a1");
    expect(arg.data.vorname).toBe("Thomas");
  });

  it("lässt nicht ausgewählte Vorschläge unangetastet", async () => {
    await uebernehmen("case-A", []);
    expect(applicantUpdate).not.toHaveBeenCalled();
  });

  it("legt Antragsteller 2 an, wenn Angaben dazu übernommen werden", async () => {
    disclosureFindFirst.mockResolvedValue({
      id: "sd-1",
      caseId: "case-A",
      answers: { "anzahl_antragsteller.anzahl": "2", "p2.person_name.vorname": "Laura" },
    });
    await uebernehmen("case-A", ["p2.person_name.vorname"]);
    expect(applicantCreate).toHaveBeenCalled();
    const arg = applicantUpdate.mock.calls[0]![0] as { where: { id: string } };
    expect(arg.where.id).toBe("a2");
  });

  it("wandelt Zahlen und Daten in den Typ des Zielfelds", async () => {
    disclosureFindFirst.mockResolvedValue({
      id: "sd-1",
      caseId: "case-A",
      answers: { "kaufpreis.betrag": 400000, "p1.person_geburt.geburtsdatum": "1985-04-12" },
    });
    await uebernehmen("case-A", ["kaufpreis.betrag", "p1.person_geburt.geburtsdatum"]);
    const fin = financingUpsert.mock.calls[0]![0] as { update: { kaufpreis: number } };
    expect(fin.update.kaufpreis).toBe(400000);
    const app = applicantUpdate.mock.calls[0]![0] as { data: { geburtsdatum: Date } };
    expect(app.data.geburtsdatum).toBeInstanceOf(Date);
  });

  it("legt Einkommen je Antragsteller an", async () => {
    disclosureFindFirst.mockResolvedValue({
      id: "sd-1",
      caseId: "case-A",
      answers: { "p1.einkommen.netto": 3200 },
    });
    await uebernehmen("case-A", ["p1.einkommen.netto"]);
    const arg = incomeCreate.mock.calls[0]![0] as {
      data: { applicantId: string; nettoMonatlich: number };
    };
    expect(arg.data.applicantId).toBe("a1");
    expect(arg.data.nettoMonatlich).toBe(3200);
  });

  it("bildet die neun Berufsoptionen auf EmploymentType ab", async () => {
    disclosureFindFirst.mockResolvedValue({
      id: "sd-1",
      caseId: "case-A",
      answers: { "p1.beruf_art.art": "handwerker" },
    });
    await uebernehmen("case-A", ["p1.beruf_art.art"]);
    const arg = employmentCreate.mock.calls[0]![0] as {
      data: { beschaeftigungsart: string };
    };
    expect(arg.data.beschaeftigungsart).toBe("selbststaendiger");
  });

  it("verweigert die Übernahme bei gesperrtem Fall", async () => {
    caseFindUnique.mockResolvedValue({ status: "exportiert", financingType: null });
    const res = await uebernehmen("case-A", ["p1.person_name.vorname"]);
    expect(res.error).toBeTruthy();
    expect(applicantUpdate).not.toHaveBeenCalled();
  });

  it("markiert den Bogen als übernommen", async () => {
    await uebernehmen("case-A", ["p1.person_name.vorname"]);
    const arg = disclosureUpdate.mock.calls[0]![0] as { data: { takenOverAt: Date } };
    expect(arg.data.takenOverAt).toBeInstanceOf(Date);
  });

  it("meldet einen Fehler, wenn keine eingegangene Selbstauskunft vorliegt", async () => {
    disclosureFindFirst.mockResolvedValue(null);
    const res = await uebernehmen("case-A", ["p1.person_name.vorname"]);
    expect(res.error).toBeTruthy();
  });
});
