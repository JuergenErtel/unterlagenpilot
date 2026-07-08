# Selbständigen-Bankzusammenfassung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus allen Selbständigen-Unterlagen eines Falls per „ein Klick → Vorschau → Freigabe" ein bankfertiges PDF erzeugen, das Kennzahlen-Tabelle und einen deterministischen Begleittext kombiniert.

**Architecture:** Erweiterung der bestehenden „Einkommensanalyse Selbständige" (`/cases/[id]/einkommen-selbststaendig`). Zwei neue reine Funktionen (Ansatz-Vorschlag, Begleittext), zuverlässiger Upload (Direkt-Upload für große PDFs, gibt Document-IDs zurück), Analyse aus bereits gespeicherten Dokumenten, erweiterter PDF-Renderer, erweiterte Editor-UI mit Antragsteller-Auswahl und Stammdaten.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma, pdfkit, Vitest, Supabase Storage.

## Global Constraints

- Sprache im UI/PDF/Copy: **Deutsch**. Ton neutral/sachlich, **keine** Machbarkeits-/Bonitätsbewertung (bestehende Konvention, siehe `summary/page.tsx`).
- **Manuelle Freigabe:** KI-Werte sind nur Vorbelegung; der Vermittler bestätigt/überschreibt vor der PDF-Erzeugung.
- Fehlende Angaben werden **weggelassen, nie erfunden** (kein „undefined"/„null" im Text).
- Euro-Formatierung: `toLocaleString("de-DE")`.
- Kennzahl für den Ansatz ist **`gewinn`** (`KENNZAHL` aus `src/lib/einkommen/consolidate.ts`).
- Tenant-Isolation: alle Aktionen laufen über `requireCaseAccess(caseId)`; Direkt-Upload-Pfade über `isStorageKeyForCase` (bestehend).
- Tests laufen mit `npx vitest run <datei>`; volle Suite `npx vitest run`. Typecheck `npx tsc --noEmit`.

---

## File Structure

**Create:**
- `src/lib/einkommen/ansatz.ts` — reine Funktion `suggestEinkommensansatz`.
- `src/lib/einkommen/bank-text.ts` — reine Funktion `buildSelfEmployedBankText`.
- `tests/einkommen-ansatz.test.ts`, `tests/einkommen-bank-text.test.ts`.

**Modify:**
- `src/lib/actions/einkommen.ts` — Upload-Actions mit Document-ID-Rückgabe, `analyzeStoredSelfEmployedDocs`, `createSelfEmployedBankSummaryAction`.
- `src/lib/pdf/renderer.ts` — `renderEinkommensanalyse` um optionale Begleittext-Sektion erweitern.
- `src/components/case/einkommen-editor.tsx` — Antragsteller-Auswahl, zuverlässiger Upload, Ansatz-Vorbelegung, Stammdaten-Block, „Bankzusammenfassung erstellen".
- `src/app/(app)/cases/[id]/page.tsx` — Cockpit-Aktion umbenennen/hervorheben.
- `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx` — Seitentitel/Intro anpassen.

---

## Task 1: Reine Funktion `suggestEinkommensansatz`

**Files:**
- Create: `src/lib/einkommen/ansatz.ts`
- Test: `tests/einkommen-ansatz.test.ts`

**Interfaces:**
- Consumes: `ConsolidatedMatrix`, `MatrixRow` aus `src/lib/einkommen/consolidate.ts` (bestehend: `matrix.jahre: number[]`, `matrix.rows: {kennzahl, cells: Record<number,{value:number}>, trend}[]`).
- Produces: `suggestEinkommensansatz(matrix: ConsolidatedMatrix): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/einkommen-ansatz.test.ts
import { describe, it, expect } from "vitest";
import { suggestEinkommensansatz } from "@/lib/einkommen/ansatz";
import type { ConsolidatedMatrix } from "@/lib/einkommen/consolidate";

function matrix(gewinn: Record<number, number> | null, extraRows: string[] = []): ConsolidatedMatrix {
  const jahre = gewinn ? Object.keys(gewinn).map(Number).sort((a, b) => a - b) : [];
  const rows: ConsolidatedMatrix["rows"] = [];
  if (gewinn) {
    rows.push({
      kennzahl: "gewinn",
      trend: "unbekannt",
      cells: Object.fromEntries(Object.entries(gewinn).map(([j, v]) => [Number(j), { value: v, conflict: false, alle: [v] }])),
    });
  }
  for (const k of extraRows) {
    rows.push({ kennzahl: k as never, trend: "unbekannt", cells: { 2023: { value: 1, conflict: false, alle: [1] } } });
  }
  return { jahre: jahre.length ? jahre : [2023], rows };
}

describe("suggestEinkommensansatz", () => {
  it("mittelt den Gewinn der letzten 3 Jahre, abgerundet auf 100 €", () => {
    // (82000+91000+96000)/3 = 89666,67 -> floor auf 100 = 89600
    expect(suggestEinkommensansatz(matrix({ 2022: 82000, 2023: 91000, 2024: 96000 }))).toBe(89600);
  });
  it("nimmt nur die letzten 3 Jahre bei mehr Jahren", () => {
    // letzte 3: 2022..2024 -> (60000+70000+80000)/3 = 70000
    expect(suggestEinkommensansatz(matrix({ 2021: 10000, 2022: 60000, 2023: 70000, 2024: 80000 }))).toBe(70000);
  });
  it("bezieht Verlustjahre mit ein", () => {
    // (-20000+40000)/2 = 10000
    expect(suggestEinkommensansatz(matrix({ 2023: -20000, 2024: 40000 }))).toBe(10000);
  });
  it("gibt null zurück, wenn keine Gewinn-Zeile existiert", () => {
    expect(suggestEinkommensansatz(matrix(null, ["umsatz"]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-ansatz.test.ts`
Expected: FAIL — „Cannot find module '@/lib/einkommen/ansatz'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/einkommen/ansatz.ts
import type { ConsolidatedMatrix } from "@/lib/einkommen/consolidate";

/**
 * Vorschlag für den nachhaltigen Einkommensansatz: Durchschnitt der Kennzahl
 * `gewinn` über die letzten bis zu 3 Jahre mit Wert, abgerundet auf volle 100 €.
 * null, wenn keine Gewinn-Werte vorliegen. Nur Vorbelegung – Vermittler entscheidet.
 */
