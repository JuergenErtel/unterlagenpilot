# BaufiDesk – UI-/UX-Veredelung (02.09.2026)

Grundlage: Stand nach Commit `7122d75` (Backoffice, Security-Hardening, Pilot-Readiness). Die
Zugriffsschutzmechanismen in `src/lib/auth/akte-zugriff.ts`, die 404-Strategie, die
Auftragsstatus-Sperren und die Vertragstests wurden nicht angefasst. Alle UI-Änderungen blenden
nur aus, entscheiden nichts.

## 1. Ausgangszustand

- Gestaltung „Die Akte“ (Tinte + Türkis, Geist + Archivo, Papier-Canvas, Haarlinien) war tragfähig
  und ist erhalten.
- Alle Informationen lagen in identischen weißen Karten. Es gab keine Flächenhierarchie, keinen
  Info-Token, keinen Token für deaktivierten Text, keine erhöhte Fläche, keine
  `prefers-reduced-motion`-Regel, keinen globalen Fokusstil.
- Backoffice: elf gleichwertige Kennzahlkacheln, acht flache Menüeinträge ohne Priorität,
  „Bearbeitungsqueue“ als Bezeichnung, leerer Zustand als Einzeiler, Eyebrow „BaufiDesk Backoffice“
  neben Kopfzeile und Bereichsumschalter (dreifach).
- Vertrieb: Board mit Schleier und dünner Scrollbar, aber ohne Pfeile, Tastaturbedienung oder
  Positionshinweis; fünf gleichwertige Kopfaktionen; Ampeltext auf jeder Karte.
- Portal: eigener Kachelstil, Mitwirkung nicht als Kernfrage erkennbar, Eyebrow „Auftraggeberportal“
  redundant.
- Tests: nur reine Logik, keine Komponenten-, Navigations- oder Accessibility-Tests.

## 2. Wichtigste UX-Probleme

1. Redundante Textebenen (Produktname dreifach).
2. Kennzahlen ohne Handlungsordnung, Nullen so laut wie Zahlen.
3. Kein Arbeitsfokus: der Bearbeiter musste Themenlisten öffnen, um den nächsten Auftrag zu finden.
4. Navigation nach Technik, nicht nach Arbeitstag; keine Zähler.
5. Pipeline wirkte am rechten Rand abgeschnitten, ohne Griff.
6. Aktionsleiste im Vertrieb ohne Hierarchie.
7. Leere Zustände ohne Erklärung und Weg.
8. Tabellen ohne Mobilfassung.

## 3. Designprinzipien

- Drei Fragen in Sekunden: Wo bin ich (Bereichsumschalter + Kontext-Eyebrow + Titel), was ist
  wichtig (Arbeitsfokus, „Jetzt handeln“), was tue ich als Nächstes (die eine Hauptaktion).
- Eine Hauptaktion je Seite in Tinte; alles andere Kante, Text oder Grau.
- Farbe nie ohne Text; Nullen treten zurück, auch in kritisch getönten Karten.
- Flächen sagen Gewicht: Hero liegt oben, Karte ist das Blatt, Ablage liegt darunter.
- Portal spricht Kundensprache (keine Queue, kein Audit, keine Statuscodes).

## 4. Geänderte Navigation

Backoffice, vier Gruppen: **Übersicht** (Dashboard, Alle Aufträge), **Mein Arbeitstag** (Jetzt
bearbeiten, Qualitätskontrolle, Fertig zur Übergabe), **Klärungsbedarf** (Fehlende Unterlagen,
Dokumente zu prüfen, Rückfragen), **Verwaltung** (eingeklappt). Sechs Einträge tragen Zähler
(`src/lib/backoffice/zaehler.ts`, sechs Zählabfragen ohne Checklisten-Engine); Null wird nicht
gezeigt, Wartezustände in Ocker, Handlungsbedarf in Tinte. Der Bereichsumschalter ist jetzt ein
gestapelter Produktwechsel mit Symbol, „aktiv“-Marke, Fokusring und Tastaturbedienung; er erscheint
nur bei mehr als einem Bereich (`zeigeUmschalter`). Startseiten der Bereiche leuchten nur bei
exaktem Pfad.

