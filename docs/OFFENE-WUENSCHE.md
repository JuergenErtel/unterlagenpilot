# Offene Wünsche und Fehler

Was Jürgen im Betrieb auffällt, festgehalten in dem Moment, in dem es auffällt —
damit es nicht in einem Gesprächsverlauf verschwindet. Keine Reihenfolge, keine
Zusage: eine Liste, aus der die nächste Arbeit gewählt wird.

Was hier steht, ist noch nicht durchdacht. Jeder Punkt bekommt vor der Umsetzung
seinen eigenen Entwurf.

---

## Fehler: Die Prioritätsleiter mahnt Dinge an, die längst erledigt sind

**Aufgenommen:** 15.08.2026

Steht ein Fall auf „Kredit zugesagt", darf die Leiter nicht weiter behaupten, ein
Erstgespräch sei offen oder es fehlten Unterlagen.

**Warum das passiert:** Nicht jeder Schritt läuft durch BaufiDesk. Kunden
schicken Unterlagen oft per Mail, und Jürgen pflegt sie direkt in Europace ein.
Häufig wird nur das Erstgespräch hier geführt — nach dem Absprung nach Europace
wird in BaufiDesk nichts mehr aktualisiert.

**Was daran zu bedenken ist:** Es genügt nicht, den einen Status abzufragen. Die
Leiter rechnet aus mehreren Quellen (Checkliste, Erstgespräch, Dokumentenstand),
und jede davon weiß nichts von Europace. Die eigentliche Frage lautet: **Ab
welchem Punkt hört BaufiDesk auf, den Fall zu führen** — und wie sagt es das,
ohne den Fall zu verstecken, den Jürgen später doch wieder anfassen will. Siehe
`LOCKED_CASE_STATUSES` in `src/lib/domain/enums.ts`; dort steht bereits eine
Antwort auf eine verwandte Frage.

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
