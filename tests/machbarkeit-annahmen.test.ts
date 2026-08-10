import { describe, it, expect, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { machbarkeitsAnnahmen: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";

describe("Annahmen laden", () => {
  it("nimmt die Vorgaben, wenn nichts hinterlegt ist", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await ladeAnnahmen("org1")).toEqual(VORGABE_ANNAHMEN);
  });

  it("ueberschreibt nur die hinterlegten Zinswerte", async () => {
    findUnique.mockResolvedValueOnce({
      basiszinsProzent: 4.1,
      aufschlagBis80: 0.15,
      aufschlagBis90: 0.35,
      aufschlagBis100: 0.7,
      aufschlagBis110: 1.4,
    });
    const a = await ladeAnnahmen("org1");
    expect(a.basiszinsProzent).toBe(4.1);
    expect(a.aufschlagBis110).toBe(1.4);
    // Fachliche Konstanten bleiben unveraendert – sie stehen im Code.
    expect(a.notarGrundbuchProzent).toBe(VORGABE_ANNAHMEN.notarGrundbuchProzent);
    expect(a.eigenleistungDeckelProzent).toBe(VORGABE_ANNAHMEN.eigenleistungDeckelProzent);
    expect(a.aufschlagUnschaerfe).toBe(VORGABE_ANNAHMEN.aufschlagUnschaerfe);
  });

  it("faellt bei einem Datenbankfehler auf die Vorgaben zurueck, statt zu kippen", async () => {
    findUnique.mockRejectedValueOnce(new Error("keine Verbindung"));
    expect(await ladeAnnahmen("org1")).toEqual(VORGABE_ANNAHMEN);
  });
});
