# Machbarkeits-Ampel auf Leads – Design

Datum: 2026-08-10
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Morgens liegen zwanzig Leads im Pipeline-Board. Welchen ruft man zuerst an?
Heute entscheidet das die Reihenfolge des Eingangs, nicht die Aussicht auf einen
Abschluss.

Der [Machbarkeits-Solver](2026-08-10-machbarkeits-solver-design.md) kann diese
Frage beantworten — er wird bisher nur auf der Fallseite genutzt, also erst,
wenn man sich für einen Lead schon entschieden hat.

## 2. Datenlage — gemessen, nicht vermutet

Stichprobe von 200 echten FinLink-Leads über die Partner-API:

| Feld | Rohfeld | Abdeckung |
|---|---|---|
| Nettoeinkommen | `applicant_meta.monthly_net_income` | 100 % |
| Eigenkapital | `applicant_meta.bank_savings_amount_towards_down_payment` | 90 % |
| Kaufpreis | `property_meta.listed_price` / `final_sale_price` | 96 % |
| Objekt-PLZ | `property_meta.german_zipcode_number` | 86 % |
| **alle vier zusammen** | | **80 %** |

**Die Ampel ist damit für vier von fünf Leads rechenbar.** Das rechtfertigt eine
echte Ja/Nein-Aussage statt einer Ersatzkonstruktion.

### 2.1 Zwei Funde, die unabhängig von der Ampel repariert gehören

**Das Eigenkapital wird beim Import weggeworfen.** Unser FinLink-Mapping liest
`bank_savings_amount_towards_down_payment` nicht aus. Bei 90 % Abdeckung heißt
das: Der Kunde hat die Zahl angegeben, wir verlieren sie, und der Vermittler
fragt sie am Telefon erneut ab.

**Das Feld kommt in gemischten Typen.** In der Stichprobe 160-mal als
Zeichenkette (`"30000.0"`), 28-mal als `float`, 12-mal als `int`. Eine Prüfung
auf `typeof v === "number"` verliert stillschweigend 80 % der Werte — dieser
Fehler ist bei der Erhebung tatsächlich passiert und hat die Abdeckung
zunächst als 19 % erscheinen lassen. Das Mapping muss tolerant parsen.

## 3. Umfang

**Nur das Pipeline-Board.** Dort wird morgens die Anrufreihenfolge festgelegt,
dort wirkt die Ampel am stärksten. Bewusst nicht: Dashboard, Fallakte,
Import-Auswahlliste — jede weitere Fläche kostet Ladezeit oder wiederholt, was
die Machbarkeitsseite ohnehin ausführlicher zeigt.

## 4. Woher die Zahlen kommen

Das Board lädt heute schon **alle** Fälle in einer Abfrage mit `select` und
Relationen (`take: 500`). Diese Abfrage wird erweitert um:

- `financingType`
- `financingRequest`: Kaufpreis, Baukosten, Modernisierungskosten,
  Eigenkapital, Nebenkosten, Maklerprovision, Grunderwerbsteuer-Override
- `property`: PLZ, Ort, Wohnfläche, Hausgeld, Mieteinnahmen, Bundesland
- `applicants`: `anzahlKinder` und `income` (Netto, sonstige Einnahmen)
- `liabilities`: Restschuld, monatliche Rate, `abzuloesen`

**Kein N+1, keine zusätzliche Datenbankrunde, kein `caseToCanonical` je Fall.**
Genau dessen Kosten waren der Grund, warum das Dashboard den Solver nicht fährt.

Aus jeder Zeile wird ein schlankes Fall-Objekt gebaut und durch das vorhandene
`baueEingabe` geschickt, damit die Entscheidung „reichen die Daten?" an genau
einer Stelle bleibt.

**Nichts wird gespeichert.** Kein Ampel-Feld an `Case`, kein Zeitstempel, keine
Neuberechnungs-Haken. Das Urteil entsteht bei jedem Aufruf frisch und kann
deshalb nicht veralten — dieselbe Entscheidung wie beim Solver.

