# Erstgespräch: geführtes Interview mit dem Kunden

Stand: 12.08.2026 · Status: Entwurf zur Durchsicht

## Das Problem

Jürgen führt das Erstgespräch am Telefon und erfragt dabei alle Daten, die er
zur Angebotserstellung in Europace braucht. Danach tippt er sie dort ein.
BaufiDesk begleitet diesen Gesprächsverlauf bisher nicht: Es gibt die
Selbstauskunft, aber die füllt der *Kunde* später allein aus — im Gespräch
selbst hilft sie nicht.

## Was gebaut wird

Ein Vermittlermodus über dem bestehenden Fragenkatalog, erreichbar unter
`/cases/[id]/erstgespraech`.

### Ein Katalog, zwei Modi

Die 32 Fragen aus `src/lib/self-disclosure/catalog.ts` bleiben die eine
Wahrheit. Neu ist nur eine zweite Ansicht darauf:

| | Vermittlermodus (neu) | Kundenmodus (heute) |
|---|---|---|
| Wer füllt | Vermittler im Gespräch | Kunde per Magic Link |
| Darstellung | eine Seite, frei anspringbar | Schritt für Schritt |
| Pflichtfelder | keine, aber Fortschritt sichtbar | keine |
| Speicherung | **direkt in die Falldaten** | Selbstauskunft + Freigabe |

Der Unterschied bei der Speicherung ist kein Detail: Der Vermittler ist die
Quelle, seine Eingabe braucht keine Freigabe. Nur Kundenantworten laufen
weiter über den Eingang mit Freigabe.

### Nicht fragen, was schon bekannt ist

