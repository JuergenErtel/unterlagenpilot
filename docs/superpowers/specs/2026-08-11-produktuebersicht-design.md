# Produktübersichten aus dem Europace-Wiki – Design

Datum: 2026-08-11
Status: Daten gezogen und geprüft, bereit für Implementierungsplan

## 1. Problem

Die Frage „Akzeptiert die HVB eine befristete Aufenthaltsgenehmigung?" konnte
das [Banken-Wiki](2026-08-10-banken-wiki-design.md) nicht beantworten. Ursache
war nicht ein Fehler im Abzug, sondern eine **zweite Datenquelle**, die wir gar
nicht kannten.

Der Europace-Wiki-Artikel „&lt;Bank&gt; – Produktübersicht" (Zendesk) hat zwei
Teile:

1. **„Finanzierungskriterien"** — exakt die 69 Kriterien, die wir bereits über
   die Schnittstelle geholt haben. Inhalte und Datumsangaben stimmen überein.
2. **Eine zweite, eigene Tabelle** — Bezeichnung/Wert statt Kriterium/Status,
   gegliedert in Antragsteller, Immobilie, Finanzierungslösung, Prolongation,
   Hinweise zum Prozess. Dort steht die Zeile „Bluecard", und dort stehen
   Angaben, die der Kriteriencheck nicht führt.

## 2. Was der Abzug ergeben hat — und was daran zu korrigieren war

Erste Schätzung: 685 Artikel × ~50 Zeilen ≈ 34.000 Aussagen. **Falsch um den
Faktor 25.** Tatsächlich gemessen:

| | Artikel |
|---|---:|
| enthalten **beide** Teile | **28** |
| enthalten nur den Kriteriencheck | 624 |
| leere Stummel (122 Zeichen) | 33 |
| **Summe** | 685 |

**28 Banken × Ø 49 Zeilen = 1.380 Aussagen.** Klein, aber es sind die
überregionalen Anbieter: HypoVereinsbank, Deutsche Bank, Commerzbank, ING,
Allianz, AXA, Wüstenrot, BHW, OLB, Hanseatic, Consors, dazu Förderbanken (KfW,
L-Bank, NRW.Bank, IB.SH, Sächsische Aufbaubank), Versicherer (HUK-COBURG, DEVK,
ERGO, Signal Iduna, uniVersa, Hannoversche, Volkswohl Bund, Versicherungskammer
Bayern) und Bausparkassen.

Verteilung der 1.380 Zeilen: Hinweise zum Prozess 395, Finanzierungslösung 322,
Antragsteller 297, Immobilie 278, Prolongation 62, Rest 26.

## 3. Der Abzug

Zendesk verlangt Anmeldung; die Schnittstelle
`/api/v2/help_center/de/articles.json?per_page=100&page=N` liefert über 60
Seiten alle 5.908 Artikel **inklusive `body`**. Ein Durchlauf genügt, kein
Nachladen je Artikel.

Zwei Fallen, beide beim ersten Versuch aufgelaufen:

- **Der Weg über einen lokalen Empfänger scheitert.** Der Browser lässt von der
  HTTPS-Seite keine Verbindung nach `localhost` zu — auch nicht mit
  `Access-Control-Allow-Private-Network`. Der Abzug läuft deshalb über einen
  Download aus der Seite heraus.
- **`textContent` kennt keine Blockgrenzen.** Aus
  „…genehmigung&lt;/p&gt;&lt;p&gt;möglich…" wurde „genehmigungmöglich". Vor dem
  Parsen müssen hinter `br`, `/p`, `/li`, `/div`, `/tr` und `/hN` Umbrüche
  eingefügt werden. Ohne das ist der Text unbrauchbar, und man sieht es erst,
  wenn man hinschaut.

Erkennungsregel im Artikel: **vierspaltige Tabellen sind der Kriteriencheck**
(Kriterium, Status, Inhalt, Stand), **zweispaltige die Produktübersicht**
(Bezeichnung, Wert). Abschnitt und Unterabschnitt kommen aus der jeweils
vorangehenden H2/H3. Die Inhaltsverzeichnis-Tabelle unter „Inhalt" fällt weg.

Rohdaten in `data/europace-produktuebersichten.json` (311 KB, nicht versioniert
— wie der Kriterienabzug).

## 4. Zuordnung zu unseren Banken — von Hand

