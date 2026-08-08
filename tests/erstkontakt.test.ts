import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const faelle: Record<string, any> = {};
// Zwei Organisationen mit unterschiedlichen Absenderdaten – Grundlage des
// Mandantenfaehigkeits-Tests weiter unten.
const orgs: Record<string, any> = {
  o1: {
    name: "Baufi Wörth",
    street: "Ottstr. 9",
    zip: "76744",
    city: "Wörth",
    website: "www.baufi-woerth.de",
  },
  o2: {
    name: "Nordfinanz Beratung",
    street: "Hafenstr. 4",
    zip: "20457",
    city: "Hamburg",
    website: "www.nordfinanz.example",
  },
};
/** Organisationseigene Vorlagen, je Organisation hoechstens eine. */
const vorlagen: Record<string, any> = {};
vi.mock("@/lib/db", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(async ({ where }: any) => orgs[where.id] ?? null),
    },
    messageTemplate: {
      findFirst: vi.fn(async ({ where }: any) => vorlagen[where.organizationId] ?? null),
    },
    case: {
      // Simuliert Prisma nur so weit, wie es hier noetig ist: NUR mit
      // `orderBy: { position: "asc" }` kommen die Antragsteller sortiert
      // zurueck – ohne den Zusatz die rohe Reihenfolge.
      findUnique: vi.fn(async ({ where, include }: any) => {
        const f = faelle[where.id];
        if (!f) return null;
        const sortiert = include?.applicants?.orderBy?.position === "asc";
        return {
          ...f,
          applicants: sortiert
            ? [...f.applicants].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
            : f.applicants,
        };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(faelle[where.id], data);
        return faelle[where.id];
      }),
      // Simuliert die atomare Reservierung: schlaegt fehl (count 0), wenn die
      // Bedingung im "where" (z.B. erstkontaktVorbereitetAm: null) nicht mehr
      // zutrifft – etwa weil ein anderer Aufruf bereits reserviert hat.
      updateMany: vi.fn(async ({ where, data }: any) => {
        const f = faelle[where.id];
        if (!f) return { count: 0 };
        if ("erstkontaktVorbereitetAm" in where && f.erstkontaktVorbereitetAm !== where.erstkontaktVorbereitetAm) {
          return { count: 0 };
        }
        Object.assign(f, data);
        return { count: 1 };
      }),
    },
    document: { findMany: vi.fn(async () => []) },
    generatedMessage: {
      create: vi.fn(async ({ data }: any) => ({ id: "msg1", ...data })),
    },
  },
}));

vi.mock("@/lib/security/self-disclosure-link", () => ({
  createSelfDisclosureLink: vi.fn(async () => ({
    linkId: "sd1",
    token: "tok-sd",
    url: "https://baufidesk.de/selbstauskunft/tok-sd",
    expiresAt: new Date(),
  })),
}));
vi.mock("@/lib/security/upload-link", () => ({
  createSecureUploadLink: vi.fn(async () => ({
    linkId: "up1",
    token: "tok-up",
    url: "https://baufidesk.de/upload/tok-up",
    expiresAt: new Date(),
  })),
}));

// Wird NICHT gemockt, sondern beobachtet: diese Task darf nichts versenden.
const sendSpy = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: sendSpy,
  isEmailConfigured: () => true,
}));

function fall(extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    organizationId: "o1",
    financingType: "kauf",
    primaryEmploymentType: "angestellter",
    kapitalanlage: false,
    erstkontaktVorbereitetAm: null,
    applicants: [
      { id: "a1", position: 1, vorname: "Anna", nachname: "Beispiel", email: "anna@example.de" },
    ],
    ...extra,
  };
}

beforeEach(() => {
  // Ohne das haeufen sich Aufrufe ueber mehrere `it`-Bloecke hinweg an (der
  // dynamische Import cached das Modul), und die Aufruf-Zaehl-Assertions
  // weiter unten wuerden gegen die falsche Zahl pruefen. Abweichung vom
  // Brief-Wortlaut, siehe Bericht.
  vi.clearAllMocks();
  for (const k of Object.keys(faelle)) delete faelle[k];
  for (const k of Object.keys(vorlagen)) delete vorlagen[k];
  faelle.c1 = fall();
  sendSpy.mockReset();
});