Der wichtigste Hebel am Telefon. Abschnitte, deren Felder bereits gefüllt
sind, stehen eingeklappt mit Herkunftsvermerk („aus Lead", „aus Exposé",
„aus Dokument") — aufklappbar zum Korrigieren. Aufgeklappt ist nur, was
fehlt.

Beispiel Fall UP-2026-0007 zu Gesprächsbeginn bereits bekannt: beide Namen,
Geburtsdaten, Anschrift, Kontakt, Beschäftigungsart, Beruf, Arbeitgeber,
Einkommen (aus FinLink) sowie Objektart, Wohnfläche, Grundstück, Baujahr,
Zustand, Zimmer, Stellplätze, Heizung (aus dem Exposé).

### Fortschritt

Oben eine Leiste: „Noch 6 Angaben bis zum Angebot". Sie zählt nur die als
angebotsrelevant markierten Felder (siehe unten), nicht alle 32.

### Abschluss

Eine nach Europace-Abschnitten sortierte Kopiermaske (Bausteine
`copy-block`, `export-field-table` sind vorhanden), daneben der Knopf „An
Europace übertragen" — grau, bis der Zugang da ist. Die Übertragung selbst
ist gebaut (`src/lib/platforms/europace/uebertragung.ts`).

### Einbindung

Neue Stufe in der Prioritätsleiter (`next-step.ts`): **„Erstgespräch
führen"**, nach dem Erstkontakt und vor der Dokumentfreigabe. Ohne diese
Stufe findet das Feature niemand — die Lehre aus dem 12.08.

## Die Pflichtmenge — hier ist Jürgens Urteil gefragt

**Befund:** Aus der Europace-API lässt sich keine Pflichtmenge ableiten. Der
Kopfkommentar von `types.ts` hält fest: *„Europace verlangt formal nur den
Datenkontext, alles Weitere ist optional."* Technisch würde ein leerer
Vorgang akzeptiert.

Die Pflichtmenge muss deshalb aus der Sache kommen: **Was braucht eine Bank,
um einen Zins zu nennen?** Vorschlag, abgeleitet aus dem, was das
Europace-Modell überhaupt transportieren kann:

### Angebotsrelevant (26) — von Jürgen am 12.08.2026 ergänzt

**Je Antragsteller (× 2 bei Paaren):**
1. Vorname, Nachname
2. Geburtsdatum
3. **Staatsangehörigkeit** ¹
4. Beschäftigungsart
5. **Probezeit?** ¹
6. **Befristung?** ¹
7. Nettoeinkommen monatlich
8. **Weitere Einkünfte (Nebenjob, sonstige)** ¹

**Einmal je Haushalt:**
9. Anschrift (Straße, PLZ, Ort)
10. Familienstand
11. Anzahl Kinder
12. Bestehende Verbindlichkeiten (Raten)
13. Eigenkapital

**Objekt:**
14. Objektart
15. Anschrift des Objekts (mindestens PLZ/Ort — steuert Grunderwerbsteuer)
16. Wohnfläche
17. **Grundstücksgröße** ¹
18. Baujahr
19. Nutzung (Eigennutzung/Vermietung)

**Vorhaben und Konditionswunsch:**
20. Finanzierungsart (Kauf/Neubau/Anschluss …)
21. Kaufpreis bzw. Bau-/Grundstückskosten
22. Maklerprovision
23. Darlehenswunsch
24. **Zinsbindung** ²
25. **Sondertilgungsoption gewünscht?** ²
26. **Wunschrate monatlich** ²

¹ Fragt der Katalog bereits, war nur nicht als angebotsrelevant markiert.
² **Neues Feld** — existiert weder im Katalog noch im Datenmodell.

### Nebenkosten: rechnen statt fragen

Sobald Kaufpreis, Objekt-PLZ und Maklerprovision stehen, zeigt das Interview
die Nebenkosten sofort aufgeschlüsselt an — Grunderwerbsteuer (Satz nach
Bundesland), Notar/Grundbuch, Maklergebühr, Summe.

Die Rechnung existiert bereits und wird wiederverwendet:
`berechneNebenkosten` in `src/lib/machbarkeit/nebenkosten.ts`, Steuersätze in
`bundesland.ts`. Zwei Eigenschaften von dort gelten weiter: Ein am Fall
**erfasster** Nebenkostenbetrag gewinnt gegen die Rechnung (nie beides
addieren), und ein unsicherer Steuersatz (Bundesland unbekannt) wird als
solcher ausgewiesen statt stillschweigend geschätzt.

Das ist mehr als Bequemlichkeit: Nebenkosten sind nicht beleihbar. Wer sie
im Gespräch sieht, erkennt sofort, ob das Eigenkapital trägt.

### Nützlich, aber nicht angebotskritisch

Geburtsort, Arbeitgeber, Beruf, beschäftigt seit, Zimmer, Stellplätze,
Hausgeld, Mieteinnahmen, Einmalzahlungen.

## Schemaänderung

Drei neue Spalten an `FinancingRequest` — es sind Konditionswünsche des
Kunden, keine Objekt- oder Personendaten:

```prisma
/// Gewuenschte Zinsbindung in Jahren (5/10/15/20/30 sind die ueblichen).
zinsbindungJahre        Int?
/// Wunsch nach jaehrlicher Sondertilgungsoption. null = nicht gefragt.
sondertilgungGewuenscht Boolean?
/// Monatliche Wunschrate des Kunden. Grenze fuer den Machbarkeits-Solver.
wunschrateMonatlich     Float?
```

Anwendung gegen PROD über `scripts/supabase-sql.sh` mit gezieltem
`ALTER TABLE` — **nie** der volle `migrate diff` (siehe
[[supabase-management-api-zugriff]]).

**Nebenwirkung, die wir wollen:** Die Wunschrate ist eine natürliche
Nebenbedingung für den [[machbarkeits-solver]]. Bisher rechnet er gegen die
tragbare Rate aus der Haushaltsrechnung; mit einer genannten Wunschrate kann
er sagen, ob der Kunde *sein* Ziel erreicht, nicht nur ob die Bank mitgeht.

## Bindende Zusicherung: kein Feld blockiert

Jürgen am 12.08.2026: *„keines der Felder erzeugt einen K.O., wenn ich es
nicht ausfülle. Nach EP übertragen muss auch gehen, wenn nicht alle Felder
ausgefüllt sind."*

Das ist keine Bequemlichkeit, sondern die Wirklichkeit des Erstgesprächs: Ein
Kunde weiß seine Grundstücksgröße nicht auswendig, und das Gespräch darf
daran nicht hängenbleiben.

Konkret heißt das:
- **Die Fortschrittsleiste informiert, sie sperrt nicht.** „Noch 6 Angaben
  bis zum Angebot" ist eine Auskunft, kein Tor.
- **Kein Pflichtfeld, keine Validierung, die das Speichern verhindert.**
  Jedes Feld ist einzeln speicherbar, auch wenn alle anderen leer sind.
- **„An Europace übertragen" ist immer bedienbar** — auch bei 3 von 26
  Angaben. Das passt zur API: Sie verlangt formal nur den Datenkontext, und
  das Mapping lässt leere Felder bereits weg (`...(x ? { feld: x } : {})`).
- Die Übertragung **meldet**, was fehlt, statt sie zu verweigern: „Übertragen
  — 6 Angaben fehlten, in Europace nachtragen."

Einzige Ausnahme, die bleibt: die manuelle Freigabe vor jeder Übertragung
(siehe `pruefeEuropaceFreigabe`). Die ist eine bindende Zusage an den Kunden,
kein Vollständigkeitsgatter.

## Was der Katalog noch nicht kann

Der Abgleich gegen das Europace-Modell ergab: Der Katalog deckt die gesamte
Oberfläche ab, die BaufiDesk an Europace sendet. Eine Lücke gibt es:

**„Freiberufler" fehlt als Beschäftigungsart** — wird im selben Zug ergänzt
(Jürgens Entscheidung vom 12.08.2026).

Die Information geht heute an drei Stellen verloren:
- `EMPLOYMENT_TYPES` kennt nur `selbststaendiger`.
- Die FinLink-Übersetzung wirft `freelancer` auf `selbststaendiger`
  (`EMPLOYMENT_DE` in `finlink/dto.ts`).
- Das Europace-Mapping bildet auf `SELBSTSTAENDIGER` ab — **obwohl das
  Europace-Schema `FREIBERUFLER` als eigenen Typ führt.** Geprüft gegen
  `schema/kundenangaben-openapi.json`: Dort stehen ANGESTELLTER, ARBEITER,
  BEAMTER, FREIBERUFLER, RENTNER, SELBSTSTAENDIGER, STUDENT.

Auch das Banken-Wiki trennt beides: „Ansatz Einnahmen aus freiberuflicher
Tätigkeit" und „Ansatz Einnahmen aus selbständiger Tätigkeit" sind zwei
getrennte Kriterien der 69.

**Eigene Checklisten-Vorlage `freiberufler_kauf` — braucht Jürgens
Bestätigung:** Ein Freiberufler ermittelt seinen Gewinn per
Einnahmen-Überschuss-Rechnung, nicht per Bilanz. Vorschlag: Ausweis,
Einkommensteuerbescheid, Einkommensteuererklärung, EÜR, BWA, Eigenkapital,
Grundbuch, Exposé — **ohne** Jahresabschluss und Summen-/Saldenliste, die
die Selbstständigen-Vorlage führt.

## Was bewusst NICHT gebaut wird

- **Kein zweiter Fragenkatalog.** Zwei Sätze laufen auseinander.
- **Keine Pflichtfelder, die blockieren.** Ein Kunde, der etwas nicht weiß,
  darf das Gespräch nicht anhalten. Der Fortschritt zeigt die Lücke, er
  erzwingt sie nicht.
- **Kein automatischer Versand, keine automatische Übertragung.** Wie überall
  in BaufiDesk: erzeugen ja, absenden nur per Mensch.

## Entschieden am 12.08.2026

1. **Pflichtmenge:** um neun Angaben ergänzt, jetzt 26 plus gerechnete
   Nebenkosten.
2. **Zinsbindung:** freie Zahl, keine Auswahlliste.
3. **Freiberufler:** eigene Beschäftigungsart, im selben Zug.
4. **Reihenfolge der Abschnitte:** bleibt vorerst wie im Katalog.
5. **Kein Feld blockiert** — siehe eigener Abschnitt oben.

## Offen

- Bestätigung der Unterlagenliste für Freiberufler (EÜR statt Bilanz, siehe
  oben).
