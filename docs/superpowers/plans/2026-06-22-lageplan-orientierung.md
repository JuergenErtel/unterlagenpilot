# Orientierungs-Lageplan + Geoportal-Direktlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus der Objektadresse einen Orientierungs-Lageplan (topografische Karte mit Markierung) erzeugen, als Falldokument (PDF) ablegen und einen Direktlink ins zuständige Landes-Geoportal geben.

**Architecture:** Reine, getestete Geo-Services (Geoportal-Tabelle, WMS-URL-Builder, Geocode-Parser) + isolierte HTTP-Calls; PDF über die bestehende pdfkit-Infrastruktur; Ablage über Storage/Document wie bei den anderen Features. Nur dokumentierte, freie Dienste (BKG TopPlusOpen WMS, OSM/Nominatim); kein ALKIS, kein Scraping, kein Schlüssel.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, pdfkit, BKG TopPlusOpen WMS, OSM/Nominatim, vitest.

## Global Constraints

- Nur dokumentierte, freie Schnittstellen; keine erratenen Endpunkte, kein Scraping. Karte: BKG TopPlusOpen WMS (`https://sgx.geodatenzentrum.de/wms_topplus_open`, Layer `web`, GetMap 1.3.0, EPSG:3857, image/png). Geocoding: OSM/Nominatim (`https://nominatim.openstreetmap.org/search`, `format=jsonv2`, `addressdetails=1`, `limit=1`, User-Agent Pflicht).
- Nur die Objektadresse verlässt das System — keine Antragsteller-/Personendaten. Keine Adresse in Logs (nur Erfolg/Fehler-Flag).
- Klares Label: „Orientierungs-Lageplan – kein amtlicher Auszug; amtliche Flurkarte über das Landes-Geoportal." (verbatim im PDF und UI). Quellen-/Lizenzangaben im PDF: „© BKG <Jahr>", „© OpenStreetMap-Mitwirkende".
- Tenant-Isolation: beide Actions über `requireCaseAccess`. PDF-Ablage `documentType: "flurkarte_lageplan"`, `scanStatus: "ready_for_ocr"`, `uploadSource: "vermittler"`.
- Adresse wird NICHT automatisch ins Objekt zurückgeschrieben. Kein Luftbild, keine interaktive Karte, kein ALKIS.
- Tests mit vitest; echte HTTP-Calls in Tests gemockt/nicht ausgeführt; pro Task committen.

---

### Task 1: Geoportal-Tabelle (16 Bundesländer) + Lookup

**Files:**
- Create: `src/lib/geo/geoportale.ts`
- Test: `tests/geoportale.test.ts`

