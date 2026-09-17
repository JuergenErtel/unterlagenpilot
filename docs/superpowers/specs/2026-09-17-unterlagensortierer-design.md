# Unterlagensortierer — Entwurf

**Datum:** 2026-09-17 · **Status:** zur Freigabe

Ein drittes Hauptfeature neben Vertrieb und Backoffice. Der Berater wirft
Dokumente in einen Trichter, ohne vorher einen Kunden anzulegen; BaufiDesk
sortiert sie und gibt sie geordnet zurück.

Jürgens Beispiel: Der Kunde schickt 30 Bilder. Vier davon sind die vier Seiten
des Kaufvertrags — sie kommen als **ein** PDF mit vier Seiten zurück.

## Warum das ein eigenes Produktgebiet ist

Der Sortierer steht bewusst **neben** der Fallakte, nicht darin: Er soll
funktionieren, wenn der Berater nur schnell etwas ordnen will — bevor klar ist,
ob daraus überhaupt ein Fall wird. Jede Pflicht zur Kundenanlage würde genau
den Fall zerstören, für den er da ist.

## Entscheidungen

### Ein Sortierstapel ist eine Akte dritter Art

`AkteArt` bekommt einen dritten Wert: `vertrieb | backoffice | sortierung`.

**Begründung.** Dokumentenspeicher, Upload-Pipeline (HEIC, Virenscan, OCR,
Einstufung, Bild-KI), Bündelung und ZIP-Export hängen heute alle an einer
`Case`-Zeile und funktionieren. Ein eigenes Datenmodell hieße, all das vom
Fallbezug zu lösen — viel Umbau an gesundem Code, ohne erkennbaren Gewinn.
Dieselbe Entscheidung wurde am 02.09. für das Backoffice getroffen und hat
getragen.

**Preis, der bezahlt werden muss:** Jede org-weite Fallabfrage trägt schon
heute `...nurVertrieb` (Vertragstest erzwingt das). Der neue Wert erbt diesen
Schutz — ein Sortierstapel darf in keiner Fallliste, Kennzahl, Tagesliste,
Pipeline und keinem Cron auftauchen. Ergänzend: `nurSortierung` als Filter.

**Was ein Sortierstapel NICHT hat:** Antragsteller, Leadphase, Objekt,
Finanzierungsbedarf, Checkliste, Fristen, Nachforderungen, Machbarkeit. Die
Fallakten-Oberfläche wird für ihn nie geöffnet; er hat eigene Seiten.

### Aufbewahrung: 14 Tage, dann automatisch weg

Ein Stapel enthält Gehaltsabrechnungen und Ausweise, ohne dass ein Fall
dahintersteht — also die heikelsten Daten ohne den Zweck, der sie rechtfertigt.
Der nächtliche Aufräum-Cron (`/api/cron/retention`) löscht Stapel samt Dateien
im Speicher nach 14 Tagen.

Die Liste nennt die verbleibende Zeit je Stapel. Automatisches Löschen, das der
Nutzer nicht kommen sieht, wäre ein Datenverlust mit Ansage.

### Reste werden mitgeliefert, nicht verschwiegen

Was sich nicht einordnen lässt, kommt als eigene Datei „Ohne Zuordnung" ins
Ergebnis. Nichts verschwindet stillschweigend, und der Berater sieht auf einen
Blick, was die Maschine nicht konnte.

## Ablauf

### 1. Trichter

