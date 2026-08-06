# Auto-Zuordnung von Dokumenten zu Antragstellern – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokumente werden anhand des von der KI erkannten Namens automatisch dem richtigen Antragsteller zugeordnet – auch rückwirkend, wenn eine zweite Person erst nach dem Upload angelegt wird.

**Architecture:** Der bisher verworfene Wert `detectedApplicant` aus der Klassifikation wird auf dem Dokument gespeichert. Eine reine Funktion `matchApplicant` gleicht ihn streng (Vor- **und** Nachname, wortweise) gegen die Antragsteller des Falls ab. Ein neues Feld `Document.applicantSource` unterscheidet automatische von manuellen Zuordnungen, damit ein späterer Abgleich nur eigene Entscheidungen revidiert. Drei Einstiegspunkte rufen den Abgleich: Upload, KI-Prüfung und `rematchCaseDocuments` (nach Namensänderungen an Antragstellern, ohne KI-Aufruf).

**Tech Stack:** Next.js App Router (Server Actions), Prisma + PostgreSQL (Supabase), Vitest, TypeScript strict.

## Global Constraints

- Projektsprache ist **Deutsch**: Kommentare, Testnamen, UI-Texte und Commit-Botschaften auf Deutsch. Bezeichner im Code englisch, wie im Bestand.
- Der Abgleich ist eine Verbesserung, keine Voraussetzung: Er darf **nie** einen Upload, eine KI-Prüfung oder das Speichern von Stammdaten scheitern lassen. Jeder Aufruf aus einer Action heraus wird in `try/catch` mit `console.error` gekapselt — Muster: `applyExtractedFieldsToApplicant` in `src/lib/actions/cases.ts`.
- **Kein zusätzlicher KI-/OCR-Aufruf.** Der Abgleich arbeitet ausschließlich auf gespeichertem Text (Mistral-Rate-Limits: 50 Requests/Minute).
- Schemaänderungen bleiben **additiv und nullbar**. `npm run db:push` läuft ohne getrenntes Staging direkt gegen die Prod-Datenbank — es darf keine Spalte fallen oder Pflichtfeld werden.
- **Die eine Zuständigkeitsregel:** Ein Dokument darf automatisch (um)zugeordnet werden **genau dann, wenn `applicantId === null` oder `applicantSource === "auto"`**. Alles andere ist eine Entscheidung des Vermittlers und bleibt unangetastet.
- Audit-Einträge enthalten nur IDs und Flags, nie Klartext-Namen aus Dokumenten.
- Tests laufen mit `npm test` (Vitest). DB-Integrationstests laufen nur mit `RUN_DB_IT=1` und werden sonst übersprungen.

**Spec:** `docs/superpowers/specs/2026-08-06-auto-zuordnung-antragsteller-design.md`

## Dateiübersicht

| Datei | Rolle |
| --- | --- |
| `src/lib/documents/applicant-match.ts` | **Neu.** Reine Logik: `matchApplicant` (Namensabgleich) + `planRematch` (welche Dokumente umgehängt werden). Keine Prisma-, keine Next-Importe. |
| `tests/applicant-match.test.ts` | **Neu.** Unit-Tests der reinen Logik. |
| `prisma/schema.prisma` | Feld `applicantSource String?` auf `Document`. |
| `src/lib/documents/pipeline.ts` | Speichert `detectedApplicant`; ordnet nach der Klassifikation automatisch zu. |
| `src/lib/actions/upload.ts` | `resolveCustomerApplicant` entfällt; bewusste Auswahl wird als `manuell` markiert. |
| `src/lib/actions/cases.ts` | KI-Prüflauf speichert `detectedApplicant` und gleicht ab. |
| `src/lib/documents/rematch.ts` | **Neu.** DB-Anbindung: `rematchCaseDocuments(caseId)` — lädt, ruft `planRematch`, schreibt, auditiert. |
| `src/lib/actions/case-edit.ts` | Ruft `rematchCaseDocuments` nach `editApplicant` und `addApplicant`. |
| `src/lib/actions/finlink.ts` | Ruft `rematchCaseDocuments` nach dem FinLink-Abgleich. |
| `src/lib/actions/review.ts` | Manuelle Zuordnung setzt `applicantSource = "manuell"`. |
| `src/components/review/applicant-select.tsx` | Hinweis „automatisch zugeordnet". |
| `src/app/(app)/cases/[id]/page.tsx`, `src/app/(app)/review/page.tsx` | Reichen `source` an die Komponente durch. |
| `tests/applicant-rematch-db.test.ts` | **Neu.** PGlite-Integrationstest des Colell-Ablaufs. |

---

### Task 1: Reine Match-Logik

**Files:**
- Create: `src/lib/documents/applicant-match.ts`
- Test: `tests/applicant-match.test.ts`

**Interfaces:**
- Consumes: nichts (erste Aufgabe).
- Produces:
  - `interface ApplicantCandidate { id: string; position: number; vorname: string | null; nachname: string | null }`
  - `function matchApplicant(detectedName: string | null | undefined, applicants: ApplicantCandidate[]): string | null`
  - `interface RematchDocument { id: string; applicantId: string | null; applicantSource: string | null; detectedApplicant: string | null }`
  - `interface RematchChange { documentId: string; applicantId: string }`
  - `function planRematch(docs: RematchDocument[], applicants: ApplicantCandidate[]): RematchChange[]`

- [ ] **Schritt 1: Testdatei mit den Fällen schreiben**

