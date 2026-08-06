# Selbstauskunft für Kunden (Magic Link)

**Datum:** 2026-08-06
**Status:** Design abgenommen (Jürgen, 06.08.2026)

## Problem

BaufiDesk soll FinLink ablösen. FinLink liefert heute die Kundendaten über eine
öffentliche Trichterstrecke; BaufiDesk hat dafür nur ein Formular mit zehn
Feldern auf der Upload-Seite. Alles darüber hinaus — Geburtsdatum, Anschrift,
Arbeitgeber, Einkommen je Person, laufende Kredite, Eigenkapitalherkunft —
sammelt der Vermittler bis heute im Gespräch ein und tippt es selbst.

Solange das so bleibt, kann BaufiDesk weder eine Haushaltsrechnung stellen noch
einen Europace-Vorgang füllen, ohne dass Jürgen vorher abtippt.

### Was FinLink tatsächlich fragt

Die Strecke unter `ish_gmbh_harrer_kristian.finlink.de/juergen-ertel/start`
wurde am 06.08.2026 Schritt für Schritt abgelaufen (Zweig: Kauf
Bestandsimmobilie → Immobilie gefunden → selbst bewohnen → zu zweit →
angestellt). Ergebnis: **elf Sachfragen, dann der Kontaktschritt.**

| # | URL-Schritt | Frage | Antwortart |
| --- | --- | --- | --- |
| 1 | `finance_type` | Was möchten Sie finanzieren? | Kauf Neubau · Kauf Bestandsimmobilie · Eigenes Bauvorhaben · Modernisierung · Anschlussfinanzierung · Kapitalbeschaffung |
| 2 | `progress_property_search` | Bereits eine Immobilie gefunden? | nicht besichtigt · gefunden |
| 3 | `property_use` | Wie nutzen Sie die Immobilie? | selbst bewohnen · vermieten · teilweise vermieten |
| 4 | `property_zipcode` | In welcher Stadt ist die Immobilie? | PLZ mit Autovervollständigung → Stadt |
| 5 | `purchase_price` | Wie hoch ist der Kaufpreis? | Betrag € |
| 6 | `down_payment` | Wie viel Eigenkapital setzen Sie ein? | Betrag € |
| 7 | `know_agent_fees` | Fällt eine Maklergebühr an? | Maklergebühr · provisionsfrei · weiß nicht |
| 8 | `agent_fees` | Wie hoch? | Betrag, umschaltbar % oder € |
| 9 | `applying_alone` | Alleine oder zu zweit? | alleine · mit einer weiteren Person |
| 10 | `employment_status` | In welchem Arbeitsverhältnis? | Angestellte/r · Selbstständige/r · Selbstständige/r Handwerker/in · Arbeiter/in · Freiberufler/in · Beamter/in · Privatier/Privatière · Rentner/in · Anderes |
| 11 | `monthly_net_income` | Nettoeinkommen des **Haushalts** | Betrag € |
| 12 | `contact` | „Digitaler Zugang …" | Anrede · Vorname · Nachname · E-Mail · Telefon · Telefon-Einwilligung |

Wichtiger als die Feldliste ist das Muster: eine Frage pro Bildschirm, große
Kacheln, Fortschrittsbalken mit Restzeitangabe, Zurück-Knopf, Beraterkontakt auf
jeder Seite — und die Kontaktdaten ganz zuletzt, wenn der Kunde bereits
investiert hat.

