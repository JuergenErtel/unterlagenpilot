# Einzelseiten bündeln: aus 30 Fotos werden 4 Dokumente

Stand: 28.08.2026 · Status: Entwurf zur Durchsicht

## Das Problem

Kunden fotografieren. Nicht ein Dokument als PDF, sondern Seite für Seite mit
dem Handy — die Gehaltsabrechnung dreiseitig, der Ausweis vorne und hinten, der
Grundbuchauszug in sechs Bildern. Am Ende liegen dreißig Einzeldateien im Fall,
und keine davon ist ein Dokument.

Für BaufiDesk ist jede dieser Dateien heute ein eigenes Dokument mit eigenem
Typ, eigener Freigabe und eigener Zeile in der Checkliste. Die Folgen ziehen
sich durch das ganze System:

- Die Checkliste sieht sechs Grundbuchauszüge statt einen — und ist trotzdem
  nicht erfüllt, weil auf Seite 4 nichts steht, was nach Grundbuch aussieht.
- Die Feld-Extraktion liest jede Seite für sich. Das Nettoeinkommen, das auf
  Seite 2 der Abrechnung steht, findet niemand, weil Seite 2 als eigenes
  Dokument keinen erkennbaren Typ hat.
- Die Bank bekommt am Ende dreißig Anhänge statt vier.

Das Gegenstück gibt es längst: `src/lib/aufteilung/` erkennt, dass **eine**
Datei **mehrere** Dokumente enthält, und trennt sie auf Klick auf. Hier fehlt
die andere Richtung.

## Was gebaut wird

Nach einem Upload prüft BaufiDesk den **ganzen Fall** darauf, welche
Einzelseiten zusammengehören, und schlägt Bündel vor:

> Aus 12 Einzelseiten könnten 3 Dokumente werden
> · Gehaltsabrechnung 05/2026 — 3 Seiten (IMG_4471, IMG_4473, IMG_4472)
> · Personalausweis — 2 Seiten (IMG_4480, IMG_4481)
> · Grundbuchauszug — 6 Seiten (…)

Je Bündel entscheidet der Vermittler: **Zusammenfügen** oder **Verwerfen**.
Beim Zusammenfügen entsteht ein PDF in der von der KI bestimmten
Seitenreihenfolge; die Einzelbilder bleiben erhalten und gelten als „ersetzt".
Liegt die KI daneben, macht **Rückgängig** den Schritt zurück.

Daneben zwei Wege von Hand: ein Knopf **Erneut prüfen**, der den Lauf neu
anstößt, und **Auswahlkästchen** in der Dokumententabelle — vier Seiten
anhaken, „das ist ein Dokument", ohne KI.

Nicht Teil dieser Arbeit: die Kunden-Upload-Seite. Der Kunde lädt wie bisher
hoch und sieht nichts davon. Gebündelt wird ausschließlich intern.

## Warum fallweit und nicht je Datei

Das ist der entscheidende Unterschied zur Aufteilung. Ein einzelnes Foto sagt
nichts darüber, ob es zu einem anderen gehört — die Frage ist erst
beantwortbar, wenn alle Seiten da sind. Die Erkennung läuft deshalb über den
Fall, nicht über das Dokument.

Damit stellt sich die Frage, **wann**. Drei Wege wurden erwogen:

**Verworfen: nach jedem einzelnen Upload.** Der Sammel-Upload lädt seit dem
Vercel-Body-Limit jede Datei einzeln hoch (`brokerUploadOne`). Ein Lauf je
Datei wären dreißig KI-Aufrufe für eine Antwort. Das Mistral-Konto macht bei 50
Anfragen pro Minute dicht (siehe `mistral-rate-limit-backoff`) — dreißig
parallele Läufe für einen Fall wären fahrlässig.

