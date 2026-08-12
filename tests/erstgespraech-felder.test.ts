import { describe, it, expect } from "vitest";
import type { CanonicalFinancing } from "@/lib/domain/canonical";

describe("Konditionswuensche im kanonischen Modell", () => {
  it("traegt Zinsbindung, Sondertilgung und Wunschrate", () => {
    const f: CanonicalFinancing = {
      kaufpreis: 895000,
      zinsbindungJahre: 15,
      sondertilgungGewuenscht: true,
      wunschrateMonatlich: 2400,
    };
    expect(f.zinsbindungJahre).toBe(15);
    expect(f.sondertilgungGewuenscht).toBe(true);
    expect(f.wunschrateMonatlich).toBe(2400);
  });
});