Sichtbare Begriffe geändert: „Bearbeitungsqueue“ → „Jetzt bearbeiten“, „Auftragsdashboard“ →
„Dashboard“, „Aufträge“ → „Alle Aufträge“, „Dokumentenprüfung“ → „Dokumente zu prüfen“,
„Backoffice-Konfiguration“ → „Konfiguration“, „Abrechnung & Kontingente“ bleibt, Portal
„Kontingent & Tarif“ → „Kontingent“, „Organisation & Mitarbeiter“ → „Organisation & Team“,
„Zur Queue“ → „Jetzt bearbeiten“. Routen unverändert (`/backoffice/queue` bleibt), gespeicherte Links
laufen weiter. Angepasst: `tests/ui-bereiche-navigation.test.ts` (neu), `navigation-plattform.test.ts`
unverändert grün.

## 5. Backoffice-Dashboard

Arbeitsfokus oben (`Arbeitsfokus`, `fokusAuftrag`): ein Auftrag, eine Handlung, Bearbeiter, Priorität,
Frist, Blocker, letzte Aktivität, ein Knopf. Darunter drei Kennzahlgruppen: **Jetzt handeln**
(Tintenkante: Frist überschritten rot, heute fällig und gefährdet ocker, QC offen info), **Wartet auf
Mitwirkung** (Ockerkante), **Arbeitsvolumen** (neutral, kleine Zahlen). Verteilung nach Status und
Bearbeiter ist eingeklappt. Listen: Frist heute, Rückmeldung eingegangen, QC erforderlich,
Übergabebereit, Zuletzt bearbeitet.

## 6. Leerer Zustand

`BackofficeOnboarding`: „Dein Backoffice ist startklar.“ mit Erklärung, drei Schritten (Auftraggeber
anlegen, Auftrag erstellen, Unterlagen prüfen und übergeben), primär „Ersten Auftrag anlegen“ (oder
„Ersten Auftraggeber anlegen“, wenn keiner existiert; erledigte Schritte mit Haken), sekundär
„Auftraggeber verwalten“. Nur Manager sehen die Knöpfe; Bearbeiter bekommen den Hinweis. Erscheint
nur ohne Aufträge. Kein Beispielablauf mit Demo-Daten (bewusst, keine produktiven Demo-Aufträge).
Portal ohne Aufträge: `LeerZustand` mit Weg zum ersten Auftrag.

## 7. Vertrieb

- Board: Pfeilknöpfe (spaltenweise), Statuszeile („Weitere Phasen rechts“ / „Ende der Pipeline“ /
  „Alle Phasen sichtbar“), Schleier links und rechts nur, wenn dort etwas liegt, fokussierbare Bahn
  mit Pfeiltasten, Pos1 und Ende, sichtbare Scrollbar (`.scroll-x`), Trackpad und Mausrad
  unverändert.
- Fallkarten: Name, nächste Aktion, Blocker, dann Volumen/Alter/Quelle, zuletzt Einschätzung. Die
  Machbarkeits-Ampel spricht nur bei Gelb und Rot (grün bleibt als Farbkante und für Screenreader).
  Karten auf Blattweiß mit Hover-Kante und Fokusring.
- Aktionen: Ansichtswechsel links, Trennlinie, Demo-Fall als Textlink, „Aus FinLink importieren“ als
  Kante, „Neuen Fall anlegen“ als einzige Tinte; „Jetzt abgleichen“ als stiller Textknopf.

## 7a. Tagesliste und Fallakte (Nachtrag 03.09.2026)