**Verworfen: am Ende des Upload-Vorgangs.** `finishBrokerUpload` und
`finishCustomerUpload` existieren bereits und werden vom Browser nach der
letzten Datei gerufen — der offensichtliche Ort. Aber zu diesem Zeitpunkt läuft
die OCR der zuletzt hochgeladenen Bilder noch im Hintergrund (`after()`), die
Gruppierung sähe leere Seiten. Man müsste warten oder pollen, und der Weg deckt
FinLink-Zuläufe gar nicht ab.

**Gewählt: wer als Letzter fertig wird, macht das Licht aus.** Am Ende der
Analyse eines Dokuments (`processOcrAndAi`, dort wo heute schon
`erkenneAufteilung` und `reconcileCase` laufen) prüft der Fall: läuft hier noch
eine Analyse? Wenn nein, startet dieses Dokument den fallweiten Bündel-Lauf.
Ergebnis: **ein KI-Aufruf je Upload-Schwung**, gleich ob drei oder dreißig
Seiten, und der Weg gilt für Berater-Upload, Kunden-Magic-Link und FinLink,
ohne dass eine dieser Stellen davon wissen muss.

Zwei Dokumente können gleichzeitig fertig werden und beide „niemand läuft mehr"
sehen. Die Sperre liegt deshalb in der Datenbank, nicht im Speicher:

```ts
const beansprucht = await prisma.case.updateMany({
  where: {
    id: caseId,
    OR: [
      { buendelStatus: { not: "laeuft" } },
      // Haengengebliebene Sperre (Absturz mitten im Lauf) nach zehn Minuten
      // uebernehmen, statt den Fall dauerhaft zu blockieren.
      { buendelStatusAm: { lt: new Date(Date.now() - 10 * 60_000) } },
    ],
  },
  data: { buendelStatus: "laeuft", buendelStatusAm: new Date() },
});
if (beansprucht.count !== 1) return; // ein anderer ist schon dran
```

## Wer Kandidat ist

Ein Dokument des Falls kommt in den Lauf, wenn alles davon gilt:

- **Es ist eine Einzelseite**: MIME-Typ `image/*`, oder `application/pdf` mit
  `pageCount === 1`.
- **Es ist noch offen**: `reviewStatus === "offen"`. Ein freigegebenes Dokument
  wird nicht mehr angefasst — die Freigabe ist eine Entscheidung des
  Vermittlers, und Bündeln würde sie stillschweigend zurücknehmen.
- **Es ist nicht schon gebündelt**: `zusammengefuegtInId === null`.
- **Es hat lesbaren Text**: `ocrStatus === "fertig"` und `readable !== false`.
  Ein Foto ohne erkannten Text kann die KI nicht einordnen; es bleibt liegen
  und trägt weiter sein Abzeichen „Kein lesbarer Text".

Unter zwei Kandidaten lohnt der Lauf nicht. Zwei genügen aber: Vorder- und
Rückseite eines Ausweises sind schon ein Bündel.

## Der Vertrag mit der KI

Die KI bekommt je Kandidat eine laufende Nummer (nicht die Dokument-ID — sie
kostet Tokens und verleitet zum Erfinden), den Dateinamen, die Uploadzeit, den
bereits erkannten Typ und Zeitraum, einen Hinweis auf einen gefundenen
Seitenzähler (`SEITEN_MUSTER` aus `src/lib/detektiv/completeness.ts`) und die
ersten 400 Zeichen des OCR-Textes.

```ts
export const buendelSchema = z.object({
  titel: z.string().min(1),
  // Wie in src/lib/aufteilung/schema.ts: Zod will ein veraenderliches
  // [string, ...string[]], DOCUMENT_TYPES ist `as const`.
  vermuteterTyp: z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]).nullable(),
  confidence: z.number().min(0).max(1),
  /** Laufende Nummern der Kandidaten IN DER GEWÜNSCHTEN SEITENREIHENFOLGE. */
  seiten: z.array(z.number().int().nonnegative()).min(2),
});

export const buendelungSchema = z.object({ buendel: z.array(buendelSchema) });
```

