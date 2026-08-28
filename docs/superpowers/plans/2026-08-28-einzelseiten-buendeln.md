# Einzelseiten bündeln — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dreißig einzeln fotografierten Seiten eines Falls schlägt BaufiDesk Bündel vor und macht auf Klick je Bündel ein PDF daraus.

**Architecture:** Ein fallweiter KI-Lauf, angestoßen am Ende der Dokumentanalyse nach dem Prinzip „wer als Letzter fertig wird, macht das Licht aus" und abgesichert durch eine Sperre in der Datenbank. Die KI schlägt Gruppen samt Seitenreihenfolge vor; ob daraus ein Vorschlag wird, entscheiden reine Prüffunktionen ohne Datenbank. Zusammengefügt wird nur auf Klick, alles oder nichts, und jeder Schritt ist rückgängig zu machen.

**Tech Stack:** Next.js App Router (Server Actions, `after()`), Prisma/PostgreSQL, `pdf-lib` zum Bauen der PDFs, Mistral über `AIService`, Vitest (+ PGlite für DB-Tests), Tailwind/shadcn-Komponenten.

**Spec:** `docs/superpowers/specs/2026-08-28-einzelseiten-buendeln-design.md`

## Global Constraints

- **Sprache:** Alle Bezeichner, Kommentare und Oberflächentexte auf Deutsch, wie im ganzen Projekt. Kommentare erklären das *Warum*, nicht das *Was*.
- **Umlaute in Code-Bezeichnern vermeiden** (`buendel`, nicht `bündel`) — Oberflächentexte natürlich mit Umlauten.
- **Nie automatisch versenden oder verändern.** Jede Zusammenführung erfolgt auf Klick des Vermittlers, nie automatisch.
- **„Nicht geprüft" und „nichts gefunden" dürfen nie gleich aussehen.** Dafür `Case.buendelStatus`.
- **Schemaänderungen gegen die Produktionsdatenbank ausschließlich über `scripts/supabase-sql.sh <datei.sql>`.** NIE `prisma migrate diff` in voller Breite anwenden und NIE `prisma db push` gegen Produktion — beide räumen ab, was absichtlich dort steht.
- **DB-Tests müssen `AI_PROVIDER=mock` und `STORAGE_PROVIDER=local` per `vi.hoisted()` erzwingen**, bevor irgendein Import greift; sonst greift ein Test nach der echten Mistral-API.
- **Ein KI-Aufruf je Lauf.** Das Mistral-Konto macht bei 50 Anfragen/Minute dicht.
- **Kein zweiter Virenscan** für Bytes, die bereits geprüft wurden.
- **Nichts löschen.** Quellseiten werden auf `reviewStatus: "ersetzt"` gesetzt, Datei und Datensatz bleiben.
- **Testbefehle:** `npm test` (ohne DB), `RUN_DB_IT=1 npx vitest run tests/<datei>` (mit PGlite), `npm run typecheck`, `npm run lint`.

---

## Dateiübersicht

| Datei | Verantwortung |
|---|---|
| `prisma/schema.prisma` | `DocumentBuendel`, `DocumentBuendelSeite`, `Case.buendelStatus` + `buendelStatusAm`, `Document.zusammengefuegtInId` |
| `sql/2026-08-28-buendelung.sql` | Dieselbe Änderung als SQL für die Produktionsdatenbank |
| `src/lib/buendelung/types.ts` | `Kandidat`, `BuendelVorschlag`, `MIN_KANDIDATEN` |
| `src/lib/buendelung/kandidaten.ts` | `waehleKandidaten()` — wer in den Lauf kommt. Rein, ohne DB. |
| `src/lib/buendelung/pruefung.ts` | `pruefeBuendel()` — die fünf Regeln. Rein, ohne DB. |
| `src/lib/buendelung/schema.ts` | Zod-Vertrag mit der KI |
| `src/lib/buendelung/service.ts` | `erkenneBuendel()`, `fuegeZusammen()`, `macheRueckgaengig()` |
| `src/lib/buendelung/pdf.ts` | `baueBuendelPdf()` — Bilder und einseitige PDFs zu einem PDF |
| `src/lib/ai/service.ts` | `gruppiereEinzelseiten()` |
| `src/lib/ai/mock-provider.ts` | Fall `buendelung` |
| `src/lib/documents/pipeline.ts` | Anstoß des fallweiten Laufs am Ende der Analyse |
| `src/lib/aufteilung/service.ts` | Ausnahme: zusammengefügte Dokumente nicht auf Aufteilung prüfen |
| `src/lib/actions/buendelung.ts` | Server-Actions |
| `src/components/case/buendel-vorschlag.tsx` | Die Vorschlagskarte |
| `src/components/case/seiten-auswahl.tsx` | Auswahlkästchen + Leiste |
| `src/components/case/buendel-rueckgaengig.tsx` | „Rückgängig" an der Dokumentzeile |
| `src/app/(app)/cases/[id]/page.tsx` | Laden und Einbinden |

---

## Task 1: Datenmodell

**Files:**
- Modify: `prisma/schema.prisma` (Model `Case` ~Zeile 300, Model `Document` ~Zeile 857–937, neue Modelle hinter `DocumentSplitSegment` ~Zeile 1719)
- Create: `sql/2026-08-28-buendelung.sql`
- Test: `tests/buendelung-schema-db.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: Prisma-Modelle `DocumentBuendel` (Felder `id`, `caseId`, `reihenfolge`, `titel`, `vermuteterTyp`, `confidence`, `createdAt`, Relation `seiten`), `DocumentBuendelSeite` (`id`, `buendelId`, `documentId`, `position`); `Case.buendelStatus: ProcessingStatus`, `Case.buendelStatusAm: Date | null`; `Document.zusammengefuegtInId: string | null`, Relation `zusammengefuegtIn` / `quellseiten` / `buendelSeiten`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-schema-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock-Provider und lokalen Speicher erzwingen, BEVOR ein Import greift.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündelung: Datenmodell (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let orgId: string;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-schema" } });
    orgId = org.id;
    const c = await prisma.case.create({ data: { organizationId: orgId, caseNumber: "UP-TEST-B001" } });
    caseId = c.id;
  }, 180_000);

  const seiteAnlegen = async (name: string) =>
    prisma.document.create({
      data: {
        caseId,
        originalName: name,
        storageKey: `t/${name}`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadSource: "kunde",
        pageCount: 1,
        scanStatus: "virus_scan_clean",
      },
    });

  it("ein neuer Fall ist noch nicht auf Bündel geprüft", async () => {
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // "ausstehend" heisst NICHT "nichts gefunden" - der Unterschied ist der
    // ganze Zweck des eigenen Status.
    expect(c.buendelStatus).toBe("ausstehend");
    expect(c.buendelStatusAm).toBeNull();
  });

  it("ein Bündelvorschlag haelt seine Seiten in Reihenfolge", async () => {
    const a = await seiteAnlegen("a.jpg");
    const b = await seiteAnlegen("b.jpg");
    const buendel = await prisma.documentBuendel.create({
      data: {
        caseId,
        reihenfolge: 0,
        titel: "Gehaltsabrechnung 05/2026",
        vermuteterTyp: "gehaltsabrechnung",
        confidence: 0.9,
        seiten: { create: [{ documentId: b.id, position: 0 }, { documentId: a.id, position: 1 }] },
      },
      include: { seiten: { orderBy: { position: "asc" } } },
    });
    // b vor a: die Reihenfolge kommt aus der KI, nicht aus der Uploadzeit.
    expect(buendel.seiten.map((s: any) => s.documentId)).toEqual([b.id, a.id]);
  });

  it("dieselbe Seite kann nicht zweimal im selben Bündel stehen", async () => {
    const a = await seiteAnlegen("c.jpg");
    const buendel = await prisma.documentBuendel.create({
      data: { caseId, reihenfolge: 1, titel: "X", seiten: { create: [{ documentId: a.id, position: 0 }] } },
    });
    await expect(
      prisma.documentBuendelSeite.create({ data: { buendelId: buendel.id, documentId: a.id, position: 1 } })
    ).rejects.toThrow();
  });

  it("eine Quellseite zeigt auf ihr Zieldokument", async () => {
    const quelle = await seiteAnlegen("d.jpg");
    const ziel = await prisma.document.create({
      data: {
        caseId,
        originalName: "gebuendelt.pdf",
        storageKey: "t/gebuendelt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 200,
        uploadSource: "kunde",
        pageCount: 2,
        scanStatus: "virus_scan_clean",
      },
    });
    await prisma.document.update({
      where: { id: quelle.id },
      data: { zusammengefuegtInId: ziel.id, reviewStatus: "ersetzt" },
    });
    const mitQuellen = await prisma.document.findUnique({
      where: { id: ziel.id },
      include: { quellseiten: true },
    });
    expect(mitQuellen.quellseiten).toHaveLength(1);
    expect(mitQuellen.quellseiten[0].id).toBe(quelle.id);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-schema-db.test.ts`
Expected: FAIL — `prisma.documentBuendel is undefined` bzw. unbekannte Spalte `buendelStatus`.

- [ ] **Step 3: Prisma-Schema erweitern**

In `prisma/schema.prisma`, Model `Case`, bei den übrigen Statusfeldern ergänzen:

```prisma
  /// Lauf der Einzelseiten-Erkennung. Eigener Status, damit "nicht geprueft"
  /// und "nichts gefunden" unterscheidbar bleiben - und als Sperre, damit
  /// nicht zwei gleichzeitig fertige Dokumente denselben Lauf starten.
  buendelStatus   ProcessingStatus  @default(ausstehend)
  /// Beginn des laufenden bzw. Ende des letzten Laufs. Ohne diesen Zeitstempel
  /// laesst sich eine haengende Sperre nicht von einem echten Lauf
  /// unterscheiden.
  buendelStatusAm DateTime?
  buendel         DocumentBuendel[]
```

In Model `Document`, direkt unter dem vorhandenen Block `aufgeteiltAusId` / `aufgeteiltAus` / `teildokumente`:

```prisma
  /// Zieldokument, falls diese Seite in ein Buendel eingegangen ist. Spiegel
  /// zu aufgeteiltAusId: dort wurde eine Datei zu vielen, hier werden viele zu
  /// einer.
  zusammengefuegtInId String?
  zusammengefuegtIn   Document?              @relation("Buendelung", fields: [zusammengefuegtInId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  quellseiten         Document[]             @relation("Buendelung")
  buendelSeiten       DocumentBuendelSeite[]
```

Hinter Model `DocumentSplitSegment` neu:

```prisma
/**
 * Vorschlag, mehrere Einzelseiten eines Falls zu einem Dokument zu verbinden.
 * Lebt nur bis zur Entscheidung: zusammengefuegt oder verworfen.
 */
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

/**
 * Eine Seite in einem Buendelvorschlag. `position` ist die Reihenfolge im
 * spaeteren PDF - nicht die Uploadreihenfolge.
 */
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

- [ ] **Step 4: Prisma-Client neu erzeugen und Test laufen lassen**

Run: `npm run db:generate && RUN_DB_IT=1 npx vitest run tests/buendelung-schema-db.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 5: SQL für die Produktionsdatenbank schreiben**

Erstelle `sql/2026-08-28-buendelung.sql`:

```sql
-- Einzelseiten buendeln: Vorschlagstabellen, Lauf-Status am Fall und der
-- Rueckverweis von der Quellseite auf das zusammengefuegte Dokument.
-- Ausfuehren mit: scripts/supabase-sql.sh sql/2026-08-28-buendelung.sql
-- Bewusst additiv und idempotent - kein DROP, nichts wird abgeraeumt.

ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "buendelStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend',
  ADD COLUMN IF NOT EXISTS "buendelStatusAm" TIMESTAMP(3);

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "zusammengefuegtInId" TEXT;

CREATE TABLE IF NOT EXISTS "document_buendel" (
  "id"            TEXT NOT NULL,
  "caseId"        TEXT NOT NULL,
  "reihenfolge"   INTEGER NOT NULL,
  "titel"         TEXT NOT NULL,
  "vermuteterTyp" "DocumentType",
  "confidence"    DOUBLE PRECISION,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_buendel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_buendel_seiten" (
  "id"         TEXT NOT NULL,
  "buendelId"  TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "position"   INTEGER NOT NULL,
  CONSTRAINT "document_buendel_seiten_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_buendel_caseId_idx" ON "document_buendel"("caseId");
CREATE INDEX IF NOT EXISTS "document_buendel_seiten_documentId_idx" ON "document_buendel_seiten"("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "document_buendel_seiten_buendelId_documentId_key"
  ON "document_buendel_seiten"("buendelId", "documentId");

-- Fremdschluessel nur anlegen, wenn sie fehlen: das Skript soll gefahrlos ein
-- zweites Mal laufen koennen.
DO $$ BEGIN
  ALTER TABLE "document_buendel"
    ADD CONSTRAINT "document_buendel_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_buendel_seiten"
    ADD CONSTRAINT "document_buendel_seiten_buendelId_fkey"
    FOREIGN KEY ("buendelId") REFERENCES "document_buendel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_buendel_seiten"
    ADD CONSTRAINT "document_buendel_seiten_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_zusammengefuegtInId_fkey"
    FOREIGN KEY ("zusammengefuegtInId") REFERENCES "documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 6: SQL trocken gegenprüfen**

Run: `scripts/supabase-sql.sh sql/2026-08-28-buendelung.sql --dry-run`
Expected: Zeigt die Anweisungen, führt nichts aus. Die Ausführung gegen Produktion erfolgt erst in Task 13.

- [ ] **Step 7: Typecheck und Commit**

```bash
npm run typecheck
git add prisma/schema.prisma sql/2026-08-28-buendelung.sql tests/buendelung-schema-db.test.ts
git commit -m "feat(buendelung): Datenmodell fuer Buendelvorschlaege und ihre Herkunft"
```

---

## Task 2: Wer Kandidat ist

**Files:**
- Create: `src/lib/buendelung/types.ts`
- Create: `src/lib/buendelung/kandidaten.ts`
- Test: `tests/buendelung-kandidaten.test.ts`

**Interfaces:**
- Consumes: `DocumentType` aus `@/lib/domain/enums`
- Produces:
  - `interface Kandidat { id: string; originalName: string; mimeType: string; pageCount: number | null; reviewStatus: string; ocrStatus: string; readable: boolean | null; zusammengefuegtInId: string | null; documentType: DocumentType | null; period: string | null; createdAt: Date; text: string }`
  - `MIN_KANDIDATEN = 2`, `TEXT_ANFANG = 400`
  - `waehleKandidaten(docs: Kandidat[]): Kandidat[]`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-kandidaten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { waehleKandidaten, type Kandidat } from "@/lib/buendelung/kandidaten";

function k(over: Partial<Kandidat> = {}): Kandidat {
  return {
    id: "d1",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    pageCount: 1,
    reviewStatus: "offen",
    ocrStatus: "fertig",
    readable: true,
    zusammengefuegtInId: null,
    documentType: null,
    period: null,
    createdAt: new Date("2026-08-28T10:00:00Z"),
    text: "Gehaltsabrechnung Mai 2026",
    ...over,
  };
}

describe("waehleKandidaten", () => {
  it("nimmt zwei Fotos", () => {
    expect(waehleKandidaten([k({ id: "a" }), k({ id: "b" })]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("nimmt ein einseitiges PDF", () => {
    const kandidaten = waehleKandidaten([
      k({ id: "a" }),
      k({ id: "b", mimeType: "application/pdf", originalName: "scan.pdf" }),
    ]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst ein mehrseitiges PDF liegen - das ist bereits ein Dokument", () => {
    const kandidaten = waehleKandidaten([
      k({ id: "a" }),
      k({ id: "b" }),
      k({ id: "c", mimeType: "application/pdf", pageCount: 6 }),
    ]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("fasst ein freigegebenes Dokument nicht an", () => {
    // Die Freigabe ist eine Entscheidung des Vermittlers. Buendeln wuerde sie
    // stillschweigend zuruecknehmen.
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", reviewStatus: "akzeptiert" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine Seite ohne lesbaren Text liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", readable: false })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine Seite mit unfertiger Texterkennung liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", ocrStatus: "laeuft" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("laesst eine bereits gebuendelte Seite liegen", () => {
    const kandidaten = waehleKandidaten([k({ id: "a" }), k({ id: "b" }), k({ id: "c", zusammengefuegtInId: "z1" })]);
    expect(kandidaten.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("ein einzelner Kandidat ergibt keinen Lauf", () => {
    expect(waehleKandidaten([k({ id: "a" }), k({ id: "b", reviewStatus: "akzeptiert" })])).toEqual([]);
  });

  it("sortiert nach Uploadzeit - das ist die Ausgangsordnung, die die KI umstellen darf", () => {
    const spaet = k({ id: "spaet", createdAt: new Date("2026-08-28T12:00:00Z") });
    const frueh = k({ id: "frueh", createdAt: new Date("2026-08-28T09:00:00Z") });
    expect(waehleKandidaten([spaet, frueh]).map((x) => x.id)).toEqual(["frueh", "spaet"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/buendelung-kandidaten.test.ts`
Expected: FAIL — `Cannot find module '@/lib/buendelung/kandidaten'`

- [ ] **Step 3: Die Typen schreiben**

Erstelle `src/lib/buendelung/types.ts`:

```ts
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Ein von der KI vorgeschlagenes Buendel. `seiten` sind laufende Nummern in
 * die Kandidatenliste - IN DER GEWUENSCHTEN SEITENREIHENFOLGE. Die Reihenfolge
 * im Array ist die Reihenfolge im spaeteren PDF.
 */
export interface BuendelVorschlag {
  titel: string;
  vermuteterTyp: DocumentType | null;
  confidence: number;
  seiten: number[];
}

/** Unter zwei Seiten gibt es nichts zusammenzufuegen. */
export const MIN_KANDIDATEN = 2;

/** So viel Text bekommt die KI je Seite. Mehr kostet Tokens ohne Mehrwert. */
export const TEXT_ANFANG = 400;
```

- [ ] **Step 4: Die Kandidatenauswahl schreiben**

Erstelle `src/lib/buendelung/kandidaten.ts`:

```ts
import type { DocumentType } from "@/lib/domain/enums";
import { MIN_KANDIDATEN } from "./types";

/**
 * Ein Dokument, so wie die Buendelung es sieht. Bewusst als schlichte Struktur
 * und nicht als Prisma-Typ: die Auswahlregeln sollen ohne Datenbank pruefbar
 * sein, denn sie sind die Stelle, an der falsches Gruen entsteht.
 */
export interface Kandidat {
  id: string;
  originalName: string;
  mimeType: string;
  pageCount: number | null;
  reviewStatus: string;
  ocrStatus: string;
  readable: boolean | null;
  zusammengefuegtInId: string | null;
  documentType: DocumentType | null;
  period: string | null;
  createdAt: Date;
  /** Anfang des OCR-Textes, bereits gekuerzt. */
  text: string;
}

/** Ist das ueberhaupt eine EINZELNE Seite? */
function istEinzelseite(d: Kandidat): boolean {
  if (d.mimeType.startsWith("image/")) return true;
  // Ein mehrseitiges PDF ist bereits ein Dokument. Es zu buendeln hiesse, ein
  // Dokument in ein anderes zu schieben - dafuer gibt es die Aufteilung, nicht
  // dies hier.
  return d.mimeType === "application/pdf" && d.pageCount === 1;
}

/**
 * Welche Dokumente eines Falls in den Buendel-Lauf gehen.
 *
 * Rein und ohne Datenbank, damit jede einzelne Regel pruefbar bleibt. Unter
 * `MIN_KANDIDATEN` gibt es nichts zu tun - dann ist die Rueckgabe leer und der
 * Aufrufer spart sich den KI-Aufruf.
 */
export function waehleKandidaten(docs: Kandidat[]): Kandidat[] {
  const treffer = docs.filter(
    (d) =>
      istEinzelseite(d) &&
      // Eine Freigabe ist eine Entscheidung des Vermittlers; buendeln wuerde
      // sie stillschweigend zuruecknehmen.
      d.reviewStatus === "offen" &&
      d.zusammengefuegtInId === null &&
      d.ocrStatus === "fertig" &&
      // Ohne erkannten Text kann die KI nichts einordnen. Die Seite bleibt
      // liegen und traegt weiter ihr Abzeichen "Kein lesbarer Text".
      d.readable !== false
  );
  if (treffer.length < MIN_KANDIDATEN) return [];
  return treffer.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
```

- [ ] **Step 5: Test laufen lassen**

