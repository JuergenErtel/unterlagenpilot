import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

/**
 * Einladung gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/invite-db.test.ts
 */
describe.runIf(RUN)("Einladung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;
  let chefId: string;

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

    // Starter erlaubt genau 1 Nutzer, Pro erlaubt 3 – gute Limit-Probe.
    const starter = await prisma.plan.create({ data: { tier: "starter", name: "Starter", features: [] } });
    await prisma.plan.create({ data: { tier: "pro", name: "Pro", features: [] } });
    const org = await prisma.organization.create({
      data: {
        name: "Beispiel Finanz",
        slug: "beispiel-finanz",
        subscription: { create: { planId: starter.id, status: "trialing" } },
      },
    });
    orgId = org.id;
    const chef = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Chefin",
        role: "org_admin",
        passwordHash: "scrypt$16384$abc$def",
      },
    });
    chefId = chef.id;
  }, 180_000);

  it("blockt die Einladung, wenn der Tarif nur einen Nutzer erlaubt", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "neu@beispiel.de",
        name: "Neu",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "limit_erreicht" });
    expect(await prisma.user.count({ where: { organizationId: orgId } })).toBe(1);
  }, 60_000);

  it("legt nach Tarifwechsel ein passwortloses Konto samt Token an", async () => {
    const pro = await prisma.plan.findUnique({ where: { tier: "pro" } });
    await prisma.subscription.update({ where: { organizationId: orgId }, data: { planId: pro.id } });

    const { ladeEin } = await import("@/lib/auth/invite");
    const res = await ladeEin({
      organizationId: orgId,
      email: "neu@beispiel.de",
      name: "Neu",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const eingeladen = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(eingeladen.passwordHash).toBeNull();
    expect(eingeladen.invitedAt).toBeInstanceOf(Date);
    g.__inviteToken = res.token;
  }, 60_000);

  it("weist eine im Tarif nicht erlaubte Rolle ab, obwohl Limit und Adresse frei sind", async () => {
    // Tarif ist an dieser Stelle bereits "pro" (PLAN_ROLES.pro = ["org_admin", "vermittler"]),
    // erlaubt also kein "teammitglied". Limit (3) ist mit chef + "neu@beispiel.de" erst zu
    // zwei Dritteln ausgeschoepft, die Adresse ist frisch – der Test kann den
    // rolle_nicht_erlaubt-Zweig also nur erreichen, wenn die Rollenpruefung tatsaechlich greift.
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "abgelehnt@beispiel.de",
        name: "Abgelehnt",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "rolle_nicht_erlaubt" });
    expect(await prisma.user.findUnique({ where: { email: "abgelehnt@beispiel.de" } })).toBeNull();
  }, 60_000);

  it("laesst ein passwortloses Konto sich NICHT anmelden", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "")).resolves.toBeNull();
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "irgendwas")).resolves.toBeNull();
  }, 60_000);

  it("setzt beim Einloesen das Passwort und macht das Konto nutzbar", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    const { getAuthProvider } = await import("@/lib/auth/provider");
    const res = await loeseEinladungEin(g.__inviteToken, "einLangesTeamGeheimwort");
    expect(res).toMatchObject({ ok: true, organizationId: orgId, role: "vermittler" });
    await expect(
      getAuthProvider().authenticate("neu@beispiel.de", "einLangesTeamGeheimwort")
    ).resolves.toMatchObject({ organizationId: orgId });
  }, 60_000);

  it("laesst denselben Einladungslink kein zweites Mal zu", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    await expect(loeseEinladungEin(g.__inviteToken, "nochEinLangesGeheimwort")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  }, 60_000);

  it("weist eine bereits vergebene Adresse ab", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Doppelt",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "adresse_vergeben" });
  }, 60_000);

  // ---- Offene Einladungen: erneut senden, zurueckziehen, lesend aufloesen ----
  // Ausgangslage hier: chef + "neu@beispiel.de" (beide mit Passwort), Tarif pro
  // mit drei Plaetzen.

  /** Macht Platz im Tarif, indem noch offene (passwortlose) Einladungen fallen. */
  async function platzSchaffen() {
    await prisma.user.deleteMany({ where: { organizationId: orgId, passwordHash: null } });
  }

  it("verschickt eine offene Einladung erneut und entwertet den alten Link", async () => {
    const { ladeEin, sendeEinladungErneut, loeseEinladungEin } = await import("@/lib/auth/invite");
    const res = await ladeEin({
      organizationId: orgId,
      email: "zweit@beispiel.de",
      name: "Zweit",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    if (!res.ok) throw new Error("unerwartet");

    const erneut = await sendeEinladungErneut({
      userId: res.userId,
      organizationId: orgId,
      handelnderUserId: chefId,
    });
    expect(erneut.ok).toBe(true);
    if (!erneut.ok) throw new Error("unerwartet");
    expect(erneut.token).not.toBe(res.token);

    // Der Link aus der ersten Mail ist tot, nur der neue zieht.
    await expect(loeseEinladungEin(res.token, "einLangesGeheimwortAlt")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
    await expect(loeseEinladungEin(erneut.token, "einLangesGeheimwortNeu")).resolves.toMatchObject({
      ok: true,
    });
  }, 60_000);

  it("ruehrt ein bereits angenommenes Konto nicht an", async () => {
    const { sendeEinladungErneut, zieheEinladungZurueck } = await import("@/lib/auth/invite");
    // "zweit@beispiel.de" hat im Test davor ein Passwort gesetzt – ab da ist es
    // ein arbeitender Mensch und keine offene Einladung mehr.
    const angenommen = await prisma.user.findUnique({ where: { email: "zweit@beispiel.de" } });
    await expect(
      sendeEinladungErneut({ userId: angenommen.id, organizationId: orgId, handelnderUserId: chefId })
    ).resolves.toMatchObject({ ok: false, grund: "nicht_offen" });
    await expect(
      zieheEinladungZurueck({ userId: angenommen.id, organizationId: orgId, handelnderUserId: chefId })
    ).resolves.toMatchObject({ ok: false, grund: "nicht_offen" });
    expect(await prisma.user.findUnique({ where: { id: angenommen.id } })).not.toBeNull();
  }, 60_000);

  it("gibt beim Zurueckziehen den Tarifplatz wieder frei", async () => {
    const { ladeEin, zieheEinladungZurueck } = await import("@/lib/auth/invite");
    const { checkLimit } = await import("@/lib/saas/plans");
    // Alle drei Plaetze sind belegt (chef, neu, zweit) – genau die Lage, in der
    // eine misslungene Einladung die Organisation frueher handlungsunfaehig
    // gemacht hat.
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "vierte@beispiel.de",
        name: "Vierte",
        rolle: "vermittler",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "limit_erreicht" });

    // "neu@beispiel.de" wieder zur offenen Einladung machen (Konto ohne
    // Passwort, invitedAt gesetzt) – so sieht ein Fehlschlag beim Mailversand aus.
    const offen = await prisma.user.findUnique({ where: { email: "neu@beispiel.de" } });
    await prisma.user.update({ where: { id: offen.id }, data: { passwordHash: null } });

    const vorher = await checkLimit(orgId, "usersPerOrg");
    await expect(
      zieheEinladungZurueck({ userId: offen.id, organizationId: orgId, handelnderUserId: chefId })
    ).resolves.toMatchObject({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: offen.id } })).toBeNull();

    const nachher = await checkLimit(orgId, "usersPerOrg");
    expect(nachher.used).toBe(vorher.used - 1);
    // Der freie Platz ist sofort wieder nutzbar.
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "vierte@beispiel.de",
        name: "Vierte",
        rolle: "vermittler",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: true });
  }, 60_000);

  it("laesst eine fremde Organisation nicht an die Einladung", async () => {
    const { ladeEin, sendeEinladungErneut, zieheEinladungZurueck } = await import(
      "@/lib/auth/invite"
    );
    await platzSchaffen();
    const fremdeOrg = await prisma.organization.create({
      data: { name: "Fremd Finanz", slug: "fremd-finanz" },
    });
    const res = await ladeEin({
      organizationId: orgId,
      email: "opfer@beispiel.de",
      name: "Opfer",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    if (!res.ok) throw new Error("unerwartet");

    // Mit der userId einer FREMDEN Organisation darf nichts passieren – die
    // Pruefung darf nicht allein an der Rolle haengen.
    await expect(
      sendeEinladungErneut({
        userId: res.userId,
        organizationId: fremdeOrg.id,
        handelnderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "nicht_offen" });
    await expect(
      zieheEinladungZurueck({
        userId: res.userId,
        organizationId: fremdeOrg.id,
        handelnderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "nicht_offen" });
    expect(await prisma.user.findUnique({ where: { id: res.userId } })).not.toBeNull();
  }, 60_000);

  it("nennt beim lesenden Aufloesen Organisation und Einladenden", async () => {
    const { ladeEin, liesEinladung } = await import("@/lib/auth/invite");
    await platzSchaffen();
    const res = await ladeEin({
      organizationId: orgId,
      email: "kontext@beispiel.de",
      name: "Kontext",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    if (!res.ok) throw new Error("unerwartet");

    await expect(liesEinladung(res.token)).resolves.toMatchObject({
      organisation: "Beispiel Finanz",
      einladenderName: "Chefin",
      name: "Kontext",
    });
    // Das Nachschlagen darf den Link nicht verbrauchen.
    const zeile = await prisma.authToken.findFirst({
      where: { userId: res.userId, zweck: "einladung", usedAt: null },
    });
    expect(zeile).not.toBeNull();
    await expect(liesEinladung("unbekannt")).resolves.toBeNull();
  }, 60_000);

  it("loescht kein Konto, das zwischen Pruefung und Loeschen angenommen wurde", async () => {
    const { zieheEinladungZurueck } = await import("@/lib/auth/invite");
    const offen = await prisma.user.findUnique({ where: { email: "kontext@beispiel.de" } });

    // Der Eingeladene setzt sein Passwort, nachdem die Vorpruefung gelesen hat.
    await prisma.user.update({
      where: { id: offen.id },
      data: { passwordHash: "scrypt$16384$abc$def" },
    });
    // Manuelles Monkeypatch statt vi.spyOn – siehe Anmerkung in
    // tests/signup-db.test.ts: vi.spyOn beschaedigt den Prisma-Delegate.
    const echtesFindUnique = prisma.user.findUnique.bind(prisma.user);
    let ersterAufruf = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.user.findUnique = ((...args: any[]) => {
      if (ersterAufruf) {
        ersterAufruf = false;
        // Der veraltete Stand, den die Vorpruefung gesehen haette.
        return Promise.resolve({ ...offen, passwordHash: null });
      }
      return echtesFindUnique(...args);
    }) as typeof prisma.user.findUnique;

    try {
      await expect(
        zieheEinladungZurueck({
          userId: offen.id,
          organizationId: orgId,
          handelnderUserId: chefId,
        })
      ).resolves.toMatchObject({ ok: false, grund: "nicht_offen" });
      // Das arbeitende Konto steht noch.
      expect(await echtesFindUnique({ where: { id: offen.id } })).not.toBeNull();
    } finally {
      prisma.user.findUnique = echtesFindUnique;
    }
  }, 60_000);
});