Create `tests/applicant-match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  matchApplicant,
  planRematch,
  type ApplicantCandidate,
  type RematchDocument,
} from "@/lib/documents/applicant-match";

const laura: ApplicantCandidate = { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" };
const thomas: ApplicantCandidate = { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" };
const paar = [laura, thomas];

describe("matchApplicant", () => {
  it("ordnet bei genau einem Antragsteller immer diesem zu", () => {
    expect(matchApplicant(null, [laura])).toBe("a1");
    expect(matchApplicant("Wer auch immer", [laura])).toBe("a1");
  });

  it("gibt null ohne Antragsteller", () => {
    expect(matchApplicant("Laura Colell", [])).toBeNull();
  });

  it("unterscheidet Eheleute mit gleichem Nachnamen über den Vornamen", () => {
    expect(matchApplicant("Thomas Colell", paar)).toBe("a2");
    expect(matchApplicant("Laura Colell", paar)).toBe("a1");
  });

  it("ordnet nicht zu, wenn nur der Nachname erkannt wurde", () => {
    expect(matchApplicant("Herr Colell", paar)).toBeNull();
  });

  it("ordnet ohne erkannten Namen nicht zu", () => {
    expect(matchApplicant(null, paar)).toBeNull();
    expect(matchApplicant("   ", paar)).toBeNull();
  });

  it("ignoriert Groß-/Kleinschreibung und Reihenfolge", () => {
    expect(matchApplicant("COLELL, thomas", paar)).toBe("a2");
  });

  it("löst Umlaute und ß auf", () => {
    const paare = [
      { id: "b1", position: 1, vorname: "Jürgen", nachname: "Groß" },
      { id: "b2", position: 2, vorname: "Anna", nachname: "Groß" },
    ];
    expect(matchApplicant("Juergen Gross", paare)).toBe("b1");
    expect(matchApplicant("Jürgen Groß", paare)).toBe("b1");
  });

  it("behandelt Bindestrich-Doppelnamen als eigene Wörter", () => {
    const paare = [
      { id: "c1", position: 1, vorname: "Anna-Lena", nachname: "Meier-Schmidt" },
      { id: "c2", position: 2, vorname: "Bernd", nachname: "Meier-Schmidt" },
    ];
    expect(matchApplicant("Anna-Lena Meier-Schmidt", paare)).toBe("c1");
    expect(matchApplicant("Anna Lena Meier Schmidt", paare)).toBe("c1");
  });

  it("greift nicht per Teilstring (Berg trifft nicht Bergmann)", () => {
    const paare = [
      { id: "d1", position: 1, vorname: "Otto", nachname: "Berg" },
      { id: "d2", position: 2, vorname: "Otto", nachname: "Bergmann" },
    ];
    expect(matchApplicant("Otto Bergmann", paare)).toBe("d2");
  });

  it("ordnet namenlosen Antragstellern nichts zu", () => {
    const mitLeerem = [laura, { id: "a2", position: 2, vorname: null, nachname: null }];
    expect(matchApplicant("Thomas Colell", mitLeerem)).toBeNull();
    expect(matchApplicant("Laura Colell", mitLeerem)).toBe("a1");
  });

  it("ordnet nicht zu, wenn zwei Kandidaten passen", () => {
    const zwillinge = [
      { id: "e1", position: 1, vorname: "Max", nachname: "Muster" },
      { id: "e2", position: 2, vorname: "Max", nachname: "Muster" },
    ];
    expect(matchApplicant("Max Muster", zwillinge)).toBeNull();
  });
});

function doc(over: Partial<RematchDocument> = {}): RematchDocument {
  return { id: "d1", applicantId: null, applicantSource: null, detectedApplicant: null, ...over };
}

describe("planRematch", () => {
  it("hängt eine automatische Zuordnung auf die erkannte Person um", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "auto", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([{ documentId: "d1", applicantId: "a2" }]);
  });

  it("fasst manuelle Zuordnungen nie an", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "manuell", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("fasst Bestandsdaten mit Zuordnung, aber ohne Herkunft, nicht an", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: null, detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("ordnet unzugeordnete Bestandsdaten zu", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: null, applicantSource: null, detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([{ documentId: "d1", applicantId: "a2" }]);
  });

  it("lässt eine bestehende Zuordnung stehen, wenn kein Name erkannt wurde", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "auto", detectedApplicant: null })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("meldet keine Änderung, wenn die Zuordnung schon stimmt", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a2", applicantSource: "auto", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/applicant-match.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/documents/applicant-match"`.

- [ ] **Schritt 3: Implementierung schreiben**

Create `src/lib/documents/applicant-match.ts`:

