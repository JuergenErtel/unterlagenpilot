import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { antwortAdresse } from "@/lib/email/antwortadresse";

const nutzer: Record<string, { email: string; active: boolean }> = {
  "berater-1": { email: "berater@example.de", active: true },
  "sachbearbeiterin": { email: "buero@example.de", active: true },
  "ausgeschieden": { email: "alt@example.de", active: false },
  "kaputt": { email: "keine adresse", active: true },
};

beforeEach(() => {
  findUnique.mockReset();
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => nutzer[where.id] ?? null);
});

describe("antwortAdresse", () => {
  it("nimmt den Berater des Falls, nicht den Absender", () => {
    // Klickt die Sachbearbeiterin die Nachforderung ab, kennt der Kunde
    // trotzdem nur seinen Berater – dorthin gehoert die Antwort.
    return expect(antwortAdresse("sachbearbeiterin", "berater-1")).resolves.toBe("berater@example.de");
  });

  it("faellt auf den Absender zurueck, wenn kein Berater am Fall haengt", async () => {
    expect(await antwortAdresse("sachbearbeiterin", null)).toBe("buero@example.de");
    expect(await antwortAdresse("sachbearbeiterin")).toBe("buero@example.de");
  });

  it("uebergeht ein stillgelegtes Konto – dort liest niemand", async () => {
    expect(await antwortAdresse("sachbearbeiterin", "ausgeschieden")).toBe("buero@example.de");
  });

  it("laesst den Kopf lieber weg als ihn kaputt zu setzen", async () => {
    // Ein ungueltiges Reply-To laesst manche Empfaenger die ganze Mail verwerfen.
    expect(await antwortAdresse("kaputt")).toBeUndefined();
    expect(await antwortAdresse("gibtesnicht")).toBeUndefined();
  });
});
