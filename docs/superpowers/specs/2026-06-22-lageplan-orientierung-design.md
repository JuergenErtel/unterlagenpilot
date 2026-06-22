# Orientierungs-Lageplan + Geoportal-Direktlinks – Design

Stand: 2026-06-22 · Status: freigegeben (Design) · Sprache: Deutsch

## 1. Ziel & Kontext

Wenn zu einem Objekt kein Lageplan vorliegt, soll UnterlagenPilot aus der
Objektadresse einen **Orientierungs-Lageplan** (topografische Karte mit
Objekt-Markierung) erzeugen, als Falldokument ablegen und einen **Direktlink ins
zuständige Landes-Geoportal** geben, wo der Vermittler die **amtliche Flurkarte**
holt. Bewusst KEINE amtliche ALKIS-/Flurkarten-Einbindung – das bleibt der
manuelle Geoportal-Schritt; die App erleichtert ihn nur.

Architekturprinzip wie bei den anderen Features: nur dokumentierte, freie
Schnittstellen, keine erratenen Endpunkte, kein Scraping, klare Kennzeichnung
„kein amtlicher Auszug".

## 2. Ablauf (UI)

Eigene Seite pro Fall: `/cases/[id]/lageplan` (Button in der Fallakte).

1. **Objektadresse** aus `Property` (strasse/plz/ort) vorbefüllt und editierbar;
   falls leer, kann sie hier erfasst werden (nur als Suchparameter – wird NICHT
   automatisch ins Objekt zurückgeschrieben).
2. **„Lageplan erzeugen"** → Adresse geocodieren → topografische Karte
   (BKG TopPlusOpen) zentriert auf das Objekt, Markierung in der Bildmitte → Vorschau.
3. Automatisch erkanntes **Bundesland** → Direktlink ins Landes-Geoportal
   (amtliche Flurkarte) + bundesweiter Fallback-Link.
4. **„Als PDF ablegen"** → PDF mit Karte + Metadaten als Dokument
   (`documentType: "flurkarte_lageplan"`).

## 3. Datenquellen (frei, dokumentiert, EU)

- **Geocoding**: bevorzugt ein offener, dokumentierter Dienst; Standard im MVP
  ist OSM/Nominatim (frei, Nutzungsrichtlinie: User-Agent Pflicht, geringe
  Frequenz, Attribution „© OpenStreetMap-Mitwirkende"). Liefert Koordinaten +
  Bundesland (address.state). Exakter Endpunkt/Provider wird bei der Umsetzung
  verifiziert; ein Wechsel auf BKG-Geocoding ist über die Adapter-Funktion möglich.
- **Kartenbild**: BKG **TopPlusOpen** WMS `GetMap` (bundesweit, amtlich, offen,
  ohne Schlüssel), PNG für eine BBox um die Koordinate. Attribution „© BKG <Jahr>".
  Falls ein Dienst doch einen Schlüssel verlangt: offene Alternative (basemap.de/OSM-Tiles).
- **Nur die Objektadresse** verlässt das System (keine Antragsteller-/Personendaten).

## 4. Geoportal-Direktlinks

Gepflegte statische Tabelle der 16 Bundesländer → URL des amtlichen
Geoportals/Flurkarten-Viewers (`src/lib/geo/geoportale.ts`). Das Bundesland wird
aus dem Geocoding-Ergebnis bestimmt; die UI/das PDF zeigen den passenden Link
plus einen bundesweiten Fallback. Wo der Geocoder kein Bundesland liefert, wird
nur der Fallback gezeigt.

## 5. Technik / Einbettung (gekapselt, testbar)

- `src/lib/geo/geocode.ts` – `geocodeAddress(query): Promise<GeoResult | null>`
  (`{ lat, lon, bundesland?, displayName }`). HTTP isoliert; in Tests gemockt.
- `src/lib/geo/map.ts` – `buildTopPlusUrl(lat, lon, opts)` (reine URL-Bildung,
  testbar) + `fetchMapPng(url): Promise<Buffer>` (HTTP isoliert).
- `src/lib/geo/geoportale.ts` – `BUNDESLAND_GEOPORTALE` Tabelle +
  `geoportalFor(bundesland?)` (rein, testbar).
- **PDF**: `renderLageplan(data)` in `src/lib/pdf/renderer.ts` (Kartenbild via
  `doc.image`, Markierung mittig, Metadaten, Hinweis, Attribution).
- **Server-Actions** (`src/lib/actions/lageplan.ts`):
  - `generateLageplanAction(caseId, _prev, formData)` – Adresse aus FormData/Property,
    geocode + Karte holen → liefert State (Vorschau-Bild als data-URI, Koordinaten,
    Bundesland, Geoportal-Link, Fehler). Kein Upload-Pipeline-Schritt nötig
    (kein Kundendokument; das Kartenbild stammt vom Geodienst).
  - `saveLageplanPdfAction(caseId, input)` – rendert PDF, legt es als Dokument ab
    (`getStorage().put` + `prisma.document.create`, `documentType: "flurkarte_lageplan"`),
    gibt `{ documentId?, error? }` zurück.
- **Tenant-Isolation**: beide Actions über `requireCaseAccess`. **Audit** nur
  Metadaten: `pdf.generated` beim Ablegen; der Geocoding-Aufruf wird – wenn
  überhaupt – nur als Erfolg/Fehler-Flag protokolliert, niemals mit der Adresse.
- **Doc-Typ** `flurkarte_lageplan` existiert bereits in der Registry.

## 6. Fehlerfälle

- Keine Adresse: Hinweis + Eingabefeld; Geoportal-Fallback-Link bleibt nutzbar.
- Adresse nicht gefunden / Geodienst nicht erreichbar: verständliche Meldung;
  manuelle Adresse + Geoportal-Link bleiben verfügbar; kein Crash.
- Kartendienst nicht erreichbar: Meldung; Geoportal-Link weiterhin nutzbar.

## 7. Sicherheit / Datenschutz

- `requireCaseAccess` auf beiden Actions.
- Nur Objektadresse an externe Geodienste; keine Personennamen; keine Adresse im Log
  (nur „geocode ok/fehlgeschlagen"-Flag).
- PDF im privaten Storage; Download über die bestehende authentifizierte Route.
- Lizenz-/Quellenangaben (BKG, OSM) im PDF.

## 8. Bewusst NICHT im Scope (YAGNI)

- Keine amtliche ALKIS-/Flurkarten-Einbindung (bleibt manueller Geoportal-Schritt).
- Keine interaktive Karte (nur statisches Bild).
- Kein Auto-Zurückschreiben der Adresse ins Objekt.
- Kein Luftbild (nur topografische Karte).

## 9. Tests

- `geoportale`: jedes Bundesland hat eine URL; `geoportalFor` liefert korrekten
  Eintrag bzw. Fallback bei unbekannt/undefined.
- `map`: `buildTopPlusUrl` erzeugt eine korrekte, deterministische WMS-GetMap-URL
  (BBox um die Koordinate, Layer/Format/CRS/Größe-Parameter vorhanden).
- `geocode`: parst eine gemockte Geocoder-Antwort in `GeoResult` (inkl. Bundesland);
  liefert null bei leerem Ergebnis.
- PDF-Renderer: erzeugt gültiges PDF mit eingebettetem (Test-)Bild und Hinweis.
- Rein internes Vermittler-Feature – nicht in der Kundensicht.
