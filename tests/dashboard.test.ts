import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testet die verdrahtete Selbstauskunfts-Quelle im Dashboard: Seit
 * ladeSelbstauskunftStandBatch (statt der alten prisma.selfDisclosure-Abfrage)
 * eingebaut ist, muss ein Fall mit gültigem, noch nicht geöffnetem Link im
 * "Selbstauskunft nachfassen"-Signal auftauchen – vorher tat er das nicht,
 * weil es noch keinen SelfDisclosure-Datensatz gab (siehe
 * selbstauskunft-stand.ts). Alle teuren Abhängigkeiten (getCaseAggregate,
 * casesToCanonical, buildPlatformMapping) werden gemockt – hier geht es nur
 * um die Verdrahtung des Selbstauskunfts-Signals, nicht um Checklisten/KI.
 */

const groupBy = vi.fn();
const documentCount = vi.fn();
const caseCount = vi.fn();
const caseFindMany = vi.fn();
const documentFindMany = vi.fn();
const selfDisclosureLinkFindMany = vi.fn();
const generatedMessageFindMany = vi.fn();
const caseFindingGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      groupBy: (...a: unknown[]) => groupBy(...a),
      count: (...a: unknown[]) => caseCount(...a),
      findMany: (...a: unknown[]) => caseFindMany(...a),
    },
    document: {
      count: (...a: unknown[]) => documentCount(...a),
      findMany: (...a: unknown[]) => documentFindMany(...a),
    },
    selfDisclosureLink: {
      findMany: (...a: unknown[]) => selfDisclosureLinkFindMany(...a),
    },
    generatedMessage: {
      findMany: (...a: unknown[]) => generatedMessageFindMany(...a),
    },
    caseFinding: {
      groupBy: (...a: unknown[]) => caseFindingGroupBy(...a),
    },
  },
}));

const getCaseAggregate = vi.fn();
vi.mock("@/lib/cases/service", () => ({
  getCaseAggregate: (...a: unknown[]) => getCaseAggregate(...a),
}));

const casesToCanonical = vi.fn();
vi.mock("@/lib/platforms/case-loader", () => ({
  casesToCanonical: (...a: unknown[]) => casesToCanonical(...a),
}));

vi.mock("@/lib/platforms/mapping", () => ({
  buildPlatformMapping: () => ({ missingRequiredFields: [] }),
}));

import { getDashboardData } from "@/lib/cases/dashboard";

const VOR_5_TAGEN = new Date(Date.now() - 5 * 86_400_000);
const MORGEN = new Date(Date.now() + 86_400_000);

/** Minimaler Antragsteller, der keine der anderen Prioritätsstufen auslöst. */
function applicant(email: string) {
  return {
    position: 1,
    vorname: "Max",
    nachname: "Muster",
    email,
    geburtsdatum: new Date("1980-01-01"),
  };
}

/**
 * Ein Antragsteller mit abgeschlossenem Erstgespräch (alle 26 Angaben aus
 * `berechneReife` gefüllt) – für Fixtures, die NICHT die Erstgespräch-Stufe
 * testen. Seit dem Dashboard-Fix (A4, Schlusspruefung 12.08.2026) zählt
 * `getDashboardData` dieselbe Reife wie die Fallseite; ein `applicant()` ohne
 * Beschäftigung/Einkommen/Objekt/Finanzierung würde dort sonst immer
 * "Erstgespräch führen" auslösen und andere Prioritätsstufen (z. B. die
 * Selbstauskunft) verdecken, die dieser Fixture-Satz eigentlich prüfen soll.
 */
function vollstaendigerAntragsteller(email: string) {
  return {
    position: 1,
    vorname: "Max",
    nachname: "Muster",
    email,
    geburtsdatum: new Date("1980-01-01"),
    staatsangehoerigkeit: "deutsch",
    street: "Musterstr. 1",
    familienstand: "verheiratet",
    anzahlKinder: 0,
    employment: [{ beschaeftigungsart: "angestellter", inProbezeit: false, befristet: false }],
    income: [{ nettoMonatlich: 3000, sonstigeEinnahmen: 0 }],
  };
}

const VOLLSTAENDIGES_OBJEKT_UND_VORHABEN = {
  financingType: "kauf",
  property: {
    objektart: "einfamilienhaus",
    zip: "12345",
    wohnflaeche: 120,
    grundstuecksflaeche: 300,
    baujahr: 2000,
    nutzung: "eigennutzung",
  },
  financingRequest: {
    eigenkapital: 50000,
    kaufpreis: 400000,
    maklerprovisionProzent: 3.57,
    darlehenswunsch: 350000,
    zinsbindungJahre: 10,
    sondertilgungGewuenscht: true,
    wunschrateMonatlich: 1500,
  },
};

function leereAggregation(caseId: string) {
  return {
    caseId,
    caseNumber: caseId,
    canonical: {},
    checklist: [],
    plausibility: [],
    missing: [],
    readiness: { score: 100, band: "fast", label: "", mandatoryOpen: 0, mandatoryTotal: 0 },
    documentCount: 0,
  };
}