**Das ist eine Leadstrecke, keine Selbstauskunft.** Nicht erfragt werden:
Geburtsdatum, Anschrift, Arbeitgeber, Kinder, laufende Verpflichtungen,
Vermögensaufstellung, Objektdetails. Das Einkommen kommt als Haushaltssumme,
nicht je Person — damit kann keine Bank rechnen.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Ergebnis des Bogens | Strukturierte Falldaten (kein PDF) |
| Einstieg | Eigener Magic Link, getrennt vom Upload-Link |
| Umfang | FinLink-Strecke **plus** Selbstauskunftsteil |
| Übernahme der Angaben | Eingang mit Freigabe: Lücken vorausgewählt, Abweichungen einzeln entschieden |
| Zwei Antragsteller | Ein Link, eine Person füllt beide Teile aus |
| Zwischenstand | Nach jedem Schritt gespeichert, Wiederaufnahme an derselben Stelle |
| Bauweise | Fragenkatalog als Daten, eine generische Strecke rendert ihn |
| Bestehendes Mini-Formular | Wird durch einen Verweis auf die Selbstauskunft ersetzt |
| Einkommen | Je Person statt Haushaltssumme (bewusste Abweichung von FinLink) |
| Kontaktdaten | Im Personenabschnitt, nicht als Schranke am Ende |
| Pflichtfelder | **Keine.** Jedes Feld darf leer bleiben, „Weiter" ist immer möglich |

Begründung gegen Pflichtfelder: Ein Bogen mit 38 Schritten trifft zwangsläufig
auf Angaben, die der Kunde gerade nicht zur Hand hat — die Anschrift des
Arbeitgebers, das Gründungsdatum der Firma. Wer dort nicht weiterkommt, bricht
ab, und dann fehlt alles statt nur einer Zeile. Eine Lücke ist außerdem ein
brauchbares Ergebnis: Sie zeigt Jürgen genau, wonach er fragen muss. Der Bogen
sammelt, was da ist, und meldet, was fehlt — er erzwingt nichts.

Begründung zur Freigabe: Das heutige Mini-Formular schreibt Kundenangaben sofort
in Antragsteller 1, und die Kundenangabe gewinnt gegen den Bestand. Bei Einkommen
und Verpflichtungen wäre das dieselbe Falle wie bei der Dokumentzuordnung — die
Korrektur des Vermittlers verschwindet still. Deshalb landet alles im Eingang.

Begründung gegen ein gemeinsames Token mit dem Upload-Link: Ein Token mit zwei
Bedeutungen lässt sich später versehentlich auf den jeweils anderen Weg
anwenden. Zwei Datensätze, zwei Auflösungen, keine Verwechslung.

## Architektur

Vier Bausteine mit je einer Aufgabe:

1. **Katalog** (`src/lib/self-disclosure/catalog.ts`) — Schritte als Daten:
   Frage, Felder, Auswahlmöglichkeiten, Sichtbarkeitsregel, Zielfeld. Dazu reine
   Funktionen: `naechsterSchritt`, `sichtbareSchritte`, `fortschritt`,
   `schrittSchema` (Zod-Schema aus der Felddefinition). Keine Datenbank, kein
   React — vollständig testbar.
2. **Kundenstrecke** (`src/app/selbstauskunft/[token]/[schritt]/page.tsx`) — läuft
   den Katalog ab. Ein Schritt = eine URL, damit der Zurück-Knopf des Browsers
   funktioniert.
3. **Speicher** — `SelfDisclosureLink` (gehashtes Token) und `SelfDisclosure`
   (Antworten als JSON, zuletzt erreichter Schritt, Absendezeitpunkt).
4. **Übernahme** (`src/lib/self-disclosure/takeover.ts`) — reine Funktion:
   Antworten + Fallstand → Vorschlagsliste. Ohne eigene Tabelle, damit die
   Vorschläge nicht veralten, während am Fall gearbeitet wird.

### Schritt und Feld

Ein Schritt ist ein Bildschirm mit **einem oder mehreren** Feldern. Teil A bleibt
bei einer Frage pro Bildschirm wie bei FinLink; im Selbstauskunftsteil fasst ein
Schritt Zusammengehöriges (etwa die Anschrift). Bei strikt einer Frage pro
Bildschirm käme der Bogen auf über 70 Bildschirme — das hält niemand durch. So
sind es **28 Schritte für einen Antragsteller, 38 für zwei** (Kaufzweig mit
gefundener Immobilie; andere Zweige liegen darunter).