**Interfaces:**
- Produces:
  - `interface GeoportalEntry { bundesland: string; label: string; url: string }`
  - `const BUNDESLAND_GEOPORTALE: GeoportalEntry[]` (16 Einträge)
  - `const GEOPORTAL_FALLBACK: GeoportalEntry` (bundesweit)
  - `function geoportalFor(bundesland?: string | null): { entry: GeoportalEntry; isFallback: boolean }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/geoportale.test.ts
import { describe, it, expect } from "vitest";
import { BUNDESLAND_GEOPORTALE, geoportalFor } from "@/lib/geo/geoportale";

describe("Geoportale", () => {
  it("hat 16 Bundesländer mit gültiger URL", () => {
    expect(BUNDESLAND_GEOPORTALE.length).toBe(16);
    for (const e of BUNDESLAND_GEOPORTALE) {
      expect(e.url.startsWith("https://")).toBe(true);
      expect(e.bundesland.length).toBeGreaterThan(0);
    }
  });

  it("findet ein Bundesland (auch case-insensitive) und liefert sonst den Fallback", () => {
    expect(geoportalFor("Bayern").entry.bundesland).toBe("Bayern");
    expect(geoportalFor("bayern").isFallback).toBe(false);
    expect(geoportalFor("Rheinland-Pfalz").entry.bundesland).toBe("Rheinland-Pfalz");
    expect(geoportalFor("Unbekanntland").isFallback).toBe(true);
    expect(geoportalFor(undefined).isFallback).toBe(true);
    expect(geoportalFor(null).isFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/geoportale.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/geo/geoportale.ts
export interface GeoportalEntry {
  bundesland: string;
  label: string;
  url: string;
}

// Offizielle Geoportale der Länder (Einstiegspunkte für die amtliche
// Liegenschaftskarte/Flurkarte). Stand 2026; bei Bedarf pflegen.
export const BUNDESLAND_GEOPORTALE: GeoportalEntry[] = [
  { bundesland: "Baden-Württemberg", label: "Geoportal BW", url: "https://www.geoportal-bw.de/" },
  { bundesland: "Bayern", label: "BayernAtlas", url: "https://geoportal.bayern.de/bayernatlas/" },
  { bundesland: "Berlin", label: "Geoportal Berlin (FIS-Broker)", url: "https://fbinter.stadt-berlin.de/fb/" },
  { bundesland: "Brandenburg", label: "Geoportal Brandenburg", url: "https://geoportal.brandenburg.de/" },
  { bundesland: "Bremen", label: "Geoportal Bremen", url: "https://geoportal.bremen.de/" },
  { bundesland: "Hamburg", label: "Geoportal Hamburg", url: "https://geoportal-hamburg.de/geoportal/" },
  { bundesland: "Hessen", label: "Geoportal Hessen", url: "https://www.geoportal.hessen.de/" },
  { bundesland: "Mecklenburg-Vorpommern", label: "Geoportal MV", url: "https://www.geoportal-mv.de/" },
  { bundesland: "Niedersachsen", label: "Geoportal Niedersachsen", url: "https://www.geoportal.niedersachsen.de/" },
  { bundesland: "Nordrhein-Westfalen", label: "TIM-online NRW", url: "https://www.tim-online.nrw.de/tim-online2/" },
  { bundesland: "Rheinland-Pfalz", label: "Geoportal RLP", url: "https://www.geoportal.rlp.de/" },
  { bundesland: "Saarland", label: "Geoportal Saarland", url: "https://geoportal.saarland.de/" },
  { bundesland: "Sachsen", label: "Geoportal Sachsen", url: "https://geoportal.sachsen.de/" },
  { bundesland: "Sachsen-Anhalt", label: "Geodatenportal Sachsen-Anhalt", url: "https://www.geodatenportal.sachsen-anhalt.de/" },
  { bundesland: "Schleswig-Holstein", label: "Geoportal SH", url: "https://www.geoportal-sh.de/" },
  { bundesland: "Thüringen", label: "Geoportal Thüringen", url: "https://www.geoportal-th.de/" },
];

export const GEOPORTAL_FALLBACK: GeoportalEntry = {
  bundesland: "Deutschland",
  label: "Geoportal.de (bundesweit)",
  url: "https://www.geoportal.de/",
};

export function geoportalFor(bundesland?: string | null): { entry: GeoportalEntry; isFallback: boolean } {
  if (!bundesland) return { entry: GEOPORTAL_FALLBACK, isFallback: true };
  const norm = bundesland.trim().toLowerCase();
  const found = BUNDESLAND_GEOPORTALE.find((e) => e.bundesland.toLowerCase() === norm);
  return found ? { entry: found, isFallback: false } : { entry: GEOPORTAL_FALLBACK, isFallback: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/geoportale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/geoportale.ts tests/geoportale.test.ts
git commit -m "feat(geo): Geoportal-Tabelle der 16 Bundesländer + Lookup"
```

---

### Task 2: WMS-URL-Builder (BKG TopPlusOpen) + Karten-Fetch

**Files:**
- Create: `src/lib/geo/map.ts`
- Test: `tests/geo-map.test.ts`