beforeEach(() => {
  groupBy.mockReset().mockResolvedValue([]);
  documentCount.mockReset().mockResolvedValue(0);
  caseCount.mockReset().mockResolvedValue(0);
  documentFindMany.mockReset().mockResolvedValue([]);
  caseFindingGroupBy.mockReset().mockResolvedValue([]);
  generatedMessageFindMany.mockReset().mockResolvedValue([
    { id: "msg-1", sent: true },
    { id: "msg-2", sent: true },
    { id: "msg-3", sent: true },
  ]);
  casesToCanonical.mockReset().mockResolvedValue(new Map());
  getCaseAggregate.mockReset().mockImplementation((id: string) => Promise.resolve(leereAggregation(id)));
  selfDisclosureLinkFindMany.mockReset();

  caseFindMany.mockReset().mockImplementation((args: { include?: unknown }) => {
    if (args.include) {
      // todoCandidates
      return Promise.resolve([
        {
          id: "c1-link-unbearbeitet",
          caseNumber: "UP-0001",
          status: "unterlagen_fehlen",
          erstkontaktMessageId: "msg-1",
          updatedAt: new Date(),
          applicants: [vollstaendigerAntragsteller("c1@example.com")],
          ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
        },
        {
          id: "c2-bogen-ausgefuellt",
          caseNumber: "UP-0002",
          status: "unterlagen_fehlen",
          erstkontaktMessageId: "msg-2",
          updatedAt: new Date(),
          applicants: [vollstaendigerAntragsteller("c2@example.com")],
          ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
        },
        {
          id: "c3-kein-link",
          caseNumber: "UP-0003",
          status: "unterlagen_fehlen",
          erstkontaktMessageId: "msg-3",
          updatedAt: new Date(),
          applicants: [vollstaendigerAntragsteller("c3@example.com")],
          ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
        },
      ]);
    }
    // followupRows
    return Promise.resolve([]);
  });
});

describe("getDashboardData – Selbstauskunfts-Signal (ladeSelbstauskunftStandBatch)", () => {
  it("zeigt 'Selbstauskunft nachfassen' für einen Fall mit gültigem, ungeöffnetem Link", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([
      {
        caseId: "c1-link-unbearbeitet",
        id: "link-1",
        active: true,
        expiresAt: MORGEN,
        createdAt: VOR_5_TAGEN,
        disclosure: null,
      },
    ]);

    const data = await getDashboardData("org-1");
    const todo = data.todos.find((t) => t.caseId === "c1-link-unbearbeitet");
    expect(todo?.nextStep).toBe("Selbstauskunft nachfassen");
  });

  it("zeigt KEIN Nachfass-Signal für einen Fall mit bereits eingegangenem (ausgefülltem) Bogen", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([
      {
        caseId: "c2-bogen-ausgefuellt",
        id: "link-2",
        active: true,
        expiresAt: MORGEN,
        createdAt: VOR_5_TAGEN,
        disclosure: {
          currentStep: "zusammenfassung",
          answers: {},
          submittedAt: new Date(),
          takenOverAt: null,
        },
      },
    ]);

    const data = await getDashboardData("org-1");
    const todo = data.todos.find((t) => t.caseId === "c2-bogen-ausgefuellt");
    expect(todo?.nextStep).not.toBe("Selbstauskunft nachfassen");
    expect(todo?.nextStep).toBe("Selbstauskunft prüfen & übernehmen");
  });

  it("zeigt KEIN Nachfass-Signal für einen Fall ohne jeden Link", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([]);

    const data = await getDashboardData("org-1");
    const todo = data.todos.find((t) => t.caseId === "c3-kein-link");
    expect(todo?.nextStep).not.toBe("Selbstauskunft nachfassen");
  });

  it("lädt den Selbstauskunfts-Stand für alle Kandidaten in EINER Abfrage (Batch statt N Einzelabfragen)", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([]);
    await getDashboardData("org-1");
    expect(selfDisclosureLinkFindMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * A4 (Schlusspruefung 12.08.2026): `computeNextStep` bekam im Dashboard kein
 * `erstgespraech` – derselbe Fall zeigte auf der Fallseite "Erstgespräch
 * führen", auf dem Dashboard aber etwas anderes, weil dort der Block einfach
 * fehlte. Der Fix reicht denselben Stand durch wie Fallseite und Review-Seite:
 * dieselbe Zaehlregel (`berechneReife`, Antragstellerzahl auf 1..MAX_APPLICANTS
 * geklemmt) – dafuer muss der Batch auch `property` und `financingRequest`
 * laden, die vorher im Include fehlten.
 */
describe("getDashboardData – Erstgespraech-Stufe in der Fallreise (A4)", () => {
  function kandidatMitOffenemErstgespraech(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "c-erstgespraech-offen",
      caseNumber: "UP-0099",
      status: "unterlagen_fehlen",
      erstkontaktMessageId: "msg-1",
      financingType: null,
      updatedAt: new Date(),
      applicants: [applicant("kunde@example.com")],
      property: null,
      financingRequest: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    selfDisclosureLinkFindMany.mockReset().mockResolvedValue([]);
  });

  it("zeigt 'Erstgespräch führen', wenn nichts anderes vorrangig ist – wie auf der Fallseite", async () => {
    caseFindMany.mockReset().mockImplementation((args: { include?: unknown }) => {
      if (args.include) return Promise.resolve([kandidatMitOffenemErstgespraech()]);
      return Promise.resolve([]);
    });

    const data = await getDashboardData("org-1");
    const todo = data.todos.find((t) => t.caseId === "c-erstgespraech-offen");
    expect(todo?.nextStep).toBe("Erstgespräch führen");
  });

  it("lädt property und financingRequest für die Kandidaten (gleiche Zaehlregel wie die Fallseite)", async () => {
    caseFindMany.mockReset().mockImplementation((args: { include?: unknown }) => {
      if (args.include) return Promise.resolve([kandidatMitOffenemErstgespraech()]);
      return Promise.resolve([]);
    });

    await getDashboardData("org-1");
    const todoCall = caseFindMany.mock.calls.find(
      (call) => (call[0] as { include?: Record<string, unknown> }).include
    );
    const include = (todoCall?.[0] as { include?: Record<string, unknown> } | undefined)?.include;
    expect(include?.property).toBeTruthy();
    expect(include?.financingRequest).toBeTruthy();
  });
});
