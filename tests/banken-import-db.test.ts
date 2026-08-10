import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Import gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/banken-import-db.test.ts
 */
describe.runIf(RUN)("Banken-Import (PGlite)", () => {
  let prisma: any;
  let importiereBanken: (b: any[], jetzt?: Date) => Promise<any>;

  const abzug = (status = "NICHT_MACHBAR", inhalt = "<p>Wird nicht unterstützt.</p>") => [
    {
      bankId: "TEST_BANK",
      name: "Testbank eG",
      kriterien: [
        {
          criterionName: "Auszubildende",
          status,
          content: inhalt,
          lastUpdated: "2026-06-04T15:43:06Z",
        },
        { criterionName: "Ferienobjekt", status: "KEINE_ANGABE", content: "", lastUpdated: null },
      ],
    },
  ];

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    ({ importiereBanken } = await import("@/lib/banken/import"));
  }, 180_000);

  it("legt Bank und Kriterien an", async () => {
    const r = await importiereBanken(abzug());
    expect(r.banken).toBe(1);
    expect(r.zeilen).toBe(2);

    const bank = await prisma.bank.findUnique({
      where: { bankId: "TEST_BANK" },
      include: { kriterien: true },
    });
    expect(bank.name).toBe("Testbank eG");
    expect(bank.kriterien).toHaveLength(2);
  });

  it("ordnet die Kategorie zu", async () => {
    await importiereBanken(abzug());
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.kategorie).toBe("Antragsteller");
  });

  it("uebernimmt das Datum von Europace getrennt vom Importdatum", async () => {
    const jetzt = new Date("2026-08-10T12:00:00Z");
    await importiereBanken(abzug(), jetzt);
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.standAm.toISOString().slice(0, 10)).toBe("2026-06-04");
    expect(k.importiertAm.toISOString().slice(0, 10)).toBe("2026-08-10");
  });

  it("laesst standAm leer, wenn Europace kein Datum nennt", async () => {
    await importiereBanken(abzug());
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Ferienobjekt" } });
    expect(k.standAm).toBeNull();
  });

  it("bereinigt den Freitext BEIM Import", async () => {
    await importiereBanken(abzug("NICHT_MACHBAR", "<p>Text</p><script>alert(1)</script>"));
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.inhalt).not.toMatch(/script|alert/i);
    expect(k.inhalt).toContain("Text");
  });

  it("erzeugt beim zweiten Lauf keine Dubletten und aktualisiert", async () => {
    await importiereBanken(abzug("NICHT_MACHBAR"));
    await importiereBanken(abzug("MACHBAR"));
    expect(await prisma.bank.count({ where: { bankId: "TEST_BANK" } })).toBe(1);
    expect(await prisma.bankKriterium.count({ where: { kriterium: "Auszubildende" } })).toBe(1);
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.status).toBe("MACHBAR");
  });

  it("meldet einen unbekannten Status, statt zu scheitern", async () => {
    const r = await importiereBanken(abzug("VIELLEICHT"));
    expect(r.unbekannteStatus).toContain("VIELLEICHT");
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.status).toBe("VIELLEICHT");
  });

  it("meldet ein Kriterium ohne Kategorie, statt zu scheitern", async () => {
    const sonder = [
      {
        bankId: "TEST_BANK2",
        name: "Zweite Bank",
        kriterien: [
          { criterionName: "Brandneues Kriterium", status: "MACHBAR", content: "", lastUpdated: null },
        ],
      },
    ];
    const r = await importiereBanken(sonder);
    expect(r.ohneKategorie).toContain("Brandneues Kriterium");
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Brandneues Kriterium" } });
    expect(k.kategorie).toBe("Sonstige");
  });
});
