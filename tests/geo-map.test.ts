import { describe, it, expect } from "vitest";
import { buildTopPlusUrl } from "@/lib/geo/map";

describe("BKG TopPlusOpen WMS-URL", () => {
  it("baut eine korrekte GetMap-URL (EPSG:3857)", () => {
    const url = buildTopPlusUrl(0, 0, { radiusMeters: 300, size: 600 });
    expect(url.startsWith("https://sgx.geodatenzentrum.de/wms_topplus_open?")).toBe(true);
    expect(url).toContain("REQUEST=GetMap");
    expect(url).toContain("LAYERS=web");
    expect(url).toContain("CRS=EPSG%3A3857");
    expect(url).toContain("WIDTH=600");
    expect(url).toContain("HEIGHT=600");
    expect(url).toContain("FORMAT=image%2Fpng");
    // Bei lat/lon 0/0 ist das Web-Mercator-Zentrum (0,0) → BBox symmetrisch um 0.
    expect(url).toContain("BBOX=-300.00%2C-300.00%2C300.00%2C300.00");
  });

  it("verschiebt die BBox bei echten Koordinaten (lon>0 → x>0)", () => {
    const url = buildTopPlusUrl(49.05, 8.27); // Wörth a. Rhein (ungefähr)
    const bbox = decodeURIComponent(url.split("BBOX=")[1]!.split("&")[0]!);
    const [minx] = bbox.split(",").map(Number);
    expect(minx!).toBeGreaterThan(0);
  });
});
