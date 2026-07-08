# Selbständigen-Bankzusammenfassung — Design/Spec

**Datum:** 2026-07-08
**Status:** Freigegeben (Design), bereit für Umsetzungsplan

## Ziel

Schnellfunktion für den häufigen Fall: Alle Unterlagen eines Selbständigen (BWA,
Jahresabschluss, EÜR, Steuerbescheid …) auf einmal hochladen und daraus **ein
bankfertiges Dokument** erzeugen, das **Kennzahlen (Tabelle) + einen neutralen
Begleittext** kombiniert.

Umgesetzt als **Erweiterung der bestehenden „Einkommensanalyse Selbständige"**
(`/cases/[id]/einkommen-selbststaendig`), nicht als Neubau.

## Getroffene Entscheidungen

1. **Kernergebnis:** Kennzahlen-Tabelle **plus** Begleittext in einem Dokument.
2. **Ansatz:** Bestehende Analyse erweitern (maximale Wiederverwendung).
3. **Automatik-Grad:** Ein Klick → **Vorschau zum Freigeben**. KI füllt Kennzahlen +
   schlägt Einkommensansatz vor; Vermittler kann korrigieren; dann PDF.
4. **Begleittext:** **Deterministischer Textbaustein** aus den Zahlen (keine
   KI-Formulierung → vorhersehbar, testbar, keine erfundenen Fakten).

## Ablauf

