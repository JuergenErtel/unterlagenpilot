import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
    AUTH_SECRET: "test-auth-secret-1234567890",
    SESSION_TTL_HOURS: 12,
    SESSION_COOKIE_NAME: "up_session",
    AUTH_MODE: "session",
  }),
}));

/**
 * Der ganze Weg gegen das echte Schema: Antrag → Bestaetigung → Freigabe →
 * Anmeldung. Standardmaessig uebersprungen (PGlite ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts
 */
describe.runIf(RUN)("Registrierung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let adminUserId: string;

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
    prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) as never });
    g.prisma = prisma;

    // Tarife anlegen (die Freigabe braucht eine Plan-Zeile).
    for (const tier of ["starter", "pro", "team"] as const) {
      await prisma.plan.create({ data: { tier, name: tier, features: [] } });
    }
    // Betreiberkonto in einer eigenen Organisation.
    const betreiberOrg = await prisma.organization.create({
      data: { name: "Coding Brothers", slug: "coding-brothers" },
    });
    const admin = await prisma.user.create({
      data: {
        organizationId: betreiberOrg.id,
        email: "betreiber@baufidesk.de",
        name: "Betreiber",
        role: "org_admin",
        platformAdmin: true,
      },
    });
    adminUserId = admin.id;
  }, 180_000);

  it("legt bei der Freigabe Organisation, Nutzer und Abo in einem Rutsch an", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");

    const angelegt = await erstelleAntrag(
      {
        name: "Anna Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "anna@beispiel.de",
        passwort: "einLangesGeheimwort2026",
        wunschtarif: "pro",
        agb: true,
      },
      { ip: "1.2.3.4" }
    );
    expect(angelegt.status).toBe("neu_angelegt");
    if (angelegt.status !== "neu_angelegt") throw new Error("unerwartet");

    // Vor der Bestaetigung existiert KEINE Organisation.
    expect(await prisma.organization.count()).toBe(1); // nur die Betreiber-Org

    await expect(bestaetigeEmail(angelegt.token)).resolves.toMatchObject({ ok: true });

    const res = await gibFrei(angelegt.requestId, {
      tier: "pro",
      testEndeAm: new Date("2026-09-30"),
      adminUserId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh");
    const nutzer = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(nutzer.role).toBe("org_admin");
    expect(nutzer.platformAdmin).toBe(false);
    const abo = await prisma.subscription.findUnique({ where: { organizationId: res.organizationId } });
    expect(abo.status).toBe("trialing");
    const antrag = await prisma.signupRequest.findUnique({ where: { id: angelegt.requestId } });
    expect(antrag.status).toBe("freigegeben");
    expect(antrag.organizationId).toBe(res.organizationId);
    // Der Hash liegt ab jetzt nur noch am Nutzer. Eine Kopie am Antrag wuerde
    // jeden spaeteren Passwortwechsel ueberdauern.
    expect(antrag.passwordHash).toBeNull();
    expect(nutzer.passwordHash).not.toBeNull();
  }, 60_000);

  it("gibt einen Antrag ohne Passwort-Hash nicht frei", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const hans = await erstelleAntrag(
      {
        name: "Hans Beispiel",
        firmenname: "Hans Finanz",
        email: "hans@beispiel.de",
        passwort: "einLangesGeheimwortHans",
        agb: true,
      },
      { ip: null }
    );
    if (hans.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(hans.token);
    // Zweite Freigabe desselben Antrags waere der Fall: Hash schon geleert.
    await prisma.signupRequest.update({
      where: { id: hans.requestId },
      data: { passwordHash: null },
    });

    const vorher = await prisma.organization.count();
    await expect(
      gibFrei(hans.requestId, { tier: "pro", testEndeAm: null, adminUserId })
    ).resolves.toMatchObject({ ok: false, grund: "fehlgeschlagen" });
    expect(await prisma.organization.count()).toBe(vorher);
  }, 60_000);

  it("uebernimmt das bei der Anmeldung gesetzte Passwort", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "einLangesGeheimwort2026")
    ).resolves.toMatchObject({ role: "org_admin" });
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "falsch")
    ).resolves.toBeNull();
  }, 60_000);

  it("haengt bei gleichem Firmennamen einen Zaehler an den Slug", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const zweiter = await erstelleAntrag(
      {
        name: "Bernd Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "bernd@beispiel.de",
        passwort: "einAnderesLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (zweiter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(zweiter.token);
    const res = await gibFrei(zweiter.requestId, { tier: "starter", testEndeAm: null, adminUserId });
    if (!res.ok) throw new Error("unerwartet");
    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh-2");
  }, 60_000);

  it("weist eine bereits vergebene Adresse schon vor der Transaktion ab", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const dritter = await erstelleAntrag(
      {
        name: "Clara Beispiel",
        firmenname: "Clara Finanz",
        email: "clara@beispiel.de",
        passwort: "nochEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (dritter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(dritter.token);

    // Die Adresse ist bereits als Nutzer vergeben, BEVOR gibFrei aufgerufen
    // wird – das faengt schon der Vorab-Check ab, die Transaktion wird gar
    // nicht erst versucht.
    const fremd = await prisma.organization.create({ data: { name: "Fremd", slug: "fremd" } });
    await prisma.user.create({
      data: { organizationId: fremd.id, email: "clara@beispiel.de", name: "Clara", role: "vermittler" },
    });

    const vorher = await prisma.organization.count();
    const res = await gibFrei(dritter.requestId, { tier: "pro", testEndeAm: null, adminUserId });
    expect(res).toMatchObject({ ok: false, grund: "adresse_vergeben" });
    expect(await prisma.organization.count()).toBe(vorher);
    const antrag = await prisma.signupRequest.findUnique({ where: { id: dritter.requestId } });
    expect(antrag.status).toBe("bestaetigt"); // bleibt offen, nichts verloren
  }, 60_000);

  it("hinterlaesst keine halbe Organisation, wenn die Adresse zwischen Vorab-Check und Transaktion vergeben wird", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const antragsteller = await erstelleAntrag(
      {
        name: "Ella Beispiel",
        firmenname: "Ella Finanz",
        email: "ella@beispiel.de",
        passwort: "einWeiteresLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (antragsteller.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(antragsteller.token);

    // Die Adresse existiert bereits real als Nutzer – aber der Vorab-Check
    // wird fuer genau diesen einen Aufruf gezielt ins Leere geschickt, damit
    // gibFrei bis zur Transaktion vordringt und dort am Eindeutigkeitsindex
    // scheitern muss (der eigentliche Wettlauf, den der Vorab-Check nicht
    // abfangen kann).
    const fremd = await prisma.organization.create({ data: { name: "Fremd2", slug: "fremd-2" } });
    await prisma.user.create({
      data: { organizationId: fremd.id, email: "ella@beispiel.de", name: "Ella", role: "vermittler" },
    });
    // vi.spyOn(prisma.user, "findUnique") + mockRestore() beschaedigt hier den
    // Prisma-Delegate dauerhaft (nachfolgende Aufrufe schlagen mit
    // "prisma.user.findUnique is not a function" fehl) – vermutlich weil der
    // Delegate intern ueber eine Proxy-/Getter-Konstruktion arbeitet, die
    // vitests mockRestore() nicht sauber zuruecksetzt. Deshalb hier ein
    // simples manuelles Monkeypatch samt manueller Wiederherstellung fuer
    // genau einen Aufruf statt vi.spyOn.
    const echtesFindUnique = prisma.user.findUnique.bind(prisma.user);
    let ersterAufruf = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.user.findUnique = ((...args: any[]) => {
      if (ersterAufruf) {
        ersterAufruf = false;
        return Promise.resolve(null);
      }
      return echtesFindUnique(...args);
    }) as typeof prisma.user.findUnique;

    try {
      const vorherOrgs = await prisma.organization.count();
      const vorherSubs = await prisma.subscription.count();
      const res = await gibFrei(antragsteller.requestId, { tier: "pro", testEndeAm: null, adminUserId });
      expect(res).toMatchObject({ ok: false, grund: "adresse_vergeben" });
      expect(await prisma.organization.count()).toBe(vorherOrgs);
      expect(await prisma.subscription.count()).toBe(vorherSubs); // kein Abo ohne Nutzer
      const antrag = await prisma.signupRequest.findUnique({ where: { id: antragsteller.requestId } });
      expect(antrag.status).toBe("bestaetigt"); // bleibt offen, nichts verloren
    } finally {
      prisma.user.findUnique = echtesFindUnique;
    }
  }, 60_000);

  it("trennt die Faelle der neuen Organisation von fremden", async () => {
    const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "beispiel-finanz" } } });
    const [a, b] = orgs;
    await prisma.case.create({ data: { organizationId: a.id, caseNumber: "UP-2026-8001", status: "neu" } });
    await prisma.case.create({ data: { organizationId: b.id, caseNumber: "UP-2026-8002", status: "neu" } });
    const nurA = await prisma.case.findMany({ where: { organizationId: a.id } });
    expect(nurA).toHaveLength(1);
    expect(nurA[0].caseNumber).toBe("UP-2026-8001");
  }, 60_000);

  it("ueberlebt einen Link-Scanner: das Nachschlagen verbraucht das Token nicht", async () => {
    const { erstelleAntrag, liesBestaetigung, bestaetigeEmail } = await import("@/lib/auth/signup");
    const gerd = await erstelleAntrag(
      {
        name: "Gerd Beispiel",
        firmenname: "Gerd Finanz",
        email: "gerd@beispiel.de",
        passwort: "einLangesGeheimwortGerd",
        agb: true,
      },
      { ip: null }
    );
    if (gerd.status !== "neu_angelegt") throw new Error("unerwartet");

    // Zwei Aufrufe der Seite (z. B. Scanner + Mensch) aendern nichts.
    await expect(liesBestaetigung(gerd.token)).resolves.toMatchObject({
      ok: true,
      bereitsBestaetigt: false,
    });
    await expect(liesBestaetigung(gerd.token)).resolves.toMatchObject({ ok: true });
    const tokenZeile = await prisma.authToken.findFirst({
      where: { signupRequestId: gerd.requestId, zweck: "email_bestaetigung" },
    });
    expect(tokenZeile.usedAt).toBeNull();

    // Erst der Knopf loest ein.
    await expect(bestaetigeEmail(gerd.token)).resolves.toMatchObject({ ok: true });
    const danach = await prisma.authToken.findUnique({ where: { id: tokenZeile.id } });
    expect(danach.usedAt).toBeInstanceOf(Date);
  }, 60_000);

  it("laesst einen unbestaetigten Antrag erneut anfordern und entwertet den alten Link", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const eingabe = {
      name: "Frida Beispiel",
      firmenname: "Frida Finanz",
      email: "frida@beispiel.de",
      passwort: "einLangesGeheimwortFrida",
      agb: true as const,
    };
    const erster = await erstelleAntrag(eingabe, { ip: null });
    if (erster.status !== "neu_angelegt") throw new Error("unerwartet");

    // Die Bestaetigungsmail liegt laenger zurueck als die Mailsperre – genau
    // die Lage, in der jemand den Link nie angeklickt hat (Spam, Versand
    // gescheitert, vergessen).
    await prisma.signupRequest.update({
      where: { id: erster.requestId },
      data: { letzteMailAm: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const zweiter = await erstelleAntrag(eingabe, { ip: null });
    expect(zweiter.status).toBe("neu_angelegt"); // NICHT "bereits_vergeben"
    if (zweiter.status !== "neu_angelegt") throw new Error("unerwartet");
    expect(zweiter.requestId).toBe(erster.requestId);
    expect(await prisma.signupRequest.count({ where: { email: "frida@beispiel.de" } })).toBe(1);

    // Der Link aus der ersten Mail ist entwertet, nur der neue zieht.
    await expect(bestaetigeEmail(erster.token)).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
    await expect(bestaetigeEmail(zweiter.token)).resolves.toMatchObject({ ok: true });
    const antrag = await prisma.signupRequest.findUnique({ where: { id: erster.requestId } });
    expect(antrag.status).toBe("bestaetigt");
  }, 60_000);

  it("gibt einen abgelehnten Antrag nicht frei", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei, lehneAb } = await import("@/lib/auth/freigabe");
    const vierter = await erstelleAntrag(
      {
        name: "Dora Beispiel",
        firmenname: "Dora Finanz",
        email: "dora@beispiel.de",
        passwort: "wiederEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (vierter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(vierter.token);
    await expect(lehneAb(vierter.requestId, "Kein Vermittler", adminUserId)).resolves.toBe(true);
    await expect(
      gibFrei(vierter.requestId, { tier: "pro", testEndeAm: null, adminUserId })
    ).resolves.toMatchObject({ ok: false, grund: "falscher_status" });
  }, 60_000);
});
