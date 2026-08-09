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
          applicants: [applicant("c1@example.com")],
        },
        {
          id: "c2-bogen-ausgefuellt",
          caseNumber: "UP-0002",
          status: "unterlagen_fehlen",
          erstkontaktMessageId: "msg-2",
          updatedAt: new Date(),
          applicants: [applicant("c2@example.com")],
        },
        {
          id: "c3-kein-link",
          caseNumber: "UP-0003",
          status: "unterlagen_fehlen",
          erstkontaktMessageId: "msg-3",
          updatedAt: new Date(),
          applicants: [applicant("c3@example.com")],
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
