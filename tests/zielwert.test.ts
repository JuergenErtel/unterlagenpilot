import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock wird an den Dateianfang gehoben – die Mocks müssen daher über
// vi.hoisted entstehen, sonst sind sie in der Factory noch nicht initialisiert.
const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  const m = {
    applicantFindFirst: fn(),
    applicantCreate: fn(),
    applicantUpdate: fn(),
    incomeFindFirst: fn(),
    incomeCreate: fn(),
    incomeUpdate: fn(),
    employmentFindFirst: fn(),
    employmentCreate: fn(),
    employmentUpdate: fn(),
    selfEmploymentUpsert: fn(),
    propertyUpsert: fn(),
    financingUpsert: fn(),
    caseUpdate: fn(),
  };
  const modelle = {
    applicant: { findFirst: m.applicantFindFirst, create: m.applicantCreate, update: m.applicantUpdate },
    incomeRecord: { findFirst: m.incomeFindFirst, create: m.incomeCreate, update: m.incomeUpdate },
    employmentRecord: {
      findFirst: m.employmentFindFirst,
      create: m.employmentCreate,
      update: m.employmentUpdate,
    },
    selfEmploymentRecord: { upsert: m.selfEmploymentUpsert },
    property: { upsert: m.propertyUpsert },
    financingRequest: { upsert: m.financingUpsert },
    case: { update: m.caseUpdate },
  };
  return { ...m, modelle };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    ...h.modelle,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.modelle),
  },
}));

import { wandleWert, schreibeZielwert } from "@/lib/actions/zielwert";

describe("Typumwandlung fuer Zielfelder", () => {
  it("macht aus Datumstexten ein Datum", () => {
    expect(wandleWert("geburtsdatum", "1987-09-18")).toEqual(new Date("1987-09-18"));
  });
  it("macht aus Zahltexten Zahlen, auch deutsch geschrieben", () => {
    expect(wandleWert("kaufpreis", "895.000")).toBe(895000);
    expect(wandleWert("wohnflaeche", "242,7")).toBe(242.7);
  });
  it("macht aus ja/nein einen Wahrheitswert", () => {
    expect(wandleWert("sondertilgungGewuenscht", "ja")).toBe(true);
    expect(wandleWert("sondertilgungGewuenscht", "nein")).toBe(false);
  });
  it("macht aus einem leeren Text null – eine geloeschte Angabe ist eine Angabe", () => {
    expect(wandleWert("kaufpreis", "")).toBeNull();
  });
  it("erkennt einen echten Nachkommaanteil aus der Selbstauskunft nicht als Tausendertrenner", () => {
    // So liest die Selbstauskunft eine geparste Zahl zurueck (String(129.5) === "129.5").
    expect(wandleWert("wohnflaeche", "129.5")).toBe(129.5);
  });
  it("wandelt die neuen Finanzierungsfelder korrekt um", () => {
    expect(wandleWert("zinsbindungJahre", "15")).toBe(15);
    expect(wandleWert("wunschrateMonatlich", "1.250,50")).toBe(1250.5);
  });
});

const alleMocks = [
  h.applicantFindFirst,
  h.applicantCreate,
  h.applicantUpdate,
  h.incomeFindFirst,
  h.incomeCreate,
  h.incomeUpdate,
  h.employmentFindFirst,
  h.employmentCreate,
  h.employmentUpdate,
  h.selfEmploymentUpsert,
  h.propertyUpsert,
  h.financingUpsert,
  h.caseUpdate,
];

