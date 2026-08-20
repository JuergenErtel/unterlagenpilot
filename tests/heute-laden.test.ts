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
const aufgabeErledigtFindMany = vi.fn();

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
    aufgabeErledigt: {
      findMany: (...a: unknown[]) => aufgabeErledigtFindMany(...a),
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

import { ladeHeute } from "@/lib/cases/heute-daten";

const VOR_5_TAGEN = new Date(Date.now() - 5 * 86_400_000);
const VOR_30_TAGEN = new Date(Date.now() - 30 * 86_400_000);
const MORGEN = new Date(Date.now() + 86_400_000);

/**
 * Kontaktvermerk "erreicht" – macht `kontaktStand(...).jeErreicht` wahr und
 * haelt so `kontakt_aufnehmen` aus Fixtures heraus, die eine TIEFERE Stufe
 * der Leiter pruefen (Selbstauskunft, Erstgespräch, KI-Stale-Schutz). Ohne
 * das wuerde seit Aufgabe 7 JEDER frisch angelegte Testfall (kein Vermerk,
 * `createdAt` = jetzt) faellig fuer den Anruf sein und diese Tests verdecken.
 */
function bereitsErreicht() {
  return [{ ergebnis: "erreicht" as const, createdAt: VOR_30_TAGEN }];
}

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
 * Wichtig: Diese Vorrichtung ist nur die ROHZEILE. Was `ladeHeute`
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
    sondertilgungProzentJaehrlich: 5,
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
  const { applicants, property, financingRequest, caseNotes, customer, ...rest } = row as {
    applicants?: Array<Record<string, unknown>>;
    property?: unknown;
    financingRequest?: unknown;
    caseNotes?: unknown;
    customer?: unknown;
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
  // caseNotes/customer speisen seit Aufgabe 7 den Kontaktstand
  // (kontaktStand/kontakt.ts) – nur weiterreichen, wenn die Abfrage sie
  // tatsaechlich anfordert, sonst wuerde ein vergessenes Include hier
  // unbemerkt durchrutschen (dieselbe Falle wie bei employment/income, A4).
  if (include?.caseNotes) projected.caseNotes = caseNotes;
  if (include?.customer) projected.customer = customer;
  /*
   * Termine, Bank-Nachforderungen und bereits gesetzte Haken speisen seit dem
   * 16.08.2026 die Dringlichkeit der Heute-Liste. Auch hier gilt die Regel von
   * oben: nur weiterreichen, wenn die Abfrage sie anfordert. Der Rückfall auf
   * leere Werte spart es, jede einzelne Vorrichtung anzufassen – eine Frist
   * oder ein Haken muss ausdrücklich gesetzt werden, um zu wirken.
   */
  if (include?.deadlines) projected.deadlines = (row.deadlines as unknown[]) ?? [];
  if (include?._count) projected._count = row._count ?? { missingRequests: 0 };
  if (include?.erledigteAufgaben) {
    projected.erledigteAufgaben = (row.erledigteAufgaben as unknown[]) ?? [];
  }
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
  aufgabeErledigtFindMany.mockReset().mockResolvedValue([]);
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
            createdAt: VOR_30_TAGEN,
            wiedervorlage: null,
            verlorenAm: null,
            caseNotes: bereitsErreicht(),
            customer: null,
            applicants: [vollstaendigerAntragsteller("c1@example.com")],
            ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
          },
          {
            id: "c2-bogen-ausgefuellt",
            caseNumber: "UP-0002",
            status: "unterlagen_fehlen",
            erstkontaktMessageId: "msg-2",
            updatedAt: new Date(),
            createdAt: VOR_30_TAGEN,
            wiedervorlage: null,
            verlorenAm: null,
            caseNotes: bereitsErreicht(),
            customer: null,
            applicants: [vollstaendigerAntragsteller("c2@example.com")],
            ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
          },
          {
            id: "c3-kein-link",
            caseNumber: "UP-0003",
            status: "unterlagen_fehlen",
            erstkontaktMessageId: "msg-3",
            updatedAt: new Date(),
            createdAt: VOR_30_TAGEN,
            wiedervorlage: null,
            verlorenAm: null,
            caseNotes: bereitsErreicht(),
            customer: null,
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

describe("ladeHeute – Selbstauskunfts-Signal (ladeSelbstauskunftStandBatch)", () => {
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

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c1-link-unbearbeitet");
    expect(todo?.titel).toBe("Selbstauskunft nachfassen");
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

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c2-bogen-ausgefuellt");
    expect(todo?.titel).not.toBe("Selbstauskunft nachfassen");
    expect(todo?.titel).toBe("Selbstauskunft prüfen & übernehmen");
  });

  it("zeigt KEIN Nachfass-Signal für einen Fall ohne jeden Link", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([]);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c3-kein-link");
    expect(todo?.titel).not.toBe("Selbstauskunft nachfassen");
  });

  it("lädt den Selbstauskunfts-Stand für alle Kandidaten in EINER Abfrage (Batch statt N Einzelabfragen)", async () => {
    selfDisclosureLinkFindMany.mockResolvedValue([]);
    await ladeHeute("org-1");
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
describe("ladeHeute – Erstgespräch-Stufe der Fallreise (A4)", () => {
  function kandidat(overrides: Record<string, unknown> = {}) {
    return {
      id: "c-erstgespraech",
      caseNumber: "UP-0099",
      status: "unterlagen_fehlen",
      erstkontaktMessageId: "msg-1",
      financingType: null,
      updatedAt: new Date(),
      createdAt: VOR_30_TAGEN,
      wiedervorlage: null,
      verlorenAm: null,
      // Bereits erreicht: sonst waere seit Aufgabe 7 JEDER frische Testfall
      // (kein Vermerk) faellig fuer `kontakt_aufnehmen` und verdeckte die
      // Erstgespraech-Stufe, um die es in diesem Block geht.
      caseNotes: bereitsErreicht(),
      customer: null,
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
    await ladeHeute("org-1");

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
    // Seit Aufgabe 7 speist die Abfrage den Kontaktstand (kontaktStand):
    // Ohne caseNotes/customer bliebe c.caseNotes undefined und der Aufruf
    // kraeche, sobald die Next-Step-Engine kontaktStand gerufen bekommt.
    expect(include.caseNotes).toEqual({
      where: { ergebnis: { not: null } },
      select: { ergebnis: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    expect(include.customer).toEqual({ select: { phone: true } });
  });

  it("zeigt 'Erstgespräch führen', solange Angaben für ein Angebot fehlen – wie auf der Fallseite", async () => {
    nurDiesenFall(kandidat());

    const data = await ladeHeute("org-1");
    expect(data.aufgaben.find((t) => t.caseId === "c-erstgespraech")?.titel).toBe("Erstgespräch führen");
  });

  it("zeigt für einen Fall mit vollständigen Angaben KEIN 'Erstgespräch führen'", async () => {
    nurDiesenFall(
      kandidat({
        applicants: [vollstaendigerAntragsteller("kunde@example.com")],
        ...VOLLSTAENDIGES_OBJEKT_UND_VORHABEN,
      })
    );

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-erstgespraech");
    expect(todo).toBeDefined();
    expect(todo?.titel).not.toBe("Erstgespräch führen");
  });
});

/**
 * Aufgabe 7: Die To-do-Kandidaten laden seit hier die Kontaktvermerke und die
 * Wiedervorlage und rechnen daraus den Kontaktstand (kontaktStand,
 * kontakt.ts), bevor sie die Prioritätsleiter fragen – vorher kannte kein
 * Aufrufer die neue Kontaktsprosse. Faellige Kontaktschritte stehen danach
 * ganz oben in der To-do-Liste, auch vor einem besseren Reifegrad.
 */
describe("ladeHeute – Kontaktstand speist die Prioritätsleiter (Aufgabe 7)", () => {
  function mehrereFaelle(rows: Array<Record<string, unknown>>) {
    caseFindMany.mockReset().mockImplementation((args: { include?: Record<string, unknown> }) => {
      if (args.include) return Promise.resolve(rows.map((row) => projiziere(row, args.include)));
      return Promise.resolve([]);
    });
  }

  /** Frischer Lead: kein Kontaktvermerk, Erstkontakt nicht versendet. */
  function frischerLead(overrides: Record<string, unknown> = {}) {
    return {
      id: "c-frischer-lead",
      caseNumber: "UP-0201",
      status: "neu",
      erstkontaktMessageId: null,
      financingType: null,
      updatedAt: new Date(),
      createdAt: new Date(),
      wiedervorlage: null,
      verlorenAm: null,
      caseNotes: [],
      customer: null,
      applicants: [applicant("frisch@example.com")],
      property: null,
      financingRequest: null,
      ...overrides,
    };
  }

  /** Bereits erreichter Fall mit einem pruefbereiten Dokument – rangiert unter den Kontaktschritten. */
  function falleMitDokument(overrides: Record<string, unknown> = {}) {
    return {
      id: "c-mit-dokument",
      caseNumber: "UP-0202",
      status: "unterlagen_fehlen",
      erstkontaktMessageId: "msg-erreicht",
      financingType: null,
      updatedAt: new Date(),
      createdAt: VOR_30_TAGEN,
      wiedervorlage: null,
      verlorenAm: null,
      caseNotes: bereitsErreicht(),
      customer: null,
      applicants: [applicant("erreicht@example.com")],
      property: null,
      financingRequest: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    selfDisclosureLinkFindMany.mockReset().mockResolvedValue([]);
    generatedMessageFindMany.mockReset().mockResolvedValue([{ id: "msg-erreicht", sent: true }]);
  });

  it("nennt fuer einen frischen Lead ohne Kontaktversuch das Anrufen", async () => {
    mehrereFaelle([frischerLead()]);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-frischer-lead");
    expect(todo?.titel).toBe("Kunden anrufen");
  });

  /**
   * Der Stichtag (KONTAKT_START_AB, Vorgabe 2026-08-15). Ein Bestandsfall aus
   * dem Juli hat NIE einen "erreicht"-Vermerk – die Spalte entstand erst mit
   * diesem Zweig. Ohne den Schnitt waere am Tag des Deploys jeder aktive Fall
   * "Kunden anrufen — Der Lead ist frisch", und das Dashboard sortierte
   * praktisch alles nach oben.
   */
  it("laesst Bestandsfaelle von vor dem Stichtag unberuehrt – kein Anruf-Schritt", async () => {
    mehrereFaelle([
      frischerLead({
        id: "c-bestandsfall",
        caseNumber: "UP-0200",
        createdAt: new Date("2026-07-16T09:00:00Z"),
      }),
    ]);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-bestandsfall");
    expect(todo).toBeDefined();
    expect(todo?.titel).not.toBe("Kunden anrufen");
  });

  it("sortiert faellige Kontaktschritte nach oben – auch vor einem besseren Reifegrad", async () => {
    mehrereFaelle([frischerLead(), falleMitDokument()]);
    documentFindMany.mockReset().mockResolvedValue([
      {
        caseId: "c-mit-dokument",
        reviewStatus: "offen",
        classificationStatus: "fertig",
        extractionStatus: "fertig",
        updatedAt: new Date(),
      },
    ]);
    // Der frische Lead hat den BESSEREN (hoeheren) Reifegrad – eine reine
    // Score-Sortierung wuerde ihn nach hinten stellen. Erst die zweistufige
    // Sortierung (Kontaktschritte zuerst) holt ihn trotzdem nach vorn.
    getCaseAggregate.mockReset().mockImplementation((id: string) =>
      Promise.resolve({
        ...leereAggregation(id),
        readiness: {
          score: id === "c-frischer-lead" ? 90 : 5,
          band: "fast",
          label: "",
          mandatoryOpen: 0,
          mandatoryTotal: 0,
        },
      })
    );

    const data = await ladeHeute("org-1");
    expect(data.aufgaben[0]?.caseId).toBe("c-frischer-lead");
  });
});

/**
 * Der Stale-Schutz gegen hängengebliebene KI-Prüfungen (isAiCheckStale,
 * next-step.ts) existierte bislang NUR auf der Fallseite: Stirbt ein
 * Hintergrundlauf hart (Deploy, Function-Timeout), zeigte die Fallseite "KI-
 * Prüfung wurde unterbrochen", während dasselbe Dashboard-Todo für immer bei
 * "KI-Prüfung läuft" stehen blieb – derselbe Fall, zwei Aussagen.
 */
describe("ladeHeute – Stale-Schutz für hängengebliebene KI-Prüfungen", () => {
  function nurDiesenFall(row: Record<string, unknown>) {
    caseFindMany.mockReset().mockImplementation((args: { include?: Record<string, unknown> }) => {
      if (args.include) return Promise.resolve([projiziere(row, args.include)]);
      return Promise.resolve([]);
    });
  }

  function ki_pruefung_kandidat(overrides: Record<string, unknown> = {}) {
    return {
      id: "c-ki-stale",
      caseNumber: "UP-0077",
      status: "ki_pruefung_laeuft",
      erstkontaktMessageId: null,
      financingType: null,
      updatedAt: new Date(),
      createdAt: VOR_30_TAGEN,
      wiedervorlage: null,
      verlorenAm: null,
      // Der KI-Lauf gewinnt in jedem Test dieses Blocks vor der Kontaktstufe
      // (next-step.ts prüft ki_laeuf/ki_fehler zuerst) – der Vermerk ist hier
      // nur noetig, damit kontaktStand() nicht auf ein fehlendes caseNotes
      // stoesst.
      caseNotes: [],
      customer: null,
      applicants: [],
      property: null,
      financingRequest: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    selfDisclosureLinkFindMany.mockReset().mockResolvedValue([]);
    generatedMessageFindMany.mockReset().mockResolvedValue([]);
  });

  it("zeigt 'KI-Prüfung läuft' für einen frischen Lauf", async () => {
    nurDiesenFall(ki_pruefung_kandidat({ updatedAt: new Date() }));

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-ki-stale");
    expect(todo?.titel).toBe("KI-Prüfung läuft");
  });

  it("zeigt 'KI-Prüfung wurde unterbrochen' statt endlos 'KI-Prüfung läuft', wenn der Lauf laut updatedAt hängengeblieben ist – wie auf der Fallseite", async () => {
    nurDiesenFall(
      ki_pruefung_kandidat({ updatedAt: new Date(Date.now() - 11 * 60_000) })
    );

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-ki-stale");
    expect(todo?.titel).toBe("KI-Prüfung wurde unterbrochen");
  });

  /*
   * Der Sammel-Lauf `runAiCheck` ist der SELTENERE der beiden Auslöser für
   * "KI-Prüfung läuft". Der häufigere ist der normale Upload: Die Pipeline
   * (`runPipelineAfterStore`) setzt `classificationStatus: "laeuft"` je
   * Dokument und fasst den Fallstatus NIE an. Ein Stale-Schutz, der nur am
   * Fallstatus hängt, hält deshalb jeden frischen Einzel-Upload für
   * unterbrochen – bei genau der Aktion, die in dieser App am häufigsten
   * vorkommt.
   */
  function laufendesDokument(alterMs: number) {
    documentFindMany.mockReset().mockResolvedValue([
      {
        caseId: "c-ki-stale",
        reviewStatus: "offen",
        classificationStatus: "laeuft",
        extractionStatus: "laeuft",
        updatedAt: new Date(Date.now() - alterMs),
      },
    ]);
  }

  it("nennt einen frischen Einzel-Upload 'KI-Prüfung läuft' – auch wenn der Fallstatus unberührt bleibt", async () => {
    nurDiesenFall(
      ki_pruefung_kandidat({ status: "unterlagen_fehlen", updatedAt: new Date(Date.now() - 60 * 60_000) })
    );
    laufendesDokument(30_000);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-ki-stale");
    expect(todo?.titel).toBe("KI-Prüfung läuft");
  });

  it("meldet einen gestorbenen Einzel-Upload als 'ohne KI-Ergebnis' – der Neustart-Weg darf nicht verschwinden", async () => {
    nurDiesenFall(
      ki_pruefung_kandidat({ status: "unterlagen_fehlen", updatedAt: new Date(Date.now() - 60 * 60_000) })
    );
    laufendesDokument(11 * 60_000);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-ki-stale");
    /*
     * Bewusst die STUFE geprüft, nicht nur die Abwesenheit von "läuft": Ein
     * Dokument, das nach einem harten Abbruch für immer auf "laeuft"
     * stehenbleibt (pipeline.ts setzt "fehler" nur bei erreichtem Code, ein
     * Aufräum-Cron existiert nicht), fiele sonst durch jedes Raster – aus
     * docsLaufend (altersbereinigt), aus der Review-Liste (filtert auf
     * "fertig") und damit aus der Leiter. Die Fallseite nennte irgendeinen
     * anderen Schritt, ohne den Knopf "KI-Prüfung wiederholen", das
     * Review-Center meldete "Alles freigegeben" und das Fallbild 100 %.
     * Ein "not.toBe('KI-Prüfung läuft')" wäre dabei grün geblieben.
     */
    expect(todo?.titel).toBe("1 Dokument ohne KI-Ergebnis");
  });

  it("bleibt bei einem hängengebliebenen Sammel-Lauf 'unterbrochen', auch wenn Dokumente auf 'laeuft' stehengeblieben sind", async () => {
    nurDiesenFall(
      ki_pruefung_kandidat({ updatedAt: new Date(Date.now() - 11 * 60_000) })
    );
    laufendesDokument(11 * 60_000);

    const data = await ladeHeute("org-1");
    const todo = data.aufgaben.find((t) => t.caseId === "c-ki-stale");
    expect(todo?.titel).toBe("KI-Prüfung wurde unterbrochen");
  });
});