1. **Einstieg:** Klar benannte Cockpit-Aktion („Selbständigen-Unterlagen →
   Bankzusammenfassung"), führt auf die (erweiterte) Analyse-Seite.
2. **Upload:** Mehrere Dokumente gleichzeitig; nutzt die bestehende sichere Pipeline
   inkl. Direkt-Upload für große PDFs.
3. **Analyse → Vorschau:** KI liest Kennzahlen je Jahr (bestehend). Vorschau zeigt:
   - Editierbare Kennzahlen-Matrix (Kennzahl × Jahr) mit Trend (bestehend).
   - **NEU:** Vorgeschlagener **Einkommensansatz** (Ø Gewinn der letzten ≤3 Jahre),
     überschreibbar.
   - **NEU:** Block **„Angaben zur Selbstständigkeit"**: Firma, Rechtsform,
     selbstständig seit — vorbefüllt aus `SelfEmploymentRecord`, editierbar.
   - Antragsteller-Zuordnung: Default Antragsteller 1; Auswahl bei mehreren.
4. **Erzeugen:** Button „Bankzusammenfassung erstellen" → speichert Stammdaten,
   baut Begleittext, rendert PDF, legt es als Dokument im Fall ab.

## Begleittext (deterministischer Baustein)

Neutral/sachlich, **keine Machbarkeitsbewertung**. Struktur (fehlende Angaben werden
weggelassen, nie erfunden):

```
Einkommenssituation (selbstständige Tätigkeit)

[Anrede/Name] ist selbstständig tätig[ als [Rechtsform] „[Firma]"][ (seit [Jahr])].
Ausgewertete Unterlagen: [Liste Dokumenttyp + Jahr].

Gewinnentwicklung:
  [Jahr]: [Betrag €]  (je verfügbarem Jahr)
Durchschnitt der letzten [n] Jahre: [Ø €]. Tendenz: [steigend|stabil|fallend].

Angesetztes nachhaltiges Jahreseinkommen: [Ansatz €] (≈ [Ansatz/12 €]/Monat).

Grundlage: die genannten, dem Dokument beigefügten/abgelegten Unterlagen.
```

`buildSelfEmployedBankText(input)` — rein deterministisch, unit-testbar. Input:
`{ applicantName, selfEmployment: { firma?, rechtsform?, gruendungsjahr? },
gewinnByYear: Record<year, number|null>, trend, documents: {typ, jahr}[],
ansatzJahr: number }`. Output: `{ heading, paragraphs: string[] }`.

## Einkommensansatz-Vorschlag

`suggestEinkommensansatz(matrix): number | null` — deterministisch, unit-testbar.
- Basis: Kennzahl `gewinn` der **letzten bis zu 3 Jahre**, für die ein Wert vorliegt.
- Ergebnis: arithmetisches Mittel dieser Werte, **abgerundet auf volle 100 €**.
- Verlustjahre (negativer Gewinn) fließen mit ein (konservativ; Vermittler kann
  überschreiben).
- Kein `gewinn`-Wert vorhanden → `null` (Feld bleibt leer, Vermittler trägt ein).

Der Vorschlag ist nur eine Vorbelegung; der Vermittler hat immer das letzte Wort
(entspricht der „manuelle Freigabe"-Linie des Projekts).

## Komponenten & Dateien

**Unverändert wiederverwendet:**
- Upload-Pipeline (`src/lib/documents/pipeline.ts`), Direkt-Upload.
- `analyzeSelfEmployedDocs` (`src/lib/ai/service.ts`) + `toEinkommenDocs`.
- `consolidateEinkommen`, `trendFor`, `ConsolidatedMatrix`, `Kennzahl`,
  `KENNZAHL_LABELS/ORDER` (`src/lib/einkommen/{schema,consolidate}.ts`).
- `EinkommenEditor` (`src/components/case/einkommen-editor.tsx`) als Basis-UI.
- `getBrokerInfo`, `pdfFileName` (`src/lib/pdf/case-pdf.ts`), Renderer-Bausteine
  (`src/lib/pdf/renderer.ts`).
- Modell `SelfEmploymentRecord` (Felder `firma`, `rechtsform`, `gruendungsdatum`;
  hängt an `Applicant`).

**Neu:**
1. `suggestEinkommensansatz(matrix)` — in `src/lib/einkommen/consolidate.ts` oder
   neuer `src/lib/einkommen/ansatz.ts`.
2. `buildSelfEmployedBankText(input)` — neu, `src/lib/einkommen/bank-text.ts`.
3. Stammdaten-Block im `EinkommenEditor` (Firma/Rechtsform/seit); Vorbelegung aus
   `SelfEmploymentRecord`, Vorschlag-Ansatz vorbelegt.
4. PDF: Renderer erweitern (bevorzugt neue `renderSelfEmployedBankSummary`, die
   Begleittext-Sektion + bestehende Kennzahlen-Tabelle zusammenführt; nutzt die
   bestehenden Header/Footer-Bausteine).
5. Server-Action `createEinkommensPdfAction` (`src/lib/actions/einkommen.ts`)
   erweitern: (a) `SelfEmploymentRecord` upserten, (b) Begleittext bauen, (c) neues
   PDF rendern. Alternativ neue Action, falls sauberer.
6. Einstieg: Cockpit-Aktion umbenennen/hervorheben (`src/app/(app)/cases/[id]/page.tsx`
   Sidebar „Aktionen").

## Datenpersistenz

- **Stammdaten** (Firma/Rechtsform/selbstständig seit) werden in
  `SelfEmploymentRecord` persistiert (Lücke der bisherigen Lösung geschlossen).
- Die **Kennzahlen-Matrix** wird wie bisher **nicht** in der DB gehalten (lebt im
  Editor-State + im erzeugten PDF). Bewusst so belassen (YAGNI).

## Tests

- `suggestEinkommensansatz`: Durchschnitt über 3 Jahre; nur teilweise vorhandene
  Jahre; Verlustjahr; gar kein Gewinnwert → null; Rundung auf 100 €.
- `buildSelfEmployedBankText`: vollständige Daten; fehlende Firma/Rechtsform/seit
  (werden weggelassen); ein einzelnes Jahr; keine erfundenen Werte; Monatsumrechnung.

## Bewusst nicht enthalten (YAGNI, später möglich)

- Verknüpfung mit der allgemeinen „Bankfähigen Zusammenfassung" (`createBankSummary`),
  die die Matrix noch nicht einzieht — eigener Schritt.
- Persistieren der vollständigen Kennzahlen-Matrix in der DB.
- KI-formulierter Begleittext (bewusst deterministisch gewählt).
