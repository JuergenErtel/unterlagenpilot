# Unterlagen-Detektiv – Design

Datum: 2026-08-09
Status: abgestimmt, bereit für Implementierungsplan

## 1. Problem

Die Checklisten-Engine kennt ihre Anforderungen, **bevor** ein Dokument gelesen wurde.
`selectTemplateKeys()` wählt anhand von Falltyp, Beschäftigungsart und Objektart aus
einem statischen Katalog; die Regel-Engine in `src/lib/rules/requirements.ts` ergänzt
Anforderungen aus Falltyp, Plattform und Bank.

Die teuersten Lücken entstehen aber erst beim Lesen eines Dokuments. Ein
Grundbuchauszug nennt wörtlich die Urkunden, die es geben muss:

> „verbunden mit dem Sondereigentum an Wohnung Nr. 12 … Bezug: Bewilligung vom
> 12.03.1998, UR-Nr. 456/1998 Notar Müller; 1. Nachtrag vom 04.08.2004,
> UR-Nr. 512/2004; 2. Nachtrag vom 11.08.2011, UR-Nr. 789/2011"

Diese Soll-Liste lässt sich nicht als Template hinterlegen — sie ist fallindividuell.
Heute müsste der Vermittler einen 14-seitigen Grundbuchauszug Zeile für Zeile gegen
den Dokumentenordner halten. Das passiert in der Praxis nicht, und die Lücke fällt
erst beim Sachbearbeiter der Bank auf.

Zweiter, verwandter Fall: Ein Dokument ist in sich unvollständig. „Seite 12 von 37"
bei 14 vorhandenen Seiten, ein im Text erwähnter, aber nicht beigefügter
Aufteilungsplan, ein Grundbuchauszug, der älter ist als die Bank akzeptiert.

## 2. Ziel

Eine **dritte Quelle für Anforderungen: aus Dokumentinhalten abgeleitet**. Der
Detektiv liest die Objektunterlagen, leitet daraus ab, welche weiteren Urkunden
existieren müssen, gleicht das gegen die Akte ab und schlägt die Lücken zur Freigabe
vor.

### Nicht Teil dieser Ausbaustufe

- Auftrennen von Sammel-PDFs (eigenes Vorhaben)
- Serienprüfungen auf der Personenseite (Kontoauszugs-Saldenkette,
  Gehaltsabrechnungs-Folge) — bewusst zurückgestellt
- Referenzregeln für Dokumenttypen außerhalb der Objektunterlagen

## 3. Grundsatzentscheidung: Hybrid

Die KI liest, deterministische Regeln entscheiden.

| Teil | Umsetzung | Begründung |
|---|---|---|
| Verweise aus dem Text lesen | KI | robust gegen Formvarianten der Grundbuchämter |
| Was folgt aus einer Last? | Regelkatalog in Code | Fachwissen muss versioniert, testbar und ohne Prompt-Debugging änderbar sein |
| Liegt das schon in der Akte? | deterministischer Abgleich | nachvollziehbar, kostenlos, beliebig oft wiederholbar |

Das entspricht dem Muster, das im Projekt bereits trägt: bei der
Selbständigen-Bankzusammenfassung liest die KI, der Begleittext ist deterministisch;
bei den Cross-Checks entscheiden Regeln.

**Jeder Fund trägt seine Fundstelle** — Seitenzahl und wörtliches Zitat. Ohne
Nachprüfbarkeit wird dem Ergebnis nicht vertraut.

## 4. Datenmodell

Zwei neue Tabellen plus **ein** neues Feld an `Document`: `referenceStatus`
(`ProcessingStatus`, Vorgabe `ausstehend`) — analog zu `extractionStatus`, damit ein
gescheiterter Verweislauf sichtbar ist und nicht wie „nichts gefunden" aussieht.

Sonst keine Änderung an bestehenden Modellen. Insbesondere `CaseChecklistItem`
erlaubt bereits freie Positionen mit eigenem `key`/`name` und optionalem
`checklistItemId`; es braucht dort kein neues Feld.

