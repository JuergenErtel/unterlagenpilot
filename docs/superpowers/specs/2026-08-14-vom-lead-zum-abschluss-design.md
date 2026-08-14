# Vom Lead zum Abschluss: Kontaktversuche und Eskalation

Stand: 14.08.2026 · Status: Entwurf zur Durchsicht

## Das Problem

Zwischen „Lead ist eingegangen" und „Erstgespräch geführt" liegt der Teil, den
BaufiDesk heute nicht begleitet: das Hinterhertelefonieren. Der Vermittler ruft
an, erreicht niemanden, schreibt eine WhatsApp, ruft am nächsten Tag wieder an —
und irgendwann muss er entscheiden, ob der Lead tot ist.

Nichts davon steht heute im System. Die Prioritätsleiter (`next-step.ts`) springt
direkt vom Leadeingang zum Erstgespräch, als wäre der Kunde immer am Apparat.
Wer wann wie oft versucht hat zu erreichen, weiß nur Jürgens Gedächtnis. Und die
Wiedervorlage ist zwar ein Feld am Fall, aber keine Sprosse der Leiter: Sie
mahnt nie „heute nachhaken".

## Was gebaut wird

Eine Zeitachse über der vorhandenen Leiter — **kein zweiter
Führungsmechanismus daneben**. Drei neue Leiter-Schlüssel, zwei additive
Schemaänderungen, kein neuer Bildschirm, kein neuer Cron.

## Datenmodell

Die Kontakthistorie existiert bereits: `CaseNote` mit
`kind: notiz | telefon | email | wiedervorlage`, sichtbar auf der
Verwaltungsseite. Eine eigene Tabelle für Kontaktversuche würde einen zweiten
Ort schaffen, der dasselbe erzählt. Stattdessen wird das Vorhandene erweitert:

1. `CaseNoteKind` bekommt den Wert `whatsapp`.
2. `CaseNote` bekommt `ergebnis: KontaktErgebnis?` mit den Werten
   `erreicht | nicht_erreicht`. Ein freier Vermerk lässt das Feld leer; ein
   Kontaktversuch ist ein Vermerk, der ein Ergebnis trägt.

Beide Änderungen sind additiv (neuer Enum-Wert, neue nullable Spalte) und damit
gegen die Produktivdatenbank gefahrlos — Bestandsvermerke bleiben gültig und
lesen sich unverändert.

Ein Klick auf *nicht erreicht* legt an: `kind: telefon`,
`ergebnis: nicht_erreicht`, `body: "Nicht erreicht (2. Versuch)"`. Der Vermerk
erscheint damit ohne Zusatzarbeit in der bestehenden Vermerk-Liste, mit Datum
und Verfasser.

### Alles Weitere wird abgeleitet

Kein Zustand wird doppelt gespeichert:

| Frage | Ableitung |
|---|---|
| Wurde je erreicht? | existiert ein Vermerk mit `ergebnis = erreicht` |
| Wie viele Versuche? | Anzahl Vermerke mit `ergebnis = nicht_erreicht` |
| Nächster Kontakt fällig ab | letzter Versuch + `KONTAKT_ABSTAND_STUNDEN` |
| Abbruch fällig? | Leadeingang + `KONTAKT_FRIST_TAGE` vorbei **und** nie erreicht |

Daraus folgt zweierlei. Erstens braucht es **keinen Scheduler**: Fälligkeit ist
eine Rechnung zum Anzeigezeitpunkt, kein gespeicherter Zustand, der auseinander
laufen kann. Zweitens ist die Historie die Wahrheit — wird ein Vermerk gelöscht,
ändert sich die Eskalation entsprechend mit. Das ist beabsichtigt.

Die beiden Zahlen kommen als Umgebungsvariablen mit Vorgabewerten —
`KONTAKT_ABSTAND_STUNDEN` (12) und `KONTAKT_FRIST_TAGE` (3) —, wie schon
`REMINDER_AFTER_DAYS`. Keine verdrahteten Konstanten, aber auch keine eigene
Einstellungsseite für zwei Zahlen.

Bewusst **ohne Geschäftszeiten-Logik**: Ein Abstand von 12 Stunden kann eine
Fälligkeit auf 6 Uhr morgens legen. Das stört nicht, weil die Sprosse nur
anzeigt und nichts verschickt — Sperrzeiten wären Mechanik ohne Wirkung.

## Die drei neuen Schlüssel

`kontakt_aufnehmen` sitzt unmittelbar über `erstgespraech` und unter denselben
Wächtern: nicht bei abgegebenen Fällen (`LOCKED_CASE_STATUSES`), und
Dokumentfreigabe sowie kritische Hinweise behalten Vorrang. Sie erscheint,
solange kein `erreicht` vorliegt, und trägt den Stand im Text:
„Anrufen — 2. Versuch, seit 2 Tagen kein Kontakt". Sobald ein `erreicht`
existiert, verschwindet sie und das Erstgespräch übernimmt.

`kontakt_aufgeben` löst sie ab, sobald die Frist abgelaufen ist:
„Seit 3 Tagen nicht erreichbar — aufgeben?". Bewusst ein **eigener Schlüssel**
statt nur eines anderen Textes: Die Karte rendert nach dem Schlüssel, und die
beiden Zustände tragen verschiedene Knöpfe (drei Kontaktknöpfe gegen den
Abbruchknopf).

