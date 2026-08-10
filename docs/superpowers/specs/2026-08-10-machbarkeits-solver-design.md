# Machbarkeits-Solver – Design

Datum: 2026-08-10
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Eine Ampel sagt „rot". Ein Berater sagt „mit 14.500 € mehr wird es grün".

BaufiDesk rechnet heute die Haushaltsrechnung (`src/lib/haushalt/rechnung.ts`,
rein und testbar) und zeigt Risiken aus dem Katalog. Was fehlt, ist die
Rückwärtsrichtung: **welche kleinste Veränderung macht einen Fall darstellbar?**

Das ist die Frage, die im Kundengespräch über Absage oder Abschluss entscheidet.
Sie wird heute im Kopf beantwortet, unvollständig und ohne Nachweis.

Zusätzlich fehlt eine Beleihungsauslauf-Rechnung vollständig — es gibt im Code
keine Stelle, die Nebenkosten inklusive Grunderwerbsteuer ermittelt oder den
Auslauf bestimmt.

## 2. Ziel

Ein Werkzeug, das je Fall sagt:

1. **Woran es scheitert** — Auslauf oder Haushalt
2. **Welche Hebel es gibt** und wie groß die Veränderung sein müsste
3. **Was jeder Hebel kostet** — und wo er nichts bringt oder sogar schadet

### Nicht Teil dieser Ausbaustufe

- Interaktive Regler zum Durchspielen (eigenes Vorhaben, gleiche Rechenkerne)
- Kunden-PDF „Drei Wege" (erst intern gegenprüfen, dann nachrüsten)
- KfW- und Landesförderung als Hebel (gehört zum Fördermittel-Radar)
- Bank-Matching „wer nimmt das?" (eigenständiges Vorhaben)

## 3. Grundsatzentscheidungen

### 3.1 Kein KI-Anteil

Der Solver ist vollständig deterministisch. Ob ein Hebel anwendbar ist, steht in
den Daten (gibt es eine `Liability` mit Rate? ist es Neubau?), und die Rechnung
ist Arithmetik. Kein Rate-Limit, keine Halluzination, jede Zahl im Test
nachvollziehbar — nötig, weil diese Zahlen gegenüber Kunden vertreten werden.

### 3.2 Numerische Suche statt Umkehrformeln

Eine Bewertungsfunktion, viele Hebel. Umkehrformeln scheitern daran, dass Hebel
auf **beide** Kennzahlen gleichzeitig wirken: Mehr Eigenkapital senkt den Auslauf
*und* den Darlehensbetrag, damit die Rate, damit den Haushalt. Jede Kombination
bräuchte ihre eigene verschachtelte Formel.

Stattdessen: je Hebel eine kleine Funktion „wende Wert X auf den Fall an", dann
die Bewertungsfunktion darüber. Wechselwirkungen fallen automatisch richtig heraus,
ein neuer Hebel kostet keine Mathematik.

### 3.3 Raster mit Verfeinerung, nicht Bisektion

