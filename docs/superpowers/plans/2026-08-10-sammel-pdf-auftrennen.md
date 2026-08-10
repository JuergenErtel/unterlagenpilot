# Sammel-PDFs auftrennen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Kunden-PDF mit mehreren Dokumenten darin wird erkannt und auf Klick in einzelne, normal verarbeitete Dokumente getrennt.

**Architecture:** Ein KI-Aufruf über die ersten Zeilen jeder Seite schlägt Segmente vor; eine deterministische Schutzregel entscheidet, ob daraus überhaupt ein Vorschlag wird. Das Auftrennen selbst kopiert Seitenbereiche mit `pdf-lib` in neue Dateien — erst wenn alle gespeichert sind, entstehen die Datensätze.

**Tech Stack:** Next.js App Router, Prisma 6 / PostgreSQL (Supabase, Schema `unterlagenpilot`), Vitest, `pdf-lib` (neu), `pdfkit` (vorhanden, nur für Testdaten).

**Spec:** `docs/superpowers/specs/2026-08-10-sammel-pdf-auftrennen-design.md`

## Global Constraints

- **Im Zweifel nicht auftrennen.** Fällt eine der fünf Schutzbedingungen durch, gibt es keinen Vorschlag. Ein zerrissenes Dokument kostet mehr Zeit, als das Auftrennen spart.
- **Die Schutzregel steht im Code, nicht im Prompt.** Die KI liefert Segmente; ob sie taugen, entscheidet `pruefeSegmente`.
- **Alles oder nichts.** Erst alle Teildateien speichern, dann die Datensätze anlegen. Scheitert eine Datei, werden die bereits abgelegten Objekte entfernt und nichts verändert sich.
- **Nichts ohne Freigabe.** Kein automatisches Auftrennen.
- **Ein Fehlschlag der Erkennung darf nichts mitreißen** — weder OCR noch Extraktion noch den Detektiv. Sichtbar über `splitStatus`, nie stillschweigend.
- **Kein zweiter Virenscan.** Die Kinder erben den Scan-Status der bereits geprüften Bytes.
- **Deutsch in allem, was der Nutzer sieht.**
- **Schemaänderungen** über `scripts/supabase-sql.sh`, nie `prisma db push`.
- **Testlauf:** `npx vitest run <datei>`, `npm test`, `npm run typecheck`. Kein `npm run lint` — keine ESLint-Konfiguration im Projekt.

---

## File Structure

**Neu — `src/lib/aufteilung/`** (Feature-Ordner wie `detektiv/` und `machbarkeit/`):

| Datei | Verantwortung |
|---|---|
| `types.ts` | `SegmentVorschlag`, Schwellenwerte |
| `pruefung.ts` | die fünf Schutzbedingungen als reine Funktion |
| `schema.ts` | Zod-Vertrag der KI-Antwort |
| `service.ts` | Erkennungslauf und Auftrennen (mit Datenbank und Speicher) |

**Geändert:**

| Datei | Änderung |
|---|---|
| `prisma/schema.prisma` | `Document.splitStatus`, `Document.aufgeteiltAusId`, Modell `DocumentSplitSegment` |
| `src/lib/detektiv/completeness.ts` | `SEITEN_MUSTER` exportieren |
| `src/lib/ai/service.ts` | Methode `erkenneDokumentgrenzen` |
| `src/lib/ai/mock-provider.ts` | Mock-Zweig `dokumentgrenzen` |
| `src/lib/documents/pipeline.ts` | `analysiereDokument` exportieren, Erkennung anstoßen |
| `src/lib/checklists/engine.ts`, `src/lib/cases/cockpit.ts` | `ersetzt` ausschließen (Altlast) |
| `src/lib/actions/aufteilung.ts` (neu) | Server Actions |
| `src/components/case/aufteilung-vorschlag.tsx` (neu) | Oberfläche |
| `src/app/(app)/cases/[id]/page.tsx` | Vorschlag im Dokumente-Reiter |

**Reihenfolge:** Aufgaben 1–2 sind rein und ohne Datenbank. Erst danach Schema, Verdrahtung und Oberfläche.

---

### Task 1: Schutzregel

Der wichtigste Baustein: Er entscheidet, ob überhaupt ein Vorschlag entsteht.

**Files:**
- Create: `src/lib/aufteilung/types.ts`
- Create: `src/lib/aufteilung/pruefung.ts`
- Modify: `src/lib/detektiv/completeness.ts` (`SEITEN_MUSTER` exportieren)
- Test: `tests/aufteilung-pruefung.test.ts`

**Interfaces:**
- Produces:
  - `interface SegmentVorschlag { vonSeite: number; bisSeite: number; vermuteterTyp: DocumentType | null; titel: string; confidence: number }`
  - `const MIN_KONFIDENZ = 0.7`, `const MIN_SEITEN_FUER_PRUEFUNG = 3`
  - `function pruefeSegmente(segmente: SegmentVorschlag[], seitenzahl: number): { ok: true } | { ok: false; grund: string }`
  - aus `completeness.ts`: `export const SEITEN_MUSTER`

- [ ] **Step 1: Write the failing test**

```ts
// tests/aufteilung-pruefung.test.ts
import { describe, it, expect } from "vitest";
import { pruefeSegmente, MIN_KONFIDENZ } from "@/lib/aufteilung/pruefung";
import type { SegmentVorschlag } from "@/lib/aufteilung/types";

const seg = (over: Partial<SegmentVorschlag>): SegmentVorschlag => ({
  vonSeite: 1,
  bisSeite: 2,
  vermuteterTyp: "personalausweis",
  titel: "Personalausweis",
  confidence: 0.9,
  ...over,
});

describe("Schutzregel – wann ein Vorschlag entsteht", () => {
  it("nimmt eine saubere Aufteilung an", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(true);
  });
});

describe("Schutzregel – wann NICHT", () => {
  it("lehnt ein einzelnes Segment ab – das ist keine Aufteilung", () => {
    const r = pruefeSegmente([seg({ vonSeite: 1, bisSeite: 8 })], 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/zwei/i);
  });

  it("lehnt überlappende Bereiche ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 5, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 4, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/überschneid|luecke|lücke/i);
  });

  it("lehnt Lücken zwischen den Segmenten ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 5, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt ab, wenn die Segmente das Dokument nicht vollstaendig abdecken", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 5, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt ab, wenn alle Segmente denselben Typ haben – das ist EIN Dokument", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 4, vermuteterTyp: "teilungserklaerung" }),
        seg({ vonSeite: 5, bisSeite: 8, vermuteterTyp: "teilungserklaerung" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/Typ/i);
  });

  it("lehnt ab, wenn EIN Segment unsicher ist – kein Mittelwert", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", confidence: 0.99 }),
        seg({ vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug", confidence: MIN_KONFIDENZ - 0.01 }),
      ],
      8
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/unsicher|Konfidenz/i);
  });

  it("lehnt ein Segment mit ungueltigem Bereich ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 3, bisSeite: 1, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 4, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt Seitenzahlen ausserhalb des Dokuments ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 99, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("nimmt eine unsortierte Reihenfolge an, solange sie lueckenlos ist", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
      ],
      8
    );
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aufteilung-pruefung.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/aufteilung/pruefung"`