`wiedervorlage_faellig` erscheint, wenn `Case.wiedervorlage` erreicht ist. Das
Feld existiert, war aber bisher nur ein Abzeichen auf dem Board.

## Oberfläche

Auf der Fallkarte drei Knöpfe: **erreicht** · **nicht erreicht** ·
**WhatsApp geschrieben**. Dazu die Telefonnummer als `tel:`-Link und ein
`wa.me`-Link, der WhatsApp mit der Nummer öffnet. Geschrieben wird dort vom
Vermittler — BaufiDesk verschickt kein WhatsApp.

Die Nummer kommt von Antragsteller 1 (`Applicant.phone`), ersatzweise vom
Kunden (`Customer.phone`). Für `wa.me` wird sie auf Ziffern reduziert und eine
führende 0 durch 49 ersetzt; lässt sie sich so nicht deuten, entfällt der
WhatsApp-Link und der `tel:`-Link trägt die Nummer unverändert.

Bei *erreicht* fragt die Karte direkt nach einer Wiedervorlage. Das deckt
„Termin vereinbart" ab, ohne einen dritten Ausgang zu erfinden.

Der Abbruch führt in den **bestehenden** Verlust-Dialog (`LossDialog`) mit
vorbelegtem Grund `nicht_erreichbar` — der Wert existiert bereits in
`LOSS_REASONS`. Eine Abschiedsmail wird vorbereitet und vorgelegt; sie geht auf
Klick, nicht von allein.

Das Dashboard sortiert fällige Kontaktschritte nach oben in die bestehende
Arbeitsliste. Kein zweiter Ort, kein Menüpunkt.

## Was bewusst NICHT gebaut wird

- **Kein automatischer Versand.** Jürgens Ansage vom 14.08.2026: Heute darf
  nichts ohne Klick rausgehen — die Leads bekommen ihre Willkommensmail bereits
  von FinLink, eine zweite wäre sinnlos. Die bindende Zusage aus
  `erstkontakt.ts` bleibt damit unangetastet.
- **Keine Willkommensmail.** Sie existiert heute nicht und kommt jetzt nicht
  dazu. Der heutige Schritt „Erstkontakt" ist die Unterlagen-Nachforderung mit
  Checkliste, nicht eine Begrüßung — er kollidiert nicht mit FinLink.
- **Kein Schalter für späteren Automatikversand.** Wenn BaufiDesk FinLink
  ablöst, muss es die Option „automatische Willkommensmail" geben; die Naht
  dafür ist genau die Sprosse `kontakt_aufnehmen`, der erste Schritt nach dem
  Leadeingang. Gebaut wird der Schalter erst, wenn er gebraucht wird —
  ungenutzte Schalter verrotten.
- **Keine WhatsApp-Anbindung.** Ein eigener Anbieter mit Geschäftskonto,
  genehmigten Vorlagen, Kosten je Nachricht und Auftragsverarbeitung wäre ein
  eigenes Projekt.
- **Kein neuer Cron und kein neuer Menüpunkt.**

## Fehlerfälle

- **Keine Telefonnummer am Fall:** Die Sprosse erscheint trotzdem, aber ohne
  Wähl- und WhatsApp-Link und mit dem Hinweis, dass die Nummer fehlt. Sie darf
  nicht stumm verschwinden — ein Lead ohne Nummer ist ein Problem, keine
  Erledigung.
- **Frist abgelaufen, aber inzwischen erreicht:** `erreicht` gewinnt immer. Der
  Abbruchvorschlag erscheint nur, wenn nie erreicht wurde.
- **Zwei Klicks kurz hintereinander** (Doppelklick auf „nicht erreicht") legen
  zwei Vermerke an. Das ist hinnehmbar und korrigierbar — der Vermerk lässt
  sich löschen. Eine Sperre wäre mehr Mechanik als Nutzen.
- **Fall bereits verloren:** Kontaktsprossen erscheinen nicht mehr.

## Tests

Der Schwerpunkt liegt auf der reinen Ableitung, nicht auf der Oberfläche:

- **Ableitung** (Tabelle oben) je Fall: nie versucht · einmal nicht erreicht ·
  dreimal nicht erreicht · erreicht nach zwei Fehlversuchen · Frist abgelaufen
  ohne Kontakt · Frist abgelaufen, aber erreicht.
- **Leiterordnung:** Die Kontaktsprosse verdrängt das Erstgespräch, wird aber
  ihrerseits von Dokumentfreigabe und kritischen Hinweisen verdrängt; bei
  abgegebenen Fällen erscheint sie nicht.
- **Wiedervorlage:** fällig / nicht fällig / kein Datum gesetzt.
- **Schreibaktion:** Ein Klick erzeugt genau einen Vermerk mit korrekter Art,
  korrektem Ergebnis und hochgezählter Versuchsnummer im Text.
- **Mandantentrennung:** Die Schreibaktion prüft den Fallzugriff wie jede
  andere.

Grenzfälle für die Fälligkeitsrechnung werden mit fest übergebenem `jetzt`
geprüft, nie mit der echten Uhr.
