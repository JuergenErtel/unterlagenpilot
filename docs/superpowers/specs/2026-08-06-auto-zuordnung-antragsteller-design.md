# Auto-Zuordnung von Dokumenten zu Antragstellern

**Datum:** 2026-08-06
**Status:** Design abgenommen (Jürgen, 06.08.2026)

## Problem

Bei mehreren Antragstellern muss jedes Dokument der richtigen Person zugeordnet
sein, sonst bleiben die Pro-Person-Positionen der Checkliste (`perApplicant`)
unerfüllt und melden „fehlt", obwohl die Datei da ist.

Der Auslöser aus der Praxis (Fall Colell UP-2026-0003, 05.08.2026): Der Fall kam
per FinLink-Import mit nur einer Person. Alle 19 Dokumente wurden hochgeladen und
automatisch dieser einzigen Person zugeordnet. Antragsteller 2 kam rund
anderthalb Stunden später dazu — seine fünf Dokumente hingen weiter an
Antragstellerin 1, die Checkliste meldete „Personalausweis fehlt". Die Korrektur
lief über ein manuelles Support-Skript.

Das Muster droht bei **jedem** Fall, in dem ein Antragsteller nach dem Upload
dazukommt.

Der Rohstoff für die Lösung liegt bereits vor: Die KI-Klassifikation liefert seit
jeher `detectedApplicant` (den im Dokument erkannten Namen). Dieser Wert wird
heute **nur für den generierten Dateinamen** verwendet und danach verworfen — die
Spalte `Document.detectedApplicant` existiert im Schema, wird aber nie
beschrieben.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Wirkung der Erkennung | Direkt zuordnen, im Review sichtbar markiert, jederzeit korrigierbar |
| Nachträglich hinzugefügte Person | Automatisch umhängen — aber ausschließlich automatisch entstandene Zuordnungen |
| Strenge des Abgleichs | Streng: Vor- **und** Nachname müssen passen, genau ein Treffer |
| Zusätzlicher KI-Aufruf | Nein — reiner Textabgleich auf dem gespeicherten Namen |

Begründung zur Strenge: Ehepaare mit gleichem Nachnamen sind in der
Baufinanzierung der Normalfall. Ein Abgleich allein über den Nachnamen würde dort
systematisch die falsche Person treffen. Lieber wenige, dafür verlässliche
Treffer — nicht zugeordnete Dokumente sind ein sichtbarer, korrigierbarer
Zustand, eine falsche Zuordnung dagegen ein stiller Fehler.

Begründung gegen den KI-Aufruf: Das Konto stößt bereits an Mistrals
Rate-Limits (50 Requests/Minute, siehe `mistral-rate-limit-backoff`). Ein
zweiter Aufruf pro Dokument würde die Lage verschärfen, ohne für den
Regelfall — der Name steht im Dokument — etwas beizutragen.

## Architektur

### 1. Persistenz des erkannten Namens

`Document.detectedApplicant` wird künftig bei jeder Klassifikation geschrieben:

- `src/lib/documents/pipeline.ts` → `processOcrAndAi` (Upload-Weg)
- `src/lib/actions/cases.ts` → `processAiCheckInBackground` (KI-Prüfung)

Damit ist der Abgleich jederzeit ohne neuen KI-Aufruf wiederholbar. Das ist die
Voraussetzung für das nachträgliche Umhängen.

### 2. Reine Match-Logik

Neue Datei `src/lib/documents/applicant-match.ts`:

```ts
export interface ApplicantCandidate {
  id: string;
  position: number;
  vorname: string | null;
  nachname: string | null;
}

/** Ergebnis: Antragsteller-ID oder null (keine sichere Zuordnung). */
export function matchApplicant(
  detectedName: string | null | undefined,
  applicants: ApplicantCandidate[]
): string | null;
```

Regeln, in dieser Reihenfolge:

1. Keine Antragsteller → `null`.
2. Genau ein Antragsteller → dessen ID, unabhängig vom erkannten Namen. Das
   entspricht dem heutigen Verhalten, wird künftig aber als `auto` markiert und
   ist damit revidierbar, sobald eine zweite Person dazukommt.
3. Mehrere Antragsteller und kein erkannter Name → `null`.
4. Mehrere Antragsteller: Ein Kandidat passt, wenn **sowohl** ein Vornamen- als
   auch ein Nachnamen-Token wortweise im erkannten Namen vorkommt. Genau ein
   passender Kandidat → dessen ID. Null oder mehrere → `null`.

Normalisierung vor dem Vergleich: Kleinschreibung, Umlaute und ß aufgelöst
(ä→ae, ö→oe, ü→ue, ß→ss), Diakritika entfernt, Bindestriche und Satzzeichen zu
Wortgrenzen, Mehrfach-Leerraum zusammengefasst. Verglichen wird **wortweise**,
nicht per Teilstring — sonst würde „Berg" auf „Bergmann" greifen.

Kandidaten ohne Vor- oder Nachnamen können nie treffen (Regel 4 verlangt beide).
Das verhindert, dass ein frisch angelegter, noch namenloser „Antragsteller 2"
Dokumente an sich zieht.

### 3. Herkunft der Zuordnung

Neues Feld auf `Document`:

```prisma
applicantSource String?   // "auto" | "manuell"; null = unbekannt (Altdaten)
```

Additiv und nullbar — verträglich mit `npm run db:push` direkt gegen die
Prod-Supabase (es gibt kein getrenntes Staging, siehe
`review-und-roadmap-2026-07-09`).

- `manuell`: Vermittler hat im Review-Dropdown oder in der Upload-Maske gewählt.
  Wird **nie** automatisch überschrieben.