```ts
/**
 * Zuordnung von Dokumenten zu Antragstellern anhand des von der KI erkannten
 * Namens (`Document.detectedApplicant`).
 *
 * Bewusst streng: Ehepaare mit gleichem Nachnamen sind in der Baufinanzierung
 * der Normalfall. Ein Abgleich allein über den Nachnamen träfe dort
 * systematisch die falsche Person. Ein nicht zugeordnetes Dokument ist ein
 * sichtbarer, korrigierbarer Zustand – eine falsche Zuordnung ein stiller
 * Fehler.
 *
 * Reine Logik: keine Datenbank, keine KI-Aufrufe.
 */

export interface ApplicantCandidate {
  id: string;
  position: number;
  vorname: string | null;
  nachname: string | null;
}

/** Kleinschreibung, Umlaute/ß aufgelöst, Diakritika entfernt. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    // Kombinierende Akzente (é, ñ, …) entfernen. Bewusst als Escape-Bereich
    // notiert – literale Kombinationszeichen im Quelltext sind unlesbar.
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Zerlegt einen Namen in vergleichbare Wörter. Bindestriche und Satzzeichen
 * sind Wortgrenzen – „Meier-Schmidt" trifft damit auch „Meier Schmidt".
 */
function tokenize(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Passt der Kandidat auf den erkannten Namen? Verlangt Vor- UND Nachname als
 * eigenes Wort – wortweise, nicht per Teilstring (sonst träfe „Berg" auf
 * „Bergmann").
 */
function candidateMatches(candidate: ApplicantCandidate, detectedTokens: string[]): boolean {
  const vornameTokens = tokenize(candidate.vorname ?? "");
  const nachnameTokens = tokenize(candidate.nachname ?? "");
  if (vornameTokens.length === 0 || nachnameTokens.length === 0) return false;

  const hasAll = (tokens: string[]) => tokens.every((t) => detectedTokens.includes(t));
  return hasAll(vornameTokens) && hasAll(nachnameTokens);
}

/**
 * Liefert die ID des eindeutig passenden Antragstellers oder null.
 *
 * Bei genau einem Antragsteller im Fall wird immer diesem zugeordnet – die
 * Zuordnung ist dann trivial eindeutig. Sie wird als `auto` markiert und
 * dadurch revidierbar, sobald eine zweite Person dazukommt.
 */
export function matchApplicant(
  detectedName: string | null | undefined,
  applicants: ApplicantCandidate[]
): string | null {
  if (applicants.length === 0) return null;
  if (applicants.length === 1) return applicants[0]!.id;

  const detectedTokens = tokenize(detectedName ?? "");
  if (detectedTokens.length === 0) return null;

  const hits = applicants.filter((a) => candidateMatches(a, detectedTokens));
  return hits.length === 1 ? hits[0]!.id : null;
}

export interface RematchDocument {
  id: string;
  applicantId: string | null;
  /** "auto" | "manuell" | null (Bestandsdaten ohne Herkunft). */
  applicantSource: string | null;
  detectedApplicant: string | null;
}

export interface RematchChange {
  documentId: string;
  applicantId: string;
}

/**
 * Entscheidet, welche Dokumente eines Falls neu zugeordnet werden müssen.
 *
 * Angefasst wird nur, was unzugeordnet ist oder automatisch zugeordnet wurde –
 * Entscheidungen des Vermittlers bleiben unangetastet. Liefert der Abgleich
 * kein eindeutiges Ergebnis, bleibt eine bestehende Zuordnung stehen: Die
 * Checkliste soll nie rückwärts laufen.
 */
export function planRematch(
  docs: RematchDocument[],
  applicants: ApplicantCandidate[]
): RematchChange[] {
  const changes: RematchChange[] = [];
  for (const doc of docs) {
    const editable = doc.applicantId === null || doc.applicantSource === "auto";
    if (!editable) continue;

    const match = matchApplicant(doc.detectedApplicant, applicants);
    if (match === null || match === doc.applicantId) continue;

    changes.push({ documentId: doc.id, applicantId: match });
  }
  return changes;
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Run: `npx vitest run tests/applicant-match.test.ts`
Expected: PASS, alle Fälle grün.

- [ ] **Schritt 5: Committen**

```bash
git add src/lib/documents/applicant-match.ts tests/applicant-match.test.ts
git commit -m "feat(zuordnung): strenger Namensabgleich Dokument→Antragsteller (reine Logik)"
```

---

### Task 2: Erkannten Namen und Herkunft speichern

Ohne diesen Schritt ist ein späterer Abgleich unmöglich: `detectedApplicant` wird heute nur für den Dateinamen benutzt und danach verworfen.

**Files:**
- Modify: `prisma/schema.prisma` (Model `Document`, nach `detectedApplicant`)
- Modify: `src/lib/documents/pipeline.ts` (`processOcrAndAi`, Prisma-`update`)
- Modify: `src/lib/actions/cases.ts` (`processAiCheckInBackground`, Prisma-`update`)
- Test: `tests/applicant-source-persistenz.test.ts` (neu)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: Spalte `Document.applicantSource` (String?, Werte `"auto"` | `"manuell"` | null) und ein stets gefülltes `Document.detectedApplicant`.

- [ ] **Schritt 1: Schemafeld ergänzen**

In `prisma/schema.prisma`, Model `Document`, direkt unter `detectedApplicant String?`:

```prisma
  detectedApplicant String?
  /// Herkunft der Antragsteller-Zuordnung: "auto" (Namensabgleich) oder
  /// "manuell" (Vermittler). null = Bestandsdaten unbekannter Herkunft; diese
  /// werden wie "manuell" behandelt, solange sie eine Zuordnung tragen.
  applicantSource   String?
```

- [ ] **Schritt 2: Prisma-Client neu erzeugen**

Run: `npm run db:generate`
Expected: „Generated Prisma Client" ohne Fehler. (`db:push` folgt erst in Task 7 — bis dahin reicht der Client für Typecheck und Tests.)

- [ ] **Schritt 3: Test schreiben, der die Persistenz einfordert**

Create `tests/applicant-source-persistenz.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Der Hintergrundlauf soll im Test sofort ausgeführt werden.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const documentCreate = vi.fn();
const documentUpdate = vi.fn();
const applicantFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      create: (...a: unknown[]) => documentCreate(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    put: vi.fn(async () => ({ storageKey: "k", mimeType: "application/pdf", sizeBytes: 10 })),
    remove: vi.fn(),
  }),
  isStorageKeyForCase: () => true,
}));
vi.mock("@/lib/security/virus-scan", () => ({
  getVirusScanner: () => ({ name: "mock", scan: async () => ({ verdict: "clean", engine: "mock", demo: true }) }),
}));
vi.mock("@/lib/security/file-validation", () => ({
  validateUpload: () => ({ ok: true, mimeType: "application/pdf" }),
}));
vi.mock("@/lib/documents/heic", () => ({
  normalizeUploadFile: async (f: unknown) => ({ file: f }),
}));
vi.mock("@/lib/ai", () => ({
  getOCRProvider: () => ({
    extractText: async () => ({ fullText: "Gehaltsabrechnung Thomas Colell", pageCount: 1, pages: [] }),
  }),
}));
vi.mock("@/lib/ai/service", () => ({
  AIService: class {
    async classifyDocument() {
      return { documentType: "gehaltsabrechnung", confidence: 0.9, detectedApplicant: "Thomas Colell" };
    }
    async extractFields() {
      return { fields: [], warnings: [] };
    }
  },
}));

import { processUpload } from "@/lib/documents/pipeline";