```ts
export interface Feld {
  id: string;
  label: string;
  typ: "auswahl" | "betrag" | "prozent_oder_betrag" | "text" | "datum" | "plz_ort" | "ja_nein" | "zahl";
  optionen?: { wert: string; label: string }[];
  ziel?: Ziel;                       // wohin im Fall
}
// Kein "pflicht": Jedes Feld darf leer bleiben. Geprüft wird nur die Form eines
// eingegebenen Werts, nie seine Anwesenheit.

export interface Schritt {
  id: string;                        // zugleich URL-Segment
  abschnitt: "vorhaben" | "person" | "beruf" | "haushalt" | "eigenkapital" | "objekt" | "abschluss";
  frage: string;
  hinweis?: string;
  felder: Feld[];
  sichtbar?: (a: Antworten) => boolean;
  jeAntragsteller?: boolean;         // läuft zweimal, wenn zu zweit
}

export type Ziel =
  | { entitaet: "applicant" | "property" | "financingRequest" | "case"; feld: string }
  | { entitaet: "income" | "employment" | "selfEmployment"; feld: string }   // je Antragsteller
  | { entitaet: "liability" | "asset"; liste: true };
```

Bei `jeAntragsteller` trägt die Antwort-ID das Präfix `p1.` bzw. `p2.`.

**Unbeantwortete Steuerfragen.** Weil jede Frage übersprungen werden darf, kann
auch die Frage leer bleiben, an der ein Zweig hängt. Regel: Eine
Sichtbarkeitsregel prüft nur ausdrücklich gegebene Antworten — fehlt die
Steuerantwort, bleibt der abhängige Zweig zu. Zwei Ausnahmen, weil sonst der
halbe Bogen verschwände:

- `anzahl_antragsteller` leer → nur Antragsteller 1 (der häufigere Fall).
- `finanzierungsart` leer → der Kaufzweig, weil er den Rest trägt.

Springt der Kunde zurück und beantwortet die Steuerfrage doch, erscheinen die
Schritte; bereits gegebene Antworten aus einem anderen Zweig bleiben gespeichert.

### Datenmodell (additiv)

```prisma
model SelfDisclosureLink {
  id        String   @id @default(cuid())
  caseId    String
  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  disclosure SelfDisclosure?

  @@index([caseId])
  @@map("self_disclosure_links")
}

model SelfDisclosure {
  id          String    @id @default(cuid())
  linkId      String    @unique
  link        SelfDisclosureLink @relation(fields: [linkId], references: [id], onDelete: Cascade)
  caseId      String
  answers     Json      @default("{}")
  currentStep String?
  submittedAt DateTime?
  takenOverAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([caseId])
  @@map("self_disclosures")
}
```

Der Antwortsatz hängt am **Link**, nicht am Fall: Ein zweiter Bogen erzeugt einen
neuen Durchgang, der erste bleibt mit Datum erhalten. Bei einer Rückfrage in vier
Monaten ist damit nachvollziehbar, was wann angegeben wurde.

Zusätzlich ein Feld am bestehenden Modell:

```prisma
model Applicant {
  anrede String?   // "herr" | "frau" — FinLink fragt es, Anschreiben brauchen es
}
```

## Der Fragenkatalog

Zielfelder in Klammern. Alles Vorhandene wird verwendet; außer `Applicant.anrede`
entsteht kein neues Feld.

### A · Ihr Vorhaben

