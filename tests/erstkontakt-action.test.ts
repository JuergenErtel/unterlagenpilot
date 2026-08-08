import { describe, it, expect, vi, beforeEach } from "vitest";

const ctx = { organizationId: "o1", userId: "u1" };
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx,
    caseRow: { id: caseId, organizationId: "o1" },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const vorbereiten = vi.fn();
vi.mock("@/lib/cases/erstkontakt", () => ({ bereiteErstkontaktVor: vorbereiten }));

const db = { fall: null as any, nachrichten: [] as any[] };
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      // Simuliert Prisma so weit, wie es fuer den Ordnungs-Test noetig ist:
      // NUR wenn `orderBy: { position: "asc" }` uebergeben wird, wird sortiert.
      // Ohne diesen Zusatz (der eigentliche Fehler, den es hier abzusichern gilt)
      // kaeme die rohe, unsortierte Reihenfolge zurueck.
      findUnique: vi.fn(async (args: any) => {
        if (!db.fall) return null;
        const sortiertNachPosition = args?.include?.applicants?.orderBy?.position === "asc";
        const applicants = sortiertNachPosition
          ? [...db.fall.applicants].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          : db.fall.applicants;
        return { ...db.fall, applicants };
      }),
    },
    generatedMessage: {
      // Die Karte liest jetzt genau die am Fall vermerkte Nachricht.
      findUnique: vi.fn(async ({ where }: any) =>
        db.nachrichten.find((n) => n.id === where.id) ?? null
      ),
    },
  },
}));

beforeEach(() => {
  vorbereiten.mockReset();
  db.fall = {
    id: "c1",
    erstkontaktVorbereitetAm: null,
    erstkontaktMessageId: null,
    applicants: [{ email: "anna@example.de" }],
  };
  db.nachrichten = [];
});

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

describe("Erstkontakt-Stand", () => {
  it("meldet 'noch nicht vorbereitet' fuer einen frischen Fall", async () => {
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    await expect(ladeErstkontaktStand("c1")).resolves.toMatchObject({
      vorbereitetAm: null,
      messageId: null,
      versendet: false,
      versendetAm: null,
      empfaenger: "anna@example.de",
    });
  });

  it("prueft den Fallzugriff, bevor sie die Empfaenger-Adresse preisgibt", async () => {
    // Diese Datei traegt "use server": ladeErstkontaktStand ist ein eigener,
    // oeffentlich erreichbarer Endpunkt. Ohne requireCaseAccess koennte jede
    // beliebige Fall-ID abgefragt werden, auch aus fremden Organisationen.
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    await ladeErstkontaktStand("c1");
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
  });

  it("meldet den Entwurf, sobald einer da ist", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.fall.erstkontaktMessageId = "msg1";
    db.nachrichten = [{ id: "msg1", sent: false, sentAt: null, createdAt: new Date("2026-08-08") }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.messageId).toBe("msg1");
    expect(stand.versendet).toBe(false);
    expect(stand.versendetAm).toBeNull();
  });

  it("haelt einen fremden Nachforderungs-Entwurf NICHT fuer den Erstkontakt", async () => {
    // "erstnachforderung" ist ein ganz normaler Vorlagentyp, den der Vermittler
    // jederzeit selbst erzeugen kann. Vorher liess ein alter, nie versendeter
    // Nachforderungsentwurf die Karte "Entwurf liegt bereit" behaupten, obwohl
    // nie ein Erstkontakt vorbereitet wurde und kein Selbstauskunfts-Link
    // existierte.
    db.nachrichten = [
      { id: "fremd1", sent: false, sentAt: null, createdAt: new Date("2026-07-01") },
    ];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.vorbereitetAm).toBeNull();
    expect(stand.messageId).toBeNull();
    expect(stand.versendet).toBe(false);
  });

  it("meldet 'nicht vorbereitet', wenn der vermerkte Entwurf geloescht wurde", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.fall.erstkontaktMessageId = "weg";
    db.nachrichten = [];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.messageId).toBeNull();
  });

  it("meldet den tatsaechlichen Sendezeitpunkt, nicht den Entwurfszeitpunkt", async () => {
    // Regression: `createdAt` ist der Moment der Entwurfserstellung. Liegen
    // zwischen Vorbereiten und Senden Tage, behauptete die Karte sonst ein
    // falsches Datum.
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-01");
    db.fall.erstkontaktMessageId = "msg1";
    db.nachrichten = [
      { id: "msg1", sent: true, createdAt: new Date("2026-08-01"), sentAt: new Date("2026-08-08") },
    ];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.versendet).toBe(true);
    expect(stand.versendetAm).toEqual(new Date("2026-08-08"));
  });

  it("meldet 'versendet' auch fuer Altbestand ohne bekannten Sendezeitpunkt, aber ohne Datum zu behaupten", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-01");
    db.fall.erstkontaktMessageId = "msg1";
    db.nachrichten = [{ id: "msg1", sent: true, createdAt: new Date("2026-08-01"), sentAt: null }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.versendet).toBe(true);
    expect(stand.versendetAm).toBeNull();
  });

  it("nutzt beim Lesen dieselbe Antragsteller-Reihenfolge wie der tatsaechliche Versand (Position aufsteigend)", async () => {
    // sendMessageByEmail (src/lib/actions/messages.ts) liest die Antragsteller
    // mit `orderBy: { position: "asc" }`. Ohne dieselbe Sortierung hier koennte
    // die Karte eine andere Adresse zeigen als die, an die tatsaechlich
    // gesendet wird - genau das soll dieser Test verhindern.
    db.fall.applicants = [
      { position: 1, email: null },
      { position: 2, email: "zwei@example.de" },
    ];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.empfaenger).toBe("zwei@example.de");

    const { prisma } = await import("@/lib/db");
    expect(prisma.case.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { applicants: { orderBy: { position: "asc" }, select: { email: true } } },
      })
    );
  });

  it("waehlt bei mehreren gueltigen Adressen dieselbe wie sendMessageByEmail (die mit der niedrigsten Position)", async () => {
    // Ohne die Sortierung nach Position kaeme unsortiert "zwei@example.de"
    // zurueck (so, wie es roh in der DB-Zeile stuende) - mit ihr korrekt
    // "eins@example.de", genau wie beim tatsaechlichen Versand.
    db.fall.applicants = [
      { position: 2, email: "zwei@example.de" },
      { position: 1, email: "eins@example.de" },
    ];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.empfaenger).toBe("eins@example.de");
  });
});

describe("Erstkontakt vorbereiten (Action)", () => {
  it("prueft den Fallzugriff, bevor sie etwas tut", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
  });

  it("reicht die handelnde Person weiter", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    expect(vorbereiten).toHaveBeenCalledWith("c1", { actorUserId: "u1" });
  });

  it("tut ohne caseId nichts", async () => {
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({}));
    expect(vorbereiten).not.toHaveBeenCalled();
  });
});
