import { describe, expect, it } from "vitest";
import { istMetaAnzeige } from "@/lib/leads/meta-anzeige";
import { herkunftDetail } from "@/lib/leads/baufivergleicher/mapping";
import type { Uebergabe } from "@/lib/leads/baufivergleicher/vertrag";

describe("istMetaAnzeige", () => {
  it("erkennt genau das, was die Uebergabe fuer meta-ads schreibt", () => {
    // Kopplung festnageln: aendert herkunftDetail den Text, faellt dieser Test.
    const detail = herkunftDetail({
      herkunft: { quelleText: "meta-ads", kampagne: "baufi-herbst" },
    } as Uebergabe);
    expect(istMetaAnzeige("baufivergleicher", detail)).toBe(true);
  });

  it("markiert Google-Anzeigen, Rohkennungen und fehlende Details nicht", () => {
    expect(istMetaAnzeige("baufivergleicher", "Google-Anzeige · x")).toBe(false);
    expect(istMetaAnzeige("baufivergleicher", "landingpage-ads")).toBe(false);
    expect(istMetaAnzeige("baufivergleicher", null)).toBe(false);
  });

  it("markiert nur baufivergleicher-Faelle", () => {
    expect(istMetaAnzeige("finlink", "Meta-Anzeige")).toBe(false);
  });
});
