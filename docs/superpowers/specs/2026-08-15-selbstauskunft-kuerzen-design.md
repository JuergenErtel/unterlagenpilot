# Selbstauskunft kürzen: zwei Umfänge, ein Katalog

Stand: 15.08.2026 · Status: Entwurf zur Durchsicht

## Das Problem

Der Fragenkatalog hat 34 Schritte mit 63 Feldern, und weil Person und Beruf je
Antragsteller wiederholt werden, sieht ein Paar **39 Bildschirme** — davon 22
allein für Person und Beruf. Jeder Bildschirm stellt genau eine Frage.

Jürgens Befund vom 15.08.2026: „Das macht kaum einer mit." Er hat recht, und
der Zeitpunkt macht es schlimmer: Seit dem öffentlichen Anfrageformular füllt
den Bogen nicht mehr nur ein Kunde aus, der sich längst entschieden hat,
sondern auch ein Fremder, der nur wissen will, ob seine Finanzierung überhaupt
darstellbar ist. Für den sind 39 Bildschirme keine Hürde, sondern ein Abbruch.

Dazu ein konkreter Punkt: Der Mitantragsteller wird heute **nacheinander**
abgefragt — erst alle Fragen zur ersten Person, dann dieselben zur zweiten. Ein
Paar, das gemeinsam am Rechner sitzt, erwartet beide nebeneinander.

## Was gebaut wird

Ein Katalog, zwei Umfänge:

- Der **öffentliche Anfragebogen** fragt auf **sechs Seiten** genau das, was
  nötig ist, um zurückzurufen und zu sagen, ob es klappt.
- Der **persönliche Link** aus der Fallakte zeigt dieselben sechs Seiten und
  dahinter sieben weitere: zusammen **dreizehn** statt neununddreißig.

Und: Bei zwei Antragstellern stehen beide **nebeneinander auf einem
Bildschirm**, nicht hintereinander.

Was den kurzen Bogen inhaltlich bestimmt, ist keine Geschmacksfrage: Er fragt,
was die **Machbarkeits-Ampel** rechnet (`SolverEingabe` in
`src/lib/machbarkeit/types.ts`) — Kaufpreis, Eigenkapital, PLZ für die
Grunderwerbsteuer, Wohnfläche, Nettoeinkommen, laufende Kreditraten, Kinder,
Anzahl Antragsteller. Ein Bogen, der weniger fragt, lässt die Ampel grau.

## Zwei Umfänge, ein Katalog — und warum nicht zwei Kataloge

Verworfen: ein zweiter, kurzer Katalog neben dem bestehenden. Er wäre sofort
verständlich und dauerhaft falsch — jede Änderung an einer Frage müsste zweimal
gemacht werden. Genau diese Falle hat in diesem Projekt schon zugeschlagen
(die Beschäftigungsart, die einmal fallweit und einmal je Antragsteller
gerechnet wurde, siehe `checkliste-pro-antragsteller`).

Ebenfalls verworfen: den Umfang über die vorhandenen `sichtbar`-Bedingungen zu
lösen. Kein neues Modellfeld nötig — aber die Absicht verteilt sich auf zwanzig
einzelne Bedingungen, und wer eine Frage ergänzt, vergisst sie.

## Datenmodell

Am `Schritt` (`src/lib/self-disclosure/types.ts`) kommen zwei Angaben dazu:

```ts
  /**
   * In welchem Umfang die Seite erscheint. "kurz" heißt: in beiden Wegen.
   * "voll" heißt: nur hinter dem persönlichen Link aus der Fallakte.
   */
  umfang: "kurz" | "voll";

  /**
   * Beide Antragsteller nebeneinander auf einem Bildschirm, je eine Spalte.
   * Ersetzt `jeAntragsteller`: Dort erzeugte ein Schritt ZWEI Einträge in der
   * Kette, hier einen mit zwei Spalten.
   */
  personenSpalten?: boolean;
```

`umfang` ist **Pflicht**, nicht optional. Ein Vorgabewert würde jede neu
ergänzte Frage stillschweigend in den kurzen Bogen schieben — dorthin, wo jede
zusätzliche Frage am teuersten ist.

Die Antwortschlüssel behalten ihre Form: `<schrittId>.<feldId>`, bei
Personenspalten mit dem Präfix `p1.`/`p2.`. Damit arbeiten Übernahme,
Vorbelegung und Zusammenfassung unverändert weiter.

## Der Katalogschnitt

**Kurz — sechs Seiten:**

| # | Seite | Inhalt (aus den heutigen Schritten) |
|---|---|---|
| 1 | Vorhaben | `finanzierungsart`, `objektstand`, `nutzung` |
| 2 | Objekt & Preis | `objekt_ort`; je nach Art `kaufpreis` / `baukosten` / `modernisierungskosten` / `restschuld` / `kapitalbedarf`; Wohnfläche aus `objekt_masse`; `maklergebuehr` samt Höhe |
| 3 | Finanzierungswunsch | `eigenkapital`, `darlehen`, Wunschrate aus `kondition` |
| 4 | Haushalt | `anzahl_antragsteller`, `haushalt_kinder` |
| 5 | Personen (Spalten) | Vor-/Nachname aus `person_name`, `person_kontakt`, `beruf_art`, Nettoeinkommen aus `einkommen` |
| 6 | Verpflichtungen | `verpflichtungen` |