Die Annahmen der Organisation werden **einmal** geladen, nicht je Karte.

## 5. Die vier Zustände

Eine reine Funktion `ampelFuer(fall, annahmen) → Ampel`.

Sie rechnet **nicht** alle Hebel durch — für eine Kanban-Karte wäre das
Verschwendung. Nur die Kette, die im Erstgespräch zählt:

1. `bewerte()` → trägt es bereits? → **grün**
2. sonst: kleinster Eigenkapitalbetrag, der es kippt → **gelb** mit Betrag
3. sonst: tragbarer Kaufpreis → **gelb** mit Preisgrenze
4. sonst → **rot**

Also höchstens zwei Hebelsuchen statt zehn, und genau die zwei Fragen, die am
Telefon gestellt werden.

| Farbe | Text auf der Karte | Bedeutung |
|---|---|---|
| grün | `trägt · 78 % Auslauf` | Mit den erfassten Daten darstellbar |
| gelb | `braucht 18.500 € mehr EK` | Ein Betrag, nach dem gefragt werden kann |
| gelb | `Objekt bis 310.000 €` | Wenn auch mehr Eigenkapital nicht reicht |
| rot | `trägt auch dann nicht` | Der Haushalt schafft die Rate in keiner Konstellation |
| grau | `Daten unvollständig` | Keine Aussage; fehlende Felder im Tooltip |

Farben kommen aus dem vorhandenen `TONE`-System und der `StatusDot`-Komponente,
nicht aus neu erfundenen Werten. Eine Zeile je Karte — mehr Platz hat ein
Kanban-Kärtchen nicht. Die Begründung steht im `title`-Attribut.

### 5.1 Rot heißt wirklich rot

Rot erscheint nur, wenn weder zusätzliches Eigenkapital noch ein kleineres
Objekt es lösen: Der Haushalt trägt die Rate dann selbst ohne jeden
Darlehensanteil nicht. Das ist die einzige Farbe, bei der „nicht anrufen" eine
vertretbare Schlussfolgerung ist.

**Grau ist kein Urteil, sondern eine Datenlücke** und wird optisch deutlich
anders behandelt. Eine Datenlücke als Absage zu lesen wäre der Fehler, der das
Werkzeug unbrauchbar macht.

### 5.2 Nicht überall

Bei **verlorenen und abgeschlossenen** Fällen bleibt die Ampel weg. Dort ist
eine Machbarkeitsschätzung erledigt oder gegenstandslos und erzeugt nur Lärm.

## 6. Absicherung

`ampelFuer` ist rein und ohne Datenbank:

- je ein Test für grün, gelb (Eigenkapital), gelb (Kaufpreis), rot
- **fehlende Daten ergeben grau, nie rot** — der wichtigste Test
- verlorene und abgeschlossene Fälle bekommen keine Ampel
- der Eigenkapitalbetrag ist auf 100 € aufgerundet (kommt aus `kleinsterWert`)

Für das Mapping zusätzlich:

- `bank_savings_amount_towards_down_payment` landet in `financing.eigenkapital`
- **tolerantes Parsen**: `"30000.0"`, `30000.0` und `20000` führen alle auf
  30000 bzw. 20000; `""`, `null` und `0` auf „nicht gesetzt"

## 7. Abgrenzung

| Baustein | Verhältnis zur Ampel |
|---|---|
| Machbarkeits-Solver | liefert die Rechnung; die Ampel ist eine verkürzte Sicht darauf |
| Machbarkeitsseite | zeigt alle Hebel; die Ampel nur die zwei wichtigsten Zahlen |
| Next-Step-Stufe `machbarkeit` | wirkt je Fall; die Ampel wirkt über alle Fälle hinweg |
| `cockpit.ts` | rechnet den Solver bereits je Fall — bleibt unverändert |
| Dashboard | rechnet den Solver bewusst NICHT; daran ändert sich nichts |
