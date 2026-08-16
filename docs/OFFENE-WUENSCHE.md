# Offene Wünsche und Fehler

Was Jürgen im Betrieb auffällt, festgehalten in dem Moment, in dem es auffällt —
damit es nicht in einem Gesprächsverlauf verschwindet. Keine Reihenfolge, keine
Zusage: eine Liste, aus der die nächste Arbeit gewählt wird.

Was hier steht, ist noch nicht durchdacht. Jeder Punkt bekommt vor der Umsetzung
seinen eigenen Entwurf.

---

## Fehler: Falsch eingestufte Dokumente (aus dem Topcic-Fund)

**Aufgenommen:** 16.08.2026

Beim Aufräumen des Topcic-Falls gefunden und bewusst nicht mitbehoben:
`Ausweis_Mate.pdf` ist als **Grundbuchauszug** eingestuft. Folge ist nicht nur
ein fehlender Ausweis, sondern auch ein **falsches Grün**: Die Position
„Grundbuchauszug" steht auf „vorhanden", obwohl im Fall keiner liegt.

**Was daran zu bedenken ist:** Das ist die KI-Einstufung, nicht die
Checklistenlogik. Zu klären wäre, ob eine niedrige Zuversicht
(`Document.confidence`) sichtbar gemacht werden sollte — eine
Falscheinstufung, die als erfüllt zählt, ist gefährlicher als eine, die
gar nichts erfüllt. Die Freigabe im Review-Center bestätigt heute den
Dokumenttyp mit, ohne ihn zu betonen.

## Wunsch: Finanzierungszertifikat

**Aufgenommen:** 15.08.2026

Ein Finanzierungszertifikat nach dem Vorbild in FinLink — das Papier, das ein
Kaufinteressent dem Makler vorlegt, um zu zeigen, dass die Finanzierung steht.

**Was daran zu bedenken ist:** Das Haus erzeugt PDFs bereits serverseitig
(`src/lib/pdf/`, `GET /api/cases/[id]/pdf?type=…`) mit Briefkopf aus den
Organisationsdaten — der Weg dahin existiert also. Die Arbeit steckt nicht im
Erzeugen, sondern in der Frage, **was das Zertifikat behauptet und wer dafür
geradesteht**: eine Zusage über eine Summe, die noch keine Bank gegeben hat, ist
ein Versprechen mit Haftung. Vor dem Bauen ist zu klären, welche Formulierung
Jürgen verantworten kann und welche Angaben aus dem Fall belegt sein müssen,
bevor sich das Papier überhaupt erzeugen lässt.

## ~~Fehler: Die Machbarkeits-Ampel bleibt bei der Hälfte der Vorhabensarten grau~~

**Aufgenommen:** 16.08.2026 · **Erledigt: 16.08.2026**

Die Machbarkeitsrechnung verlangte zwingend einen Kaufpreis; bei
Anschlussfinanzierung, Kapitalbeschaffung und Modernisierung blieb die Ampel
deshalb immer grau.

**Die Wurzel** war nicht der fehlende Betrag — der stand im Bogen —, sondern
dass der Kaufpreis **zwei Rollen zugleich** trug: das, was finanziert wird, und
den Maßstab, an dem die Bank den Auslauf misst. Beim Kauf ist beides dieselbe
Zahl, bei diesen drei Arten nicht. Die Rechnung trennt sie seitdem:

```
darlehen       = Kaufpreis + Modernisierung + weiterer Bedarf + Nebenkosten
                 + abzulösende Kredite − Eigenkapital − Eigenleistung
beleihungswert = Objektwert − Inventar + Zusatzsicherheit
auslauf        = (darlehen + vorrangige Restschuld) / beleihungswert
```

Beim Kauf ist `Objektwert = Kaufpreis` und alles Neue null — dort rechnet
seitdem exakt dasselbe heraus wie vorher (Regressionsfall in
`tests/machbarkeit-vorhabensarten.test.ts`).