describe("Erstkontakt vorbereiten", () => {
  it("verschickt NICHTS", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("legt einen unversendeten Nachrichtenentwurf an", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    const res = await bereiteErstkontaktVor("c1");
    expect(res).toMatchObject({ status: "vorbereitet", messageId: "msg1" });

    const { prisma } = await import("@/lib/db");
    const arg = (prisma.generatedMessage.create as any).mock.calls[0][0].data;
    expect(arg.sent).toBe(false);
    expect(arg.channel).toBe("email");
  });

  it("nennt im Entwurf beide Links", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("https://baufidesk.de/upload/tok-up");
    expect(body).toContain("https://baufidesk.de/selbstauskunft/tok-sd");
  });

  it("spricht den Antragsteller mit Namen an", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("Anna");
  });

  it("gruesst den Antragsteller, an den die Mail spaeter tatsaechlich geht", async () => {
    // `sendMessageByEmail` und die Erstkontakt-Karte sortieren nach position.
    // Ohne dieselbe Sortierung hier stuende im schlechten Fall "Hallo Bernd
    // Beispiel," in einer Mail an anna@…
    faelle.c1 = fall({
      applicants: [
        { id: "a2", position: 2, vorname: "Bernd", nachname: "Beispiel", email: "bernd@example.de" },
        { id: "a1", position: 1, vorname: "Anna", nachname: "Beispiel", email: "anna@example.de" },
      ],
    });
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("Hallo Anna Beispiel,");
    expect(body).not.toContain("Bernd");
  });

  it("gruesst den Mitantragsteller, wenn der erste keine Adresse hat", async () => {
    faelle.c1 = fall({
      applicants: [
        { id: "a2", position: 2, vorname: "Bernd", nachname: "Beispiel", email: "bernd@example.de" },
        { id: "a1", position: 1, vorname: "Anna", nachname: "Beispiel", email: null },
      ],
    });
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("Hallo Bernd Beispiel,");
  });

  it("verlangt genau die Unterlagen, die der Kunde spaeter auf der Upload-Seite sieht", async () => {
    // Der Fehler, den dieser Test verhindert: Mail und Upload-Seite bauten ihre
    // Liste aus unterschiedlichen Angaben. Ein Selbststaendiger las in der Mail
    // "BWA, Jahresabschluss" und fand auf der Seite "Gehaltsabrechnungen" –
    // was er hochlud, passte zu keiner sichtbaren Position.
    faelle.c1 = fall({
      primaryEmploymentType: "selbststaendiger",
      property: { objektart: "eigentumswohnung", nutzung: "eigennutzung" },
    });
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;

    // Genau der Weg der Upload-Seite: gemeinsame Eingabe -> Checkliste -> Kundensicht.
    const { checklistEingabeFuerFall } = await import("@/lib/checklists/case-input");
    const { buildChecklistForCase } = await import("@/lib/checklists/engine");
    const { baueKundenfortschritt } = await import("@/lib/upload/kundenansicht");
    const seite = baueKundenfortschritt({
      positionen: buildChecklistForCase(checklistEingabeFuerFall(faelle.c1), []),
      dokumente: [],
    });

    expect(seite.positionen.length).toBeGreaterThan(0);
    for (const p of seite.positionen) expect(body).toContain(p.name);
    expect(body).toContain("Aktuelle BWA");
    expect(body).not.toContain("Gehaltsabrechnungen");
    // Objektbezug kommt jetzt auch in der Mail an (Eigentumswohnung).
    expect(body).toContain("Teilungserklärung");
  });

  it("unterschreibt mit den Daten der jeweiligen Organisation, nicht mit einer festen Signatur", async () => {
    // Seit dem Registrierungsweg kann ein zweiter Vermittler freigeschaltet
    // werden. Der fest verdrahtete Absender aus `buildEmail` haette dessen
    // Kunden Juergens Anschrift geschickt.
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    const { prisma } = await import("@/lib/db");

    await bereiteErstkontaktVor("c1");
    const erste = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;

    faelle.c2 = fall({ id: "c2", organizationId: "o2" });
    await bereiteErstkontaktVor("c2");
    const zweite = (prisma.generatedMessage.create as any).mock.calls[1][0].data.body as string;

    expect(erste).toContain("Baufi Wörth");
    expect(erste).toContain("Ottstr. 9");
    expect(zweite).toContain("Nordfinanz Beratung");
    expect(zweite).toContain("Hafenstr. 4");
    expect(zweite).toContain("20457 Hamburg");
    // Entscheidend: die Daten der ersten Organisation tauchen bei der zweiten
    // nirgends auf.
    expect(zweite).not.toContain("Ottstr. 9");
    expect(zweite).not.toContain("baufi-woerth");
  });

  it("bevorzugt die eigene Vorlage der Organisation", async () => {
    vorlagen.o1 = {
      subject: "Ihre Unterlagen für uns",
      body: "{{anrede}}\n\n{{unterlagen}}\n\n{{uploadLink}}\n\n{{signatur}}",
    };
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const data = (prisma.generatedMessage.create as any).mock.calls[0][0].data;
    expect(data.subject).toBe("Ihre Unterlagen für uns");
    expect(data.body).toContain("Hallo Anna Beispiel,");
    expect(data.body).toContain("Baufi Wörth");
    // Kein Rest der Standardvorlage.
    expect(data.body).not.toContain("vielen Dank für Ihr Vertrauen");
  });

  it("laesst keinen unaufgeloesten Platzhalter im Entwurf stehen", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).not.toMatch(/\{\{\w+\}\}/);
  });

  it("bereitet keinen zweiten Entwurf vor", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    await expect(bereiteErstkontaktVor("c1")).resolves.toEqual({ status: "schon_vorbereitet" });
    const { prisma } = await import("@/lib/db");
    expect((prisma.generatedMessage.create as any).mock.calls).toHaveLength(1);
  });

  it("bereitet nichts vor, wenn keine E-Mail-Adresse hinterlegt ist", async () => {
    faelle.c1 = fall({ applicants: [{ id: "a1", position: 1, vorname: "Anna", email: null }] });
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await expect(bereiteErstkontaktVor("c1")).resolves.toEqual({ status: "kein_empfaenger" });
    const { prisma } = await import("@/lib/db");
    expect((prisma.generatedMessage.create as any).mock.calls).toHaveLength(0);
  });

  it("meldet einen unbekannten Fall statt zu werfen", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await expect(bereiteErstkontaktVor("gibtsnicht")).resolves.toEqual({ status: "kein_empfaenger" });
  });
});
