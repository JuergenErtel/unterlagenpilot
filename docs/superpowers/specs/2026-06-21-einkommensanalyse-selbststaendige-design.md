# Einkommensanalyse Selbständige (KI-gestützt) – Design

Stand: 2026-06-21 · Status: freigegeben (Design) · Sprache: Deutsch

## 1. Ziel & Kontext

Selbständigen-Finanzunterlagen (BWA, G+V/Jahresabschluss, EÜR, ESt-Bescheid/
-erklärung) automatisch analysieren und eine **bankfertige Einkommensanalyse**
erstellen: Mehrjahres-Kennzahlen + Klartext-Einordnung je Dokument. KI extrahiert
strukturiert; deterministischer Code konsolidiert zu einer Jahres-Matrix und
berechnet Trends. **Kein automatischer Einkommenswert** – den Einkommensansatz
trägt der Vermittler manuell ein. Leitprinzip wie bei der Wohnflächenberechnung:
„KI sieht, Code rechnet."

## 2. Architekturentscheidung

- Vision-/Dokument-KI (Mistral, EU) liefert je Dokument: Dokumenttyp, Jahr,
  Kennzahlen, 1–2 Sätze Klartext-Einordnung, Konfidenz. Kein Endurteil, kein
  Einkommenswert.
- Reine, getestete Konsolidierungs-/Trend-Engine (`src/lib/einkommen/`) bildet die
  Jahr×Kennzahl-Matrix und bestimmt Trends.
- Wiederverwendung der bestehenden Bausteine aus Feature 1 (Wohnflächen):
  sichere Upload-Pipeline (`processUpload`), Bild-/PDF-Eingabe an die KI
  (`image_url` / `document_url` via Supabase-Signed-URL), pdfkit-PDF, Doc-Ablage.

## 3. Ablauf (UI)

Eigene Seite pro Fall: `/cases/[id]/einkommen-selbststaendig` (Button in der Fallakte).

1. **Unterlagen hochladen** (BWA, G+V/Jahresabschluss, EÜR, ESt-Bescheid/
   -erklärung) – PDF/JPG/PNG, mehrere und mehrjährig. Alles durch die sichere
   Pipeline (Validierung + Virenscan + privater Storage). Bilder → `image_url`,
   PDFs → `document_url` (kurzlebige Signed-URL).
2. **„Analysieren"** → KI liest je Dokument strukturiert aus.
3. **Prüf-Ansicht**: Mehrjahres-Tabelle (Spalten = Jahre, Zeilen = Kennzahlen,
   editierbar, Konfidenz-Ampel) · Klartext-Notiz je Dokument (editierbar) ·
   Feld „Einkommensansatz" (€/Jahr und €/Monat, manuell).
4. **„PDF erstellen"** → bankfertiges PDF, automatisch als Unterlage im Fall;
   Download-Link.

## 4. KI-Extraktion (Zod-Schema, je Dokument)

- `dokumenttyp`: bwa | jahresabschluss | euer | einkommensteuerbescheid | einkommensteuererklaerung | susa | sonstige
- `jahr` (number, z. B. 2024) – bei unterjähriger BWA das Geschäftsjahr + Hinweis im `notiz`-Feld
- `kennzahlen` (alle optional, number):
  - `umsatz` (Umsatz / Gesamtleistung / Betriebseinnahmen)
  - `gewinn` (Jahresüberschuss / EÜR-Gewinn / vorläufiges Ergebnis)
  - `zuVersteuerndesEinkommen` (bzw. Gesamtbetrag der Einkünfte aus ESt-Bescheid)
  - `afa`, `zinsaufwand`, `privatentnahmen`, `geschaeftsfuehrergehalt` (falls erkennbar)
- `notiz` (string, 1–2 Sätze Klartext-Einordnung)
- `konfidenz` (0–1)

## 5. Konsolidierungs-/Trend-Engine (deterministisch)

- `consolidateEinkommen(docs)` → Jahr×Kennzahl-Matrix. Pro (Jahr, Kennzahl) wird
  ein Wert gewählt; gibt es widersprüchliche Werte aus verschiedenen Dokumenten
  desselben Jahres, wird der Konflikt markiert (Flag + beide Werte), damit der
  Vermittler entscheidet.