Bisektion setzt Monotonie voraus („mehr ist immer besser"). Zwei Hebel verletzen
das: **Inventar herausrechnen** und **Nebenkosten über Ratenkredit** können den
Fall auch verschlechtern. Deshalb rund 20 Stützstellen über den sinnvollen
Bereich, dann eine feinere Runde um die beste Stelle. Eine Mechanik für alle
Hebel, rund 40 Auswertungen einer reinen Funktion — vernachlässigbar.

## 4. Die Bewertungsfunktion

Eine reine Funktion `bewerte(fall, annahmen) → Urteil`. Der einzige Ort, an dem
„machbar" definiert wird.

### 4.1 Beleihungsauslauf

```
Darlehensbedarf = Kaufpreis + Modernisierung + Nebenkosten
                − Eigenkapital
                + mitfinanzierte Restschulden
                − über Ratenkredit finanzierter Anteil

Beleihungswert  = Kaufpreis (ohne Inventaranteil)
                + freier Beleihungsraum einer Zusatzsicherheit

Auslauf         = Darlehensbedarf / Beleihungswert
```

Der Nenner ist der **Kaufpreis, nicht die Gesamtkosten**. Nebenkosten sind nicht
beleihbar — genau daran scheitern die Fälle.

### 4.2 Auslaufbänder und Zinsaufschlag

Hoher Auslauf ist **kein KO-Kriterium**, sondern teurer. Bei tragfähiger Bonität
werden Nebenkosten mitfinanziert.

| Band | Bedeutung |
|---|---|
| ≤ 60 % | beste Konditionen — Realkreditgrenze, über Pfandbriefe refinanzierbar |
| ≤ 80 % | Standardkondition |
| ≤ 90 % | Aufschlag |
| ≤ 100 % | Vollfinanzierung, spürbarer Aufschlag |
| ≤ 110 % | Nebenkosten mitfinanziert, deutlicher Aufschlag, nur bei starker Bonität |
| > 110 % | praktisch nicht darstellbar |

**Der Zinsaufschlag des Bandes erhöht die Rate und damit die Belastung des
Haushalts.** Deshalb scheitert ein Fall nie „am Auslauf", sondern daran, dass der
Haushalt den zum Auslauf gehörenden Zins nicht mehr trägt. Genau diese Kopplung
macht die numerische Suche nötig.

Liegt am Fall ein konkreter `sollzinsProzent` aus einem Angebot vor, gilt er als
Basis für das **aktuelle** Band; die übrigen Bänder ergeben sich über die
Abstände der Aufschlagstabelle.

#### Woher die Aufschläge kommen — und wie mit ihrer Unschärfe umgegangen wird

Es gibt keinen „richtigen" Aufschlag: er hängt von Bank, Produkt und Tagesmarkt
ab. Den Vermittler nach einer Zahl zu fragen, wäre eine Frage nach etwas, das es
nicht als eine Zahl gibt.

Deshalb drei Mechanismen statt einer erfundenen Präzision:

1. **Vorgaben aus einer dokumentierten Marktspanne**, nicht aus der Luft:
   bis 60 % kein Aufschlag, 60–80 % Standard, 80–90 % rund 0,1–0,3 Punkte,
   90–100 % rund 0,3–0,8 Punkte, darüber deutlich mehr. Die Vorgabewerte sind die
   Mitte dieser Spannen und werden auch so beschriftet.
2. **Ein konkreter Sollzins am Fall sticht jede Annahme.** Sobald ein echtes
   Angebot vorliegt, ist die Annahme aus der Rechnung heraus.
3. **Der Solver beziffert seine eigene Unsicherheit.** Jedes Hebelergebnis wird
   zusätzlich am unteren und oberen Rand der Spanne gerechnet und mit
   ausgegeben:

   > **14.500 € mehr Eigenkapital** — Auslauf 108 % → 100 %
   > *Bei ungünstigerem Zinsaufschlag: 17.200 €. Bei günstigerem: 12.800 €.*

   Damit ist die Unbekannte sichtbar statt versteckt. Bei einem Fall, der am
   Beleihungsauslauf scheitert, ist die Spanne ohnehin bedeutungslos — der
   Aufschlag wirkt nur auf die Haushaltsseite.

Später ließen sich die Aufschläge aus den echten Europace-Ergebnislisten der
Organisation kalibrieren. Nicht Teil dieser Ausbaustufe.

### 4.3 Nebenkosten

Muss der Solver selbst rechnen, weil mehrere Hebel sie verändern:

- **Grunderwerbsteuer** je Bundesland (3,5 – 6,5 %)
- **Notar und Grundbuch**, rund 2 %
- **Maklerprovision** aus `maklerprovisionProzent`

Ist am Fall bereits ein Nebenkosten-Betrag erfasst, gewinnt dieser. Nie beides.

### 4.4 Bundesland aus PLZ und Ort

Eine Gemeinde gehört zu genau einem Bundesland — PLZ **und** Ort zusammen sind
eindeutig. Die PLZ allein ist es nicht: rund hundert der gut 8.000 fünfstelligen
Postleitzahlen laufen über eine Landesgrenze, weil PLZ-Gebiete an Zustellwegen
geschnitten sind.

Deshalb eine echte Zuordnungstabelle mit dem Ort als Auflöser in Grenzfällen,
**keine Präfix-Faustregel**. Die Tabelle stammt aus einer belastbaren Quelle; sie
wird bei der Umsetzung beschafft und geprüft.

Das angenommene Bundesland und der Steuersatz stehen sichtbar im Ergebnis und
sind je Fall überschreibbar: 3,5 gegen 6,5 % sind bei 400.000 € Kaufpreis 12.000 €
Unterschied, das darf nicht unsichtbar passieren.

### 4.5 Haushaltsüberschuss

Aus dem vorhandenen `berechneHaushalt()`, aber gefüttert mit dem **gerechneten**
Darlehensbetrag und dem **bandabhängigen Zins** statt mit `darlehenswunsch` und
Stress-Annuität. Sonst rechnet der Solver mit Zahlen, die seine eigenen Hebel
längst verändert haben.

### 4.6 Urteil

```
machbar = auslauf <= 110 % (Obergrenze, überschreibbar)
       && ueberschuss >= puffer (Vorgabe 0 €, überschreibbar)
```

## 5. Die neun Hebel

Jeder Hebel ist eine Funktion „wende Wert X auf den Fall an". Sie zerfallen in
zwei Sorten, und das bestimmt die Oberfläche.

*Im Code sind es zehn Einträge: „Einnahmen erhöhen" steht mit seinen beiden
Ausprägungen getrennt, weil sie unterschiedlich rechnen — der weitere
Darlehensnehmer bringt seine Lebenshaltungspauschale mit.*

### 5.1 Datengestützte Hebel

Stecken bereits im Fall; werden nur gezeigt, wenn es sie gibt.

| Hebel | Achse | Wirkung |
|---|---|---|
| **Konsumkredit mitfinanzieren** | je Kredit ja/nein | Restschuld erhöht das Darlehen (Auslauf ↑), Rate entfällt (Haushalt ↑) |
| **Tilgung senken** | Tilgungssatz bis 1,0 % | nur Rate und Haushalt, nicht der Auslauf |
| **Inventar herausrechnen** | Betrag | **nicht eindeutig positiv**, siehe unten |
| **Kaufpreis nachverhandeln** | Betrag | senkt Darlehen, Grunderwerbsteuer und Nebenkosten |

### 5.2 Hypothetische Hebel

Stehen nirgends in den Daten. Der Solver rechnet aus, **wie groß** sie sein
müssten. Das Ergebnis ist keine Rechnung, sondern eine Frage an den Kunden —
deshalb werden sie **immer** angezeigt, auch ohne erfasste Daten. Sie sind die
Fragenliste für das nächste Telefonat.

| Hebel | Achse | Wirkung |
|---|---|---|
| **Mehr Eigenkapital** | Betrag | senkt Darlehen, Auslauf und Rate |
| **Eigenleistung anrechnen** | Betrag, gedeckelt | wie Eigenkapital; nur bei Neubau oder Modernisierung |
| **Einnahmen erhöhen** | € netto/Monat | zwei Ausprägungen, siehe unten |
| **Zusatzsicherheit** | freier Beleihungsraum | senkt den Auslauf **ohne Bargeld**; über das bessere Band sinkt auch die Rate |

Zwei Zahlen, die als Annahme festzulegen sind:

- **Eigenleistungs-Deckel:** Vorgabe 15 % der Bau- beziehungsweise
  Modernisierungskosten, überschreibbar. Banken setzen hier unterschiedlich an.
- **Freier Beleihungsraum** einer Zusatzsicherheit ist die Achse selbst, nicht
  abgeleitet — der Vermittler kennt ihn nicht als Zahl. Die Oberfläche nennt
  deshalb die Rechnung dazu: Verkehrswert × Beleihungssatz − bestehende
  Grundschulden. Der Solver antwortet mit der **nötigen** Größe, nicht mit einer
  Bewertung fremder Objekte.
| **Nebenkosten über Ratenkredit** | Betrag | **nicht eindeutig positiv**, siehe unten |

### 5.3 Die drei Hebel mit Fallstricken

**Inventar herausrechnen** wird gern als Trick verkauft, ist aber ein Tausch: Die
Grunderwerbsteuer sinkt, aber die Bank beleiht nur den Immobilienanteil — der
Beleihungswert im Nenner sinkt mit, der Auslauf **steigt**, und das Inventar ist
aus Eigenkapital zu zahlen. Ob es hilft, hängt vom Fall ab.

**Nebenkosten über Ratenkredit**: Auslauf runter, Haushalt runter. Kurze Laufzeit
und hoher Zins (Annahmen, überschreibbar). Manchmal die Rettung, manchmal das
Gegenteil.

**Einnahmen erhöhen** hat zwei Ausprägungen mit deutlich verschiedenem Ergebnis:

- *Gleicher Haushalt* (Gehaltserhöhung, Nebenjob): zählt voll.
- *Weiterer Darlehensnehmer im Haushalt*: bringt die Lebenshaltungspauschale mit —
  `berechneHaushalt()` rechnet je weiterem Erwachsenen 300 € dagegen. Die Antwort
  lautet dann nicht „150 € reichen", sondern „ein zweiter Darlehensnehmer muss
  mindestens 450 € netto mitbringen".

### 5.4 Suche

- **Stufenlose Hebel:** rund 20 Stützstellen über den sinnvollen Bereich, dann
  eine feinere Runde um die beste Stelle.
- **Konsumkredit-Ablösung** ist diskret: bei bis zu fünf Krediten alle 32
  Kombinationen, darüber die wirksamsten zuerst.
- **Reicht kein einzelner Hebel**, werden zusätzlich alle **Paare** geprüft. Mehr
  nicht — wer drei Stellschrauben gleichzeitig braucht, hat kein Finanzierungs-,
  sondern ein Objektproblem.

## 6. Ausgabe

### 6.1 Zuerst die Diagnose

> Beleihungsauslauf 108 %, Haushaltsüberschuss −142 €.
> **Der Fall scheitert am Haushalt, nicht am Eigenkapital.**

Ohne diesen Satz ist die Hebelliste wertlos: Er entscheidet, welche Frage dem
Kunden überhaupt gestellt wird.

### 6.2 Je Hebel vier Angaben

> **Konsumkredit mitfinanzieren** — Autokredit, Restschuld 8.900 €, Rate 312 €
> Auslauf 108 % → 110 %, Rate +41 €, Haushalt −142 € → **+129 €**
> Preis: Auslauf steigt ins oberste Band, Zinsaufschlag entsprechend
> **Reicht allein.**

Nötige Größe, Wirkung auf beide Kennzahlen mit Vorher-Nachher, Preis, und ob es
allein reicht.

**Beträge werden auf 100 € aufgerundet.** 14.437 € wird zu 14.500 €; eine
abgerundete Empfehlung unterschreitet die Schwelle, die sie erreichen soll.

### 6.3 Hebel, die nicht reichen, verschwinden nicht

> Auch 100.000 € mehr Eigenkapital lösen es nicht — der Haushalt trägt die Rate
> auch ohne Darlehensanteil nicht.

Das ist die Information, die eine Absage begründet.

### 6.4 Bei tragfähigen Fällen: Optimierung statt Rettung

> Der Fall trägt. Mit 22.000 € mehr Eigenkapital kommen Sie unter 80 % und damit
> in die bessere Kondition.

Der Solver zielt dann aufs nächstbessere Band. Sonst wäre das Werkzeug bei
gesunden Fällen leer — und gerade dort wird Geld verdient.

### 6.5 Fehlende Daten: keine Rechnung

Ohne Kaufpreis oder Nettoeinkommen gibt es **kein Ergebnis**, sondern eine Liste
der fehlenden Angaben. Nie mit stillen Nullen weiterrechnen — genau dieser Fehler
hat in diesem Projekt schon einmal eine Einkommensanalyse unbemerkt kaputtgemacht.

### 6.6 Reihenfolge

Keine erfundene Rangfolge über verschiedene Einheiten hinweg. Gruppiert:

1. datengestützte Hebel, die allein reichen
2. hypothetische Hebel, die allein reichen
3. Paare
4. Hebel, die nicht reichen (mit Grenze)

## 7. Oberfläche und Einbindung

**Eigene Unterseite `/cases/[id]/machbarkeit`**, neben der bestehenden
Haushaltsseite — dieselben Zahlen, und die Fallakte hat für Rechenwerkzeuge schon
dieses Muster (Haushalt, Wohnfläche, Einkommen).

**Kein neues Datenmodell für das Ergebnis.** Es ist vollständig abgeleitet und
wird bei jedem Aufruf frisch gerechnet — nichts zu speichern, nichts, was
veralten kann.

Zwei Ausnahmen, beides überschreibbare Annahmen:

- **Grunderwerbsteuersatz je Fall** — falls die Ableitung aus PLZ und Ort
  danebenliegt
- **Basiszins und Aufschläge je Auslaufband, je Organisation** — Marktkenntnis des
  Vermittlers, ändert sich laufend

Dafür eine kleine Seite `/settings/machbarkeit` mit Basiszins und fünf
Aufschlägen. Ob diese Werte an ein vorhandenes Organisationseinstellungs-Modell
passen oder ein kleines neues brauchen, wird bei der Umsetzung geprüft, nicht
geraten.

Die Startwerte der Aufschläge sind **klar gekennzeichnete Platzhalter** und im
Ergebnis als „Annahme" ausgewiesen, damit nie der Eindruck von Marktzinsen
entsteht.

**Next-Step-Leiter:** eine Stufe **nach** den kritischen Hinweisen und **vor** den
Unterlagen-Lücken. Einen Fall, der so nicht darstellbar ist, klärt man, bevor man
weiter Unterlagen einsammelt. Die Stufe erscheint nur, wenn der Solver genug Daten
hatte und trotzdem „nicht darstellbar" sagt — bei dünner Datenlage schweigt sie.

## 8. Absicherung

Alles rein und ohne KI, also vollständig testbar:

- Rechenkern gegen von Hand nachgerechnete Fälle
- ein Fall je Auslaufband, inklusive der Sprungstelle bei 60 %
- **der Inventar-Fall, in dem der Hebel schadet** — der Test hält fest, dass der
  Solver das sagt statt es zu verschweigen
- der Ratenkredit-Fall, in dem er schadet
- „nicht erreichbar": auch der Maximalwert des Hebels löst es nicht
- fehlende Daten führen zur Fehlliste, nie zu einer Rechnung mit Nullen
- Aufrundung: 14.437 € muss 14.500 € ergeben, nie 14.400 €
- Bundesland-Zuordnung: mindestens ein Grenzfall, bei dem erst der Ort entscheidet
- „weiterer Darlehensnehmer" rechnet die Lebenshaltungspauschale dagegen

## 9. Abgrenzung zu bestehenden Bausteinen

| Baustein | Verhältnis zum Solver |
|---|---|
| `haushalt/rechnung.ts` | wird **unverändert** genutzt; der Solver füttert nur andere Eingaben |
| `rules/risk-catalog.ts` | benennt Risiken; der Solver rechnet Auswege |
| `ai/cross-checks.ts` | prüft Werte gegeneinander; der Solver verändert sie hypothetisch |
| Unterlagen-Detektiv | liefert die Datenbasis, auf der der Solver rechnet |
