# Leadphasen und Pipeline-Ansicht

**Datum:** 2026-08-07
**Status:** Design abgenommen (Jürgen, 07.08.2026)

## Problem

BaufiDesk kennt den Bearbeitungsstand einer Akte (`CaseStatus`: `neu`,
`upload_offen`, `unterlagen_fehlen`, `einreichungsfertig`, `exportiert` …), aber nicht den
Vertriebsstand eines Leads. Jürgen sieht nirgends, wie viele Interessenten
gerade beim Erstkontakt hängen, wo Geld liegt und welcher Fall seit zwei Wochen
nicht bewegt wurde. Das ist der erste von drei Schritten, mit denen BaufiDesk
FinLink ablöst (siehe [[baufidesk-ersetzt-finlink-crm]]).

Die vorhandene Seite `/pipeline` heißt zwar so, rechnet aber Courtage (offen vs.
abgeschlossen) und ist keine Vertriebsübersicht.

### Was FinLink tatsächlich tut

Am 07.08.2026 in Jürgens FinLink-Backend (`admin.finlink.de`) angesehen:

- Der **Filter** kennt nur vier grobe Zustände: Aktiv · On hold · Abgeschlossen
  verloren · Abgeschlossen gewonnen. Das ist das `sales_state`, das die
  FinLink-API liefert und das BaufiDesk heute schon liest.
- Die **Liste** zeigt daneben einen feineren Status, der den Arbeitsschritten
  folgt: „Anfrage erstellt", „Selbstauskunft gestartet",
  „Finanzierungsvorschlag …", „Kreditprüfung eingereicht",
  „Finanzierung abgeschlossen".