**Interfaces:**
- Produces:
  - `function buildTopPlusUrl(lat: number, lon: number, opts?: { radiusMeters?: number; size?: number; layer?: string }): string`
  - `async function fetchMapPng(url: string): Promise<Buffer>` (HTTP; in Tests nicht ausgeführt)
  - `const TOPPLUS_ATTRIBUTION = "© BKG (TopPlusOpen)"`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/geo-map.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/geo-map.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/geo/map.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/geo-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/map.ts tests/geo-map.test.ts
git commit -m "feat(geo): BKG TopPlusOpen WMS-URL-Builder + Karten-Fetch"
```

---

### Task 3: Geocoding (Nominatim) – Parser + Fetch

**Files:**
- Create: `src/lib/geo/geocode.ts`
- Test: `tests/geocode.test.ts`

**Interfaces:**
- Produces:
  - `interface GeoResult { lat: number; lon: number; bundesland?: string; displayName: string }`
  - `function parseNominatim(json: unknown): GeoResult | null` (rein, testbar)
  - `async function geocodeAddress(query: string): Promise<GeoResult | null>` (HTTP; in Tests nicht ausgeführt)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/geocode.test.ts
import { describe, it, expect } from "vitest";
import { parseNominatim } from "@/lib/geo/geocode";

describe("Geocoding-Parser (Nominatim)", () => {
  it("parst das erste Ergebnis inkl. Bundesland", () => {
    const json = [
      { lat: "49.0508", lon: "8.2731", display_name: "Ottstr. 9, 76744 Wörth am Rhein", address: { state: "Rheinland-Pfalz" } },
    ];
    const r = parseNominatim(json);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(49.0508, 3);
    expect(r!.lon).toBeCloseTo(8.2731, 3);
    expect(r!.bundesland).toBe("Rheinland-Pfalz");
    expect(r!.displayName).toContain("Wörth");
  });

  it("liefert null bei leerem oder ungültigem Ergebnis", () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim(null)).toBeNull();
    expect(parseNominatim({})).toBeNull();
    expect(parseNominatim([{ lat: "x", lon: "y", display_name: "" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/geocode.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/geo/geocode.ts
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
      "User-Agent": "UnterlagenPilot/1.0 (immocockpit24.de)",
      "Accept-Language": "de",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return parseNominatim(await res.json());
}

export const OSM_ATTRIBUTION = "© OpenStreetMap-Mitwirkende";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/geocode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/geocode.ts tests/geocode.test.ts
git commit -m "feat(geo): Nominatim-Geocoding (Parser + Fetch)"
```

---

### Task 4: PDF „Lageplan (Orientierung)"

**Files:**
- Modify: `src/lib/pdf/renderer.ts` (Funktion `renderLageplan` + Typ)
- Test: `tests/pdf.test.ts` (Render-Smoke ergänzen)

**Interfaces:**
- Consumes: Helfer `newDoc/coverHeader/heading/footer/docToBuffer`, `BrokerInfo` (bestehend).
- Produces:
  - `interface LageplanData { caseNumber: string; dateStr: string; broker: BrokerInfo; address: string; lat: number; lon: number; bundesland: string; geoportalLabel: string; geoportalUrl: string; attributions: string; mapPng: Buffer }`
  - `renderLageplan(data: LageplanData): Promise<Buffer>`

- [ ] **Step 1: Render-Smoke-Test ergänzen**

In `tests/pdf.test.ts` (Import `renderLageplan` in die bestehende Gruppe aus `@/lib/pdf/renderer` aufnehmen) + neuer Test. Ein 1×1-PNG als Test-Bild:

