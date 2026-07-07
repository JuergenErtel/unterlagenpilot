export interface GeoResult {
  lat: number;
  lon: number;
  bundesland?: string;
  displayName: string;
}

interface NominatimItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: { state?: string };
}

/** Reiner Parser der Nominatim-Antwort (erstes Ergebnis). null bei ungültig/leer. */
export function parseNominatim(json: unknown): GeoResult | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as NominatimItem;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    bundesland: first.address?.state,
    displayName: first.display_name ?? "",
  };
}

/** Geocodiert eine Adresse über OSM/Nominatim. null wenn nicht gefunden. */
export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    countrycodes: "de",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "BaufiDesk/1.0 (baufidesk.de)",
      "Accept-Language": "de",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return parseNominatim(await res.json());
}

export const OSM_ATTRIBUTION = "© OpenStreetMap-Mitwirkende";
