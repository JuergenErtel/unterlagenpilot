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