beforeEach(() => {
  [documentCreate, documentUpdate, applicantFindMany].forEach((m) => m.mockReset());
  documentCreate.mockResolvedValue({ id: "doc-1" });
  documentUpdate.mockResolvedValue({});
  applicantFindMany.mockResolvedValue([
    { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
    { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
  ]);
});

function upload() {
  return processUpload({
    organizationId: "org-1",
    caseId: "case-1",
    file: { name: "scan.pdf", type: "application/pdf", size: 10, buffer: Buffer.from("x") },
    uploadSource: "kunde",
  });
}

/** Letzter update()-Aufruf – das ist der Abschluss der Hintergrund-Analyse. */
function lastUpdateData(): Record<string, unknown> {
  const call = documentUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
  return call.data;
}

describe("Persistenz des erkannten Antragstellers", () => {
  it("schreibt den von der KI erkannten Namen auf das Dokument", async () => {
    await upload();
    expect(lastUpdateData().detectedApplicant).toBe("Thomas Colell");
  });

  it("ordnet den erkannten Antragsteller automatisch zu und markiert die Herkunft", async () => {
    await upload();
    expect(lastUpdateData().applicantId).toBe("a2");
    expect(lastUpdateData().applicantSource).toBe("auto");
  });
});
```

- [ ] **Schritt 4: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/applicant-source-persistenz.test.ts`
Expected: FAIL — `expected undefined to be 'Thomas Colell'`.

- [ ] **Schritt 5: `detectedApplicant` in der Upload-Pipeline schreiben**

In `src/lib/documents/pipeline.ts`, in `processOcrAndAi`, im `prisma.document.update`-Aufruf direkt nach `documentType`:

```ts
        documentType: cls?.documentType ?? null,
        detectedApplicant: cls?.detectedApplicant ?? null,
```

- [ ] **Schritt 6: `detectedApplicant` im KI-Prüflauf schreiben**

In `src/lib/actions/cases.ts`, in `processAiCheckInBackground`, im `prisma.document.update`-Aufruf direkt nach `documentType`:

```ts
            documentType: cls.documentType,
            detectedApplicant: cls.detectedApplicant ?? null,
```

- [ ] **Schritt 7: Test erneut laufen lassen**

Run: `npx vitest run tests/applicant-source-persistenz.test.ts`
Expected: Erster Test PASS („schreibt den … Namen"), zweiter Test noch FAIL (`expected undefined to be 'a2'`) — die Zuordnung folgt in Task 3.

- [ ] **Schritt 8: Committen**

```bash
git add prisma/schema.prisma src/lib/documents/pipeline.ts src/lib/actions/cases.ts tests/applicant-source-persistenz.test.ts
git commit -m "feat(zuordnung): erkannten Antragstellernamen speichern + Feld applicantSource"
```

---

### Task 3: Automatische Zuordnung beim Upload

**Files:**
- Modify: `src/lib/documents/pipeline.ts` (`AfterStoreInput`, `runPipelineAfterStore`, `OcrAndAiInput`, `processOcrAndAi`)
- Modify: `src/lib/actions/upload.ts` (`resolveCustomerApplicant` entfernen, `customerUploadOne`, `finishCustomerUpload`-Umfeld unberührt)
- Test: `tests/applicant-source-persistenz.test.ts` (aus Task 2, wird jetzt vollständig grün)

**Interfaces:**
- Consumes: `matchApplicant`, `ApplicantCandidate` aus `@/lib/documents/applicant-match` (Task 1); Spalte `applicantSource` (Task 2).
- Produces: `processUpload`/`processStoredUpload` speichern eine von außen übergebene `applicantId` mit `applicantSource: "manuell"`; ohne Vorgabe ordnet die Hintergrund-Analyse automatisch zu.

- [ ] **Schritt 1: Bewusste Auswahl beim Anlegen als „manuell" markieren**

In `src/lib/documents/pipeline.ts`, in `runPipelineAfterStore`, im `prisma.document.create`:

```ts
      caseId,
      applicantId: input.applicantId ?? undefined,
      applicantSource: input.applicantId ? "manuell" : undefined,
```

- [ ] **Schritt 2: caseId und bestehende Zuordnung an die Hintergrund-Analyse durchreichen**

In `src/lib/documents/pipeline.ts` das Interface `OcrAndAiInput` erweitern:

```ts
interface OcrAndAiInput {
  documentId: string;
  caseId: string;
  /** Bereits bewusst gesetzte Zuordnung – dann findet kein Abgleich statt. */
  applicantId: string | null;
  buffer: Buffer;
  stored: StoredObject;
  originalName: string;
  applicantName: string | null;
}
```

Und den `after()`-Aufruf am Ende von `runPipelineAfterStore`:

```ts
  after(() =>
    processOcrAndAi({
      documentId: doc.id,
      caseId,
      applicantId: input.applicantId ?? null,
      buffer,
      stored,
      originalName,
      applicantName: input.applicantName ?? null,
    })
  );
```

- [ ] **Schritt 3: Abgleich in `processOcrAndAi` einbauen**

In `src/lib/documents/pipeline.ts` zuerst den Import ergänzen:

```ts
import { matchApplicant } from "@/lib/documents/applicant-match";
```

Dann in `processOcrAndAi` die Zeile `const { documentId, buffer, stored, originalName, applicantName } = input;` ersetzen durch:

```ts
  const { documentId, caseId, buffer, stored, originalName, applicantName } = input;
```

Und **nach** dem `try/catch` um OCR/Klassifikation, **vor** `const generatedName = …`, einfügen:

```ts
  // Antragsteller automatisch zuordnen, sofern der Vermittler nicht selbst
  // gewählt hat. Bei genau einem Antragsteller ist die Zuordnung trivial, bei
  // mehreren entscheidet der im Dokument erkannte Name (Vor- UND Nachname).
  // Best-effort: ein Fehler hier darf die Analyse nicht kippen.
  let autoApplicantId: string | null = null;
  let autoApplicantName: string | null = null;
  if (!input.applicantId) {
    try {
      const applicants = await prisma.applicant.findMany({
        where: { caseId },
        orderBy: { position: "asc" },
        select: { id: true, position: true, vorname: true, nachname: true },
      });
      autoApplicantId = matchApplicant(cls?.detectedApplicant, applicants);
      const hit = applicants.find((a) => a.id === autoApplicantId);
      autoApplicantName = hit ? [hit.vorname, hit.nachname].filter(Boolean).join(" ") || null : null;
    } catch (e) {
      console.error(`[pipeline] Antragsteller-Zuordnung für Dokument ${documentId} fehlgeschlagen:`, e);
    }
  }
```

- [ ] **Schritt 4: Dateinamen und Update um die Zuordnung ergänzen**

In `processOcrAndAi` den `generateFileName`-Aufruf ändern — bei einem Treffer zählt der kanonische Name des Antragstellers, nicht der KI-Rohtext (konsistent zu `assignDocumentApplicant`):

```ts
  const generatedName = generateFileName({
    documentType: cls?.documentType ?? null,
    applicantName: autoApplicantName ?? cls?.detectedApplicant ?? applicantName ?? null,
    propertyRef: cls?.detectedPropertyRef,
    period: cls?.period,
    originalName,
  });
```

Und im `prisma.document.update` direkt nach `detectedApplicant`:

```ts
        detectedApplicant: cls?.detectedApplicant ?? null,
        ...(autoApplicantId ? { applicantId: autoApplicantId, applicantSource: "auto" } : {}),
```

- [ ] **Schritt 5: `resolveCustomerApplicant` entfernen**

In `src/lib/actions/upload.ts` die komplette Funktion `resolveCustomerApplicant` samt Doc-Kommentar löschen (aktuell Zeilen 49–72) und in `customerUploadOne` den Aufruf ersetzen. Aus:

```ts
    const { applicantId, applicantName } = await resolveCustomerApplicant(access.caseId);
    const buffer = Buffer.from(await file.arrayBuffer());
    result = await processUpload({
      organizationId: access.organizationId,
      caseId: access.caseId,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadSource: "kunde",
      applicantName,
      applicantId,
    });
```

wird:

```ts
    // Keine Zuordnung aus dem Kundenlink: Über den gemeinsamen Link lädt jeder
    // Beteiligte hoch, die Quelle verrät nicht wessen Datei es ist. Die
    // Zuordnung übernimmt der Namensabgleich in der Pipeline.
    const buffer = Buffer.from(await file.arrayBuffer());
    result = await processUpload({
      organizationId: access.organizationId,
      caseId: access.caseId,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadSource: "kunde",
    });
```

- [ ] **Schritt 6: Tests laufen lassen**

Run: `npx vitest run tests/applicant-source-persistenz.test.ts tests/broker-upload.test.ts tests/upload-token.test.ts`
Expected: PASS — beide Tests aus Task 2 jetzt grün, Bestandstests unverändert grün.

- [ ] **Schritt 7: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe (Erfolg). Falls `resolveCustomerApplicant` noch referenziert wird, hier beheben.

- [ ] **Schritt 8: Committen**

```bash
git add src/lib/documents/pipeline.ts src/lib/actions/upload.ts tests/applicant-source-persistenz.test.ts
git commit -m "feat(zuordnung): Upload ordnet Dokumente automatisch dem erkannten Antragsteller zu"
```

---

### Task 4: Automatische Zuordnung im KI-Prüflauf

**Files:**
- Modify: `src/lib/actions/cases.ts` (`processAiCheckInBackground`)
- Test: `tests/ai-check-zuordnung.test.ts` (neu)

**Interfaces:**
- Consumes: `matchApplicant` (Task 1), Spalte `applicantSource` (Task 2).
- Produces: nichts Neues nach außen.

- [ ] **Schritt 1: Test schreiben**

Create `tests/ai-check-zuordnung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planRematch, type RematchDocument } from "@/lib/documents/applicant-match";

/**
 * Der KI-Prüflauf wendet dieselbe Regel an wie das nachträgliche Umhängen:
 * angefasst wird nur, was unzugeordnet oder automatisch zugeordnet ist.
 * Diese Tests halten die Regel an der Nahtstelle des Prüflaufs fest.
 */
const paar = [
  { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
  { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
];

function doc(over: Partial<RematchDocument>): RematchDocument {
  return { id: "d1", applicantId: null, applicantSource: null, detectedApplicant: null, ...over };
}

describe("KI-Prüflauf: Zuordnungsregel", () => {
  it("ordnet ein frisch erkanntes, unzugeordnetes Dokument zu", () => {
    expect(planRematch([doc({ detectedApplicant: "Thomas Colell" })], paar)).toEqual([
      { documentId: "d1", applicantId: "a2" },
    ]);
  });

  it("überschreibt die Handkorrektur des Vermittlers nicht", () => {
    expect(
      planRematch(
        [doc({ applicantId: "a1", applicantSource: "manuell", detectedApplicant: "Thomas Colell" })],
        paar
      )
    ).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen**

Run: `npx vitest run tests/ai-check-zuordnung.test.ts`
Expected: PASS (die Regel stammt aus Task 1; der Test sichert sie für diesen Einstiegspunkt ab).

- [ ] **Schritt 3: Antragsteller einmal je Prüflauf laden**

In `src/lib/actions/cases.ts` den Import ergänzen — bewusst `planRematch`, nicht
`matchApplicant`: Die Zuständigkeitsregel („nur unzugeordnet oder auto") existiert
damit an genau einer Stelle und wird von den Tests aus Task 1 mit abgedeckt:

```ts
import { planRematch } from "@/lib/documents/applicant-match";
```

In `processAiCheckInBackground` direkt nach dem `const docs = await prisma.document.findMany({…})`:

```ts
    // Einmal je Prüflauf laden statt je Dokument – der Abgleich ist reine
    // Textlogik und braucht keinen weiteren KI-Aufruf.
    const applicants = await prisma.applicant.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, vorname: true, nachname: true },
    });