Die Reihenfolge im Array **ist** die Seitenreihenfolge im späteren PDF. Die KI
darf inhaltlich sortieren — „Seite 2 von 4", ein angefangener Satz, ein Datum —
und nicht nach Dateinamen, denn genau die stimmen bei Handyfotos nicht.

Wie bei der Aufteilung entscheidet nicht der Prompt, ob aus einem Vorschlag ein
Vorschlag wird, sondern eine Prüffunktion (`pruefeBuendel`, Vorbild
`src/lib/aufteilung/pruefung.ts`):

1. **Jede Nummer existiert** und liegt im Kandidatenbereich. Erfundene Seiten
   verwerfen das Bündel.
2. **Keine Seite in zwei Bündeln.** Sonst entstünde dieselbe Seite zweimal.
3. **Keine Seite doppelt im selben Bündel.**
4. **Mindestens zwei Seiten** — ein Ein-Seiten-Bündel ist nichts zum
   Zusammenfügen.
5. **Kein Zeitraum-Konflikt**: Tragen zwei Seiten desselben Bündels einen
   erkannten `period` und sind diese verschieden, wird das Bündel verworfen.
   Das ist die wichtigste Sperre. Ohne sie verschmelzen Gehaltsabrechnung Mai
   und Juni zu einem Dokument, die Checkliste meldet Grün, und die fehlende
   dritte Abrechnung fällt erst der Bank auf.

Ein einzelnes verworfenes Bündel kippt nicht den ganzen Lauf — die übrigen
bleiben stehen. Und **Seiten, die zu keinem Bündel gehören, bleiben einfach
einzeln liegen.** Das ist der zweite Unterschied zur Aufteilung, die lückenlos
sein muss: hier ist Nichtzuordnung der Normalfall, kein Fehler.

## Was der Vermittler sieht