`/sortierer` → „Neuer Stapel". Dateien hineinziehen, fertig. Kein Formular,
keine Pflichtangabe. Der Stapel bekommt einen Namen aus dem Datum
(„Stapel vom 17.09., 14:20"), umbenennbar.

Zulauf auch aus dem **Posteingang**: Dateien, die per Kurzbefehl oder Mail
kamen, lassen sich statt in einen Fall in einen Sortierstapel schieben.

### 2. Sortieren

Unverändert die bestehende Pipeline, im Hintergrund (`after()`), mit
Fortschrittsanzeige wie bei der KI-Prüfung:

1. je Datei: HEIC-Wandlung, Virenscan, OCR, Einstufung (Bild-KI für Fotos),
2. stapelweit: `erkenneBuendel()` — welche Einzelseiten gehören zu einem
   Vorgang.

Beides existiert. Neu ist nur, dass der Auslöser kein Fall ist.

### 3. Rückfragen — eine nach der anderen

Im Stil der geführten Durchsicht (`unterlagen-arbeitsplatz.tsx`): eine Frage,
eine Antwort, weiter. **Nichts wird zugeordnet, bevor der Berater geantwortet
hat.**

Gefragt wird nur, wo es etwas zu entscheiden gibt:

| Anlass | Frage |
|---|---|
| Bündelvorschlag | „Diese 4 Seiten sehe ich als **einen** Kaufvertrag. Richtig?" |
| Seite ohne Zuordnung | „Wohin gehört diese Seite?" (zu einem Vorgang / eigenes Dokument / ohne Zuordnung) |
| Unsichere Grenze | „Gehört das noch zum Vertrag oder ist es ein eigenes Dokument?" |
| Typ unsicher | „Was ist das?" (Dokumenttyp) |

Sichere Zuordnungen werden **nicht** erfragt. Wer bei 30 Bildern 30 Fragen
beantworten muss, nimmt lieber wieder den Ordner auf dem Schreibtisch.

### 4. Ergebnis

Am Ende **eine** Frage: „Wie möchtest du die Dateien zurück haben?"

- **Herunterladen** — ZIP mit den gebündelten PDFs, sprechend benannt
  (`Kaufvertrag_4Seiten.pdf`), plus „Ohne Zuordnung".
- **Einem Fall zuordnen** — Auswahlliste wie im Posteingang. Die PDFs laufen
  über die normale Zuordnung in die Akte; ab da sind sie gewöhnliche Dokumente.

Der Stapel bleibt danach bestehen (bis zu den 14 Tagen) — ein zweiter Download
muss möglich sein, ohne alles neu zu sortieren.

## Was neu gebaut wird

| Teil | Umfang |
|---|---|
| `AkteArt.sortierung` + `nurSortierung` | DDL gegen PROD, Filter, Vertragstest |
| Bereich „Sortierer" in `bereich.ts` + Navigation | klein, Muster vorhanden |
| `/sortierer` (Liste) und `/sortierer/[id]` (Trichter, Fragen, Ergebnis) | neu |
| `lib/sortierer/fragen.ts` — welche Frage als nächste | neu, rein, testbar |
| Zuordnung Stapel → Fall | nutzt vorhandene Bausteine |
| Aufräumen nach 14 Tagen | Erweiterung des Retention-Cron |

## Was NICHT gebaut wird

- Keine zweite Pipeline, keine zweite Bündelungslogik, kein zweiter
  PDF-Bau. Wer daran etwas ändert, ändert es an der einen Stelle.
- Keine Antragstellerzuordnung im Stapel: Ohne Fall gibt es keine
  Antragsteller, und ein geratener Wert wäre als „manuell" gestempelt und
  danach von der Namenserkennung unantastbar.
- Keine automatische Zuordnung zu einem Fall. Der Berater entscheidet.

## Risiken

**Die Bündelung ist auf Fälle mit wenigen Seiten kalibriert.** 30 Bilder auf
einmal sind mehr, als sie bisher gesehen hat; die KI-Drossel (4 parallel,
1,3 s Abstand) greift, aber die Laufzeit steigt. Erste Messung mit einem echten
30-Bilder-Stapel, bevor das Fenster fest verdrahtet wird.

**„Sortierung" ist ein vierter Zustand in einem Typsystem, das an neun Stellen
nicht erzwingt, dass man ihn mitzieht** (vgl. Erfahrung beim Dokumenttyp
„Grundriss"). Vor dem Deploy: alle Stellen durchgehen, die `akteArt` lesen.
