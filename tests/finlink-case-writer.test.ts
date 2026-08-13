import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe.runIf(RUN)("createCaseFromCanonical (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const { PrismaPGlite } = await import("pglite-prisma-adapter");
    const { PrismaClient } = await import("@prisma/client");
    const pg = new PGlite();
    await pg.exec(ddl);
    const adapter = new PrismaPGlite(pg as any);
    prisma = new PrismaClient({ adapter } as any);
    g.prisma = prisma; // Injektion für @/lib/db-Singleton (vor erstem Import von @/lib/db)

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg" } });
    orgId = org.id;
    const user = await prisma.user.create({
      data: { organizationId: orgId, name: "Tester", email: "t@example.com", role: "vermittler", active: true },
    });
    userId = user.id;
  });

  it("legt einen Fall mit Antragstellern, Objekt und Finanzierung an", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const res = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        financingType: "kauf",
        applicants: [{ position: 1, vorname: "Anna", nachname: "Muster", familienstand: "verheiratet" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME" }],
        income: [{ applicantPosition: 1, nettoMonatlich: 3200 }],
        liabilities: [],
        assets: [],
        property: { objektart: "eigentumswohnung", ort: "Karlsruhe" },
        financing: { finanzierungsart: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
        platformIds: { finlinkId: "FL-1" },
      }
    );
    expect(res.deduped).toBe(false);
    expect(res.caseNumber).toMatch(/^UP-\d{4}-\d{4}$/);

    const row = await prisma.case.findUnique({
      where: { id: res.caseId },
      include: { applicants: { include: { employment: true, income: true } }, property: true, financingRequest: true },
    });
    expect(row.finlinkId).toBe("FL-1");
    expect(row.organizationId).toBe(orgId);
    expect(row.applicants).toHaveLength(1);
    expect(row.applicants[0].employment[0].arbeitgeber).toBe("ACME");
    expect(row.applicants[0].income[0].nettoMonatlich).toBe(3200);
    expect(row.property.objektart).toBe("eigentumswohnung");
    expect(row.financingRequest.kaufpreis).toBe(450000);
  });

  it("fillCaseFromCanonical füllt nur leere Felder und legt fehlende Antragsteller an", async () => {
    const { createCaseFromCanonical, fillCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const created = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        applicants: [{ position: 1, vorname: "Laura", nachname: "Alt" }],
        employment: [],
        income: [],
        liabilities: [],
        assets: [],
        financing: {},
        platformIds: { finlinkId: "FL-REFRESH" },
      } as any
    );

    const res = await fillCaseFromCanonical(created.caseId, {
      caseNumber: "",
      financingType: "kauf",
      applicants: [
        // Position 1: nachname anders (darf NICHT überschrieben werden), geburtsdatum neu (leer → füllen)
        { position: 1, vorname: "Laura", nachname: "Neu", geburtsdatum: "1990-04-29", familienstand: "verheiratet" },
        // Position 2: existiert nicht → anlegen
        { position: 2, vorname: "Thomas", nachname: "Neu", geburtsdatum: "1989-10-24" },
      ],
      employment: [
        { applicantPosition: 1, beschaeftigungsart: "angestellter" },
        { applicantPosition: 2, beschaeftigungsart: "beamter" },
      ],
      income: [{ applicantPosition: 1, nettoMonatlich: 8050 }],
      liabilities: [],
      assets: [],
      property: { ort: "Pfungstadt" },
      financing: { kaufpreis: 489000 },
      platformIds: { finlinkId: "FL-REFRESH" },
    } as any);

    expect(res.createdApplicants).toBe(1);
    expect(res.filledFields).toContain("geburtsdatum (Antragsteller 1)");
    expect(res.filledFields).not.toContain("nachname (Antragsteller 1)");

    const row = await prisma.case.findUnique({
      where: { id: created.caseId },
      include: { applicants: { include: { employment: true, income: true }, orderBy: { position: "asc" } }, property: true, financingRequest: true },
    });
    expect(row.applicants).toHaveLength(2);
    expect(row.applicants[0].nachname).toBe("Alt"); // nie überschreiben
    expect(row.applicants[0].geburtsdatum?.toISOString().slice(0, 10)).toBe("1990-04-29");
    expect(row.applicants[0].familienstand).toBe("verheiratet");
    expect(row.applicants[0].employment[0]?.beschaeftigungsart).toBe("angestellter");
    expect(row.applicants[0].income[0]?.nettoMonatlich).toBe(8050);
    expect(row.applicants[1].vorname).toBe("Thomas");
    expect(row.applicants[1].employment[0]?.beschaeftigungsart).toBe("beamter");
    expect(row.property?.city).toBe("Pfungstadt");
    expect(row.financingRequest?.kaufpreis).toBe(489000);
    expect(row.financingType).toBe("kauf");

    // Zweiter Lauf: idempotent, nichts mehr zu tun.
    const res2 = await fillCaseFromCanonical(created.caseId, {
      caseNumber: "",
      applicants: [{ position: 1, nachname: "NochNeuer" }],
      employment: [], income: [], liabilities: [], assets: [], financing: {},
      platformIds: { finlinkId: "FL-REFRESH" },
    } as any);
    expect(res2.createdApplicants).toBe(0);
    expect(res2.filledFields).toHaveLength(0);
  });

  it("zieht 'befristet' automatisch auf true, wenn 'Aus FinLink aktualisieren' ein Vertragsende nachtraegt", async () => {
    // Realer Ablauf (Fund der Pruefung vom 13.08.2026): Ein bestehender
    // Beschaeftigungssatz hat kein Vertragsende. Der Vermittler drueckt "Aus
    // FinLink aktualisieren", und FinLink liefert diesmal ein end_date. Die
    // generische fuelle()-Pruefung ("nur wenn leer") zieht befristetBis nach,
    // kann aber befristet (NOT NULL, Vorgabe false) nicht anfassen – ohne
    // gezielte Kopplung widerspraeche der Datensatz sich selbst: ein Datum
    // steht, aber "befristet" bliebe false.
    const { createCaseFromCanonical, fillCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const created = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        applicants: [{ position: 1, vorname: "Nora", nachname: "Befrist" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME" }],
        income: [],
        liabilities: [],
        assets: [],
        financing: {},
        platformIds: { finlinkId: "FL-BEFRISTET" },
      } as any
    );

    const vorher = await prisma.case.findUnique({
      where: { id: created.caseId },
      include: { applicants: { include: { employment: true } } },
    });
    expect(vorher.applicants[0].employment[0].befristetBis).toBeNull();
    expect(vorher.applicants[0].employment[0].befristet).toBe(false);

    const res = await fillCaseFromCanonical(created.caseId, {
      caseNumber: "",
      applicants: [{ position: 1 }],
      employment: [{ applicantPosition: 1, befristetBis: "2027-06-30" }],
      income: [],
      liabilities: [],
      assets: [],
      financing: {},
      platformIds: { finlinkId: "FL-BEFRISTET" },
    } as any);

    expect(res.filledFields).toContain("befristetBis (Antragsteller 1)");
    expect(res.filledFields).toContain("befristet (Antragsteller 1)");

    const nachher = await prisma.case.findUnique({
      where: { id: created.caseId },
      include: { applicants: { include: { employment: true } } },
    });
    expect(nachher.applicants[0].employment[0].befristetBis?.toISOString().slice(0, 10)).toBe("2027-06-30");
    expect(nachher.applicants[0].employment[0].befristet).toBe(true);
  });

  it("laesst 'befristet' unangetastet, wenn kein neues Vertragsende nachgezogen wird", async () => {
    // Umkehrschluss der Kopplung: Ein vom Vermittler von Hand gesetztes
    // "befristet: true" ohne Datum darf nicht zurueckfallen, nur weil
    // FinLink diesmal kein Vertragsende liefert.
    const { createCaseFromCanonical, fillCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const created = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        applicants: [{ position: 1, vorname: "Kai", nachname: "Handgesetzt" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter" }],
        income: [],
        liabilities: [],
        assets: [],
        financing: {},
        platformIds: { finlinkId: "FL-HANDGESETZT" },
      } as any
    );
    const satz = await prisma.employmentRecord.findFirst({ where: { applicant: { caseId: created.caseId } } });
    await prisma.employmentRecord.update({ where: { id: satz.id }, data: { befristet: true } });

    await fillCaseFromCanonical(created.caseId, {
      caseNumber: "",
      applicants: [{ position: 1 }],
      employment: [{ applicantPosition: 1, arbeitgeber: "Neue Firma GmbH" }],
      income: [],
      liabilities: [],
      assets: [],
      financing: {},
      platformIds: { finlinkId: "FL-HANDGESETZT" },
    } as any);

    const nachher = await prisma.employmentRecord.findFirst({ where: { applicant: { caseId: created.caseId } } });
    expect(nachher.arbeitgeber).toBe("Neue Firma GmbH");
    expect(nachher.befristet).toBe(true);
  });

  it("dedupliziert bei gleicher finlinkId in derselben Organisation", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const base = {
      caseNumber: "", applicants: [{ position: 1, vorname: "Dup" }],
      employment: [], income: [], liabilities: [], assets: [],
      financing: {}, platformIds: { finlinkId: "FL-DUP" },
    } as const;
    const first = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    const second = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    expect(second.deduped).toBe(true);
    expect(second.caseId).toBe(first.caseId);
    const count = await prisma.case.count({ where: { organizationId: orgId, finlinkId: "FL-DUP" } });
    expect(count).toBe(1);
  });
});