- **Tagesliste**: Arbeitsfokus oben („Jetzt dran“, die eine Aufgabe auf der Hero-Fläche mit
  Tintenknopf), darunter die Bänder als Flächen mit Gewicht (überfällig als Blocker-Fläche, heute als
  Blatt, später als Ablage). Eine Hauptaktion je Karte: die konkrete Handlung in Tinte, „Fall öffnen“
  als Textlink, „Erledigt“ als stiller Haken; Wiedervorlage-Datum bleibt. Eyebrow „Mein Arbeitstag“,
  leerer Zustand mit Weg zum Board und zum neuen Fall. Berechnung und Actions unverändert.
- **Fallakte**: Kopf als Seitentitel mit Eyebrow „Fallakte“, Statuschips, Phasenwahl und Blockern;
  Reifegrad mit Prüfleiste rechts. Neue Faktenleiste (Finanzierungsart, Kaufpreis, Darlehenswunsch,
  Eigenkapital, Objekt, Vertriebsphase). Der Beratungskreislauf liegt jetzt auf der Hero-Fläche,
  darunter die Zahlenzeile (Dokumente, zu prüfen, fehlend, Plausibilitätshinweise, Reifegrad) und die
  Plattform-Bereitschaft. Die Reiter „Was fehlt noch?“, „Dokumente“, „Plausibilität“, „Übersicht“
  bleiben mit ihren Funktionen erhalten (Upload, Bündelung, Aufteilung, Detektiv, Bank-Anforderungen
  hängen daran); die Werkzeugkisten liegen auf der Ablagefläche. Stationen, Zustände und die Regel
  des offenen Bogens sind unverändert.

## 8. Portal

Übersicht mit **Ihre Mitwirkung** (Aufträge mit Handlungsbedarf, offene Rückfragen, Ergebnisse
verfügbar) und **Stand** (in Bearbeitung, abgeschlossen, Fälle frei im Kontingent); Listen „Jetzt
gefragt“ und „Zuletzt aktualisiert“; Handlungsbedarf nur, wenn das Backoffice ausdrücklich wartet oder
eine Rückfrage offen ist. Auftragstabelle mobil als Karten. Eyebrows: Übersicht, Meine Aufträge,
Neuer Auftrag, Auftrag, Mitwirkung, Ergebnisse, Kontingent, Organisation.

## 9. Design-System

Tokens: `--surface-raised`, `--surface-sunken`, `--text-disabled`, `--info` (hell/dunkel), Tailwind
`info`, `surface.raised/sunken`, `disabled`. Typostufen `.t-seitentitel`, `.t-abschnitt`, `.t-kpi`,
`.t-hilfe`. Flächen `.flaeche-blatt`, `.flaeche-oben`, `.flaeche-ablage`, `.flaeche-warnung`,
`.flaeche-blocker`, `.scroll-x`. Bausteine in `src/components/ui/flaechen.tsx`: `KpiKarte`,
`KpiGruppe`, `LeerZustand`, `Hinweis`, `TabellenContainer`, `Seitenpanel`, `Zaehler`. Globaler
`:focus-visible`-Stil, `prefers-reduced-motion`. Keine neue Bibliothek. Icons: lucide, 16 px in
Navigation und Knöpfen, `aria-hidden` an dekorativen Stellen. Logo unverändert (Größen und Abstände
geprüft, Small-Version vorhanden).

## 10. Responsive

Lokal geprüft (isolierte PGlite-Datenbank, synthetische Daten): 1440 px Backoffice-Dashboard,
„Jetzt bearbeiten“, Auftragsdetail, Vertriebs-Board, Portal; 390 px Backoffice-Dashboard, „Jetzt
bearbeiten“, Portal. Ergebnis: kein horizontaler Überlauf, Kennzahlgruppen zweispaltig mit gefülltem
letzten Feld, Auftragsliste und Portaltabelle als Karten, Board mobil untereinander. Tabellen ab md
im `.scroll-x`-Container. Weitere Breiten (320, 360, 375, 430, 768, 1024, 1280, 1680, 1920) nicht
einzeln aufgenommen; das Layout nutzt durchgehend Grid mit `minmax(0,1fr)` und `flex-wrap`.

