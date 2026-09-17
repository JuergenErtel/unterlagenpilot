# Unterlagensortierer — Entwurf

**Datum:** 2026-09-17 · **Status:** zur Freigabe

Ein drittes Hauptfeature neben Vertrieb und Backoffice. Der Berater wirft
Dokumente in einen Trichter, ohne vorher einen Kunden anzulegen; BaufiDesk
sortiert sie und gibt sie geordnet zurück.

Jürgens Beispiel: Der Kunde schickt 30 Bilder. Vier davon sind die vier Seiten
des Kaufvertrags — sie kommen als **ein** PDF mit vier Seiten zurück.

## Warum das ein eigenes Produktgebiet ist

Der Sortierer ist eine **eigenständige Nutzungsart**, kein Zusatz zur Fallakte.
Er richtet sich an zwei Gruppen, und beide erklären den Zuschnitt:

1. **Wer BaufiDesk gar nicht als CRM nutzt.** Für diesen Nutzer IST der
   Sortierer das Produkt. Er darf nie eine Fallakte, eine Pipeline oder eine
   Tagesliste zu sehen bekommen, um an sein Werkzeug zu kommen.
2. **Wer es sonst als CRM nutzt, aber in diesem einen Fall nicht.** Schnell
   einen Stapel ordnen, ohne dass daraus ein Vorgang wird.

Jede Pflicht zur Kundenanlage würde genau den Fall zerstören, für den er da ist.

### Folge: „Vertrieb immer" fällt

`ladeBereiche()` gibt heute `vertrieb: true` fest verdrahtet zurück, und
`bereichAusPfad()` fällt bei einem unbekannten Bereich auf den Vertrieb
zurück. Für einen Nutzer, der nur den Sortierer hat, ist beides falsch — er
landete auf einer Seite, die es für ihn nicht gibt.

- `vertrieb` wird abhängig von einem Organisationsschalter (`vertriebAktiv`,
  Vorgabe `true`) — wie `istBackofficeAktiv` es schon vormacht.
- `sortierer` ist für **jeden** sichtbar: Auch der CRM-Nutzer will ihn
  gelegentlich.
- Der Rückfall geht auf den **ersten verfügbaren** Bereich, nicht auf den
  Vertrieb. Ein Nutzer ohne Vertrieb startet auf `/sortierer`.

### Optisch eine eigene Nutzungsart

- **Zeichen: ein Trichter.** Lucide 0.468 kennt kein `Funnel` (`Filter` ist
  zwar dieselbe Form, liest sich in einer Oberfläche aber als „Liste filtern").
  Deshalb ein eigener `TrichterIcon` als kleines Inline-SVG — es ist das
  Produktzeichen und soll genau stimmen, statt an einem Abhängigkeitssprung
  zu hängen.
- **Eigener Akzent:** Türkis (`--ai`), die Farbe, die im Haus für Maschinen-
  arbeit steht. Der Sortierer IST das KI-Werkzeug — Vertrieb und Backoffice
  behalten Tinte.
- **Die Startseite ist der Trichter selbst**, keine Tabelle: eine große
  Ablagefläche in der Mitte, darunter die laufenden Stapel. Wer hier ankommt,
  will etwas hineinwerfen.
- **Auf der Landingpage** kommt ein dritter Weg neben „KI-Assistent" und
  „Backoffice" dazu.

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
| `Organization.vertriebAktiv` + Rückfall auf den ersten Bereich | DDL, `ladeBereiche`, `bereichAusPfad` |
| `TrichterIcon` (Inline-SVG) + Türkis-Akzent | klein |
| Dritter Weg auf der Landingpage | klein |
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

**Ein Nutzer ohne Vertrieb ist ein neuer Zustand der ganzen Oberfläche.**
Kopfzeile, Umschalter, Startseite, Weiterleitungen nach dem Login und jedes
`redirect("/dashboard")` gehen heute davon aus, dass es den Vertrieb gibt.
Vor dem Deploy mit einem Testkonto ohne Vertrieb durchklicken — nicht nur
lesen.

**„Sortierung" ist ein vierter Zustand in einem Typsystem, das an neun Stellen
nicht erzwingt, dass man ihn mitzieht** (vgl. Erfahrung beim Dokumenttyp
„Grundriss"). Vor dem Deploy: alle Stellen durchgehen, die `akteArt` lesen.