describe("Namen aus fremden Systemen", () => {
  // Bewusst per dynamischem import (statt eines statischen Imports am
  // Dateianfang): Ein statischer Import von case-writer.ts laedt das Modul
  // schon beim Einsammeln der Testdatei – VOR dem beforeAll() oben, das erst
  // @/lib/db auf die PGlite-Instanz umbiegt. case-writer.ts liest "prisma"
  // aus @/lib/db beim ERSTEN Laden fest ein; ein zu frueher Import haette
  // ihn unbemerkt an den echten (PROD-)Client gebunden statt an PGlite, und
  // die DB-Integrationstests oben waeren an einem Fremdschluessel-Fehler
  // gescheitert, der mit ihrer eigentlichen Aussage nichts zu tun hat.
  it("schneidet Leerraum ab – FinLink liefert 'Mohammad ' mit angehaengtem Leerzeichen", async () => {
    // Gemessen am Fall UP-2026-0007: vorname "[Mohammad ]", nachname
    // "[Lahwani ]". Die Anrede baut "Hallo ${Name}," – daraus wurde
    // "Hallo Mohammad  Lahwani ,". Betrifft Anrede, Dateinamen und Bank-PDFs.
    const { sauberName } = await import("@/lib/platforms/case-writer");
    expect(sauberName("Mohammad ")).toBe("Mohammad");
    expect(sauberName("  Lahwani  ")).toBe("Lahwani");
    expect(sauberName("Anna  Lena")).toBe("Anna Lena");
  });

  it("macht aus einem reinen Leerzeichen-Namen null statt eines leeren Namens", async () => {
    const { sauberName } = await import("@/lib/platforms/case-writer");
    expect(sauberName("   ")).toBeNull();
    expect(sauberName(null)).toBeNull();
    expect(sauberName(undefined)).toBeNull();
  });
});
