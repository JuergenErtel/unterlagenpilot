# Unterlagenliste an eine Bank schärfen

**Datum:** 2026-08-10
**Status:** freigegeben (Design), Umsetzung offen

## Das Problem

BaufiDesk **rät** heute, welche Unterlagen ein Fall braucht: aus Checklisten-Vorlagen,
aus gepflegten Bankanforderungen und aus den Funden des Unterlagen-Detektivs. Was die
Bank **tatsächlich** verlangt, steht in Europace — im Dokumentenbereich des Vorgangs.
Jürgen liest es dort ab und gleicht es im Kopf gegen BaufiDesk ab.

Diese Anforderungen sind die einzige **verbindliche** Quelle: Sie kommen vom
Produktanbieter, nicht aus unserer Regelbasis.

## Der Auslöser: kein Hintergrundabgleich

Welche Bank es wird, steht erst fest, wenn in Europace alles angelegt und gerechnet
ist. Ein automatischer Abgleich hätte also nichts, woran er sich orientieren könnte.

Deshalb ist das Feature eine **bewusste Handlung im Fall**:

> **Unterlagenliste an eine Bank anpassen** — BaufiDesk holt, was die Bank für
> diesen Vorgang verlangt.

Weil Jürgen den Knopf drückt, brauchen die Ergebnisse **keine zweite Freigabe** —
anders als beim Unterlagen-Detektiv, wo eine KI rät und deshalb ein Mensch bestätigt.

## Datenquelle: Europace

Alle Endpunkte sind öffentlich dokumentiert und als OpenAPI-Schema verfügbar.

### Kette

| Schritt | Aufruf | Host |
|---|---|---|
| Anträge zum Vorgang | `GET /v3/vorgaenge/{vorgangsNummer}/antraege` | `baufinanzierung.api.europace.de` |
| Vorschläge zum Vorgang | `GET /v3/vorgaenge/{vorgangsNummer}/finanzierungsvorschlaege` | `baufinanzierung.api.europace.de` |
| Anforderungen (Antrag) | `GET /dokumente/antrag/anforderungen?antragsNummer=…` | `api.europace2.de` |
| Anforderungen (Vorschlag) | `GET /dokumente/anforderungen?vorgangsNummer=…&finanzierungsvorschlagsId=…` | `api.europace2.de` |

Beide Anforderungs-Endpunkte liefern dasselbe Format (`Unterlagenanforderung[]`).
Der Vorschlags-Weg entspricht dem, was Jürgen heute vor der Einreichung sieht; der
Antrags-Weg ist die verbindliche Liste der Bank danach. Beide werden unterstützt,
weil sich nur der Abruf unterscheidet — Zuordnung und Abgleich sind identisch.

### Antwortschema

```
Unterlagenanforderung
  id                    eindeutige Id der Anforderung
  code                  anbieterspezifischer Code
  text                  anbieterspezifische Bezeichnung
  kurzbezeichnung       Kurzform
  erfuellungskategorien string[]  Dokumentkategorien, die sie erfüllen
  produktanbieter       { id: "DSL_BANK", bezeichnung: "DSL Bank" }
  bezug                 { typ, id, name, rolle: { typ, name } }
                        typ: antragsteller | immobilie | vorhaben | ratenkredit
                        rolle.typ (bei immobilie): finanzierungsobjekt |
                                   bestandsobjekt | zusatzsicherheit
  liegtVor              boolean  vom Berater als vorliegend markiert
  ausgeblendet          boolean  vom Berater ausgeblendet
```

### Scopes

Der Client fordert heute an: `baufinanzierung:vorgang:schreiben|lesen`,
`unterlagen:dokument:schreiben`, `unterlagen:unterlage:schreiben`.

**Neu nötig:**
- `unterlagen:unterlage:lesen` — für `/dokumente/anforderungen`
- `unterlagen:freigabe:lesen` — für `/dokumente/antrag/anforderungen`

Beide gehören in den offenen Zugangsantrag bei `helpdesk@europace2.de`. Ohne sie
kommt der Zugang, aber die Anforderungen bleiben unlesbar. Das gehört in die README.

### Bekannte Unsicherheiten

1. **„Mockdaten"-Warnung.** Die Vorgänge-API vermerkt bei beiden
   Finanzierungsvorschlags-Endpunkten: *„Achtung: Bei den ausgegebenen
   Finanzierungsvorschlägen handelt es sich um Mockdaten."* Ob das nur das
   Doku-Beispiel meint oder den Testmodus, ist ohne Zugang nicht entscheidbar.
   **Gegenmaßnahme:** Die Vorschlags-ID kann von Hand eingetragen werden; Europace
   zeigt sie in der Oberfläche. Der Antrags-Weg trägt diese Warnung nicht.