- [ ] **Step 3: Write the types**

```ts
// src/lib/aufteilung/types.ts
import type { DocumentType } from "@/lib/domain/enums";

/** Ein von der KI vorgeschlagenes Teildokument. Seiten 1-basiert, beide einschliesslich. */
export interface SegmentVorschlag {
  vonSeite: number;
  bisSeite: number;
  vermuteterTyp: DocumentType | null;
  /** Kundentauglicher Kurztitel fuer die Vorschlagsliste. */
  titel: string;
  confidence: number;
}

/**
 * Ab hier lohnt die Pruefung. Ein zweiseitiger Ausweis-Scan enthaelt nie
 * mehrere Dokumente.
 */
export const MIN_SEITEN_FUER_PRUEFUNG = 3;
```

- [ ] **Step 4: Write the guard**

```ts
// src/lib/aufteilung/pruefung.ts
import type { SegmentVorschlag } from "./types";

/**
 * Je Segment, nicht als Mittelwert: sonst zieht ein sehr sicheres Segment zwei
 * unsichere mit durch.
 */
export const MIN_KONFIDENZ = 0.7;

export type Pruefergebnis = { ok: true } | { ok: false; grund: string };

/**
 * Entscheidet, ob aus einer KI-Antwort ueberhaupt ein Vorschlag wird.
 *
 * Bewusst hier und nicht im Prompt: Ein langes Dokument sieht innen oft aus wie
 * viele Dokumente – eine Teilungserklaerung hat Abschnitte mit eigenen
 * Ueberschriften. Im Zweifel lieber kein Vorschlag; ein zerrissenes Dokument
 * kostet mehr Zeit, als das Auftrennen spart.
 */
export function pruefeSegmente(segmente: SegmentVorschlag[], seitenzahl: number): Pruefergebnis {
  if (segmente.length < 2) {
    return { ok: false, grund: "Weniger als zwei Segmente – das ist keine Aufteilung." };
  }

  for (const s of segmente) {
    if (!Number.isInteger(s.vonSeite) || !Number.isInteger(s.bisSeite)) {
      return { ok: false, grund: "Seitenangabe ist keine ganze Zahl." };
    }
    if (s.vonSeite < 1 || s.bisSeite > seitenzahl || s.vonSeite > s.bisSeite) {
      return { ok: false, grund: `Ungültiger Seitenbereich ${s.vonSeite}–${s.bisSeite}.` };
    }
    if (s.confidence < MIN_KONFIDENZ) {
      return { ok: false, grund: `Segment „${s.titel}" ist zu unsicher (Konfidenz ${s.confidence}).` };
    }
  }

  // Lueckenlos und ueberschneidungsfrei ueber das ganze Dokument.
  const sortiert = [...segmente].sort((a, b) => a.vonSeite - b.vonSeite);
  if (sortiert[0]!.vonSeite !== 1) {
    return { ok: false, grund: "Die Segmente beginnen nicht auf Seite 1 – es bliebe eine Lücke." };
  }
  if (sortiert[sortiert.length - 1]!.bisSeite !== seitenzahl) {
    return { ok: false, grund: "Die Segmente enden nicht auf der letzten Seite – es bliebe eine Lücke." };
  }
  for (let i = 1; i < sortiert.length; i++) {
    if (sortiert[i]!.vonSeite !== sortiert[i - 1]!.bisSeite + 1) {
      return { ok: false, grund: "Die Segmente überschneiden sich oder lassen eine Lücke." };
    }
  }

  // Nur ein Typ heisst: das ist EIN Dokument mit Abschnitten.
  const typen = new Set(sortiert.map((s) => s.vermuteterTyp ?? "unbekannt"));
  if (typen.size < 2) {
    return { ok: false, grund: "Alle Segmente haben denselben Typ – das ist ein Dokument, kein Stapel." };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Export the page pattern for reuse**

In `src/lib/detektiv/completeness.ts` die Konstante exportieren — sie wird in Aufgabe 4 als Hinweis für die KI wiederverwendet, statt ein zweites Mal geschrieben zu werden:

```ts
/** "Seite 12 von 37", "Seite 12/37", "Blatt 3/12" */
export const SEITEN_MUSTER = [
```

(nur `const` → `export const`, sonst unverändert)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/aufteilung-pruefung.test.ts tests/detektiv-completeness.test.ts && npm run typecheck`
Expected: PASS, 11 + 11 Tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/aufteilung/ src/lib/detektiv/completeness.ts tests/aufteilung-pruefung.test.ts
git commit -m "feat(aufteilung): Schutzregel fuer Dokumentgrenzen"
```

---

### Task 2: KI-Vertrag

**Files:**
- Create: `src/lib/aufteilung/schema.ts`
- Modify: `src/lib/ai/service.ts`
- Modify: `src/lib/ai/mock-provider.ts`
- Test: `tests/aufteilung-schema-vertrag.test.ts`

**Interfaces:**
- Produces:
  - `const dokumentgrenzenSchema` (Zod), `type DokumentgrenzenResult = { segmente: SegmentVorschlag[] }`
  - `aiService.erkenneDokumentgrenzen(seiten: Array<{ pageNumber: number; anfang: string; beginntNeu: boolean }>): Promise<DokumentgrenzenResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/aufteilung-schema-vertrag.test.ts
import { describe, it, expect } from "vitest";
import { dokumentgrenzenSchema } from "@/lib/aufteilung/schema";
import { AIService } from "@/lib/ai/service";
import type { AIProvider } from "@/lib/ai/types";

const gueltig = {
  segmente: [
    { vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", titel: "Personalausweis", confidence: 0.95 },
    { vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "Grundbuchauszug", confidence: 0.9 },
  ],
};

describe("KI-Antwortvertrag der Grenzerkennung", () => {
  it("nimmt eine gueltige Antwort an", () => {
    expect(dokumentgrenzenSchema.parse(gueltig).segmente).toHaveLength(2);
  });

  it("weist einen unbekannten Dokumenttyp zurueck", () => {
    const kaputt = { segmente: [{ ...gueltig.segmente[0], vermuteterTyp: "phantasie" }] };
    expect(() => dokumentgrenzenSchema.parse(kaputt)).toThrow();
  });

  it("erlaubt null als Typ – unbekannt ist besser als geraten", () => {
    const ohneTyp = { segmente: [{ ...gueltig.segmente[0], vermuteterTyp: null }] };
    expect(dokumentgrenzenSchema.parse(ohneTyp).segmente[0]!.vermuteterTyp).toBeNull();
  });

  it("weist nicht ganzzahlige Seitenzahlen zurueck", () => {
    const kaputt = { segmente: [{ ...gueltig.segmente[0], vonSeite: 1.5 }] };
    expect(() => dokumentgrenzenSchema.parse(kaputt)).toThrow();
  });

  it("akzeptiert eine leere Liste – nichts gefunden ist ein gueltiges Ergebnis", () => {
    expect(dokumentgrenzenSchema.parse({ segmente: [] }).segmente).toEqual([]);
  });
});

describe("AIService.erkenneDokumentgrenzen", () => {
  const stub = (antwort: unknown): AIProvider => ({
    name: "stub",
    isConfigured: () => true,
    completeJSON: async () => antwort,
  });

  it("liefert die validierten Segmente", async () => {
    const svc = new AIService(stub(gueltig));
    const out = await svc.erkenneDokumentgrenzen([
      { pageNumber: 1, anfang: "BUNDESREPUBLIK DEUTSCHLAND", beginntNeu: false },
      { pageNumber: 3, anfang: "Grundbuch von Musterstadt", beginntNeu: true },
    ]);
    expect(out.segmente).toHaveLength(2);
  });

  it("ruft die KI gar nicht erst auf, wenn keine Seiten uebergeben werden", async () => {
    let aufrufe = 0;
    const svc = new AIService({
      name: "zaehler",
      isConfigured: () => true,
      completeJSON: async () => {
        aufrufe++;
        return gueltig;
      },
    });
    const out = await svc.erkenneDokumentgrenzen([]);
    expect(aufrufe).toBe(0);
    expect(out.segmente).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aufteilung-schema-vertrag.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/aufteilung/schema"`

- [ ] **Step 3: Write the schema**

```ts
// src/lib/aufteilung/schema.ts
import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";

/**
 * Vertrag mit der KI. Sie schlaegt Grenzen vor – ob daraus ein Vorschlag wird,
 * entscheidet pruefeSegmente(), nicht der Prompt.
 */
export const segmentSchema = z.object({
  vonSeite: z.number().int().positive(),
  bisSeite: z.number().int().positive(),
  vermuteterTyp: z.enum(DOCUMENT_TYPES).nullable(),
  titel: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const dokumentgrenzenSchema = z.object({
  segmente: z.array(segmentSchema),
});

export type DokumentgrenzenResult = z.infer<typeof dokumentgrenzenSchema>;
```

`z.enum(DOCUMENT_TYPES)` verlangt ein `readonly [string, ...string[]]`. Meckert TypeScript, `z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]])` verwenden und den Grund als Kommentar dazuschreiben.

- [ ] **Step 4: Add the AIService method**

Import oben in `src/lib/ai/service.ts` ergänzen:

```ts
import { dokumentgrenzenSchema, type DokumentgrenzenResult } from "@/lib/aufteilung/schema";
```

Als letzte Methode der Klasse `AIService` (vor der schließenden `}`):

```ts
  /**
   * Erkennt, ob eine Datei mehrere Dokumente enthaelt.
   *
   * Bekommt je Seite nur die ersten Zeichen – bei 60 Seiten rund 5.000 Tokens
   * statt eines Volltexts. `beginntNeu` markiert Seiten, auf denen ein
   * Seitenzaehler wie "Seite 1 von 3" steht; das ist ein starker Hinweis auf
   * einen Dokumentanfang.
   */
  async erkenneDokumentgrenzen(
    seiten: Array<{ pageNumber: number; anfang: string; beginntNeu: boolean }>
  ): Promise<DokumentgrenzenResult> {
    if (seiten.length === 0) return { segmente: [] };

    const beschreibung = seiten
      .map((s) => `Seite ${s.pageNumber}${s.beginntNeu ? " [Seitenzaehler beginnt neu]" : ""}: ${s.anfang}`)
      .join("\n");

    return this.run(
      "dokumentgrenzen",
      dokumentgrenzenSchema,
      [
        "Du bekommst die Seitenanfaenge einer eingescannten Datei aus einer deutschen Baufinanzierung.",
        "Bestimme, ob die Datei MEHRERE eigenstaendige Dokumente enthaelt, und wo eines endet und das naechste beginnt.",
        "Die Segmente muessen das Dokument lueckenlos und ohne Ueberschneidung abdecken: das erste beginnt auf Seite 1, das letzte endet auf der letzten Seite.",
        "Ein langes Dokument mit Abschnitten (z. B. eine Teilungserklaerung mit Gemeinschaftsordnung) ist EIN Dokument – gib dann ein einziges Segment zurueck.",
        "Ein Hinweis '[Seitenzaehler beginnt neu]' spricht stark fuer einen Dokumentanfang.",
        "titel ist eine kurze deutsche Bezeichnung fuer die Anzeige. vermuteterTyp ist null, wenn unklar – nie geraten.",
        "confidence ist deine Sicherheit fuer GENAU dieses Segment.",
      ].join(" "),
      beschreibung,
      { seiten: seiten.length }
    );
  }
```

- [ ] **Step 5: Add the mock branch**

In `src/lib/ai/mock-provider.ts` im `switch (req.schemaName)` ergänzen:

```ts
      case "dokumentgrenzen":
        return {
          segmente: [
            { vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", titel: "Personalausweis", confidence: 0.95 },
            { vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "Grundbuchauszug", confidence: 0.9 },
          ],
        };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/aufteilung-schema-vertrag.test.ts && npm run typecheck`
Expected: PASS, 7 Tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/aufteilung/schema.ts src/lib/ai/service.ts src/lib/ai/mock-provider.ts tests/aufteilung-schema-vertrag.test.ts
git commit -m "feat(aufteilung): KI-Vertrag fuer Dokumentgrenzen"
```

---

### Task 3: Datenbankschema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-08-10-aufteilung.sql`

- [ ] **Step 1: Add the fields and the model**

Am Modell `Document` bei den Status-Feldern ergänzen:

```prisma
  // Erkennung, ob die Datei mehrere Dokumente enthaelt. Eigener Status, damit
  // "nicht geprueft" und "nichts gefunden" unterscheidbar bleiben.
  splitStatus          ProcessingStatus     @default(ausstehend)
```

Bei den Relationen von `Document` ergänzen:

```prisma
  /// Herkunftsdatei, falls dieses Dokument aus einer Aufteilung entstand.
  aufgeteiltAusId String?
  aufgeteiltAus   Document?  @relation("Aufteilung", fields: [aufgeteiltAusId], references: [id], onDelete: SetNull)
  teildokumente   Document[] @relation("Aufteilung")
  splitSegmente   DocumentSplitSegment[]
```

Am Ende der Datei:

```prisma
/**
 * Vorgeschlagene Aufteilung einer Sammeldatei. Lebt nur, bis der Vermittler
 * auftrennt oder verwirft – ausgefuehrt wird sie zu echten Dokumenten.
 */
model DocumentSplitSegment {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  reihenfolge   Int
  vonSeite      Int
  bisSeite      Int
  vermuteterTyp DocumentType?
  titel         String
  confidence    Float?

  createdAt DateTime @default(now())

  @@index([documentId])
  @@map("document_split_segments")
}
```

- [ ] **Step 2: Generate the client**

Run: `npx prisma generate && npm run typecheck`
Expected: Client erzeugt, keine Fehler

- [ ] **Step 3: Write the migration**

```sql
-- prisma/sql/2026-08-10-aufteilung.sql
-- Sammel-PDFs auftrennen: Erkennungsstatus, Herkunftsbezug, Segmentvorschlaege.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-aufteilung.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-aufteilung.sql
--
-- Rein additiv: zwei Spalten und eine Tabelle, kein DROP.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "splitStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "aufgeteiltAusId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_aufgeteiltAusId_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_aufgeteiltAusId_fkey"
      FOREIGN KEY ("aufgeteiltAusId") REFERENCES "documents"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_split_segments" (
  "id"            TEXT PRIMARY KEY,
  "documentId"    TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "reihenfolge"   INTEGER NOT NULL,
  "vonSeite"      INTEGER NOT NULL,
  "bisSeite"      INTEGER NOT NULL,
  "vermuteterTyp" "DocumentType",
  "titel"         TEXT NOT NULL,
  "confidence"    DOUBLE PRECISION,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "document_split_segments_documentId_idx" ON "document_split_segments"("documentId");
```

- [ ] **Step 4: Dry-run, apply, verify**

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-10-aufteilung.sql --dry-run`
Dann ohne `--dry-run`.

Gegenprüfen mit einer Datei `prisma/sql/pruefe-aufteilung.sql`:

```sql
SELECT 'tabelle' AS art, table_name AS name FROM information_schema.tables
WHERE table_schema = 'unterlagenpilot' AND table_name = 'document_split_segments'
UNION ALL
SELECT 'spalte', column_name FROM information_schema.columns
WHERE table_schema = 'unterlagenpilot' AND table_name = 'documents'
  AND column_name IN ('splitStatus', 'aufgeteiltAusId');
```

Run: `scripts/supabase-sql.sh prisma/sql/pruefe-aufteilung.sql`
Expected: drei Zeilen

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/sql/
git commit -m "feat(aufteilung): Schema fuer Segmentvorschlaege und Herkunftsbezug"
```

---

### Task 4: Erkennungslauf

**Files:**
- Create: `src/lib/aufteilung/service.ts`
- Modify: `src/lib/documents/pipeline.ts`
- Test: `tests/aufteilung-service-db.test.ts`

**Interfaces:**
- Consumes: `pruefeSegmente`, `MIN_SEITEN_FUER_PRUEFUNG`, `SEITEN_MUSTER`, `aiService.erkenneDokumentgrenzen`
- Produces: `async function erkenneAufteilung(documentId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/aufteilung-service-db.test.ts
import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 *   RUN_DB_IT=1 npx vitest run tests/aufteilung-service-db.test.ts
 */
describe.runIf(RUN)("Aufteilungserkennung (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let erkenneAufteilung: (id: string) => Promise<void>;

  const dokumentMitSeiten = async (n: number, mime = "application/pdf") => {
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "sammel.pdf",
        storageKey: `k-${Math.random()}`,
        mimeType: mime,
        sizeBytes: 1,
        uploadSource: "kunde",
        pageCount: n,
        ocrStatus: "fertig",
        pages: {
          create: Array.from({ length: n }, (_, i) => ({
            pageNumber: i + 1,
            ocrText: `Seite ${i + 1} von ${n} Beispielinhalt`,
          })),
        },
      },
    });
    return doc.id;
  };

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-aufteilung" } });
    const c = await prisma.case.create({ data: { organizationId: org.id, caseNumber: "UP-TEST-0002" } });
    caseId = c.id;
    ({ erkenneAufteilung } = await import("@/lib/aufteilung/service"));
  }, 180_000);

  it("legt bei einem Mehr-Dokumente-Stapel Segmente an", async () => {
    const id = await dokumentMitSeiten(8);
    await erkenneAufteilung(id);

    const segmente = await prisma.documentSplitSegment.findMany({ where: { documentId: id } });
    expect(segmente.length).toBeGreaterThanOrEqual(2);
    const doc = await prisma.document.findUnique({ where: { id } });
    expect(doc.splitStatus).toBe("fertig");
  });

  it("prueft ein zweiseitiges Dokument gar nicht erst", async () => {
    const id = await dokumentMitSeiten(2);
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
    const doc = await prisma.document.findUnique({ where: { id } });
    expect(doc.splitStatus).toBe("fertig"); // geprueft, nichts gefunden – kein Fehler
  });

  it("prueft Bilddateien nicht – die lassen sich nicht auftrennen", async () => {
    const id = await dokumentMitSeiten(8, "image/jpeg");
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
  });

  it("legt beim zweiten Lauf keine doppelten Segmente an", async () => {
    const id = await dokumentMitSeiten(8);
    await erkenneAufteilung(id);
    const ersteAnzahl = await prisma.documentSplitSegment.count({ where: { documentId: id } });
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(ersteAnzahl);
  });
});
```

Der Mock-Provider liefert Segmente 1–2 und 3–8 mit zwei verschiedenen Typen — passend zu einem achtseitigen Dokument.

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_IT=1 npx vitest run tests/aufteilung-service-db.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/aufteilung/service"`

- [ ] **Step 3: Write the detection**

```ts
// src/lib/aufteilung/service.ts
import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import { SEITEN_MUSTER } from "@/lib/detektiv/completeness";
import { pruefeSegmente } from "./pruefung";
import { MIN_SEITEN_FUER_PRUEFUNG, type SegmentVorschlag } from "./types";

/** Steht auf dieser Seite ein Seitenzaehler, der neu beginnt ("Seite 1 von 3")? */
function beginntNeu(text: string): boolean {
  for (const muster of SEITEN_MUSTER) {
    muster.lastIndex = 0;
    const treffer = muster.exec(text);
    if (treffer && /\b1\s*(?:von|\/)/i.test(treffer[0])) return true;
  }
  return false;
}

/**
 * Erkennt, ob eine Datei mehrere Dokumente enthaelt, und legt den Vorschlag ab.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Extraktion noch den Detektiv
 * mitreissen. Sichtbar wird er ueber splitStatus – "nicht geprueft" und
 * "nichts gefunden" duerfen nie gleich aussehen.
 */
export async function erkenneAufteilung(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        mimeType: true,
        pageCount: true,
        ocrStatus: true,
        pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
      },
    });
    if (!doc) return;

    const seitenzahl = doc.pageCount ?? doc.pages.length;
    const pruefbar =
      doc.mimeType === "application/pdf" &&
      seitenzahl >= MIN_SEITEN_FUER_PRUEFUNG &&
      doc.ocrStatus === "fertig" &&
      doc.pages.length > 0;

    if (!pruefbar) {
      // Geprueft und nichts zu tun – das ist kein Fehler.
      await prisma.document.update({ where: { id: documentId }, data: { splitStatus: "fertig" } });
      return;
    }

    await prisma.document.update({ where: { id: documentId }, data: { splitStatus: "laeuft" } });

    const seiten = doc.pages.map((p) => ({
      pageNumber: p.pageNumber,
      anfang: (p.ocrText ?? "").trim().slice(0, 300),
      beginntNeu: beginntNeu(p.ocrText ?? ""),
    }));

    const antwort = await aiService.erkenneDokumentgrenzen(seiten);
    const segmente = antwort.segmente as SegmentVorschlag[];
    const pruefung = pruefeSegmente(segmente, seitenzahl);

    await prisma.$transaction([
      // Ein erneuter Lauf ersetzt den alten Vorschlag, statt ihn zu verdoppeln.
      prisma.documentSplitSegment.deleteMany({ where: { documentId } }),
      ...(pruefung.ok
        ? [
            prisma.documentSplitSegment.createMany({
              data: [...segmente]
                .sort((a, b) => a.vonSeite - b.vonSeite)
                .map((s, i) => ({
                  documentId,
                  reihenfolge: i,
                  vonSeite: s.vonSeite,
                  bisSeite: s.bisSeite,
                  vermuteterTyp: s.vermuteterTyp,
                  titel: s.titel,
                  confidence: s.confidence,
                })),
            }),
          ]
        : []),
      prisma.document.update({ where: { id: documentId }, data: { splitStatus: "fertig" } }),
    ]);
  } catch (e) {
    console.error(`[aufteilung] Erkennung fuer Dokument ${documentId} fehlgeschlagen:`, e);
    await prisma.document
      .update({ where: { id: documentId }, data: { splitStatus: "fehler" } })
      .catch(() => undefined);
  }
}
```

- [ ] **Step 4: Hook it into the pipeline**

In `src/lib/documents/pipeline.ts` den Import ergänzen:

```ts
import { erkenneAufteilung } from "@/lib/aufteilung/service";
```

Und im vorhandenen Detektiv-Block in `processOcrAndAi` — die Erkennung läuft **vor** dem Detektiv, weil ein aufgetrenntes Dokument ohnehin neu geprüft wird:

```ts
  try {
    await erkenneAufteilung(documentId);
    await runReferenceExtraction(documentId);
    await reconcileCase(caseId);
  } catch (e) {
    console.error(`[pipeline] Nachlauf für Dokument ${documentId} fehlgeschlagen:`, e);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `RUN_DB_IT=1 npx vitest run tests/aufteilung-service-db.test.ts && npm run typecheck`
Expected: PASS, 4 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/aufteilung/service.ts src/lib/documents/pipeline.ts tests/aufteilung-service-db.test.ts
git commit -m "feat(aufteilung): Erkennungslauf im Hintergrund"
```

---

### Task 5: Das Auftrennen

**Files:**
- Modify: `package.json` (Abhängigkeit `pdf-lib`)
- Modify: `src/lib/aufteilung/service.ts`
- Modify: `src/lib/documents/pipeline.ts` (`analysiereDokument` exportieren)
- Modify: `src/lib/checklists/engine.ts`, `src/lib/cases/cockpit.ts` (Altlast)
- Test: `tests/aufteilung-teilen-db.test.ts`, `tests/checklist.test.ts`

**Interfaces:**
- Produces:
  - `async function teileAuf(documentId: string, organizationId: string): Promise<{ ok: true; anzahl: number } | { ok: false; grund: string }>`
  - aus `pipeline.ts`: `async function analysiereDokument(documentId: string): Promise<void>`

- [ ] **Step 1: Install the dependency**

Run: `npm install pdf-lib`
Expected: `pdf-lib` in `package.json` unter `dependencies`

- [ ] **Step 2: Write the failing test**

```ts
// tests/aufteilung-teilen-db.test.ts
import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Erzeugt ein echtes, mehrseitiges PDF mit dem vorhandenen pdfkit. */
async function baueTestPdf(seiten: number): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
    for (let i = 1; i <= seiten; i++) {
      doc.addPage().text(`Seite ${i}`);
    }
    doc.end();
  });
}

describe.runIf(RUN)("Auftrennen (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let orgId: string;
  let teileAuf: (id: string, orgId: string) => Promise<{ ok: boolean; anzahl?: number; grund?: string }>;
  let storage: any;

  beforeAll(async () => {
    process.env.STORAGE_PROVIDER = "local";
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-teilen" } });
    orgId = org.id;
    const c = await prisma.case.create({ data: { organizationId: orgId, caseNumber: "UP-TEST-0003" } });
    caseId = c.id;
    ({ teileAuf } = await import("@/lib/aufteilung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  const stapelAnlegen = async () => {
    const buffer = await baueTestPdf(8);
    const stored = await storage.put({
      organizationId: orgId,
      caseId,
      originalName: "sammel.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "sammel.pdf",
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        pageCount: 8,
        scanStatus: "virus_scan_clean",
        splitStatus: "fertig",
        segmente: undefined,
      },
    });
    await prisma.documentSplitSegment.createMany({
      data: [
        { documentId: doc.id, reihenfolge: 0, vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", titel: "Personalausweis", confidence: 0.95 },
        { documentId: doc.id, reihenfolge: 1, vonSeite: 3, bisSeite: 5, vermuteterTyp: "gehaltsabrechnung", titel: "Gehaltsabrechnung", confidence: 0.9 },
        { documentId: doc.id, reihenfolge: 2, vonSeite: 6, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "Grundbuchauszug", confidence: 0.9 },
      ],
    });
    return doc.id;
  };

  it("erzeugt aus acht Seiten drei Dokumente mit den richtigen Seitenzahlen", async () => {
    const id = await stapelAnlegen();
    const r = await teileAuf(id, orgId);
    expect(r.ok).toBe(true);
    expect(r.anzahl).toBe(3);

    const kinder = await prisma.document.findMany({
      where: { aufgeteiltAusId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(kinder).toHaveLength(3);
    expect(kinder.map((k: any) => k.pageCount)).toEqual([2, 3, 3]);
  });

  it("markiert das Original als ersetzt und behaelt es als Spur", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    const original = await prisma.document.findUnique({ where: { id } });
    expect(original).not.toBeNull();
    expect(original.reviewStatus).toBe("ersetzt");
  });

  it("vererbt den Virenscan-Status – dieselben Bytes werden nicht neu geprueft", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    const kinder = await prisma.document.findMany({ where: { aufgeteiltAusId: id } });
    for (const k of kinder) expect(k.scanStatus).toBe("virus_scan_clean");
  });

  it("raeumt den Vorschlag nach dem Auftrennen weg", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
  });

  it("lehnt ein Dokument ohne Vorschlag ab", async () => {
    const doc = await prisma.document.create({
      data: {
        caseId, originalName: "einzeln.pdf", storageKey: "k-einzeln",
        mimeType: "application/pdf", sizeBytes: 1, uploadSource: "kunde", pageCount: 3,
      },
    });
    const r = await teileAuf(doc.id, orgId);
    expect(r.ok).toBe(false);
  });

  it("veraendert nichts, wenn die Datei nicht im Speicher liegt", async () => {
    const buffer = await baueTestPdf(8);
    const doc = await prisma.document.create({
      data: {
        caseId, originalName: "weg.pdf", storageKey: "gibt-es-nicht",
        mimeType: "application/pdf", sizeBytes: buffer.byteLength, uploadSource: "kunde", pageCount: 8,
      },
    });
    await prisma.documentSplitSegment.createMany({
      data: [
        { documentId: doc.id, reihenfolge: 0, vonSeite: 1, bisSeite: 4, vermuteterTyp: "personalausweis", titel: "A", confidence: 0.9 },
        { documentId: doc.id, reihenfolge: 1, vonSeite: 5, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "B", confidence: 0.9 },
      ],
    });
    const r = await teileAuf(doc.id, orgId);
    expect(r.ok).toBe(false);

    // Nichts angefasst: kein Kind, Original unveraendert, Vorschlag noch da.
    expect(await prisma.document.count({ where: { aufgeteiltAusId: doc.id } })).toBe(0);
    const original = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(original.reviewStatus).toBe("offen");
    expect(await prisma.documentSplitSegment.count({ where: { documentId: doc.id } })).toBe(2);
  });
});
```

Im `stapelAnlegen` steht `segmente: undefined` als Platzhalter für ein Feld, das es nicht gibt — **diese Zeile beim Schreiben löschen**; sie stammt aus einem Entwurf.

- [ ] **Step 3: Run test to verify it fails**

Run: `RUN_DB_IT=1 npx vitest run tests/aufteilung-teilen-db.test.ts`
Expected: FAIL — `teileAuf is not a function`

- [ ] **Step 4: Export the analysis function**

In `src/lib/documents/pipeline.ts` nach `processOcrAndAi` ergänzen:

```ts
/**
 * Startet die Analyse (OCR, Klassifizierung, Extraktion, Nachlauf) fuer ein
 * bereits gespeichertes Dokument neu. Wird vom Auftrennen fuer jedes
 * Teildokument aufgerufen.
 */
export async function analysiereDokument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      applicantId: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
    },
  });
  if (!doc) return;

  const buffer = await getStorage().get(doc.storageKey);
  if (!buffer) {
    console.error(`[pipeline] Datei zu Dokument ${documentId} nicht auffindbar`);
    return;
  }

  await processOcrAndAi({
    documentId: doc.id,
    caseId: doc.caseId,
    applicantId: doc.applicantId,
    buffer,
    stored: { storageKey: doc.storageKey, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes },
    originalName: doc.originalName,
    applicantName: null,
  });
}
```

- [ ] **Step 5: Write the split**

An `src/lib/aufteilung/service.ts` anhängen:

```ts
import { after } from "next/server";
import { getStorage, objectPath } from "@/lib/storage";
import { analysiereDokument } from "@/lib/documents/pipeline";

/**
 * Trennt eine Sammeldatei entlang des freigegebenen Vorschlags auf.
 *
 * Alles oder nichts: Erst werden ALLE Teildateien gespeichert, dann erst
 * entstehen die Datensaetze. Ein halb aufgetrenntes PDF waere schlimmer als
 * gar keines – drei von acht Dokumenten und ein Original, das aussieht, als
 * sei es erledigt.
 */
export async function teileAuf(
  documentId: string,
  organizationId: string
): Promise<{ ok: true; anzahl: number } | { ok: false; grund: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: { organizationId } },
    include: { splitSegmente: { orderBy: { reihenfolge: "asc" } } },
  });
  if (!doc) return { ok: false, grund: "Dokument nicht gefunden." };
  if (doc.splitSegmente.length < 2) return { ok: false, grund: "Für dieses Dokument liegt kein Aufteilungsvorschlag vor." };

  const storage = getStorage();
  const original = await storage.get(doc.storageKey);
  if (!original) return { ok: false, grund: "Die Datei ist im Speicher nicht auffindbar." };

  const { PDFDocument } = await import("pdf-lib");
  const abgelegt: Array<{ storageKey: string; sizeBytes: number; name: string; seiten: number; segment: (typeof doc.splitSegmente)[number] }> = [];

  try {
    const quelle = await PDFDocument.load(original);
    for (const s of doc.splitSegmente) {
      const ziel = await PDFDocument.create();
      const indizes = Array.from({ length: s.bisSeite - s.vonSeite + 1 }, (_, i) => s.vonSeite - 1 + i);
      const seiten = await ziel.copyPages(quelle, indizes);
      for (const p of seiten) ziel.addPage(p);
      const bytes = Buffer.from(await ziel.save());

      const name = `${s.reihenfolge + 1}_${s.titel.replace(/[^A-Za-z0-9äöüÄÖÜß._-]+/g, "_")}.pdf`;
      const gespeichert = await storage.put({
        organizationId,
        caseId: doc.caseId,
        originalName: name,
        mimeType: "application/pdf",
        buffer: bytes,
      });
      abgelegt.push({
        storageKey: gespeichert.storageKey,
        sizeBytes: bytes.byteLength,
        name,
        seiten: indizes.length,
        segment: s,
      });
    }
  } catch (e) {
    // Bereits abgelegte Teildateien wieder entfernen – kein Muell im Speicher.
    for (const a of abgelegt) await storage.remove(a.storageKey).catch(() => undefined);
    console.error(`[aufteilung] Auftrennen von ${documentId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Die Datei konnte nicht aufgetrennt werden." };
  }

  const kinder = await prisma.$transaction(async (tx) => {
    const erzeugt = [];
    for (const a of abgelegt) {
      erzeugt.push(
        await tx.document.create({
          data: {
            caseId: doc.caseId,
            applicantId: doc.applicantId,
            aufgeteiltAusId: doc.id,
            originalName: a.name,
            storageKey: a.storageKey,
            mimeType: "application/pdf",
            sizeBytes: a.sizeBytes,
            pageCount: a.seiten,
            uploadSource: doc.uploadSource,
            // Dieselben Bytes wurden bereits geprueft – kein zweiter Virenscan.
            scanStatus: doc.scanStatus,
            scanEngine: doc.scanEngine,
            scannedAt: doc.scannedAt,
            documentType: a.segment.vermuteterTyp,
            // Ein Teildokument wird nicht erneut auf Aufteilung untersucht.
            splitStatus: "fertig",
          },
        })
      );
    }
    await tx.documentSplitSegment.deleteMany({ where: { documentId: doc.id } });
    await tx.document.update({ where: { id: doc.id }, data: { reviewStatus: "ersetzt" } });
    return erzeugt;
  });

  // Analyse der Teildokumente im Hintergrund – der Klick soll nicht warten.
  after(async () => {
    for (const k of kinder) await analysiereDokument(k.id);
  });

  return { ok: true, anzahl: kinder.length };
}
```

- [ ] **Step 6: Fix the old inconsistency**

In `src/lib/checklists/engine.ts` Zeile 188 die Bedingung erweitern:

```ts
    (d) =>
      d.documentType === def.documentType &&
      d.reviewStatus !== "abgelehnt" &&
      d.reviewStatus !== "duplikat" &&
      // Ein ersetztes Dokument erfuellt keine Position mehr – sonst zaehlt nach
      // dem Auftrennen das Original zusaetzlich zu seinen Teilen.
      d.reviewStatus !== "ersetzt"
