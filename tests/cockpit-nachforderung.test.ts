import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { buildMissingGroups } from "@/lib/cases/cockpit";

const position = (over: Record<string, unknown>) =>
  ({
    key: "wohnflaechenberechnung",
    name: "Wohnflächenberechnung",
    customerDescription: "Bitte hochladen.",
    documentType: "wohnflaechenberechnung",
    level: "optional",
    scope: "allgemein",
    platforms: [],
    status: "unvollstaendig",
    matchedDocuments: 1,
    customerVisible: true,
    effectiveRequiredCount: 1,
    offeneAntragsteller: [],
    ...over,
  }) as never;

describe("Fallseite: Was fehlt noch?", () => {
  it("zeigt eine behaltene, aber nachgeforderte optionale Unterlage unter Sofort – mit Grund", () => {
    // Fall Schmidt, 06.09.2026: Die Kopfzeile zaehlte 7, die Liste zeigte 6 –
    // die nachgeforderte Wohnflaechenberechnung ist "optional" und fiel durch.
    const groups = buildMissingGroups([position({ nachforderungGruende: ["Bitte nach WoFlV nachreichen."] })], [], []);
    const sofort = groups.find((g) => g.key === "sofort");
    expect(sofort?.items.map((i) => i.title)).toEqual(["Wohnflächenberechnung"]);
    expect(sofort?.items[0]!.reason).toBe("Vorhandene Unterlage wird nicht anerkannt: Bitte nach WoFlV nachreichen.");
  });

  it("laesst eine gewoehnliche optionale Position weiterhin aus der Liste", () => {
    const groups = buildMissingGroups([position({ status: "offen", matchedDocuments: 0 })], [], []);
    expect(groups).toEqual([]);
  });
});