- **„Verloren" steht quer dazu** — ein roter Marker am Namen, kein eigener
  Listenpunkt. Beim Setzen fragt FinLink nach einem Grund
  („‚Verloren'-Grund auswählen").
- Die **Quelle hängt als Tag** am Vorgang (z. B. „Vergleich.de"); „Quellen" ist
  ein eigener Menüpunkt.
- Über der Liste steht **Anzahl und Volumensumme** („25 Anträge ·
  9.059.927 € Darlehenssumme").

Die Board-Ansicht (`/loan-applications/board`) blieb bei Jürgens Konto leer —
entweder Filter oder ein Fehler bei FinLink. Das Kanban hier folgt deshalb der
Listenansicht.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Phasen | Sieben, an FinLinks Wortwahl angelehnt |
| Verhältnis zum Bearbeitungsstatus | Zweite, unabhängige Dimension am Fall |
| Wer setzt die Phase | BaufiDesk schlägt vor, Jürgen bestätigt per Klick |
| Verloren | Kein Phasenwert, sondern quer dazu — mit Grund aus fester Liste |
| Wiedervorlage | Kein neues Konzept; das vorhandene `Case.wiedervorlage` wird angezeigt |
| Darstellung | Kanban mit einer Spalte je Phase |
| Bestehende Seite | Kanban oben auf `/pipeline`, Courtage-Auswertung darunter |
| Historie | Keine eigene Tabelle; Wechsel landen im Audit-Log |

Begründung gegen einen Phasenwert „verloren": Ein verlorener Fall hat eine
Vorgeschichte. Bleibt die zuletzt erreichte Phase erhalten, ist auswertbar, **wo**
verloren wird — beim Vorschlag oder erst in der Kreditprüfung. Ein Phasenwert
„verloren" würde genau diese Information löschen.

Begründung gegen eine Historientabelle: Sie beantwortet nur eine Frage
(Verweildauer je Phase), die heute niemand stellt, kostet aber dauerhaft einen
zweiten Ort für dieselbe Wahrheit. Die Audit-Einträge geben dieselbe Antwort,
sobald sie gebraucht wird.

## Die sieben Phasen

| Wert | Anzeige |
| --- | --- |
| `neu` | Neu |
| `anfrage_erstellt` | Anfrage erstellt |
| `selbstauskunft_laeuft` | Selbstauskunft läuft |
| `finanzierungsvorschlag` | Finanzierungsvorschlag |
| `kreditpruefung_eingereicht` | Kreditprüfung eingereicht |
| `zusage` | Zusage |
| `abgeschlossen` | Finanzierung abgeschlossen |

## Datenmodell (additiv)

```prisma
enum LeadPhase {
  neu
  anfrage_erstellt
  selbstauskunft_laeuft
  finanzierungsvorschlag
  kreditpruefung_eingereicht
  zusage
  abgeschlossen
}

model Case {
  leadPhase     LeadPhase @default(neu)
  /** Zeitpunkt des letzten Phasenwechsels – speist die Liegezeit auf der Karte. */
  leadPhaseSeit DateTime  @default(now())
  verlorenAm    DateTime?
  verlorenGrund String?
}
```

`verlorenAm` gesetzt heißt verloren; `leadPhase` bleibt dabei stehen.

### Verlustgründe

Feste Liste (`src/lib/domain/enums.ts`), weil sich Freitext nicht auswerten
lässt — plus ein Freitextfeld daneben, weil keine Liste vollständig ist:

`kondition` (Kondition zu teuer) · `objekt_weg` (Objekt anderweitig vergeben) ·
`bank_abgelehnt` (Bank hat abgelehnt) · `nicht_erreichbar` (Kunde nicht
erreichbar) · `anderer_vermittler` · `verschoben` (Vorhaben verschoben) ·
`sonstiges`.

## Vorschlagsregel

`schlagePhaseVor(fall): LeadPhase | null` in
`src/lib/cases/lead-phase.ts` — reine Logik, keine Datenbank, kein KI-Aufruf.
Schlägt höchstens eine Phase vor, **nur vorwärts** und **nie bei einem
verlorenen Fall**.

| Vorschlag | Signal |
| --- | --- |
| `anfrage_erstellt` | Upload- oder Selbstauskunftslink erzeugt, oder eine `GeneratedMessage` mit `sent = true` vorhanden |
| `selbstauskunft_laeuft` | Selbstauskunft begonnen (`currentStep` gesetzt) oder mindestens ein Dokument vorhanden |
| `kreditpruefung_eingereicht` | Status `exportiert` oder `uebertragen` |
| `abgeschlossen` | Status `abgeschlossen` oder `abschlussdatum` gesetzt |

Für **`finanzierungsvorschlag` und `zusage` gibt es bewusst keinen Vorschlag.**
Beides passiert außerhalb des Systems (Vorschlag in Europace, Zusage per Mail).
Ein erfundenes Signal — etwa „Akte vollständig, also wohl Vorschlag" — läge oft
daneben; man gewöhnt sich das Wegklicken an und übersieht dann die richtigen
Vorschläge. Diese zwei Phasen setzt der Vermittler selbst.

## Die Ansicht

`/pipeline`: oben das Kanban, darunter unverändert die Courtage-Auswertung.

**Spaltenkopf:** Phasenname, Anzahl, Summe des Volumens. Volumen je Fall =
`darlehensbetrag` ?? `financingRequest.darlehenswunsch` ?? `financingRequest.kaufpreis`.

**Karte:** Kundenname, Volumen, Liegezeit („seit 6 Tagen"), Wiedervorlage-Datum
falls gesetzt. Platz für die Quelle bleibt frei — sie kommt mit dem Lead-Eingang
per API, hier wird nicht vorgegriffen.

**Sortierung:** je Spalte nach Liegezeit, das Älteste oben. Eine Pipeline soll
Staus zeigen, nicht Neuzugänge.

**Bedienung:** Ziehen der Karte in eine andere Spalte. Zusätzlich hat jede Karte
ein Menü „Phase ändern" mit denselben Zielen — Ziehen ist auf dem Handy und ohne
Zeigegerät unzuverlässig. Auf schmalen Bildschirmen stapeln sich die Spalten
untereinander, jede aufklappbar.

**Verlorene** stehen nicht im Board. Ein Umschalter „Verlorene anzeigen" blendet
sie als achte Spalte ganz rechts ein, mit Grund auf der Karte.

**Offener Vorschlag:** Die Karte trägt einen Chip („→ Selbstauskunft läuft?") mit
Haken zum Bestätigen. Bewusst **nicht** in der Prioritätsleiter der Fallseite:
Die beantwortet „Was muss ich jetzt tun?", und eine Phase zu bestätigen ist
Buchhaltung über die Arbeit, nicht die Arbeit selbst.

**Auf der Fallseite** steht die Phase als Auswahl neben dem Status, mit demselben
Vorschlags-Chip.

## Grenzfälle

| Fall | Verhalten |
| --- | --- |
| Archivierter Fall | Erscheint nicht im Board |
| Verlorene Karte zurück ins Board gezogen | Verlust wird aufgehoben, nach Rückfrage (Grund und Datum gehen verloren) |
| Zwei offene Tabs verschieben dieselbe Karte | Letzter Klick gewinnt; jeder Wechsel steht im Audit-Log |
| Karte auf dieselbe Spalte gezogen | Nichts passiert, kein Audit-Eintrag |
| Mehr als 50 Karten je Spalte | Nur 50 geladen, darunter „n weitere anzeigen" |
| Fall ohne Volumen | Karte zeigt „—", die Spaltensumme ignoriert ihn |

## Bestandsdaten

Ein einmaliger Lauf (`scripts/backfill-lead-phase.ts`) setzt die Phase aller
vorhandenen Fälle über **dieselbe** `schlagePhaseVor`-Funktion. Ein Codepfad
statt einer zweiten Zuordnung, die anders altert als die Regel. `leadPhaseSeit`
bekommt dabei `updatedAt` des Falls, damit die Liegezeiten nicht alle bei null
beginnen.

## Tests

1. **Vorschlagsregel, rein** — jedes Signal einzeln; kein Rückwärtsvorschlag;
   kein Vorschlag bei verlorenem Fall; keiner für `finanzierungsvorschlag` und
   `zusage`.
2. **Gruppierung, rein** — Karten in Spalten, Summen, Sortierung nach Liegezeit,
   Deckelung bei 50.
3. **Aktionen gegen Mocks** — fremde Organisation abgewiesen, Verlust mit und
   ohne Grund, Verlust aufheben, Wechsel auf dieselbe Phase schreibt nichts.
4. **PGlite** — Bestandsdaten-Lauf gegen das echte Schema: Fälle in
   verschiedenen Zuständen bekommen die erwartete Phase.

## Nicht in diesem Schritt

- Keine Quelle auf der Karte (kommt mit dem Lead-Eingang per API).
- Keine Auswertung von Verweildauern oder Abschlussquoten.
- Keine automatische Phasenänderung ohne Bestätigung.
- Keine Phasen je Organisation konfigurierbar — sieben feste Werte.

## Nebenbefund (nicht Teil dieser Umsetzung)

`src/lib/cases/next-step.ts:149` prüft `c.status === "eingereicht"`. Diesen Wert
gibt es in `CaseStatus` nicht — die Aufzählung kennt `einreichungsfertig`,
`exportiert`, `uebertragen`, `bank_nachforderung`. Der Zweig „Fristen &
Nachforderungen im Blick behalten" ist damit nur über `bank_nachforderung`
erreichbar; nach einem Export fällt der Fall direkt auf „Einreichung
vorbereiten" zurück. Gleiches Muster im Kommentar von
`case-management.ts:225`. Sollte separat gefixt werden — hier bewusst nicht
mitgeändert, um den Zuschnitt sauber zu halten.

## Offene Punkte für später

- Verweildauer-Auswertung aus den Audit-Einträgen („durchschnittlich 6 Tage von
  Anfrage zu Vorschlag").
- Automatische Wiedervorlage beim Phasenwechsel („Zusage → in 3 Tagen nachfassen").
- Signale für `finanzierungsvorschlag` und `zusage`, sobald Europace-Rückmeldungen
  angebunden sind.