| Schritt | Frage | Felder → Ziel | sichtbar |
| --- | --- | --- | --- |
| `finanzierungsart` | Was möchten Sie finanzieren? | Auswahl aus sechs → `Case.financingType` | immer |
| `objektstand` | Haben Sie schon eine Immobilie? | gefunden · nicht besichtigt | Kauf/Bauvorhaben |
| `nutzung` | Wie möchten Sie sie nutzen? | selbst bewohnen → `selbstnutzung`, vermieten → `vermietet`, teilweise → `gemischt` (`Property.nutzung`) | Kauf/Bauvorhaben |
| `objekt_ort` | Wo liegt die Immobilie? | PLZ + Ort → `Property.zip`, `Property.city` | Kauf/Bauvorhaben |
| `kaufpreis` | Wie hoch ist der Kaufpreis? | Betrag → `FinancingRequest.kaufpreis` | Kauf Neubau/Bestand |
| `baukosten` | Grundstückspreis und Baukosten | zwei Beträge → `kaufpreis`, `baukosten` | eigenes Bauvorhaben |
| `modernisierungskosten` | Was soll modernisiert werden, zu welchen Kosten? | Text + Betrag → `modernisierungskosten` | Modernisierung |
| `restschuld` | Restschuld und Ende der Zinsbindung | Betrag + Datum → `darlehenswunsch`, Frist `zinsbindung` | Anschlussfinanzierung |
| `kapitalbedarf` | Welchen Betrag benötigen Sie? | Betrag → `darlehenswunsch` | Kapitalbeschaffung |
| `eigenkapital` | Wie viel Eigenkapital setzen Sie ein? | Betrag → `FinancingRequest.eigenkapital` | immer |
| `maklergebuehr` | Fällt eine Maklergebühr an? | ja · provisionsfrei · weiß nicht | Kauf |
| `maklergebuehr_hoehe` | Wie hoch? | % oder € → `maklerprovisionProzent` (€ wird am Kaufpreis in % umgerechnet) | Maklergebühr = ja |
| `anzahl_antragsteller` | Alleine oder zu zweit? | alleine · zu zweit | immer |

### B · Zur Person (`jeAntragsteller`)

| Schritt | Felder → Ziel |
| --- | --- |
| `person_name` | Anrede, Vorname, Nachname → `Applicant.anrede/vorname/nachname` |
| `person_geburt` | Geburtsdatum, Geburtsort, Staatsangehörigkeit → `Applicant` |
| `person_familienstand` | Familienstand (`MARITAL_STATUSES`) → `Applicant.familienstand` |
| `person_anschrift` | Straße, PLZ, Ort → `Applicant.street/zip/city`. Bei Person 2 vorab: „gleiche Anschrift wie Person 1?" |
| `person_kontakt` | E-Mail, Telefon → `Applicant.email/phone` |

### C · Beruf und Einkommen (`jeAntragsteller`)

| Schritt | Felder → Ziel | sichtbar |
| --- | --- | --- |
| `beruf_art` | Arbeitsverhältnis, neun Optionen wie FinLink → `EmploymentRecord.beschaeftigungsart` (Abbildung auf `EmploymentType`: Angestellte/Arbeiter → `angestellter`; Selbstständig/Handwerker/Freiberufler → `selbststaendiger`; Beamter → `beamter`; Rentner → `rentner`; Privatier/Anderes → `sonstiges`) | immer |
| `beruf_arbeitgeber` | Beruf, Arbeitgeber, dessen Anschrift → `EmploymentRecord` | angestellt/Arbeiter/Beamter |
| `beruf_dauer` | Beschäftigt seit, befristet bis, in Probezeit → `EmploymentRecord` | angestellt/Arbeiter/Beamter |
| `beruf_selbststaendig` | Firma, Rechtsform, Beteiligung %, Gründungsdatum → `SelfEmploymentRecord` | selbstständig/frei/Handwerk |
| `einkommen` | Netto und Brutto monatlich, Sonderzahlungen jährlich → `IncomeRecord.nettoMonatlich/bruttoMonatlich/einmalzahlungenJaehrlich` | immer |
| `weitere_einnahmen` | Mieteinnahmen, sonstige Einnahmen → `IncomeRecord.mieteinnahmen/sonstigeEinnahmen` | immer |