describe("schreibeZielwert", () => {
  beforeEach(() => {
    alleMocks.forEach((m) => m.mockReset());
    h.applicantFindFirst.mockResolvedValue({ id: "a1", position: 1 });
    h.applicantUpdate.mockResolvedValue({});
    h.applicantCreate.mockResolvedValue({ id: "a2", position: 2 });
    h.incomeFindFirst.mockResolvedValue(null);
    h.incomeCreate.mockResolvedValue({});
    h.employmentFindFirst.mockResolvedValue(null);
    h.employmentCreate.mockResolvedValue({});
  });

  it("findet den Antragsteller über die Position und schreibt das Feld", async () => {
    await schreibeZielwert("case-A", { entitaet: "applicant", feld: "vorname", person: 1 }, "Thomas");
    expect(h.applicantFindFirst).toHaveBeenCalledWith({ where: { caseId: "case-A", position: 1 } });
    expect(h.applicantCreate).not.toHaveBeenCalled();
    const arg = h.applicantUpdate.mock.calls[0]![0] as { where: { id: string }; data: Record<string, unknown> };
    expect(arg.where.id).toBe("a1");
    expect(arg.data.vorname).toBe("Thomas");
  });

  it("legt Antragsteller 2 an, wenn er noch nicht existiert", async () => {
    h.applicantFindFirst.mockResolvedValue(null);
    await schreibeZielwert("case-A", { entitaet: "applicant", feld: "vorname", person: 2 }, "Laura");
    expect(h.applicantCreate).toHaveBeenCalledWith({ data: { caseId: "case-A", position: 2 } });
    const arg = h.applicantUpdate.mock.calls[0]![0] as { where: { id: string } };
    expect(arg.where.id).toBe("a2");
  });

  it("legt einen Einkommensdatensatz an, wenn keiner existiert, statt einen zweiten anzuhängen", async () => {
    await schreibeZielwert("case-A", { entitaet: "income", feld: "nettoMonatlich", person: 1 }, "3200");
    expect(h.incomeCreate).toHaveBeenCalledWith({ data: { applicantId: "a1", nettoMonatlich: 3200 } });
    expect(h.incomeUpdate).not.toHaveBeenCalled();
  });

  it("aktualisiert den vorhandenen Einkommensdatensatz, statt einen zweiten anzulegen", async () => {
    h.incomeFindFirst.mockResolvedValue({ id: "inc-1" });
    await schreibeZielwert("case-A", { entitaet: "income", feld: "nettoMonatlich", person: 1 }, "3400");
    expect(h.incomeUpdate).toHaveBeenCalledWith({ where: { id: "inc-1" }, data: { nettoMonatlich: 3400 } });
    expect(h.incomeCreate).not.toHaveBeenCalled();
  });

  it("schreibt Objektfelder per Upsert", async () => {
    await schreibeZielwert("case-A", { entitaet: "property", feld: "wohnflaeche" }, "129,5");
    expect(h.propertyUpsert).toHaveBeenCalledWith({
      where: { caseId: "case-A" },
      create: { caseId: "case-A", wohnflaeche: 129.5 },
      update: { wohnflaeche: 129.5 },
    });
  });

  it("schreibt die neuen Finanzierungsfelder auf financingRequest", async () => {
    await schreibeZielwert("case-A", { entitaet: "financingRequest", feld: "zinsbindungJahre" }, "15");
    expect(h.financingUpsert).toHaveBeenCalledWith({
      where: { caseId: "case-A" },
      create: { caseId: "case-A", zinsbindungJahre: 15 },
      update: { zinsbindungJahre: 15 },
    });

    await schreibeZielwert(
      "case-A",
      { entitaet: "financingRequest", feld: "sondertilgungGewuenscht" },
      "ja"
    );
    const arg = h.financingUpsert.mock.calls[1]![0] as { update: { sondertilgungGewuenscht: boolean } };
    expect(arg.update.sondertilgungGewuenscht).toBe(true);

    await schreibeZielwert(
      "case-A",
      { entitaet: "financingRequest", feld: "wunschrateMonatlich" },
      "1.250,50"
    );
    const arg2 = h.financingUpsert.mock.calls[2]![0] as { update: { wunschrateMonatlich: number } };
    expect(arg2.update.wunschrateMonatlich).toBe(1250.5);
  });

  it("schreibt Fallfelder direkt auf case", async () => {
    await schreibeZielwert("case-A", { entitaet: "case", feld: "financingType" }, "kauf_bestand");
    expect(h.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-A" },
      data: { financingType: "kauf_bestand" },
    });
  });

  it("schreibt einen geleerten Wert als null – anders als uebernehmen darf hier geloescht werden", async () => {
    await schreibeZielwert("case-A", { entitaet: "property", feld: "wohnflaeche" }, "");
    expect(h.propertyUpsert).toHaveBeenCalledWith({
      where: { caseId: "case-A" },
      create: { caseId: "case-A", wohnflaeche: null },
      update: { wohnflaeche: null },
    });
  });
});