export function suggestEinkommensansatz(matrix: ConsolidatedMatrix): number | null {
  const gewinnRow = matrix.rows.find((r) => r.kennzahl === "gewinn");
  if (!gewinnRow) return null;
  const years = matrix.jahre.filter((j) => gewinnRow.cells[j]).sort((a, b) => a - b);
  if (years.length === 0) return null;
  const lastYears = years.slice(-3);
  const sum = lastYears.reduce((acc, j) => acc + gewinnRow.cells[j]!.value, 0);
  return Math.floor(sum / lastYears.length / 100) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-ansatz.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/einkommen/ansatz.ts tests/einkommen-ansatz.test.ts
git commit -m "feat(einkommen): Einkommensansatz-Vorschlag (Ø Gewinn letzte 3 Jahre)"
```

---

## Task 2: Reine Funktion `buildSelfEmployedBankText`

**Files:**
- Create: `src/lib/einkommen/bank-text.ts`
- Test: `tests/einkommen-bank-text.test.ts`

**Interfaces:**
- Produces:
  - `interface SelfEmployedBankTextInput { applicantName: string; selfEmployment: { firma?: string | null; rechtsform?: string | null; gruendungsjahr?: number | null }; gewinnByYear: Array<{ jahr: number; betrag: number }>; trend: "steigend" | "fallend" | "stabil" | "unbekannt"; documents: Array<{ label: string }>; ansatzJahr: number | null }`
  - `interface SelfEmployedBankText { heading: string; paragraphs: string[] }`
  - `buildSelfEmployedBankText(input: SelfEmployedBankTextInput): SelfEmployedBankText`

- [ ] **Step 1: Write the failing test**

```ts
// tests/einkommen-bank-text.test.ts
import { describe, it, expect } from "vitest";
import { buildSelfEmployedBankText } from "@/lib/einkommen/bank-text";

const base = {
  applicantName: "Angelina Sadykow",
  selfEmployment: { firma: "Sadykow Consulting", rechtsform: "Einzelunternehmen", gruendungsjahr: 2019 },
  gewinnByYear: [
    { jahr: 2022, betrag: 82000 },
    { jahr: 2023, betrag: 91000 },
    { jahr: 2024, betrag: 96000 },
  ],
  trend: "steigend" as const,
  documents: [{ label: "BWA 2024" }, { label: "Jahresabschluss 2023" }],
  ansatzJahr: 88000,
};

describe("buildSelfEmployedBankText", () => {
  it("baut vollständigen Text mit Firma, Jahr, Gewinnen, Ø, Ansatz", () => {
    const t = buildSelfEmployedBankText(base);
    const all = t.paragraphs.join("\n");
    expect(t.heading).toContain("selbstständige");
    expect(all).toContain("Angelina Sadykow");
    expect(all).toContain("Einzelunternehmen");
    expect(all).toContain("Sadykow Consulting");
    expect(all).toContain("seit 2019");
    expect(all).toContain("BWA 2024");
    expect(all).toContain("2023: 91.000 €");
    expect(all).toContain("Durchschnitt");
    expect(all).toContain("steigend");
    expect(all).toContain("88.000 €");
    expect(all).toMatch(/7\.333 €.*Monat/);
  });

  it("lässt fehlende Angaben weg – kein 'undefined'/'null'", () => {
    const t = buildSelfEmployedBankText({
      ...base,
      selfEmployment: { firma: null, rechtsform: null, gruendungsjahr: null },
      documents: [],
      ansatzJahr: null,
    });
    const all = t.paragraphs.join("\n");
    expect(all).not.toMatch(/undefined|null/);
    expect(all).not.toContain("seit ");
    expect(all).not.toContain("Ausgewertete Unterlagen");
    expect(all).not.toContain("nachhaltiges Jahreseinkommen");
  });

  it("nennt bei nur einem Jahr keinen Durchschnitt/Trend", () => {
    const t = buildSelfEmployedBankText({ ...base, gewinnByYear: [{ jahr: 2024, betrag: 96000 }] });
    const all = t.paragraphs.join("\n");
    expect(all).toContain("2024: 96.000 €");
    expect(all).not.toContain("Durchschnitt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-bank-text.test.ts`
Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/einkommen/bank-text.ts
export interface SelfEmployedBankTextInput {
  applicantName: string;
  selfEmployment: { firma?: string | null; rechtsform?: string | null; gruendungsjahr?: number | null };
  /** Nur Jahre mit Gewinn-Wert, aufsteigend sortiert. */
  gewinnByYear: Array<{ jahr: number; betrag: number }>;
  trend: "steigend" | "fallend" | "stabil" | "unbekannt";
  documents: Array<{ label: string }>;
  ansatzJahr: number | null;
}

export interface SelfEmployedBankText {
  heading: string;
  paragraphs: string[];
}

const EUR = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const TREND_WORD: Record<SelfEmployedBankTextInput["trend"], string> = {
  steigend: "steigend",
  fallend: "fallend",
  stabil: "stabil",
  unbekannt: "nicht eindeutig",
};

/** Deterministischer, neutraler Bank-Begleittext für Selbständige. */
export function buildSelfEmployedBankText(input: SelfEmployedBankTextInput): SelfEmployedBankText {
  const heading = "Einkommenssituation (selbstständige Tätigkeit)";
  const paragraphs: string[] = [];
  const se = input.selfEmployment;
  const name = input.applicantName.trim() || "Der/die Antragsteller:in";

  let taetigkeit = `${name} ist selbstständig tätig`;
  const firma = se.firma?.trim();
  const rechtsform = se.rechtsform?.trim();
  if (rechtsform && firma) taetigkeit += ` als ${rechtsform} „${firma}"`;
  else if (firma) taetigkeit += ` (${firma})`;
  else if (rechtsform) taetigkeit += ` (${rechtsform})`;
  if (se.gruendungsjahr) taetigkeit += ` (seit ${se.gruendungsjahr})`;
  paragraphs.push(`${taetigkeit}.`);

  if (input.documents.length > 0) {
    paragraphs.push(`Ausgewertete Unterlagen: ${input.documents.map((d) => d.label).join(", ")}.`);
  }

  if (input.gewinnByYear.length > 0) {
    const list = input.gewinnByYear.map((g) => `${g.jahr}: ${EUR(g.betrag)}`).join(" · ");
    let p = `Gewinnentwicklung: ${list}.`;
    if (input.gewinnByYear.length >= 2) {
      const avg = input.gewinnByYear.reduce((a, g) => a + g.betrag, 0) / input.gewinnByYear.length;
      p += ` Durchschnitt der letzten ${input.gewinnByYear.length} Jahre: ${EUR(avg)}. Tendenz: ${TREND_WORD[input.trend]}.`;
    }
    paragraphs.push(p);
  }

  if (input.ansatzJahr != null) {
    paragraphs.push(
      `Angesetztes nachhaltiges Jahreseinkommen: ${EUR(input.ansatzJahr)} (≈ ${EUR(input.ansatzJahr / 12)}/Monat).`
    );
  }

  paragraphs.push(
    "Alle Angaben sind den vorgelegten Unterlagen entnommen und stellen keine Bonitäts- oder Einkommensbestätigung dar; die abschließende Beurteilung trifft die Bank."
  );

  return { heading, paragraphs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-bank-text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/einkommen/bank-text.ts tests/einkommen-bank-text.test.ts
git commit -m "feat(einkommen): deterministischer Bank-Begleittext für Selbständige"
```

---

## Task 3: Zuverlässiger Selbständigen-Upload mit Document-ID-Rückgabe

Der bisherige `analyzeSelfEmployedAction` schleust alle Dateien in einem Request durch → große PDFs (BWA/Jahresabschluss) sprengen das Vercel-Body-Limit. Neue Upload-Actions (analog zum bereits gebauten Broker-Direkt-Upload), die **die Document-ID zurückgeben**, damit die Analyse anschließend aus gespeicherten Dokumenten laufen kann.

**Files:**
- Modify: `src/lib/actions/einkommen.ts` (Ergänzungen; bestehende `analyzeSelfEmployedAction`/`createEinkommensPdfAction` vorerst unangetastet lassen)
- Test: `tests/einkommen-upload.test.ts`

**Interfaces:**
- Consumes: `requireCaseAccess` (`@/lib/auth/context`), `checkRateLimit` (`@/lib/auth/rate-limit`), `getStorage`, `isStorageKeyForCase` (`@/lib/storage`), `processUpload`, `processStoredUpload` (`@/lib/documents/pipeline`), `getEnv` (`@/lib/env`).
- Produces:
  - `type EinkommenUploadResult = { documentId?: string; error?: string }`
  - `einkommenUploadOne(caseId: string, formData: FormData): Promise<EinkommenUploadResult>` — kleine Datei (Feld `files`, genau eine).
  - `requestEinkommenUploadSlot(caseId: string, originalName: string, mimeType: string): Promise<{ uploadUrl: string; storageKey: string } | { error: string }>` — große Datei.
  - `processEinkommenStoredUpload(caseId: string, meta: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number }): Promise<EinkommenUploadResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/einkommen-upload.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ UPLOAD_RATE_MAX: 60, UPLOAD_RATE_WINDOW_SEC: 600 }) }));

const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));
const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
const processUpload = vi.fn();
const processStoredUpload = vi.fn();
vi.mock("@/lib/documents/pipeline", () => ({
  processUpload: (...a: unknown[]) => processUpload(...a),
  processStoredUpload: (...a: unknown[]) => processStoredUpload(...a),
}));
const createSignedUploadUrl = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    getStorage: () => ({ createSignedUploadUrl: (...a: unknown[]) => createSignedUploadUrl(...a) }),
  };
});

