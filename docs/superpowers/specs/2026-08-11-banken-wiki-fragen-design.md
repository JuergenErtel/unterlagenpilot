# Banken-Wiki: Fragen stellen – Design

Datum: 2026-08-11
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Das [Banken-Wiki](2026-08-10-banken-wiki-design.md) beantwortet „was sagt Bank X
zu Kriterium Y?". Die Frage, die im Alltag zuerst kommt, ist aber die andere:

> „Welche Banken akzeptieren einen Dolmetscher beim Notartermin?"

Heute müsste der Vermittler dafür 664 Bankseiten durchklicken. Das
ursprüngliche Wiki hat diese Richtung bewusst ausgeklammert (§3 dort); sie wird
jetzt nachgezogen.

## 2. Warum eine Stichwortsuche hier falsch antwortet

Am Beispiel gemessen (Rohabzug vom 10.08.2026):

- Der Treffer sitzt im Kriterium **„Sprache"**, nicht in einem Kriterium namens
  „Dolmetscher". Wer nur Kriteriennamen durchsucht, findet nichts.
- 155 der 664 „Sprache"-Zeilen enthalten das Wort „Dolmetscher". Die häufigste
  Formulierung lautet aber **„zur Frage der Akzeptanz eines Dolmetschers wird
  keine Aussage getroffen"**. Eine Volltextsuche würde also genau das Gegenteil
  behaupten.

Die Frage braucht ein Verstehen des Freitextes. Das ist der Grund, warum hier
KI eingesetzt wird — und der einzige.

## 3. Die zwei Zahlen, die den Entwurf tragen

**„Keine Angabe" trägt zu 100 % denselben Platzhaltersatz.** Alle 21.006
Zeilen mit Status `KEINE_ANGABE` enthalten „Es liegt noch keine Information
seitens der Bank vor.", und kein einziger anderer Status trägt diesen Satz.
Diese Zeilen erreichen die KI nie: sie wandern deterministisch in die Gruppe
„hat sich nicht geäußert". Das spart 46 % der Arbeit und ist zugleich die
ehrlichste Trennung — genau die Falle, die schon das Wiki und die
[Machbarkeits-Ampel](2026-08-10-machbarkeits-ampel-leads-design.md) prägt.