### D · Haushalt und Verpflichtungen (einmal für beide)

| Schritt | Felder → Ziel |
| --- | --- |
| `haushalt_kinder` | Anzahl Kinder — **einmal gefragt, nie je Person**, weil beide im selben Haushalt leben und die Zahl sonst doppelt zählte. Beim Übernehmen wird sie auf `Applicant.anzahlKinder` beider Antragsteller geschrieben |
| `haushalt_ausgaben` | Unterhaltsverpflichtungen, derzeitige Warmmiete → **kein Zielfeld**: das Schema kennt beides noch nicht. Die Werte bleiben in den Antworten und werden in der Prüfansicht angezeigt; ein Zielfeld bekommen sie mit der Haushaltsrechnung |
| `verpflichtungen` | Liste: Art, Gläubiger, Restschuld, Monatsrate, „soll abgelöst werden" → je Eintrag ein `Liability` |

### E · Eigenkapital im Einzelnen

| Schritt | Felder → Ziel |
| --- | --- |
| `eigenkapital_positionen` | Liste: Art (Bankguthaben · Bausparvertrag · Wertpapiere · Schenkung · Verkaufserlös · Eigenleistung · Sonstiges), Betrag → je Eintrag ein `Asset` (`belegt: false`, `quelle: "selbstauskunft"`) |

Die Summe wird gegen den Betrag aus `eigenkapital` (Abschnitt A) geprüft. Weicht
sie ab, fragt der Bogen freundlich nach — er blockiert aber nicht.

### F · Das Objekt (nur wenn `objektstand = gefunden`)

| Schritt | Felder → Ziel |
| --- | --- |
| `objekt_art` | Objektart (`PropertyType`) → `Property.objektart` |
| `objekt_adresse` | Straße und Hausnummer → `Property.street` |
| `objekt_masse` | Wohnfläche, Grundstücksfläche, Baujahr, Zimmer, Stellplätze → `Property` |
| `objekt_kosten` | Hausgeld monatlich (bei Eigentumswohnung), Mieteinnahmen monatlich (bei Vermietung) → `Property` |

### Abschluss

| Schritt | Inhalt |
| --- | --- |
| `zusammenfassung` | Alle Antworten untereinander, jede mit Sprung zurück zur Frage. Offen Gebliebenes steht als „noch offen" dabei — sichtbar, aber ohne Zwang. Absenden ist auch mit Lücken möglich |

## Die Kundenstrecke

Kein Konto, kein Passwort. Eine Frage pro Bildschirm, große antippbare Kacheln,
Fortschrittsbalken mit **ehrlicher** Restangabe: gezählt werden die tatsächlich
noch sichtbaren Schritte, nicht eine feste Zahl. Für das Handy gebaut.

Jeder Schritt speichert beim Weitergehen. Der Wert wird serverseitig gegen
`schrittSchema` geprüft; ungeprüfte Rohdaten werden nie gespeichert — dasselbe
Muster wie `saveCustomerForm`. Bei einem Fehler sieht der Kunde, welches Feld
nicht stimmt.

**„Weiter" ist immer möglich, auch mit leeren Feldern.** Geprüft wird nur die
Form eines eingegebenen Werts — „dreitausend" ist kein Betrag, ein leeres Feld
dagegen eine gültige Antwort. Der Knopf heißt deshalb „Weiter", wenn etwas
eingetragen ist, und „Überspringen", wenn der Schritt leer ist: Der Kunde soll
sehen, dass er etwas offen lässt, aber nicht daran hängenbleiben. Ein
übersprungener Schritt speichert nichts und zählt in der Zusammenfassung als
offen.

Wiederaufnahme: Wer den Link später erneut öffnet, landet auf `currentStep`.

