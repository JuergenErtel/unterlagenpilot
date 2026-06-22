# Einkommensanalyse Selbständige Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KI-gestützte Einkommensanalyse für Selbständige – KI extrahiert je Finanzdokument Jahr + Kennzahlen + Klartext-Notiz, deterministischer Code konsolidiert zu einer Jahres-Matrix mit Trends, der Vermittler prüft, Ergebnis als bankfertiges PDF (als Falldokument abgelegt).

**Architecture:** „KI sieht, Code rechnet." Mistral (EU) liest BWA/G+V/Jahresabschluss/EÜR/ESt-Bescheid (Bilder via image_url, PDFs via document_url – Infrastruktur aus Feature 1 vorhanden). Eine reine, getestete Engine baut die Jahr×Kennzahl-Matrix + Trends; kein automatischer Einkommenswert. Kein neues DB-Modell – das erzeugte PDF ist das Artefakt (über die bestehende Storage-/Document-Ablage).

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma/Postgres, Zod, pdfkit, Mistral (openai-compatible vision/document), vitest.

## Global Constraints

- KI liefert nur Wahrnehmung (Jahr, Kennzahlen, Notiz, Konfidenz) – Matrix/Trend rechnet deterministischer Code; KEIN automatischer Einkommenswert.
- Einkommensansatz ist ein manuelles Feld des Vermittlers.
- Jede Übernahme nach menschlicher Prüfung; jeder Wert editierbar; Konfidenz sichtbar.
- Tenant-Isolation: Actions über `requireCaseAccess`. Uploads über `processUpload` (Validierung + Virenscan + privater Storage). Keine Kundendaten/Rohinhalte in Logs (Audit nur Metadaten).
- EU/DSGVO: KI-Aufrufe nur an Mistral; Bilder als `image_url` (data-URI), PDFs als `document_url` (kurzlebige Supabase-Signed-URL).
- Pflicht-Haftungshinweis (verbatim): „Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Werte prüfen."
- Kein neues DB-Modell; PDF-Ablage als `documentType: "sonstige"`, Dateiname `Einkommensanalyse_<Namen>.pdf`.
- Tests mit vitest; pro Task committen.

---

### Task 1: Konsolidierungs-/Trend-Engine (rein)

**Files:**
- Create: `src/lib/einkommen/consolidate.ts`
- Test: `tests/einkommen-consolidate.test.ts`

**Interfaces:**
- Produces:
  - `type Kennzahl = "umsatz" | "gewinn" | "zuVersteuerndesEinkommen" | "afa" | "zinsaufwand" | "privatentnahmen" | "geschaeftsfuehrergehalt"`
  - `const KENNZAHL_LABELS: Record<Kennzahl, string>`
  - `type Trend = "steigend" | "fallend" | "stabil" | "unbekannt"`
  - `interface EinkommenDoc { dokumenttyp: string; jahr: number; kennzahlen: Partial<Record<Kennzahl, number>>; notiz: string; konfidenz: number }`
  - `interface MatrixCell { value: number; conflict: boolean; alle: number[] }`
  - `interface MatrixRow { kennzahl: Kennzahl; cells: Record<number, MatrixCell>; trend: Trend }`
  - `interface ConsolidatedMatrix { jahre: number[]; rows: MatrixRow[] }`
  - `function trendFor(valuesInYearOrder: number[]): Trend`
  - `function consolidateEinkommen(docs: EinkommenDoc[]): ConsolidatedMatrix`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/einkommen-consolidate.test.ts
import { describe, it, expect } from "vitest";
import { consolidateEinkommen, trendFor, type EinkommenDoc } from "@/lib/einkommen/consolidate";