```

- [ ] **Schritt 4: Zuordnung je Dokument berechnen und schreiben**

In `processAiCheckInBackground`, innerhalb von `mapLimit`, direkt nach `const ext = await ai.extractFields(cls.documentType, text);`:

```ts
        // Dieselbe Regel wie beim nachträglichen Abgleich: nur unzugeordnete
        // oder automatisch zugeordnete Dokumente anfassen, eine Auswahl des
        // Vermittlers bleibt bestehen. planRematch liefert nur echte Änderungen.
        const [change] = planRematch(
          [
            {
              id: doc.id,
              applicantId: doc.applicantId,
              applicantSource: doc.applicantSource,
              detectedApplicant: cls.detectedApplicant ?? null,
            },
          ],
          applicants
        );
```

Und im folgenden `prisma.document.update` nach `detectedApplicant`:

```ts
            detectedApplicant: cls.detectedApplicant ?? null,
            ...(change ? { applicantId: change.applicantId, applicantSource: "auto" } : {}),
```

- [ ] **Schritt 5: Tests laufen lassen**

Run: `npx vitest run tests/ai-check-zuordnung.test.ts tests/cases-actions.test.ts tests/concurrency-and-timeout.test.ts`
Expected: PASS.

- [ ] **Schritt 6: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Schritt 7: Committen**

```bash
git add src/lib/actions/cases.ts tests/ai-check-zuordnung.test.ts
git commit -m "feat(zuordnung): KI-Prüfung gleicht Antragsteller mit ab"
```

---

### Task 5: Nachträglicher Abgleich `rematchCaseDocuments`

Das ist der eigentliche Colell-Fix. `addApplicant` legt eine **namenlose** Person an — der Abgleich muss deshalb greifen, sobald ein Name gespeichert wird.

**Files:**
- Create: `src/lib/documents/rematch.ts`
- Modify: `src/lib/actions/case-edit.ts` (`editApplicant`, `addApplicant`)
- Modify: `src/lib/actions/finlink.ts` (nach `fillCaseFromCanonical`)
- Test: `tests/applicant-rematch.test.ts` (neu)

**Interfaces:**
- Consumes: `planRematch`, `RematchDocument` (Task 1); `generateFileName` aus `@/lib/documents/filename`.
- Produces: `async function rematchCaseDocuments(caseId: string, actor?: { organizationId: string; userId?: string | null }): Promise<number>` — liefert die Zahl der umgehängten Dokumente.

- [ ] **Schritt 1: Test schreiben**

Create `tests/applicant-rematch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const documentFindMany = vi.fn();
const documentUpdate = vi.fn();
const applicantFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      update: (...a: unknown[]) => documentUpdate(...a),
    },
    applicant: { findMany: (...a: unknown[]) => applicantFindMany(...a) },
  },
}));