import { einkommenUploadOne, processEinkommenStoredUpload, requestEinkommenUploadSlot } from "@/lib/actions/einkommen";
import { casePathPrefix } from "@/lib/storage";

const ctx = { ctx: { organizationId: "org-A", userId: "u1" }, caseRow: { id: "case-A" } };
function fd(file: File) { const f = new FormData(); f.append("files", file); return f; }
const pdf = () => new File([new Uint8Array([1, 2, 3])], "bwa.pdf", { type: "application/pdf" });

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue(ctx);
  checkRateLimit.mockReset().mockResolvedValue({ ok: true });
  processUpload.mockReset().mockResolvedValue({ ok: true, documentId: "doc-1", fileName: "bwa.pdf" });
  processStoredUpload.mockReset().mockResolvedValue({ ok: true, documentId: "doc-2", fileName: "bwa.pdf" });
  createSignedUploadUrl.mockReset().mockResolvedValue({ uploadUrl: "https://x/put", storageKey: casePathPrefix("org-A", "case-A") + "abc_bwa.pdf" });
});

describe("einkommenUploadOne", () => {
  it("gibt die documentId der kleinen Datei zurück", async () => {
    const res = await einkommenUploadOne("case-A", fd(pdf()));
    expect(res.documentId).toBe("doc-1");
    expect(processUpload).toHaveBeenCalled();
  });
  it("meldet Rate-Limit als Fehler", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 30 });
    const res = await einkommenUploadOne("case-A", fd(pdf()));
    expect(res.error).toContain("30");
  });
});

describe("processEinkommenStoredUpload", () => {
  it("verarbeitet gespeicherte Datei und gibt documentId zurück", async () => {
    const key = casePathPrefix("org-A", "case-A") + "abc_bwa.pdf";
    const res = await processEinkommenStoredUpload("case-A", { storageKey: key, originalName: "bwa.pdf", mimeType: "application/pdf", sizeBytes: 3 });
    expect(res.documentId).toBe("doc-2");
  });
  it("lehnt fremden storageKey ab", async () => {
    const res = await processEinkommenStoredUpload("case-A", { storageKey: "organizations/org-B/cases/x/documents/y.pdf", originalName: "y.pdf", mimeType: "application/pdf", sizeBytes: 3 });
    expect(res.error).toBeTruthy();
    expect(processStoredUpload).not.toHaveBeenCalled();
  });
});

