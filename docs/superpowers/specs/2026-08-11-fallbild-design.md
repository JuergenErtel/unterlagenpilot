# Das Fallbild – Design

Datum: 2026-08-11
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Die Fallseite beantwortet „was ist hier los?" heute nur durch Scrollen: Kopfkarte,
darunter die `NextStepCard`, darunter die vertikale Roadmap mit sechs Schritten,
darunter vier Register, und die Fachbereiche (Objekt, Haushalt, Machbarkeit)
liegen ganz woanders — auf eigenen Unterseiten, von der Fallseite aus unsichtbar.

Der Vermittler will den Kunden in der Mitte sehen und drumherum, wo der Fall
steht. Auf einen Blick, ohne Scrollen, anklickbar. Und das ist zugleich das
Merkmal, mit dem sich BaufiDesk absetzen soll — der direkteste Wettbewerber
zeigt Listen (siehe Wettbewerbsanalyse HYPOFY).

## 2. Die Form: ein offener Bogen, kein Ring

Der erste Entwurf war ein geschlossener Ring mit sieben gefüllten Segmenten. Er
sah gut aus und log an vier Stellen. Ein Ring behauptet:

1. **dass alles in einer Reihe liegt.** Im Entwurf stand die Machbarkeit bei
   70 %, während die Prüfung erst bei 40 % war — im Kreis gelesen heißt das
   „übersprungen". Tatsächlich läuft die Machbarkeit einfach nebenher.
2. **dass es rundläuft.** Ein geschlossener Kreis hat keinen sichtbaren Anfang
   und kein Ende.
3. **dass „noch nicht dran" dasselbe ist wie „leer".** Ein Segment auf 0 % liest
   sich als Versäumnis, nicht als Reihenfolge.
4. **dass es einen Punkt gibt, an dem man gerade steht.** In einem Verfahren mit
   parallelen Strängen gibt es den nicht.

Jede der vier Behauptungen wird einzeln entschärft:

### 2.1 Nur echte Tore liegen auf dem Bogen

Auf dem Bogen steht ausschließlich, was wirklich nacheinander passieren **muss**:

    Erstkontakt → Kundendaten → Unterlagen → Prüfung → Einreichung

Fünf Tore statt sieben Segmente — nebenbei löst das die zweite Schwäche des
Ringentwurfs, den fehlenden Platz für Beschriftung.

Alles, was **keine** Reihenfolge beansprucht, liegt als Feld in der Mitte um den
Kunden herum: **Objekt**, **Einkommen & Haushalt**, **Machbarkeit**,
**Nachrichten**. Damit ist der Widerspruch aus Punkt 1 nicht kaschiert, sondern
strukturell verschwunden: Die Machbarkeit steht nicht mehr *nach* der Prüfung,
sie steht *neben* allem.

### 2.2 Der Bogen ist offen

300° Bogen, 60° Lücke unten. An den beiden Enden stehen sichtbar **Start** und
**Ziel**. Der Weg steigt links auf, läuft über den Scheitel und endet unten
rechts.

### 2.3 Gesperrt statt null Prozent

Ein Tor, das auf ein anderes wartet, wird nicht als leerer Balken gezeigt,
sondern gestrichelt — mit dem Grund als Zustandszeile: „wartet auf die Prüfung".

**Gesperrt ist ein Merkmal, kein Zustand.** Ein Tor kann gesperrt sein *und*
Fortschritt haben (die Einreichung ist zu 60 % vorbereitet, aber durch einen
kritischen Hinweis blockiert). Gestrichelt und ungefüllt wird deshalb nur
gezeichnet, wenn der Fortschritt tatsächlich 0 ist; sonst bleibt die Füllung und
nur die Zustandszeile nennt den Grund. Fortschritt zu verstecken, den es gibt,
wäre derselbe Fehler in die andere Richtung.

Das ist dieselbe Denkfigur wie „keine Angabe ≠ Nein" im
[Banken-Wiki](2026-08-11-banken-wiki-fragen-design.md): Ein fehlender Wert ist
eine Aussage über uns, keine über die Sache.

### 2.4 „Als Nächstes" statt „hier stehst du"

Die türkise Marke zeigt nicht, wo man steht, sondern was als Nächstes dran ist —
berechnet von der vorhandenen Prioritätsleiter (`computeNextStep`). Lässt sich
deren Schritt keinem Tor und keinem Feld zuordnen (z. B. `fristen`), bleibt die
Zeichnung **ohne Marke**; das Band darunter nennt den Schritt trotzdem. Lieber
keine Marke als eine, die auf das Falsche zeigt.

## 3. Aufbau der Ansicht

```
                    Unterlagen        Prüfung  ◀ ALS NÄCHSTES
              ╭─────────────────────────────────╮
   Kunden-   ╱   ┌──────────┐   ┌──────────┐    ╲
   daten    │    │ Objekt   │   │ Einkommen│     │  Einreichung
            │    └──────────┘   └──────────┘     │
            │        ╭───────────────────╮       │
            │        │  UP-2026-0014     │       │
            │        │  Behrend          │       │
            │        │  420.000 €        │       │
            │        ╰───────────────────╯       │
   Erst-    │    ┌──────────┐   ┌──────────┐     │
   kontakt   ╲   │ Machbark.│   │ Nachr.   │    ╱
              ╲  └──────────┘   └──────────┘   ╱
          Start ╰─────────────────────────╯ Ziel
                 diese vier laufen nebenher

  ▌EMPFEHLUNG  3 Dokumente freigeben              [Review-Center öffnen]
```

