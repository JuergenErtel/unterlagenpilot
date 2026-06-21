# Wohnflächenberechnung nach WoFlV (KI-gestützt) – Design

Stand: 2026-06-21 · Status: freigegeben (Design) · Sprache: Deutsch

## 1. Ziel & Kontext

UnterlagenPilot soll eine **bankkonforme Wohnflächenberechnung nach
Wohnflächenverordnung (WoFlV)** aus vorgelegten Grundrissen erstellen. Bild-KI
liest die Pläne aus; die WoFlV-Anrechnung (Faktoren, Summen) rechnet
**deterministischer Code**, nicht die KI. Jede Zahl ist prüf- und korrigierbar,
jede Übernahme erfolgt erst nach menschlicher Freigabe.

Leitprinzip: **„KI sieht, Code rechnet."** Damit ist das Ergebnis konsistent,
nachvollziehbar und gegenüber der Bank begründbar.

## 2. Architekturentscheidung

- Die Vision-KI extrahiert **nur strukturierte Wahrnehmung** (Räume, Maße/Flächen,
  Kategorie, Dachschräge, Konfidenz, Quelle). Sie gibt **kein** fertiges
  Wohnflächen-Endergebnis aus.
- Eine eigene, getestete **WoFlV-Engine** (`src/lib/wohnflaeche/woflv.ts`)
  wendet die Anrechnungsfaktoren an und bildet Summen.
- Folgt dem bestehenden Projektmuster (KI extrahiert Felder → App-Regeln/
  Validierung; vgl. Dokumentenerkennung + Plausibilität).

## 3. Ablauf (UI)

Eigene Seite pro Fall: `/cases/[id]/wohnflaeche` (Button in der Fallakte).

1. **Grundriss(e) hochladen** (PDF/JPG/PNG, mehrere Etagen/Seiten möglich) –
   oder ein bereits im Fall vorhandenes Grundriss-Dokument auswählen.
2. **„Analysieren"** → Bild-KI liest jeden Plan aus und schlägt eine Raumliste vor.
3. **Prüf-Tabelle** → Vermittler korrigiert/ergänzt; Code rechnet WoFlV live.
4. **„PDF erstellen"** → bankfertiges Dokument; wird als Unterlage im Fall abgelegt.

## 4. Datenmodell der KI-Extraktion (pro Raum)

- `geschoss` (z. B. EG, OG, DG, KG)
- `raumname` (z. B. Wohnen, Bad)
- `kategorie`: `wohnraum` | `balkon_terrasse_loggia` | `zubehoer_keller_hobby_abstell` | `wintergarten` | `schwimmbad`
- `flaecheM2` (number, optional) **oder** `laengeM`/`breiteM` (zur Berechnung)
- `dachschraege` (boolean) + optionale Höhen-Teilflächen `{ unter1m, zw1und2m, ab2m }` in m²
- `beheizt` (boolean, nur Wintergarten/Schwimmbad relevant)
- `konfidenz` (0–1) + `quelle`: `flaeche_beschriftet` | `aus_massen_berechnet` | `aus_massstab_geschaetzt`
- Unsicheres (niedrige Konfidenz / nur Maßstab) wird rot markiert mit Hinweis „bitte Maß prüfen".

## 5. WoFlV-Rechenkern (deterministisch)