Run: `npx vitest run tests/buendelung-kandidaten.test.ts`
Expected: PASS (9 Tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/buendelung/types.ts src/lib/buendelung/kandidaten.ts tests/buendelung-kandidaten.test.ts
git commit -m "feat(buendelung): wer als Einzelseite in den Lauf geht"
```

---

## Task 3: Die Prüfung der KI-Antwort

**Files:**
- Create: `src/lib/buendelung/pruefung.ts`
- Test: `tests/buendelung-pruefung.test.ts`

**Interfaces:**
- Consumes: `Kandidat` aus `./kandidaten`, `BuendelVorschlag` aus `./types`
- Produces: `MIN_KONFIDENZ = 0.7`; `pruefeBuendel(vorschlaege: BuendelVorschlag[], kandidaten: Kandidat[]): { angenommen: BuendelVorschlag[]; verworfen: Array<{ titel: string; grund: string }> }`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-pruefung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pruefeBuendel } from "@/lib/buendelung/pruefung";
import type { Kandidat } from "@/lib/buendelung/kandidaten";
import type { BuendelVorschlag } from "@/lib/buendelung/types";

function k(id: string, over: Partial<Kandidat> = {}): Kandidat {
  return {
    id,
    originalName: `${id}.jpg`,
    mimeType: "image/jpeg",
    pageCount: 1,
    reviewStatus: "offen",
    ocrStatus: "fertig",
    readable: true,
    zusammengefuegtInId: null,
    documentType: null,
    period: null,
    createdAt: new Date("2026-08-28T10:00:00Z"),
    text: "",
    ...over,
  };
}

function v(seiten: number[], over: Partial<BuendelVorschlag> = {}): BuendelVorschlag {
  return { titel: "Bündel", vermuteterTyp: null, confidence: 0.9, seiten, ...over };
}

const VIER = [k("a"), k("b"), k("c"), k("d")];

describe("pruefeBuendel", () => {
  it("nimmt ein sauberes Bündel an", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], VIER);
    expect(angenommen).toHaveLength(1);
    expect(verworfen).toHaveLength(0);
  });

  it("verwirft eine erfundene Seitennummer", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 99])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/gibt es nicht/i);
  });

  it("verwirft ein Bündel mit nur einer Seite", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/eine einzelne Seite/i);
  });

  it("verwirft dieselbe Seite zweimal im selben Bündel", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 0])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/zweimal/i);
  });

  it("verwirft ein zu unsicheres Bündel", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1], { confidence: 0.4 })], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/unsicher/i);
  });

  it("verwirft Mai und Juni im selben Bündel", () => {
    // Die wichtigste Sperre: sonst verschmelzen zwei Gehaltsabrechnungen zu
    // einem Dokument, die Checkliste meldet Gruen, und die fehlende dritte
    // faellt erst der Bank auf.
    const kandidaten = [k("a", { period: "2026-05" }), k("b", { period: "2026-06" })];
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], kandidaten);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/Zeitraum/i);
  });

  it("stoert sich nicht an einem fehlenden Zeitraum", () => {
    // Seite 2 einer Abrechnung traegt oft keinen erkennbaren Monat.
    const kandidaten = [k("a", { period: "2026-05" }), k("b", { period: null })];
    expect(pruefeBuendel([v([0, 1])], kandidaten).angenommen).toHaveLength(1);
  });

  it("verwirft nur das zweite Bündel, wenn eine Seite in beiden steht", () => {
    const { angenommen, verworfen } = pruefeBuendel(
      [v([0, 1], { titel: "Erstes" }), v([1, 2], { titel: "Zweites" })],
      VIER
    );
    expect(angenommen.map((x) => x.titel)).toEqual(["Erstes"]);
    expect(verworfen[0]!.titel).toBe("Zweites");
    expect(verworfen[0]!.grund).toMatch(/anderen Bündel/i);
  });

  it("laesst nicht zugeordnete Seiten einfach liegen", () => {
    // Anders als beim Auftrennen ist Nichtzuordnung hier der Normalfall.
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], VIER);
    expect(angenommen[0]!.seiten).toEqual([0, 1]);
    expect(verworfen).toHaveLength(0);
  });

  it("behaelt die von der KI gewaehlte Seitenreihenfolge", () => {
    expect(pruefeBuendel([v([2, 0, 1])], VIER).angenommen[0]!.seiten).toEqual([2, 0, 1]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/buendelung-pruefung.test.ts`
Expected: FAIL — `Cannot find module '@/lib/buendelung/pruefung'`

- [ ] **Step 3: Die Prüfung schreiben**

Erstelle `src/lib/buendelung/pruefung.ts`:

```ts
import type { Kandidat } from "./kandidaten";
import { MIN_KANDIDATEN, type BuendelVorschlag } from "./types";

/**
 * Je Buendel, nicht als Mittelwert: sonst zieht ein sehr sicheres Buendel zwei
 * unsichere mit durch.
 */
export const MIN_KONFIDENZ = 0.7;

export interface Pruefergebnis {
  angenommen: BuendelVorschlag[];
  verworfen: Array<{ titel: string; grund: string }>;
}

/**
 * Entscheidet, welche der von der KI vorgeschlagenen Buendel ueberhaupt
 * angezeigt werden.
 *
 * Bewusst hier und nicht im Prompt: Ein Modell, das gruppieren soll,
 * gruppiert - notfalls zwei Gehaltsabrechnungen aus verschiedenen Monaten. Die
 * Regeln stehen deshalb im Code, wo sie einzeln pruefbar sind.
 *
 * Anders als `pruefeSegmente` beim Auftrennen kippt ein schlechtes Buendel
 * nicht den ganzen Lauf: die uebrigen bleiben stehen. Und Seiten, die zu
 * keinem Buendel gehoeren, bleiben einfach einzeln liegen - das ist hier der
 * Normalfall, kein Fehler.
 */
export function pruefeBuendel(vorschlaege: BuendelVorschlag[], kandidaten: Kandidat[]): Pruefergebnis {
  const angenommen: BuendelVorschlag[] = [];
  const verworfen: Array<{ titel: string; grund: string }> = [];
  // Ueber alle Buendel hinweg: keine Seite darf zweimal vergeben werden, sonst
  // entstuende dieselbe Seite in zwei Dokumenten.
  const schonVergeben = new Set<number>();

  for (const b of vorschlaege) {
    const grund = pruefeEines(b, kandidaten, schonVergeben);
    if (grund) {
      verworfen.push({ titel: b.titel, grund });
      continue;
    }
    for (const i of b.seiten) schonVergeben.add(i);
    angenommen.push(b);
  }

  return { angenommen, verworfen };
}

function pruefeEines(b: BuendelVorschlag, kandidaten: Kandidat[], schonVergeben: Set<number>): string | null {
  if (b.seiten.length < MIN_KANDIDATEN) {
    return "Enthält nur eine einzelne Seite – da ist nichts zusammenzufügen.";
  }
  if (b.confidence < MIN_KONFIDENZ) {
    return `Zu unsicher (Konfidenz ${b.confidence.toFixed(2)}).`;
  }

  const gesehen = new Set<number>();
  for (const i of b.seiten) {
    if (!Number.isInteger(i) || i < 0 || i >= kandidaten.length) {
      return `Verweist auf eine Seite, die es nicht gibt (${i}).`;
    }
    if (gesehen.has(i)) return "Enthält dieselbe Seite zweimal.";
    if (schonVergeben.has(i)) return "Enthält eine Seite, die schon in einem anderen Bündel steht.";
    gesehen.add(i);
  }

  // Die schaerfste Regel. Zwei erkannte, verschiedene Zeitraeume in einem
  // Buendel heissen fast immer: zwei Dokumente. Ist bei einer Seite kein
  // Zeitraum erkannt (Seite 2 einer Abrechnung traegt oft keinen Monat), sagt
  // das nichts - dann greift die Regel nicht.
  const zeitraeume = new Set(b.seiten.map((i) => kandidaten[i]!.period).filter((p): p is string => !!p));
  if (zeitraeume.size > 1) {
    return `Enthält Seiten aus verschiedenen Zeiträumen (${[...zeitraeume].sort().join(", ")}).`;
  }

  return null;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/buendelung-pruefung.test.ts`
Expected: PASS (10 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/buendelung/pruefung.ts tests/buendelung-pruefung.test.ts
git commit -m "feat(buendelung): die Regeln, die Mai und Juni auseinanderhalten"
```

---

## Task 4: Der Vertrag mit der KI

**Files:**
- Create: `src/lib/buendelung/schema.ts`
- Modify: `src/lib/ai/service.ts` (neue Methode am Ende der Klasse, hinter `erkenneDokumentgrenzen`, ~Zeile 694)
- Modify: `src/lib/ai/mock-provider.ts` (neuer `case` im `switch` von `completeJSON`, hinter `case "dokumentgrenzen"`, ~Zeile 74)
- Test: `tests/buendelung-schema-vertrag.test.ts`

**Interfaces:**
- Consumes: `BuendelVorschlag`, `TEXT_ANFANG` aus `./types`
- Produces:
  - `buendelungSchema` (Zod), `type BuendelungResult = { buendel: BuendelVorschlag[] }`
  - `AIService.gruppiereEinzelseiten(seiten: Array<{ nummer: number; dateiname: string; hochgeladen: string; erkannterTyp: string | null; zeitraum: string | null; seitenzaehler: boolean; anfang: string }>): Promise<BuendelungResult>`
  - Mock-Antwort für `schemaName === "buendelung"`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-schema-vertrag.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

import { buendelungSchema } from "@/lib/buendelung/schema";

describe("Vertrag mit der KI (Bündelung)", () => {
  it("nimmt eine gültige Antwort an", () => {
    const parsed = buendelungSchema.parse({
      buendel: [{ titel: "Gehaltsabrechnung 05/2026", vermuteterTyp: "gehaltsabrechnung", confidence: 0.92, seiten: [2, 0, 1] }],
    });
    expect(parsed.buendel[0]!.seiten).toEqual([2, 0, 1]);
  });

  it("erlaubt einen unbekannten Typ als null - geraten waere schlimmer", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "Unklar", vermuteterTyp: null, confidence: 0.8, seiten: [0, 1] }] })
    ).not.toThrow();
  });

  it("lehnt einen erfundenen Dokumenttyp ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: "mondschein", confidence: 0.8, seiten: [0, 1] }] })
    ).toThrow();
  });

  it("lehnt ein Bündel mit weniger als zwei Seiten ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: null, confidence: 0.8, seiten: [0] }] })
    ).toThrow();
  });

  it("lehnt negative Seitennummern ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: null, confidence: 0.8, seiten: [0, -1] }] })
    ).toThrow();
  });

  it("die leere Antwort ist gültig - nicht jeder Fall hat Bündel", () => {
    expect(buendelungSchema.parse({ buendel: [] }).buendel).toEqual([]);
  });

  it("der Mock-Anbieter liefert eine schemakonforme Antwort", async () => {
    const { AIService } = await import("@/lib/ai/service");
    const ai = new AIService();
    const antwort = await ai.gruppiereEinzelseiten([
      { nummer: 0, dateiname: "IMG_1.jpg", hochgeladen: "2026-08-28T10:00:00Z", erkannterTyp: null, zeitraum: null, seitenzaehler: true, anfang: "Gehaltsabrechnung Seite 1 von 2" },
      { nummer: 1, dateiname: "IMG_2.jpg", hochgeladen: "2026-08-28T10:01:00Z", erkannterTyp: null, zeitraum: null, seitenzaehler: false, anfang: "Seite 2 von 2" },
    ]);
    expect(() => buendelungSchema.parse(antwort)).not.toThrow();
    expect(antwort.buendel[0]!.seiten).toEqual([0, 1]);
  });

  it("ohne Seiten wird die KI gar nicht erst gefragt", async () => {
    const { AIService } = await import("@/lib/ai/service");
    expect((await new AIService().gruppiereEinzelseiten([])).buendel).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/buendelung-schema-vertrag.test.ts`
Expected: FAIL — `Cannot find module '@/lib/buendelung/schema'`

- [ ] **Step 3: Das Schema schreiben**

Erstelle `src/lib/buendelung/schema.ts`:

```ts
import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";
import { MIN_KANDIDATEN } from "./types";

/**
 * Vertrag mit der KI. Sie schlaegt Gruppen vor - ob daraus ein Vorschlag wird,
 * entscheidet pruefeBuendel(), nicht der Prompt.
 */
export const buendelSchema = z.object({
  titel: z.string().min(1),
  // Zod erwartet ein veraenderliches [string, ...string[]]; DOCUMENT_TYPES ist
  // bewusst `as const`. Die Zusicherung aendert nur den Typ, nicht die Werte.
  vermuteterTyp: z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]).nullable(),
  confidence: z.number().min(0).max(1),
  /**
   * Laufende Nummern der Kandidaten IN DER GEWUENSCHTEN SEITENREIHENFOLGE.
   * Die Reihenfolge im Array ist die Reihenfolge im spaeteren PDF.
   */
  seiten: z.array(z.number().int().nonnegative()).min(MIN_KANDIDATEN),
});

export const buendelungSchema = z.object({ buendel: z.array(buendelSchema) });

export type BuendelungResult = z.infer<typeof buendelungSchema>;
```

- [ ] **Step 4: Die Methode am AIService ergänzen**

In `src/lib/ai/service.ts` oben zu den Importen:

```ts
import { buendelungSchema, type BuendelungResult } from "@/lib/buendelung/schema";
```

Und als letzte Methode der Klasse, direkt hinter `erkenneDokumentgrenzen`:

```ts
  /**
   * Welche Einzelseiten eines Falls gehoeren zu einem Dokument - und in welcher
   * Reihenfolge?
   *
   * Bewusst EIN Aufruf fuer den ganzen Fall: ein einzelnes Foto sagt nichts
   * darueber, ob es zu einem anderen gehoert, und dreissig Aufrufe brechen das
   * Mistral-Kontingent (50 Anfragen/Minute).
   */
  async gruppiereEinzelseiten(
    seiten: Array<{
      nummer: number;
      dateiname: string;
      hochgeladen: string;
      erkannterTyp: string | null;
      zeitraum: string | null;
      seitenzaehler: boolean;
      anfang: string;
    }>
  ): Promise<BuendelungResult> {
    if (seiten.length === 0) return { buendel: [] };

    const beschreibung = seiten
      .map((s) =>
        [
          `Seite ${s.nummer}`,
          `Datei: ${s.dateiname}`,
          `hochgeladen: ${s.hochgeladen}`,
          s.erkannterTyp ? `erkannter Typ: ${s.erkannterTyp}` : null,
          s.zeitraum ? `Zeitraum: ${s.zeitraum}` : null,
          s.seitenzaehler ? "[traegt einen Seitenzaehler]" : null,
          `Text: ${s.anfang}`,
        ]
          .filter(Boolean)
          .join(" | ")
      )
      .join("\n");

    return this.run(
      "buendelung",
      buendelungSchema,
      [
        "Du bekommst einzeln fotografierte oder gescannte Seiten aus EINER deutschen Baufinanzierung.",
        "Bestimme, welche Seiten zu DEMSELBEN Dokument gehoeren, und in welcher Reihenfolge sie im Dokument stehen.",
        "Die Reihenfolge im Feld 'seiten' IST die Seitenreihenfolge - richte dich nach dem Inhalt (Seitenzaehler wie 'Seite 2 von 4', angefangene Saetze, Datum), NICHT nach Dateinamen oder Uploadzeit. Handyfotos sind oft in falscher Reihenfolge aufgenommen.",
        "Gib NUR Gruppen mit mindestens zwei Seiten zurueck. Seiten, die allein stehen, laesst du einfach weg - das ist der Normalfall und kein Fehler.",
        "Seiten aus verschiedenen Zeitraeumen gehoeren NIE zusammen: zwei Gehaltsabrechnungen aus Mai und Juni sind zwei Dokumente, nicht eines.",
        "titel ist eine kurze deutsche Bezeichnung fuer die Anzeige, z. B. 'Gehaltsabrechnung 05/2026'.",
        "vermuteterTyp ist null, wenn unklar - nie geraten.",
        "confidence ist deine Sicherheit fuer GENAU diese Gruppe.",
      ].join(" "),
      beschreibung,
      { seiten: seiten.length }
    );
  }
```

- [ ] **Step 5: Den Mock-Anbieter ergänzen**

In `src/lib/ai/mock-provider.ts`, im `switch (req.schemaName)` direkt hinter `case "dokumentgrenzen"`:

```ts
      // Der Mock buendelt die ersten beiden Seiten - genug, damit Tests den
      // ganzen Weg gehen koennen, ohne die echte KI zu rufen.
      case "buendelung": {
        const anzahl = Number(req.hints?.seiten ?? 0);
        if (anzahl < 2) return { buendel: [] };
        return {
          buendel: [
            { titel: "Gehaltsabrechnung 05/2026", vermuteterTyp: "gehaltsabrechnung", confidence: 0.9, seiten: [0, 1] },
          ],
        };
      }
```

- [ ] **Step 6: Test laufen lassen**

Run: `npx vitest run tests/buendelung-schema-vertrag.test.ts`
Expected: PASS (8 Tests)

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add src/lib/buendelung/schema.ts src/lib/ai/service.ts src/lib/ai/mock-provider.ts tests/buendelung-schema-vertrag.test.ts
git commit -m "feat(buendelung): ein KI-Aufruf fuer den ganzen Fall"
```

---

## Task 5: Der fallweite Lauf mit Sperre

**Files:**
- Create: `src/lib/buendelung/service.ts`
- Test: `tests/buendelung-erkennung-db.test.ts`

**Interfaces:**
- Consumes: `waehleKandidaten`, `pruefeBuendel`, `AIService.gruppiereEinzelseiten`, `SEITEN_MUSTER` aus `@/lib/detektiv/completeness`
- Produces: `erkenneBuendel(caseId: string): Promise<void>` — wirft nie; setzt `Case.buendelStatus` und legt `DocumentBuendel`-Zeilen an.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-erkennung-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündel-Erkennung (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let erkenneBuendel: (caseId: string) => Promise<void>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-erk" } });
    orgId = org.id;
    ({ erkenneBuendel } = await import("@/lib/buendelung/service"));
  }, 180_000);

  let nr = 0;
  const fallMitSeiten = async (anzahl: number, over: Record<string, unknown> = {}) => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: `UP-TEST-BE${++nr}` },
    });
    for (let i = 0; i < anzahl; i++) {
      const d = await prisma.document.create({
        data: {
          caseId: c.id,
          originalName: `IMG_${i}.jpg`,
          storageKey: `t/${c.id}/${i}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 100,
          uploadSource: "kunde",
          pageCount: 1,
          scanStatus: "virus_scan_clean",
          ocrStatus: "fertig",
          readable: true,
          ...over,
        },
      });
      await prisma.documentPage.create({
        data: { documentId: d.id, pageNumber: 1, ocrText: `Gehaltsabrechnung Seite ${i + 1} von ${anzahl}` },
      });
    }
    return c.id;
  };

  it("legt aus dem KI-Vorschlag ein Bündel an", async () => {
    const caseId = await fallMitSeiten(3);
    await erkenneBuendel(caseId);
    const buendel = await prisma.documentBuendel.findMany({
      where: { caseId },
      include: { seiten: { orderBy: { position: "asc" } } },
    });
    expect(buendel).toHaveLength(1);
    expect(buendel[0].seiten).toHaveLength(2);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("fertig");
  });

  it("ein zweiter Lauf ersetzt den Vorschlag, statt ihn zu verdoppeln", async () => {
    const caseId = await fallMitSeiten(3);
    await erkenneBuendel(caseId);
    await prisma.case.update({ where: { id: caseId }, data: { buendelStatus: "ausstehend" } });
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("bei nur einer brauchbaren Seite ist der Lauf fertig und ohne Vorschlag", async () => {
    const caseId = await fallMitSeiten(1);
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // "fertig" mit null Vorschlaegen ist NICHT dasselbe wie "ausstehend".
    expect(c.buendelStatus).toBe("fertig");
  });

  it("ein zweiter gleichzeitiger Lauf kehrt still um", async () => {
    const caseId = await fallMitSeiten(3);
    await prisma.case.update({
      where: { id: caseId },
      data: { buendelStatus: "laeuft", buendelStatusAm: new Date() },
    });
    await erkenneBuendel(caseId);
    // Der laufende Nachbar bleibt unangetastet - kein zweiter KI-Aufruf.
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("laeuft");
  });

  it("uebernimmt eine seit zehn Minuten haengende Sperre", async () => {
    const caseId = await fallMitSeiten(3);
    await prisma.case.update({
      where: { id: caseId },
      data: { buendelStatus: "laeuft", buendelStatusAm: new Date(Date.now() - 11 * 60_000) },
    });
    await erkenneBuendel(caseId);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("fertig");
  });

  it("freigegebene Seiten kommen nicht in den Lauf", async () => {
    const caseId = await fallMitSeiten(3, { reviewStatus: "akzeptiert" });
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-erkennung-db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/buendelung/service'`

- [ ] **Step 3: Den Erkennungslauf schreiben**

Erstelle `src/lib/buendelung/service.ts`:

```ts
import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import { SEITEN_MUSTER } from "@/lib/detektiv/completeness";
import { waehleKandidaten, type Kandidat } from "./kandidaten";
import { pruefeBuendel } from "./pruefung";
import { TEXT_ANFANG, type BuendelVorschlag } from "./types";
import type { DocumentType } from "@/lib/domain/enums";

/** Nach dieser Zeit gilt ein `laeuft` als haengengeblieben (Absturz, Deploy). */
const SPERRE_VERFAELLT_MS = 10 * 60_000;

/** Steht auf dieser Seite ueberhaupt ein Seitenzaehler ("Seite 2 von 4")? */
function hatSeitenzaehler(text: string): boolean {
  for (const muster of SEITEN_MUSTER) {
    muster.lastIndex = 0;
    if (muster.test(text)) return true;
  }
  return false;
}

/**
 * Prueft den GANZEN Fall darauf, welche Einzelseiten zu einem Dokument
 * gehoeren, und legt die Vorschlaege ab.
 *
 * Fallweit und nicht je Datei: Ein einzelnes Foto sagt nichts darueber, ob es
 * zu einem anderen gehoert - die Frage ist erst beantwortbar, wenn alle Seiten
 * da sind.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Extraktion noch den Detektiv
 * mitreissen. Sichtbar wird er ueber `Case.buendelStatus` - "nicht geprueft"
 * und "nichts gefunden" duerfen nie gleich aussehen.
 */
export async function erkenneBuendel(caseId: string): Promise<void> {
  // Die Sperre liegt in der Datenbank, nicht im Speicher: zwei gleichzeitig
  // fertig gewordene Dokumente wuerden sonst beide "niemand laeuft mehr" sehen
  // und beide die KI rufen.
  const beansprucht = await prisma.case.updateMany({
    where: {
      id: caseId,
      OR: [
        { buendelStatus: { not: "laeuft" } },
        { buendelStatusAm: { lt: new Date(Date.now() - SPERRE_VERFAELLT_MS) } },
      ],
    },
    data: { buendelStatus: "laeuft", buendelStatusAm: new Date() },
  });
  if (beansprucht.count !== 1) return;

  try {
    const docs = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        pageCount: true,
        reviewStatus: true,
        ocrStatus: true,
        readable: true,
        zusammengefuegtInId: true,
        documentType: true,
        period: true,
        createdAt: true,
        pages: { select: { ocrText: true }, orderBy: { pageNumber: "asc" }, take: 1 },
      },
    });

    const kandidaten: Kandidat[] = waehleKandidaten(
      docs.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        pageCount: d.pageCount,
        reviewStatus: d.reviewStatus,
        ocrStatus: d.ocrStatus,
        readable: d.readable,
        zusammengefuegtInId: d.zusammengefuegtInId,
        documentType: d.documentType as DocumentType | null,
        period: d.period,
        createdAt: d.createdAt,
        text: (d.pages[0]?.ocrText ?? "").trim(),
      }))
    );

    if (kandidaten.length === 0) {
      // Geprueft und nichts zu tun - das ist kein Fehler.
      await abschliessen(caseId, "fertig", []);
      return;
    }

    const antwort = await aiService.gruppiereEinzelseiten(
      kandidaten.map((k, i) => ({
        nummer: i,
        dateiname: k.originalName,
        hochgeladen: k.createdAt.toISOString(),
        erkannterTyp: k.documentType,
        zeitraum: k.period,
        seitenzaehler: hatSeitenzaehler(k.text),
        anfang: k.text.slice(0, TEXT_ANFANG),
      }))
    );

    const { angenommen, verworfen } = pruefeBuendel(antwort.buendel as BuendelVorschlag[], kandidaten);
    for (const v of verworfen) {
      // Ohne Klartext-Inhalte: nur, welcher Vorschlag warum wegfiel.
      console.info(`[buendelung] Vorschlag „${v.titel}" verworfen: ${v.grund}`);
    }

    await abschliessen(
      caseId,
      "fertig",
      angenommen.map((b, i) => ({
        reihenfolge: i,
        titel: b.titel,
        vermuteterTyp: b.vermuteterTyp,
        confidence: b.confidence,
        seiten: b.seiten.map((nummer, position) => ({ documentId: kandidaten[nummer]!.id, position })),
      }))
    );
  } catch (e) {
    console.error(`[buendelung] Erkennung fuer Fall ${caseId} fehlgeschlagen:`, e);
    await prisma.case
      .update({ where: { id: caseId }, data: { buendelStatus: "fehler", buendelStatusAm: new Date() } })
      .catch(() => undefined);
  }
}

interface NeuesBuendel {
  reihenfolge: number;
  titel: string;
  vermuteterTyp: DocumentType | null;
  confidence: number;
  seiten: Array<{ documentId: string; position: number }>;
}

/**
 * Setzt Status und Vorschlaege in EINER Transaktion. Ein erneuter Lauf ersetzt
 * den alten Vorschlag, statt ihn zu verdoppeln.
 */
async function abschliessen(caseId: string, status: "fertig", buendel: NeuesBuendel[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.documentBuendel.deleteMany({ where: { caseId } });
    for (const b of buendel) {
      await tx.documentBuendel.create({
        data: {
          caseId,
          reihenfolge: b.reihenfolge,
          titel: b.titel,
          vermuteterTyp: b.vermuteterTyp ?? undefined,
          confidence: b.confidence,
          seiten: { create: b.seiten },
        },
      });
    }
    await tx.case.update({
      where: { id: caseId },
      data: { buendelStatus: status, buendelStatusAm: new Date() },
    });
  });
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-erkennung-db.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/buendelung/service.ts tests/buendelung-erkennung-db.test.ts
git commit -m "feat(buendelung): fallweiter Lauf mit Sperre in der Datenbank"
```

---

## Task 6: Der Anstoß am Ende der Analyse

**Files:**
- Modify: `src/lib/documents/pipeline.ts` (Nachlauf in `processOcrAndAi`, ~Zeile 415–430)
- Modify: `src/lib/aufteilung/service.ts` (`erkenneAufteilung`, Kandidatenprüfung ~Zeile 29–50)
- Test: `tests/buendelung-anstoss-db.test.ts`

**Interfaces:**
- Consumes: `erkenneBuendel` aus `@/lib/buendelung/service`
- Produces: `starteBuendelLaufWennFertig(caseId: string, eigeneDocumentId: string): Promise<void>` in `src/lib/buendelung/service.ts`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-anstoss-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Anstoß des Bündel-Laufs (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let starteBuendelLaufWennFertig: (caseId: string, documentId: string) => Promise<void>;
  let erkenneAufteilung: (documentId: string) => Promise<void>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-anstoss" } });
    orgId = org.id;
    ({ starteBuendelLaufWennFertig } = await import("@/lib/buendelung/service"));
    ({ erkenneAufteilung } = await import("@/lib/aufteilung/service"));
  }, 180_000);

  let nr = 0;
  const fallAnlegen = async () =>
    (await prisma.case.create({ data: { organizationId: orgId, caseNumber: `UP-TEST-BA${++nr}` } })).id;

  const seite = async (caseId: string, i: number, over: Record<string, unknown> = {}) => {
    const d = await prisma.document.create({
      data: {
        caseId,
        originalName: `IMG_${i}.jpg`,
        storageKey: `t/${caseId}/${i}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadSource: "kunde",
        pageCount: 1,
        scanStatus: "virus_scan_clean",
        ocrStatus: "fertig",
        classificationStatus: "fertig",
        extractionStatus: "fertig",
        readable: true,
        ...over,
      },
    });
    await prisma.documentPage.create({
      data: { documentId: d.id, pageNumber: 1, ocrText: `Gehaltsabrechnung Seite ${i + 1} von 3` },
    });
    return d;
  };

  it("startet den Lauf, wenn keine Analyse mehr laeuft", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0);
    const letzte = await seite(caseId, 1);
    await starteBuendelLaufWennFertig(caseId, letzte.id);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("wartet, solange ein Nachbardokument noch analysiert wird", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0, { classificationStatus: "laeuft" });
    const fertig = await seite(caseId, 1);
    await starteBuendelLaufWennFertig(caseId, fertig.id);
    // Der Nachbar macht das Licht aus, nicht dieses Dokument.
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("ausstehend");
  });

  it("das eigene Dokument zaehlt nicht als laufender Nachbar", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0);
    // Das gerade fertig gewordene Dokument traegt in der Datenbank
    // moeglicherweise noch "laeuft" - es darf sich nicht selbst blockieren.
    const selbst = await seite(caseId, 1, { extractionStatus: "laeuft" });
    await starteBuendelLaufWennFertig(caseId, selbst.id);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("ein zusammengefuegtes Dokument wird nicht auf Aufteilung geprueft", async () => {
    const caseId = await fallAnlegen();
    const quelle = await seite(caseId, 0);
    const ziel = await prisma.document.create({
      data: {
        caseId,
        originalName: "gebuendelt.pdf",
        storageKey: `t/${caseId}/gebuendelt.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 500,
        uploadSource: "kunde",
        pageCount: 4,
        scanStatus: "virus_scan_clean",
        ocrStatus: "fertig",
      },
    });
    for (let i = 1; i <= 4; i++) {
      await prisma.documentPage.create({
        data: { documentId: ziel.id, pageNumber: i, ocrText: `Seite ${i} von 4` },
      });
    }
    await prisma.document.update({ where: { id: quelle.id }, data: { zusammengefuegtInId: ziel.id } });

    await erkenneAufteilung(ziel.id);

    // Sonst schluege die Aufteilung sofort vor, das gerade Gebuendelte wieder
    // zu zerlegen.
    expect(await prisma.documentSplitSegment.count({ where: { documentId: ziel.id } })).toBe(0);
    const nachher = await prisma.document.findUnique({ where: { id: ziel.id } });
    expect(nachher.splitStatus).toBe("fertig");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-anstoss-db.test.ts`
Expected: FAIL — `starteBuendelLaufWennFertig is not a function`

- [ ] **Step 3: Den Anstoß in `src/lib/buendelung/service.ts` ergänzen**

Ans Ende der Datei:

```ts
/**
 * "Wer als Letzter fertig wird, macht das Licht aus."
 *
 * Am Ende der Analyse eines Dokuments: laeuft im Fall noch eine andere
 * Analyse? Wenn nein, startet dieses Dokument den fallweiten Buendel-Lauf.
 * Ergebnis ist EIN KI-Aufruf je Upload-Schwung, gleich ob drei oder dreissig
 * Seiten - dreissig Aufrufe wuerden das Mistral-Kontingent (50/Minute)
 * sprengen.
 *
 * Das eigene Dokument wird ausgenommen: sein Status steht zu diesem Zeitpunkt
 * je nach Reihenfolge der Schreibvorgaenge moeglicherweise noch auf "laeuft",
 * und es duerfte sich nicht selbst blockieren.
 *
 * Wirft nie.
 */
export async function starteBuendelLaufWennFertig(caseId: string, eigeneDocumentId: string): Promise<void> {
  try {
    const nochLaufend = await prisma.document.count({
      where: {
        caseId,
        id: { not: eigeneDocumentId },
        OR: [
          { ocrStatus: "laeuft" },
          { classificationStatus: "laeuft" },
          { extractionStatus: "laeuft" },
        ],
      },
    });
    if (nochLaufend > 0) return;
    await erkenneBuendel(caseId);
  } catch (e) {
    console.error(`[buendelung] Anstoss fuer Fall ${caseId} fehlgeschlagen:`, e);
  }
}
```

- [ ] **Step 4: Den Aufruf in die Pipeline hängen**

In `src/lib/documents/pipeline.ts` zu den Importen:

```ts
import { starteBuendelLaufWennFertig } from "@/lib/buendelung/service";
```

Im Nachlauf-Block von `processOcrAndAi`, hinter `await reconcileCase(caseId);`:

```ts
    // ZULETZT: Die Buendelung fragt den ganzen Fall ab und braucht deshalb
    // alle anderen Analysen fertig. Sie startet nur, wenn dieses Dokument das
    // letzte laufende war.
    await starteBuendelLaufWennFertig(caseId, documentId);
```

- [ ] **Step 5: Die Ausnahme in der Aufteilung ergänzen**

In `src/lib/aufteilung/service.ts`, in `erkenneAufteilung`: das `select` um die Quellseiten erweitern —

```ts
        pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
        // Ist dieses Dokument selbst aus Einzelseiten entstanden?
        _count: { select: { quellseiten: true } },
```

— und die Kandidatenprüfung ergänzen:

```ts
    const seitenzahl = doc.pageCount ?? doc.pages.length;
    const pruefbar =
      doc.mimeType === "application/pdf" &&
      seitenzahl >= MIN_SEITEN_FUER_PRUEFUNG &&
      doc.ocrStatus === "fertig" &&
      doc.pages.length > 0 &&
      // Ein gerade aus Einzelseiten zusammengefuegtes Dokument nicht sofort
      // wieder zum Zerlegen vorschlagen - der Vermittler hat eben entschieden,
      // dass diese Seiten zusammengehoeren.
      doc._count.quellseiten === 0;
```

- [ ] **Step 6: Tests laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-anstoss-db.test.ts tests/aufteilung-service-db.test.ts`
Expected: PASS — die vier neuen Tests und die vorhandenen Aufteilungstests unverändert grün.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add src/lib/buendelung/service.ts src/lib/documents/pipeline.ts src/lib/aufteilung/service.ts tests/buendelung-anstoss-db.test.ts
git commit -m "feat(buendelung): wer als Letzter fertig wird, macht das Licht aus"
```

---

## Task 7: Das PDF bauen

**Files:**
- Create: `src/lib/buendelung/pdf.ts`
- Test: `tests/buendelung-pdf.test.ts`

**Interfaces:**
- Consumes: `pdf-lib`
- Produces: `baueBuendelPdf(teile: Array<{ mimeType: string; buffer: Buffer }>): Promise<Buffer>` — wirft mit deutschem Klartext, wenn ein Teil nicht verarbeitbar ist.

- [ ] **Step 1: Die Test-Bilder einmalig erzeugen und mitcommitten**

Die Tests brauchen echte JPEG/PNG-Dateien in bekannten Maßen. Ein Bild-Encoder
gehört aber nicht in die Testabhängigkeiten: `sharp` liegt in diesem Projekt nur
**transitiv** über Next.js im `node_modules` — ein Next.js-Upgrade könnte es
entfernen und die Tests reißen. Deshalb einmal erzeugen, als Fixture ablegen,
nie wieder anfassen.

```bash
mkdir -p tests/fixtures
node -e '
const sharp = require("sharp");
const grau = (w, h) => ({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 200, b: 200 } } });
Promise.all([
  sharp(grau(800, 1200)).jpeg().toFile("tests/fixtures/seite-hoch.jpg"),
  sharp(grau(1600, 900)).jpeg().toFile("tests/fixtures/seite-quer.jpg"),
  sharp(grau(600, 800)).png().toFile("tests/fixtures/seite-hoch.png"),
]).then(() => console.log("Fixtures erzeugt"));
'
ls -l tests/fixtures
```

Erwartet: drei Dateien, jede wenige Kilobyte groß. Ist `sharp` nicht auflösbar,
tun es drei beliebige echte Fotos in denselben Maßen (hochkant 800×1200,
quer 1600×900, PNG 600×800) — nur müssen die Maße stimmen, sonst schlägt der
Orientierungstest fehl.

```bash
git add tests/fixtures
git commit -m "test(buendelung): feste Bild-Fixtures statt Encoder zur Laufzeit"
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { baueBuendelPdf } from "@/lib/buendelung/pdf";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
/** 800x1200, hochformat. */
const HOCH = () => readFileSync(join(FIXTURES, "seite-hoch.jpg"));
/** 1600x900, querformat. */
const QUER = () => readFileSync(join(FIXTURES, "seite-quer.jpg"));
const PNG = () => readFileSync(join(FIXTURES, "seite-hoch.png"));

/** Erzeugt ein einseitiges PDF mit dem vorhandenen pdfkit. */
async function einseitigesPdf(): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
    doc.addPage().text("Gescannte Seite");
    doc.end();
  });
}

async function seitenzahl(pdf: Buffer): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(pdf)).getPageCount();
}

async function seitenMasse(pdf: Buffer, index: number): Promise<{ breite: number; hoehe: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const { width, height } = (await PDFDocument.load(pdf)).getPage(index).getSize();
  return { breite: Math.round(width), hoehe: Math.round(height) };
}

describe("baueBuendelPdf", () => {
  it("macht aus zwei Fotos ein zweiseitiges PDF", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: HOCH() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("legt ein hochformatiges Foto auf A4 hoch", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: HOCH() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    // Banken erwarten A4-Seiten, keine Fotoformate.
    expect(await seitenMasse(pdf, 0)).toEqual({ breite: 595, hoehe: 842 });
  });

  it("dreht die Seite fuer ein querformatiges Foto", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: QUER() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenMasse(pdf, 0)).toEqual({ breite: 842, hoehe: 595 });
    expect(await seitenMasse(pdf, 1)).toEqual({ breite: 595, hoehe: 842 });
  });

  it("uebernimmt ein einseitiges PDF unveraendert", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "application/pdf", buffer: await einseitigesPdf() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("kann PNG", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/png", buffer: PNG() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("wirft mit Klartext, wenn ein Teil kaputt ist", async () => {
    await expect(
      baueBuendelPdf([
        { mimeType: "image/jpeg", buffer: Buffer.from("kein Bild") },
        { mimeType: "image/jpeg", buffer: HOCH() },
      ])
    ).rejects.toThrow(/Seite 1/);
  });

  it("wirft bei einem nicht unterstuetzten Typ", async () => {
    await expect(
      baueBuendelPdf([
        { mimeType: "image/tiff", buffer: Buffer.from("x") },
        { mimeType: "image/jpeg", buffer: HOCH() },
      ])
    ).rejects.toThrow(/image\/tiff/);
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/buendelung-pdf.test.ts`
Expected: FAIL — `Cannot find module '@/lib/buendelung/pdf'`

- [ ] **Step 4: Das PDF-Bauen schreiben**

Erstelle `src/lib/buendelung/pdf.ts`:

```ts
/** A4 in PDF-Punkten (72 dpi). */
const A4_KURZ = 595;
const A4_LANG = 842;

export interface BuendelTeil {
  mimeType: string;
  buffer: Buffer;
}

/**
 * Baut aus Einzelseiten EIN PDF - in genau der uebergebenen Reihenfolge.
 *
 * Bilder kommen auf eine A4-Seite (bei querformatigem Bild A4 quer),
 * proportional eingepasst und zentriert: Banken erwarten A4-Seiten, keine
 * Fotoformate. Ein bereits einseitiges PDF wird unveraendert uebernommen -
 * keine Neuberechnung, kein Qualitaetsverlust.
 *
 * Wirft mit deutschem Klartext und der SEITENNUMMER, wenn ein Teil nicht
 * verarbeitbar ist. Der Aufrufer bricht dann alles ab: ein halb
 * zusammengefuegtes Dokument waere schlimmer als gar keines.
 */
export async function baueBuendelPdf(teile: BuendelTeil[]): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const ziel = await PDFDocument.create();

  for (const [index, teil] of teile.entries()) {
    const nummer = index + 1;
    try {
      if (teil.mimeType === "application/pdf") {
        const quelle = await PDFDocument.load(teil.buffer);
        const [seite] = await ziel.copyPages(quelle, [0]);
        ziel.addPage(seite);
        continue;
      }

      const bild =
        teil.mimeType === "image/png"
          ? await ziel.embedPng(teil.buffer)
          : teil.mimeType === "image/jpeg" || teil.mimeType === "image/jpg"
            ? await ziel.embedJpg(teil.buffer)
            : null;
      if (!bild) {
        throw new Error(`Dateityp ${teil.mimeType} kann nicht eingebettet werden.`);
      }

      // Querformatiges Foto bekommt eine quere Seite - sonst schrumpft der
      // Text auf ein Drittel und wird unlesbar.
      const quer = bild.width > bild.height;
      const seitenBreite = quer ? A4_LANG : A4_KURZ;
      const seitenHoehe = quer ? A4_KURZ : A4_LANG;
      const seite = ziel.addPage([seitenBreite, seitenHoehe]);

      const faktor = Math.min(seitenBreite / bild.width, seitenHoehe / bild.height);
      const breite = bild.width * faktor;
      const hoehe = bild.height * faktor;
      seite.drawImage(bild, {
        x: (seitenBreite - breite) / 2,
        y: (seitenHoehe - hoehe) / 2,
        width: breite,
        height: hoehe,
      });
    } catch (e) {
      const grund = e instanceof Error ? e.message : String(e);
      throw new Error(`Seite ${nummer} konnte nicht verarbeitet werden: ${grund}`);
    }
  }

  return Buffer.from(await ziel.save());
}
```

- [ ] **Step 5: Test laufen lassen**

Run: `npx vitest run tests/buendelung-pdf.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/buendelung/pdf.ts tests/buendelung-pdf.test.ts
git commit -m "feat(buendelung): aus Fotos und Einzelscans wird ein A4-PDF"
```

---

## Task 8: Zusammenfügen

**Files:**
- Modify: `src/lib/buendelung/service.ts` (neue Funktion)
- Test: `tests/buendelung-zusammenfuegen-db.test.ts`

**Interfaces:**
- Consumes: `baueBuendelPdf` aus `./pdf`, `getStorage` aus `@/lib/storage`, `analysiereDokument` aus `@/lib/documents/pipeline`
- Produces: `fuegeZusammen(input: { caseId: string; organizationId: string; documentIds: string[]; titel: string; vermuteterTyp?: DocumentType | null; buendelId?: string }): Promise<{ ok: true; documentId: string; seiten: number } | { ok: false; grund: string }>`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-zusammenfuegen-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

// after() gibt es nur im Request-Kontext; die Hintergrundanalyse wird hier
// bewusst nicht ausgefuehrt - geprueft wird das Zusammenfuegen selbst.
vi.mock("next/server", () => ({ after: () => undefined }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Echtes 800x1200-JPEG aus tests/fixtures - kein Bild-Encoder im Test noetig. */
const jpeg = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-hoch.jpg"));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Zusammenfügen (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let storage: any;
  let fuegeZusammen: (input: any) => Promise<any>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-fuegen" } });
    orgId = org.id;
    ({ fuegeZusammen } = await import("@/lib/buendelung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  let nr = 0;
  const fallAnlegen = async () =>
    (await prisma.case.create({ data: { organizationId: orgId, caseNumber: `UP-TEST-BZ${++nr}` } })).id;

  const seiteAnlegen = async (caseId: string, name: string, buffer: Buffer, mimeType = "image/jpeg") => {
    const stored = await storage.put({ organizationId: orgId, caseId, originalName: name, mimeType, buffer });
    return prisma.document.create({
      data: {
        caseId,
        originalName: name,
        storageKey: stored.storageKey,
        mimeType,
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        pageCount: 1,
        scanStatus: "virus_scan_clean",
        scanEngine: "mock",
        ocrStatus: "fertig",
        readable: true,
      },
    });
  };

  it("macht aus zwei Fotos ein Dokument und laesst die Quellen stehen", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());

    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [b.id, a.id],
      titel: "Gehaltsabrechnung 05/2026",
      vermuteterTyp: "gehaltsabrechnung",
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);

    const neu = await prisma.document.findUnique({
      where: { id: ergebnis.documentId },
      include: { quellseiten: true },
    });
    expect(neu.mimeType).toBe("application/pdf");
    expect(neu.pageCount).toBe(2);
    expect(neu.documentType).toBe("gehaltsabrechnung");
    // Kein zweiter Virenscan: dieselben Bytes wurden bereits geprueft.
    expect(neu.scanStatus).toBe("virus_scan_clean");
    expect(neu.quellseiten).toHaveLength(2);

    // Nichts geloescht - Datensatz und Datei bleiben.
    const quelleA = await prisma.document.findUnique({ where: { id: a.id } });
    expect(quelleA.reviewStatus).toBe("ersetzt");
    expect(quelleA.zusammengefuegtInId).toBe(ergebnis.documentId);
    expect(await storage.get(quelleA.storageKey)).not.toBeNull();
  });

  it("mischt Foto und einseitiges PDF", async () => {
    const caseId = await fallAnlegen();
    const PDFDocument = (await import("pdfkit")).default;
    const pdfBytes: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false });
      const teile: Buffer[] = [];
      doc.on("data", (d: Buffer) => teile.push(d));
      doc.on("end", () => resolve(Buffer.concat(teile)));
      doc.on("error", reject);
      doc.addPage().text("Scan");
      doc.end();
    });
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.pdf", pdfBytes, "application/pdf");

    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, b.id],
      titel: "Gemischt",
    });
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);
  });

  it("scheitert eine Seite, entsteht kein Dokument und kein Muell im Speicher", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const kaputt = await seiteAnlegen(caseId, "kaputt.jpg", Buffer.from("kein Bild"));

    const vorher = await prisma.document.count({ where: { caseId } });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, kaputt.id],
      titel: "Geht nicht",
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/Seite 2/);
    expect(await prisma.document.count({ where: { caseId } })).toBe(vorher);
    // Der Fall bleibt exakt so, wie er war.
    const unveraendert = await prisma.document.findUnique({ where: { id: a.id } });
    expect(unveraendert.reviewStatus).toBe("offen");
    expect(unveraendert.zusammengefuegtInId).toBeNull();
  });

  it("weist eine Seite aus einer fremden Organisation ab", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: "fremde-org",
      documentIds: [a.id, b.id],
      titel: "X",
    });
    expect(ergebnis.ok).toBe(false);
  });

  it("weist eine einzelne Seite ab", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const ergebnis = await fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id], titel: "X" });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/mindestens zwei/i);
  });

  it("entfernt den zugehoerigen Vorschlag", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());
    const buendel = await prisma.documentBuendel.create({
      data: {
        caseId,
        reihenfolge: 0,
        titel: "Vorschlag",
        seiten: { create: [{ documentId: a.id, position: 0 }, { documentId: b.id, position: 1 }] },
      },
    });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, b.id],
      titel: "Vorschlag",
      buendelId: buendel.id,
    });
    expect(ergebnis.ok).toBe(true);
    expect(await prisma.documentBuendel.count({ where: { id: buendel.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-zusammenfuegen-db.test.ts`
Expected: FAIL — `fuegeZusammen is not a function`

- [ ] **Step 3: Zusammenfügen schreiben**

In `src/lib/buendelung/service.ts` die Importe ergänzen (`MIN_KANDIDATEN` kommt
zur bestehenden `./types`-Zeile dazu):

```ts
import { after } from "next/server";
import { getStorage } from "@/lib/storage";
import { analysiereDokument } from "@/lib/documents/pipeline";
import { baueBuendelPdf } from "./pdf";
// bestehende Zeile erweitern:
import { MIN_KANDIDATEN, TEXT_ANFANG, type BuendelVorschlag } from "./types";
```

Und die Funktion ans Ende der Datei:

```ts
export interface ZusammenfuegenInput {
  caseId: string;
  organizationId: string;
  /** Die Quellseiten IN DER GEWUENSCHTEN SEITENREIHENFOLGE. */
  documentIds: string[];
  titel: string;
  vermuteterTyp?: DocumentType | null;
  /** Der Vorschlag, aus dem das kam - er wird danach entfernt. */
  buendelId?: string;
}

export type ZusammenfuegenErgebnis =
  | { ok: true; documentId: string; seiten: number }
  | { ok: false; grund: string };

/**
 * Fuegt Einzelseiten zu EINEM PDF zusammen - nur auf Klick.
 *
 * Alles oder nichts: Erst wird die fertige Datei abgelegt, dann erst entstehen
 * die Datensaetze. Ein halb zusammengefuegtes Dokument waere schlimmer als gar
 * keines - dieselbe Regel wie beim Auftrennen.
 *
 * Dieselbe Funktion bedient den KI-Vorschlag und die Auswahl von Hand. Zwei
 * Pfade wuerden auseinanderlaufen.
 */
export async function fuegeZusammen(input: ZusammenfuegenInput): Promise<ZusammenfuegenErgebnis> {
  const { caseId, organizationId, documentIds, titel } = input;
  if (documentIds.length < MIN_KANDIDATEN) {
    return { ok: false, grund: "Zum Zusammenfügen braucht es mindestens zwei Seiten." };
  }

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, caseId, case: { organizationId } },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      applicantId: true,
      uploadSource: true,
      scanStatus: true,
      scanEngine: true,
      scannedAt: true,
      reviewStatus: true,
      zusammengefuegtInId: true,
    },
  });
  if (docs.length !== documentIds.length) {
    return { ok: false, grund: "Mindestens eine Seite gehört nicht zu diesem Fall." };
  }
  if (docs.some((d) => d.reviewStatus !== "offen" || d.zusammengefuegtInId !== null)) {
    return { ok: false, grund: "Mindestens eine Seite ist bereits freigegeben oder gebündelt." };
  }

  // In die vom Aufrufer gewuenschte Reihenfolge bringen - findMany liefert sie
  // in beliebiger Ordnung, und die Reihenfolge IST hier die Aussage.
  const nachId = new Map(docs.map((d) => [d.id, d]));
  const geordnet = documentIds.map((id) => nachId.get(id)!);

  const storage = getStorage();
  const teile: Array<{ mimeType: string; buffer: Buffer }> = [];
  for (const [i, d] of geordnet.entries()) {
    const buffer = await storage.get(d.storageKey);
    if (!buffer) return { ok: false, grund: `Seite ${i + 1} ist im Speicher nicht auffindbar.` };
    teile.push({ mimeType: d.mimeType, buffer });
  }

  let pdf: Buffer;
  try {
    pdf = await baueBuendelPdf(teile);
  } catch (e) {
    console.error(`[buendelung] PDF fuer Fall ${caseId} nicht baubar:`, e);
    return { ok: false, grund: e instanceof Error ? e.message : "Die Seiten ließen sich nicht zusammenfügen." };
  }

  const name = `${titel.replace(/[^A-Za-z0-9äöüÄÖÜß._-]+/g, "_")}.pdf`;
  let gespeichert;
  try {
    gespeichert = await storage.put({
      organizationId,
      caseId,
      originalName: name,
      mimeType: "application/pdf",
      buffer: pdf,
    });
  } catch (e) {
    console.error(`[buendelung] Ablegen des PDFs fuer Fall ${caseId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Das zusammengefügte Dokument konnte nicht gespeichert werden." };
  }

  const erste = geordnet[0]!;
  try {
    const neu = await prisma.$transaction(async (tx) => {
      const erzeugt = await tx.document.create({
        data: {
          caseId,
          applicantId: erste.applicantId,
          originalName: name,
          storageKey: gespeichert.storageKey,
          mimeType: "application/pdf",
          sizeBytes: pdf.byteLength,
          pageCount: teile.length,
          uploadSource: erste.uploadSource,
          // Dieselben Bytes wurden bereits geprueft - kein zweiter Virenscan.
          scanStatus: erste.scanStatus,
          scanEngine: erste.scanEngine,
          scannedAt: erste.scannedAt,
          documentType: input.vermuteterTyp ?? undefined,
          // Ein gebuendeltes Dokument wird nicht auf Aufteilung untersucht.
          splitStatus: "fertig",
        },
      });
      await tx.document.updateMany({
        where: { id: { in: documentIds } },
        data: { zusammengefuegtInId: erzeugt.id, reviewStatus: "ersetzt" },
      });
      if (input.buendelId) {
        await tx.documentBuendel.deleteMany({ where: { id: input.buendelId, caseId } });
      }
      return erzeugt;
    });

    // Analyse im Hintergrund - der Klick soll nicht warten. Die Buendelung ist
    // an dieser Stelle festgeschrieben: scheitert nur die Einplanung, darf das
    // den Erfolg nicht kippen.
    try {
      after(() => analysiereDokument(neu.id));
    } catch (e) {
      console.error(`[buendelung] Analyse von ${neu.id} konnte nicht eingeplant werden:`, e);
    }

    return { ok: true, documentId: neu.id, seiten: teile.length };
  } catch (e) {
    // Kein Muell im Speicher, und der Fall bleibt exakt so, wie er war.
    await storage.remove(gespeichert.storageKey).catch(() => undefined);
    console.error(`[buendelung] Zusammenfuegen im Fall ${caseId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Das Zusammenfügen ist fehlgeschlagen." };
  }
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-zusammenfuegen-db.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/buendelung/service.ts tests/buendelung-zusammenfuegen-db.test.ts
git commit -m "feat(buendelung): Zusammenfuegen, alles oder nichts"
```

---

## Task 9: Rückgängig

**Files:**
- Modify: `src/lib/buendelung/service.ts` (neue Funktion)
- Test: `tests/buendelung-rueckgaengig-db.test.ts`

**Interfaces:**
- Consumes: `getStorage`
- Produces: `macheRueckgaengig(documentId: string, organizationId: string): Promise<{ ok: true; seiten: number } | { ok: false; grund: string }>`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/buendelung-rueckgaengig-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});
vi.mock("next/server", () => ({ after: () => undefined }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Echtes 800x1200-JPEG aus tests/fixtures - kein Bild-Encoder im Test noetig. */
const jpeg = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-hoch.jpg"));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündelung rückgängig machen (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let storage: any;
  let fuegeZusammen: (input: any) => Promise<any>;
  let macheRueckgaengig: (documentId: string, orgId: string) => Promise<any>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-zurueck" } });
    orgId = org.id;
    ({ fuegeZusammen, macheRueckgaengig } = await import("@/lib/buendelung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  let nr = 0;
  async function gebuendelterFall() {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: `UP-TEST-BR${++nr}`, buendelStatus: "fertig" },
    });
    const seiten = [];
    for (const name of ["a.jpg", "b.jpg"]) {
      const buffer = jpeg();
      const stored = await storage.put({ organizationId: orgId, caseId: c.id, originalName: name, mimeType: "image/jpeg", buffer });
      seiten.push(
        await prisma.document.create({
          data: {
            caseId: c.id,
            originalName: name,
            storageKey: stored.storageKey,
            mimeType: "image/jpeg",
            sizeBytes: buffer.byteLength,
            uploadSource: "kunde",
            pageCount: 1,
            scanStatus: "virus_scan_clean",
            ocrStatus: "fertig",
            readable: true,
          },
        })
      );
    }
    const ergebnis = await fuegeZusammen({
      caseId: c.id,
      organizationId: orgId,
      documentIds: seiten.map((s: any) => s.id),
      titel: "Gehaltsabrechnung",
    });
    return { caseId: c.id, seiten, zielId: ergebnis.documentId };
  }

  it("stellt den Ausgangszustand her", async () => {
    const { caseId, seiten, zielId } = await gebuendelterFall();
    const ziel = await prisma.document.findUnique({ where: { id: zielId } });

    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);

    expect(await prisma.document.findUnique({ where: { id: zielId } })).toBeNull();
    expect(await storage.get(ziel.storageKey)).toBeNull();

    for (const s of seiten) {
      const zurueck = await prisma.document.findUnique({ where: { id: s.id } });
      expect(zurueck.reviewStatus).toBe("offen");
      expect(zurueck.zusammengefuegtInId).toBeNull();
    }

    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // Ein neuer Lauf muss moeglich sein - sonst waeren die Seiten frei, aber
    // niemand wuerde sie mehr ansehen.
    expect(c.buendelStatus).toBe("ausstehend");
  });

  it("weist ein bereits freigegebenes Dokument ab", async () => {
    const { zielId } = await gebuendelterFall();
    await prisma.document.update({ where: { id: zielId }, data: { reviewStatus: "akzeptiert" } });
    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/freigegeben/i);
  });

  it("weist ein Dokument ohne Quellseiten ab", async () => {
    const { seiten } = await gebuendelterFall();
    const ergebnis = await macheRueckgaengig(seiten[0].id, orgId);
    expect(ergebnis.ok).toBe(false);
  });

  it("weist eine fremde Organisation ab", async () => {
    const { zielId } = await gebuendelterFall();
    expect((await macheRueckgaengig(zielId, "fremde-org")).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-rueckgaengig-db.test.ts`
Expected: FAIL — `macheRueckgaengig is not a function`

- [ ] **Step 3: Rückgängig schreiben**

Ans Ende von `src/lib/buendelung/service.ts`:

```ts
/**
 * Nimmt eine Buendelung zurueck: das erzeugte PDF verschwindet, die
 * Einzelseiten stehen wieder auf offen.
 *
 * Das Sicherheitsnetz zur schlanken Vorschlagsliste. Ohne diesen Weg waere
 * eine falsche Gruppierung eine Sackgasse - deshalb wird beim Zusammenfuegen
 * auch nie eine Quelldatei geloescht.
 *
 * Nach der Freigabe nicht mehr moeglich: wer freigegeben hat, hat entschieden;
 * der Weg zurueck fuehrt dann ueber die Wiedereroeffnung.
 */
export async function macheRueckgaengig(
  documentId: string,
  organizationId: string
): Promise<{ ok: true; seiten: number } | { ok: false; grund: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: { organizationId } },
    select: {
      id: true,
      caseId: true,
      storageKey: true,
      reviewStatus: true,
      quellseiten: { select: { id: true } },
    },
  });
  if (!doc) return { ok: false, grund: "Dokument nicht gefunden." };
  if (doc.quellseiten.length === 0) {
    return { ok: false, grund: "Dieses Dokument ist nicht aus Einzelseiten entstanden." };
  }
  if (doc.reviewStatus !== "offen") {
    return { ok: false, grund: "Das Dokument ist bereits freigegeben – bitte zuerst wieder öffnen." };
  }

  const quellIds = doc.quellseiten.map((q) => q.id);
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { id: { in: quellIds } },
      data: { zusammengefuegtInId: null, reviewStatus: "offen" },
    });
    await tx.document.delete({ where: { id: doc.id } });
    // Ein Lauf startet damit nicht von selbst; er kommt beim naechsten Upload
    // oder auf "Erneut pruefen". Automatisch neu zu gruppieren waere falsch -
    // die KI kaeme auf denselben Vorschlag, den der Vermittler gerade
    // zurueckgenommen hat.
    await tx.case.update({
      where: { id: doc.caseId },
      data: { buendelStatus: "ausstehend", buendelStatusAm: null },
    });
  });

  // Erst nach der Transaktion: eine geloeschte Datei bei einem Rollback waere
  // nicht wiederherstellbar, eine liegengebliebene dagegen harmlos.
  await getStorage()
    .remove(doc.storageKey)
    .catch((e) => console.error(`[buendelung] Datei ${doc.storageKey} nicht entfernt:`, e));

  return { ok: true, seiten: quellIds.length };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-rueckgaengig-db.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/buendelung/service.ts tests/buendelung-rueckgaengig-db.test.ts
git commit -m "feat(buendelung): Rueckgaengig als Sicherheitsnetz"
```

---

## Task 10: Server-Actions

**Files:**
- Create: `src/lib/actions/buendelung.ts`
- Test: manuell (Steps 4–5); die Fachlogik ist in Tasks 5–9 abgedeckt

**Interfaces:**
- Consumes: `erkenneBuendel`, `fuegeZusammen`, `macheRueckgaengig`; `requireCaseAccess` aus `@/lib/auth/context`; `audit` aus `@/lib/audit`
- Produces (alle nehmen `FormData`, geben `Promise<void>` zurück):
  - `buendelZusammenfuegenAction`, Felder: `caseId`, `buendelId`
  - `buendelVerwerfenAction`, Felder: `caseId`, `buendelId`
  - `buendelErneutPruefenAction`, Feld: `caseId`
  - `seitenZusammenfuegenAction`, Felder: `caseId`, `documentIds` (kommagetrennt)
  - `buendelRueckgaengigAction`, Felder: `caseId`, `documentId`

- [ ] **Step 1: Die Actions schreiben**

Erstelle `src/lib/actions/buendelung.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { erkenneBuendel, fuegeZusammen, macheRueckgaengig } from "@/lib/buendelung/service";
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Fuegt einen KI-Vorschlag zusammen - nur auf Klick. Die Erkennung schlaegt
 * vor, entschieden wird hier.
 */
export async function buendelZusammenfuegenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const buendelId = String(formData.get("buendelId") ?? "");
  if (!caseId || !buendelId) return;
  const { ctx } = await requireCaseAccess(caseId);

  const buendel = await prisma.documentBuendel.findFirst({
    where: { id: buendelId, caseId },
    include: { seiten: { orderBy: { position: "asc" }, select: { documentId: true } } },
  });
  if (!buendel) return;

  const ergebnis = await fuegeZusammen({
    caseId,
    organizationId: ctx.organizationId,
    documentIds: buendel.seiten.map((s) => s.documentId),
    titel: buendel.titel,
    vermuteterTyp: (buendel.vermuteterTyp as DocumentType | null) ?? null,
    buendelId: buendel.id,
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: ergebnis.documentId,
      metadata: { gebuendeltAus: ergebnis.seiten, quelle: "vorschlag" },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}

/** Vorschlag verwerfen: die Einzelseiten bleiben unveraendert liegen. */
export async function buendelVerwerfenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const buendelId = String(formData.get("buendelId") ?? "");
  if (!caseId || !buendelId) return;
  await requireCaseAccess(caseId);
  await prisma.documentBuendel.deleteMany({ where: { id: buendelId, caseId } });
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Den fallweiten Lauf noch einmal anstossen - fuer den Fall, dass ein
 * Vorschlag verworfen wurde, Seiten nachkamen oder die Erkennung nichts fand.
 */
export async function buendelErneutPruefenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;
  await requireCaseAccess(caseId);
  // Die Sperre zuruecksetzen, sonst kehrt der Lauf still um.
  await prisma.case.update({
    where: { id: caseId },
    data: { buendelStatus: "ausstehend", buendelStatusAm: null },
  });
  await erkenneBuendel(caseId);
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Von Hand ausgewaehlte Seiten zusammenfuegen - der Notausgang, wenn die KI
 * danebenliegt. Die Reihenfolge ist die der Tabelle (Uploadzeit).
 */
export async function seitenZusammenfuegenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const documentIds = String(formData.get("documentIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!caseId || documentIds.length < 2) return;
  const { ctx } = await requireCaseAccess(caseId);

  // Der Titel kommt aus dem erkannten Typ der ersten Seite; ohne Typ ein
  // neutraler Name, den der Vermittler danach ueber die Typ-Auswahl schaerft.
  const erste = await prisma.document.findFirst({
    where: { id: documentIds[0], caseId },
    select: { documentType: true },
  });
  const typ = (erste?.documentType as DocumentType | null) ?? null;
  const { DOCUMENT_TYPE_LABELS } = await import("@/lib/domain/enums");
  const titel = typ ? DOCUMENT_TYPE_LABELS[typ] : "Zusammengefügtes Dokument";

  const ergebnis = await fuegeZusammen({
    caseId,
    organizationId: ctx.organizationId,
    documentIds,
    titel,
    vermuteterTyp: typ,
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: ergebnis.documentId,
      metadata: { gebuendeltAus: ergebnis.seiten, quelle: "handauswahl" },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}

/** Eine Buendelung zuruecknehmen. */
export async function buendelRueckgaengigAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  if (!caseId || !documentId) return;
  const { ctx } = await requireCaseAccess(caseId);

  const ergebnis = await macheRueckgaengig(documentId, ctx.organizationId);
  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: documentId,
      metadata: { buendelungZurueckgenommen: ergebnis.seiten },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Step 2: Prüfen, dass `document.reclassified` eine gültige Audit-Aktion ist**

Run: `grep -n "reclassified" src/lib/audit.ts src/lib/domain/enums.ts`
Expected: Der Wert existiert (er wird bereits von `aufteilenAction` benutzt). Falls die Audit-Aktionen als Union getypt sind und ein passenderer Wert existiert, diesen verwenden — aber keinen neuen Enum-Wert erfinden, ohne das Schema zu erweitern.

- [ ] **Step 3: Typecheck und Lint**

Run: `npm run typecheck && npm run lint`
Expected: Keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/buendelung.ts
git commit -m "feat(buendelung): Server-Actions - entschieden wird auf Klick"
```

---

## Task 11: Die Vorschlagskarte

**Files:**
- Create: `src/components/case/buendel-vorschlag.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Dokumenten-Query ~Zeile 161–170; Reiter „Dokumente" oberhalb der Tabelle ~Zeile 620–635)
- Test: manuell im Browser

**Interfaces:**
- Consumes: Actions aus `@/lib/actions/buendelung`; `SubmitButton` aus `@/components/ui/submit-button`
- Produces: `<BuendelVorschlagKarte caseId status buendel />` mit
  `buendel: Array<{ id: string; titel: string; seiten: Array<{ name: string }> }>` und
  `status: "ausstehend" | "laeuft" | "fertig" | "fehler"`

- [ ] **Step 1: Die Karte schreiben**

Erstelle `src/components/case/buendel-vorschlag.tsx`:

```tsx
import { Layers } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  buendelZusammenfuegenAction,
  buendelVerwerfenAction,
  buendelErneutPruefenAction,
} from "@/lib/actions/buendelung";

export interface BuendelView {
  id: string;
  titel: string;
  /** Die Quellseiten IN DER VORGESCHLAGENEN REIHENFOLGE. */
  seiten: Array<{ name: string }>;
}

/**
 * Vorschlag, Einzelseiten zu Dokumenten zu buendeln.
 *
 * Je Buendel eigene Knoepfe, bewusst nicht alles oder nichts: ein Buendel kann
 * richtig und das naechste falsch sein.
 *
 * Die vollstaendige Seitenliste steht VOR dem Klick da - wer aus zwoelf
 * Dateien drei macht, will vorher sehen, welche wohin geht und in welcher
 * Reihenfolge.
 */
export function BuendelVorschlagKarte({
  caseId,
  status,
  buendel,
}: {
  caseId: string;
  status: "ausstehend" | "laeuft" | "fertig" | "fehler";
  buendel: BuendelView[];
}) {
  // "Noch nicht geprueft" bekommt keine Karte - sonst stuende dort dauerhaft
  // ein Hinweis, der nichts sagt.
  if (status === "ausstehend") return null;

  const erneutPruefen = (
    <form action={buendelErneutPruefenAction}>
      <input type="hidden" name="caseId" value={caseId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="Wird geprüft …">
        Erneut prüfen
      </SubmitButton>
    </form>
  );

  if (status === "laeuft") {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
        Einzelseiten werden geprüft …
      </div>
    );
  }

  if (status === "fehler") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/[0.05] p-3">
        <p className="text-sm">Die Prüfung auf zusammengehörende Einzelseiten ist fehlgeschlagen.</p>
        {erneutPruefen}
      </div>
    );
  }

  const seitenGesamt = buendel.reduce((n, b) => n + b.seiten.length, 0);

  // Geprueft und nichts gefunden - das ist kein Fehler, aber es darf auch nicht
  // aussehen wie "nicht geprueft".
  if (buendel.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Keine zusammengehörenden Einzelseiten gefunden.
        </p>
        {erneutPruefen}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ai/30 bg-ai/[0.05] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 shrink-0 text-ai" aria-hidden />
          Aus {seitenGesamt} Einzelseiten könnten {buendel.length}{" "}
          {buendel.length === 1 ? "Dokument" : "Dokumente"} werden
        </p>
        {erneutPruefen}
      </div>

      <ul className="mt-2 space-y-2">
        {buendel.map((b) => (
          <li key={b.id} className="rounded-md border bg-card p-2.5">
            <p className="text-sm font-medium">
              {b.titel} <span className="font-normal text-muted-foreground">· {b.seiten.length} Seiten</span>
            </p>
            {/* Die Reihenfolge IST die Aussage - deshalb nummeriert. */}
            <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {b.seiten.map((s, i) => (
                <li key={`${b.id}-${i}`}>
                  {i + 1}. {s.name}
                </li>
              ))}
            </ol>
            <div className="mt-2 flex gap-2">
              <form action={buendelZusammenfuegenAction}>
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="buendelId" value={b.id} />
                <SubmitButton size="sm" pendingLabel="Wird zusammengefügt …">
                  Zusammenfügen
                </SubmitButton>
              </form>
              <form action={buendelVerwerfenAction}>
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="buendelId" value={b.id} />
                <SubmitButton size="sm" variant="ghost">
                  Verwerfen
                </SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> **Zur Farbe:** Die Palette kennt `primary`, `success`, `warning`, `ai`,
> `destructive` — **kein `info`**. Für einen KI-Vorschlag ist `ai` die richtige
> Rolle (die Aufteilungskarte nutzt `warning`, weil sie vor einer Sammeldatei
> warnt; hier wird nichts gewarnt, sondern etwas vorgeschlagen). Und: **nie
> `text-ai-foreground` auf farbigem Grund** — die `-foreground`-Falle ist im
> Projekt dokumentiert.

- [ ] **Step 3: Die Daten in der Fallakte laden**

In `src/app/(app)/cases/[id]/page.tsx` den Dokumenten-Query um die Bündelung erweitern (die vorhandene `prisma.document.findMany` im `Promise.all`):

```ts
    prisma.document.findMany({
      where: { caseId: id },
      include: {
        warnings: true,
        splitSegmente: {
          orderBy: { reihenfolge: "asc" },
          select: { vonSeite: true, bisSeite: true, titel: true },
        },
        // Fuer den Rueckgaengig-Knopf: nur die Zahl, nicht die Zeilen.
        _count: { select: { quellseiten: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
```

Und im selben `Promise.all` einen weiteren Eintrag anhängen (Destrukturierung oben entsprechend um `buendelVorschlaege` erweitern):

```ts
    prisma.documentBuendel.findMany({
      where: { caseId: id },
      orderBy: { reihenfolge: "asc" },
      include: {
        seiten: {
          orderBy: { position: "asc" },
          select: { document: { select: { generatedName: true, originalName: true } } },
        },
      },
    }),
```

`caseRow` lädt `buendelStatus` bereits mit, sofern kein `select` es einschränkt — prüfen und ggf. ergänzen.

- [ ] **Step 4: Die Karte einbinden**

Import ergänzen:

```ts
import { BuendelVorschlagKarte } from "@/components/case/buendel-vorschlag";
```

Im Reiter `dokumente`, direkt über der `<Table>` (dort, wo auch `DocumentsProcessing` steht):

```tsx
                  <BuendelVorschlagKarte
                    caseId={id}
                    status={caseRow.buendelStatus as "ausstehend" | "laeuft" | "fertig" | "fehler"}
                    buendel={buendelVorschlaege.map((b) => ({
                      id: b.id,
                      titel: b.titel,
                      seiten: b.seiten.map((s) => ({
                        name: s.document.generatedName ?? s.document.originalName,
                      })),
                    }))}
                  />
```

- [ ] **Step 5: Das Polling erweitern**

`DocumentsProcessing` lädt die Seite alle vier Sekunden neu, solange etwas verarbeitet wird. Der Bündel-Lauf startet erst NACH der letzten Dokumentanalyse — ohne Erweiterung stünde die Karte erst nach manuellem Neuladen da. In `src/app/(app)/cases/[id]/page.tsx` an der Stelle, wo `processingCount` berechnet wird:

```ts
  // Der Buendel-Lauf startet erst, wenn die letzte Dokumentanalyse fertig ist.
  // Ohne ihn im Polling erschiene die Vorschlagskarte erst nach manuellem
  // Neuladen.
  const buendelLaeuft = caseRow.buendelStatus === "laeuft";
```

Und an der Stelle, wo `<DocumentsProcessing count={processingCount} />` gerendert wird, die Bedingung erweitern:

```tsx
                  {(processingCount > 0 || buendelLaeuft) && (
                    <DocumentsProcessing count={processingCount} />
                  )}
```

Falls die bestehende Bedingung anders aussieht, sinngemäß anpassen — entscheidend ist, dass bei `buendelStatus === "laeuft"` weiter gepollt wird.

- [ ] **Step 6: Typecheck, Lint und Sichtprüfung**

```bash
npm run typecheck && npm run lint && npm run dev
```

Im Browser: Fall öffnen, Reiter „Dokumente". Erwartet: Bei einem Fall ohne Lauf keine Karte; nach einem Upload mehrerer Fotos erscheint erst „Einzelseiten werden geprüft …", dann die Vorschlagskarte mit nummerierten Seiten je Bündel. „Zusammenfügen" erzeugt ein PDF-Dokument in der Tabelle, die Quellzeilen stehen auf „ersetzt".

- [ ] **Step 7: Commit**

```bash
git add src/components/case/buendel-vorschlag.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(buendelung): Vorschlagskarte - je Buendel wird einzeln entschieden"
```

---

## Task 12: Auswahl von Hand

**Files:**
- Create: `src/components/case/seiten-auswahl.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Dokumententabelle)
- Test: manuell im Browser

**Interfaces:**
- Consumes: `seitenZusammenfuegenAction` aus `@/lib/actions/buendelung`
- Produces: `<SeitenAuswahl caseId kandidaten>{...}</SeitenAuswahl>` — Client-Komponente, die Kästchen und Leiste um die Tabelle legt; `kandidaten: string[]` sind die Dokument-IDs, die ankreuzbar sind.

- [ ] **Step 1: Die Komponente schreiben**

Erstelle `src/components/case/seiten-auswahl.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { seitenZusammenfuegenAction } from "@/lib/actions/buendelung";

/**
 * Auswahlkaestchen an den Einzelseiten plus die Leiste zum Zusammenfuegen.
 *
 * Der Notausgang, wenn die KI danebenliegt. Die Reihenfolge ist die der
 * Tabelle (Uploadzeit) - wer eine andere braucht, faedelt ueber den
 * KI-Vorschlag oder macht danach "Rueckgaengig".
 *
 * Der Auswahlzustand wird bewusst NICHT gespeichert: eine halb angehakte
 * Auswahl, die einen Seitenwechsel ueberlebt, ist eine Falle, keine Hilfe.
 */
export function SeitenAuswahl({
  caseId,
  kandidaten,
  children,
}: {
  caseId: string;
  /** Dokument-IDs, die angehakt werden duerfen - in Tabellenreihenfolge. */
  kandidaten: string[];
  /** Die Tabelle. Bekommt die Kaestchen ueber die Render-Funktion unten. */
  children: (props: {
    istKandidat: (id: string) => boolean;
    istGewaehlt: (id: string) => boolean;
    umschalten: (id: string) => void;
  }) => React.ReactNode;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const erlaubt = new Set(kandidaten);

  const umschalten = (id: string) =>
    setGewaehlt((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));

  // In Tabellenreihenfolge, nicht in Anklickreihenfolge: die Seitenfolge soll
  // vorhersagbar sein.
  const inReihenfolge = kandidaten.filter((id) => gewaehlt.includes(id));

  return (
    <div className="space-y-3">
      {inReihenfolge.length >= 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ai/30 bg-ai/[0.05] p-3">
          <p className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 shrink-0 text-ai" aria-hidden />
            {inReihenfolge.length} Seiten ausgewählt
          </p>
          <div className="flex gap-2">
            <form action={seitenZusammenfuegenAction}>
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="documentIds" value={inReihenfolge.join(",")} />
              <SubmitButton size="sm" pendingLabel="Wird zusammengefügt …">
                Als ein Dokument zusammenfügen
              </SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setGewaehlt([])}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Auswahl aufheben
            </button>
          </div>
        </div>
      )}
      {children({
        istKandidat: (id) => erlaubt.has(id),
        istGewaehlt: (id) => gewaehlt.includes(id),
        umschalten,
      })}
    </div>
  );
}
```

- [ ] **Step 2: In die Fallakte einbinden**

Import ergänzen:

```ts
import { SeitenAuswahl } from "@/components/case/seiten-auswahl";
```

Vor der Tabelle im Reiter „Dokumente" die Kandidatenliste bestimmen — dieselben Regeln wie serverseitig, damit nicht zwei Wahrheiten entstehen:

```ts
  // Dieselbe Regel wie in waehleKandidaten(): einzelne, offene, lesbare,
  // noch nicht gebuendelte Seiten. Zwei Wahrheiten waeren hier eine Falle -
  // wer die Regel aendert, aendert sie an beiden Stellen.
  const auswaehlbareSeiten = documents
    .filter(
      (d) =>
        (d.mimeType.startsWith("image/") || (d.mimeType === "application/pdf" && d.pageCount === 1)) &&
        d.reviewStatus === "offen" &&
        d.zusammengefuegtInId === null &&
        d.readable !== false
    )
    .map((d) => d.id);
```

Die `<Table>` in `<SeitenAuswahl>` einwickeln und in der ersten Tabellenspalte je Zeile das Kästchen rendern:

```tsx
<SeitenAuswahl caseId={id} kandidaten={auswaehlbareSeiten}>
  {({ istKandidat, istGewaehlt, umschalten }) => (
    <Table>
      {/* … vorhandener Kopf, plus eine schmale erste Spalte … */}
      {/* je Zeile, als erste TableCell: */}
      <TableCell className="w-8">
        {istKandidat(d.id) ? (
          <input
            type="checkbox"
            checked={istGewaehlt(d.id)}
            onChange={() => umschalten(d.id)}
            aria-label={`${d.generatedName ?? d.originalName} zum Zusammenfügen auswählen`}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        ) : null}
      </TableCell>
    </Table>
  )}
</SeitenAuswahl>
```

Wichtig: Alle `colSpan`-Werte in dieser Tabelle (u. a. die Zeile mit `AufteilungVorschlag`, `colSpan={mehrereAntragsteller ? 6 : 5}`) um **eins** erhöhen — sonst rutscht das Layout.

Da `<SeitenAuswahl>` eine Client-Komponente ist und die Zeilen Server-Komponenten enthalten (`DocumentTypeSelect`, Formulare mit Server-Actions): Der Render-Prop-Aufbau reicht dafür nicht aus, wenn die Tabelle serverseitig gerendert wird. Falls der Build daran scheitert, die Kästchen stattdessen als eigenständige kleine Client-Komponente je Zeile bauen, die ihren Zustand über einen gemeinsamen React-Context hält, den `SeitenAuswahl` bereitstellt — dieselbe Aufteilung, nur mit Context statt Render-Prop.

- [ ] **Step 3: Typecheck, Lint und Sichtprüfung**

```bash
npm run typecheck && npm run lint && npm run dev
```

Im Browser: Zwei Fotos anhaken → die Leiste erscheint mit „2 Seiten ausgewählt". „Als ein Dokument zusammenfügen" erzeugt ein PDF; die Quellzeilen stehen auf „ersetzt" und verlieren ihr Kästchen. Ein freigegebenes Dokument und ein mehrseitiges PDF haben kein Kästchen.

- [ ] **Step 4: Commit**

```bash
git add src/components/case/seiten-auswahl.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(buendelung): Seiten von Hand auswaehlen - der Notausgang"
```

---

## Task 13: Rückgängig in der Dokumentzeile

**Files:**
- Create: `src/components/case/buendel-rueckgaengig.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Statusspalte der Dokumententabelle)
- Test: manuell im Browser

**Interfaces:**
- Consumes: `buendelRueckgaengigAction` aus `@/lib/actions/buendelung`; `d._count.quellseiten` aus dem Query in Task 11
- Produces: `<BuendelRueckgaengig caseId documentId seiten />`

- [ ] **Step 1: Den Knopf schreiben**

Erstelle `src/components/case/buendel-rueckgaengig.tsx`:

```tsx
import { Undo2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { buendelRueckgaengigAction } from "@/lib/actions/buendelung";

/**
 * Nimmt eine Buendelung zurueck.
 *
 * Das Sicherheitsnetz zur schlanken Vorschlagsliste: ohne diesen Knopf waere
 * eine falsche Gruppierung eine Sackgasse. Erscheint nur, solange das
 * Dokument nicht freigegeben ist - danach hat der Vermittler entschieden.
 */
export function BuendelRueckgaengig({
  caseId,
  documentId,
  seiten,
}: {
  caseId: string;
  documentId: string;
  seiten: number;
}) {
  return (
    <form action={buendelRueckgaengigAction}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="documentId" value={documentId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="Wird getrennt …">
        <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />
        Zurück zu {seiten} Einzelseiten
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: In die Statusspalte einbinden**

Import ergänzen:

```ts
import { BuendelRueckgaengig } from "@/components/case/buendel-rueckgaengig";
```

In der Statusspalte (`<TableCell className="sticky right-0 …">`), im Zweig `d.reviewStatus === "offen"`, neben „Freigeben" und „Felder ansehen":

```tsx
{d._count.quellseiten > 0 && (
  <BuendelRueckgaengig caseId={id} documentId={d.id} seiten={d._count.quellseiten} />
)}
```

Diese Spalte wächst dadurch. Sie ist bereits `sticky right-0` — nach dem Einbau im Browser prüfen, dass der Knopf bei langen Dateinamen nicht aus dem Bild geschoben wird (im Projekt ist genau das zweimal passiert): Fenster auf 1280 px stellen, einen Fall mit langem Dateinamen öffnen, sicherstellen, dass alle Knöpfe der Zeile sichtbar bleiben.

- [ ] **Step 3: Typecheck, Lint und Sichtprüfung**

```bash
npm run typecheck && npm run lint && npm run dev
```

Im Browser: Nach einem Zusammenfügen steht in der Zeile des neuen PDFs „Zurück zu 2 Einzelseiten". Ein Klick löscht das PDF, die beiden Fotos stehen wieder auf „offen". Nach „Freigeben" verschwindet der Knopf.

- [ ] **Step 4: Commit**

```bash
git add src/components/case/buendel-rueckgaengig.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(buendelung): Rueckgaengig dort, wo das Dokument liegt"
```

---

## Task 14: Gesamtlauf, Schema gegen Produktion, Deploy

**Files:**
- Modify: keine (nur Ausführung)
- Test: die gesamte Suite

- [ ] **Step 1: Die volle Testsuite ohne Datenbank**

Run: `npm test`
Expected: PASS. Schlägt etwas fehl, das vorher grün war, hier stoppen und beheben.

- [ ] **Step 2: Alle Datenbanktests der Bündelung**

Run: `RUN_DB_IT=1 npx vitest run tests/buendelung-schema-db.test.ts tests/buendelung-erkennung-db.test.ts tests/buendelung-anstoss-db.test.ts tests/buendelung-zusammenfuegen-db.test.ts tests/buendelung-rueckgaengig-db.test.ts tests/aufteilung-service-db.test.ts tests/aufteilung-teilen-db.test.ts`
Expected: PASS — auch die beiden Aufteilungstests, die durch die neue Ausnahme berührt sind.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Erfolgreich. Achte auf Fehler zur Grenze Server-/Client-Komponente aus Task 12.

- [ ] **Step 4: Das Schema gegen die Produktionsdatenbank**

Zuerst trocken:

Run: `scripts/supabase-sql.sh sql/2026-08-28-buendelung.sql --dry-run`

Dann echt:

Run: `scripts/supabase-sql.sh sql/2026-08-28-buendelung.sql`
Expected: Läuft durch. NIE `prisma db push` oder den vollen `migrate diff` gegen Produktion.

- [ ] **Step 5: Gegenprüfen, dass die Spalten wirklich da sind**

```bash
cat > /tmp/pruefe-buendelung.sql <<'SQL'
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'cases' AND column_name IN ('buendelStatus','buendelStatusAm');
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('document_buendel','document_buendel_seiten');
SQL
scripts/supabase-sql.sh /tmp/pruefe-buendelung.sql
```

Expected: Beide Spalten und beide Tabellen werden gemeldet. Fehlt etwas, NICHT deployen.

- [ ] **Step 6: Deployen**

```bash
git push origin main
```

Vercel baut automatisch von `main`. Danach nach der Regel aus `verify-deployed-claims` gegenprüfen, statt „ist live" zu behaupten:

```bash
git merge-base --is-ancestor HEAD origin/main && echo "in main"
npx vercel ls --prod | head -5
```

- [ ] **Step 7: Ein echter Durchlauf gegen Produktion**

Auf baufidesk.de einen Testfall öffnen, drei Fotos einer mehrseitigen Unterlage hochladen und beobachten: „Einzelseiten werden geprüft …" → Vorschlagskarte → „Zusammenfügen" → ein PDF in der Liste, die drei Fotos auf „ersetzt" → „Zurück zu 3 Einzelseiten" stellt den Ausgangszustand her.

Erst nach diesem Durchlauf gilt das Feature als fertig — nicht nach dem Deploy.

---

## Selbstprüfung des Plans

**Abdeckung der Spec:** Problem und Ziel → Tasks 1–14. Fallweiter Anstoß mit Sperre → Task 5 + 6. Kandidatenregeln → Task 2. KI-Vertrag → Task 4. Die fünf Prüfregeln inkl. Zeitraum-Sperre → Task 3. Vorschlagskarte samt Statustabelle → Task 11. Auswahl von Hand → Task 12. Zusammenfügen alles-oder-nichts → Task 8. PDF-Bau A4/quer → Task 7. Ausnahme in der Aufteilung → Task 6. Rückgängig → Task 9 + 13. Datenmodell → Task 1. Kundenseite bleibt unberührt: in keinem Task angefasst — korrekt.

**Bekannte Unschärfe:** Task 12, Schritt 2 nennt zwei Wege (Render-Prop bzw. React-Context), weil die Grenze zwischen Server- und Client-Komponente in der bestehenden Tabelle erst beim Bauen sichtbar wird. Das ist bewusst und kein Platzhalter — die Testabsicht und die Oberfläche sind in beiden Fällen dieselbe.