```typescript
// Minimal gültiges 1x1-PNG (für die Bild-Einbettung im Test)
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

it("erzeugt einen Lageplan-PDF mit eingebettetem Bild", async () => {
  const buf = await renderLageplan({
    caseNumber: "UP-2026-0001",
    dateStr: "22.06.2026",
    broker,
    address: "Ottstr. 9, 76744 Wörth am Rhein",
    lat: 49.0508,
    lon: 8.2731,
    bundesland: "Rheinland-Pfalz",
    geoportalLabel: "Geoportal RLP",
    geoportalUrl: "https://www.geoportal.rlp.de/",
    attributions: "© BKG (TopPlusOpen) · © OpenStreetMap-Mitwirkende",
    mapPng: PNG_1x1,
  });
  expect(isPdf(buf)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL ("renderLageplan is not exported").

- [ ] **Step 3: Implementierung**

Am Ende von `src/lib/pdf/renderer.ts` ergänzen:

```typescript
export interface LageplanData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  address: string;
  lat: number;
  lon: number;
  bundesland: string;
  geoportalLabel: string;
  geoportalUrl: string;
  attributions: string;
  mapPng: Buffer;
}

export async function renderLageplan(data: LageplanData): Promise<Buffer> {
  const doc = newDoc(`Lageplan ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Lageplan (Orientierung)", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Objekt");
  doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a");
  doc.text(data.address || "—");
  doc.fillColor("#6b7280").fontSize(8).text(`Koordinaten: ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)} · ${data.bundesland || "—"}`);

  heading(doc, "Kartenausschnitt");
  // Quadratisches Kartenbild, Objekt in der Mitte.
  const mapSize = 360;
  const x = 50;
  const y = doc.y + 4;
  try {
    doc.image(data.mapPng, x, y, { fit: [mapSize, mapSize] });
  } catch {
    doc.fillColor("#92400e").fontSize(9).text("Kartenbild konnte nicht eingebettet werden.");
  }
  // Markierung in der Bildmitte (Objektposition = Kartenzentrum).
  const cx = x + mapSize / 2;
  const cy = y + mapSize / 2;
  doc.strokeColor("#c0152f").lineWidth(2);
  doc.moveTo(cx - 8, cy).lineTo(cx + 8, cy).stroke();
  doc.moveTo(cx, cy - 8).lineTo(cx, cy + 8).stroke();
  doc.circle(cx, cy, 9).strokeColor("#c0152f").lineWidth(1.5).stroke();
  doc.y = y + mapSize + 8;

  heading(doc, "Amtliche Flurkarte");
  doc.font("Helvetica").fontSize(10).fillColor("#1f3a8a").text(`${data.geoportalLabel}: ${data.geoportalUrl}`, { link: data.geoportalUrl, underline: true });
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a").text("Den amtlichen Auszug über das Geoportal des Bundeslandes abrufen.");

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Orientierungs-Lageplan – kein amtlicher Auszug; amtliche Flurkarte über das Landes-Geoportal.",
    { width: 495 }
  );
  doc.fillColor("#9ca3af").fontSize(7).text(`Kartenquellen: ${data.attributions}`, { width: 495 });

  footer(doc, data.broker);
  return docToBuffer(doc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pdf.test.ts && npm run typecheck`
Expected: PASS + Typecheck ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/renderer.ts tests/pdf.test.ts
git commit -m "feat(geo): Lageplan-PDF mit Kartenbild + Markierung"
```

---

### Task 5: Server-Actions (Lageplan erzeugen + PDF ablegen)

**Files:**
- Create: `src/lib/actions/lageplan.ts`

**Interfaces:**
- Consumes: `requireCaseAccess`, `prisma`, `getStorage`, `audit`, `geocodeAddress`/`OSM_ATTRIBUTION`, `buildTopPlusUrl`/`fetchMapPng`/`TOPPLUS_ATTRIBUTION`, `geoportalFor`, `renderLageplan`, `getBrokerInfo`/`pdfFileName`.
- Produces:
  - `interface LageplanState { mapDataUri: string | null; lat: number | null; lon: number | null; bundesland: string | null; geoportalLabel: string; geoportalUrl: string; address: string; error?: string }`
  - `generateLageplanAction(caseId, _prev, formData): Promise<LageplanState>`
  - `interface LageplanPdfInput { address: string; lat: number; lon: number; bundesland: string; geoportalLabel: string; geoportalUrl: string; mapBase64: string }`
  - `saveLageplanPdfAction(caseId, input): Promise<{ documentId?: string; error?: string }>`

- [ ] **Step 1: Implementierung**

```typescript
// src/lib/actions/lageplan.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { geocodeAddress, OSM_ATTRIBUTION } from "@/lib/geo/geocode";
import { buildTopPlusUrl, fetchMapPng, TOPPLUS_ATTRIBUTION } from "@/lib/geo/map";
import { geoportalFor } from "@/lib/geo/geoportale";
import { renderLageplan } from "@/lib/pdf/renderer";
import { getBrokerInfo, pdfFileName } from "@/lib/pdf/case-pdf";