## 11. Accessibility

Umgesetzt: globaler Fokusring, Fokus auf Board-Bahn und Pfeilknöpfen, `aria-label` an Zählern und
Pfeilen, `role="region"` für das Board, `aria-current` im Umschalter, Status stets mit Text,
`role="alert"/"status"` an Hinweisen, `sr-only`-Beschriftungen in den Faktenlisten, reduzierte
Bewegung. Kontraste: Hilfetext bleibt `muted-foreground` (kein hellerer Ton). Nicht durchgeführt:
automatisierter axe-Lauf (kein Werkzeug im Projekt).

## 12. Tests und Build

Neu: `tests/ui-bereiche-navigation.test.ts` (8), `tests/backoffice-fokus.test.ts` (8),
`tests/ui-flaechen.test.ts` (7, serverseitiges Rendern der Bausteine). `vitest.config.ts` nutzt die
automatische JSX-Laufzeit. Ergebnisse: siehe Abschnitt „Ergebnisse“.

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | fehlerfrei |
| `RUN_DB_IT=1 npx vitest run` | 238 Dateien grün, 3 übersprungen; 2.454 Tests grün, 4 übersprungen |
| `npm run build` | erfolgreich |
| Lint / Format | im Projekt nicht konfiguriert |
| Sicherheits-Vertragstests (`dokument-zugriff-vertrag`, `backoffice-vertrieb-trennung`) | unverändert grün |

## 13. Vorher / Nachher

| Stelle | Vorher | Nachher |
|---|---|---|
| Backoffice-Kopf | Produktname dreifach, „Auftragsdashboard“ | Eyebrow „Übersicht“, Titel „Dashboard“, Stand-Zeile |
| Kennzahlen | 11 gleiche Kacheln | 3 Gruppen mit Kante, Nullen blass |
| Nächster Auftrag | in Listen suchen | Arbeitsfokus mit Handlung und Knopf |
| Menü | 8 flache Einträge, „Bearbeitungsqueue“ | 4 Gruppen, „Jetzt bearbeiten“, Zähler |
| Leer | „Noch keine Aufträge.“ | Onboarding mit drei Schritten |
| Auftragsdetail | lange Seite, Kopf ohne Fakten | Faktenleiste, Fortschritt, Nächster Schritt als Hero, Verlauf/Notizen eingeklappt, Kontextpanels |
| Board | abgeschnittener Rand | Pfeile, Statuszeile, Schleier beidseitig, Tastatur |
| Fallkarte | Ampeltext überall | Aktion zuerst, Ampel nur bei Gelb/Rot |
| Vertriebsaktionen | fünf gleichwertige | eine Tinte, eine Kante, ein Umschalter, ein Textlink |
| Portal | interne Kachelkopie | Mitwirkung zuerst, Karten mobil |

## 14. Verbleibende Empfehlungen

1. Vereinfachte Markenfassung des Logos für kleine Flächen (nur Haus, klarere Wortmarke); nicht Teil
   dieses Auftrags.
2. Automatisierter Accessibility-Lauf (axe) und Screenshot-Regression in CI.
3. Fallakte: die Reiter „Dokumente“ und „Plausibilität“ langfristig in Unterlagen-Arbeitsplatz und
   KI-Prüfung überführen, sobald Upload, Bündelung und Detektiv dort einen Platz haben.
4. Formulare: Portal-Auftragsanlage in zwei Schritte teilen, wenn Nutzer den Umfang als lang empfinden.
5. Zähler „Jetzt bearbeiten“ zählt bearbeitbare Aufträge, die Seite zeigt alle aktiven; wenn das
   irritiert, Zähler und Liste angleichen.