Ein Klick auf ein Tor oder ein Feld tauscht **nur das Band** aus: Zustand,
Begründung, ein Knopf zum Öffnen und „Zur Empfehlung" zurück. Erst der Knopf
verlässt die Seite. So kann man sich durch den ganzen Fall klicken, ohne die
Übersicht zu verlieren — genau das, was „auf einen Blick" schützt.

## 4. Datenherkunft — nichts wird neu gerechnet

Ein reines Anzeigefeature. Die Zahlen kommen aus dem, was heute schon läuft:

| Element | Quelle |
|---|---|
| Erstkontakt | `ladeErstkontaktStand` (Empfänger, vorbereitet, versendet) |
| Kundendaten | `cockpit.missingCustomerFields` |
| Unterlagen | `cockpit.counts.docsPresent` / `docsMissing` |
| Prüfung | `counts.pruefbereit`, `criticals`, `warnings`, `docsFehler` |
| Einreichung | `cockpit.platformReadiness` |
| Objekt | `Property.wohnflaeche`, `WohnflaechenBerechnung` |
| Einkommen & Haushalt | Überschuss aus dem Machbarkeits-`Urteil` |
| Machbarkeit | Auslauf und Band aus dem Machbarkeits-`Urteil` |
| Nachrichten | offene `MissingDocumentRequest` (in `cockpit` bereits geladen) |
| Empfehlung | `computeNextStep` |

**Eine gezielte Verbesserung am Bestand:** `cockpit.ts` rechnet das
Machbarkeits-`Urteil` heute schon aus und wirft alles außer `machbar` weg. Es
wird künftig als `cockpit.machbarkeit` mitgegeben (Auslauf, Band, Überschuss).
Damit tragen zwei Felder ihre Zahlen aus **einer** Berechnung, statt den Solver
ein zweites Mal zu starten. `counts.machbarkeitBlockiert` bleibt unverändert —
`next-step.ts` hängt daran.

### 4.1 Fehlende Werte werden nicht erfunden

Reichen die Daten für die Machbarkeit nicht (der Solver liefert dann bewusst
nichts), zeigen die Felder „noch nicht berechnet" — keine 0 %, kein „–". Das
gilt genauso für eine fehlende Wohnfläche.

## 5. Sperrregeln

Ausdrücklich und knapp, damit nie eine Sperre erscheint, die es nicht gibt:

- **Einreichung** ist gesperrt, wenn ein kritischer Hinweis offen ist, wenn
  Pflichtfelder des Kunden fehlen oder wenn eine sofort erforderliche Unterlage
  fehlt. Genannt wird der erste zutreffende Grund.
- **Prüfung** ist gesperrt, solange kein einziges Dokument vorliegt.
- **Unterlagen**, **Kundendaten** und **Erstkontakt** werden nie gesperrt.

## 6. Einbau

Das Fallbild ersetzt auf `/cases/[id]` **zwei** Bausteine: die `NextStepCard`
und die Karte „Weg zur Einreichung" mit der vertikalen `CaseRoadmap`. Die
Register darunter (Was fehlt / Dokumente / Plausibilität / Übersicht) und die
Kopfkarte bleiben unverändert.

Das Band übernimmt den `actionSlot` der `NextStepCard` unverändert: Bei
laufender KI-Prüfung steht dort der Fortschritt, bei `ki_fehler` der
Wiederholen-Knopf, bei `erstkontakt_vorbereiten` der zugehörige Knopf. Diese
Fälle sind Server-Action-Formulare, keine Links — sie würden als Knopf mit
`href` schlicht nicht funktionieren.

### 6.1 Kleine Bildschirme behalten die Liste

Unterhalb von `lg` bleibt es bei `NextStepCard` + `CaseRoadmap`, das Fallbild
wird ausgeblendet. Eine radiale Anordnung braucht Breite; auf ein Telefon
gequetscht erzeugt sie exakt die unleserliche Ansicht, die hier abgeschafft
werden soll. Beide Bausteine existieren bereits — das kostet nichts.

## 7. Absicherung

Der Kern ist eine reine Funktion `baueFallbild(...)` ohne Datenbank und ohne
React. Sie wird geprüft auf:

- **Vollzähligkeit**: immer genau 5 Tore in fester Reihenfolge und 4 Felder.
- **Sperrregeln**: kritischer Hinweis sperrt die Einreichung mit Grund; ohne
  Grund keine Sperre; Prüfung nur bei null Dokumenten gesperrt.
- **Gesperrt trotz Fortschritt**: bei Fortschritt > 0 bleibt die Füllung, nur die
  Zustandszeile nennt den Grund.
- **Wertebereich**: kein Anteil unter 0 oder über 100.
- **Keine erfundenen Werte**: fehlt das Machbarkeits-Urteil, tragen die Felder
  „noch nicht berechnet" statt einer Zahl.
- **Abbildung der Empfehlung**: jeder Schritt der Prioritätsleiter landet auf dem
  richtigen Tor bzw. Feld; ein nicht zuordenbarer Schritt erzeugt **keine** Marke.

## 8. Bewusst nicht dabei

Bewegung und Übergänge beim Laden, Umschalten zwischen Bogen- und Listenansicht,
Fristen als fünftes Feld (naheliegender nächster Kandidat, `CaseDeadline`
existiert bereits), Anpassen der Felder durch den Nutzer.