describe("requestEinkommenUploadSlot", () => {
  it("liefert Upload-URL + storageKey", async () => {
    const res = await requestEinkommenUploadSlot("case-A", "bwa.pdf", "application/pdf");
    expect("uploadUrl" in res && res.uploadUrl).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-upload.test.ts`
Expected: FAIL — Funktionen nicht exportiert.

- [ ] **Step 3: Write minimal implementation** (in `src/lib/actions/einkommen.ts` ergänzen — Imports oben erweitern und Funktionen anhängen)

```ts
// Ergänze die Imports oben in src/lib/actions/einkommen.ts:
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getEnv } from "@/lib/env";
import { isStorageKeyForCase } from "@/lib/storage";
import { processUpload, processStoredUpload } from "@/lib/documents/pipeline";
// (getStorage ist bereits importiert)

export type EinkommenUploadResult = { documentId?: string; error?: string };

/** Kleine Selbständigen-Datei über die Server-Action (Feld "files", genau eine). */
export async function einkommenUploadOne(caseId: string, formData: FormData): Promise<EinkommenUploadResult> {
  const { ctx } = await requireCaseAccess(caseId);
  const env = getEnv();
  const limit = await checkRateLimit(`einkommen-upload:${caseId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) return { error: "Keine Datei empfangen." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processUpload({
    organizationId: ctx.organizationId,
    caseId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadSource: "vermittler",
    actorUserId: ctx.userId,
  });
  if (result.ok && result.documentId) return { documentId: result.documentId };
  return { error: result.reason ?? "Datei konnte nicht verarbeitet werden." };
}

/** Signierte Upload-URL für große Selbständigen-Dateien (Direkt-Upload). */
export async function requestEinkommenUploadSlot(
  caseId: string,
  originalName: string,
  _mimeType: string
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const env = getEnv();
  const limit = await checkRateLimit(`einkommen-upload:${caseId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  const target = await getStorage().createSignedUploadUrl({ organizationId: ctx.organizationId, caseId, originalName });
  if (!target) return { error: "Direkt-Upload nicht verfügbar." };
  return target;
}

/** Verarbeitet eine per Direkt-Upload gespeicherte Selbständigen-Datei. */
export async function processEinkommenStoredUpload(
  caseId: string,
  meta: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number }
): Promise<EinkommenUploadResult> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!isStorageKeyForCase(meta.storageKey, ctx.organizationId, caseId)) return { error: "Ungültiger Upload-Pfad." };
  const result = await processStoredUpload({
    organizationId: ctx.organizationId,
    caseId,
    storageKey: meta.storageKey,
    originalName: meta.originalName,
    mimeType: meta.mimeType,
    uploadSource: "vermittler",
    actorUserId: ctx.userId,
  });
  if (result.ok && result.documentId) return { documentId: result.documentId };
  return { error: result.reason ?? "Datei konnte nicht verarbeitet werden." };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-upload.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/einkommen.ts tests/einkommen-upload.test.ts
git commit -m "feat(einkommen): zuverlässiger Upload (Direkt-Upload) mit Document-ID-Rückgabe"
```

---

## Task 4: `analyzeStoredSelfEmployedDocs` — Analyse aus gespeicherten Dokumenten

Ersetzt den Upload-Teil von `analyzeSelfEmployedAction` durch eine Analyse über bereits hochgeladene Document-IDs. Bilder → base64 aus Storage, PDFs → signierte URL (wie bisher), dann `analyzeSelfEmployedDocs`.

**Files:**
- Modify: `src/lib/actions/einkommen.ts`
- Test: `tests/einkommen-analyze-stored.test.ts`

**Interfaces:**
- Consumes: `prisma.document`, `getStorage().get/createSignedUrl`, `ai.analyzeSelfEmployedDocs`, `toEinkommenDocs`, `consolidateEinkommen`, `DOCUMENT_TYPE_LABELS`. Reuse der bestehenden `EinkommenState`.
- Produces: `analyzeStoredSelfEmployedDocs(caseId: string, documentIds: string[]): Promise<EinkommenState>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/einkommen-analyze-stored.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { document: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const get = vi.fn();
const createSignedUrl = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, getStorage: () => ({ get, createSignedUrl }) };
});

const analyzeSelfEmployedDocs = vi.fn();
vi.mock("@/lib/ai/service", () => ({ AIService: class { analyzeSelfEmployedDocs = (...a: unknown[]) => analyzeSelfEmployedDocs(...a); } }));

import { analyzeStoredSelfEmployedDocs } from "@/lib/actions/einkommen";

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue({ ctx: { organizationId: "org-A", userId: "u1" } });
  findMany.mockReset();
  get.mockReset();
  createSignedUrl.mockReset().mockResolvedValue("https://signed/doc.pdf");
  analyzeSelfEmployedDocs.mockReset().mockResolvedValue({
    docs: [{ dokumenttyp: "bwa", jahr: 2024, kennzahlen: { gewinn: 96000, umsatz: 200000 }, notiz: "", konfidenz: 0.9 }],
  });
});

