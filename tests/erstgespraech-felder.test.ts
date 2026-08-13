import { describe, it, expect } from "vitest";
import type { CanonicalFinancing } from "@/lib/domain/canonical";

describe("Konditionswuensche im kanonischen Modell", () => {
  it("traegt Zinsbindung, Sondertilgung und Wunschrate", () => {
    const f: CanonicalFinancing = {
      kaufpreis: 895000,
      zinsbindungJahre: 15,
      sondertilgungProzentJaehrlich: 5,
      wunschrateMonatlich: 2400,
    };
    expect(f.zinsbindungJahre).toBe(15);
    expect(f.sondertilgungProzentJaehrlich).toBe(5);
    expect(f.wunschrateMonatlich).toBe(2400);
  });
});