2. **Bankschlüssel.** `produktanbieter.id` sieht aus wie unsere Banken-Wiki-`bankId`
   (Doku-Beispiel `DSL_BANK`; im Wiki stehen `ING_DIBA`, `KSK_SIGMARINGEN`). Das ist
   sehr wahrscheinlich derselbe Schlüsselraum, aber unbewiesen.
   **Gegenmaßnahme:** Zuerst über `bankId` verknüpfen, bei Fehlschlag über den Namen;
   scheitert beides, wird der Name aus Europace unverändert angezeigt.
3. Der echte Netzaufruf bleibt ungetestet, solange keine Zugangsdaten vorliegen.

## Datenmodell

Zwei Tabellen. Ein **Abruf** ist ein Holen für *eine* Bank; die Anforderungen hängen
daran. Das macht den Bankwechsel zu einer Frage von `aktiv`, nicht zu einer Löschung.

```prisma
model BankAnforderungsAbruf {
  id             String   @id @default(cuid())
  caseId         String
  case           Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  bankId         String?  // Europace-Produktanbieter-Id, wenn ermittelbar
  bankName       String
  quelle         String   // "antrag" | "vorschlag"
  vorgangsNummer String
  bezugsId       String   // antragsNummer oder finanzierungsvorschlagsId
  abgerufenAm    DateTime
  aktiv          Boolean  @default(true)
  anforderungen  BankAnforderung[]

  @@unique([caseId, quelle, bezugsId])
  @@index([caseId, aktiv])
  @@map("bank_anforderungs_abrufe")
}

model BankAnforderung {
  id                    String   @id @default(cuid())
  abrufId               String
  abruf                 BankAnforderungsAbruf @relation(fields: [abrufId], references: [id], onDelete: Cascade)
  externeId             String   // Unterlagenanforderung.id
  code                  String
  text                  String
  kurzbezeichnung       String
  erfuellungskategorien String[] @default([])
  bezugTyp              String?
  bezugName             String?
  bezugRolle            String?
  liegtVor              Boolean  @default(false)
  ausgeblendet          Boolean  @default(false)
  documentType          DocumentType?  // zugeordneter BaufiDesk-Dokumenttyp
  applicantId           String?        // zugeordneter Antragsteller

  @@unique([abrufId, externeId])
  @@map("bank_anforderungen")
}
```

`documentType` und `applicantId` werden **beim Abruf** aufgelöst und gespeichert,
nicht bei jeder Anzeige neu berechnet — dieselbe Entscheidung wie bei der
HTML-Bereinigung im Banken-Wiki: einmal sauber ablegen statt bei jedem Lesen rechnen.

Migration läuft über `scripts/supabase-sql.sh`, **nicht** `prisma db push`.

## Bausteine

### `src/lib/platforms/europace/anforderungen.ts` — Abruf

Erweitert den bestehenden Client um lesende Aufrufe. Ohne Zugangsdaten gibt
`getEuropaceClient()` weiterhin `null` zurück; der Aufrufer meldet das ehrlich.

```ts
export interface AnbieterAuswahl {
  quelle: "antrag" | "vorschlag";
  bezugsId: string;
  bankId: string | null;
  bankName: string;
  /** Nur bei Vorschlägen: zur Unterscheidung mehrerer Angebote. */
  hinweis?: string;   // z. B. "1,89 % · 1.240 €/Monat"
}

/** Was Europace zu diesem Vorgang anbietet – Anträge zuerst (verbindlich). */
export async function ladeAuswahl(vorgangsNummer: string): Promise<AnbieterAuswahl[]>;

/** Die Anforderungen zu einer Auswahl. */
export async function ladeAnforderungen(
  vorgangsNummer: string,
  auswahl: Pick<AnbieterAuswahl, "quelle" | "bezugsId">
): Promise<Unterlagenanforderung[]>;
```

### `src/lib/anforderungen/zuordnung.ts` — Übersetzung (rein)

Kein Netz, keine Datenbank, keine KI. Vollständig testbar.

```ts
/** Europace-Kategorie -> BaufiDesk-Dokumenttyp. */
export function dokumenttypFuer(erfuellungskategorien: string[]): DocumentType | null;

/** bezug -> Antragsteller-Id, über den bestehenden Namensabgleich. */
export function antragstellerFuer(
  bezug: Bezugskategorie | undefined,
  applicants: ApplicantCandidate[]
): string | null;
```

`dokumenttypFuer` invertiert die vorhandene Tabelle `KATEGORIE` aus
`src/lib/platforms/europace/dokument-kategorien.ts`. Weil dort mehrere
BaufiDesk-Typen auf dieselbe Europace-Kategorie zeigen, ist die Umkehrung
**mehrdeutig**. Regel: Bei Mehrdeutigkeit gewinnt der Typ, der in der
`DocumentType`-Aufzählung zuerst steht — deterministisch und im Code als
feste Rangfolge hinterlegt, nicht aus der Objektreihenfolge abgeleitet.
Kategorien ohne Entsprechung und `"Sonstiges"` liefern `null`; die Position
entsteht dann ohne Dokumenttyp und wird nur über den Namen geführt.

