# Wohnflächenberechnung nach WoFlV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KI-gestützte, WoFlV-konforme Wohnflächenberechnung aus Grundrissen – Bild-KI extrahiert Räume, deterministischer Code rechnet die Anrechnung, Vermittler prüft, Ergebnis als bankfertiges PDF.

**Architecture:** „KI sieht, Code rechnet." Mistral-Vision (EU) liefert eine strukturierte Raumliste; eine reine, getestete WoFlV-Engine wendet Faktoren an und summiert. Persistenz als additive Prisma-Tabelle; Ausgabe über die bestehende pdfkit-Infrastruktur und Dokumentenablage.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma/PostgreSQL (Supabase), Zod, pdfkit, Mistral (openai-compatible Vision), vitest.

## Global Constraints

- WoFlV-Faktoren/Summen ausschließlich in deterministischem Code – die KI liefert nur Wahrnehmung, nie das Endergebnis.
- Jede Übernahme erst nach menschlicher Freigabe; jeder Wert editierbar; Konfidenz sichtbar.
- Kein automatisches Überschreiben von `Property.wohnflaeche`.
- EU/DSGVO: Vision-Calls nur an Mistral (EU); keine Personennamen nötig; keine Kundendaten/Rohinhalte in Logs.
- Grundriss-Uploads laufen durch die bestehende sichere Pipeline (`processUpload`): Validierung + Virenscan + privater Storage.
- Pflicht-Haftungshinweis (verbatim): „Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche Aufmaß-/Vermesserbescheinigung. Werte vor Verwendung prüfen."
- Dokument-Typ der Ablage: `wohnflaechenberechnung` (bereits im Enum).
- Schema-Änderungen additiv (`prisma db push`), kein Datenverlust.
- Tests mit vitest; pro Task committen.

---

### Task 1: WoFlV-Rechenkern (reine Engine)

**Files:**
- Create: `src/lib/wohnflaeche/woflv.ts`
- Test: `tests/woflv.test.ts`

**Interfaces:**
- Produces:
  - `type RoomCategory = "wohnraum" | "balkon_terrasse_loggia" | "zubehoer_keller_hobby_abstell" | "wintergarten" | "schwimmbad"`
  - `interface WoflvRoom { id: string; geschoss: string; raumname: string; kategorie: RoomCategory; flaecheM2: number; balkonFaktor?: number; beheizt?: boolean; dachschraege?: { unter1m: number; zw1und2m: number; ab2m: number } | null }`
  - `interface WoflvRoomResult extends WoflvRoom { faktor: number; anrechenbarM2: number; istZubehoer: boolean }`
  - `interface WoflvResult { rooms: WoflvRoomResult[]; summeWohnflaecheM2: number; summeZubehoerM2: number }`
  - `function computeWoflv(rooms: WoflvRoom[]): WoflvResult`
  - `function round2(n: number): number`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/woflv.test.ts
import { describe, it, expect } from "vitest";
import { computeWoflv, type WoflvRoom } from "@/lib/wohnflaeche/woflv";

const room = (p: Partial<WoflvRoom>): WoflvRoom => ({
  id: p.id ?? "r", geschoss: p.geschoss ?? "EG", raumname: p.raumname ?? "Raum",
  kategorie: p.kategorie ?? "wohnraum", flaecheM2: p.flaecheM2 ?? 10,
  balkonFaktor: p.balkonFaktor, beheizt: p.beheizt, dachschraege: p.dachschraege ?? null,
});