describe("analyzeStoredSelfEmployedDocs", () => {
  it("baut aus PDF-Dokumenten die Kennzahlen-Matrix", async () => {
    findMany.mockResolvedValue([
      { id: "doc-1", originalName: "bwa.pdf", mimeType: "application/pdf", storageKey: "organizations/org-A/cases/case-A/documents/x_bwa.pdf", case: { organizationId: "org-A" } },
    ]);
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-1"]);
    expect(res.error).toBeUndefined();
    expect(res.matrix?.rows.some((r) => r.kennzahl === "gewinn")).toBe(true);
    expect(createSignedUrl).toHaveBeenCalled();
  });

  it("verweigert fremde Dokumente (Tenant-Isolation)", async () => {
    findMany.mockResolvedValue([]); // findMany filtert per organizationId -> nichts
    const res = await analyzeStoredSelfEmployedDocs("case-A", ["doc-x"]);
    expect(res.matrix).toBeNull();
    expect(res.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-analyze-stored.test.ts`
Expected: FAIL — Funktion nicht exportiert.

- [ ] **Step 3: Write minimal implementation** (an `src/lib/actions/einkommen.ts` anhängen; `VISION_MIME`, `ai`, `consolidateEinkommen`, `toEinkommenDocs`, `DOCUMENT_TYPE_LABELS` sind bereits im Modul)

```ts
export async function analyzeStoredSelfEmployedDocs(caseId: string, documentIds: string[]): Promise<EinkommenState> {
  const { ctx } = await requireCaseAccess(caseId);
  if (documentIds.length === 0) return { matrix: null, docNotes: [], error: "Keine Dokumente zur Analyse ausgewählt." };

  // Tenant-Isolation direkt in der Query: nur Dokumente der eigenen Organisation.
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, case: { organizationId: ctx.organizationId } },
    select: { id: true, originalName: true, mimeType: true, storageKey: true },
  });
  if (docs.length === 0) return { matrix: null, docNotes: [], error: "Dokumente nicht gefunden." };

  const storage = getStorage();
  const images: Array<{ base64: string; mimeType: string }> = [];
  const documents: Array<{ url: string; name?: string }> = [];
  for (const d of docs) {
    if (VISION_MIME.has(d.mimeType)) {
      const buf = await storage.get(d.storageKey);
      if (buf) images.push({ base64: buf.toString("base64"), mimeType: d.mimeType });
    } else if (d.mimeType === "application/pdf") {
      const signed = await storage.createSignedUrl(d.storageKey, 300);
      if (signed) documents.push({ url: signed, name: d.originalName });
    }
  }
  if (images.length === 0 && documents.length === 0) {
    return { matrix: null, docNotes: [], error: "Die Dokumente konnten nicht für die KI-Analyse vorbereitet werden." };
  }

  try {
    const analysis = await ai.analyzeSelfEmployedDocs(images, documents);
    const eDocs = toEinkommenDocs(analysis);
    const matrix = consolidateEinkommen(eDocs);
    const docNotes = eDocs
      .filter((x) => x.notiz.trim().length > 0)
      .map((x) => ({ label: `${DOCUMENT_TYPE_LABELS[x.dokumenttyp as DocumentType] ?? x.dokumenttyp} ${x.jahr}`, notiz: x.notiz }));
    if (!matrix || matrix.rows.length === 0) {
      return { matrix: null, docNotes: [], error: "Aus den Unterlagen konnten keine auswertbaren Kennzahlen gelesen werden." };
    }
    await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "ai.evaluated", entityType: "case", entityId: caseId, metadata: { feature: "einkommen", jahre: matrix.jahre.length } });
    revalidatePath(`/cases/${caseId}/einkommen-selbststaendig`);
    return { matrix, docNotes };
  } catch (e) {
    console.error("[einkommen] KI-Analyse fehlgeschlagen:", e);
    return { matrix: null, docNotes: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-analyze-stored.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/einkommen.ts tests/einkommen-analyze-stored.test.ts
git commit -m "feat(einkommen): Analyse aus bereits gespeicherten Dokumenten"
```

---

## Task 5: PDF-Renderer um Begleittext-Sektion erweitern

`renderEinkommensanalyse` bekommt eine optionale Begleittext-Sektion (Heading + Absätze), die VOR der Kennzahlen-Tabelle gerendert wird. Rückwärtskompatibel (Feld optional).

**Files:**
- Modify: `src/lib/pdf/renderer.ts` (Funktion `renderEinkommensanalyse`)

**Interfaces:**
- Consumes: bestehende Renderer-Bausteine (`newDoc`, `coverHeader`, `footer` — vorhandene Signaturen im File beibehalten).
- Produces: `renderEinkommensanalyse(input)` akzeptiert zusätzlich optional `begleittext?: { heading: string; paragraphs: string[] }`.

- [ ] **Step 1: Lesen & Signatur finden**

Run: `sed -n '/renderEinkommensanalyse/,/^}/p' src/lib/pdf/renderer.ts`
Expected: aktuelle Parameterliste + wie Tabelle/Absätze gezeichnet werden (pdfkit `doc.font/fontSize/text`).

- [ ] **Step 2: Interface erweitern**

Ergänze im Input-Typ von `renderEinkommensanalyse`:
```ts
  begleittext?: { heading: string; paragraphs: string[] };
```

- [ ] **Step 3: Sektion rendern (vor der Kennzahlen-Tabelle)**

Direkt nach dem Header/vor der Tabelle einfügen (an den vorhandenen Stil angleichen — Fonts/Größen aus dem umliegenden Code übernehmen):
```ts
  if (input.begleittext) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).text(input.begleittext.heading);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    for (const p of input.begleittext.paragraphs) {
      doc.text(p, { align: "left" });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);
  }
```
(Falls die Datei eigene Helper wie `heading()`/`paragraph()` hat, diese statt der rohen pdfkit-Aufrufe verwenden.)

- [ ] **Step 4: Verifizieren (Build + Smoke)**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
Run: `npx vitest run` (bestehende PDF-nahen Tests dürfen nicht brechen).
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/renderer.ts
git commit -m "feat(pdf): Begleittext-Sektion in der Einkommensanalyse"
```

---

## Task 6: `createSelfEmployedBankSummaryAction` — Stammdaten speichern + Text + PDF

Erweiterte Erzeugungs-Action: upsert `SelfEmploymentRecord` für den gewählten Antragsteller, baue Begleittext, rendere kombiniertes PDF, lege es ab.

**Files:**
- Modify: `src/lib/actions/einkommen.ts`
- Test: `tests/einkommen-bank-summary-action.test.ts`

**Interfaces:**
- Consumes: `suggestEinkommensansatz` (nicht nötig hier), `buildSelfEmployedBankText` (Task 2), `renderEinkommensanalyse` (Task 5), `getBrokerInfo`, `pdfFileName`, `prisma.applicant/selfEmploymentRecord/document`, `KENNZAHL_LABELS`.
- Produces:
  - `interface SelfEmployedBankSummaryInput { applicantPosition: number; selfEmployment: { firma: string; rechtsform: string; gruendungsjahr: number | null }; jahre: number[]; rows: EinkommenPdfInput["rows"]; docNotes: Array<{ label: string; notiz: string }>; einkommensansatzJahr: number | null }`
  - `createSelfEmployedBankSummaryAction(caseId: string, input: SelfEmployedBankSummaryInput): Promise<{ documentId?: string; error?: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/einkommen-bank-summary-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const applicantFindFirst = vi.fn();
const selfEmpUpsert = vi.fn();
const caseFindUniqueOrThrow = vi.fn();
const docCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: { findFirst: (...a: unknown[]) => applicantFindFirst(...a) },
    selfEmploymentRecord: { upsert: (...a: unknown[]) => selfEmpUpsert(...a) },
    case: { findUniqueOrThrow: (...a: unknown[]) => caseFindUniqueOrThrow(...a) },
    document: { create: (...a: unknown[]) => docCreate(...a) },
  },
}));

const put = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, getStorage: () => ({ put }) };
});
const renderEinkommensanalyse = vi.fn();
vi.mock("@/lib/pdf/renderer", () => ({ renderEinkommensanalyse: (...a: unknown[]) => renderEinkommensanalyse(...a) }));
vi.mock("@/lib/pdf/case-pdf", () => ({ getBrokerInfo: vi.fn(async () => ({ name: "Makler" })), pdfFileName: () => "Bankzusammenfassung.pdf" }));

import { createSelfEmployedBankSummaryAction } from "@/lib/actions/einkommen";

beforeEach(() => {
  requireCaseAccess.mockReset().mockResolvedValue({ ctx: { organizationId: "org-A", userId: "u1" } });
  applicantFindFirst.mockReset().mockResolvedValue({ id: "app-1", vorname: "Angelina", nachname: "Sadykow" });
  selfEmpUpsert.mockReset().mockResolvedValue({});
  caseFindUniqueOrThrow.mockReset().mockResolvedValue({ caseNumber: "2026-0007", applicants: [{ id: "app-1", vorname: "Angelina", nachname: "Sadykow", position: 1 }] });
  renderEinkommensanalyse.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 test"));
  put.mockReset().mockResolvedValue({ storageKey: "organizations/org-A/cases/case-A/documents/x_Bankzusammenfassung.pdf" });
  docCreate.mockReset().mockResolvedValue({ id: "pdfdoc-1" });
});

const input = {
  applicantPosition: 1,
  selfEmployment: { firma: "Sadykow Consulting", rechtsform: "Einzelunternehmen", gruendungsjahr: 2019 },
  jahre: [2023, 2024],
  rows: [{ kennzahl: "gewinn", label: "Gewinn / Jahresüberschuss", cells: { 2023: 91000, 2024: 96000 }, trend: "steigend" }],
  docNotes: [{ label: "BWA 2024", notiz: "" }],
  einkommensansatzJahr: 88000,
};

describe("createSelfEmployedBankSummaryAction", () => {
  it("speichert Stammdaten, rendert PDF mit Begleittext und legt Dokument ab", async () => {
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.documentId).toBe("pdfdoc-1");
    expect(selfEmpUpsert).toHaveBeenCalled();
    const renderArg = renderEinkommensanalyse.mock.calls[0]![0] as { begleittext?: { paragraphs: string[] } };
    expect(renderArg.begleittext).toBeTruthy();
    expect(renderArg.begleittext!.paragraphs.join("\n")).toContain("Sadykow Consulting");
  });

  it("liefert Fehler, wenn der gewählte Antragsteller fehlt", async () => {
    applicantFindFirst.mockResolvedValue(null);
    const res = await createSelfEmployedBankSummaryAction("case-A", input as never);
    expect(res.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/einkommen-bank-summary-action.test.ts`
Expected: FAIL — Funktion nicht exportiert.

- [ ] **Step 3: Write minimal implementation** (an `src/lib/actions/einkommen.ts` anhängen; `buildSelfEmployedBankText` importieren)

```ts
// Import oben ergänzen:
import { buildSelfEmployedBankText } from "@/lib/einkommen/bank-text";
import type { Trend } from "@/lib/einkommen/consolidate";

export interface SelfEmployedBankSummaryInput {
  applicantPosition: number;
  selfEmployment: { firma: string; rechtsform: string; gruendungsjahr: number | null };
  jahre: number[];
  rows: EinkommenPdfInput["rows"];
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
}

export async function createSelfEmployedBankSummaryAction(
  caseId: string,
  input: SelfEmployedBankSummaryInput
): Promise<{ documentId?: string; error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  try {
    const applicant = await prisma.applicant.findFirst({
      where: { caseId, position: input.applicantPosition },
      select: { id: true, vorname: true, nachname: true },
    });
    if (!applicant) return { error: "Der gewählte Antragsteller wurde nicht gefunden." };

    // Stammdaten persistieren (Lücke der bisherigen Lösung schließen).
    const gruendungsdatum = input.selfEmployment.gruendungsjahr
      ? new Date(Date.UTC(input.selfEmployment.gruendungsjahr, 0, 1, 12))
      : null;
    await prisma.selfEmploymentRecord.upsert({
      where: { applicantId: applicant.id },
      create: { applicantId: applicant.id, firma: input.selfEmployment.firma || null, rechtsform: input.selfEmployment.rechtsform || null, gruendungsdatum },
      update: { firma: input.selfEmployment.firma || null, rechtsform: input.selfEmployment.rechtsform || null, gruendungsdatum },
    });

    // Gewinn je Jahr (nur vorhandene Werte) für den Begleittext.
    const gewinnRow = input.rows.find((r) => r.kennzahl === "gewinn");
    const gewinnByYear = gewinnRow
      ? input.jahre
          .filter((j) => typeof gewinnRow.cells[j] === "number")
          .sort((a, b) => a - b)
          .map((j) => ({ jahr: j, betrag: gewinnRow.cells[j] as number }))
      : [];
    const trend = (gewinnRow?.trend ?? "unbekannt") as Trend;

    const applicantName = [applicant.vorname, applicant.nachname].filter(Boolean).join(" ");
    const begleittext = buildSelfEmployedBankText({
      applicantName,
      selfEmployment: { firma: input.selfEmployment.firma, rechtsform: input.selfEmployment.rechtsform, gruendungsjahr: input.selfEmployment.gruendungsjahr },
      gewinnByYear,
      trend,
      documents: input.docNotes.map((d) => ({ label: d.label })),
      ansatzJahr: input.einkommensansatzJahr,
    });

    const broker = await getBrokerInfo(ctx.organizationId);
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { applicants: { orderBy: { position: "asc" } } } });
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
        trend: r.trend as "steigend" | "fallend" | "stabil" | "unbekannt",
      })),
      docNotes: input.docNotes,
      einkommensansatzJahr: input.einkommensansatzJahr,
      einkommensansatzMonat: monat,
      begleittext,
    });

    const fileName = pdfFileName("Bankzusammenfassung_Selbststaendig", caseRow.applicants);
    const stored = await getStorage().put({ organizationId: ctx.organizationId, caseId, originalName: fileName, mimeType: "application/pdf", buffer });
    const created = await prisma.document.create({
      data: { caseId, applicantId: applicant.id, originalName: fileName, generatedName: fileName, storageKey: stored.storageKey, mimeType: "application/pdf", sizeBytes: buffer.length, documentType: "sonstige", uploadSource: "vermittler", scanStatus: "ready_for_ocr", readable: true },
      select: { id: true },
    });
    await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "pdf.generated", entityType: "case", entityId: caseId, metadata: { feature: "einkommen-bankzusammenfassung", documentId: created.id } });
    revalidatePath(`/cases/${caseId}`);
    return { documentId: created.id };
  } catch (e) {
    console.error("[einkommen] Bankzusammenfassung fehlgeschlagen:", e);
    return { error: "Bankzusammenfassung konnte nicht erstellt werden." };
  }
}
```

Hinweis: `renderEinkommensanalyse` muss `begleittext` akzeptieren (Task 5). Prüfe, dass `SelfEmploymentRecord.applicantId` in `prisma/schema.prisma` **unique** ist (für `upsert where: { applicantId }`). Falls nicht: entweder `@unique` ergänzen (Migration/`db push`) ODER upsert durch `findFirst`+`update`/`create` ersetzen. **Vor Umsetzung im Schema prüfen** (`grep -A15 "model SelfEmploymentRecord" prisma/schema.prisma`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/einkommen-bank-summary-action.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/einkommen.ts tests/einkommen-bank-summary-action.test.ts
git commit -m "feat(einkommen): Bankzusammenfassung-Action (Stammdaten + Begleittext + PDF)"
```

---

## Task 7: Editor-UI erweitern

`EinkommenEditor` bekommt: Antragsteller-Auswahl (Prop), zuverlässigen Upload (Direkt-Upload für große PDFs → Document-IDs → `analyzeStoredSelfEmployedDocs`), Ansatz-Vorbelegung via `suggestEinkommensansatz`, Stammdaten-Block (Firma/Rechtsform/seit), Button „Bankzusammenfassung erstellen" → `createSelfEmployedBankSummaryAction`.

**Files:**
- Modify: `src/components/case/einkommen-editor.tsx`
- Modify: `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx` (Props: Antragsteller + evtl. vorhandene Stammdaten an den Editor durchreichen; Seitentitel/Intro auf „Selbständigen-Unterlagen → Bankzusammenfassung" anpassen)

**Interfaces:**
- Consumes: `einkommenUploadOne`, `requestEinkommenUploadSlot`, `processEinkommenStoredUpload`, `analyzeStoredSelfEmployedDocs`, `createSelfEmployedBankSummaryAction` (Tasks 3/4/6); `suggestEinkommensansatz` (Task 1); `uploadFilesSequentially` (bestehend, `@/lib/upload/client-upload`) — beachte: dieser Helper aggregiert nur `{uploaded, rejected}`, **nicht** Document-IDs. Für die Analyse werden Document-IDs gebraucht → hier eine schlanke Upload-Schleife im Editor implementieren (analog `uploadViaDirect`, aber Ergebnis = `documentId[]`).
- Props-Erweiterung: `EinkommenEditor({ caseId, applicants, selfEmployment })` mit
  `applicants: Array<{ position: number; name: string }>` und
  `selfEmployment: { position: number; firma: string; rechtsform: string; gruendungsjahr: number | null } | null` (vorbefüllte Stammdaten des Standard-Antragstellers).

- [ ] **Step 1: Editor-Props + Antragsteller-Auswahl + Stammdaten-State**

Ergänze die Signatur und den State. Vorbelegung: `applicantPosition` = erste Position; `firma/rechtsform/gruendungsjahr` aus `selfEmployment`.
```tsx
export function EinkommenEditor({
  caseId,
  applicants,
  selfEmployment,
}: {
  caseId: string;
  applicants: Array<{ position: number; name: string }>;
  selfEmployment: { position: number; firma: string; rechtsform: string; gruendungsjahr: number | null } | null;
}) {
  const [applicantPosition, setApplicantPosition] = useState<number>(applicants[0]?.position ?? 1);
  const [firma, setFirma] = useState(selfEmployment?.firma ?? "");
  const [rechtsform, setRechtsform] = useState(selfEmployment?.rechtsform ?? "");
  const [gruendungsjahr, setGruendungsjahr] = useState(selfEmployment?.gruendungsjahr ? String(selfEmployment.gruendungsjahr) : "");
  // … bestehender State (jahre, rows, notes, ansatz, docId, pdfError, creating)
```

- [ ] **Step 2: Zuverlässiger Upload → Document-IDs → Analyse**

Ersetze das bisherige `<form action={formAction}>` durch einen manuellen Handler. Files einzeln hochladen (kleine über `einkommenUploadOne`, große >3,5 MB über Slot+`processEinkommenStoredUpload`), Document-IDs sammeln, dann `analyzeStoredSelfEmployedDocs(caseId, ids)`.
```tsx
const DIRECT_ABOVE = 3_500_000;
const [busy, setBusy] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
const [state, setState] = useState<EinkommenState>({ matrix: null, docNotes: [] });

async function analyze(files: File[]) {
  setBusy(true); setUploadError(null);
  const ids: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      let r: { documentId?: string; error?: string };
      if (f.size > DIRECT_ABOVE) {
        const slot = await requestEinkommenUploadSlot(caseId, f.name, f.type || "application/octet-stream");
        if ("error" in slot) { failed.push(f.name); continue; }
        const form = new FormData(); form.append("cacheControl", "3600"); form.append("", f, f.name);
        const put = await fetch(slot.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
        if (!put.ok) { failed.push(f.name); continue; }
        r = await processEinkommenStoredUpload(caseId, { storageKey: slot.storageKey, originalName: f.name, mimeType: f.type || "application/octet-stream", sizeBytes: f.size });
      } else {
        const fd = new FormData(); fd.append("files", f);
        r = await einkommenUploadOne(caseId, fd);
      }
      if (r.documentId) ids.push(r.documentId); else failed.push(f.name);
    } catch { failed.push(f.name); }
  }
  if (ids.length === 0) { setBusy(false); setUploadError("Keine Datei konnte hochgeladen werden."); return; }
  const res = await analyzeStoredSelfEmployedDocs(caseId, ids);
  setState(res);
  if (failed.length) setUploadError(`${failed.length} Datei(en) nicht verarbeitet: ${failed.join(", ")}`);
  setBusy(false);
}
```
Die bestehende `useEffect`-Übernahme von `state.matrix` in `jahre/rows/notes` bleibt.

- [ ] **Step 3: Ansatz-Vorbelegung**

In der `useEffect`, die `state.matrix` übernimmt, den Ansatz vorbelegen (nur wenn Feld leer):
```tsx
import { suggestEinkommensansatz } from "@/lib/einkommen/ansatz";
// in useEffect nach setRows(...):
if (ansatz.trim() === "" && state.matrix) {
  const s = suggestEinkommensansatz(state.matrix);
  if (s != null) setAnsatz(String(s));
}
```
Label des Feldes anpassen: „Einkommensansatz (€/Jahr) – Vorschlag, überschreibbar".

- [ ] **Step 4: Stammdaten-Block + Antragsteller-Auswahl (im Vorschau-Bereich, wenn `rows.length > 0`)**

```tsx
<div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
  {applicants.length > 1 && (
    <label className="text-xs text-muted-foreground">Antragsteller
      <select value={applicantPosition} onChange={(e) => setApplicantPosition(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
        {applicants.map((a) => <option key={a.position} value={a.position}>{a.name || `Antragsteller ${a.position}`}</option>)}
      </select>
    </label>
  )}
  <label className="text-xs text-muted-foreground">Firma
    <Input value={firma} onChange={(e) => setFirma(e.target.value)} className="mt-1 h-9" /></label>
  <label className="text-xs text-muted-foreground">Rechtsform
    <Input value={rechtsform} onChange={(e) => setRechtsform(e.target.value)} className="mt-1 h-9" placeholder="z. B. Einzelunternehmen, GmbH" /></label>
  <label className="text-xs text-muted-foreground">Selbstständig seit (Jahr)
    <Input type="number" value={gruendungsjahr} onChange={(e) => setGruendungsjahr(e.target.value)} className="mt-1 h-9" placeholder="z. B. 2019" /></label>
</div>
```

- [ ] **Step 5: Button „Bankzusammenfassung erstellen"**

Ersetze `createPdf` durch einen Aufruf von `createSelfEmployedBankSummaryAction`:
```tsx
async function createSummary() {
  setCreating(true); setPdfError(null);
  const res = await createSelfEmployedBankSummaryAction(caseId, {
    applicantPosition,
    selfEmployment: { firma: firma.trim(), rechtsform: rechtsform.trim(), gruendungsjahr: gruendungsjahr.trim() ? Number(gruendungsjahr) : null },
    jahre,
    rows: rows.map((r) => {
      const vals = jahre.map((j) => r.cells[j]).filter((v): v is number => typeof v === "number");
      return { kennzahl: r.kennzahl, label: r.label, cells: r.cells, trend: trendFor(vals) };
    }),
    docNotes: notes,
    einkommensansatzJahr: ansatz.trim() === "" ? null : Number(ansatz),
  });
  if (res.documentId) setDocId(res.documentId); else if (res.error) setPdfError(res.error);
  setCreating(false);
}
```
Button-Label: „Bankzusammenfassung erstellen".

- [ ] **Step 6: page.tsx — Props + Titel**

In `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx`: Antragsteller + vorhandene `SelfEmploymentRecord` des Standard-Antragstellers laden und an `EinkommenEditor` durchreichen; Seitentitel → „Selbständigen-Unterlagen → Bankzusammenfassung". `gruendungsjahr` aus `gruendungsdatum?.getUTCFullYear()`.

- [ ] **Step 7: Verifizieren**

Run: `npx tsc --noEmit` → keine Fehler.
Run: `npx vitest run` → alles grün.
Run: `npm run build` → erfolgreich.

- [ ] **Step 8: Commit**

```bash
git add src/components/case/einkommen-editor.tsx "src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx"
git commit -m "feat(einkommen): Editor mit Antragsteller/Stammdaten, zuverlässigem Upload, Ansatz-Vorschlag, Bankzusammenfassung"
```

---

## Task 8: Prominenter Einstieg im Cockpit

**Files:**
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Sidebar „Aktionen": Link zur Einkommensanalyse umbenennen/hervorheben)

- [ ] **Step 1: Aktion umbenennen**

Finde den bestehenden Link (`/cases/${id}/einkommen-selbststaendig`, Label „Einkommensanalyse Selbständige") und benenne ihn auf „Selbständigen-Unterlagen → Bankzusammenfassung" um; optional als hervorgehobene Aktion (Variante wie andere Primäraktionen).
Run zum Finden: `grep -n "einkommen-selbststaendig" "src/app/(app)/cases/[id]/page.tsx"`

- [ ] **Step 2: Verifizieren + Commit**

Run: `npx tsc --noEmit` → grün.
```bash
git add "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(cockpit): Einstieg 'Selbständigen-Unterlagen → Bankzusammenfassung'"
```

---

## Task 9: Manuelle End-to-End-Verifikation

**Files:** keine (Verifikation)

- [ ] **Step 1: Voller Check**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: alles grün.

- [ ] **Step 2: Live/Preview durchklicken** (nach Deploy oder lokal mit DB)

- Fall öffnen → neue Cockpit-Aktion.
- Mehrere Selbständigen-Docs inkl. **großem PDF (>4,5 MB)** hochladen → alle laufen durch (großes via Direkt-Upload).
- Vorschau: Kennzahlen-Matrix gefüllt, **Ansatz vorbelegt** (Ø Gewinn), Stammdaten editierbar.
- „Bankzusammenfassung erstellen" → PDF öffnet: **Begleittext** (Firma/Jahr/Gewinne/Ø/Ansatz) **+ Kennzahlen-Tabelle**.
- Prüfen: keine erfundenen Werte; fehlende Stammdaten werden weggelassen; Stammdaten sind nach Reload im Editor vorbefüllt (persistiert).

- [ ] **Step 3: Commit (nur falls Doku/Anpassungen nötig)**

---

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Kernergebnis (Kennzahlen+Text, ein PDF) → Task 5/6. Erweitern statt Neubau → alle Tasks bauen auf Bestand. Ein-Klick→Vorschau→Freigabe → Task 4 (Analyse) + Task 7 (Vorbelegung/Editieren) + Task 6 (Erzeugen). Deterministischer Begleittext → Task 2. Ansatz-Vorschlag → Task 1. Stammdaten persistieren → Task 6. Antragsteller-Zuordnung → Task 6/7. Zuverlässiger Upload (Spec: „inkl. Direkt-Upload") → Task 3/4/7. Einstieg → Task 8.
- **Platzhalter:** keine „TBD"/„TODO"; alle Code-Schritte mit vollständigem Code oder exakten Fund-Kommandos (Task 5/8 arbeiten in bestehendem, nicht-vorab-lesbarem Code → dort exakte `grep/sed`-Schritte + einzufügender Code).
- **Typkonsistenz:** `EinkommenUploadResult`, `SelfEmployedBankTextInput/…Text`, `SelfEmployedBankSummaryInput`, `suggestEinkommensansatz`-Signatur über Tasks hinweg konsistent; `begleittext`-Feld in Task 5 (Renderer) und Task 6 (Aufruf) identisch benannt.
- **Offene Verifikation im Code (kein Blocker fürs Design):** `SelfEmploymentRecord.applicantId` `@unique`? (Task 6, Step 3 Hinweis). Genaue Signatur `renderEinkommensanalyse` + Helper-Stil (Task 5, Step 1). Bestehender Cockpit-Link-Text (Task 8, Step 1).