Die 28 Artikelnamen decken sich nicht mit unseren Banknamen. **Automatische
Namensähnlichkeit ist hier ausgeschlossen**, und das ist gemessen, nicht
vermutet: Ein Teilstringvergleich ordnete „Hannoversche" (den Versicherer) der
„Hannoversche Volksbank" zu und „L-Bank" gleich 356 Banken. Dieselbe Falle wie
bei der Bankauflösung im Frage-Feature.

Bei 28 Einträgen ist Handarbeit billiger als jede Heuristik. Die geprüfte
Zuordnung liegt in `src/lib/banken/produktuebersicht/zuordnung.json`:
**21 zeigen auf vorhandene Banken**, **7 sind neu** (Hannoversche, IB.SH, KfW,
L-Bank, NRW.Bank, Sparda-Bank Hessen eG, Versicherungskammer Bayern).

Ein Test prüft die Datei gegen den Abzug: keine fehlende Zuordnung, kein
unbekannter Artikel, kein doppeltes Ziel, jedes Ziel existiert.

## 5. Datenmodell

Eine **eigene Tabelle**, nicht `BankKriterium` erweitern. Die Zeilen haben eine
andere Gestalt: kein Status, kein Stand-Datum je Zeile, eigene Gliederung — und
Namen überschneiden sich („Grenzgänger" steht in beiden Tabellen mit
verschiedenem Inhalt).

**`BankProduktMerkmal`**: `bankRefId`, `abschnitt`, `unterabschnitt` (nullbar),
`bezeichnung`, `wert`, `artikelId`, `standAm` (Änderungsdatum des Artikels),
`importiertAm`. Eindeutig über (`bankRefId`, `abschnitt`, `unterabschnitt`,
`bezeichnung`) — ein erneuter Import aktualisiert, statt zu verdoppeln.

Werte werden wie beim Kriterienabzug **beim Import bereinigt**; hier ist es
reiner Text, kein HTML.

### 5.1 „keine Angabe" bleibt „keine Angabe"

279 der 1.380 Werte lauten wörtlich „keine Angabe", 20 sind leer. Diese Zeilen
dürfen nie als Ablehnung gelesen werden — dieselbe Regel wie im Kriteriencheck.
Für die Frage-Funktion werden sie wie `KEINE_ANGABE` behandelt und erreichen
die KI nicht.

## 6. Anzeige und Nutzung

- **Bankseite** (`/banken/[bankId]`): unter den Kriterien ein eigener Block
  „Produktübersicht", nach Abschnitten gegliedert, mit dem Stand des Artikels.
  Banken ohne Produktübersicht zeigen den Block nicht — kein leerer Kasten.
- **Die 7 neuen Banken** bekommen einen Bank-Eintrag ohne Kriteriencheck. Ihre
  Seite sagt das ausdrücklich, statt eine leere Kriterienliste zu zeigen.
- **Frage-Funktion**: Die Merkmale fließen als zusätzliche Zeilen in die Suche
  ein (`bezeichnung` wie ein Kriteriumsname, `wert` wie ein Freitext). Damit
  beantwortet „Akzeptiert die HVB eine befristete Aufenthaltsgenehmigung?"
  sich aus der Zeile „Bluecard".

## 7. Absicherung

- **Zuordnung**: vollständig, keine Dubletten, jedes Ziel existiert (§4).
- **Parser**: geklebte Wörter kommen nicht vor; eine Zeile mit „keine Angabe"
  wird nicht als Aussage gezählt.
- **Import**: zweimal ausführen erzeugt keine Dubletten und aktualisiert
  geänderte Werte.
- **Frage-Funktion**: eine Frage, die nur über ein Produktmerkmal zu beantworten
  ist, findet es — und nennt als Grundlage die Produktübersicht, nicht ein
  Kriterium.

## 8. Bewusst nicht dabei

Den Kriteriencheck-Teil der Artikel einlesen (haben wir bereits; die Artikel
decken 643 der 664 Banken ab, wären also kein vollständiger Ersatz),
automatisches Auffrischen, die 33 leeren Artikel.

## 9. Offener Punkt außerhalb der Technik

Unverändert und verschärft: Europace-Inhalte an dritte Vermittler
weiterzugeben ist zu klären, bevor das Wiki zum Verkaufsargument wird. Eine
zweite abgezogene Quelle macht das dringender. Festgehalten in `docs/GO-LIVE.md`.
