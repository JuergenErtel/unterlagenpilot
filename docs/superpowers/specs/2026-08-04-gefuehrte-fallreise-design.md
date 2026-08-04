# Geführte Fallreise – „Was jetzt?“-Prinzip

**Datum:** 2026-08-04 · **Status:** Design im Chat freigegeben („ja“) · Umfang: komplette Fallreise, Review mit Schnellweg

## Problem (Nutzerfeedback Jürgen, wörtlich sinngemäß)

„Alles sehr unübersichtlich. Die nächsten Schritte sind versteckt: Review öffnen,
dann Dokument akzeptieren, dann auf Dokumente klicken – man muss mehr durchgeführt
werden.“ Konkret: Nach Upload + KI-Prüfung ist nicht erkennbar, dass es im
Review-Center weitergeht; das Review führt nicht (kein Fortschritt, kein
Abschluss); nach jeder Station reißt der Faden ab.

## Lösung: Ein berechneter „Nächster Schritt“ überall

### 1. Next-Step-Engine (`src/lib/cases/next-step.ts`)
Pure Funktion über `CockpitData` (+ Fallstatus) → genau EIN primärer Schritt.
Prioritätsleiter (erste zutreffende gewinnt):
1. KI-Auswertung läuft → Fortschritt zeigen (kein CTA, Polling existiert)
2. Dokumente mit KI-Fehler → „KI-Prüfung wiederholen“ (runAiCheck)
3. Prüfbereite Dokumente → „N Dokumente prüfen & freigeben“ → `/review?case=…`
4. Pflicht-Kundendaten fehlen → „Kundendaten vervollständigen“ → `/cases/…/edit`
5. Kritische Plausibilitäts-Hinweise → „Kritische Hinweise klären“ → Tab Plausibilität
6. Unterlagen fehlen → „N Unterlagen anfordern“ → messages (sekundär: selbst hochladen / Upload-Link)
7. Fall eingereicht/Bank-Nachforderung → „Fristen & Nachforderungen“ → `/cases/…/verwaltung`
8. Sonst → „Einreichung vorbereiten“ → `/cases/…/export`

Dazu erweitert `getCaseCockpit` seine counts um `docsFehler`, `docsLaufend`,
`criticals` und exponiert `missingCustomerFields`.

### 2. Fallseite: „Nächster Schritt“-Karte
Neue Komponente `NextStepCard` ganz oben (vor der Roadmap), farbcodiert nach
Tone, mit Titel, Ein-Satz-Begründung, großem Primär-Button und optionalen
Sekundär-Buttons. Beim Schritt „KI-Prüfung wiederholen“ bettet die Karte die
bestehende `runAiCheck`-Form ein; bei „KI läuft“ die bestehende Fortschrittsanzeige.
Die vertikale Roadmap bleibt als Überblick darunter unverändert.

### 3. Geführtes Review (`/review?case=…`)
- Kopf: Fallnummer + „Noch N Dokumente zu prüfen“, Karten nummeriert „i von N“.
- Primär-Button pro Dokument: **„Alle Felder übernehmen & Dokument freigeben“**
  (bestehende Action `setDocumentReview(…, "akzeptiert")` – Stammdaten-Übernahme
  hängt dort bereits dran). Einzelfeld-Korrektur bleibt als Ausnahmeweg sichtbar.
- Abschluss: Sind für den Fall keine offenen Dokumente mehr da, erscheint statt
  der leeren Liste eine Erfolgs-Karte „Alles freigegeben ✓“ mit dem berechneten
  nächsten Schritt des Falls (Engine) + „Zurück zum Fall“. Gibt es Dokumente mit
  KI-Fehler, weist die Karte darauf hin (KI-Prüfung wiederholen).
- Ohne `case`-Parameter: Liste wie bisher, aber pro Karte Link „geführt prüfen“
  (Case-scoped). [Etappe 2: Gruppierung nach Fall.]

### 4. Etappe 2 (direkt danach)
- Dashboard-Fallliste: nächster Schritt je Fall als klickbare Aktion.
- Stationen-Feinschliff: Haushalt/Fristen/Export in der Leiter verfeinern,
  Pflichtfeld-Definition Kundendaten erweitern, Roadmap ggf. straffen.

## Fehlerfälle
Engine ist total (immer ein Schritt, notfalls „Einreichung vorbereiten“).
Keine neuen Datenpfade – alles leitet aus vorhandenem Cockpit ab.

## Tests
Unit-Tests für die Prioritätsleiter (jede Stufe + Grenzfälle: leerer Fall,
alles fertig, eingereicht). UI über bestehende Render-Pfade (Build).