**Vorbelegung:** Bekannte Werte aus dem Fall stehen vorbelegt in den Feldern
(Name, Objektadresse, Kaufpreis nach FinLink-Import). Dieselbe Abwägung trifft
die Upload-Seite heute schon: Wer den Link hat, sieht die Falldaten. Vertretbar,
weil der Link gezielt verschickt wird, jederzeit widerrufbar ist und ausläuft.

**Nach dem Absenden** ist der Bogen gesperrt und nur noch lesbar. Wer etwas
ändern möchte, meldet sich beim Berater und bekommt einen frischen Link. Das
verhindert, dass jemand tippt, während die Angaben übernommen werden.

## Das Backoffice

**Bereich „Selbstauskunft" auf der Fallseite**, gebaut wie die
Upload-Link-Verwaltung: Link erzeugen (Gültigkeit wählbar, Standard 14 Tage),
kopieren, widerrufen. Der Stand in Klartext:

- „noch nicht erstellt"
- „erstellt am 06.08., noch nicht begonnen"
- „begonnen, Schritt 7 von 38" (die Gesamtzahl richtet sich nach den Zweigen,
  die die bisherigen Antworten öffnen)
- „eingegangen am 08.08."
- „übernommen am 08.08."

**Prüfansicht nach Eingang.** Vorschläge nach Abschnitten gruppiert, in zwei
Sorten:

- **Lücke** — im Fall steht nichts. Vorausgewählt; „Alle Lücken füllen" erledigt
  den Großteil in einem Klick.
- **Abweichung** — Kundenangabe und Fallwert nebeneinander, Entscheidung je
  Zeile. Nie vorausgewählt.

Darunter, gleichrangig wichtig: **„Vom Kunden offen gelassen"** — die Liste der
übersprungenen Angaben, nach Abschnitten sortiert. Weil kein Feld erzwungen wird,
ist das die eigentliche Nachfassliste: Sie sagt Jürgen genau, wonach er beim
nächsten Telefonat fragen muss, statt ihn den Bogen absuchen zu lassen.

