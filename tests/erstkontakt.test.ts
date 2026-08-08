import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const faelle: Record<string, any> = {};
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: vi.fn(async ({ where }: any) => faelle[where.id] ?? null),
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
    applicants: [{ id: "a1", vorname: "Anna", nachname: "Beispiel", email: "anna@example.de" }],
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

  it("bereitet keinen zweiten Entwurf vor", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    await expect(bereiteErstkontaktVor("c1")).resolves.toEqual({ status: "schon_vorbereitet" });
    const { prisma } = await import("@/lib/db");
    expect((prisma.generatedMessage.create as any).mock.calls).toHaveLength(1);
  });

  it("bereitet nichts vor, wenn keine E-Mail-Adresse hinterlegt ist", async () => {
    faelle.c1 = fall({ applicants: [{ id: "a1", vorname: "Anna", email: null }] });
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
