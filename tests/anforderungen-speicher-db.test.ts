import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  // getEnv() und die Provider-Fabrik merken sich den ersten Aufruf – ohne das
  // hier liefe der Test gegen die echte Mistral-API.
  process.env.AI_PROVIDER = "mock";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 *   RUN_DB_IT=1 npx vitest run tests/anforderungen-speicher-db.test.ts
 */
describe.runIf(RUN)("Abruf speichern (PGlite)", () => {
  let prisma: any;
  let speichereAbruf: any;
  let ladeAktivenAbruf: any;
  let caseId = "";

  const anforderungen = () => [
    {
      id: "r1",
      code: "AW01",
      text: "Ausweisdokument",
      kurzbezeichnung: "Perso",
      erfuellungskategorien: ["Ausweis"],
      bezug: { typ: "antragsteller", name: "Max Mustermann" },
      liegtVor: false,
      ausgeblendet: false,
    },
    {
      id: "r2",
      code: "EK01",
      text: "Nachweis Eigenkapital",
      erfuellungskategorien: ["Gibtsnicht"],
      liegtVor: true,
      ausgeblendet: false,
    },
  ];

  const eingabe = (extra: Record<string, unknown> = {}) => ({
    caseId,
    quelle: "antrag" as const,
    vorgangsNummer: "CH6407",
    bezugsId: "A-1",
    bankId: "ING_DIBA",
    bankName: "ING",
    anforderungen: anforderungen(),
    ...extra,
  });

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    ({ speichereAbruf, ladeAktivenAbruf } = await import("@/lib/anforderungen/speicher"));

    const org = await prisma.organization.create({
      data: { name: "Testorg", slug: "testorg-anforderungen-speicher" },
    });
    const fall = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0001" },
    });
    caseId = fall.id;
    await prisma.applicant.create({
      data: { caseId, position: 1, vorname: "Max", nachname: "Mustermann" },
    });
  }, 180_000);

  it("legt Abruf und Anforderungen an", async () => {
    const r = await speichereAbruf(eingabe());
    expect(r.zeilen).toBe(2);

    const abruf = await prisma.bankAnforderungsAbruf.findUnique({
      where: { id: r.abrufId },
      include: { anforderungen: true },
    });
    expect(abruf.bankName).toBe("ING");
    expect(abruf.aktiv).toBe(true);
    expect(abruf.anforderungen).toHaveLength(2);
  });

  it("loest den Dokumenttyp beim Abruf auf", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r1" } });
    expect(a.documentType).toBe("personalausweis");
  });

  it("laesst den Dokumenttyp leer, wenn die Kategorie unbekannt ist", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r2" } });
    expect(a.documentType).toBeNull();
  });

  it("ordnet den Antragsteller ueber den Bezugsnamen zu", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r1" } });
    const as1 = await prisma.applicant.findFirst({ where: { caseId, position: 1 } });
    expect(a.applicantId).toBe(as1.id);
  });

  it("uebernimmt liegtVor unveraendert", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r2" } });
    expect(a.liegtVor).toBe(true);
  });

  it("erzeugt beim zweiten Abruf derselben Bank keinen zweiten Datensatz", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(eingabe());
    const anzahl = await prisma.bankAnforderungsAbruf.count({
      where: { caseId, quelle: "antrag", bezugsId: "A-1" },
    });
    expect(anzahl).toBe(1);
  });

  it("entfernt Anforderungen, die die Bank nicht mehr nennt", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(eingabe({ anforderungen: [anforderungen()[0]] }));
    const abruf = await prisma.bankAnforderungsAbruf.findFirst({
      where: { caseId, bezugsId: "A-1" },
      include: { anforderungen: true },
    });
    expect(abruf.anforderungen).toHaveLength(1);
    expect(abruf.anforderungen[0].externeId).toBe("r1");
  });

  it("setzt beim Bankwechsel nur das Kennzeichen um und loescht nichts", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(
      eingabe({ bezugsId: "A-2", bankId: "DSL_BANK", bankName: "DSL Bank" })
    );

    const alle = await prisma.bankAnforderungsAbruf.findMany({ where: { caseId } });
    expect(alle.length).toBeGreaterThanOrEqual(2);
    expect(alle.filter((a: any) => a.aktiv)).toHaveLength(1);
    expect(alle.find((a: any) => a.aktiv).bankName).toBe("DSL Bank");
    expect(alle.find((a: any) => a.bezugsId === "A-1")).toBeTruthy();
  });

  it("liefert den aktiven Abruf in Abgleichsform", async () => {
    await speichereAbruf(eingabe());
    const aktiv = await ladeAktivenAbruf(caseId);
    expect(aktiv.bankName).toBe("ING");
    expect(aktiv.anforderungen.find((a: any) => a.id === "r1").bezeichnung).toBe("Perso");
    expect(aktiv.anforderungen.find((a: any) => a.id === "r1").documentType).toBe("personalausweis");
  });

  it("liefert null, wenn nie abgerufen wurde", async () => {
    const org = await prisma.organization.create({
      data: { name: "Leer", slug: "leer-anforderungen-speicher" },
    });
    const leer = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0002" },
    });
    expect(await ladeAktivenAbruf(leer.id)).toBeNull();
  });
});