export interface LageplanState {
  mapDataUri: string | null;
  lat: number | null;
  lon: number | null;
  bundesland: string | null;
  geoportalLabel: string;
  geoportalUrl: string;
  address: string;
  error?: string;
}

function emptyState(address: string): LageplanState {
  const { entry } = geoportalFor(null);
  return {
    mapDataUri: null,
    lat: null,
    lon: null,
    bundesland: null,
    geoportalLabel: entry.label,
    geoportalUrl: entry.url,
    address,
    error: undefined,
  };
}

export async function generateLageplanAction(
  caseId: string,
  _prev: LageplanState,
  formData: FormData
): Promise<LageplanState> {
  const { ctx } = await requireCaseAccess(caseId);
  const address = String(formData.get("address") ?? "").trim();
  if (!address) return { ...emptyState(""), error: "Bitte eine Objektadresse eingeben." };

  // Geocoding (nur Objektadresse; keine Adresse ins Log).
  let geo;
  try {
    geo = await geocodeAddress(address);
  } catch {
    return { ...emptyState(address), error: "Adress-Suche derzeit nicht möglich. Bitte später erneut versuchen." };
  }
  if (!geo) {
    return { ...emptyState(address), error: "Adresse nicht gefunden. Bitte präzisieren – der Geoportal-Link unten funktioniert weiterhin." };
  }

  const { entry } = geoportalFor(geo.bundesland);

  // Kartenbild holen.
  let mapDataUri: string | null = null;
  try {
    const png = await fetchMapPng(buildTopPlusUrl(geo.lat, geo.lon));
    mapDataUri = `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Karte optional – Koordinaten/Link bleiben nutzbar.
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "lageplan", geocoded: true, map: mapDataUri != null, bundesland: geo.bundesland ?? null },
  });

  revalidatePath(`/cases/${caseId}/lageplan`);
  return {
    mapDataUri,
    lat: geo.lat,
    lon: geo.lon,
    bundesland: geo.bundesland ?? null,
    geoportalLabel: entry.label,
    geoportalUrl: entry.url,
    address,
    error: mapDataUri ? undefined : "Karte derzeit nicht verfügbar – Koordinaten und Geoportal-Link sind nutzbar.",
  };
}

export interface LageplanPdfInput {
  address: string;
  lat: number;
  lon: number;
  bundesland: string;
  geoportalLabel: string;
  geoportalUrl: string;
  mapBase64: string;
}

export async function saveLageplanPdfAction(
  caseId: string,
  input: LageplanPdfInput
): Promise<{ documentId?: string; error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  try {
    const broker = await getBrokerInfo(ctx.organizationId);
    const caseRow = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { applicants: { orderBy: { position: "asc" } } },
    });
    const buffer = await renderLageplan({
      caseNumber: caseRow.caseNumber,
      dateStr: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      broker,
      address: input.address,
      lat: input.lat,
      lon: input.lon,
      bundesland: input.bundesland,
      geoportalLabel: input.geoportalLabel,
      geoportalUrl: input.geoportalUrl,
      attributions: `${TOPPLUS_ATTRIBUTION} · ${OSM_ATTRIBUTION}`,
      mapPng: Buffer.from(input.mapBase64, "base64"),
    });
    const fileName = pdfFileName("Lageplan", caseRow.applicants);
    const stored = await getStorage().put({
      organizationId: ctx.organizationId,
      caseId,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer,
    });
    const created = await prisma.document.create({
      data: {
        caseId,
        originalName: fileName,
        generatedName: fileName,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        documentType: "flurkarte_lageplan",
        uploadSource: "vermittler",
        scanStatus: "ready_for_ocr",
        readable: true,
      },
      select: { id: true },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "pdf.generated",
      entityType: "case",
      entityId: caseId,
      metadata: { feature: "lageplan", documentId: created.id },
    });
    revalidatePath(`/cases/${caseId}`);
    return { documentId: created.id };
  } catch {
    return { error: "Lageplan-PDF konnte nicht erstellt werden." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: ohne Fehler. Bei Signatur-Abweichungen die echten Funktionen öffnen und anpassen.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/lageplan.ts
git commit -m "feat(geo): Server-Actions Lageplan erzeugen + PDF ablegen"
```

---

### Task 6: UI – Seite + Editor + Button in der Fallakte

**Files:**
- Create: `src/app/(app)/cases/[id]/lageplan/page.tsx`
- Create: `src/components/case/lageplan-tool.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Button in der Aktionen-Karte)

**Interfaces:**
- Consumes: `requireCaseAccess`, `prisma` (Property-Adresse laden), `generateLageplanAction`/`saveLageplanPdfAction`/`type LageplanState` (Task 5).

- [ ] **Step 1: Client-Komponente**

```tsx
// src/components/case/lageplan-tool.tsx
"use client";

import { useActionState, useState } from "react";
import { MapPin, FileDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateLageplanAction, saveLageplanPdfAction, type LageplanState } from "@/lib/actions/lageplan";

export function LageplanTool({ caseId, initialAddress }: { caseId: string; initialAddress: string }) {
  const action = generateLageplanAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<LageplanState, FormData>(action, {
    mapDataUri: null, lat: null, lon: null, bundesland: null, geoportalLabel: "", geoportalUrl: "", address: initialAddress,
  });
  const [docId, setDocId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function savePdf() {
    if (state.mapDataUri == null || state.lat == null || state.lon == null) return;
    setSaving(true);
    setPdfError(null);
    try {
      const res = await saveLageplanPdfAction(caseId, {
        address: state.address,
        lat: state.lat,
        lon: state.lon,
        bundesland: state.bundesland ?? "",
        geoportalLabel: state.geoportalLabel,
        geoportalUrl: state.geoportalUrl,
        mapBase64: state.mapDataUri.replace(/^data:image\/png;base64,/, ""),
      });
      if (res.documentId) setDocId(res.documentId);
      else if (res.error) setPdfError(res.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
        <label className="text-xs text-muted-foreground" htmlFor="address">Objektadresse</label>
        <div className="mt-1 flex gap-2">
          <Input id="address" name="address" defaultValue={initialAddress} placeholder="Straße Hausnr., PLZ Ort" className="h-10 flex-1" />
          <Button type="submit" disabled={pending}>
            <MapPin className="h-4 w-4" />{pending ? "Suche …" : "Lageplan erzeugen"}
          </Button>
        </div>
        {state.error ? <p className="mt-2 text-sm text-warning-foreground">{state.error}</p> : null}
      </form>

      {state.geoportalUrl ? (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="font-medium">Amtliche Flurkarte{state.bundesland ? ` (${state.bundesland})` : ""}</div>
          <a href={state.geoportalUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-ai underline">
            <ExternalLink className="h-3.5 w-3.5" />{state.geoportalLabel}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">Dort den amtlichen Auszug abrufen.</p>
        </div>
      ) : null}

      {state.mapDataUri ? (
        <div className="space-y-3 rounded-lg border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.mapDataUri} alt="Orientierungs-Lageplan" className="mx-auto max-w-full rounded border" />
          <p className="text-center text-xs text-muted-foreground">
            Koordinaten: {state.lat?.toFixed(5)}, {state.lon?.toFixed(5)} · Objekt in der Bildmitte
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={savePdf} variant="success" size="sm" disabled={saving}>
              <FileDown className="h-4 w-4" />{docId ? "Abgelegt" : saving ? "Erstelle …" : "Als PDF ablegen"}
            </Button>
            {docId ? (
              <Button asChild variant="outline" size="sm"><a href={`/api/documents/${docId}/download`}>PDF öffnen</a></Button>
            ) : null}
          </div>
          {pdfError ? <p className="text-center text-sm text-destructive">{pdfError}</p> : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Orientierungs-Lageplan – kein amtlicher Auszug; amtliche Flurkarte über das Landes-Geoportal. Kartenquellen: © BKG (TopPlusOpen), © OpenStreetMap-Mitwirkende.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Seite**

```tsx
// src/app/(app)/cases/[id]/lageplan/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LageplanTool } from "@/components/case/lageplan-tool";

export const dynamic = "force-dynamic";

export default async function LageplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);
  const property = await prisma.property.findUnique({ where: { caseId: id } });
  const initialAddress = [property?.street, [property?.zip, property?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Objekt"
        title="Lageplan (Orientierung)"
        subtitle="Aus der Objektadresse einen Orientierungs-Lageplan erzeugen, als Unterlage ablegen und die amtliche Flurkarte über das Landes-Geoportal abrufen."
        actions={<Button asChild variant="outline" size="sm"><Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link></Button>}
      />
      <LageplanTool caseId={id} initialAddress={initialAddress} />
    </div>
  );
}
```

- [ ] **Step 3: Button in der Fallakte**

In `src/app/(app)/cases/[id]/page.tsx`, in der „Aktionen"-Karte nach dem Einkommensanalyse-Button ergänzen (Icon `MapPin` zur bestehenden lucide-react-Importzeile hinzufügen):

```tsx
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/lageplan`}><MapPin />Lageplan erzeugen</Link></Button>
```

- [ ] **Step 4: Verifizieren**

Run: `npm run typecheck && npm run build`
Expected: Build ok, Route `/cases/[id]/lageplan` erscheint.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/cases/[id]/lageplan/page.tsx" src/components/case/lageplan-tool.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(geo): UI – Lageplan-Tool, Geoportal-Link, PDF-Ablage"
```

---

## Self-Review

- **Spec-Abdeckung:** Adresse vorbefüllt+editierbar (Task 6), geocodieren (Task 3), topo-Karte BKG TopPlusOpen + Markierung (Task 2/4), Bundesland→Geoportal-Direktlink+Fallback (Task 1/5/6), PDF-Ablage als `flurkarte_lageplan` (Task 4/5), nur Objektadresse raus + keine Adresse im Log (Task 5), Fehlerfälle (Task 5/6), Tenant/Audit (Task 5), Quellen/Lizenz im PDF (Task 4), kein ALKIS/Luftbild/interaktiv/Auto-Adress-Write (nicht implementiert – korrekt). ✅
- **Platzhalter:** keine; gesamter Code ausformuliert.
- **Typkonsistenz:** `GeoResult`/`geocodeAddress`/`parseNominatim`/`buildTopPlusUrl`/`fetchMapPng`/`geoportalFor`/`GeoportalEntry`/`renderLageplan`/`LageplanData`/`generateLageplanAction`/`LageplanState`/`saveLageplanPdfAction`/`LageplanPdfInput` durchgängig konsistent. `TOPPLUS_ATTRIBUTION`/`OSM_ATTRIBUTION` definiert und in der Action genutzt.
- **Bekannte Annahme/Risiko:** exakte BKG-TopPlusOpen-Parameter (Layer `web`, EPSG:3857) und Nominatim-Nutzung werden bei der Umsetzung gegen die jeweilige Doku verifiziert; falls TopPlusOpen-Layername/Format abweicht, in `buildTopPlusUrl` anpassen (rein, testbar). Nominatim-Policy: niedrige Frequenz, User-Agent gesetzt.