```

In `src/lib/cases/cockpit.ts` Zeile 83 entsprechend:

```ts
  const docsPresent = docs.filter(
    (d) => d.reviewStatus !== "abgelehnt" && d.reviewStatus !== "duplikat" && d.reviewStatus !== "ersetzt"
  ).length;
```

Und in `tests/checklist.test.ts` einen Test dafür anhängen (die dortige Hilfsfunktion für Dokumente wiederverwenden — `grep -n "reviewStatus" tests/checklist.test.ts | head`):

```ts
it("ein ersetztes Dokument erfüllt keine Checklistenposition mehr", () => {
  const mitErsetzt = resolveChecklist(eingabe, [
    { documentType: "personalausweis", reviewStatus: "ersetzt", applicantId: null },
  ]);
  const pos = mitErsetzt.find((p) => p.documentType === "personalausweis");
  expect(pos?.status).toBe("offen");
});
```

Namen der Funktion und der Eingabestruktur gegen die Datei prüfen und anpassen.

- [ ] **Step 7: Run tests to verify they pass**

Run: `RUN_DB_IT=1 npx vitest run tests/aufteilung-teilen-db.test.ts && npx vitest run tests/checklist.test.ts tests/dashboard.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/aufteilung/service.ts src/lib/documents/pipeline.ts src/lib/checklists/engine.ts src/lib/cases/cockpit.ts tests/
git commit -m "feat(aufteilung): Auftrennen mit Alles-oder-nichts und Herkunftsspur"
```

---

### Task 6: Oberfläche

**Files:**
- Create: `src/lib/actions/aufteilung.ts`
- Create: `src/components/case/aufteilung-vorschlag.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx`

**Interfaces:**
- Produces: Server Actions `aufteilenAction(formData)`, `aufteilungVerwerfenAction(formData)`

- [ ] **Step 1: Write the actions**

```ts
// src/lib/actions/aufteilung.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { teileAuf } from "@/lib/aufteilung/service";

