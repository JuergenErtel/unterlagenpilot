import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

// Der Vermittler-Kontext hängt an Cookies/Session – für den Datenbanklauf
// gemockt. Alles andere (Token, Katalog, Übernahme) läuft echt.
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx: { organizationId: g.__orgId, userId: null },
    caseRow: { id: caseId, organizationId: g.__orgId },
  })),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Der vollständige Ablauf gegen das echte Schema: Link erzeugen, Antworten
 * speichern, absenden, übernehmen. Standardmäßig übersprungen (PGlite ist
 * schwer):
 *   RUN_DB_IT=1 npx vitest run tests/selbstauskunft-db.test.ts
 */
describe.runIf(RUN)("Selbstauskunft (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let caseId: string;
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--script",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const { PrismaPGlite } = await import("pglite-prisma-adapter");
    const { PrismaClient } = await import("@prisma/client");
    const pg = new PGlite();
    await pg.exec(ddl);
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({
      data: { name: "Testorg", slug: "testorg-sd" },
    });
    orgId = org.id;
    g.__orgId = orgId;
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9100", status: "unterlagen_fehlen" },
    });
    caseId = c.id;
    await prisma.applicant.create({ data: { caseId, position: 1, vorname: "Laura" } });
  }, 180_000);

  it("legt einen Link an, dessen Klartext nicht in der Datenbank steht", async () => {
    const { createSelfDisclosureLink, resolveSelfDisclosureToken } = await import(
      "@/lib/security/self-disclosure-link"
    );
    const created = await createSelfDisclosureLink(caseId, new Date(Date.now() + 86400_000), {
      organizationId: orgId,
    });
    token = created.token;

    const row = await prisma.selfDisclosureLink.findUnique({ where: { id: created.linkId } });
    expect(row.tokenHash).not.toBe(created.token);
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toMatchObject({ caseId });
  }, 60_000);

  it("speichert Antworten und überspringt leere Schritte", async () => {
    const { speichereAntwort } = await import("@/lib/actions/self-disclosure");

    const form = (entries: Record<string, string>) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(entries)) fd.set(k, v);
      return fd;
    };

    // redirect() wirft in der echten Anwendung – hier fangen wir das ab.
    const ohneRedirect = async (p: Promise<unknown>) => {
      try {
        return await p;
      } catch {
        return undefined;
      }
    };

    await ohneRedirect(
      speichereAntwort(token, "finanzierungsart", form({ "finanzierungsart.art": "kauf_bestand" }))
    );
    await ohneRedirect(speichereAntwort(token, "kaufpreis", form({ "kaufpreis.betrag": "400.000" })));
    await ohneRedirect(
      speichereAntwort(token, "objekt_ort", form({ "objekt_ort.plz": "", "objekt_ort.ort": "" }))
    );
    await ohneRedirect(
      speichereAntwort(
        token,
        "anzahl_antragsteller",
        form({ "anzahl_antragsteller.anzahl": "2" })
      )
    );
    // "person_name" ist seit den Personen-Spalten EIN Schritt mit beiden
    // Spalten – die Antworten unterscheiden sich nur noch durch den
    // Personen-Praefix im Feldnamen, nicht mehr durch die Schritt-ID.
    await ohneRedirect(
      speichereAntwort(token, "person_name", form({ "p2.person_name.vorname": "Thomas" }))
    );
    await ohneRedirect(
      speichereAntwort(token, "einkommen", form({ "p1.einkommen.netto": "3200" }))
    );

    const bogen = await prisma.selfDisclosure.findFirst({ where: { caseId } });
    expect(bogen.answers["finanzierungsart.art"]).toBe("kauf_bestand");
    expect(bogen.answers["kaufpreis.betrag"]).toBe(400000);
    expect(bogen.answers["p2.person_name.vorname"]).toBe("Thomas");
    // Übersprungener Schritt: nichts gespeichert.
    expect(bogen.answers["objekt_ort.plz"]).toBeUndefined();
  }, 60_000);

  it("übernimmt nur die ausgewählten Angaben und legt Antragsteller 2 dabei an", async () => {
    const { sendeAb, ladeUebernahmeplan, uebernehmen } = await import(
      "@/lib/actions/self-disclosure"
    );

    await sendeAb(token);
    const plan = await ladeUebernahmeplan(caseId);
    expect(plan).not.toBeNull();

    // Laura steht schon so im Fall -> kein Vorschlag für ihren Vornamen.
    expect(plan!.plan.vorschlaege.some((v) => v.kundenwert === "Laura")).toBe(false);
    const thomas = plan!.plan.vorschlaege.find((v) => v.kundenwert === "Thomas")!;
    expect(thomas.ziel.person).toBe(2);

    const kaufpreis = plan!.plan.vorschlaege.find((v) => v.ziel.feld === "kaufpreis")!;
    const einkommen = plan!.plan.vorschlaege.find((v) => v.ziel.feld === "nettoMonatlich")!;

    const res = await uebernehmen(caseId, [
      thomas.schluessel,
      kaufpreis.schluessel,
      einkommen.schluessel,
    ]);
    expect(res.error).toBeUndefined();

    const applicants = await prisma.applicant.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
    });
    expect(applicants).toHaveLength(2);
    expect(applicants[1].vorname).toBe("Thomas");

    const fin = await prisma.financingRequest.findUnique({ where: { caseId } });
    expect(fin.kaufpreis).toBe(400000);

    const income = await prisma.incomeRecord.findFirst({
      where: { applicantId: applicants[0].id },
    });
    expect(income.nettoMonatlich).toBe(3200);

    const bogen = await prisma.selfDisclosure.findFirst({ where: { caseId } });
    expect(bogen.takenOverAt).not.toBeNull();

    // Ein zweiter Lauf findet nichts mehr – der Bogen ist erledigt.
    await expect(ladeUebernahmeplan(caseId)).resolves.toBeNull();
  }, 60_000);
});
