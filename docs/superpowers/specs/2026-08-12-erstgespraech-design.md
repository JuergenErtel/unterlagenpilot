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

### Angebotsrelevant (18)

**Je Antragsteller (× 2 bei Paaren):**
1. Vorname, Nachname
2. Geburtsdatum
3. Beschäftigungsart
4. Nettoeinkommen monatlich

**Einmal je Haushalt:**
5. Anschrift (Straße, PLZ, Ort)
6. Familienstand
7. Anzahl Kinder
8. Bestehende Verbindlichkeiten (Raten)
9. Eigenkapital

**Objekt:**
10. Objektart
11. Anschrift des Objekts (mindestens PLZ/Ort — steuert Grunderwerbsteuer)
12. Wohnfläche
13. Baujahr
14. Nutzung (Eigennutzung/Vermietung)

**Vorhaben:**
15. Finanzierungsart (Kauf/Neubau/Anschluss …)
16. Kaufpreis bzw. Bau-/Grundstückskosten
17. Maklerprovision
18. Darlehenswunsch

### Nützlich, aber nicht angebotskritisch

Geburtsort, Staatsangehörigkeit, Arbeitgeber, Beruf, beschäftigt seit,
Probezeit, Grundstücksfläche, Zimmer, Stellplätze, Hausgeld, Mieteinnahmen,
sonstige Einnahmen, Einmalzahlungen.

**Jürgens Prüfung:** Fehlt in der ersten Liste etwas, ohne das du in Europace
nicht rechnen kannst? Steht dort etwas, das du im Erstgespräch nie erfragst?

## Was der Katalog noch nicht kann

Der Abgleich gegen das Europace-Modell ergab: Der Katalog deckt die gesamte
Oberfläche ab, die BaufiDesk an Europace sendet. Eine Lücke gibt es:

**„Freiberufler" fehlt als Beschäftigungsart.** `EMPLOYMENT_TYPES` kennt nur
`selbststaendiger`. Europace unterscheidet „Einnahmen aus freiberuflicher
Tätigkeit" von „Einnahmen aus selbständiger Tätigkeit" — es sind zwei
verschiedene Kriterien im Banken-Wiki, und die Unterlagen unterscheiden sich.
Für ein Interview, das auf ein Europace-Angebot zielt, gehört die Kategorie
ergänzt (Enum, Labels, Checklisten-Vorlage, FinLink-Übersetzung von
`freelancer`, das heute auf `selbststaendiger` fällt).

## Was bewusst NICHT gebaut wird

- **Kein zweiter Fragenkatalog.** Zwei Sätze laufen auseinander.
- **Keine Pflichtfelder, die blockieren.** Ein Kunde, der etwas nicht weiß,
  darf das Gespräch nicht anhalten. Der Fortschritt zeigt die Lücke, er
  erzwingt sie nicht.
- **Kein automatischer Versand, keine automatische Übertragung.** Wie überall
  in BaufiDesk: erzeugen ja, absenden nur per Mensch.

## Offene Punkte

1. Pflichtmenge bestätigen oder korrigieren (siehe oben).
2. Soll die Kategorie „Freiberufler" im selben Zug kommen oder getrennt?
3. Reihenfolge der Abschnitte im Vermittlermodus — die Katalogreihenfolge ist
   für den Kunden gedacht (Vorhaben zuerst). Passt sie zum Telefonat?
