# Sammel-PDFs auftrennen – Design

Datum: 2026-08-10
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Ein Kunde lädt eine Datei hoch: 60 Seiten, darin acht Dokumente — Personalausweis,
drei Gehaltsabrechnungen, Grundbuchauszug, Teilungserklärung, zwei Kontoauszüge.

Für BaufiDesk ist das **ein** Dokument. Die Klassifizierung wählt irgendeinen
Typ, die Extraktion zieht Felder aus dem falschen Abschnitt, die Checkliste
bleibt offen, und der Vermittler zerlegt die Datei von Hand.

Das war der zuerst genannte Schmerzpunkt („Unterlagen-Sortierung") und der
bewusst zurückgestellte dritte Baustein des
[Unterlagen-Detektivs](2026-08-09-unterlagen-detektiv-design.md).

## 2. Ziel

Das System erkennt, dass eine Datei mehrere Dokumente enthält, zeigt die
vermutete Aufteilung, und trennt sie **auf Klick** in einzelne, normal
verarbeitete Dokumente.

### Nicht Teil dieser Ausbaustufe

- Automatisches Auftrennen ohne Freigabe
- „Aufteilung rückgängig machen" (die Datenspur dafür wird angelegt, der Knopf
  nicht gebaut)
- Auftrennen von Bilddateien — nur PDF

## 3. Grundsatzentscheidungen

### 3.1 Vorschlag statt Automatik

Der Upload läuft unverändert. Danach schlägt die Akte die Aufteilung vor, ein
Klick führt sie aus. Dasselbe Muster wie beim Detektiv, und aus demselben Grund:
Eine falsch gesetzte Grenze zerreißt eine 40-seitige Teilungserklärung, und das
zu bemerken kostet mehr Zeit, als das Auftrennen spart.

### 3.2 Ein KI-Aufruf über die Seitenanfänge

Die Seitentexte liegen bereits vor (`DocumentPage.ocrText`). Ein einziger Aufruf
bekommt je Seite die ersten 300 Zeichen — bei 60 Seiten rund 5.000 Tokens.

Verstärkt durch ein Muster, das der Code schon auswertet: **„Seite 1 von 3"**
markiert zuverlässig einen Dokumentanfang. Die Regex `SEITEN_MUSTER` in
`src/lib/detektiv/completeness.ts` erkennt sie bereits, ist dort aber
modulprivat — sie wird exportiert und wiederverwendet, statt ein zweites Mal
geschrieben zu werden.

Verworfene Alternativen:

- **Jede Seite einzeln klassifizieren:** 60 KI-Aufrufe sprengen das Rate-Limit
  von 50 pro Minute, und der Klassifizierer ist für ganze Dokumente gebaut —
  Seite 34 aus der Mitte einer Teilungserklärung klassifiziert er falsch.
- **Reine Heuristik:** erkennt keinen Wechsel zwischen zwei Kontoauszügen.

### 3.3 Die Schutzregel steht im Code, nicht im Prompt

Ein langes Dokument sieht innen oft aus wie viele Dokumente. Deshalb wird die
KI-Antwort deterministisch geprüft, bevor daraus ein Vorschlag wird:

- mindestens **zwei** Segmente
- jedes Segment mindestens **eine** Seite
- die Segmente decken das Dokument **lückenlos und überschneidungsfrei** ab
- mindestens **zwei verschiedene** Dokumenttypen
- **jedes** Segment mit Konfidenz über der Schwelle (Startwert 0,7) — nicht ein Mittelwert, sonst zieht ein sehr sicheres Segment zwei unsichere mit durch

Fällt eine Bedingung durch: **kein Vorschlag**. Im Zweifel nicht auftrennen.

## 4. Datenmodell

**Ein neues Feld, eine neue Tabelle, eine Selbstbeziehung.**

`Document.splitStatus` (`ProcessingStatus`, Vorgabe `ausstehend`) — derselbe
Aufbau wie `referenceStatus` beim Detektiv, damit „nicht geprüft" und „nichts
gefunden" unterscheidbar bleiben.

`Document.aufgeteiltAusId` (Selbstbeziehung, optional) — jedes Teildokument
kennt seine Herkunftsdatei. Prüfspur, und die Voraussetzung dafür, eine
Aufteilung später rückgängig machen zu können.

`DocumentSplitSegment` hält den Vorschlag, bis er ausgeführt oder verworfen wird:

| Feld | Bedeutung |
|---|---|
| `documentId` | Herkunftsdatei |
| `reihenfolge` | Position im Dokument |
| `vonSeite` / `bisSeite` | Seitenbereich, 1-basiert, beide einschließlich |
| `vermuteterTyp` | `DocumentType` oder null |
| `titel` | kundentauglicher Kurztitel für die Vorschlagsliste |
| `confidence` | |

## 5. Wann die Erkennung läuft