### `DocumentReference`

Reines KI-Extraktionsergebnis, noch keine Bewertung.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | String | |
| `documentId` | String | Quelldokument |
| `caseId` | String | Denormalisiert für den fallweiten Abgleich |
| `kind` | String | `bezugsurkunde` \| `nachtrag` \| `anlage` \| `last` \| `grundpfandrecht` \| `selbst` |
| `label` | String | z. B. „2. Nachtrag zur Teilungserklärung" |
| `urkundeDatum` | DateTime? | |
| `urkundenNummer` | String? | z. B. „789/2011" |
| `notar` | String? | |
| `abteilung` | String? | `BV` \| `II` \| `III` |
| `laufendeNummer` | String? | laufende Nummer der Eintragung |
| `sourcePage` | Int | |
| `sourceQuote` | String | wörtliches Zitat aus dem OCR-Text |
| `confidence` | Float? | |
| `createdAt` | DateTime | |

`kind = "selbst"` ist die **Eigenauskunft** des Dokuments („Ich bin der 2. Nachtrag,
11.08.2011, UR 789/2011"). Ohne sie ist kein Abgleich möglich.

### `CaseFinding`

Regelerzeugter Befund mit Zustand.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | String | |
| `caseId` | String | |
| `code` | String | `referenz_fehlt` \| `folgeunterlage_noetig` \| `anlage_fehlt` \| `seiten_unvollstaendig` \| `dokument_veraltet` \| `serienluecke` |
| `title` | String | kundentauglich formuliert, ohne interne Kürzel |
| `reason` | String | Begründung für den Vermittler |
| `severity` | Severity | bestehendes Enum |
| `resolution` | String | `neue_position` \| `dokument_nachfordern` |
| `suggestedDocumentType` | DocumentType? | |
| `sourceDocumentId` | String | |
| `sourcePage` | Int? | |
| `sourceQuote` | String? | |
| `referenceId` | String? | Verweis auf `DocumentReference` |
| `matchCandidateId` | String? | bei unsicherem Abgleich: das vermutete Dokument |
| `status` | String | `offen` \| `unsicher` \| `freigegeben` \| `verworfen` \| `erledigt` |
| `checklistItemId` | String? | gesetzt, sobald freigegeben |
| `fingerprint` | String | stabiler Hash, `@@unique([caseId, fingerprint])` |
| `createdAt` / `updatedAt` | DateTime | |

#### Der Fingerabdruck

Der Detektiv läuft mehrfach über denselben Fall. Ohne stabilen Fingerabdruck
entstehen bei jedem Lauf dieselben Funde neu, und verworfene Funde kehren zurück —
das Feature wäre nach einer Woche unbrauchbar.

Der Fingerabdruck wird gebildet aus `sourceDocumentId` + `code` + normalisierter
Urkundenkennung (Urkundennummer, sonst Datum, sonst normalisiertes Label). Er darf
**nicht** vom Zitat, von der Seitenzahl oder von der Confidence abhängen — diese
ändern sich bei einer erneuten Extraktion.

#### Zwei Auflösungsarten, eine Tabelle

- `neue_position`: erzeugt bei Freigabe eine **neue** `CaseChecklistItem`-Zeile
  (`checklistItemId = null`, eigener `key` mit Präfix `detektiv.`).
- `dokument_nachfordern`: erzeugt **keine** neue Position, sondern setzt die
  bestehende auf `unvollstaendig` und schreibt die Begründung in `note`. Verhindert
  Dubletten in der Checkliste bei „Seiten fehlen" und „veraltet".

Befunde ohne Handlungsbedarf (unscharfer Scan, schiefe Seite) bleiben wie bisher
`DocumentWarning`. Der Detektiv erzeugt nur, was zu einer Handlung führt.

## 5. Erkennungslauf

### Stufe 1 – Verweise lesen (KI, einmal je Dokument)

Läuft im bestehenden `after()`-Hintergrundlauf nach OCR und Extraktion, aber als
**eigener Aufruf mit eigenem Schema und eigenem Status** (`referenceStatus` auf
`Document`, analog zu `extractionStatus`).

Bewusst **nicht** durch die vorhandene Feld-Extraktion geschleust: dort hat ein
einzelner Array-Wert schon einmal die komplette Extraktion stumm gekippt (siehe
`ki-extraktion-schema-fix`). Scheitert der Verweis-Lauf, muss die normale Extraktion
sauber durchlaufen — und umgekehrt.

Rate-Limit-Behandlung über das vorhandene `fetchWithRateLimitRetry`.

### Kandidatenseiten statt Volltext

Eine Teilungserklärung hat 40–80 Seiten. Bei 50.000 Tokens pro Minute im
Mistral-Konto sprengt ein einziges Dokument das Budget.

Deshalb vorgeschaltet ein **deterministischer Seitenfilter** über `DocumentPage.ocrText`:
nur Seiten mit Mustern wie `UR-Nr.`, `Bezug:`, `Nachtrag`, `Abteilung II`,
`Abteilung III`, `Anlage`, `Bewilligung vom`, `Aufteilungsplan`,
`Abgeschlossenheitsbescheinigung` gehen an die KI — typisch 3 bis 8 Seiten statt 60.
Der Regex-Weg wird dort genutzt, wo er stark ist (nichts übersehen), die KI dort, wo
sie stark ist (verstehen, was dasteht).

Findet der Filter keine Kandidatenseite, gilt das als Ergebnis „keine Verweise" und
nicht als Fehler.

### Stufe 2 – Regeln und Abgleich (deterministisch, bei jeder Änderung)

Kostet nichts, läuft daher bei jedem neuen Dokument, jeder Freigabe und jeder
Statusänderung neu über den ganzen Fall. Nur so schließt sich ein Fund von selbst,
wenn der Nachtrag drei Tage später hochgeladen wird.

Zusätzlich ein Knopf „Akte prüfen" für den manuellen Anstoß.

### Ehrlichkeit bei Fehlschlägen

Ist der Verweis-Lauf für ein Dokument nicht durchgelaufen, zeigt der Fall das
ausdrücklich an: „Verweisprüfung für Grundbuchauszug nicht möglich". Keine Funde darf
niemals wie „alles vollständig" aussehen, wenn gar nicht geprüft wurde.

## 6. Folgeregel-Katalog

Deklarativ, versioniert, testbar — im Stil von `src/lib/rules/risk-catalog.ts`.
Jede Regel: Auslöser → Pflichtunterlage → Begründung → `resolution`.

### Bestandsverzeichnis

| Auslöser | Folge |
|---|---|
| Bezug auf Teilungserklärung | Position „Teilungserklärung" |
| Jeder genannte Nachtrag | **je Nachtrag eine eigene Position**, Datum und UR-Nummer im Titel |
| Erwähnter Aufteilungsplan | Position „Aufteilungsplan" |
| Erwähnte Abgeschlossenheitsbescheinigung | Position „Abgeschlossenheitsbescheinigung" |

### Abteilung II

| Auslöser | Folge |
|---|---|
| Erbbaurecht | Erbbaurechtsvertrag samt Nachträgen **und** Zustimmung des Erbbaurechtsgebers zur Beleihung |
| Wohnungsrecht / Nießbrauch | Löschungsbewilligung oder Bewertung |
| Sanierungsvermerk | Genehmigung nach § 144 BauGB |
| Vorkaufsrecht der Gemeinde | Negativattest / Verzichtserklärung |
| Reallast / Altenteil | Bewertung |
| Geh-, Fahrt-, Leitungsrecht | nur Hinweis auf Bewertungsrelevanz, **keine** Unterlage |

### Abteilung III

| Auslöser | Folge |
|---|---|
| Eingetragene Grundschuld / Hypothek | Löschungsbewilligung bzw. Lastenfreistellungserklärung des Gläubigers |

### Kaufvertrag / Kaufvertragsentwurf

| Auslöser | Folge |
|---|---|
| Verweis auf TE / Nachträge / Grundbuchblatt | dieselbe Urkundenkette wie oben |
| Bauträgervertrag erkannt | MaBV-Zahlungsplan, Baubeschreibung, Baugenehmigung, Fertigstellungsbürgschaft |
| Herausgerechnetes Inventar mit Betrag | Hinweis (Bank beleiht es nicht mit), **keine** Unterlage |

### WEG-Protokolle und Verwalterunterlagen

| Auslöser | Folge |
|---|---|
| Beschlossene Sonderumlage | Beschluss mit Höhe und Fälligkeit |
| Erwähnter Wirtschaftsplan / Jahresabrechnung / Rücklagenstand fehlt | jeweils eine Position |
| Lücke in der Jahresfolge der Protokolle | Fund `serienluecke` |

### Bewusste Grenze

Baulasten stehen **nicht** im Grundbuch, sondern im Baulastenverzeichnis der
Bauaufsicht — und das gibt es nicht in allen Bundesländern (u. a. nicht in Bayern und
Brandenburg). Die Anforderung „Baulastenauskunft" wird deshalb aus dem Kaufvertrag
abgeleitet, nicht aus dem Grundbuch, und ist bundeslandabhängig.

## 7. Abgleichslogik

Gleicht `DocumentReference`-Einträge mit `kind ≠ "selbst"` gegen die
Eigenauskünfte (`kind = "selbst"`) der Dokumente im selben Fall ab.

Stufenweise, erste greifende Stufe gewinnt:

1. **Urkundennummer + Jahr identisch** → Treffer (sicher)
2. **Dokumenttyp + Urkundendatum identisch** → Treffer (sicher)
3. **Dokumenttyp + normalisiert ähnliche Bezeichnung** → Treffer (unsicher)
4. kein Treffer → Fund mit `status = "offen"`

Stufe 3 erzeugt `status = "unsicher"` mit gesetztem `matchCandidateId`. Der Detektiv
behauptet dann **nicht** „fehlt", sondern fragt nach. Ein falscher Alarm kostet mehr
Vertrauen als ein ehrliches Fragezeichen.

Normalisierung für Stufe 3: Kleinschreibung, Umlaute aufgelöst, Ordnungszahlen
vereinheitlicht („2.", „zweiter", „II." → `2`), Leerzeichen und Satzzeichen entfernt.

## 8. Vollständigkeitsprüfungen (rein deterministisch)

Gelten für **alle** Dokumenttypen, nicht nur Objektunterlagen:

- **Seitenzahl-Logik**: Muster „Seite X von Y" / „Blatt X/Y" im OCR-Text. Höchstes
  gefundenes `Y` gegen `Document.pageCount` → `seiten_unvollstaendig`,
  `resolution = dokument_nachfordern`.
- **Erwähnte, aber fehlende Anlagen**: Anlagenverweise im Text ohne zugehörige
  `DocumentReference` mit Treffer → `anlage_fehlt`.
- **Aktualität**: Dokumentdatum gegen ein je Dokumenttyp konfiguriertes Höchstalter
  (Grundbuchauszug als Startwert 6 Monate, konfigurierbar) → `dokument_veraltet`,
  `resolution = dokument_nachfordern`.

## 9. Oberfläche

### Block „Lücken in den Unterlagen" in der Fallakte

Neben der Checkliste. Je Fund eine Zeile:

```
2. Nachtrag zur Teilungserklärung fehlt — 11.08.2011, UR 789/2011, Notar Dr. Müller
Grundlage: Grundbuchauszug, Seite 3  ▸  (aufklappbar: wörtliches Zitat)
[Übernehmen] [Verwerfen]
```

Das Zitat ist aufklappbar; ein Klick öffnet das Quelldokument auf der genannten Seite.

Bei `status = "unsicher"` statt dessen:

```
Ist die vorhandene Datei „Nachtrag_TE_2011.pdf" der 2. Nachtrag?
[Ja, zuordnen] [Nein, fehlt]
```

- **Sammelfreigabe** „Alle übernehmen" — ein Grundbuchauszug erzeugt schnell vier bis
  sechs Funde; ohne Sammelaktion wird die Freigabe zur Klickstrecke.
- **Verworfene** bleiben eingeklappt sichtbar und sind wiederherstellbar.
- **Erledigte** verschwinden von selbst, mit Vermerk in der Historie.

Gestaltung nach der bestehenden Akte-Palette; die Prüfleiste als Signaturbaustein
wird wiederverwendet.

### Kundensichtbarkeit

Übernommene Positionen sind `customerVisible = true` und landen damit automatisch im
Upload-Link. Der Titel muss deshalb in Kundensprache stehen — „2. Nachtrag zur
Teilungserklärung vom 11.08.2011", nicht `te_nachtrag_2`. Der Titel wird vom
Regelkatalog erzeugt, nicht von der KI.

### Next-Step-Engine

Ein neuer Zustand in der bestehenden Prioritätsleiter: offene Befunde rangieren
**nach** „Dokumente prüfen" und **vor** „an Bank übertragen". Einreichen, bevor die
Lückenprüfung gesichtet ist, ist genau der Fehler, den das Feature verhindern soll.

### Audit

Jede Freigabe und jedes Verwerfen wird ins bestehende Audit-Log geschrieben — es ist
eine fachliche Entscheidung mit Haftungsbezug.

## 10. Fehlerverhalten

| Fall | Verhalten |
|---|---|
| KI-Aufruf scheitert | `referenceStatus = fehler`, Hinweis im Fall, Extraktion bleibt unberührt |
| Rate-Limit (429) | Backoff über `fetchWithRateLimitRetry`, danach `fehler` |
| Antwort passt nicht zum Schema | verworfen, `referenceStatus = fehler`, protokolliert |
| Kandidatenseiten-Filter findet nichts | Ergebnis „keine Verweise", **kein** Fehler |
| Dokument ohne OCR-Text | Verweislauf wird übersprungen, Hinweis im Fall |
| Freigegebene Position wird gelöscht | Fund geht zurück auf `offen` |

## 11. Absicherung

- **Unit-Tests für den Regelkatalog** mit realen Textausschnitten aus
  Grundbuchauszügen, Teilungserklärungen und WEG-Protokollen als Vorlage — reine
  Funktionen ohne KI.
- **Unit-Tests für den Abgleich**, je Stufe, inklusive der Normalisierung von
  Ordnungszahlen und Umlauten.
- **Fingerabdruck-Stabilitätstest**: zweimaliger Lauf über dieselben Daten erzeugt
  keine neuen Funde, und ein verworfener Fund kehrt nicht zurück.
- **Vertragstest gegen das KI-Antwortschema**, analog zum Vorgehen bei der
  Europace-Anbindung.
- **Seitenfilter-Test**: eine 60-seitige Vorlage reduziert sich auf die erwarteten
  Kandidatenseiten.

## 12. Abgrenzung zu bestehenden Bausteinen

| Baustein | Verhältnis zum Detektiv |
|---|---|
| `rules/requirements.ts` | bleibt unverändert; der Detektiv ist die **dritte** Anforderungsquelle neben Templates und Regeln |
| `checklists/engine.ts` | unverändert; freigegebene Funde erzeugen `CaseChecklistItem` mit `checklistItemId = null` |
| `ai/cross-checks.ts` | prüft Werte **zwischen** Dokumenten; der Detektiv prüft **Existenz** von Dokumenten |
| `DocumentWarning` | bleibt für Befunde ohne Handlungsbedarf |
