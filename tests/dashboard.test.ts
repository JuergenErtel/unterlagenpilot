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
 * Ein Antragsteller, bei dem alle 26 Angaben aus `berechneReife` stehen –
 * inklusive der VERSCHACHTELTEN Listen `employment` und `income`, an denen
 * fünf der neun Je-Person-Angaben hängen (beschaeftigungsart, inProbezeit,
 * befristet, nettoMonatlich, sonstigeEinnahmen).
 *
 * Wichtig: Diese Vorrichtung ist nur die ROHZEILE. Was `getDashboardData`
 * davon zu sehen bekommt, entscheidet `projiziere()` anhand des tatsächlichen
 * `include` der Abfrage – sonst prüfte der Test gegen Daten, die die echte
 * Abfrage nie lädt (genau der Fehler, an dem der erste Anlauf unbemerkt
 * vorbeilief, siehe A4 vom 13.08.2026).
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

/** Objekt- und Vorhabendaten, mit denen die Erstgespräch-Reife auf 0 offene Angaben kommt. */
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

/**
 * Bildet nach, was Prisma tatsächlich zurückgibt: NUR die Relationen, die im
 * `include` stehen. Ein Mock, der stur alles liefert, macht jeden Test grün,
 * auch wenn die Abfrage die Daten nie anfordert – dann zählt `berechneReife`
 * in der echten Anwendung fünf Angaben je Antragsteller dauerhaft als offen
 * und das Dashboard behauptet für praktisch jeden Fall „Erstgespräch führen".
 */
function projiziere(row: Record<string, unknown>, include: Record<string, unknown> | undefined) {
  const { applicants, property, financingRequest, ...rest } = row as {
    applicants?: Array<Record<string, unknown>>;
    property?: unknown;
    financingRequest?: unknown;
  } & Record<string, unknown>;
  const applicantsInclude =
    ((include?.applicants as { include?: Record<string, unknown> } | undefined)?.include ?? {}) as Record<string, unknown>;

  const projected: Record<string, unknown> = {
    ...rest,
    applicants: (applicants ?? []).map((a) => {
      const { employment, income, ...applicantRest } = a as {
        employment?: unknown;
        income?: unknown;
      } & Record<string, unknown>;
      const out: Record<string, unknown> = { ...applicantRest };
      if (applicantsInclude.employment) out.employment = employment;
      if (applicantsInclude.income) out.income = income;
      return out;
    }),
  };
  if (include?.property) projected.property = property;
  if (include?.financingRequest) projected.financingRequest = financingRequest;
  return projected;
}

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

  caseFindMany.mockReset().mockImplementation((args: { include?: Record<string, unknown> }) => {
    if (args.include) {
      // todoCandidates. Bewusst mit vollständigem Erstgespräch: Diese Fälle
      // prüfen das Selbstauskunfts-Signal, das in der Prioritätsleiter UNTER
      // der Erstgespräch-Stufe steht – mit offenen Angaben verdeckte das
      // Erstgespräch genau die Stufe, um die es hier geht.
      return Promise.resolve(
        [
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
        ].map((row) => projiziere(row, args.include))
      );
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
 * A4 (13.08.2026): `computeNextStep` bekam im Dashboard kein `erstgespraech` –
 * derselbe Fall zeigte auf der Fallseite „Erstgespräch führen", auf dem
 * Dashboard aber etwas anderes. Ausgerechnet auf der Seite, die zuerst
 * angesehen wird.
 *
 * Ein erster Anlauf reichte den Stand zwar durch, lud aber nur `property` und
 * `financingRequest` nach – NICHT die verschachtelten Listen `employment` und
 * `income` an den Antragstellern. Damit galten fünf Angaben je Antragsteller
 * dauerhaft als offen, `offeneAngaben` wurde nie 0, und das Dashboard hätte
 * für praktisch jeden Fall „Erstgespräch führen" gezeigt – der Widerspruch
 * wäre nicht behoben, sondern umgedreht worden. Die Tests unten prüfen
 * deshalb die TATSÄCHLICH abgefragten Includes und einen vollständigen Fall.
 */
describe("getDashboardData – Erstgespräch-Stufe der Fallreise (A4)", () => {
  function kandidat(overrides: Record<string, unknown> = {}) {
    return {
      id: "c-erstgespraech",
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

  function nurDiesenFall(row: Record<string, unknown>) {
    caseFindMany.mockReset().mockImplementation((args: { include?: Record<string, unknown> }) => {
      if (args.include) return Promise.resolve([projiziere(row, args.include)]);
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    selfDisclosureLinkFindMany.mockReset().mockResolvedValue([]);
    generatedMessageFindMany.mockReset().mockResolvedValue([{ id: "msg-1", sent: true }]);
  });

  it("fragt für die To-do-Kandidaten genau dieselben Relationen ab wie die Fallseite und die Review-Seite", async () => {
    nurDiesenFall(kandidat());
    await getDashboardData("org-1");

    const todoCall = caseFindMany.mock.calls.find(
      (call) => (call[0] as { include?: Record<string, unknown> }).include
    );
    const include = (todoCall?.[0] as { include: Record<string, unknown> }).include;

    // Ohne employment/income zählt berechneReife fünf Angaben je Antragsteller
    // dauerhaft als offen – die Abfrage MUSS sie mitladen.
    expect(include.applicants).toEqual({
      orderBy: { position: "asc" },
      include: {
        employment: { orderBy: { createdAt: "asc" } },
        income: { orderBy: { createdAt: "asc" } },
      },
    });
    expect(include.property).toBe(true);
    expect(include.financingRequest).toBe(true);
  });

  it("zeigt 'Erstgespräch führen', solange Angaben für ein Angebot fehlen – wie auf der Fallseite", async () => {
    nurDiesenFall(kandidat());

    const data = await getDashboardData("org-1");
    expect(data.todos.find((t) => t.caseId === "c-erstgespraech")?.nextStep).toBe("Erstgespräch führen");
  });

  it("zeigt für einen Fall mit vollständigen Angaben KEIN 'Erstgespräch führen'", async () => {
    nurDiesenFall(
      kandidat({
        applicants: [vollstaendigerAntragsteller("kunde@example.com")],
        ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
      })
    );

    const data = await getDashboardData("org-1");
    const todo = data.todos.find((t) => t.caseId === "c-erstgespraech");
    expect(todo).toBeDefined();
    expect(todo?.nextStep).not.toBe("Erstgespräch führen");
  });
});