Über der Dokumententabelle in der Fallakte (`src/app/(app)/cases/[id]/page.tsx`,
Reiter „Unterlagen") eine Karte im Ton der bestehenden
`AufteilungVorschlag`-Karte, aber fallweit statt je Zeile:

- Überschrift mit der Zahl: „Aus 12 Einzelseiten könnten 3 Dokumente werden".
- Je Bündel eine Zeile: Titel, Seitenzahl, die beteiligten Dateinamen **in der
  vorgeschlagenen Reihenfolge**, damit vor dem Klick sichtbar ist, was
  entsteht.
- Je Bündel eigene Knöpfe **Zusammenfügen** und **Verwerfen**. Bewusst nicht
  alles oder nichts: ein Bündel kann richtig und das nächste falsch sein.

Dazu ein Knopf **Erneut prüfen**, der denselben Lauf noch einmal anstößt — für
den Fall, dass ein Vorschlag verworfen wurde, Seiten nachkamen oder die
Erkennung nichts fand.

Unterschieden wird über `Case.buendelStatus`, nach der Hausregel, dass „noch
nicht geprüft" und „nichts gefunden" nie gleich aussehen dürfen:

| Status       | Anzeige                                                    |
|--------------|------------------------------------------------------------|
| `ausstehend` | Karte erscheint nicht                                       |
| `laeuft`     | „Einzelseiten werden geprüft …"                             |
| `fertig`, 0  | Kein Vorschlag; der Knopf „Erneut prüfen" bleibt erreichbar |
| `fertig`, >0 | Die Vorschlagskarte                                         |
| `fehler`     | „Prüfung fehlgeschlagen — erneut versuchen"                 |

## Von Hand: Auswahlkästchen

Der Notausgang, wenn die KI danebenliegt. In der Dokumententabelle bekommt jede
Zeile, die Kandidat wäre, ein Auswahlkästchen. Sind zwei oder mehr angehakt,
erscheint über der Tabelle eine Leiste: „3 Seiten ausgewählt — als ein Dokument
zusammenfügen". Die Reihenfolge ist dann die der Tabelle (Uploadzeit); ein
Titel wird aus dem erkannten Typ der ersten Seite abgeleitet, sonst
„Zusammengefügtes Dokument".

Der Auswahlzustand lebt in einer Client-Komponente um die Tabelle herum. Er
wird bewusst **nicht** gespeichert: eine halb angehakte Auswahl, die einen
Seitenwechsel überlebt, ist eine Falle, keine Hilfe.

Dieser Weg ruft dieselbe Zusammenfüge-Funktion wie der KI-Vorschlag, nur mit
einer von Hand gebauten Seitenliste — kein zweiter Pfad, der auseinanderlaufen
kann.

## Zusammenfügen

`fuegeZusammen(caseId, organizationId, seiten: DokumentId[], titel)` in
`src/lib/buendelung/service.ts`, gebaut nach dem Vorbild von `teileAuf`:

1. **Prüfen**: Alle Dokumente gehören zum Fall und zur Organisation, sind
   Kandidaten, mindestens zwei. Sonst ein Klartext-Grund zurück, nichts
   verändert.
2. **PDF bauen** mit `pdf-lib`:
   - Bild (`image/jpeg`, `image/png`): `embedJpg` / `embedPng`, eine Seite in
     A4 (595 × 842 pt), bei querformatigem Bild A4 quer. Das Bild wird
     proportional eingepasst und zentriert. Banken erwarten A4-Seiten, keine
     Fotoformate.
   - Einseitiges PDF: `copyPages` — die Seite wird unverändert übernommen,
     keine Neuberechnung, kein Qualitätsverlust.
3. **Alles oder nichts**: Erst wird die fertige Datei abgelegt, dann erst
   entstehen die Datensätze. Scheitert das Ablegen, wird das bereits
   geschriebene Objekt wieder entfernt; der Fall bleibt exakt wie er war.
   Dieselbe Regel wie beim Auftrennen — ein halb zusammengefügtes Dokument wäre
   schlimmer als gar keines.
4. **Datensätze** in einer Transaktion:
   - Neues `Document`: `mimeType: "application/pdf"`, `pageCount` = Anzahl
     Seiten, `uploadSource` und Scan-Status von der ersten Quelle übernommen
     (dieselben Bytes wurden bereits geprüft — **kein zweiter Virenscan**),
     `documentType` = vermuteter Typ, `applicantId` von der ersten Quelle,
     `splitStatus: "fertig"`.
   - Die Quellen: `zusammengefuegtInId` auf das neue Dokument,
     `reviewStatus: "ersetzt"`. **Nichts wird gelöscht** — weder Datensatz noch
     Datei. Das ist die Grundlage für „Rückgängig".
   - Der Vorschlag (`DocumentBuendel` + Seiten) wird entfernt.
5. **Analyse im Hintergrund**: `after(() => analysiereDokument(neuId))`. Das
   neue PDF bekommt dieselbe Behandlung wie ein normaler Upload — Typ, Felder,
   Antragsteller-Zuordnung, Detektiv. Scheitert nur die Einplanung, kippt das
   den bereits festgeschriebenen Erfolg nicht.

### Die Schlange, die sich in den Schwanz beißt

`analysiereDokument` ruft am Ende `erkenneAufteilung` — und die sähe ein
sechsseitiges PDF und schlüge vor, es wieder zu zerlegen. `erkenneAufteilung`
bekommt deshalb eine Ausnahme: Dokumente mit Quellseiten
(`quellseiten.length > 0`) werden nicht auf Aufteilung geprüft und direkt auf
`splitStatus: "fertig"` gesetzt.

Ebenso darf ein zusammengefügtes Dokument nie wieder Kandidat einer Bündelung
werden — das ist durch `pageCount > 1` schon ausgeschlossen.

## Rückgängig

Weil die Entscheidung eine Liste ist und kein Drag & Drop, braucht sie ein
Sicherheitsnetz. Am zusammengefügten Dokument steht **Rückgängig**, solange es
noch nicht freigegeben ist:

- Das erzeugte PDF wird aus Speicher und Datenbank entfernt.
- Die Quellseiten gehen zurück auf `reviewStatus: "offen"`,
  `zusammengefuegtInId: null`.
- `Case.buendelStatus` geht auf `ausstehend`. Ein Lauf startet damit nicht von
  selbst; er kommt beim nächsten Upload oder auf „Erneut prüfen". Automatisch
  neu zu gruppieren wäre falsch: die KI käme mit hoher Wahrscheinlichkeit auf
  denselben Vorschlag, den der Vermittler gerade zurückgenommen hat.

Nach der Freigabe verschwindet der Knopf. Wer freigegeben hat, hat entschieden;
der Weg zurück führt dann über die vorhandene Wiedereröffnung.

## Datenmodell

```prisma
/// Vorschlag, mehrere Einzelseiten eines Falls zu einem Dokument zu
/// verbinden. Lebt nur bis zur Entscheidung: zusammengefügt oder verworfen.
model DocumentBuendel {
  id     String @id @default(cuid())
  caseId String
  case   Case   @relation(fields: [caseId], references: [id], onDelete: Cascade)

  reihenfolge   Int
  titel         String
  vermuteterTyp DocumentType?
  confidence    Float?

  createdAt DateTime               @default(now())
  seiten    DocumentBuendelSeite[]

  @@index([caseId])
  @@map("document_buendel")
}

/// Eine Seite in einem Bündelvorschlag. `position` ist die Reihenfolge im
/// späteren PDF – nicht die Uploadreihenfolge.
model DocumentBuendelSeite {
  id         String          @id @default(cuid())
  buendelId  String
  buendel    DocumentBuendel @relation(fields: [buendelId], references: [id], onDelete: Cascade)
  documentId String
  document   Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)

  position Int

  @@unique([buendelId, documentId])
  @@index([documentId])
  @@map("document_buendel_seiten")
}
```

Am `Case`:

```prisma
  /// Lauf der Einzelseiten-Erkennung. Eigener Status, damit "nicht geprueft"
  /// und "nichts gefunden" unterscheidbar bleiben – und als Sperre, damit
  /// nicht zwei gleichzeitig fertige Dokumente denselben Lauf starten.
  buendelStatus ProcessingStatus @default(ausstehend)
  /// Beginn des laufenden bzw. Ende des letzten Laufs. Ohne diesen Zeitstempel
  /// laesst sich eine haengende Sperre nicht von einem echten Lauf
  /// unterscheiden.
  buendelStatusAm DateTime?
  buendel         DocumentBuendel[]
```

Am `Document`, als Spiegel des vorhandenen `aufgeteiltAusId`:

```prisma
  /// Zieldokument, falls diese Seite in ein Bündel eingegangen ist.
  zusammengefuegtInId String?
  zusammengefuegtIn   Document?  @relation("Buendelung", fields: [zusammengefuegtInId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  quellseiten         Document[] @relation("Buendelung")
  buendelSeiten       DocumentBuendelSeite[]
```

Die Schemaänderung geht über `scripts/supabase-sql.sh` gegen die
Produktionsdatenbank — **nie** über den vollen `migrate diff`, der räumt Dinge
ab, die absichtlich dort stehen.

## Aufbau der Dateien

```
src/lib/buendelung/
  types.ts       Kandidat, BuendelVorschlag, MIN_KANDIDATEN
  schema.ts      Zod-Vertrag mit der KI
  pruefung.ts    pruefeBuendel() – die fünf Regeln, ohne Datenbank
  kandidaten.ts  waehleKandidaten() – wer in den Lauf kommt, ohne Datenbank
  service.ts     erkenneBuendel(caseId), fuegeZusammen(...), macheRueckgaengig(...)
src/lib/actions/buendelung.ts   Server-Actions (Zusammenfügen, Verwerfen, Erneut prüfen, Rückgängig, Auswahl)
src/components/case/buendel-vorschlag.tsx   Die Vorschlagskarte
src/components/case/seiten-auswahl.tsx      Auswahlkästchen + Leiste
```

`pruefung.ts` und `kandidaten.ts` sind bewusst reine Funktionen ohne Datenbank
und ohne KI — dort sitzen die Regeln, die falsches Grün verhindern, und die
müssen einzeln prüfbar sein.

In `src/lib/ai/service.ts` kommt eine Methode `gruppiereEinzelseiten()` dazu,
in `src/lib/ai/mock-provider.ts` ein Fall für den Schlüssel `buendelung`.

## Fehler und ihre Sichtbarkeit

- **Der KI-Lauf scheitert.** `buendelStatus: "fehler"`, die Karte sagt es, der
  Knopf „Erneut prüfen" bleibt. Der Lauf ist gekapselt und darf weder OCR noch
  Extraktion noch den Detektiv mitreißen — wie `erkenneAufteilung`, das nie
  wirft.
- **Die KI liefert Unsinn.** `pruefeBuendel` verwirft das betroffene Bündel;
  die übrigen bleiben. Bleibt keines, ist das `fertig` mit null Vorschlägen,
  kein Fehler.
- **Das PDF lässt sich nicht bauen** (defektes Bild): abgelegte Bytes werden
  entfernt, Klartext-Grund an die Oberfläche, Fall unverändert.
- **Der Sperr-Zugriff kollidiert.** Der zweite Läufer kehrt still um. Bleibt
  ein Lauf auf `laeuft` hängen (Absturz mitten im KI-Aufruf), übernimmt ihn der
  nächste Lauf, sobald `buendelStatusAm` älter als zehn Minuten ist — sonst
  wäre der Fall dauerhaft blockiert und niemand sähe warum.

## Tests

Reine Funktionen, ohne Datenbank:

- `pruefeBuendel`: Seite in zwei Bündeln, Seite doppelt im selben Bündel,
  erfundene Nummer, Ein-Seiten-Bündel, **Zeitraum-Konflikt** (Mai + Juni), und
  der gute Fall, der stehen bleibt, während ein Nachbarbündel verworfen wird.
- `waehleKandidaten`: mehrseitiges PDF fliegt raus, freigegebenes Dokument
  fliegt raus, `readable === false` fliegt raus, bereits gebündeltes fliegt
  raus, ein einzelner Kandidat ergibt keinen Lauf.

Mit Datenbank (`AI_PROVIDER=mock` per `vi.hoisted` erzwingen — sonst greift ein
Test nach der echten KI):

- `fuegeZusammen` aus zwei JPEGs: ein PDF mit zwei Seiten entsteht, die Quellen
  stehen auf „ersetzt" und zeigen auf das neue Dokument, die Dateien liegen
  noch im Speicher.
- Gemischt Bild + einseitiges PDF.
- Scheitert eine Seite, entsteht **kein** Dokument und **kein** Objekt bleibt
  im Speicher liegen.
- `macheRueckgaengig` stellt exakt den Ausgangszustand her.
- `erkenneAufteilung` lässt ein zusammengefügtes Dokument in Ruhe.
- Die Sperre: zwei gleichzeitige `erkenneBuendel` ergeben einen KI-Aufruf.

## Was bewusst nicht gebaut wird

- **Drag & Drop zum Umsortieren.** Der teure Teil. Auswahlkästchen plus
  Rückgängig decken denselben Notfall ab; wenn sich im Alltag zeigt, dass die
  Reihenfolge innerhalb eines Bündels regelmäßig falsch ist, kommt es als
  eigener Schritt.
- **Vorschaubilder in der Vorschlagskarte.** Dateinamen und Titel reichen für
  die Entscheidung. Miniaturen bedeuten Bildskalierung auf dem Server und einen
  weiteren geschützten Auslieferungsweg.
- **Etwas auf der Kunden-Upload-Seite.** Bewusst unsichtbar für den Kunden.
- **Zusammenfügen über Fallgrenzen hinweg.** Gibt es nicht und soll es nicht
  geben.
