import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Import der Direkteinreicherinformationen gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/banken-direkteinreicher-db.test.ts
 */
describe.runIf(RUN)("Direkteinreicher-Import (PGlite)", () => {
  let prisma: any;
  let importiere: (p: any, a: any, jetzt?: Date) => Promise<any>;
  const ULM = readFileSync("tests/fixtures/direkteinreicher-spk-ulm.html", "utf8");

  const abzug = (body = ULM) => ({
    geholtAm: "2026-09-08",
    artikel: [
      { artikelId: 11028537318812, titel: "Sparkasse Ulm - Direkteinreicherinformationen", aktualisiert: "2026-06-22T14:19:03Z", body },
      { artikelId: 1, titel: "Sparkasse Ulm - Formular-Center", aktualisiert: null, body: "<p>x</p>" },
      { artikelId: 2, titel: "Hausbank Entenhausen - Direkteinreicherinformationen", aktualisiert: null, body: ULM },
    ],
  });

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    ({ importiereDirekteinreicher: importiere } = await import("@/lib/banken/direkteinreicher/import"));
    await prisma.bank.create({ data: { bankId: "SPK_ULM", name: "Spk Ulm", zuletztGesehenAm: new Date() } });
  }, 180_000);

  it("schreibt Ansprechpartner und Anschrift an die richtige Bank und meldet den Rest", async () => {
    const b = await importiere(prisma, abzug(), new Date("2026-09-08T10:00:00Z"));
    expect(b.bankenGeschrieben).toBe(1);
    expect(b.personenGeschrieben).toBe(2);
    expect(b.keinDirekteinreicherArtikel).toEqual(["Sparkasse Ulm - Formular-Center"]);
    expect(b.ohneZuordnung).toEqual(["Hausbank Entenhausen"]);

    const bank = await prisma.bank.findUnique({
      where: { bankId: "SPK_ULM" },
      include: { ansprechpartner: { orderBy: { reihenfolge: "asc" } } },
    });
    expect(bank.anschrift).toContain("89073 Ulm");
    expect(bank.direkteinreicherStandAm.toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(bank.ansprechpartner.map((p: any) => p.name)).toEqual(["Philipp Häußler", "Yvonne Wilhelm"]);
    expect(bank.ansprechpartner[0].telefon).toBe("0731 101-1939");
  });

  it("ersetzt die Liste beim zweiten Import statt sie zu verdoppeln", async () => {
    const einer = ULM.replace(/<td class="xl32" style="width: 33.2857%;">[\s\S]*?<\/td>/, "<td></td>");
    const b = await importiere(prisma, abzug(einer));
    expect(b.personenGeschrieben).toBe(2); // Zweite Spalte hat noch Funktion/Telefon
    const alle = await prisma.bankAnsprechpartner.findMany();
    expect(alle).toHaveLength(2);
  });
});