**Nach Entdopplung bleibt pro Kriterium wenig Text.** 664 Zeilen zu „Sprache"
sind nur 193 verschiedene Texte (~17k Tokens). Im Median über alle Kriterien
sind es 192 Texte, im schlimmsten Fall („Anforderungen Kapitalanleger") 542
Texte / ~52k Tokens. Bewertet wird deshalb **je Text, nicht je Bank**.

## 4. Ablauf — vier Stufen, zwei davon KI

### 4.1 Deuten (ein kleiner KI-Aufruf)

Eingabe: die Frage plus die 69 Kriteriennamen (~700 Tokens).
Ausgabe (Zod-validiert):

```
kriterien:     string[]   höchstens 3, Namen aus dem Katalog
bank:          string|null  falls die Frage eine Bank nennt
stichwoerter:  string[]   höchstens 5, für das Auffangnetz
verstanden:    string     die Frage in eigenen Worten
```

Kriteriennamen werden **gegen den Katalog geprüft**; was nicht darin steht,
wird verworfen statt geraten. Der Bankname wird **im Code** über die vorhandene
umlautfeste Suche (`passtZurSuche`) aufgelöst — die KI nennt nur die Absicht,
die Auflösung bleibt deterministisch:

- genau eine Bank → Antwort nur für diese Bank
- mehrere („Sparkasse") → Antwort auf diese Menge eingegrenzt, mit Hinweis
- keine → alle 664 Banken, plus Hinweis „Bank X ist im Wiki nicht bekannt"

### 4.2 Sammeln (reiner Code)

1. Alle Zeilen zu den gedeuteten Kriterien laden (ggf. auf die Bankmenge
   eingegrenzt).
2. **Auffangnetz:** zusätzlich Zeilen, deren Freitext eines der Stichwörter
   enthält — quer über alle Kriterien. Fängt den Fall, dass die Deutung das
   Kriterium verfehlt hat.
3. `KEINE_ANGABE` aussortieren (siehe §3) und als Gruppe „hat sich nicht
   geäußert" merken.
4. **Entdoppeln nach normalisiertem Text**: aus 664 Zeilen werden 193 Texte,
   jeder mit der Liste der Banken, die ihn tragen.

### 4.3 Lesen (gebündelte KI-Aufrufe)

Je ~20 Texte pro Aufruf, höchstens 4 Aufrufe gleichzeitig, über den vorhandenen
429-Backoff (`fetchWithRateLimitRetry`). Je Text:

```
urteil: "ja" | "bedingt" | "nein" | "keine_aussage"
beleg:  wörtliches Zitat aus GENAU diesem Text, max. 200 Zeichen
```

**Das Zitat wird gegengeprüft.** Steht es (normalisiert verglichen) nicht
wirklich im Quelltext, wird es verworfen und stattdessen ein Textauszug
gezeigt. Die Zeile bleibt erhalten — nur die Behauptung fliegt raus. Damit kann
die Antwort nichts zitieren, was Europace nicht geschrieben hat.

**Der Deckel:** höchstens 300 Texte pro Frage, sortiert nach Stichwortnähe
(Texte mit Treffer zuerst). Wird gekürzt, **sagt die Antwort das**: „240 von
542 Texten gelesen". Kein stilles Abschneiden, das wie Vollständigkeit aussieht.

### 4.4 Zusammenführen (reiner Code)

Urteil je Text zurück auf die Banken abbilden, in vier Gruppen sortieren.

Erscheint eine Bank über mehrere Kriterien mit verschiedenen Urteilen, gilt das
**restriktivste** (nein > bedingt > ja > keine Aussage) mit dessen Zitat — ein
Nein an einer Stelle bleibt ein Nein. Das Kriterium steht an jeder Zeile dabei,
damit der Unterschied sichtbar bleibt.

## 5. Oberfläche

**`/banken/fragen`**, von `/banken` aus über eine eigene Karte über der
Namenssuche verlinkt (die beiden Eingabefelder dürfen nicht nebeneinander
stehen — sonst tippt man die Frage in die Bankensuche).

Die Frage steht in der Adresszeile (`?frage=…`), damit eine Antwort verlinkbar
ist. Die Auswertung läuft danach über eine Server-Action mit **sichtbarem
Fortschritt** („Frage deuten… 193 Texte lesen…"), nicht als stiller
40-Sekunden-Seitenaufbau — genau das war hier schon einmal die Ursache für
Endlos-Spinner (siehe `docs/` zur KI-Prüfung).

Aufbau der Antwort:

```
Dolmetscher beim Notartermin?
Verstanden als: … · Grundlage: Kriterium „Sprache" · Abzug vom 10.08.2026

Akzeptiert (12)            je Bank: Name · Kriterium · Zitat · Link
Nur unter Bedingungen (31)
Akzeptiert nicht (9)
Hat sich nicht geäußert (612)   eingeklappt, ausdrücklich: „kein Nein"
```

Farben aus dem vorhandenen `TONE`-System: ja grün, bedingt gelb, nein rot,
keine Aussage neutral. KI-Ausgaben werden **als Text** gerendert, nie als HTML.

Findet die Deutung kein Kriterium und das Auffangnetz keinen Treffer, kommt
eine Fehlanzeige mit dem Kriterienkatalog als Hilfe — keine geratene Liste.

## 6. Bewusst nicht dabei

Zwischenspeicher für wiederholte Fragen, Frageverlauf, Abgleich gegen einen
konkreten Fall, automatisches Auffrischen der Daten.

## 7. Absicherung

Alles gegen den Mock-Provider, ohne echte KI:

- **Platzhalterzeilen** (`KEINE_ANGABE`) erreichen die KI nie und werden nie
  als Nein gezählt. Der wichtigste Test des Vorhabens.
- **Belegprüfung**: ein erfundenes Zitat wird verworfen, die Zeile bleibt.
- **Entdopplung und Rückmapping**: 664 Zeilen → n Texte → wieder 664 Banken,
  keine verloren, keine doppelt.
- **Katalogprüfung**: ein von der KI erfundener Kriteriumsname wird verworfen.
- **Banknamen-Auflösung**: eine Bank, mehrere Banken, unbekannte Bank.
- **Deckel**: mehr Texte als erlaubt → gekürzt und gemeldet.
- **Restriktivstes Urteil** bei einer Bank in mehreren Kriterien.
- **Fehlanzeige** statt Rateliste, wenn nichts passt.

## 7a. Nachtrag: was der Lauf gegen die echte KI korrigiert hat

Vor dem Ausliefern lief die ganze Kette gegen den echten Rohabzug und die echte
Mistral-Anbindung. Vier Dinge, die kein Test mit erfundenen Daten gezeigt hätte:

1. **Der Kriteriumsname muss in den Prompt.** Viele Bestandstexte sind
   elliptisch. Die klarste Absage der ING lautet vollständig „Wird von der Bank
   nicht unterstützt." — ohne Subjekt. Durch das Entdoppeln nach Text war der
   Bezug weg, und die KI urteilte folgerichtig „keine Aussage" statt „nein".
   Entdoppelt wird seither **je Kriterium**, und das Kriterium steht im Prompt.
2. **Banknamen dürfen nicht per Teilstring aufgelöst werden.** Die Suche der
   Bankenliste ist ein Teilstringvergleich — richtig für ein Feld, in dem man
   den Treffer sieht und anklickt. Automatisch angewandt traf „ING" auch
   Ingolstadt, Thüringen und Geiselhöring: Eine Frage nach einer Bank wurde
   gegen 41 beantwortet. Jetzt in drei Stufen: exakter Name, ganzes Wort,
   zuletzt Teilstring.
3. **Das gefragte Kriterium wird zuerst gelesen.** Das Stichwort „Einkommen"
   zog bei der Kurzarbeitergeld-Frage 727 Texte quer durch alle Kriterien
   herein; der Deckel griff, und ausgerechnet Texte des gefragten Kriteriums
   blieben ungelesen — 169 Banken ohne Urteil, 77 Sekunden Laufzeit. Mit
   Vorrang: alle 664 Banken bewertet, 11 Sekunden.
4. **Die Belegprüfung greift und ist ihr Geld wert.** Von 198 Urteilen trugen
   35 kein haltbares Zitat. Darunter Sätze wie „Ein Dolmetscher wird nicht
   akzeptiert." — inhaltlich richtig, aber so nirgends geschrieben. Nach dem
   Kontext-Fix aus Punkt 1 sank die Quote auf 1 von 199; Zitate mit Auslassung
   („A … B") werden stückweise und in Reihenfolge geprüft.

Gemessene Laufzeiten: 3–12 Sekunden je Frage, im ausgereizten Fall 11 Sekunden.

## 8. Offener Punkt außerhalb der Technik

Unverändert der Punkt aus dem Wiki-Design: Europace-Inhalte an dritte
Vermittler weiterzugeben ist zu klären, bevor das Wiki zum Verkaufsargument
wird. Diese Stufe verschärft ihn, weil sie den Bestand auswertbar macht.
Festgehalten in `docs/GO-LIVE.md`.