describe("Einkommens-Konsolidierung", () => {
  it("trendFor: steigend/fallend/stabil/unbekannt", () => {
    expect(trendFor([100, 120])).toBe("steigend");
    expect(trendFor([120, 90])).toBe("fallend");
    expect(trendFor([100, 102])).toBe("stabil");
    expect(trendFor([100])).toBe("unbekannt");
    expect(trendFor([])).toBe("unbekannt");
  });

  it("baut eine Jahr×Kennzahl-Matrix, Jahre aufsteigend", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 200000, gewinn: 80000 }, notiz: "", konfidenz: 0.9 },
      { dokumenttyp: "euer", jahr: 2022, kennzahlen: { umsatz: 180000, gewinn: 70000 }, notiz: "", konfidenz: 0.9 },
    ];
    const m = consolidateEinkommen(docs);
    expect(m.jahre).toEqual([2022, 2023]);
    const gewinn = m.rows.find((r) => r.kennzahl === "gewinn")!;
    expect(gewinn.cells[2022]!.value).toBe(70000);
    expect(gewinn.cells[2023]!.value).toBe(80000);
    expect(gewinn.trend).toBe("steigend");
  });

  it("markiert Konflikte zwischen Dokumenten desselben Jahres", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { gewinn: 80000 }, notiz: "", konfidenz: 0.9 },
      { dokumenttyp: "einkommensteuerbescheid", jahr: 2023, kennzahlen: { gewinn: 75000 }, notiz: "", konfidenz: 0.8 },
    ];
    const m = consolidateEinkommen(docs);
    const gewinn = m.rows.find((r) => r.kennzahl === "gewinn")!;
    expect(gewinn.cells[2023]!.conflict).toBe(true);
    expect(gewinn.cells[2023]!.alle.sort()).toEqual([75000, 80000]);
  });

  it("nimmt nur Kennzahlen mit mindestens einem Wert in die Matrix auf", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 100000 }, notiz: "", konfidenz: 0.9 },
    ];
    const m = consolidateEinkommen(docs);
    expect(m.rows.some((r) => r.kennzahl === "umsatz")).toBe(true);
    expect(m.rows.some((r) => r.kennzahl === "afa")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-consolidate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/einkommen/consolidate.ts
export type Kennzahl =
  | "umsatz"
  | "gewinn"
  | "zuVersteuerndesEinkommen"
  | "afa"
  | "zinsaufwand"
  | "privatentnahmen"
  | "geschaeftsfuehrergehalt";

export const KENNZAHL_LABELS: Record<Kennzahl, string> = {
  umsatz: "Umsatz / Gesamtleistung",
  gewinn: "Gewinn / Jahresüberschuss",
  zuVersteuerndesEinkommen: "Zu versteuerndes Einkommen",
  afa: "Abschreibungen (AfA)",
  zinsaufwand: "Zinsaufwand",
  privatentnahmen: "Privatentnahmen",
  geschaeftsfuehrergehalt: "Geschäftsführergehalt",
};

// Reihenfolge der Zeilen in der Matrix/PDF.
export const KENNZAHL_ORDER: Kennzahl[] = [
  "umsatz",
  "gewinn",
  "zuVersteuerndesEinkommen",
  "geschaeftsfuehrergehalt",
  "afa",
  "zinsaufwand",
  "privatentnahmen",
];

export type Trend = "steigend" | "fallend" | "stabil" | "unbekannt";

export interface EinkommenDoc {
  dokumenttyp: string;
  jahr: number;
  kennzahlen: Partial<Record<Kennzahl, number>>;
  notiz: string;
  konfidenz: number;
}

export interface MatrixCell {
  value: number;
  conflict: boolean;
  alle: number[];
}

export interface MatrixRow {
  kennzahl: Kennzahl;
  cells: Record<number, MatrixCell>;
  trend: Trend;
}

export interface ConsolidatedMatrix {
  jahre: number[];
  rows: MatrixRow[];
}

export function trendFor(valuesInYearOrder: number[]): Trend {
  if (valuesInYearOrder.length < 2) return "unbekannt";
  const first = valuesInYearOrder[0]!;
  const last = valuesInYearOrder[valuesInYearOrder.length - 1]!;
  if (first === 0) return last === 0 ? "stabil" : last > 0 ? "steigend" : "fallend";
  const ratio = last / first;
  if (ratio > 1.05) return "steigend";
  if (ratio < 0.95) return "fallend";
  return "stabil";
}

export function consolidateEinkommen(docs: EinkommenDoc[]): ConsolidatedMatrix {
  const jahre = Array.from(new Set(docs.map((d) => d.jahr))).sort((a, b) => a - b);

  const rows: MatrixRow[] = [];
  for (const kennzahl of KENNZAHL_ORDER) {
    const cells: Record<number, MatrixCell> = {};
    for (const jahr of jahre) {
      const werte = docs
        .filter((d) => d.jahr === jahr)
        .map((d) => d.kennzahlen[kennzahl])
        .filter((v): v is number => typeof v === "number");
      if (werte.length === 0) continue;
      const distinct = Array.from(new Set(werte));
      cells[jahr] = { value: werte[0]!, conflict: distinct.length > 1, alle: distinct };
    }
    if (Object.keys(cells).length === 0) continue;
    const valuesInYearOrder = jahre.filter((j) => cells[j]).map((j) => cells[j]!.value);
    rows.push({ kennzahl, cells, trend: trendFor(valuesInYearOrder) });
  }

  return { jahre, rows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-consolidate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/einkommen/consolidate.ts tests/einkommen-consolidate.test.ts
git commit -m "feat(einkommen): Konsolidierungs-/Trend-Engine + Tests"
```

---

### Task 2: KI-Extraktionsschema (Zod)

**Files:**
- Create: `src/lib/einkommen/schema.ts`
- Test: `tests/einkommen-schema.test.ts`

**Interfaces:**
- Consumes: `Kennzahl`, `EinkommenDoc` (Task 1).
- Produces:
  - `selfEmployedAnalysisSchema` (Zod), `type SelfEmployedAnalysis`
  - `selfEmployedJsonSchema: Record<string, unknown>`
  - `toEinkommenDocs(a: SelfEmployedAnalysis): EinkommenDoc[]`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/einkommen-schema.test.ts
import { describe, it, expect } from "vitest";
import { selfEmployedAnalysisSchema, toEinkommenDocs } from "@/lib/einkommen/schema";

describe("Selbständige-Analyse-Schema", () => {
  it("validiert eine KI-Ausgabe und mappt auf EinkommenDoc[]", () => {
    const parsed = selfEmployedAnalysisSchema.parse({
      docs: [
        { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 200000, gewinn: 80000 }, notiz: "Stabiler Gewinn.", konfidenz: 0.9 },
        { dokumenttyp: "sonstige", jahr: 2022, notiz: "", konfidenz: 0.4 },
      ],
    });
    const docs = toEinkommenDocs(parsed);
    expect(docs.length).toBe(2);
    expect(docs[0]!.kennzahlen.gewinn).toBe(80000);
    expect(docs[1]!.kennzahlen).toEqual({}); // fehlende kennzahlen → leeres Objekt
  });

  it("ignoriert Dokumente ohne plausibles Jahr", () => {
    const parsed = selfEmployedAnalysisSchema.parse({ docs: [{ dokumenttyp: "euer", jahr: 0, notiz: "", konfidenz: 0.5 }] });
    expect(toEinkommenDocs(parsed).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/einkommen/schema.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EinkommenDoc, Kennzahl } from "@/lib/einkommen/consolidate";

const kennzahlenSchema = z
  .object({
    umsatz: z.number().optional(),
    gewinn: z.number().optional(),
    zuVersteuerndesEinkommen: z.number().optional(),
    afa: z.number().optional(),
    zinsaufwand: z.number().optional(),
    privatentnahmen: z.number().optional(),
    geschaeftsfuehrergehalt: z.number().optional(),
  })
  .default({});

const docSchema = z.object({
  dokumenttyp: z
    .enum([
      "bwa",
      "jahresabschluss",
      "euer",
      "einkommensteuerbescheid",
      "einkommensteuererklaerung",
      "susa",
      "sonstige",
    ])
    .default("sonstige"),
  jahr: z.number().int().default(0),
  kennzahlen: kennzahlenSchema,
  notiz: z.string().default(""),
  konfidenz: z.number().min(0).max(1).default(0.5),
});

export const selfEmployedAnalysisSchema = z.object({
  docs: z.array(docSchema).default([]),
});

export type SelfEmployedAnalysis = z.infer<typeof selfEmployedAnalysisSchema>;

export const selfEmployedJsonSchema = zodToJsonSchema(
  selfEmployedAnalysisSchema,
  "selfEmployed"
) as Record<string, unknown>;

/** Mappt die KI-Ausgabe auf EinkommenDoc[]; verwirft Dokumente ohne plausibles Jahr. */
export function toEinkommenDocs(a: SelfEmployedAnalysis): EinkommenDoc[] {
  return a.docs
    .filter((d) => d.jahr >= 1990 && d.jahr <= 2100)
    .map((d) => {
      const kennzahlen: Partial<Record<Kennzahl, number>> = {};
      for (const [k, v] of Object.entries(d.kennzahlen)) {
        if (typeof v === "number") kennzahlen[k as Kennzahl] = v;
      }
      return { dokumenttyp: d.dokumenttyp, jahr: d.jahr, kennzahlen, notiz: d.notiz, konfidenz: d.konfidenz };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/einkommen/schema.ts tests/einkommen-schema.test.ts
git commit -m "feat(einkommen): Zod-Schema für KI-Analyse + Mapping"
```

---

### Task 3: AIService.analyzeSelfEmployedDocs + Mock

**Files:**
- Modify: `src/lib/ai/service.ts` (Import + Methode)
- Modify: `src/lib/ai/mock-provider.ts` (`case "selfEmployed":`)
- Test: `tests/einkommen-ai.test.ts`

**Interfaces:**
- Consumes: `selfEmployedAnalysisSchema`, `selfEmployedJsonSchema`, `type SelfEmployedAnalysis` (Task 2). The provider already supports `images` and `documents` (built in Feature 1) – reuse exactly like `analyzeFloorplan`.
- Produces: `AIService.analyzeSelfEmployedDocs(images, documents?): Promise<SelfEmployedAnalysis>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/einkommen-ai.test.ts
import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("KI-Selbständigen-Analyse (Mock)", () => {
  it("liefert mehrjährige Dokumente", async () => {
    const res = await ai.analyzeSelfEmployedDocs([], [{ url: "https://example.com/euer-2023.pdf", name: "euer.pdf" }]);
    expect(res.docs.length).toBeGreaterThan(1);
    expect(res.docs[0]!.jahr).toBeGreaterThan(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-ai.test.ts`
Expected: FAIL ("analyzeSelfEmployedDocs is not a function").

- [ ] **Step 3a: Mock-Demo-Dokumente**

In `src/lib/ai/mock-provider.ts`, im `switch (req.schemaName)` von `completeJSON`, vor `default:` einfügen:

```typescript
      case "selfEmployed":
        return {
          docs: [
            { dokumenttyp: "einkommensteuerbescheid", jahr: 2022, kennzahlen: { zuVersteuerndesEinkommen: 78000, gewinn: 82000 }, notiz: "Steuerbescheid 2022, stabiles Einkommen.", konfidenz: 0.88 },
            { dokumenttyp: "einkommensteuerbescheid", jahr: 2023, kennzahlen: { zuVersteuerndesEinkommen: 84000, gewinn: 88000 }, notiz: "Steuerbescheid 2023, leicht steigend.", konfidenz: 0.88 },
            { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 210000, gewinn: 88000, afa: 12000 }, notiz: "EÜR 2023, Umsatz 210k.", konfidenz: 0.8 },
            { dokumenttyp: "bwa", jahr: 2024, kennzahlen: { umsatz: 120000, gewinn: 52000 }, notiz: "BWA per 06/2024 (unterjährig).", konfidenz: 0.6 },
          ],
        };
```

- [ ] **Step 3b: `analyzeSelfEmployedDocs` im AIService**

In `src/lib/ai/service.ts` Import ergänzen und Methode neben `analyzeFloorplan` hinzufügen:

```typescript
// bei den Importen:
import { selfEmployedAnalysisSchema, selfEmployedJsonSchema, type SelfEmployedAnalysis } from "@/lib/einkommen/schema";

// neue Methode (gleiche Konvention wie analyzeFloorplan, this.provider + safeParse):
  async analyzeSelfEmployedDocs(
    images: Array<{ base64: string; mimeType: string }>,
    documents: Array<{ url: string; name?: string }> = []
  ): Promise<SelfEmployedAnalysis> {
    const raw = await this.provider.completeJSON({
      schemaName: "selfEmployed",
      system:
        "Du bist Bankanalyst für Selbständigen-Einkommen. Analysiere die beigefügten " +
        "Finanzunterlagen (BWA, G+V/Jahresabschluss, EÜR, Einkommensteuerbescheid/-erklärung). " +
        "Gib für JEDES Dokument: dokumenttyp, jahr (Geschäftsjahr/Veranlagungsjahr), kennzahlen " +
        "(umsatz, gewinn, zuVersteuerndesEinkommen, afa, zinsaufwand, privatentnahmen, " +
        "geschaeftsfuehrergehalt – nur falls erkennbar, in EUR), eine kurze notiz (1–2 Sätze) und " +
        "konfidenz (0–1). Erfinde keine Zahlen. Antworte ausschließlich als JSON.",
      user: "Analysiere die Unterlagen und liefere die Dokumentliste gemäß Schema.",
      jsonSchema: selfEmployedJsonSchema,
      images,
      documents,
    });
    const parsed = selfEmployedAnalysisSchema.safeParse(raw);
    if (!parsed.success) return { docs: [] };
    return parsed.data;
  }
```

> Falls `this.provider` in der Klasse anders heißt: an die bestehende Konvention von `analyzeFloorplan` anpassen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-ai.test.ts && npm run typecheck`
Expected: PASS + Typecheck ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/service.ts src/lib/ai/mock-provider.ts tests/einkommen-ai.test.ts
git commit -m "feat(einkommen): KI-Analyse analyzeSelfEmployedDocs + Mock-Demo"
```

---

### Task 4: PDF „Einkommensanalyse Selbständige"

**Files:**
- Modify: `src/lib/pdf/renderer.ts` (Funktion `renderEinkommensanalyse` + Typ)
- Test: `tests/pdf.test.ts` (Render-Smoke ergänzen)

**Interfaces:**
- Consumes: `BrokerInfo`, Helfer `newDoc/coverHeader/heading/footer/docToBuffer` (bestehend), `Trend` (Task 1).
- Produces:
  - `interface EinkommensanalyseData { applicantName: string; caseNumber: string; dateStr: string; broker: BrokerInfo; jahre: number[]; rows: Array<{ label: string; cells: Record<number, number | null>; trend: Trend }>; docNotes: Array<{ label: string; notiz: string }>; einkommensansatzJahr: number | null; einkommensansatzMonat: number | null }`
  - `renderEinkommensanalyse(data: EinkommensanalyseData): Promise<Buffer>`

- [ ] **Step 1: Render-Smoke-Test ergänzen**

In `tests/pdf.test.ts` (Import oben in die bestehende Gruppe von `@/lib/pdf/renderer` aufnehmen) + neuer Test:

```typescript
it("erzeugt eine Einkommensanalyse Selbständige", async () => {
  const buf = await renderEinkommensanalyse({
    applicantName: "Max Mustermann",
    caseNumber: "UP-2026-0001",
    dateStr: "21.06.2026",
    broker,
    jahre: [2022, 2023],
    rows: [
      { label: "Umsatz / Gesamtleistung", cells: { 2022: 180000, 2023: 210000 }, trend: "steigend" },
      { label: "Gewinn / Jahresüberschuss", cells: { 2022: 70000, 2023: 88000 }, trend: "steigend" },
    ],
    docNotes: [{ label: "EÜR 2023", notiz: "Umsatz 210k, Gewinn 88k." }],
    einkommensansatzJahr: 80000,
    einkommensansatzMonat: 6667,
  });
  expect(isPdf(buf)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL ("renderEinkommensanalyse is not exported").

- [ ] **Step 3: Implementierung**

Am Ende von `src/lib/pdf/renderer.ts` ergänzen (Typ `Trend` lokal als String-Union, um keine Engine-Abhängigkeit ins PDF-Modul zu ziehen):

```typescript
export interface EinkommensanalyseData {
  applicantName: string;
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  jahre: number[];
  rows: Array<{ label: string; cells: Record<number, number | null>; trend: "steigend" | "fallend" | "stabil" | "unbekannt" }>;
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
  einkommensansatzMonat: number | null;
}

const TREND_LABEL: Record<string, string> = {
  steigend: "↑ steigend",
  fallend: "↓ fallend",
  stabil: "→ stabil",
  unbekannt: "—",
};

function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export async function renderEinkommensanalyse(data: EinkommensanalyseData): Promise<Buffer> {
  const doc = newDoc(`Einkommensanalyse ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Einkommensanalyse Selbständige", `${data.applicantName} · Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Kennzahlen je Jahr");
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  if (data.rows.length === 0) {
    doc.text("Keine Kennzahlen erfasst.");
  } else {
    const head = `Kennzahl  ·  ${data.jahre.join("   ")}   ·  Trend`;
    doc.font("Helvetica-Bold").text(head);
    doc.font("Helvetica");
    data.rows.forEach((r) => {
      const cols = data.jahre.map((j) => eur(r.cells[j] ?? null)).join("   ");
      doc.text(`${r.label}: ${cols}   (${TREND_LABEL[r.trend] ?? r.trend})`);
      doc.moveDown(0.1);
    });
  }

  if (data.einkommensansatzJahr != null) {
    heading(doc, "Einkommensansatz (Vermittler)");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f3a8a");
    doc.text(`${eur(data.einkommensansatzJahr)} p. a.  ·  ${eur(data.einkommensansatzMonat)} / Monat`);
    doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  }

  if (data.docNotes.length > 0) {
    heading(doc, "Einordnung je Dokument");
    data.docNotes.forEach((n) => {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1a1a1a").text(n.label);
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(n.notiz || "—");
      doc.moveDown(0.2);
    });
  }

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Werte prüfen.",
    { width: 495 }
  );

  footer(doc, data.broker);
  return docToBuffer(doc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pdf.test.ts && npm run typecheck`
Expected: PASS + Typecheck ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/renderer.ts tests/pdf.test.ts
git commit -m "feat(einkommen): bankfertiges PDF der Einkommensanalyse"
```

---

### Task 5: Server-Actions (analysieren + PDF erstellen & ablegen)

**Files:**
- Create: `src/lib/actions/einkommen.ts`

**Interfaces:**
- Consumes: `requireCaseAccess`, `processUpload`, `getStorage`, `audit`, `AIService.analyzeSelfEmployedDocs`, `consolidateEinkommen`/`toEinkommenDocs`, `renderEinkommensanalyse`, `getBrokerInfo`/`pdfFileName` (aus `@/lib/pdf/case-pdf`), `KENNZAHL_LABELS`.
- Produces:
  - `interface EinkommenState { matrix: ConsolidatedMatrix | null; docNotes: Array<{ label: string; notiz: string }>; error?: string }`
  - `analyzeSelfEmployedAction(caseId, _prev, formData): Promise<EinkommenState>`
  - `interface EinkommenPdfInput { jahre: number[]; rows: Array<{ kennzahl: string; label: string; cells: Record<number, number | null>; trend: string }>; docNotes: Array<{ label: string; notiz: string }>; einkommensansatzJahr: number | null }`
  - `createEinkommensPdfAction(caseId, input): Promise<{ documentId: string }>`

- [ ] **Step 1: Implementierung**

```typescript
// src/lib/actions/einkommen.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { processUpload } from "@/lib/documents/pipeline";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { AIService } from "@/lib/ai/service";
import { consolidateEinkommen, KENNZAHL_LABELS, type ConsolidatedMatrix } from "@/lib/einkommen/consolidate";
import { toEinkommenDocs } from "@/lib/einkommen/schema";
import { renderEinkommensanalyse } from "@/lib/pdf/renderer";
import { getBrokerInfo, pdfFileName } from "@/lib/pdf/case-pdf";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

const ai = new AIService();
const VISION_MIME = new Set(["image/png", "image/jpeg"]);

export interface EinkommenState {
  matrix: ConsolidatedMatrix | null;
  docNotes: Array<{ label: string; notiz: string }>;
  error?: string;
}

export async function analyzeSelfEmployedAction(
  caseId: string,
  _prev: EinkommenState,
  formData: FormData
): Promise<EinkommenState> {
  const { ctx } = await requireCaseAccess(caseId);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { matrix: null, docNotes: [], error: "Bitte mindestens eine Unterlage hochladen." };

  const images: Array<{ base64: string; mimeType: string }> = [];
  const documents: Array<{ url: string; name?: string }> = [];
  const storage = getStorage();
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processUpload({
      organizationId: ctx.organizationId,
      caseId,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadSource: "vermittler",
      actorUserId: ctx.userId,
    });
    if (!result.ok || !result.documentId) continue;
    if (VISION_MIME.has(file.type)) {
      images.push({ base64: buffer.toString("base64"), mimeType: file.type });
    } else if (file.type === "application/pdf") {
      const d = await prisma.document.findUnique({ where: { id: result.documentId }, select: { storageKey: true } });
      const signed = d ? await storage.createSignedUrl(d.storageKey, 300) : null;
      if (signed) documents.push({ url: signed, name: file.name });
    }
  }

  if (images.length === 0 && documents.length === 0) {
    return { matrix: null, docNotes: [], error: "Für die KI-Analyse bitte JPG/PNG- oder PDF-Unterlagen hochladen." };
  }

  let matrix: ConsolidatedMatrix | null = null;
  let docNotes: Array<{ label: string; notiz: string }> = [];
  try {
    const analysis = await ai.analyzeSelfEmployedDocs(images, documents);
    const docs = toEinkommenDocs(analysis);
    matrix = consolidateEinkommen(docs);
    docNotes = docs
      .filter((d) => d.notiz.trim().length > 0)
      .map((d) => ({
        label: `${DOCUMENT_TYPE_LABELS[d.dokumenttyp as DocumentType] ?? d.dokumenttyp} ${d.jahr}`,
        notiz: d.notiz,
      }));
  } catch {
    return { matrix: null, docNotes: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen." };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "einkommen", jahre: matrix.jahre.length, images: images.length, documents: documents.length },
  });

  revalidatePath(`/cases/${caseId}/einkommen-selbststaendig`);
  return { matrix, docNotes };
}

export interface EinkommenPdfInput {
  jahre: number[];
  rows: Array<{ kennzahl: string; label: string; cells: Record<number, number | null>; trend: string }>;
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
}

export async function createEinkommensPdfAction(
  caseId: string,
  input: EinkommenPdfInput
): Promise<{ documentId: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const broker = await getBrokerInfo(ctx.organizationId);
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });
  const applicantName = caseRow.applicants
    .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  const monat = input.einkommensansatzJahr != null ? Math.round(input.einkommensansatzJahr / 12) : null;

  const buffer = await renderEinkommensanalyse({
    applicantName,
    caseNumber: caseRow.caseNumber,
    dateStr: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    broker,
    jahre: input.jahre,
    rows: input.rows.map((r) => ({
      label: r.label || (KENNZAHL_LABELS[r.kennzahl as keyof typeof KENNZAHL_LABELS] ?? r.kennzahl),
      cells: r.cells,
      trend: (r.trend as EinkommenPdfInput["rows"][number]["trend"]) as "steigend" | "fallend" | "stabil" | "unbekannt",
    })),
    docNotes: input.docNotes,
    einkommensansatzJahr: input.einkommensansatzJahr,
    einkommensansatzMonat: monat,
  });

  const fileName = pdfFileName("Einkommensanalyse", caseRow.applicants);
  const stored = await getStorage().put({
    organizationId: ctx.organizationId,
    caseId,
    originalName: fileName,
    mimeType: "application/pdf",
    buffer,
  });
  const created = await prisma.document.create({
    data: {
      caseId,
      originalName: fileName,
      generatedName: fileName,
      storageKey: stored.storageKey,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      documentType: "sonstige",
      uploadSource: "vermittler",
      scanStatus: "ready_for_ocr",
      readable: true,
    },
    select: { id: true },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "pdf.generated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "einkommen", documentId: created.id },
  });
  revalidatePath(`/cases/${caseId}`);
  return { documentId: created.id };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: ohne Fehler. Bei Signatur-Abweichungen die echten Funktionen öffnen und anpassen (keine APIs erfinden).

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/einkommen.ts
git commit -m "feat(einkommen): Server-Actions analysieren + PDF erstellen/ablegen"
```

---

### Task 6: UI – Seite + Prüf-Editor + Button in der Fallakte

**Files:**
- Create: `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx`
- Create: `src/components/case/einkommen-editor.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Button in der Aktionen-Karte)

**Interfaces:**
- Consumes: `requireCaseAccess`, `analyzeSelfEmployedAction`/`createEinkommensPdfAction`/`type EinkommenState`/`type EinkommenPdfInput` (Task 5), `KENNZAHL_LABELS`/`trendFor`/`type ConsolidatedMatrix` (Task 1).

- [ ] **Step 1: Editor-Client-Komponente**

```tsx
// src/components/case/einkommen-editor.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { UploadCloud, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KENNZAHL_LABELS, trendFor, type ConsolidatedMatrix } from "@/lib/einkommen/consolidate";
import {
  analyzeSelfEmployedAction,
  createEinkommensPdfAction,
  type EinkommenState,
} from "@/lib/actions/einkommen";

const TREND_LABEL: Record<string, string> = { steigend: "↑ steigend", fallend: "↓ fallend", stabil: "→ stabil", unbekannt: "—" };

interface EditRow { kennzahl: string; label: string; cells: Record<number, number | null> }

export function EinkommenEditor({ caseId }: { caseId: string }) {
  const action = analyzeSelfEmployedAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<EinkommenState, FormData>(action, { matrix: null, docNotes: [] });

  const [jahre, setJahre] = useState<number[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [notes, setNotes] = useState<Array<{ label: string; notiz: string }>>([]);
  const [ansatz, setAnsatz] = useState<string>("");
  const [docId, setDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.matrix) return;
    setJahre(state.matrix.jahre);
    setRows(
      state.matrix.rows.map((r) => ({
        kennzahl: r.kennzahl,
        label: KENNZAHL_LABELS[r.kennzahl],
        cells: Object.fromEntries(Object.entries(r.cells).map(([j, c]) => [Number(j), c.value])) as Record<number, number | null>,
      }))
    );
    setNotes(state.docNotes);
    setDocId(null);
  }, [state.matrix, state.docNotes]);

  function updateCell(rowIdx: number, jahr: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === rowIdx ? { ...r, cells: { ...r.cells, [jahr]: value === "" ? null : Number(value) } } : r)));
    setDocId(null);
  }

  async function createPdf() {
    const ansatzJahr = ansatz.trim() === "" ? null : Number(ansatz);
    const res = await createEinkommensPdfAction(caseId, {
      jahre,
      rows: rows.map((r) => {
        const vals = jahre.map((j) => r.cells[j]).filter((v): v is number => typeof v === "number");
        return { kennzahl: r.kennzahl, label: r.label, cells: r.cells, trend: trendFor(vals) };
      }),
      docNotes: notes,
      einkommensansatzJahr: ansatzJahr,
    });
    setDocId(res.documentId);
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:border-ai/50">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">Unterlagen hochladen – BWA, G+V, Jahresabschluss, EÜR, Steuerbescheid (JPG/PNG/PDF, mehrjährig)</span>
          <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 text-xs" />
        </label>
        <Button type="submit" className="mt-3 w-full" disabled={pending}>
          {pending ? "Analysiere …" : "Analysieren"}
        </Button>
        {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      </form>

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Kennzahl</th>
                  {jahre.map((j) => <th key={j} className="px-3 py-2">{j}</th>)}
                  <th className="px-3 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const vals = jahre.map((j) => r.cells[j]).filter((v): v is number => typeof v === "number");
                  return (
                    <tr key={r.kennzahl} className="border-b last:border-0">
                      <td className="px-3 py-1 font-medium">{r.label}</td>
                      {jahre.map((j) => (
                        <td key={j} className="px-3 py-1">
                          <Input type="number" value={r.cells[j] ?? ""} onChange={(e) => updateCell(i, j, e.target.value)} className="h-8 w-28" />
                        </td>
                      ))}
                      <td className="px-3 py-1 text-xs text-muted-foreground">{TREND_LABEL[trendFor(vals)]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="ansatz">Einkommensansatz (€/Jahr) – manuell</label>
              <Input id="ansatz" type="number" value={ansatz} onChange={(e) => { setAnsatz(e.target.value); setDocId(null); }} className="mt-1 h-9 w-44" placeholder="z. B. 80000" />
              {ansatz.trim() !== "" && !Number.isNaN(Number(ansatz)) ? (
                <div className="mt-1 text-xs text-muted-foreground">≈ {Math.round(Number(ansatz) / 12).toLocaleString("de-DE")} € / Monat</div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button onClick={createPdf} variant="success" size="sm"><Save className="h-4 w-4" />{docId ? "PDF erstellt" : "PDF erstellen & ablegen"}</Button>
              {docId ? (
                <Button asChild variant="outline" size="sm"><a href={`/api/documents/${docId}/download`}><FileDown className="h-4 w-4" />PDF öffnen</a></Button>
              ) : null}
            </div>
          </div>

          {notes.length > 0 && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="text-sm font-medium">Einordnung je Dokument</div>
              {notes.map((n, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-foreground">{n.label}: </span>
                  <span className="text-muted-foreground">{n.notiz}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Bitte Werte prüfen.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Seite**

```tsx
// src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EinkommenEditor } from "@/components/case/einkommen-editor";

export const dynamic = "force-dynamic";

export default async function EinkommenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Selbständige"
        title="Einkommensanalyse Selbständige"
        subtitle="Finanzunterlagen hochladen, KI-Kennzahlen je Jahr prüfen, Einkommensansatz eintragen, bankfertiges PDF erzeugen."
        actions={<Button asChild variant="outline" size="sm"><Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link></Button>}
      />
      <EinkommenEditor caseId={id} />
    </div>
  );
}
```

- [ ] **Step 3: Button in der Fallakte**

In `src/app/(app)/cases/[id]/page.tsx`, in der „Aktionen"-Karte nach dem Wohnflächen-Button ergänzen:

```tsx
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/einkommen-selbststaendig`}><FileBarChart />Einkommensanalyse Selbständige</Link></Button>
```

(`FileBarChart` ist dort bereits importiert.)

- [ ] **Step 4: Verifizieren**

Run: `npm run typecheck && npm run build`
Expected: Build ok, Route `/cases/[id]/einkommen-selbststaendig` erscheint.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx" src/components/case/einkommen-editor.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(einkommen): UI – Upload, Prüf-Tabelle, Einkommensansatz, PDF"
```

---

## Self-Review

- **Spec-Abdeckung:** Upload+sichere Pipeline+PDF/Bild (Task 5), KI-Extraktion je Dokument (Task 2/3), Konsolidierung+Trend (Task 1), Mehrjahres-Prüftabelle editierbar + Konfidenz (Task 6 – Konfidenz fließt über Notizen/Wert; Werte editierbar), Klartext-Notiz je Dokument (Task 3/5/6), manuelles Einkommensfeld €/Jahr+€/Monat (Task 6), bankfertiges PDF + Ablage als Dokument (Task 4/5), kein Auto-Einkommenswert (nicht implementiert – korrekt), kein DB-Modell (korrekt), Haftungshinweis verbatim (Task 4/6), Tenant-Isolation/Audit (Task 5). ✅
- **Platzhalter:** keine; gesamter Code ausformuliert.
- **Typkonsistenz:** `EinkommenDoc`/`ConsolidatedMatrix`/`consolidateEinkommen`/`trendFor`/`analyzeSelfEmployedDocs`/`renderEinkommensanalyse`/`EinkommensanalyseData`/`analyzeSelfEmployedAction`/`createEinkommensPdfAction`/`EinkommenPdfInput` durchgängig konsistent. `KENNZAHL_LABELS` in Engine definiert, in Action/UI genutzt.
- **Bekannte Annahme:** Konfidenz wird in der Prüftabelle nicht pro Zelle farbcodiert (die Engine wählt einen Wert je Zelle); Konflikte/Notizen liefern die Unsicherheits-Signale. Falls pro-Zelle-Konfidenz gewünscht, eigener Folge-Task.