`antragstellerFuer` nutzt `matchApplicant()` aus
`src/lib/documents/applicant-match.ts` — derselbe strenge Namensabgleich wie bei der
Auto-Zuordnung, damit ein Fall nicht zwei verschiedene Vorstellungen davon hat, wem
etwas gehört. Greift nur bei `bezug.typ === "antragsteller"`.

### `src/lib/anforderungen/abgleich.ts` — Abgleich (rein)

```ts
export type AbgleichBefund =
  | { art: "deckt_sich"; anforderungId: string; positionKey: string }
  | { art: "neu"; anforderungId: string }
  | { art: "erledigt"; anforderungId: string }        // liegtVor, ohne Gegenstück
  | { art: "bank_verlangt_nicht"; positionKey: string };

export function gleicheAb(
  anforderungen: BankAnforderungZugeordnet[],
  positionen: ResolvedChecklistItem[]
): AbgleichBefund[];
```

Eine Anforderung **deckt sich** mit einer Position, wenn der **Dokumenttyp**
übereinstimmt. Hat die Anforderung keinen Dokumenttyp, zählt Namensgleichheit nach
derselben Faltung (Kleinschreibung, Umlaute aufgelöst), die `applicant-match.ts`
schon verwendet.

**Der Antragstellerbezug geht bewusst nicht in die Trefferregel ein.** Eine
Checklisten-Position ist keine Zeile pro Person: `perApplicant: true` bedeutet eine
Zeile, deren Sollzahl mit der Antragstellerzahl multipliziert wird
(`effectiveRequiredCount`). Eine Anforderung für Antragsteller 2 ist damit von
derselben Position abgedeckt wie eine für Antragsteller 1. Der Bezug wird gespeichert
und angezeigt — er sagt Jürgen, *wem* die Unterlage gehört —, taugt aber nicht als
Schlüssel. Folge: Verlangt die Bank etwas nur für eine Person, während wir es von
allen einsammeln, gilt das als Treffer. Wir fordern dann mehr an als nötig, nie
weniger — die sichere Richtung.

Regeln:
- `ausgeblendet === true` → wird vollständig übersprungen. Was Jürgen in Europace
  weggeklickt hat, kommt hier nicht zurück.