- `auto`: Von der Match-Logik gesetzt. Wird bei jedem erneuten Abgleich neu
  bewertet.
- `null` (Bestandsdaten): wird wie `manuell` behandelt, also nicht angefasst.
  Konservativ — die Altfälle sind wenige und der Colell-Fall ist bereits von Hand
  bereinigt.

### 4. Einstiegspunkte

**a) Upload.** Die Zuordnung wandert aus `src/lib/actions/upload.ts` in die
Pipeline. `resolveCustomerApplicant` (leitet heute beim Kunden-Upload „genau ein
Antragsteller" selbst ab) entfällt ersatzlos — Regel 2 der Match-Logik deckt den
Fall ab. Künftig gilt: Ein von außen an `processUpload` übergebener `applicantId`
stammt immer aus einer bewussten Auswahl des Vermittlers (Upload-Maske,
`applicantPosition`) und wird beim Anlegen mit `applicantSource = "manuell"`
gespeichert. Ist nichts gesetzt, ordnet `processOcrAndAi` nach der
Klassifikation per `matchApplicant` zu und markiert `auto`.

Für den generierten Dateinamen wird bei einem Treffer der **kanonische Name des
zugeordneten Antragstellers** verwendet, nicht der KI-Rohname — konsistent zu
`assignDocumentApplicant`.

**b) KI-Prüfung.** In `processAiCheckInBackground` wird nach der Klassifikation
je Dokument abgeglichen. Angefasst wird nur, was unzugeordnet ist oder
`applicantSource = "auto"` trägt.

**c) Neu: `rematchCaseDocuments(caseId)`.** Reine Textlogik auf den gespeicherten
`detectedApplicant`-Werten, kein KI-Aufruf, kein OCR. Läuft nach:

- `editApplicant` (`src/lib/actions/case-edit.ts`), wenn sich Vor- oder Nachname
  geändert haben — **das ist der eigentliche Colell-Auslöser**, denn
  `addApplicant` legt eine namenlose Person an, der Name kommt erst hier.
- `addApplicant` (billig, meist wirkungslos, aber vollständig).
- FinLink-Import und „Aus FinLink aktualisieren" (`platforms/case-writer.ts` →
  `fillCaseFromCanonical`), wo Antragsteller mit Namen angelegt werden.

Verhalten: Für jedes Dokument mit `applicantSource = "auto"` oder ohne Zuordnung
wird `matchApplicant` neu ausgewertet. Weicht das Ergebnis von der aktuellen
Zuordnung ab, wird umgehängt, der Dateiname neu erzeugt und ein Audit-Eintrag
geschrieben.

Konservative Ausnahme: Liefert `matchApplicant` `null` (kein Name im Dokument
erkannt, kein eindeutiger Treffer), bleibt eine **bestehende** Zuordnung stehen.
Die Checkliste läuft dadurch nie rückwärts; der Vermittler sieht am Badge, dass
die Zuordnung automatisch ist.

### 5. Sichtbarkeit und Korrektur

- `src/components/review/applicant-select.tsx` bekommt ein `source`-Prop und
  zeigt bei `auto` den Hinweis „automatisch zugeordnet" neben dem Dropdown.
- Jede Änderung über das Dropdown setzt `applicantSource = "manuell"`
  (`assignDocumentApplicant` in `src/lib/actions/review.ts`).
- Audit: bestehende Aktion `document.reviewed` mit
  `metadata: { assignedApplicant, source: "auto-match" }`. Keine Erweiterung von
  `AUDIT_ACTIONS` nötig.

## Fehlerverhalten

Der Abgleich ist eine Verbesserung, keine Voraussetzung: Er darf nie einen
Upload, eine KI-Prüfung oder das Speichern von Stammdaten scheitern lassen.
Alle drei Einstiegspunkte kapseln ihn in `try/catch` mit Log — dem Muster von
`applyExtractedFieldsToApplicant` folgend.

## Tests

**Unit (`matchApplicant`):** gleicher Nachname mit unterschiedlichen Vornamen
(Ehepaar); nur Nachname im Dokument erkannt → kein Treffer; kein erkannter Name;
zwei passende Kandidaten; genau ein Antragsteller im Fall; Umlaute und ß;
Bindestrich-Doppelnamen; Groß-/Kleinschreibung; Kandidat ohne Vornamen; Teilstring
darf nicht greifen („Berg" vs. „Bergmann").

**DB-Integration (PGlite, `RUN_DB_IT=1`, Muster wie FinLink):** Der Colell-Ablauf
— Fall mit einer Person, Dokumente mit gespeichertem `detectedApplicant`, zweite
Person mit Namen ergänzen → die passenden Dokumente hängen danach an Person 2,
eine von Hand gesetzte Zuordnung bleibt unangetastet, ein Dokument ohne erkannten
Namen behält seine bisherige Zuordnung.

## Bewusst nicht enthalten

- Zusätzlicher KI-Aufruf zur Zuordnung (Rate-Limits, kein Mehrwert im Regelfall).
- Konfidenz-Schwellen für die Zuordnung — die Match-Regel ist binär und
  nachvollziehbar.
- Automatische Objekt-Zuordnung (`propertyRef`) — eigenes Thema.
- Rückwirkende Migration bestehender `null`-Zuordnungen auf `auto`.

## Verwandt

- Gedächtnis: `checkliste-pro-antragsteller` (Ursachenanalyse Colell),
  `gefuehrte-fallreise` (UX-Leitsatz), `mistral-rate-limit-backoff`.
- Code: `src/lib/checklists/engine.ts` (`perApplicant`),
  `src/lib/actions/review.ts` (`assignDocumentApplicant`).
