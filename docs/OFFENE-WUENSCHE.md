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

## ~~Fehler: Steuererklärung als Steuerbescheid eingestuft~~

**Aufgenommen:** 18.08.2026 · **Erledigt: 18.08.2026**

`Einkommensteuererklärung 2024.pdf` war als **Einkommensteuerbescheid**
eingestuft — Konfidenz 1,00, bei 56 Seiten und 144.799 Zeichen Text. Die
Checkliste meldete damit ausgerechnet das Papier als vorhanden, das die Bank
verlangt.

**Die Wurzel:** Der Dateiname erreichte die KI gar nicht —
`AIService.classifyDocument` bekam nur den OCR-Text, und der wird auf 4.000
Zeichen gekürzt. Die ersten Seiten dieses Dokuments sind eine Steuerberechnung
(„Berechnung der Einkommensteuer", „Besteuerungsgrundlagen"), die wortgleich
wie ein Bescheid liest. Aus dieser Sicht war die Einstufung nachvollziehbar;
entschieden hätte allein der Dateiname.

**Gegen das echte Modell gemessen** (Probe auf genau diesem Dokument):

```
ohne Dateiname -> einkommensteuerbescheid    (Konfidenz 0,99)  falsch
mit  Dateiname -> einkommensteuererklaerung  (Konfidenz 0,99)  richtig
```

**Was jetzt gilt:** Der Dateiname geht als ausdrücklich gekennzeichneter
*Hinweis* mit — der Inhalt bleibt ausschlaggebend, und die Anweisung sagt das
auch so. Sonst überstimmte ein geratener Kundenname („Grundbuch.pdf" für
irgendeinen Scan) den Inhalt.

**Der Widerspruchs-Abgleich Dateiname ↔ Typ bleibt offen** und ist bewusst
nicht gebaut: Gemessen an den 11 echten Dokumenten hätte er 3 markiert — zwei
echte Fehler und einen Fehlalarm („Jahresabschluss 2024.pdf" ist tatsächlich
eine EÜR). Ein Drittel der Dokumente mit einer Rückfrage zu belegen ist
Reibung, die Jürgen wollen muss. Die dafür nötige Schlüsselwortliste liegt seit
jeher ungenutzt in `document-types.ts`.

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