describe("WoFlV-Engine", () => {
  it("rechnet Wohnraum mit 100%", () => {
    const r = computeWoflv([room({ flaecheM2: 24.5 })]);
    expect(r.summeWohnflaecheM2).toBe(24.5);
    expect(r.summeZubehoerM2).toBe(0);
  });

  it("Balkon Standard 25%, einstellbar 50%", () => {
    expect(computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 12 })]).summeWohnflaecheM2).toBe(3);
    expect(computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 12, balkonFaktor: 0.5 })]).summeWohnflaecheM2).toBe(6);
  });

  it("Zubehör (Keller) zählt 0% zur Wohnfläche, getrennt ausgewiesen", () => {
    const r = computeWoflv([room({ kategorie: "zubehoer_keller_hobby_abstell", flaecheM2: 30 })]);
    expect(r.summeWohnflaecheM2).toBe(0);
    expect(r.summeZubehoerM2).toBe(30);
    expect(r.rooms[0].istZubehoer).toBe(true);
  });

  it("Dachschräge: <1m 0%, 1-2m 50%, >=2m 100%", () => {
    const r = computeWoflv([room({ flaecheM2: 30, dachschraege: { unter1m: 5, zw1und2m: 10, ab2m: 15 } })]);
    // 5*0 + 10*0.5 + 15*1 = 20
    expect(r.summeWohnflaecheM2).toBe(20);
  });

  it("Wintergarten beheizt 100% / unbeheizt 50%", () => {
    expect(computeWoflv([room({ kategorie: "wintergarten", flaecheM2: 10, beheizt: true })]).summeWohnflaecheM2).toBe(10);
    expect(computeWoflv([room({ kategorie: "wintergarten", flaecheM2: 10, beheizt: false })]).summeWohnflaecheM2).toBe(5);
  });

  it("rundet auf 2 Nachkommastellen", () => {
    const r = computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 10 })]);
    expect(r.summeWohnflaecheM2).toBe(2.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/woflv.test.ts`
Expected: FAIL ("Cannot find module '@/lib/wohnflaeche/woflv'").

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/wohnflaeche/woflv.ts
export type RoomCategory =
  | "wohnraum"
  | "balkon_terrasse_loggia"
  | "zubehoer_keller_hobby_abstell"
  | "wintergarten"
  | "schwimmbad";

export interface WoflvRoom {
  id: string;
  geschoss: string;
  raumname: string;
  kategorie: RoomCategory;
  flaecheM2: number;
  /** Anrechnungsfaktor für Balkon/Terrasse/Loggia (Standard 0.25, max 0.5). */
  balkonFaktor?: number;
  /** Nur Wintergarten/Schwimmbad: beheizt = 100 %, sonst 50 %. */
  beheizt?: boolean;
  /** Teilflächen nach lichter Höhe (m²). Wenn gesetzt, ersetzt es die einfache Anrechnung. */
  dachschraege?: { unter1m: number; zw1und2m: number; ab2m: number } | null;
}

export interface WoflvRoomResult extends WoflvRoom {
  faktor: number;
  anrechenbarM2: number;
  istZubehoer: boolean;
}

export interface WoflvResult {
  rooms: WoflvRoomResult[];
  summeWohnflaecheM2: number;
  summeZubehoerM2: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function anrechenbar(room: WoflvRoom): { faktor: number; anrechenbarM2: number; istZubehoer: boolean } {
  if (room.kategorie === "zubehoer_keller_hobby_abstell") {
    return { faktor: 0, anrechenbarM2: 0, istZubehoer: true };
  }
  if (room.kategorie === "balkon_terrasse_loggia") {
    const f = Math.min(0.5, Math.max(0, room.balkonFaktor ?? 0.25));
    return { faktor: f, anrechenbarM2: round2(room.flaecheM2 * f), istZubehoer: false };
  }
  if (room.kategorie === "wintergarten" || room.kategorie === "schwimmbad") {
    const f = room.beheizt ? 1 : 0.5;
    return { faktor: f, anrechenbarM2: round2(room.flaecheM2 * f), istZubehoer: false };
  }
  // wohnraum (ggf. mit Dachschräge)
  if (room.dachschraege) {
    const d = room.dachschraege;
    const flaeche = d.unter1m * 0 + d.zw1und2m * 0.5 + d.ab2m * 1;
    const basis = d.unter1m + d.zw1und2m + d.ab2m || 1;
    return { faktor: round2(flaeche / basis), anrechenbarM2: round2(flaeche), istZubehoer: false };
  }
  return { faktor: 1, anrechenbarM2: round2(room.flaecheM2), istZubehoer: false };
}

export function computeWoflv(rooms: WoflvRoom[]): WoflvResult {
  const results: WoflvRoomResult[] = rooms.map((r) => ({ ...r, ...anrechenbar(r) }));
  const summeWohnflaecheM2 = round2(
    results.filter((r) => !r.istZubehoer).reduce((s, r) => s + r.anrechenbarM2, 0)
  );
  const summeZubehoerM2 = round2(
    results.filter((r) => r.istZubehoer).reduce((s, r) => s + r.flaecheM2, 0)
  );
  return { rooms: results, summeWohnflaecheM2, summeZubehoerM2 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/woflv.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wohnflaeche/woflv.ts tests/woflv.test.ts
git commit -m "feat(woflv): deterministische WoFlV-Rechen-Engine + Tests"
```

---

### Task 2: KI-Extraktionsschema (Zod) für Grundriss-Analyse

**Files:**
- Create: `src/lib/wohnflaeche/schema.ts`
- Test: `tests/woflv-schema.test.ts`

**Interfaces:**
- Consumes: `RoomCategory` from Task 1.
- Produces:
  - `floorplanAnalysisSchema` (Zod) und `type FloorplanAnalysis`
  - `floorplanJsonSchema` (`Record<string, unknown>` – als Vertrag für das LLM, via `zod-to-json-schema`)
  - `toWoflvRooms(a: FloorplanAnalysis): WoflvRoom[]` (mappt KI-Ausgabe → Engine-Eingabe, vergibt IDs, berechnet `flaecheM2` aus L×B falls nötig)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/woflv-schema.test.ts
import { describe, it, expect } from "vitest";
import { floorplanAnalysisSchema, toWoflvRooms } from "@/lib/wohnflaeche/schema";

describe("Floorplan-Analyse-Schema", () => {
  it("validiert eine KI-Ausgabe", () => {
    const parsed = floorplanAnalysisSchema.parse({
      rooms: [
        { geschoss: "EG", raumname: "Wohnen", kategorie: "wohnraum", flaecheM2: 24.5, konfidenz: 0.9, quelle: "flaeche_beschriftet" },
        { geschoss: "EG", raumname: "Bad", kategorie: "wohnraum", laengeM: 2, breiteM: 3, konfidenz: 0.6, quelle: "aus_massen_berechnet" },
      ],
    });
    expect(parsed.rooms.length).toBe(2);
  });

  it("berechnet flaecheM2 aus L×B, wenn keine Fläche angegeben", () => {
    const rooms = toWoflvRooms({
      rooms: [{ geschoss: "EG", raumname: "Bad", kategorie: "wohnraum", laengeM: 2, breiteM: 3, konfidenz: 0.6, quelle: "aus_massen_berechnet" }],
    });
    expect(rooms[0].flaecheM2).toBe(6);
    expect(rooms[0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/woflv-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/wohnflaeche/schema.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { WoflvRoom, RoomCategory } from "@/lib/wohnflaeche/woflv";

export const roomCategoryEnum = z.enum([
  "wohnraum",
  "balkon_terrasse_loggia",
  "zubehoer_keller_hobby_abstell",
  "wintergarten",
  "schwimmbad",
]);

const floorplanRoomSchema = z.object({
  geschoss: z.string().default("EG"),
  raumname: z.string().default("Raum"),
  kategorie: roomCategoryEnum.default("wohnraum"),
  flaecheM2: z.number().positive().optional(),
  laengeM: z.number().positive().optional(),
  breiteM: z.number().positive().optional(),
  dachschraege: z.boolean().optional(),
  beheizt: z.boolean().optional(),
  konfidenz: z.number().min(0).max(1).default(0.5),
  quelle: z
    .enum(["flaeche_beschriftet", "aus_massen_berechnet", "aus_massstab_geschaetzt"])
    .default("aus_massstab_geschaetzt"),
});

export const floorplanAnalysisSchema = z.object({
  rooms: z.array(floorplanRoomSchema).default([]),
});

export type FloorplanAnalysis = z.infer<typeof floorplanAnalysisSchema>;
export type FloorplanRoom = z.infer<typeof floorplanRoomSchema>;

export const floorplanJsonSchema = zodToJsonSchema(floorplanAnalysisSchema, "floorplan") as Record<string, unknown>;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `room-${idCounter}-${Math.round(performance.now())}`;
}

/** Erweitert die Engine-Eingabe um Konfidenz/Quelle für die UI. */
export interface FloorplanWoflvRoom extends WoflvRoom {
  konfidenz: number;
  quelle: FloorplanRoom["quelle"];
}

export function toWoflvRooms(a: FloorplanAnalysis): FloorplanWoflvRoom[] {
  return a.rooms.map((r) => {
    const flaecheM2 =
      r.flaecheM2 ?? (r.laengeM && r.breiteM ? Math.round(r.laengeM * r.breiteM * 100) / 100 : 0);
    return {
      id: nextId(),
      geschoss: r.geschoss,
      raumname: r.raumname,
      kategorie: r.kategorie as RoomCategory,
      flaecheM2,
      beheizt: r.beheizt,
      dachschraege: null,
      konfidenz: r.konfidenz,
      quelle: r.quelle,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/woflv-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wohnflaeche/schema.ts tests/woflv-schema.test.ts
git commit -m "feat(woflv): Zod-Schema für KI-Grundrissanalyse + Mapping"
```

---

### Task 3: Vision-Unterstützung im Provider + AIService.analyzeFloorplan

**Files:**
- Modify: `src/lib/ai/types.ts` (AICompletionRequest um `images` erweitern)
- Modify: `src/lib/ai/openai-compatible-provider.ts` (multimodale User-Message)
- Modify: `src/lib/ai/mock-provider.ts` (Demo-Räume für `schemaName: "floorplan"`)
- Modify: `src/lib/ai/service.ts` (Methode `analyzeFloorplan`)
- Test: `tests/floorplan-ai.test.ts`

**Interfaces:**
- Consumes: `floorplanAnalysisSchema`, `floorplanJsonSchema` (Task 2).
- Produces: `AIService.analyzeFloorplan(images: { base64: string; mimeType: string }[]): Promise<FloorplanAnalysis>`

- [ ] **Step 1: Write the failing test (Mock-Provider liefert Demo-Räume)**

```typescript
// tests/floorplan-ai.test.ts
import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("KI-Grundrissanalyse (Mock)", () => {
  it("liefert eine schema-konforme Raumliste", async () => {
    const res = await ai.analyzeFloorplan([{ base64: "ZmFrZQ==", mimeType: "image/png" }]);
    expect(res.rooms.length).toBeGreaterThan(0);
    expect(res.rooms[0].kategorie).toBeTruthy();
    expect(res.rooms[0].konfidenz).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/floorplan-ai.test.ts`
Expected: FAIL ("analyzeFloorplan is not a function").

- [ ] **Step 3a: Erweitere `AICompletionRequest` um Bilder**

```typescript
// src/lib/ai/types.ts  — innerhalb interface AICompletionRequest, nach `hints?:`
  /** Optionale Bilder (Vision). base64 OHNE data:-Präfix. */
  images?: Array<{ base64: string; mimeType: string }>;
```

- [ ] **Step 3b: Multimodale User-Message im openai-compatible-Provider**

Ersetze in `src/lib/ai/openai-compatible-provider.ts` den `messages`-Block:

```typescript
        messages: [
          { role: "system", content: buildSystemPrompt(req) },
          {
            role: "user",
            content:
              req.images && req.images.length > 0
                ? [
                    { type: "text", text: req.user },
                    ...req.images.map((img) => ({
                      type: "image_url",
                      image_url: `data:${img.mimeType};base64,${img.base64}`,
                    })),
                  ]
                : req.user,
          },
        ],
```

- [ ] **Step 3c: Mock-Demo-Räume für `floorplan`**

In `src/lib/ai/mock-provider.ts`, im `switch (req.schemaName)` von `completeJSON`, vor `default:` einfügen:

```typescript
      case "floorplan":
        return {
          rooms: [
            { geschoss: "EG", raumname: "Wohnen/Essen", kategorie: "wohnraum", flaecheM2: 32.4, konfidenz: 0.9, quelle: "flaeche_beschriftet" },
            { geschoss: "EG", raumname: "Küche", kategorie: "wohnraum", flaecheM2: 11.2, konfidenz: 0.88, quelle: "flaeche_beschriftet" },
            { geschoss: "EG", raumname: "Gäste-WC", kategorie: "wohnraum", flaecheM2: 3.1, konfidenz: 0.7, quelle: "aus_massen_berechnet" },
            { geschoss: "OG", raumname: "Schlafen", kategorie: "wohnraum", flaecheM2: 18.0, konfidenz: 0.85, quelle: "flaeche_beschriftet" },
            { geschoss: "OG", raumname: "Balkon", kategorie: "balkon_terrasse_loggia", flaecheM2: 8.0, konfidenz: 0.8, quelle: "flaeche_beschriftet" },
            { geschoss: "KG", raumname: "Keller", kategorie: "zubehoer_keller_hobby_abstell", flaecheM2: 24.0, konfidenz: 0.75, quelle: "aus_massen_berechnet" },
          ],
        };
```

- [ ] **Step 3d: `analyzeFloorplan` im AIService**

In `src/lib/ai/service.ts` Importe ergänzen und Methode hinzufügen (innerhalb der `AIService`-Klasse):

```typescript
// oben bei den Importen:
import { floorplanAnalysisSchema, floorplanJsonSchema, type FloorplanAnalysis } from "@/lib/wohnflaeche/schema";

// neue Methode:
  async analyzeFloorplan(images: Array<{ base64: string; mimeType: string }>): Promise<FloorplanAnalysis> {
    const raw = await this.provider.completeJSON({
      schemaName: "floorplan",
      system:
        "Du bist ein Bausachverständiger. Analysiere die beigefügten Grundriss-Bilder. " +
        "Gib für JEDEN Raum Geschoss, Raumname, Kategorie (wohnraum, balkon_terrasse_loggia, " +
        "zubehoer_keller_hobby_abstell, wintergarten, schwimmbad), die Fläche in m² (falls " +
        "beschriftet) ODER Länge/Breite in Metern, ob eine Dachschräge vorliegt, sowie eine " +
        "Konfidenz (0–1) und die Quelle. Erfinde keine Maße. Antworte ausschließlich als JSON.",
      user: "Analysiere die Grundrisse und liefere die Raumliste gemäß Schema.",
      jsonSchema: floorplanJsonSchema,
      images,
    });
    const parsed = floorplanAnalysisSchema.safeParse(raw);
    if (!parsed.success) return { rooms: [] };
    return parsed.data;
  }
```

> Hinweis: Falls `this.provider` in `AIService` anders heißt, an die bestehende Konvention der Klasse anpassen (gleiches Muster wie `classifyDocument`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/floorplan-ai.test.ts && npm run typecheck`
Expected: PASS + Typecheck ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/types.ts src/lib/ai/openai-compatible-provider.ts src/lib/ai/mock-provider.ts src/lib/ai/service.ts tests/floorplan-ai.test.ts
git commit -m "feat(woflv): Vision-Grundrissanalyse (Mistral) + Mock-Demo"
```

---

### Task 4: Persistenz – Prisma-Modell `WohnflaechenBerechnung`

**Files:**
- Modify: `prisma/schema.prisma` (neues Modell + Relation an `Case`)
- Modify: `src/lib/domain/enums.ts` (nur falls nötig – hier nicht)

**Interfaces:**
- Produces: Prisma-Modell `WohnflaechenBerechnung { id, caseId, rooms Json, summeWohnflaeche Float, summeZubehoer Float, released Boolean, model String?, createdAt, updatedAt }`

- [ ] **Step 1: Modell ergänzen**

In `prisma/schema.prisma` am Ende der Modelle hinzufügen:

```prisma
model WohnflaechenBerechnung {
  id              String   @id @default(cuid())
  caseId          String
  case            Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  // Geprüfte Raumliste (WoflvRoomResult[]) als JSON – editierbar, nachvollziehbar.
  rooms           Json
  summeWohnflaeche Float   @default(0)
  summeZubehoer   Float    @default(0)
  released        Boolean  @default(false)
  model           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([caseId])
  @@map("wohnflaechen_berechnungen")
}
```

Und in `model Case { ... }` bei den Relationen ergänzen:

```prisma
  wohnflaechen      WohnflaechenBerechnung[]
```

- [ ] **Step 2: Client generieren + Schema anwenden (lokal, additiv)**

Run: `npm run db:push`
Expected: „Your database is now in sync with your Prisma schema." (additiv, kein Datenverlust).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: ohne Fehler (Prisma-Client kennt `wohnflaechenBerechnung`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(woflv): Prisma-Modell WohnflaechenBerechnung (additiv)"
```

---

### Task 5: Server-Actions (analysieren + speichern)

**Files:**
- Create: `src/lib/actions/wohnflaeche.ts`
- Test: `tests/woflv.test.ts` (nur Engine; Actions sind DB-gebunden → kein Unit-Test, Smoke via Build/Typecheck)

**Interfaces:**
- Consumes: `requireCaseAccess` (`@/lib/auth/context`), `processUpload` (`@/lib/documents/pipeline`), `getStorage` (`@/lib/storage`), `AIService`, `computeWoflv`, `toWoflvRooms`, `audit`.
- Produces:
  - `analyzeFloorplanAction(caseId: string, _prev: WohnflaecheState, formData: FormData): Promise<WohnflaecheState>`
  - `saveWohnflaecheAction(caseId: string, rooms: WoflvRoom[]): Promise<{ id: string }>`
  - `interface WohnflaecheState { rooms: FloorplanWoflvRoom[]; error?: string }`

- [ ] **Step 1: Implementierung**

```typescript
// src/lib/actions/wohnflaeche.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { processUpload } from "@/lib/documents/pipeline";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { AIService } from "@/lib/ai/service";
import { computeWoflv, type WoflvRoom } from "@/lib/wohnflaeche/woflv";
import { toWoflvRooms, type FloorplanWoflvRoom } from "@/lib/wohnflaeche/schema";

const ai = new AIService();

export interface WohnflaecheState {
  rooms: FloorplanWoflvRoom[];
  error?: string;
}

const VISION_MIME = new Set(["image/png", "image/jpeg"]);

export async function analyzeFloorplanAction(
  caseId: string,
  _prev: WohnflaecheState,
  formData: FormData
): Promise<WohnflaecheState> {
  const { ctx } = await requireCaseAccess(caseId);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { rooms: [], error: "Bitte mindestens einen Grundriss hochladen." };

  // 1) Grundrisse durch die sichere Pipeline (Validierung + Virenscan + Storage).
  const images: Array<{ base64: string; mimeType: string }> = [];
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
    // Nur Bildformate an die Vision-KI (PDF-Seiten-Rendering ist hier nicht im Scope).
    if (VISION_MIME.has(file.type)) {
      images.push({ base64: buffer.toString("base64"), mimeType: file.type });
    }
  }

  if (images.length === 0) {
    return { rooms: [], error: "Für die KI-Analyse bitte JPG/PNG-Grundrisse hochladen (PDF wird gespeichert, aber nicht analysiert)." };
  }

  // 2) KI-Analyse (best effort).
  let rooms: FloorplanWoflvRoom[] = [];
  try {
    const analysis = await ai.analyzeFloorplan(images);
    rooms = toWoflvRooms(analysis);
  } catch {
    return { rooms: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen oder Räume manuell erfassen." };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "wohnflaeche", rooms: rooms.length, images: images.length },
  });

  revalidatePath(`/cases/${caseId}/wohnflaeche`);
  return { rooms };
}

export async function saveWohnflaecheAction(caseId: string, rooms: WoflvRoom[]): Promise<{ id: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const result = computeWoflv(rooms);
  const row = await prisma.wohnflaechenBerechnung.create({
    data: {
      caseId,
      rooms: result.rooms as unknown as object,
      summeWohnflaeche: result.summeWohnflaecheM2,
      summeZubehoer: result.summeZubehoerM2,
      released: true,
      model: "mistral-medium-latest",
    },
    select: { id: true },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "wohnflaeche", summeWohnflaeche: result.summeWohnflaecheM2 },
  });
  revalidatePath(`/cases/${caseId}/wohnflaeche`);
  return { id: row.id };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: ohne Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/wohnflaeche.ts
git commit -m "feat(woflv): Server-Actions analysieren + speichern (sichere Pipeline)"
```

---

### Task 6: PDF „Wohnflächenberechnung nach WoFlV"

**Files:**
- Modify: `src/lib/pdf/renderer.ts` (Funktion `renderWohnflaeche`)
- Modify: `src/lib/pdf/case-pdf.ts` (`buildWohnflaecheData`)
- Modify: `src/app/api/cases/[id]/pdf/route.ts` (Typ `wohnflaeche`)
- Test: `tests/pdf.test.ts` (Render-Smoke ergänzen)

**Interfaces:**
- Consumes: `BrokerInfo`, `getBrokerInfo`, `pdfFileName` (bestehend), `WoflvRoomResult` (Task 1), `prisma`.
- Produces:
  - `interface WohnflaecheData { caseNumber; dateStr; broker: BrokerInfo; rooms: { geschoss; raumname; kategorie; flaecheM2; faktor; anrechenbarM2; istZubehoer }[]; summeWohnflaeche: number; summeZubehoer: number }`
  - `renderWohnflaeche(data: WohnflaecheData): Promise<Buffer>`
  - `buildWohnflaecheData(caseId, organizationId): Promise<{ data: WohnflaecheData; fileName: string } | null>`

- [ ] **Step 1: Render-Smoke-Test ergänzen**

In `tests/pdf.test.ts` ergänzen (Import oben + neuer Test):

```typescript
import { renderWohnflaeche } from "@/lib/pdf/renderer";

it("erzeugt eine Wohnflächenberechnung", async () => {
  const buf = await renderWohnflaeche({
    caseNumber: "UP-2026-0001",
    dateStr: "21.06.2026",
    broker,
    rooms: [
      { geschoss: "EG", raumname: "Wohnen", kategorie: "wohnraum", flaecheM2: 32.4, faktor: 1, anrechenbarM2: 32.4, istZubehoer: false },
      { geschoss: "OG", raumname: "Balkon", kategorie: "balkon_terrasse_loggia", flaecheM2: 8, faktor: 0.25, anrechenbarM2: 2, istZubehoer: false },
      { geschoss: "KG", raumname: "Keller", kategorie: "zubehoer_keller_hobby_abstell", flaecheM2: 24, faktor: 0, anrechenbarM2: 0, istZubehoer: true },
    ],
    summeWohnflaeche: 34.4,
    summeZubehoer: 24,
  });
  expect(isPdf(buf)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL ("renderWohnflaeche is not exported").

- [ ] **Step 3a: `renderWohnflaeche` in renderer.ts**

Am Ende von `src/lib/pdf/renderer.ts` ergänzen (nutzt die vorhandenen Helfer `newDoc/coverHeader/heading/footer` analog zu `renderPlatformExport`):

```typescript
export interface WohnflaecheData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  rooms: Array<{ geschoss: string; raumname: string; kategorie: string; flaecheM2: number; faktor: number; anrechenbarM2: number; istZubehoer: boolean }>;
  summeWohnflaeche: number;
  summeZubehoer: number;
}

const KAT_LABEL: Record<string, string> = {
  wohnraum: "Wohnraum",
  balkon_terrasse_loggia: "Balkon/Terrasse",
  zubehoer_keller_hobby_abstell: "Zubehör",
  wintergarten: "Wintergarten",
  schwimmbad: "Schwimmbad",
};

export async function renderWohnflaeche(data: WohnflaecheData): Promise<Buffer> {
  const doc = newDoc(`Wohnflaechenberechnung ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Wohnflächenberechnung nach WoFlV", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Aufstellung");
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  data.rooms.forEach((r) => {
    const line = `${r.geschoss} · ${r.raumname} (${KAT_LABEL[r.kategorie] ?? r.kategorie}) — ${r.flaecheM2.toFixed(2)} m² × ${Math.round(r.faktor * 100)}% = ${r.anrechenbarM2.toFixed(2)} m²${r.istZubehoer ? "  [Zubehör]" : ""}`;
    doc.text(line);
    doc.moveDown(0.1);
  });

  heading(doc, "Summen");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f3a8a");
  doc.text(`Anrechenbare Wohnfläche: ${data.summeWohnflaeche.toFixed(2)} m²`);
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
  doc.text(`Zubehörflächen (nicht angerechnet): ${data.summeZubehoer.toFixed(2)} m²`);

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche Aufmaß-/Vermesserbescheinigung. Werte vor Verwendung prüfen.",
    { width: 495 }
  );

  footer(doc, data.broker);
  return docToBuffer(doc);
}
```

- [ ] **Step 3b: `buildWohnflaecheData` in case-pdf.ts**

In `src/lib/pdf/case-pdf.ts` ergänzen (Import von `WohnflaecheData` aus renderer + Funktion):

```typescript
import type { WohnflaecheData } from "@/lib/pdf/renderer";

export async function buildWohnflaecheData(
  caseId: string,
  organizationId: string
): Promise<{ data: WohnflaecheData; fileName: string } | null> {
  const broker = await getBrokerInfo(organizationId);
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });
  const latest = await prisma.wohnflaechenBerechnung.findFirst({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return null;
  const rooms = (latest.rooms as unknown as WohnflaecheData["rooms"]) ?? [];
  return {
    data: {
      caseNumber: caseRow.caseNumber,
      dateStr: dateStr(),
      broker,
      rooms,
      summeWohnflaeche: latest.summeWohnflaeche,
      summeZubehoer: latest.summeZubehoer,
    },
    fileName: pdfFileName("Wohnflaechenberechnung", caseRow.applicants),
  };
}
```

- [ ] **Step 3c: Route um Typ `wohnflaeche` erweitern**

In `src/app/api/cases/[id]/pdf/route.ts`: Import ergänzen und einen `case "wohnflaeche":` im `switch (type)` hinzufügen.

```typescript
// Importe ergänzen:
import { renderWohnflaeche } from "@/lib/pdf/renderer";
import { buildWohnflaecheData } from "@/lib/pdf/case-pdf";

// im switch(type), vor "bank-summary":
      case "wohnflaeche": {
        const built = await buildWohnflaecheData(id, ctx.organizationId);
        if (!built) return new NextResponse("Noch keine Wohnflächenberechnung vorhanden.", { status: 404 });
        buffer = await renderWohnflaeche(built.data);
        fileName = built.fileName;
        break;
      }
```

Außerdem den `CasePdfType`-Typ in `src/lib/pdf/case-pdf.ts` erweitern:

```typescript
export type CasePdfType = "bank-summary" | "checklist" | "audit" | "platform" | "wohnflaeche";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pdf.test.ts && npm run typecheck`
Expected: PASS + Typecheck ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/renderer.ts src/lib/pdf/case-pdf.ts src/app/api/cases/[id]/pdf/route.ts tests/pdf.test.ts
git commit -m "feat(woflv): bankfertiges PDF der Wohnflächenberechnung"
```

---

### Task 7: UI – Seite + Prüf-Editor + Button in der Fallakte

**Files:**
- Create: `src/app/(app)/cases/[id]/wohnflaeche/page.tsx`
- Create: `src/components/case/wohnflaeche-editor.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Button „Wohnflächenberechnung" in der Aktionen-Karte)

**Interfaces:**
- Consumes: `requireCaseAccess`, `analyzeFloorplanAction`, `saveWohnflaecheAction`, `computeWoflv`, `WoflvRoom`, `FloorplanWoflvRoom`.

- [ ] **Step 1: Editor-Client-Komponente**

```tsx
// src/components/case/wohnflaeche-editor.tsx
"use client";

import { useActionState, useState, useMemo } from "react";
import { UploadCloud, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeWoflv, type WoflvRoom, type RoomCategory } from "@/lib/wohnflaeche/woflv";
import { analyzeFloorplanAction, saveWohnflaecheAction, type WohnflaecheState } from "@/lib/actions/wohnflaeche";

const KATS: { value: RoomCategory; label: string }[] = [
  { value: "wohnraum", label: "Wohnraum" },
  { value: "balkon_terrasse_loggia", label: "Balkon/Terrasse" },
  { value: "zubehoer_keller_hobby_abstell", label: "Zubehör (Keller/Hobby)" },
  { value: "wintergarten", label: "Wintergarten" },
  { value: "schwimmbad", label: "Schwimmbad" },
];

export function WohnflaecheEditor({ caseId }: { caseId: string }) {
  const action = analyzeFloorplanAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<WohnflaecheState, FormData>(action, { rooms: [] });
  const [rooms, setRooms] = useState<WoflvRoom[]>([]);
  const [saved, setSaved] = useState(false);

  // KI-Ergebnis in den editierbaren Zustand übernehmen.
  useMemo(() => {
    if (state.rooms.length > 0) setRooms(state.rooms.map((r) => ({ ...r })));
  }, [state.rooms]);

  const result = computeWoflv(rooms);

  function update(i: number, patch: Partial<WoflvRoom>) {
    setRooms((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save() {
    await saveWohnflaecheAction(caseId, rooms);
    setSaved(true);
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:border-ai/50">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">Grundriss(e) hochladen (JPG/PNG für KI-Analyse, PDF wird gespeichert)</span>
          <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 text-xs" />
        </label>
        <Button type="submit" className="mt-3 w-full" disabled={pending}>
          {pending ? "Analysiere …" : "Analysieren"}
        </Button>
        {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      </form>

      {rooms.length > 0 && (
        <>
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <div className="text-xs text-muted-foreground">Anrechenbare Wohnfläche</div>
              <div className="text-2xl font-semibold">{result.summeWohnflaecheM2.toFixed(2)} m²</div>
              <div className="text-xs text-muted-foreground">Zubehör getrennt: {result.summeZubehoerM2.toFixed(2)} m²</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} variant="success" size="sm"><Save className="h-4 w-4" />{saved ? "Gespeichert" : "Prüfen & speichern"}</Button>
              {saved && (
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/cases/${caseId}/pdf?type=wohnflaeche`}><FileDown className="h-4 w-4" />PDF</a>
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Geschoss</th><th className="px-2 py-2">Raum</th><th className="px-2 py-2">Kategorie</th>
                  <th className="px-2 py-2">Fläche m²</th><th className="px-2 py-2">Faktor</th><th className="px-2 py-2">Anrechenbar</th><th className="px-2 py-2">Konfidenz</th>
                </tr>
              </thead>
              <tbody>
                {result.rooms.map((r, i) => {
                  const src = rooms[i] as WoflvRoom & { konfidenz?: number };
                  const konf = src.konfidenz ?? 1;
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-1"><Input value={rooms[i].geschoss} onChange={(e) => update(i, { geschoss: e.target.value })} className="h-8 w-16" /></td>
                      <td className="px-2 py-1"><Input value={rooms[i].raumname} onChange={(e) => update(i, { raumname: e.target.value })} className="h-8 w-32" /></td>
                      <td className="px-2 py-1">
                        <select value={rooms[i].kategorie} onChange={(e) => update(i, { kategorie: e.target.value as RoomCategory })} className="h-8 rounded-md border px-1 text-xs">
                          {KATS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1"><Input type="number" step="0.01" value={rooms[i].flaecheM2} onChange={(e) => update(i, { flaecheM2: Number(e.target.value) })} className="h-8 w-20" /></td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{Math.round(r.faktor * 100)}%</td>
                      <td className="px-2 py-1 font-medium">{r.anrechenbarM2.toFixed(2)}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${konf >= 0.8 ? "bg-success/15 text-success-foreground" : konf >= 0.6 ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>
                          {Math.round(konf * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche Aufmaß-/Vermesserbescheinigung. Bitte jeden Wert prüfen.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Seite**

```tsx
// src/app/(app)/cases/[id]/wohnflaeche/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WohnflaecheEditor } from "@/components/case/wohnflaeche-editor";

export const dynamic = "force-dynamic";

export default async function WohnflaechePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Objekt"
        title="Wohnflächenberechnung nach WoFlV"
        subtitle="Grundriss hochladen, KI-Vorschlag prüfen, bankfertiges PDF erzeugen. Jeder Wert ist editierbar."
        actions={<Button asChild variant="outline" size="sm"><Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link></Button>}
      />
      <WohnflaecheEditor caseId={id} />
    </div>
  );
}
```

- [ ] **Step 3: Button in der Fallakte**

In `src/app/(app)/cases/[id]/page.tsx`, in der „Aktionen"-Karte (nach „Bankfähige Zusammenfassung") ergänzen:

```tsx
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/wohnflaeche`}><FileBarChart />Wohnflächenberechnung</Link></Button>
```

(`FileBarChart` ist dort bereits importiert.)

- [ ] **Step 4: Verifizieren**

Run: `npm run typecheck && npm run build`
Expected: Build ok, Route `/cases/[id]/wohnflaeche` erscheint in der Ausgabe.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/cases/[id]/wohnflaeche/page.tsx" src/components/case/wohnflaeche-editor.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(woflv): UI – Upload, Prüf-Editor, PDF-Button"
```

---

### Task 8: Vercel-Env & Live-Schaltung der Vision-KI

**Files:** keine (Konfiguration/Deploy)

- [ ] **Step 1: Prüfen, ob Mistral-Keys in Vercel gesetzt sind**

Run: `vercel env ls production`
Expected: `AI_PROVIDER`, `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL` (und `MISTRAL_*`) vorhanden. Fehlt etwas → nachtragen (mit `vercel env add`), `OPENAI_COMPATIBLE_MODEL=mistral-medium-latest` für beste Grundriss-Genauigkeit.

- [ ] **Step 2: Voller Testlauf lokal**

Run: `npm test && npm run typecheck && npm run build`
Expected: alle Tests grün, Build ok.

- [ ] **Step 3: Deploy**

Run: `vercel --prod --yes`
Expected: READY. Danach `/cases/<id>/wohnflaeche` aufrufen, Grundriss (JPG/PNG) hochladen, Analyse prüfen, PDF erzeugen.

- [ ] **Step 4: Commit (Merge in main erfolgt separat nach Review)**

Keine weiteren Code-Änderungen; Branch bleibt bis zum PR/Merge bestehen.

---

## Self-Review

- **Spec-Abdeckung:** Ablauf (Task 5/7), KI-Extraktion (Task 2/3), WoFlV-Regeln inkl. Dachschräge/Balkon/Zubehör/Wintergarten (Task 1), Prüf-Tabelle (Task 7), PDF + Ablage als Dokument (Task 5 Upload + Task 6 PDF), Persistenz (Task 4), Sicherheit/Virenscan (Task 5 via `processUpload`), keine Auto-Übernahme der Objekt-Wohnfläche (nicht implementiert – korrekt), EU-Mistral + Vercel-Env (Task 3/8), Haftungshinweis (Task 6/7). ✅
- **Platzhalter:** keine offenen TODOs; gesamter Code ausformuliert.
- **Typkonsistenz:** `WoflvRoom`/`computeWoflv`/`FloorplanWoflvRoom`/`renderWohnflaeche`/`WohnflaecheData` durchgängig gleich benannt. `analyzeFloorplan(images)`-Signatur in Task 3 = Aufruf in Task 5.
- **Bekannte Annahme:** PDF-Grundrisse werden gespeichert, aber nicht an die Vision-KI gegeben (nur JPG/PNG). Falls später PDF→Bild-Rendering gewünscht, eigener Folgetask.
