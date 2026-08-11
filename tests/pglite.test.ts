import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * End-to-End-Verifikation gegen eine echte (In-Process-)Postgres via PGlite.
 * Das DDL wird live aus prisma/schema.prisma erzeugt (kein Drift), in PGlite
 * angewandt, dann wird mit dem ECHTEN Seed und der ECHTEN Query-Schicht
 * gearbeitet. Der Prisma-Singleton (src/lib/db) wird über globalThis injiziert.
 *
 * Standardmäßig übersprungen (PGlite/WASM ist schwer). Gezielt ausführen mit:
 *   RUN_DB_IT=1 npm run test -- tests/pglite.test.ts
 * oder:
 *   npm run verify:db
 */

const RUN = process.env.RUN_DB_IT === "1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe.runIf(RUN)("End-to-End gegen echte Postgres (PGlite)", () => {
  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";

    // DDL live & ohne Shell erzeugen (kein User-Input, kein Injection-Risiko).
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

    // Cast wegen doppelter @prisma/driver-adapter-utils-Kopie (nur Typ-Skew;
    // Laufzeit verifiziert grün). Reiner Dev-/Verifikationspfad.
    const adapter = new PrismaPGlite(pg) as never;
    g.prisma = new PrismaClient({ adapter });

    // Module einmalig "warmlaufen" lassen, damit die Tests nicht am
    // kalten Transform der Abhängigkeitskette scheitern.
    await import("../prisma/seed");
    await import("@/lib/cases/service");
    await import("@/lib/platforms/case-loader");
    await import("@/lib/platforms/mapping");
  }, 180_000);

  it(
    "seedet Organisation + Demo-Fall Mustermann",
    async () => {
      const { seed } = await import("../prisma/seed");
      await seed(g.prisma);

      const org = await g.prisma.organization.findFirst();
      expect(org?.name).toBe("Jürgen Ertel Baufinanzierung");

      const fall = await g.prisma.case.findFirst({ include: { applicants: true, documents: true } });
      expect(fall?.caseNumber).toBe("UP-2026-0001");
      expect(fall?.applicants.length).toBe(2);
      expect(fall?.documents.length).toBe(3);
    },
    60_000
  );

  it(
    "Dashboard-Buckets liefern plausible Zahlen",
    async () => {
      const { getDashboardBuckets } = await import("@/lib/cases/service");
      const org = await g.prisma.organization.findFirstOrThrow();
      const buckets = await getDashboardBuckets(org.id);
      expect(buckets.offen).toBeGreaterThanOrEqual(1);
      expect(buckets.unterlagenFehlen).toBeGreaterThanOrEqual(1);
    },
    60_000
  );

  it(
    "Fall-Aggregat berechnet Checkliste, fehlende Unterlagen & Readiness",
    async () => {
      const { getCaseAggregate } = await import("@/lib/cases/service");
      const fall = await g.prisma.case.findFirstOrThrow();
      const agg = await getCaseAggregate(fall.id);

      expect(agg.checklist.length).toBeGreaterThan(0);
      expect(agg.readiness.score).toBeGreaterThanOrEqual(0);
      expect(agg.readiness.score).toBeLessThanOrEqual(100);

      const missingKeys = agg.missing.map((m) => m.key);
      expect(missingKeys).toContain("grundbuchauszug");
      expect(missingKeys).toContain("eigenkapitalnachweis");

      const ausweis = agg.checklist.find((i) => i.key === "personalausweis");
      expect(ausweis?.status).toBe("unvollstaendig");
    },
    60_000
  );

  it(
    "Europace-Anforderungen: 'neu' ist nicht strukturell 0, keine Dublette bei Deckung",
    async () => {
      const { speichereAbruf } = await import("@/lib/anforderungen/speicher");
      const { getCaseAggregate } = await import("@/lib/cases/service");
      const fall = await g.prisma.case.findFirstOrThrow();

      // Zwei Anforderungen: eine deckt sich mit der vorhandenen
      // "personalausweis"-Vorlage (Kategorie "Ausweis"), die andere
      // ("Gebaeudeversicherung" -> versicherungsnachweis) taucht in KEINER
      // Checklisten-Vorlage auf (templates.ts). Bei der alten, zirkulaeren
      // Verdrahtung (Abgleich gegen die FERTIGE Checkliste inklusive der neu
      // erzeugten Europace-Positionen) waere "neu" IMMER 0 gewesen, weil jede
      // offene Anforderung sich vorher selbst eine passende Position gebaut
      // haette.
      await speichereAbruf({
        caseId: fall.id,
        quelle: "antrag",
        vorgangsNummer: "CH-TEST",
        bezugsId: "A-TEST",
        bankId: "TEST_BANK",
        bankName: "Testbank",
        anforderungen: [
          {
            id: "deckt-1",
            code: "PA01",
            text: "Ausweisdokument",
            kurzbezeichnung: "Perso",
            erfuellungskategorien: ["Ausweis"],
            liegtVor: false,
            ausgeblendet: false,
          },
          {
            id: "neu-1",
            code: "VN01",
            text: "Nachweis Gebaeudeversicherung",
            kurzbezeichnung: "Gebaeudeversicherung",
            erfuellungskategorien: ["Gebaeudeversicherung"],
            liegtVor: false,
            ausgeblendet: false,
          },
        ],
      });

      const agg = await getCaseAggregate(fall.id);

      expect(agg.anforderungsAbgleich).not.toBeNull();
      expect(agg.anforderungsAbgleich?.zahlen.neu).toBeGreaterThanOrEqual(1);
      expect(agg.anforderungsAbgleich?.zahlen.decktSich).toBeGreaterThanOrEqual(1);

      // Kein Dublett: die vorhandene "personalausweis"-Zeile aus der Vorlage
      // bleibt die einzige, die deckende Bank-Anforderung erzeugt KEINE zweite.
      const persoZeilen = agg.checklist.filter((i) => i.key === "personalausweis");
      expect(persoZeilen).toHaveLength(1);

      // Fuer die neue Anforderung entsteht genau eine Position.
      const versicherungZeilen = agg.checklist.filter(
        (i) => i.documentType === "versicherungsnachweis"
      );
      expect(versicherungZeilen).toHaveLength(1);
    },
    60_000
  );

  it(
    "Plattform-Mapping (kanonisch) erzeugt Felder für Europace",
    async () => {
      const { caseToCanonical } = await import("@/lib/platforms/case-loader");
      const { buildPlatformMapping } = await import("@/lib/platforms/mapping");
      const fall = await g.prisma.case.findFirstOrThrow();
      const canonical = await caseToCanonical(fall.id);
      const payload = buildPlatformMapping(canonical, "europace");
      const all = payload.groups.flatMap((gr) => gr.fields);
      expect(all.find((f) => f.label === "Kaufpreis")?.value).toBe(420000);
    },
    60_000
  );
});