**Voll — dieselben sechs, dahinter sieben weitere:**

| # | Seite | Inhalt |
|---|---|---|
| 7 | Person vollständig (Spalten) | Anrede, `person_geburt`, `person_familienstand`, `person_anschrift` |
| 8 | Beruf vollständig (Spalten) | `beruf_arbeitgeber`, `beruf_dauer` bzw. `beruf_selbststaendig` |
| 9 | Weitere Einnahmen (Spalten) | restliche Felder aus `einkommen`, `weitere_einnahmen` |
| 10 | Haushaltsausgaben | `haushalt_ausgaben` |
| 11 | Eigenkapital | `eigenkapital_positionen` |
| 12 | Objekt vollständig | `objekt_art`, `objekt_adresse`, restliche `objekt_masse`, `objekt_kosten` |
| 13 | Konditionen | Zinsbindung und Sondertilgung aus `kondition`, `restschuld.zinsbindung_ende` |

Die Zuordnung **einzelner Felder** zu Seiten entscheidet der Umsetzungsplan am
tatsächlichen Katalog; die Tabellen oben sind die bindende Gliederung, nicht
die Feldliste.

Die bedingte Sichtbarkeit bleibt, wo sie heute ist: Wer eine
Anschlussfinanzierung sucht, sieht keinen Kaufpreis.

## Navigation, Fortschritt, Spalten

**Der Umfang wird abgeleitet, nicht gespeichert.** Hängt der Bogen an einem
Anfrageformular (`link.formularId` gesetzt), gilt „kurz"; hängt er an einem
Fall, gilt „voll". Ein gespeicherter Umfang wäre ein zweiter Ort, an dem der
Zustand mit der Wirklichkeit auseinanderlaufen kann.

`sichtbareSchritte(antworten, umfang)` bekommt ihn als Parameter — dieselbe
Bauart wie `jetzt` in der Kontaktstrecke: übergeben, nie gemessen.

**`SichtbarerSchritt` trägt künftig `personen: (1 | 2)[]` statt `person: 1 | 2`.**
Der Personen-Präfix wandert damit aus der Schritt-ID in den Schlüsselbau. Das
ist die Schnittstelle, an der alles hängt: Navigation, Fortschritt,
Vorbelegung, Zusammenfassung und Übernahme lesen heute `s.person`.

**Der Fortschritt** rechnet unverändert über die sichtbare Kette — sie ist nur
kürzer. Der Kunde liest „Seite 3 von 6" statt „Schritt 17 von 39". Die
angezeigte Gesamtzahl ist kein Beiwerk: Sie ist der Grund, weiterzumachen oder
abzubrechen.

**Die Spalten** rendert die vorhandene Feldkomponente
(`src/components/self-disclosure/schritt-felder.tsx`) einmal je Person. Auf
schmalen Bildschirmen stehen die Spalten untereinander, jede mit ihrer
Überschrift. Die Überschriften lauten „Sie" und „Mitantragsteller/in" — sobald
ein Vorname eingetragen ist, steht dort der Name.

Wie viele Spalten es sind, entscheidet Seite 4, also die Seite unmittelbar
davor.

## Übernahme in den Fall

**Die Übernahme liest immer die volle Kette**, gleich welchen Weg der Kunde
gegangen ist. `planUebernahme` *liest* Antworten, es *stellt* keine Fragen, und
die volle Kette ist eine Obermenge der kurzen. Damit muss der Umfang nicht bis
in die Übernahme durchgereicht werden, und ein voll ausgefüllter Bogen kann
nicht versehentlich mit der kurzen Kette gelesen werden.

Das gilt gleichermaßen für die Fallgeburt aus dem Anfrageformular
(`src/lib/leadformular/fallgeburt.ts`), die denselben Plan benutzt.

**Was mitwandern muss**, weil sich Schritt-IDs ändern:
`anzahlAntragsteller()` (`catalog.ts`) und die Schlüssel in
`src/lib/self-disclosure/pflichtangaben.ts` (`p1.person_name.nachname`,
`p1.person_kontakt.email`, `p1.person_kontakt.telefon`). Der vorhandene Test,
der diese Schlüssel wörtlich behauptet, ist die Versicherung: Er wird rot, wenn
eine Stelle vergessen wird.

## Der dritte Verbraucher: die Erstgesprächs-Maske

`src/lib/erstgespraech/maske.ts` baut die geführte Telefonmaske aus **demselben
Katalog** — „Es gibt EINEN Katalog", steht dort im Kopfkommentar. Ein Schnitt am
Katalog trifft sie also mit. Zwei Festlegungen:

**Die Maske läuft immer im vollen Umfang.** Sie ist das Werkzeug des
Vermittlers am Telefon; dort kann jede Frage drankommen, und eine Maske, die
nur die kurzen Seiten zeigt, wäre am Telefon wertlos. Dieselbe Regel wie bei
der Übernahme: Wer *liest* oder *alles zeigt*, nimmt die volle Kette.

**Ihre fest verdrahteten Schritt-IDs ziehen mit.** Die Maske nennt
`beruf_arbeitgeber`, `beruf_dauer`, `beruf_selbststaendig` und
`anzahl_antragsteller.anzahl` beim Namen (`maske.ts:160,201,204`); die
Übernahme nennt `haushalt_kinder` (`takeover.ts:96`, die Kinderzahl gilt dem
Haushalt und geht an beide Antragsteller). Sie alle bekommen die neuen
Seiten-IDs. Wo eine Bedingung sich auf einen Schritt bezog, der jetzt Teil
einer größeren Seite ist, wird sie zur Bedingung auf dem **Feld** — die
Beschäftigungsart entscheidet weiterhin, ob nach Arbeitgeber oder nach
Selbständigen-Angaben gefragt wird.

Das ist der Preis von „ein Katalog": Er hält die Fragen an einem Ort, aber ein
Schnitt daran ist nie nur eine Sache der Kundenansicht. Das ist der Grund, warum
diese Arbeit den vollen Weg nimmt und nicht als kleine Änderung durchgeht.

## Was bewusst NICHT gebaut wird

- **Keine Wanderung alter Antworten.** In der Produktion liegt genau ein Bogen
  (nicht abgesendet, ein Test). Er trägt danach Schlüssel, die es nicht mehr
  gibt, wird nicht angezeigt und nicht übernommen; der Aufräumlauf löscht ihn,
  sobald sein Link abläuft.
- **Kein dritter Umfang** und kein Schalter, mit dem der Vermittler den Umfang
  je Link wählt. Zwei Wege, zwei Umfänge — mehr braucht heute niemand, und
  ungenutzte Schalter verrotten.
- **Keine Änderung an den Fragen selbst.** Diese Arbeit schneidet und bündelt;
  sie formuliert nicht um. Was inhaltlich schlecht gefragt ist, bleibt vorerst
  schlecht gefragt und wird getrennt angefasst.
- **Kein Speichern je Feld.** Gespeichert wird weiterhin beim Absenden einer
  Seite. Bei sechs Seiten mit mehreren Feldern verliert ein Abbruch mehr als
  vorher — das ist der bewusst in Kauf genommene Preis der Bündelung.

## Fehlerfälle

- **Wechsel von zwei Antragstellern auf einen:** Die Antworten der zweiten
  Spalte bleiben im Bogen liegen, werden aber nicht mehr angezeigt und nicht
  übernommen. Das ist das Verhalten, das die Kette heute schon hat.
- **Ein Feld gehört zu einer Seite, deren Bedingung nicht greift:** unverändert
  — die Seite erscheint nicht, der Schlüssel bleibt leer.
- **Ein kurzer Bogen wird später voll fortgesetzt:** Der persönliche Link zeigt
  die ersten sechs Seiten bereits ausgefüllt (aus den Antworten, sonst aus dem
  Fall). Der Kunde beantwortet nichts zweimal.
- **Ein Schritt ohne `umfang`:** fällt beim Übersetzen auf, weil das Feld
  Pflicht ist.

## Tests

- **Vertragstest kurzer Bogen ↔ Machbarkeits-Ampel:** Jede Größe, die
  `SolverEingabe` rechnet, wird im kurzen Bogen auch gefragt. Ohne diesen Test
  ist Kürzen ein Spiel, bei dem irgendwann still die Ampel grau bleibt.
- **Katalog-Vertragstest:** Jede Seite trägt einen `umfang`; jedes Feld mit
  `ziel` zeigt auf ein existierendes Feld seiner Entität.
- Die kurze Kette hat sechs Seiten und enthält keine Seite mit `umfang: "voll"`.
- Die volle Kette beginnt mit denselben sechs Seiten.
- Ein Schritt mit `personenSpalten` erzeugt bei zwei Antragstellern die
  Schlüssel `p1.…` **und** `p2.…`, bei einem nur `p1.…`.
- Der Fortschritt zählt „von 6" im kurzen und „von 13" im vollen Weg (bei
  Bedingungen, die alle Seiten sichtbar machen).
- Die Übernahme liest einen kurz ausgefüllten Bogen vollständig — auch die
  Felder der zweiten Spalte.
- Die Pflichtangaben-Schlüssel zeigen auf die neuen Seiten (der vorhandene
  Test mit den wörtlichen Schlüsseln wird mitgezogen).
- Regression: Ein voll ausgefüllter Bogen am persönlichen Link verhält sich wie
  bisher — Vorbelegung, Speichern, Absenden, Übernahme-Eingang.
- Regression Erstgesprächs-Maske: Sie zeigt weiterhin jedes Feld mit Zielfeld,
  in Katalogreihenfolge, mit den Bedingungen der Beschäftigungsart — und bei
  zwei Antragstellern beide Personen. Die bestehenden Masken-Tests laufen
  unverändert.