- `trendFor(values[])` je Kennzahl über die Jahre: `steigend | fallend | stabil`
  (stabil = Abweichung < 5 %). Rein informativ.
- **Kein Einkommenswert, keine bankindividuelle Rechnung.**

## 6. Prüf-Ansicht (Bildschirm)

- Mehrjahres-Tabelle: Spalten = Jahre (aufsteigend), Zeilen = Kennzahlen; Werte
  editierbar; Konfidenz-Ampel (grün/gelb/rot); Konflikt-Markierung.
- Klartext-Notizen je Dokument (editierbar).
- Feld „Einkommensansatz": €/Jahr und automatisch €/Monat (÷12) – manueller Wert.
- Pflicht-Hinweis (immer sichtbar):
  > „Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder
  > Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Werte prüfen."

## 7. PDF

Bestehende pdfkit-Infrastruktur, neue Funktion `renderEinkommensanalyse`. Inhalt:
Titel „Einkommensanalyse Selbständige", Antragsteller/Fall, Mehrjahres-
Kennzahlentabelle, Trend je Kennzahl (neutral), Einordnung je Dokument, der vom
Vermittler eingetragene Einkommensansatz (falls vorhanden), Vermittlerdaten,
Datum, Haftungshinweis. Ablage als Dokument (`Einkommensanalyse_<Namen>.pdf`,
`documentType: "sonstige"`).

## 8. Technik / Einbettung

- **KI**: `AIService.analyzeSelfEmployedDocs(images, documents)` → ruft Mistral
  (openai-compatible, Bild + `document_url`), Zod-validiert; bei Fehler `{ docs: [] }`.
  Mock liefert deterministische Demo-Dokumente (kostenfreies Testen).
- **Engine**: `src/lib/einkommen/consolidate.ts` (rein, getestet) – Matrix + Trend.
- **Server-Actions** (`src/lib/actions/einkommen.ts`):
  - `analyzeSelfEmployedAction(caseId, _prev, formData)` – Upload (Pipeline) +
    KI-Analyse → liefert je-Dokument-Ergebnisse + konsolidierte Matrix (State).
  - `createEinkommensPdfAction(caseId, data)` – rendert PDF aus den (editierten)
    Daten, legt es als Dokument ab, gibt `documentId` zurück (Download über
    `/api/documents/[id]/download`). **Keine neue DB-Tabelle** – das PDF ist das Artefakt.
- **Tenant-Isolation**: beide Actions über `requireCaseAccess`.
- **PDF**: `renderEinkommensanalyse` in `src/lib/pdf/renderer.ts`; Datenaufbau im
  Action (kein GET-Route-Typ nötig, da keine Persistenz).
- **Audit**: `ai.evaluated` (Analyse) + `pdf.generated`/`document.uploaded` (Ablage),
  nur Metadaten.
- Dokumenttypen (bwa/jahresabschluss/euer/einkommensteuerbescheid/-erklärung/susa)
  sind bereits in der Doc-Registry vorhanden.

## 9. Bewusst NICHT im Scope (YAGNI)

- Kein automatischer Einkommenswert / nachhaltiges Einkommen (manuelles Feld).
- Keine separat gespeicherte Kennzahlen-Notiz am Fall (nur das PDF wird abgelegt;
  erneutes Bearbeiten = erneut analysieren).
- Keine bankindividuellen Berechnungsregeln.
- Keine Auto-Übernahme ins Fall-Einkommen.

## 10. Tests

- Konsolidierungs-Engine: Matrix-Aufbau, Konflikt-Markierung, Trend (steigend/
  fallend/stabil), Mehrjahres-Sortierung.
- KI-Schema: Mock liefert schema-konforme Dokumentliste; Validierung greift; PDF-
  und Bild-Eingaben akzeptiert.
- PDF-Renderer: erzeugt gültiges PDF mit Umlauten, Kennzahlentabelle, Hinweis.
- Rein internes Vermittler-Feature – nicht in der Kundensicht.