Im vorhandenen `after()`-Hintergrundlauf nach OCR, als eigener gekapselter
Schritt neben dem Detektiv. Ein Fehlschlag darf weder OCR noch Extraktion noch
den Detektiv mitreißen.

Vorbedingungen:

- die Datei ist ein **PDF** (Bilder lassen sich nicht auftrennen)
- sie hat **mindestens drei Seiten**
- OCR lief erfolgreich

Ein zweiseitiger Ausweis-Scan wird gar nicht erst geprüft.

## 6. Das Auftrennen

Neue Abhängigkeit **`pdf-lib`** — lädt das Original und kopiert Seitenbereiche
in neue Dokumente. Das vorhandene `pdfkit` kann nur schreiben, nicht lesen.

Ablauf je Segment: Seiten kopieren, Datei über `objectPath(organizationId,
caseId, name)` ablegen, `Document`-Zeile anlegen.

**Die Kinder erben vom Original:** Antragsteller-Zuordnung, Upload-Quelle und
den **Virenscan-Status** — dieselben Bytes wurden bereits geprüft, ein zweiter
Scan wäre sinnlos. `splitStatus` der Kinder steht auf `fertig`, damit sie nicht
erneut auf Aufteilung untersucht werden.

Danach läuft für jedes Teildokument die normale Analyse. Dafür wird die heute
private Analysefunktion in `src/lib/documents/pipeline.ts` als
`analysiereDokument(documentId)` exportiert — ein Auszug, kein Umbau.

### 6.1 Alles oder nichts

Erst werden **alle** Teildateien gespeichert. Erst wenn das vollständig geklappt
hat, entstehen die Datensätze und das Original geht auf `reviewStatus:
"ersetzt"`. Scheitert eine Datei, werden die bereits abgelegten Objekte wieder
entfernt und nichts verändert sich.

Ein halb aufgetrenntes PDF wäre schlimmer als gar keines: drei von acht
Dokumenten, und ein Original, das aussieht, als sei es erledigt.

### 6.2 Eine Altlast, die mitrepariert wird

`reviewStatus === "ersetzt"` wird heute **nur** in der Kundenansicht
(`src/lib/upload/kundenansicht.ts`) ausgeschlossen — in
`src/lib/checklists/engine.ts` und `src/lib/cases/cockpit.ts` nicht. Ein
ersetztes Dokument erfüllt dort weiter eine Checklistenposition.

Das ist schon heute falsch. Nach dem Auftrennen würde es zu Doppelzählung führen
(Original **und** Teile), deshalb gehört es in dieses Vorhaben.

## 7. Oberfläche

Im Reiter „Dokumente" unter der betroffenen Datei:

> **Enthält vermutlich 8 Dokumente**
> Seiten 1–2 Personalausweis · 3–5 Gehaltsabrechnung · 6–14 Grundbuchauszug · …
> [Auftrennen] [Verwerfen]

Die vollständige Segmentliste steht **vor** dem Klick da. Nach dem Auftrennen
trägt das Original das Kennzeichen „aufgeteilt", die Teile stehen normal in der
Liste.

Ein gescheiterter Erkennungslauf (`splitStatus === "fehler"`) erscheint als
stiller Hinweis, nicht als Alarm — er bedeutet nur, dass nicht geprüft wurde.

## 8. Absicherung

- **Schutzregel**, je ein Test: ein einzelnes Segment, überlappende Bereiche,
  Lücken zwischen Segmenten, nur ein Dokumenttyp, Konfidenz unter der Schwelle
  — jeder Fall ergibt „kein Vorschlag"
- **Vertragstest** gegen das KI-Antwortschema
- **Datenbanktest mit einem echten mehrseitigen PDF**, das der Test selbst mit
  dem vorhandenen `pdfkit` erzeugt: acht Seiten hinein, drei Dokumente heraus,
  Seitenzahlen stimmen, Original auf `ersetzt`, Kinder tragen `aufgeteiltAusId`
- **Fehlerfall**: schlägt das Speichern einer Teildatei fehl, ist hinterher
  nichts verändert
- **Altlast**: ein `ersetzt`-Dokument erfüllt keine Checklistenposition mehr und
  zählt nicht in `docsPresent`

## 9. Abgrenzung

| Baustein | Verhältnis |
|---|---|
| Unterlagen-Detektiv | prüft Vollständigkeit **zwischen** Dokumenten; das Auftrennen stellt her, dass es überhaupt einzelne Dokumente gibt |
| `documents/pipeline.ts` | unverändert bis auf den Export der Analysefunktion und den neuen Hintergrundschritt |
| Virenscan | läuft nicht erneut; die Kinder erben den Status der geprüften Bytes |
| `duplicate.ts` | unberührt — Teildokumente durchlaufen die Duplikatprüfung wie jedes andere Dokument |