/** Trennt eine Sammeldatei entlang des Vorschlags auf – nur auf Klick. */
export async function aufteilenAction(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const documentId = String(formData.get("documentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!documentId || !caseId) return;

  const ergebnis = await teileAuf(documentId, ctx.organizationId);
  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: documentId,
      metadata: { aufgeteiltIn: ergebnis.anzahl },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}

/** Vorschlag verwerfen: die Datei bleibt, wie sie ist. */
export async function aufteilungVerwerfenAction(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const documentId = String(formData.get("documentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!documentId || !caseId) return;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: { organizationId: ctx.organizationId } },
    select: { id: true },
  });
  if (!doc) return;

  await prisma.documentSplitSegment.deleteMany({ where: { documentId } });
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Step 2: Build the component**

```tsx
// src/components/case/aufteilung-vorschlag.tsx
import { Scissors } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { aufteilenAction, aufteilungVerwerfenAction } from "@/lib/actions/aufteilung";

export interface SegmentView {
  vonSeite: number;
  bisSeite: number;
  titel: string;
}

/**
 * Vorschlag, eine Sammeldatei aufzutrennen. Die vollstaendige Segmentliste
 * steht VOR dem Klick da – wer acht Dokumente erzeugt, will vorher sehen,
 * welche.
 */
export function AufteilungVorschlag({
  caseId,
  documentId,
  segmente,
}: {
  caseId: string;
  documentId: string;
  segmente: SegmentView[];
}) {
  if (segmente.length < 2) return null;
  return (
    <div className="mt-2 rounded-lg border border-warning/30 bg-warning/[0.05] p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Scissors className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        Enthält vermutlich {segmente.length} Dokumente
      </p>
      <ul className="mt-1.5 text-xs text-muted-foreground">
        {segmente.map((s) => (
          <li key={`${s.vonSeite}-${s.bisSeite}`}>
            Seiten {s.vonSeite}
            {s.bisSeite > s.vonSeite ? `–${s.bisSeite}` : ""}: {s.titel}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <form action={aufteilenAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton size="sm">Auftrennen</SubmitButton>
        </form>
        <form action={aufteilungVerwerfenAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton size="sm" variant="ghost">
            Verwerfen
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the case page**

In `src/app/(app)/cases/[id]/page.tsx` die vorhandene Dokumenten-Abfrage erweitern:

```ts
    prisma.document.findMany({
      where: { caseId: id },
      include: {
        warnings: true,
        splitSegmente: { orderBy: { reihenfolge: "asc" }, select: { vonSeite: true, bisSeite: true, titel: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
```

Import ergänzen:

```tsx
import { AufteilungVorschlag } from "@/components/case/aufteilung-vorschlag";
```

In der Dokumententabelle unter der jeweiligen Zeile einfügen — die Stelle finden mit
`grep -n "documents.map" "src/app/(app)/cases/[id]/page.tsx"`:

```tsx
                      {d.splitSegmente.length >= 2 && (
                        <AufteilungVorschlag caseId={id} documentId={d.id} segmente={d.splitSegmente} />
                      )}
```

Ist die Dokumentenliste eine `<Table>`, gehört der Vorschlag in eine eigene Zeile mit `colSpan` über die volle Breite — sonst zerreißt er das Spaltenraster.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: beide ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/aufteilung.ts src/components/case/aufteilung-vorschlag.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(aufteilung): Vorschlag mit Segmentliste auf der Fallseite"
```

---

### Task 7: Gesamtlauf und Deployment

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün. Rote Bestandstests sind echte Regressionen — beheben, nicht wegdefinieren. Erwartbar betroffen: Tests, die Dokumente ohne `splitSegmente` bauen.

- [ ] **Step 2: DB tests**

Run: `RUN_DB_IT=1 npx vitest run tests/aufteilung-service-db.test.ts tests/aufteilung-teilen-db.test.ts tests/detektiv-service-db.test.ts tests/pglite.test.ts`
Expected: PASS

- [ ] **Step 3: Merge and deploy**

```bash
git checkout main
git merge --no-ff feat/sammel-pdf-auftrennen -m "merge: Sammel-PDFs auftrennen"
git push origin main
```

- [ ] **Step 4: Verify deployment**

1. `git merge-base --is-ancestor <commit> origin/main && echo "in main"`
2. `vercel ls --prod` — neuestes Deployment `Ready` und jünger als der Push
3. In der Produktion ein mehrseitiges Test-PDF hochladen und prüfen, dass entweder ein Vorschlag erscheint oder begründet keiner

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| 3.1 Vorschlag statt Automatik | 6 (Actions nur auf Klick) |
| 3.2 ein KI-Aufruf über Seitenanfänge | 2, 4 |
| 3.2 `SEITEN_MUSTER` wiederverwenden | 1 (Export), 4 (Nutzung) |
| 3.3 Schutzregel im Code | 1 |
| 4 Datenmodell | 3 |
| 5 Vorbedingungen der Erkennung | 4 |
| 6 pdf-lib, Vererbung, Analyse der Kinder | 5 |
| 6.1 Alles oder nichts | 5 (eigener Test) |
| 6.2 Altlast `ersetzt` | 5 |
| 7 Oberfläche | 6 |
| 8 Absicherung | 1, 2, 4, 5 |

**Beim Gegenlesen gefunden und korrigiert:**

1. **Ein Platzhalter hatte sich eingeschlichen:** `segmente: undefined` im Testaufbau von Task 5 — ein Feld, das es am `Document` nicht gibt. Der Schritt sagt jetzt ausdrücklich, dass die Zeile zu löschen ist.

2. **Die Reihenfolge im Nachlauf war unbedacht.** Erkennung und Detektiv laufen beide nach der Analyse. Die Erkennung gehört **zuerst**: Wird gleich darauf aufgetrennt, prüft der Detektiv ohnehin jedes Teildokument neu, und seine Arbeit am Sammel-PDF wäre verworfen.

3. **`z.enum(DOCUMENT_TYPES)` braucht eine Typzusicherung**, weil Zod ein `[string, ...string[]]` erwartet und `DOCUMENT_TYPES` als `readonly` deklariert ist. Steht als Hinweis in Task 2.

**Typkonsistenz geprüft:** `SegmentVorschlag`, `pruefeSegmente`, `erkenneAufteilung`, `teileAuf`, `analysiereDokument` heißen in allen Tasks gleich. Das Prisma-Feld heißt durchgängig `splitSegmente`, der Herkunftsbezug `aufgeteiltAusId`.

**Bekannte Unschärfen mit Prüfschritt:** die Struktur der Dokumententabelle auf der Fallseite (Task 6, Step 3) und die Hilfsfunktionen in `tests/checklist.test.ts` (Task 5, Step 6).