- `liegtVor === true` → nimmt am Abgleich teil (damit unsere Position nicht
  fälschlich „verlangt die Bank nicht" trägt), erzeugt ohne Gegenstück aber die
  Art `erledigt` statt `neu` — also keine offene Position.
- Positionen ohne Gegenstück verschwinden **nie**, sie bekommen nur den Hinweis.

### Einspeisung in die Checkliste

Vierte Quelle in `src/lib/cases/service.ts` — dieselbe Stelle, an der schon die
gepflegten Bankanforderungen als `extraItems` hineinlaufen. Neue Positionen
entstehen nach dem Muster von `bankRequirementItems()`:

```ts
{
  key: `europace.${bankId ?? "bank"}.${code || slug(text)}`,
  name: kurzbezeichnung || text,
  customerDescription: kurzbezeichnung || text,
  internalDescription: `Anforderung von ${bankName} (Europace).`,
  documentType,            // aus der Zuordnung, ggf. null
  level: "zwingend",
  scope: "bankbezogen",
  platforms: ["europace"],
  bankSpecific: true,
  acceptedFileTypes: ["pdf", "jpg", "png"],
  requiredCount: 1,
}
```

**Nicht kundensichtbar** (`scope: "bankbezogen"`, wie die bestehenden
Bankanforderungen): Banktexte lauten „Nachweis gem. Ziffer 3.2" und taugen nicht für
den Kunden. Jürgen schaltet sie frei, nachdem er sie umformuliert hat.

Positionen mit Gegenstück erzeugen **keine** neue Zeile — sie bekommen nur die
Markierung „auch laut Bank". Das ist der Kern: keine Dubletten.

### Anzeige

Am Fall eine Abgleich-Box:

> **DSL Bank · Antrag 4711 · abgerufen am 10.08.2026**
> 3 Anforderungen der Bank waren bei uns nicht auf dem Schirm ·
> 2 Positionen verlangt diese Bank nicht · 11 decken sich

In der Unterlagenliste trägt jede Position ein Herkunftsabzeichen:
`laut Bank` · `Detektiv` · `Vorlage`. Positionen ohne Gegenstück in der aktiven
Bankliste tragen `verlangt DSL Bank nicht`.

## Ablauf

1. Fall öffnen. Die Aktion erscheint, sobald eine Vorgangsnummer bekannt ist oder
   eingetragen werden kann.
2. **Vorgangsnummer:** aus `PlatformMapping.externalId` (Platform `europace`), wenn
   der Vorgang aus BaufiDesk heraus angelegt wurde. Sonst fragt BaufiDesk **einmal**
   danach und schreibt sie in genau dieses Feld — dadurch profitiert auch die
   bestehende Unterlagen-Übertragung davon.
3. `ladeAuswahl()` zeigt Anträge und Vorschläge. Ist die Liste leer oder unbrauchbar,
   kann die Id von Hand eingetragen werden.
4. Auswahl → `ladeAnforderungen()` → Zuordnung → Speicherung als neuer Abruf.
   Der neue Abruf wird `aktiv`, alle anderen des Falls verlieren das Kennzeichen.
5. Die Checkliste wird beim nächsten Aufbau um die Positionen ergänzt; die
   Abgleich-Box zeigt die drei Zahlen.

Wiederholter Abruf derselben Bank aktualisiert den bestehenden Abruf
(`@@unique([caseId, quelle, bezugsId])`) statt einen zweiten anzulegen.

Jeder Abruf wird als `PlatformSyncLog` protokolliert (`platform: "europace"`,
`direction: "import"` — beides freie Textfelder, kein Enum) — dieselbe Spur wie
beim FinLink-Import.

Der Schlüsselbau nutzt `slug()` aus `src/lib/actions/bank-requirements.ts`. Die
Funktion ist dort heute privat und muss exportiert werden, statt sie ein zweites
Mal zu schreiben: Zwei Schlüsselgeneratoren, die auseinanderlaufen, erzeugen
später Dubletten, die niemand mehr zuordnen kann.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Keine Zugangsdaten | Aktion meldet „Europace-Zugang fehlt" und tut nichts. Kein stiller Fehlschlag. |
| Vorgangsnummer unbekannt | Eingabefeld statt Abbruch. |
| Vorgang existiert nicht (404) | Klartext: „Vorgang … ist in Europace nicht auffindbar." |
| Keine Anforderungen (leere Liste) | Ehrliche Meldung: „Die Bank hat zu diesem Vorgang keine Unterlagen angefordert." — **nicht** als Erfolg mit 0 Zeilen verbuchen. |
| Scope fehlt (403) | Klartext mit Nennung des fehlenden Scopes. |
| Netzfehler / Zeitüberschreitung | Abbruch ohne Teilstand; ein Abruf ist alles-oder-nichts. |

## Tests

- **Zuordnung:** Kategorie → Dokumenttyp inklusive Mehrdeutigkeit und `"Sonstiges"`;
  `bezug` → Antragsteller bei einem, zwei und keinem Treffer.
- **Abgleich:** deckt sich / neu / verlangt die Bank nicht; `ausgeblendet` wird
  übersprungen; `liegtVor` erzeugt keine offene Position; keine Dubletten bei
  gleichem Dokumenttyp und gleichem Antragsteller.
- **Bankwechsel:** Abruf B wird aktiv, Abruf A bleibt bestehen und verliert nur das
  Kennzeichen; keine Zeile verschwindet.
- **Wiederholter Abruf:** derselbe Bezug aktualisiert statt zu verdoppeln.
- **Vertragstest** gegen die eingecheckte OpenAPI-Spezifikation: Unsere Typen für
  `Unterlagenanforderung`, `Antrag` und `Finanzierungsvorschlag` müssen zu den
  Feldern des Schemas passen. Dasselbe Vorgehen, mit dem die bestehende
  Europace-Anbindung abgesichert wurde.
- **Ohne Zugangsdaten:** Die Server Action meldet den fehlenden Zugang, statt zu werfen.
- Datenbanktests laufen über PGlite mit `RUN_DB_IT=1` und erzwingen
  `AI_PROVIDER=mock` per `vi.hoisted`.

Die Schemadateien `swagger.yaml` (Unterlagen-API) und `openapi-v3.json`
(Vorgänge-API) werden nach `src/lib/platforms/europace/schema/` eingecheckt und in
`HERKUNFT.md` mit Quelle und Abrufdatum vermerkt.

## Bewusst nicht enthalten

- **`liegtVor` zurück nach Europace schreiben.** Ausgehender Schreibvorgang, bräuchte
  eigene Freigabe. Erst prüfen, ob die Leserichtung taugt.
- **Automatischer Abruf per Cron.** Die Bank steht erst spät fest; ein Zeitplan hätte
  nichts, woran er sich orientieren könnte.
- **Mehrere Banken gleichzeitig aktiv.** Ein Abruf ist aktiv, die anderen bleiben als
  Verlauf liegen. Paralleles Einreichen bei zwei Banken kommt, wenn es gebraucht wird.
- **Kundensichtbare Texte automatisch erzeugen.** Die Umformulierung der Banktexte
  bleibt Handarbeit.
