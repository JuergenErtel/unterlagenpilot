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

## Fehler: Die Machbarkeits-Ampel bleibt bei der Hälfte der Vorhabensarten grau

**Aufgenommen:** 16.08.2026 · **Fachliche Auflösung von Jürgen liegt vor**

Die Machbarkeitsrechnung (`baueEingabe`, `src/lib/machbarkeit/eingabe.ts`)
verlangt **zwingend** einen Kaufpreis oder Baukosten; fehlt beides, liefert sie
„grau" statt einer Aussage. Im kurzen Anfragebogen setzt aber bei drei der sechs
Vorhabensarten kein Feld eines dieser Ziele. Betroffen sind
**Anschlussfinanzierung, Kapitalbeschaffung und Modernisierung** — die Ampel
kann dort nie grün oder rot werden, obwohl genau das der Zweck des kurzen
Bogens ist.

**Was an die Stelle des Kaufpreises gehört (Jürgen, 16.08.2026):**

| Vorhabensart | Grundbetrag der Rechnung |
|---|---|
| Modernisierung | Modernisierungskosten |
| Kapitalbeschaffung | benötigte Darlehenssumme |
| Anschlussfinanzierung | abzulösende Darlehenssumme |

Alle drei Beträge **fragt der kurze Bogen bereits ab** — die Arbeit steckt also
nicht im Fragenkatalog, sondern in der Rechnung: Sie muss den passenden Betrag
als Grundlage nehmen, statt auf einen Kaufpreis zu bestehen.

**Was vor der Umsetzung zu klären ist:** Der Solver rechnet den Auslauf als
Verhältnis von Darlehen zu Objektwert. Bei einem Kauf ist der Objektwert der
Kaufpreis; bei einer Anschlussfinanzierung ist er etwas anderes als die
abzulösende Summe, und bei einer reinen Modernisierung ist er gar nicht
erfragt. Es ist also zu entscheiden, ob der Auslauf für diese Arten anders
gerechnet, weggelassen oder ein Objektwert zusätzlich erfragt wird — sonst
tauscht man eine graue Ampel gegen eine falsche.

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
