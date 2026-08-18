# Offene Wünsche und Fehler

Was Jürgen im Betrieb auffällt, festgehalten in dem Moment, in dem es auffällt —
damit es nicht in einem Gesprächsverlauf verschwindet. Keine Reihenfolge, keine
Zusage: eine Liste, aus der die nächste Arbeit gewählt wird.

Was hier steht, ist noch nicht durchdacht. Jeder Punkt bekommt vor der Umsetzung
seinen eigenen Entwurf.

---

## ~~Fehler: Falsch eingestufte Dokumente (aus dem Topcic-Fund)~~

**Aufgenommen:** 16.08.2026 · **Erledigt: 18.08.2026**

`Ausweis_Mate.pdf` war als **Grundbuchauszug** eingestuft – die Checkliste
meldete „Grundbuchauszug vorhanden", obwohl im Fall keiner lag.

**Die Wurzel** war weder das Modell noch die Freigabe, sondern die Grundlage:
Die OCR hatte für diese Datei **nichts als Bildplatzhalter** geliefert – nach
Abzug der Platzhalter blieben **4 Zeichen**. Das Klassifikationsschema verlangt
aber einen Typ, also hat das Modell einen erfunden und sich seiner sicher
gezeigt.

**Warum der ursprünglich vermutete Weg nicht getragen hätte:** Die Konfidenz
sichtbar zu machen hätte nichts gefangen. Alle 11 Dokumente der
Produktionsdatenbank lagen bei **0,98 bis 1,00** – ausgerechnet das falsche bei
0,98. Die Zahl trägt keine Information. Ebenso wenig hätte es geholfen, das
Grün an die Freigabe zu binden: Das Dokument **war** freigegeben.

**Was jetzt gilt:** Ohne Textgrundlage wird gar nicht mehr eingestuft
(`src/lib/documents/textsubstanz.ts`, Schwelle 40 Zeichen). Das Dokument gilt
als nicht lesbar, erfüllt damit keine Checklistenposition, lässt sich nicht
freigeben und trägt in Fallakte und Review-Center einen Hinweis. Der Weg
heraus ist die Typ-Auswahl von Hand – wer sie benutzt, hat die Datei angesehen
und macht das Dokument damit wieder zählbar.

**Die Schwelle ist geeicht, nicht geraten:** falsche Datei 4 Zeichen, echter
Personalausweis (das textärmste echte Dokument) 222, alle übrigen 4.600 bis
144.799.

**Drei Stellen mussten zusammen halten** – jede einzeln wäre eine Lücke
geblieben: die Upload-Kette, der Lauf „KI-Prüfung starten" (der setzte
`readable: true` fest und hätte den Fix bei jedem Lauf aufgehoben) und die
Freigabe-Aktion selbst.

## Fehler: Steuererklärung als Steuerbescheid eingestuft

**Aufgenommen:** 18.08.2026 (beim Aufräumen des Topcic-Fundes gefunden)

`Einkommensteuererklärung 2024.pdf` ist als **Einkommensteuerbescheid**
eingestuft – mit Konfidenz 1,00, bei 56 Seiten und 144.799 Zeichen Text. Der
Typ `einkommensteuererklaerung` existiert, das Modell hatte also die richtige
Wahl. Dieselbe Gefahr wie beim Topcic-Fund, aber eine andere Wurzel: Hier lag
reichlich Text vor, das Modell hat sich schlicht geirrt – und ausgerechnet in
die Richtung, die die Bank verlangt. Die Checkliste meldet den Bescheid als
vorhanden, eingereicht würde die Erklärung.

**Was daran zu bedenken ist:** Die Textgrundlagen-Regel greift hier nicht. Zwei
Wege bieten sich an, beide noch nicht entschieden:

- **Der Dateiname geht heute gar nicht an die KI** (`AIService.classifyDocument`
  bekommt nur den OCR-Text). „Einkommensteuererklärung 2024.pdf" hätte den
  Irrtum vermutlich verhindert. Billig, aber ein Dateiname kann auch in die
  Irre führen.
- **Ein Widerspruchs-Abgleich Dateiname ↔ Typ** aus der bereits vorhandenen,
  heute ungenutzten Schlüsselwortliste in `document-types.ts`. Gemessen an den
  11 echten Dokumenten hätte er 3 markiert: zwei echte Fehler und einen
  Fehlalarm („Jahresabschluss 2024.pdf" ist tatsächlich eine EÜR). Ein Drittel
  der Dokumente mit einer Rückfrage zu belegen ist Reibung, die Jürgen wollen
  muss.

## ~~Wunsch: Finanzierungszertifikat~~

**Aufgenommen:** 15.08.2026 · **Erledigt: 16.08.2026** (Commit `f3a1c36`)

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