Anrechnungsfaktoren:
- **Wohnraum**: 100 %
- **Dachschräge**: Höhe <1 m → 0 %, 1–2 m → 50 %, ≥2 m → 100 % (Teilflächen je Höhe;
  wenn nur Gesamtfläche + „Dachschräge ja" bekannt: konservativer Vorschlag, vom Nutzer bestätigbar)
- **Balkon/Terrasse/Loggia**: 25 % Standard, pro Raum einstellbar bis 50 %
- **Zubehör (Keller/Hobby/Abstell/Garage)**: 0 % zur Wohnfläche; getrennt als Zubehör-/Nutzfläche ausgewiesen
- **Wintergarten/Schwimmbad**: beheizt 100 %, unbeheizt 50 %

Ausgabe: **anrechenbare Wohnfläche gesamt** + **Zubehörflächen separat**. Reine
Funktion, vollständig per Unit-Tests abgedeckt (Faktoren, Summen, Rundung).

## 6. Prüf-Tabelle (Bildschirm)

Spalten: Geschoss · Raum · Kategorie · Fläche (m²) · Faktor · Anrechenbar (m²) ·
Konfidenz · Bearbeiten. Alle Werte editierbar (Faktor per Dropdown), Summe groß
oben, Konfidenz-Ampel (grün/gelb/rot). Pflicht-Hinweis (immer sichtbar):

> „Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche
> Aufmaß-/Vermesserbescheinigung. Werte vor Verwendung prüfen."

## 7. PDF

Nutzt die bestehende pdfkit-Infrastruktur. Neuer Typ
`GET /api/cases/[id]/pdf?type=wohnflaeche`. Inhalt: Titel „Wohnflächenberechnung
nach WoFlV", Objekt-/Falldaten, Tabelle je Geschoss inkl. Faktoren-Spalte, Summe
Wohnfläche + Zubehör getrennt, Vermittlerdaten, Datum, Haftungshinweis.
Dateiname-Schema wie bestehend (`Wohnflaechenberechnung_<Namen>.pdf`). Ablage als
Dokument-Typ `wohnflaechenberechnung` (im Enum vorhanden) über die normale
Dokumentenliste.

## 8. Technik / Einbettung

- **KI-Methode** `analyzeFloorplan(images)` in `AIService`; nutzt einen um
  **Bild-Input** erweiterten openai-compatible-Provider (Mistral Vision,
  `mistral-medium-latest`, EU). Zod-validiertes Ausgabeschema.
- **MockAIProvider** liefert deterministische Demo-Raumliste (kostenfreies Testen).
- **WoFlV-Engine** `src/lib/wohnflaeche/woflv.ts` (rein, getestet).
- **Persistenz**: neue, additive Tabelle `WohnflaechenBerechnung`
  (caseId, rooms JSON, summeWohnflaeche, summeZubehoer, released-Flag, model,
  createdAt/updatedAt) → spätere Weiterbearbeitung möglich. Prisma `db push` (additiv).
- **Upload-Sicherheit**: Grundrisse laufen durch die bestehende sichere
  Upload-Pipeline (Validierung, Virenscan, privater Storage). An Mistral (EU)
  gehen nur Bilddaten zur Analyse – keine Personennamen erforderlich.
- **Audit**: `ai.evaluated` (Analyse) und `pdf.generated` (Dokument) protokolliert.
- **Vercel**: Mistral-Keys (`OPENAI_COMPATIBLE_*` / `MISTRAL_*`) müssen in der
  Vercel-Umgebung gesetzt sein, damit die echte Analyse live funktioniert
  (lokal bereits vorhanden, in Prod prüfen/ergänzen).

## 9. Bewusst NICHT im Scope (YAGNI)

- Kein automatisches Überschreiben der Objekt-Wohnfläche im Fall (bewusste
  Trennung von Exposé-Angabe und eigener Berechnung).
- Keine „bankkonforme" Behauptung bei reiner Maßstabs-Schätzung ohne Zahlen –
  solche Werte werden offen als grobe Schätzung gekennzeichnet.
- Keine amtliche Vermessung/Aufmaß – Haftungshinweis weist darauf hin.

## 10. Tests

- WoFlV-Engine: alle Faktoren, Dachschrägen-Stufen, Zubehör-Trennung, Summen, Rundung.
- KI-Extraktionsschema: Mock liefert schema-konforme Raumliste; Validierung greift.
- PDF-Renderer: erzeugt gültiges PDF mit Umlauten und Summen.
- Kundensicht: dieses Feature ist rein intern (Vermittler) – nicht in der Kundensicht.