Verpflichtungen und Vermögenswerte werden als Block angeboten („3 Verpflichtungen
übernehmen"), nicht Zeile für Zeile.

Das Übernehmen schreibt in einer Transaktion, legt Audit-Einträge an
(`field.corrected`, Metadaten `{ quelle: "selbstauskunft" }`) und setzt
`takenOverAt`. Die Antworten bleiben unverändert liegen.

**Prioritätsleiter** (Next-Step-Engine, siehe `gefuehrte-fallreise`): zwei neue
Zustände — „Selbstauskunft eingegangen, bitte übernehmen" weit oben, weil daraus
alles Weitere folgt; „Selbstauskunft erstellt, seit Tagen nicht begonnen" weiter
unten als Anlass nachzufassen.

**Upload-Seite:** Das bisherige Angaben-Formular weicht einem Hinweis („Ihre
Angaben machen Sie in der Selbstauskunft"), mit Link, sofern ein gültiger
existiert. `saveCustomerForm` und `customerFormSchema` entfallen damit als
Schreibweg in den Fall; der bestehende `CustomerForm`-Datensatz bleibt für
Bestandsfälle lesbar.

## Sicherheit

- Token: 32 Byte Zufall, gespeichert wird nur der Hash — wie beim Upload-Link
  (`src/lib/security/upload-link.ts` wird wiederverwendet).
- Jede Server-Action löst den Token serverseitig auf. Der Client übermittelt nie
  eine `caseId`.
- Über diesen Link gibt es **keinen** Zugriff auf Dokumente, nur auf den Bogen.
- Abgelaufen oder widerrufen → dieselbe freundliche Seite wie beim Upload, mit
  Beraterkontakt statt Sackgasse.
- Absenden ist idempotent: ein zweiter Aufruf nach `submittedAt` wird abgewiesen.
- Übernahme respektiert `LOCKED_CASE_STATUSES` wie jeder andere Schreibweg.

## Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| Kunde gibt „zu zweit" an, Fall hat eine Person | Person 2 wird **beim Übernehmen** angelegt, nicht beim Ausfüllen — ein halb ausgefüllter Bogen verändert den Fall nicht |
| Kunde stellt zurück auf „alleine" | Antworten zu Person 2 bleiben gespeichert, zählen aber nicht; beim Zurückstellen sind sie wieder da |
| Eigenkapitalsumme weicht ab | Freundlicher Hinweis, keine Blockade |
| Steuerfrage übersprungen | Abhängiger Zweig bleibt zu; Ausnahmen: ohne `anzahl_antragsteller` nur Person 1, ohne `finanzierungsart` der Kaufzweig |
| Bogen fast leer abgesendet | Zulässig. Der Eingang zeigt die wenigen Angaben und darunter alles, was offen blieb |
| Kunde überspringt seinen Namen | Der Fall behält den bisherigen Namen; die Zuordnung hängt am Link, nie an der Angabe |
| Fall gesperrt (exportiert/archiviert) | Übernahme abgelehnt, Bogen bleibt lesbar |
| Zweiter Bogen nach Freigabe | Neuer Durchgang; der erste bleibt mit Datum erhalten |
| Link abgelaufen, Bogen halb fertig | Beim Erzeugen des neuen Links werden die Antworten des letzten **nicht abgesendeten** Durchgangs mitgenommen, samt erreichtem Schritt. Ein abgesendeter Durchgang wird nie fortgeschrieben — er ist der belegte Stand |

## Tests

In der Reihenfolge, in der sie sich lohnen:

1. **Katalog, rein** — Verzweigungen (selbstständig, zweite Person,
   Anschlussfinanzierung), nächster Schritt, sichtbare Schritte, Fortschritt,
   Zod-Schema je Schritt. Ausdrücklich: ein leerer Schritt ist gültig und führt
   weiter; eine übersprungene Steuerfrage hält den Zweig zu, außer bei den zwei
   festgelegten Ausnahmen.
2. **Übernahme, rein** — Lücke gegen Abweichung, Listenblöcke, Anlegen von
   Person 2, Prozentumrechnung der Maklergebühr, Kinderzahl auf beide
   Antragsteller. Und: übersprungene Felder erzeugen **keinen** Vorschlag und
   überschreiben nie einen vorhandenen Wert mit Leere.
3. **Aktionen gegen Mocks** — abgelaufener Token, widerrufener Token, fremder
   Fall, zweimal absenden, Validierungsfehler.
4. **PGlite gegen echtes Schema** — ein vollständiger Durchlauf: Link erzeugen,
   Antworten speichern, absenden, übernehmen; Prüfung, dass Antragsteller,
   Einkommen, Verpflichtungen und Vermögen korrekt entstanden sind. Muster wie
   `tests/applicant-rematch-db.test.ts`.

## Nicht in diesem Schritt

- Kein Selbstauskunft-PDF für die Bank (Ergebnis sind Falldaten).
- Kein automatischer Europace-Push.
- Keine Unterschrift, keine SCHUFA-Einwilligung, keine Bonitätsbewertung.
- Kein eigener Versandweg: Der Link wird kopiert oder über die bestehenden
  Nachrichtenvorlagen verschickt.
- Keine Erinnerungs-Automatik; der Zustand in der Prioritätsleiter genügt.

## Offene Punkte für später

- Getrennte Links je Antragsteller (heute füllt eine Person beide Teile aus).
  Sinnvoll, sobald sich zeigt, dass Mitantragsteller ihre Zahlen nicht
  offenlegen möchten.
- Übernahme der Angaben in die Haushaltsrechnung als eigene Ansicht — hier
  entstehen nur die Daten.
- Der Katalog ist heute Code. Erst wenn Jürgen Fragen selbst ändern möchte,
  lohnt eine Oberfläche dafür.
