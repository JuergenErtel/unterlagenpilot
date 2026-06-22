export const TOPPLUS_ATTRIBUTION = "© BKG (TopPlusOpen)";

/** Lon/Lat (EPSG:4326) → Web-Mercator-Meter (EPSG:3857). Reine Mathematik. */
function lonLatTo3857(lon: number, lat: number): { x: number; y: number } {
  const x = (lon * 20037508.34) / 180;
  const yRad = Math.log(Math.tan(((90 + lat) * Math.PI) / 360));
  const y = (yRad / (Math.PI / 180)) * (20037508.34 / 180);
  return { x, y };
}

/**
 * Baut eine BKG-TopPlusOpen-GetMap-URL, zentriert auf (lat, lon), quadratische
 * BBox mit Kantenlänge 2*radiusMeters in EPSG:3857 (Achsenreihenfolge x,y → kein Swap).
 */
export function buildTopPlusUrl(
  lat: number,
  lon: number,
  opts: { radiusMeters?: number; size?: number; layer?: string } = {}
): string {
  const radius = opts.radiusMeters ?? 300;
  const size = opts.size ?? 600;
  const layer = opts.layer ?? "web";
  const { x, y } = lonLatTo3857(lon, lat);
  const bbox = [x - radius, y - radius, x + radius, y + radius].map((n) => n.toFixed(2)).join(",");
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: bbox,
    WIDTH: String(size),
    HEIGHT: String(size),
    FORMAT: "image/png",
  });
  return `https://sgx.geodatenzentrum.de/wms_topplus_open?${params.toString()}`;
}

/** Holt das Kartenbild als PNG-Buffer. Wirft bei HTTP-Fehler. */
export async function fetchMapPng(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "UnterlagenPilot/1.0 (immocockpit24.de)" } });
  if (!res.ok) throw new Error(`TopPlusOpen HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("image")) throw new Error("TopPlusOpen: kein Bild zurückgegeben");
  return Buffer.from(await res.arrayBuffer());
}
