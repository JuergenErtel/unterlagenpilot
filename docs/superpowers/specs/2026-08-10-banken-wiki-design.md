# Banken-Wiki – Design

Datum: 2026-08-10
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Die Frage „nimmt diese Bank einen Grenzgänger?" beantwortet der Vermittler heute,
indem er sich bei Europace anmeldet und den Kriteriencheck öffnet. Das Wissen
liegt außerhalb von BaufiDesk, und der Fall, an dem er gerade arbeitet, weiß
nichts davon.

## 2. Datenlage — abgerufen am 10.08.2026

Europace stellt die Finanzierungskriterien über einen Endpunkt bereit, der reines
JSON liefert:

```
/finanzierungskriterien-backend/finanzierungskriterien/banks?criteria=<name>,<name>
```

Je Zeile: `criterionName`, `status`, `content` (HTML) und `lastUpdated`. Der
Endpunkt nimmt **höchstens zwei Kriterien** pro Abfrage — der vollständige Abzug
lief daher über 35 Abfragen und dauerte gut eine Minute.

**Ergebnis: 664 Banken × 69 Kriterien = 45.816 Bewertungen**, fehlerfrei.
Rohdaten in `data/europace-finanzierungskriterien.json` (12 MB, nicht
versioniert).

### 2.1 Statusverteilung — sie prägt das ganze Feature

| Status | Anzahl | Anteil |
|---|---:|---:|
| `KEINE_ANGABE` | 21.006 | **46 %** |
| `INFORMATION` | 13.940 | 30 % |
| `VORBEHALTLICH` | 4.913 | 11 % |
| `NICHT_MACHBAR` | 3.672 | 8 % |
| `MACHBAR` | 2.285 | 5 % |

**Fast die Hälfte aller Felder ist unbeantwortet.** „Keine Angabe" heißt nicht
„geht nicht" — es heißt, die Bank hat sich nicht geäußert. Wer das verwechselt,
schließt reihenweise Banken aus, die den Fall genommen hätten. Dieselbe Falle wie
bei der [Machbarkeits-Ampel](2026-08-10-machbarkeits-ampel-leads-design.md), nur
größer.

### 2.2 Die Kategorien fehlen in der Schnittstelle

Die Oberfläche gruppiert die 69 Kriterien in Antragsteller (30), Immobilie (19),
Vorhaben (10) und Prozesse (10). Die Schnittstelle liefert diese Zuordnung
**nicht** mit; sie wurde separat aus der Oberfläche gezogen und liegt in
`data/europace-kriterien-kategorien.json`.

## 3. Umfang

**Nachschlagen, nicht abgleichen.** Diese Stufe beantwortet „was sagt Bank X zu
Kriterium Y?".

Bewusst **nicht** dabei:

- Die Sicht von der anderen Seite („welche Banken sagen Nein zu Grenzgängern")
- Der Abgleich gegen einen konkreten Fall („wer nimmt das?") — das braucht eine
  Abbildung von 69 Kriterien auf Falldaten und ist ein eigenes Vorhaben
- Automatisches Auffrischen

## 4. Datenmodell

Zwei Tabellen, **organisationsübergreifend** — die Kriterien sind für alle
gleich, das ist Referenzwissen und keine Mandantendaten.

**`Bank`**: `bankId` (Europace-Kennung wie `SPK_DIREKT`, eindeutig), `name`,
`zuletztGesehenAm`.

**`BankKriterium`**: `bankId`, `kriterium`, `kategorie`, `status`, `inhalt`,
`standAm` (Datum von Europace), `importiertAm`. Eindeutig über
(`bankId`, `kriterium`) — ein erneuter Import aktualisiert, statt zu verdoppeln.

### 4.1 Der Status ist eine Zeichenkette, kein Datenbank-Enum

Fünf Werte sind bekannt. Käme ein sechster, würde ein Enum den gesamten Import
zum Absturz bringen — für ein Nachschlagewerk der falsche Preis. Der Import
prüft gegen die bekannte Liste und **protokolliert Unbekanntes, statt es zu
verschlucken**; die Oberfläche zeigt einen unbekannten Wert neutral an.

### 4.2 Der Freitext wird beim Import bereinigt

Europace liefert HTML. Fremdes HTML ungeprüft zu speichern und anzuzeigen ist
genau der Fehler, der in diesem Projekt schon einmal als Stored-XSS im Review
auftauchte.

Erlaubt bleiben `p`, `br`, `ul`, `ol`, `li`, `strong`, `em` — ohne Attribute.
Alles andere wird entfernt, **bevor** es in die Datenbank geht.

## 5. Import

Ein Skript, kein Cron: Der Endpunkt hängt an der angemeldeten Browsersitzung,
die ein Server nicht hat. Automatisches Auffrischen wäre erst mit dem
beantragten Europace-API-Zugang denkbar — falls der diese Daten überhaupt
hergibt.

Ablauf: Beide Dateien aus `data/` lesen, Upsert je Zeile, am Ende melden, wie
viele Banken und Zeilen geschrieben, wie viele unverändert blieben und wie viele
Kriterien ohne Kategorie geblieben sind. Mehrfach ausführbar.

Ein Kriteriumsname ohne Kategorie landet in **„Sonstige"**, statt den Import
scheitern zu lassen.

## 6. Oberfläche

**Eigener Bereich `/banken`**, nicht am Fall hängend — ein Nachschlagewerk
braucht man auch ohne offenen Vorgang.

### 6.1 Suche

Ein Feld über der Liste, serverseitig gefiltert über die Adresszeile (`?q=`) —
verlinkbar und ohne Client-Zustand. Der Vergleich ignoriert Groß- und
Kleinschreibung sowie Umlaute, sonst findet „muenchen" nichts.

### 6.2 Bankseite

Kopfzeile mit Name, Stand des Abzugs und einer Zusammenfassung:

> **ING** · 13 harte Ausschlüsse · 22 unter Vorbehalt · Abzug vom 10.08.2026

Darunter die vier Kategorien. Je Zeile: Kriterium, farbiges Kennzeichen,
Freitext und **das Datum, das Europace für diese Zeile nennt** — nicht unser
Abrufdatum. Der Unterschied zählt: Wir haben heute geholt, die Bank hat sich
vielleicht im Februar zuletzt geäußert.

Farben aus dem vorhandenen `TONE`-System: `nicht machbar` rot, `vorbehaltlich`
gelb, `machbar` grün, `Information` neutral.

### 6.3 „Keine Angabe" ist standardmäßig ausgeblendet

Ein Schalter blendet es ein. Dann grau und ausdrücklich als **„Bank hat sich
nicht geäußert"** beschriftet — nie als Ablehnung. Ohne das Ausblenden bestünde
die halbe Seite aus dem immer gleichen Satz.

## 7. Absicherung

Die prüfbaren Teile sind rein und ohne Datenbank:

- **HTML-Bereinigung**: `<script>`, `onclick` und `<img onerror>` hineinwerfen,
  nur Text darf übrig bleiben. Der wichtigste Test des Vorhabens.
- **Statusabbildung**: die fünf bekannten Werte auf Beschriftung und Farbton,
  plus ein unbekannter sechster, der nicht abstürzt.
- **Kategoriezuordnung**: unbekanntes Kriterium landet in „Sonstige".
- **Suche**: „muenchen" findet „München"; „Sparkasse" findet Sparkassen.
- **Datenbanktest**: zweimaliger Import erzeugt keine Dubletten und aktualisiert
  geänderte Zeilen.

## 8. Offener Punkt außerhalb der Technik

Für den eigenen Gebrauch ist die Übernahme unbedenklich — der Vermittler ist
Europace-Partner und sieht die Kriterien für seine Beratung. Sobald BaufiDesk
andere Vermittler bedient, werden Europace-Inhalte an Dritte weitergegeben. Das
ist mit Europace zu klären, **bevor** das Wiki zum Verkaufsargument wird.
Festgehalten in `docs/GO-LIVE.md`.