import { rematchCaseDocuments } from "@/lib/documents/rematch";

beforeEach(() => {
  [documentFindMany, documentUpdate, applicantFindMany].forEach((m) => m.mockReset());
  documentUpdate.mockResolvedValue({});
  applicantFindMany.mockResolvedValue([
    { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
    { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
  ]);
});

const basisDoc = {
  id: "d1",
  applicantId: "a1",
  applicantSource: "auto",
  detectedApplicant: "Thomas Colell",
  documentType: "personalausweis",
  period: null,
  originalName: "ausweis.pdf",
};

describe("rematchCaseDocuments", () => {
  it("hängt automatisch zugeordnete Dokumente auf die erkannte Person um", async () => {
    documentFindMany.mockResolvedValue([basisDoc]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(1);
    const arg = documentUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { applicantId: string; applicantSource: string; generatedName?: string };
    };
    expect(arg.where.id).toBe("d1");
    expect(arg.data.applicantId).toBe("a2");
    expect(arg.data.applicantSource).toBe("auto");
    expect(arg.data.generatedName).toContain("Thomas");
  });

  it("lässt manuelle Zuordnungen unangetastet", async () => {
    documentFindMany.mockResolvedValue([{ ...basisDoc, applicantSource: "manuell" }]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(0);
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("tut nichts, solange der zweite Antragsteller noch namenlos ist", async () => {
    applicantFindMany.mockResolvedValue([
      { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
      { id: "a2", position: 2, vorname: null, nachname: null },
    ]);
    documentFindMany.mockResolvedValue([basisDoc]);
    const count = await rematchCaseDocuments("case-1", { organizationId: "org-1", userId: "u1" });
    expect(count).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/applicant-rematch.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/documents/rematch"`.

- [ ] **Schritt 3: Implementierung schreiben**

Create `src/lib/documents/rematch.ts`:

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateFileName } from "@/lib/documents/filename";
import { planRematch } from "@/lib/documents/applicant-match";
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Gleicht alle Dokumente eines Falls erneut gegen seine Antragsteller ab.
 *
 * Nötig, weil Antragsteller nachträglich dazukommen: Beim FinLink-Import kommt
 * oft nur eine Person mit, die zweite trägt der Vermittler später nach – die
 * bereits hochgeladenen Dokumente hängen dann an der falschen Person und die
 * Checkliste meldet "fehlt", obwohl die Datei da ist.
 *
 * Reine Textlogik auf dem gespeicherten `detectedApplicant`: kein KI-Aufruf,
 * kein OCR, daher beliebig oft aufrufbar.
 *
 * @returns Zahl der umgehängten Dokumente.
 */
export async function rematchCaseDocuments(
  caseId: string,
  actor?: { organizationId: string; userId?: string | null }
): Promise<number> {
  const [applicants, docs] = await Promise.all([
    prisma.applicant.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, vorname: true, nachname: true },
    }),
    prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        applicantId: true,
        applicantSource: true,
        detectedApplicant: true,
        documentType: true,
        period: true,
        originalName: true,
      },
    }),
  ]);

  const changes = planRematch(docs, applicants);
  if (changes.length === 0) return 0;

  const nameById = new Map(
    applicants.map((a) => [a.id, [a.vorname, a.nachname].filter(Boolean).join(" ") || null])
  );
  const docById = new Map(docs.map((d) => [d.id, d]));

  for (const change of changes) {
    const doc = docById.get(change.documentId)!;
    const applicantName = nameById.get(change.applicantId) ?? null;
    // Der Dateiname trägt den Antragstellernamen – nach dem Umhängen neu erzeugen.
    const generatedName = doc.documentType
      ? generateFileName({
          documentType: doc.documentType as DocumentType,
          applicantName,
          period: doc.period,
          originalName: doc.originalName,
        })
      : undefined;

    await prisma.document.update({
      where: { id: change.documentId },
      data: {
        applicantId: change.applicantId,
        applicantSource: "auto",
        ...(generatedName ? { generatedName } : {}),
      },
    });

    if (actor) {
      await audit({
        organizationId: actor.organizationId,
        userId: actor.userId ?? null,
        action: "document.reviewed",
        entityType: "document",
        entityId: change.documentId,
        metadata: { assignedApplicant: change.applicantId, source: "auto-match" },
      });
    }
  }

  return changes.length;
}
```

- [ ] **Schritt 4: Test laufen lassen**

Run: `npx vitest run tests/applicant-rematch.test.ts`
Expected: PASS.

- [ ] **Schritt 5: In `editApplicant` einhängen**

In `src/lib/actions/case-edit.ts` den Import ergänzen:

```ts
import { rematchCaseDocuments } from "@/lib/documents/rematch";
```

In `editApplicant` zwischen dem `prisma.applicant.update` und dem `audit`-Aufruf einfügen:

```ts
  // Ein neu gesetzter Name macht die Zuordnung erst möglich: addApplicant legt
  // eine namenlose Person an, erst hier kommt der Name dazu. Best-effort – das
  // Speichern der Stammdaten darf daran nie scheitern.
  if (data.vorname !== undefined || data.nachname !== undefined) {
    try {
      await rematchCaseDocuments(updated.caseId, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    } catch (e) {
      console.error("[editApplicant] Automatische Dokumentzuordnung fehlgeschlagen:", e);
    }
  }
```

- [ ] **Schritt 6: In `addApplicant` einhängen**

In `src/lib/actions/case-edit.ts`, in `addApplicant` zwischen `prisma.applicant.create` und dem `audit`-Aufruf:

```ts
  // Meist wirkungslos (die neue Person ist noch namenlos), aber vollständig:
  // beim Import kann sie bereits mit Namen angelegt worden sein.
  try {
    await rematchCaseDocuments(caseId, { organizationId: ctx.organizationId, userId: ctx.userId });
  } catch (e) {
    console.error("[addApplicant] Automatische Dokumentzuordnung fehlgeschlagen:", e);
  }
```

- [ ] **Schritt 7: In den FinLink-Abgleich einhängen**

In `src/lib/actions/finlink.ts` den Import ergänzen:

```ts
import { rematchCaseDocuments } from "@/lib/documents/rematch";
```

Direkt nach `const result = await fillCaseFromCanonical(caseRow.id, canonical);` einfügen:

```ts
  // Der Abgleich kann Antragsteller angelegt haben – bereits hochgeladene
  // Dokumente jetzt neu zuordnen. Best-effort.
  try {
    await rematchCaseDocuments(caseRow.id, { organizationId: ctx.organizationId, userId: ctx.userId });
  } catch (e) {
    console.error("[finlink] Automatische Dokumentzuordnung fehlgeschlagen:", e);
  }
```

Falls die Kontextvariable dort anders heißt als `ctx`, den vorhandenen Namen verwenden — die Datei liest den Kontext bereits für ihre Audit-Aufrufe.

- [ ] **Schritt 8: Tests und Typecheck**

Run: `npx vitest run tests/applicant-rematch.test.ts tests/applicant-actions.test.ts tests/case-edit-authz.test.ts tests/finlink-action.test.ts && npm run typecheck`
Expected: PASS, Typecheck ohne Ausgabe. Schlägt ein Bestandstest fehl, weil `prisma.document`/`prisma.applicant` in seinem Mock fehlen: die fehlenden Methoden als `vi.fn()` mit leerem Array ergänzen, nicht die Produktivlogik ändern.

- [ ] **Schritt 9: Committen**

```bash
git add src/lib/documents/rematch.ts src/lib/actions/case-edit.ts src/lib/actions/finlink.ts tests/applicant-rematch.test.ts
git commit -m "feat(zuordnung): nachtraeglich angelegte Antragsteller bekommen ihre Dokumente automatisch"
```

---

### Task 6: Sichtbarkeit und Korrektur in der Oberfläche

**Files:**
- Modify: `src/lib/actions/review.ts` (`assignDocumentApplicant`)
- Modify: `src/components/review/applicant-select.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx:242`
- Modify: `src/app/(app)/review/page.tsx:153`
- Test: `tests/assign-document-applicant.test.ts` (bestehend, erweitern)

**Interfaces:**
- Consumes: Spalte `applicantSource` (Task 2).
- Produces: `ApplicantSelect` akzeptiert zusätzlich `source?: string | null`.

- [ ] **Schritt 1: Test für die manuelle Markierung ergänzen**

In `tests/assign-document-applicant.test.ts` innerhalb des bestehenden `describe("assignDocumentApplicant", …)` ergänzen:

```ts
  it("markiert eine Zuordnung von Hand als manuell, damit die Automatik sie nicht überschreibt", async () => {
    await assignDocumentApplicant("d1", "app-2");
    const arg = documentUpdate.mock.calls[0]![0] as { data: { applicantSource: string } };
    expect(arg.data.applicantSource).toBe("manuell");
  });

  it("markiert auch das Aufheben der Zuordnung als manuell", async () => {
    await assignDocumentApplicant("d1", null);
    const arg = documentUpdate.mock.calls[0]![0] as { data: { applicantSource: string } };
    expect(arg.data.applicantSource).toBe("manuell");
  });
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/assign-document-applicant.test.ts`
Expected: FAIL — `expected undefined to be 'manuell'`.

- [ ] **Schritt 3: Action anpassen**

In `src/lib/actions/review.ts`, in `assignDocumentApplicant`, das `prisma.document.update` ändern:

```ts
  await prisma.document.update({
    where: { id: documentId },
    // Eine Auswahl von Hand ist eine Entscheidung des Vermittlers: als
    // "manuell" markieren, damit der automatische Abgleich sie nie überschreibt.
    data: { applicantId, applicantSource: "manuell", ...(generatedName ? { generatedName } : {}) },
  });
```

- [ ] **Schritt 4: Test laufen lassen**

Run: `npx vitest run tests/assign-document-applicant.test.ts`
Expected: PASS.

- [ ] **Schritt 5: Hinweis in der Komponente**

In `src/components/review/applicant-select.tsx` die Signatur und das Markup ändern. Aus:

```tsx
export function ApplicantSelect({
  documentId,
  value,
  applicants,
  className,
}: {
  documentId: string;
  value: string | null;
  applicants: ApplicantOption[];
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    setCurrent(next);
    startTransition(async () => {
      await assignDocumentApplicant(documentId, next || null);
    });
  }

  return (
    <select
```

wird:

```tsx
export function ApplicantSelect({
  documentId,
  value,
  applicants,
  source,
  className,
}: {
  documentId: string;
  value: string | null;
  applicants: ApplicantOption[];
  /** Herkunft der Zuordnung: "auto" zeigt einen Hinweis an. */
  source?: string | null;
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    setCurrent(next);
    setTouched(true);
    startTransition(async () => {
      await assignDocumentApplicant(documentId, next || null);
    });
  }

  // Nach eigener Auswahl ist die Zuordnung nicht mehr automatisch – der Hinweis
  // verschwindet sofort, ohne auf das Neuladen der Seite zu warten.
  const zeigeAutoHinweis = source === "auto" && !touched && current !== "";

  return (
    <div className="space-y-1">
      <select
```

Das schließende `</select>` bekommt den Hinweis und den umschließenden Abschluss:

```tsx
      </select>
      {zeigeAutoHinweis && (
        <p className="text-xs text-muted-foreground">automatisch zugeordnet</p>
      )}
    </div>
  );
}
```

- [ ] **Schritt 6: Wert durchreichen**

In `src/app/(app)/cases/[id]/page.tsx` (Zeile 242):

```tsx
                                <ApplicantSelect documentId={d.id} value={d.applicantId} source={d.applicantSource} applicants={applicantSelectOptions} />
```

In `src/app/(app)/review/page.tsx` (Zeile 153):

```tsx
                    <ApplicantSelect documentId={d.id} value={d.applicantId} source={d.applicantSource} applicants={applicantOptions} />
```

Beide Seiten laden ihre Dokumente per `include` und haben `applicantSource` damit bereits dabei.

- [ ] **Schritt 7: Typecheck und Build**

Run: `npm run typecheck && npm run build`
Expected: Typecheck ohne Ausgabe, Build „Compiled successfully".

- [ ] **Schritt 8: Committen**

```bash
git add src/lib/actions/review.ts src/components/review/applicant-select.tsx "src/app/(app)/cases/[id]/page.tsx" "src/app/(app)/review/page.tsx" tests/assign-document-applicant.test.ts
git commit -m "feat(zuordnung): automatische Zuordnung sichtbar machen, Handauswahl schuetzen"
```

---

### Task 7: Integrationstest gegen echtes Schema und Abschluss

**Files:**
- Create: `tests/applicant-rematch-db.test.ts`
- Test: gesamte Suite

**Interfaces:**
- Consumes: `rematchCaseDocuments` (Task 5), Spalte `applicantSource` (Task 2).
- Produces: nichts.

- [ ] **Schritt 1: Integrationstest schreiben**

Create `tests/applicant-rematch-db.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Der Colell-Ablauf gegen das echte Schema: Fall mit einer Person, Dokumente
 * hochgeladen, zweite Person kommt später mit Namen dazu.
 */
describe.runIf(RUN)("rematchCaseDocuments (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let caseId: string;
  let laura: string;
  let orgId: string;

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const { PrismaPGlite } = await import("pglite-prisma-adapter");
    const { PrismaClient } = await import("@prisma/client");
    const pg = new PGlite();
    await pg.exec(ddl);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaPGlite(pg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = new PrismaClient({ adapter } as any);
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-rematch" } });
    orgId = org.id;
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9001", status: "unterlagen_fehlen" },
    });
    caseId = c.id;
    const a1 = await prisma.applicant.create({
      data: { caseId, position: 1, vorname: "Laura", nachname: "Colell" },
    });
    laura = a1.id;

    const basis = {
      caseId,
      storageKey: "k",
      mimeType: "application/pdf",
      sizeBytes: 10,
      uploadSource: "kunde" as const,
      applicantId: laura,
      applicantSource: "auto",
    };
    await prisma.document.createMany({
      data: [
        { ...basis, originalName: "perso-thomas.pdf", documentType: "personalausweis", detectedApplicant: "Thomas Colell" },
        { ...basis, originalName: "perso-laura.pdf", documentType: "personalausweis", detectedApplicant: "Laura Colell" },
        { ...basis, originalName: "ohne-namen.pdf", documentType: "sonstiges", detectedApplicant: null },
        { ...basis, originalName: "hand-zugeordnet.pdf", documentType: "personalausweis", detectedApplicant: "Thomas Colell", applicantSource: "manuell" },
      ],
    });
  });

  it("hängt nach dem Anlegen des zweiten Antragstellers nur die passenden Dokumente um", async () => {
    const a2 = await prisma.applicant.create({
      data: { caseId, position: 2, vorname: "Thomas", nachname: "Colell" },
    });
    const { rematchCaseDocuments } = await import("@/lib/documents/rematch");
    const count = await rematchCaseDocuments(caseId, { organizationId: orgId, userId: null });
    expect(count).toBe(1);

    const byName = async (name: string) =>
      prisma.document.findFirst({ where: { caseId, originalName: name } });

    expect((await byName("perso-thomas.pdf")).applicantId).toBe(a2.id);
    expect((await byName("perso-thomas.pdf")).generatedName).toContain("Thomas");
    expect((await byName("perso-laura.pdf")).applicantId).toBe(laura);
    // Kein erkannter Name: bestehende Zuordnung bleibt, die Checkliste läuft nie rückwärts.
    expect((await byName("ohne-namen.pdf")).applicantId).toBe(laura);
    // Handzuordnung des Vermittlers bleibt unangetastet.
    expect((await byName("hand-zugeordnet.pdf")).applicantId).toBe(laura);
  });
});
```

- [ ] **Schritt 2: Integrationstest laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/applicant-rematch-db.test.ts`
Expected: PASS. (Ohne `RUN_DB_IT=1` wird der Block übersprungen — auch das einmal prüfen: `npx vitest run tests/applicant-rematch-db.test.ts` meldet „skipped".)

- [ ] **Schritt 3: Gesamte Suite und Typecheck**

Run: `npm test && npm run typecheck`
Expected: alle Tests grün, Typecheck ohne Ausgabe. Fehlschlagende Bestandstests hier beheben — bevorzugt im Test-Mock, nicht durch Aufweichen der Produktivlogik.

- [ ] **Schritt 4: Committen**

```bash
git add tests/applicant-rematch-db.test.ts
git commit -m "test(zuordnung): Colell-Ablauf gegen echtes Schema absichern"
```

- [ ] **Schritt 5: Schema in die Datenbank bringen**

Run: `npm run db:push`
Expected: „Your database is now in sync with your Prisma schema." Die Spalte ist additiv und nullbar; Bestandszeilen bekommen `null`.

**Achtung:** Es gibt kein getrenntes Staging — dieser Befehl läuft gegen die Produktionsdatenbank. Vor dem Ausführen prüfen, dass `DATABASE_URL` auf das erwartete Ziel zeigt, und danach mit `npx prisma db pull --print | grep applicantSource` bestätigen, dass die Spalte angekommen ist.

- [ ] **Schritt 6: Deployen und Ergebnis prüfen**

Erst nach Freigabe durch Jürgen: `git push`, dann in Vercel den Build abwarten. Danach in der laufenden Anwendung gegenprüfen — Fall mit zwei Antragstellern öffnen, ein Dokument muss den Hinweis „automatisch zugeordnet" zeigen. Behauptungen über den Live-Stand erst nach dieser Sichtprüfung (siehe Gedächtniseintrag `verify-deployed-claims`).

---

## Offene Punkte für später

- Bestandsdokumente mit `applicantSource = null` und gesetzter Zuordnung bleiben bewusst unangetastet. Sollte sich zeigen, dass davon viele falsch hängen, wäre ein einmaliges Skript der Weg — kein Automatismus.
- Der Hinweis „automatisch zugeordnet" erscheint nur an der Auswahlliste. Eine Sammelansicht „n Dokumente automatisch zugeordnet, bitte prüfen" in der Nächster-Schritt-Leiste ist bewusst nicht Teil dieses Plans.
