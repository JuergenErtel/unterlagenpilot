import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosureLink: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

import { ladeSelbstauskunftStand, ladeSelbstauskunftStandBatch } from "@/lib/cases/selbstauskunft-stand";

const MORGEN = new Date(Date.now() + 86_400_000);
const GESTERN = new Date(Date.now() - 86_400_000);
const VOR_5_TAGEN = new Date(Date.now() - 5 * 86_400_000);

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
});

describe("ladeSelbstauskunftStand", () => {
  it("meldet 'noch nicht erstellt', wenn es nie einen Link gab", async () => {
    findFirst.mockResolvedValue(null);
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand).toEqual({
      linkId: null,
      gueltig: false,
      begonnen: false,
      eingegangen: false,
      uebernommen: false,
      erstelltVorTagen: null,
      fortschritt: null,
      label: "noch nicht erstellt",
    });
  });

  it("erkennt einen gültigen Link, den der Kunde noch nicht geöffnet hat – DAS ist der Kernfall des Bugs: der Erstkontakt legt einen Link an, aber noch keinen SelfDisclosure-Datensatz (der entsteht erst, wenn der Kunde antwortet)", async () => {
    findFirst.mockResolvedValue({
      id: "link-1",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: null,
    });
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand.linkId).toBe("link-1");
    expect(stand.gueltig).toBe(true);
    expect(stand.begonnen).toBe(false);
    expect(stand.eingegangen).toBe(false);
    expect(stand.uebernommen).toBe(false);
    expect(stand.erstelltVorTagen).toBe(5);
    expect(stand.label).not.toBe("noch nicht erstellt");
    expect(stand.label).toBe("erstellt, noch nicht begonnen");
  });

  it("zeigt den Fortschritt, wenn der Kunde begonnen hat", async () => {
    findFirst.mockResolvedValue({
      id: "link-1",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: { currentStep: "objektstand", answers: {}, submittedAt: null, takenOverAt: null },
    });
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand.begonnen).toBe(true);
    expect(stand.eingegangen).toBe(false);
    expect(stand.fortschritt).not.toBeNull();
    expect(stand.label).toContain("begonnen, Schritt");
  });

  it("zeigt den Fortschritt auch fuer einen alten currentStep mit Personen-Praefix, statt 0 % zu melden", async () => {
    // Regression aus der Umstellung auf Personen-Spalten: `currentStep` steht
    // in der DB und wird nur beim Speichern neu geschrieben. Ein VOR dieser
    // Aufgabe begonnener Bogen traegt noch "p1.person_name" – ohne
    // Normalisierung in `fortschritt` faende sich die ID nie wieder, und der
    // Fortschrittsbalken des Vermittlers zeigt faelschlich 0 %.
    findFirst.mockResolvedValue({
      id: "link-1",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: { currentStep: "p1.person_name", answers: {}, submittedAt: null, takenOverAt: null },
    });
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand.fortschritt?.position).toBeGreaterThan(0);
    expect(stand.label).toContain("begonnen, Schritt");
  });

  it("meldet 'eingegangen', wenn abgesendet aber noch nicht übernommen", async () => {
    findFirst.mockResolvedValue({
      id: "link-1",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: { currentStep: "zusammenfassung", answers: {}, submittedAt: new Date(), takenOverAt: null },
    });
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand.eingegangen).toBe(true);
    expect(stand.uebernommen).toBe(false);
    expect(stand.label).toBe("eingegangen");
  });

  it("meldet 'übernommen', wenn der Vermittler die Angaben bereits übernommen hat", async () => {
    findFirst.mockResolvedValue({
      id: "link-1",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: { currentStep: "zusammenfassung", answers: {}, submittedAt: new Date(), takenOverAt: new Date() },
    });
    const stand = await ladeSelbstauskunftStand("case-1");
    expect(stand.eingegangen).toBe(false); // erledigt, kein offener Schritt mehr
    expect(stand.uebernommen).toBe(true);
    expect(stand.label).toBe("übernommen");
  });

  it("unterscheidet widerrufen von abgelaufen – beides ist 'nicht mehr gültig', aber nicht dasselbe", async () => {
    findFirst.mockResolvedValue({
      id: "link-1",
      active: false,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: null,
    });
    const widerrufen = await ladeSelbstauskunftStand("case-1");
    expect(widerrufen.gueltig).toBe(false);
    expect(widerrufen.label).toBe("widerrufen");

    findFirst.mockResolvedValue({
      id: "link-2",
      active: true,
      expiresAt: GESTERN,
      createdAt: VOR_5_TAGEN,
      disclosure: null,
    });
    const abgelaufen = await ladeSelbstauskunftStand("case-1");
    expect(abgelaufen.gueltig).toBe(false);
    expect(abgelaufen.label).toBe("abgelaufen, nicht begonnen");
  });

  it("nimmt bei mehreren Links den zuletzt erstellten", async () => {
    findFirst.mockResolvedValue({
      id: "link-neu",
      active: true,
      expiresAt: MORGEN,
      createdAt: VOR_5_TAGEN,
      disclosure: null,
    });
    await ladeSelbstauskunftStand("case-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case-1" }, orderBy: { createdAt: "desc" } })
    );
  });
});

describe("ladeSelbstauskunftStandBatch", () => {
  it("liefert für jeden Fall den Stand, auch wenn keiner einen Link hat", async () => {
    findMany.mockResolvedValue([]);
    const out = await ladeSelbstauskunftStandBatch(["c1", "c2"]);
    expect(out.get("c1")?.label).toBe("noch nicht erstellt");
    expect(out.get("c2")?.label).toBe("noch nicht erstellt");
  });

  it("gruppiert nach Fall und nimmt je Fall den neuesten Link", async () => {
    findMany.mockResolvedValue([
      { caseId: "c1", id: "link-2-neu", active: true, expiresAt: MORGEN, createdAt: new Date(), disclosure: null },
      { caseId: "c1", id: "link-1-alt", active: false, expiresAt: MORGEN, createdAt: GESTERN, disclosure: null },
    ]);
    const out = await ladeSelbstauskunftStandBatch(["c1"]);
    expect(out.get("c1")?.linkId).toBe("link-2-neu");
  });

  it("fragt ohne Fall-IDs die Datenbank gar nicht erst", async () => {
    const out = await ladeSelbstauskunftStandBatch([]);
    expect(out.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