**Zwei neue Fragen** im kurzen Bogen, beide nur bei den betroffenen Arten
sichtbar — Käufer sehen keine einzige Frage mehr: der geschätzte **Wert der
Immobilie** (`property.objektwert`) und, nur bei Kapitalbeschaffung und
Modernisierung, die **Restschuld eines laufenden Darlehens darauf**
(`property.bestehendeGrundschuld`). Die zweite entfällt bei der
Anschlussfinanzierung, weil die Restschuld dort abgelöst wird und schon unter
ihrem eigenen Namen im Bogen steht.

**Drei Fallen, die dabei sichtbar wurden:**

- Den Grundbetrag einfach in `kaufpreis` zu schreiben hätte 6,5 %
  Grunderwerbsteuer und 2 % Notarkosten auf eine Modernisierung gerechnet.
- Eine bestehende Grundschuld gehört in den **Zähler des Auslaufs, nie ins
  Darlehen**: 100.000 € Kapitalbeschaffung auf ein Objekt von 300.000 € sind
  33 % Auslauf — mit 200.000 € Altlast darauf aber 100 %. Mitfinanziert würde
  ihre Rate doppelt zählen.
- Der Rat „braucht X € mehr Eigenkapital" ist bei einer **Kapitalbeschaffung**
  die eine Antwort, die niemand brauchen kann. Deshalb trägt die Eingabe ein
  Merkmal `darlehensbedarfVerhandelbar`: Wo die Summe ein Wunsch ist, nennt die
  Ampel zuerst „Darlehen bis X €"; wo sie eine Tatsache ist
  (Anschlussfinanzierung), bleibt die Eigenmittel-Lücke die richtige Auskunft.

## Nachträge aus dem Katalogschnitt (16.08.2026)

Beim Kürzen der Selbstauskunft gefunden, bewusst nicht mitgemacht:

- **Ein Feld kann seine Steuerantwort auf derselben Seite haben.** Der Server
  rechnet die Feldliste vor dem Absenden und springt danach weiter — wird eine
  bereits gespeicherte Steuerantwort auf derselben Seite geändert, sieht der
  Kunde das neu freigeschaltete Feld nie. Genau daran wäre die Maklergebühr nie
  gefragt worden; ein Vertragstest verbietet das inzwischen für Felder, die ohne
  Antwort verborgen sind. Offen bleibt der mildere Fall (`vorhaben.stand`,
  `vorhaben.nutzung`): Ihre Bedingung ist ohne Antwort offen, sie können also
  nur aus- statt eingeblendet werden. Saubere Behebung wäre, nach dem Speichern
  die Feldliste der eigenen Seite neu zu rechnen und bei neu erschienenen
  Feldern stehenzubleiben.
- **`nurArbeitgeber` und `nurVertragsdauer` (`catalog.ts`) haben denselben
  Rumpf** und sind nur durch ihre Identität als Funktion getrennt. Wer sie als
  „offensichtliche Vereinfachung" zusammenzieht, gibt dem Minijob wieder die
  Arbeitgeberfragen — kein Compilerfehler, kein roter Test. Nur die Kommentare
  schützen davor.
- **Drei Stellen teilen die Beschäftigungsarten verschieden ein** (`ANGESTELLT`
  in `catalog.ts`, `ANGESTELLT` in `maske.ts`, `BESCHAEFTIGUNG_MIT_ARBEITSVERTRAG`
  in `reife.ts`). Genau diese Divergenz hat dazu geführt, dass beim Minijob das
  Eintrittsdatum aus der Telefonmaske fiel.
- **Die Regel „wer liest, nimmt die volle Kette" gilt auf Feldebene, nicht auf
  Personenebene.** Ändert eine Person nachträglich ihre Berufsart, fällt ihre
  Spalte aus der sichtbaren Kette, und bereits gegebene Antworten verschwinden
  aus der Übernahme.
- **Die Abschnitte der Telefonmaske haben sich verschoben:** Das Nettoeinkommen
  steht seit dem Schnitt unter „Zur Person" statt unter „Beruf und Einkommen",
  weil der Abschnitt an der Seite hängt und nicht am Feld.
