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

import { wandleWert, schreibeZielwert, UNLESBARER_ZAHLENWERT } from "@/lib/actions/zielwert";

describe("Typumwandlung fuer Zielfelder", () => {
  it("macht aus Datumstexten ein Datum", () => {
    expect(wandleWert("geburtsdatum", "1987-09-18")).toEqual(new Date("1987-09-18"));
  });
  it("macht aus Zahltexten Zahlen, auch deutsch geschrieben", () => {
    expect(wandleWert("kaufpreis", "895.000")).toBe(895000);
    expect(wandleWert("wohnflaeche", "242,7")).toBe(242.7);
  });
  it("macht aus dem Sondertilgungswunsch eine Prozentzahl", () => {
    expect(wandleWert("sondertilgungProzentJaehrlich", "5")).toBe(5);
    // "Keine Sondertilgung" ist die 0 – eine Antwort, kein leeres Feld.
    expect(wandleWert("sondertilgungProzentJaehrlich", "0")).toBe(0);
  });
  it("macht aus ja/nein einen Wahrheitswert fuer die Befristung", () => {
    expect(wandleWert("befristet", "ja")).toBe(true);
    expect(wandleWert("befristet", "nein")).toBe(false);
  });
  it("macht aus einem leeren Text null – eine geloeschte Angabe ist eine Angabe", () => {
    expect(wandleWert("kaufpreis", "")).toBeNull();
  });
  it("wandelt die neuen Finanzierungsfelder korrekt um", () => {
    expect(wandleWert("zinsbindungJahre", "15")).toBe(15);
    expect(wandleWert("wunschrateMonatlich", "1.250,50")).toBe(1250.5);
  });

  describe("Format 'de' (Erstgespraech – der Vermittler tippt)", () => {
    it("behandelt einen Punkt immer als Tausendertrenner, auch bei drei Nachkommastellen", () => {
      // Genau die Stelle, an der eine reine Ziffernheuristik bricht: "33.333"
      // ist ohne Herkunftskenntnis nicht von einer echten Tausenderzahl zu
      // unterscheiden. Im "de"-Format ist das immer die deutsche Schreibweise.
      expect(wandleWert("beteiligungProzent", "33.333", "de")).toBe(33333);
      expect(wandleWert("darlehenswunsch", "1.234", "de")).toBe(1234);
      expect(wandleWert("darlehenswunsch", "0.001", "de")).toBe(1);
    });
  });

  describe("Format 'maschinell' (Selbstauskunft – der Wert ist schon geparst)", () => {
    it("liest einen Punkt als echten Dezimalpunkt, nie als Tausendertrenner", () => {
      // So liest die Selbstauskunft eine geparste Zahl zurueck: String(129.5) === "129.5".
      expect(wandleWert("wohnflaeche", "129.5", "maschinell")).toBe(129.5);
      // Der Produktionsfall aus der Pruefung: 33,333 % Beteiligung.
      expect(wandleWert("beteiligungProzent", "33.333", "maschinell")).toBe(33.333);
      expect(wandleWert("darlehenswunsch", "1.234", "maschinell")).toBe(1.234);
      expect(wandleWert("darlehenswunsch", "0.001", "maschinell")).toBe(0.001);
    });
  });

  describe("Ganzzahlige Zielfelder", () => {
    it("rundet einen Bruchwert, statt ihn an Prisma weiterzureichen und abzustuerzen", () => {
      // zinsbindungJahre ist Int? in der DB – "15,5" wuerde ungerundet einen
      // Prisma-Laufzeitfehler ausloesen.
      expect(wandleWert("zinsbindungJahre", "15,5", "de")).toBe(16);
      expect(wandleWert("baujahr", "1998.7", "maschinell")).toBe(1999);
    });
  });

  describe("Unlesbare Zahleneingabe (B3 – darf den vorher gepflegten Wert nicht loeschen)", () => {
    it("liefert das Unlesbar-Signal statt null bei 'ca. 300'", () => {
      expect(wandleWert("kaufpreis", "ca. 300")).toBe(UNLESBARER_ZAHLENWERT);
    });
    it("liefert das Unlesbar-Signal statt null bei einer Spanne '3.000-3.500'", () => {
      expect(wandleWert("kaufpreis", "3.000-3.500")).toBe(UNLESBARER_ZAHLENWERT);
    });
    it("ein explizit geleertes Feld bleibt weiterhin null, nicht das Unlesbar-Signal", () => {
      expect(wandleWert("kaufpreis", "")).toBeNull();
    });
  });

  describe("Nicht-nullbare Wahrheitsfelder", () => {
    it("faellt bei einer geloeschten Angabe auf den Schema-Standard zurueck, statt null zu schreiben", () => {
      // inProbezeit und befristet sind Boolean @default(false), also NOT
      // NULL – null wuerde an diesen Spalten einen Laufzeitfehler ausloesen.
      expect(wandleWert("inProbezeit", "")).toBe(false);
      expect(wandleWert("befristet", "")).toBe(false);
    });
    it("schreibt bei einer geloeschten Zahl weiterhin null", () => {
      // sondertilgungProzentJaehrlich ist Float? – null heisst laut Schema
      // "nicht gefragt" und ist dort ausdruecklich erlaubt.
      expect(wandleWert("sondertilgungProzentJaehrlich", "")).toBeNull();
    });
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
      { entitaet: "financingRequest", feld: "sondertilgungProzentJaehrlich" },
      "5"
    );
    const arg = h.financingUpsert.mock.calls[1]![0] as {
      update: { sondertilgungProzentJaehrlich: number };
    };
    expect(arg.update.sondertilgungProzentJaehrlich).toBe(5);

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
    const ergebnis = await schreibeZielwert("case-A", { entitaet: "property", feld: "wohnflaeche" }, "");
    expect(h.propertyUpsert).toHaveBeenCalledWith({
      where: { caseId: "case-A" },
      create: { caseId: "case-A", wohnflaeche: null },
      update: { wohnflaeche: null },
    });
    expect(ergebnis.gespeichert).toBe(true);
  });

  describe("Unlesbare Zahleneingabe (B3)", () => {
    it("schreibt NICHTS in die DB, wenn der Text keine lesbare Zahl ergibt – der vorher gepflegte Wert bleibt stehen", async () => {
      const ergebnis = await schreibeZielwert("case-A", { entitaet: "property", feld: "wohnflaeche" }, "ca. 300");
      expect(h.propertyUpsert).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({ gespeichert: false, unlesbar: true });
    });

    it("schreibt NICHTS bei einer Spannenangabe wie '3.000-3.500'", async () => {
      const ergebnis = await schreibeZielwert(
        "case-A",
        { entitaet: "financingRequest", feld: "kaufpreis" },
        "3.000-3.500"
      );
      expect(h.financingUpsert).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({ gespeichert: false, unlesbar: true });
    });
  });
});
