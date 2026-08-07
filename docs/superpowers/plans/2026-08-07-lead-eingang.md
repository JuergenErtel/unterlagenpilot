# Lead-Eingang aus FinLink – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue FinLink-Leads werden alle 15 Minuten abgeholt und als Fälle in Phase „Neu" angelegt — mit erkennbarer Quelle und mitgeführten Einwilligungen.

**Architecture:** Ein Cron-Lauf holt die neueste Leadseite, wählt anhand einer Wasserstandsmarke aus, was neu ist, und schiebt jeden Lead durch den vorhandenen Pfad `finlinkToCanonical` → `createCaseFromCanonical`. Auswahl und Quellen-Ableitung sind reine Funktionen; der Lauf selbst führt nur Buch (`LeadSyncState`).

**Tech Stack:** Next.js Route Handler (Cron), Prisma/PostgreSQL, Zod, Vitest, PGlite.

## Global Constraints

- Sprache im Produkt und in Kommentaren: **Deutsch**.
- Neue Fälle entstehen **immer in Phase `neu`** und ohne Eingangskorb.
- **Kein Nachschlag aus dem Bestand:** Ohne Marke ist der Stichtag der Zeitpunkt des ersten Laufs.
- **Ein kaputter Lead blockiert den Zufluss nicht** — überspringen, protokollieren, Marke rückt vor.
- **Ein API-Fehler lässt die Marke stehen** — der nächste Lauf holt nach.
- Höchstens **200** Leads je Lauf.
- Einwilligungen sind **dreiwertig** (`true`/`false`/`null`); „keine Angabe" ist nicht „nein".
- Cron nur mit gültigem `CRON_SECRET`, sonst 401.
- Ohne `FINLINK_API_KEY`: Rückgabe „nicht konfiguriert", kein Fehler, kein Schreibvorgang.
- Tests: `npx vitest run <datei>`, volle Suite `npm test`, Typecheck `npm run typecheck`.
- `npm run db:push` läuft gegen die **Produktionsdatenbank** — nur in Task 6 nach Freigabe.

---

## Dateiübersicht

| Datei | Verantwortung |
| --- | --- |
| `prisma/schema.prisma` | `enum LeadSource`, vier Felder am `Case`, `LeadSyncState`, Index auf `finlinkId` |
| `src/lib/domain/enums.ts` | `LEAD_SOURCES`, `LEAD_SOURCE_LABELS` |
| `src/lib/platforms/finlink/source.ts` | Reine Logik: Rohwerte → Quelle |
| `src/lib/platforms/finlink/dto.ts` | Summary um `sourceType`, `source`, Einwilligungen erweitern |
| `src/lib/platforms/finlink/client.ts` | `fetchLeadsPage(limit)` – eine Seite statt aller |
| `src/lib/platforms/finlink/select.ts` | Reine Logik: welche Leads sind neu |
| `src/lib/platforms/finlink/sync.ts` | Der Lauf: auswählen, anlegen, Buch führen |
| `src/app/api/cron/finlink-leads/route.ts` | Cron-Einstieg |
| `src/lib/actions/lead-sync.ts` | Server Action „Jetzt abgleichen" |
| `src/components/pipeline/sync-status.tsx` | Statuszeile und Knopf unter dem Board |
| `src/app/(app)/pipeline/page.tsx` | Quellenleiste, Statuszeile |
| `vercel.json` | Cron-Eintrag alle 15 Minuten |

---

### Task 1: Schema, Quellenliste und Ableitung

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain/enums.ts`
- Create: `src/lib/platforms/finlink/source.ts`
- Test: `tests/finlink-source.test.ts` (neu)

**Interfaces:**
- Produces: `LEAD_SOURCES`, `LEAD_SOURCE_LABELS`, `type LeadSource`;
  `leiteQuelleAb(roh: { sourceType?: string | null; source?: string | null }): { quelle: LeadSource; detail: string | null }`

- [ ] **Step 1: Schema erweitern**

In `prisma/schema.prisma` bei den Enums ergänzen:

```prisma
/** Woher ein Fall stammt. */
enum LeadSource {
  immoscout24
  baufi24
  europace
  vergleich_de
  manuell
  unbekannt
}
```

Im Modell `Case` nach den Leadphasen-Feldern:

```prisma
  // Herkunft des Falls. Der Rohwert bleibt erhalten, damit nachvollziehbar
  // ist, woraus die Zuordnung entstand – kommt morgen ein neuer Wert, steht
  // hier "unbekannt", aber das Original ist noch da.
  quelle                LeadSource @default(unbekannt)
  quelleDetail          String?
  // Dreiwertig: null heißt "keine Angabe" und ist NICHT "nein".
  einwilligungKontakt   Boolean?
  einwilligungMarketing Boolean?
```

Am Ende des `Case`-Modells, bei den übrigen Indizes:

```prisma
  @@index([finlinkId])
```

Am Dateiende:

```prisma
/**
 * Wasserstandsmarke und Zustand des Lead-Abgleichs, je Organisation und Quelle.
 * Eigenes Modell statt PlatformConnection: Dort gibt es keinen Platz für
 * Zeitstempel und Fehler, und die Tabelle wird heute nur gelesen.
 */
model LeadSyncState {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /** Heute nur "finlink"; der Mail-Weg bekommt später einen eigenen Eintrag. */
  quelle         String
  /** Eingangszeitpunkt des zuletzt verarbeiteten Leads. */
  syncedUntil    DateTime?
  lastRunAt      DateTime?
  lastCreated    Int      @default(0)
  lastError      String?
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, quelle])
  @@map("lead_sync_states")
}
```

Im Modell `Organization` die Gegenrelation ergänzen:

```prisma
  leadSyncStates      LeadSyncState[]
```

- [ ] **Step 2: Client erzeugen**

Run: `npx prisma generate`
Expected: „Generated Prisma Client". Kein `db:push` — das kommt in Task 6.

- [ ] **Step 3: Quellenliste in enums.ts**

In `src/lib/domain/enums.ts` nach den Leadphasen ergänzen:

```ts
/** Herkunft eines Falls. "unbekannt" ist Alltag, kein Fehler: In den echten
 *  FinLink-Daten fehlt die Quelle bei knapp einem Viertel der Leads. */
export const LEAD_SOURCES = [
  "immoscout24",
  "baufi24",
  "europace",
  "vergleich_de",
  "manuell",
  "unbekannt",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  immoscout24: "ImmoScout24",
  baufi24: "Baufi24",
  europace: "Europace",
  vergleich_de: "vergleich.de",
  manuell: "Manuell angelegt",
  unbekannt: "Unbekannt",
};
```

- [ ] **Step 4: Test schreiben**

Create `tests/finlink-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { leiteQuelleAb } from "@/lib/platforms/finlink/source";

describe("leiteQuelleAb", () => {
  it("erkennt ImmoScout am source_type", () => {
    expect(leiteQuelleAb({ sourceType: "ImmoscoutLead" })).toEqual({
      quelle: "immoscout24",
      detail: "ImmoscoutLead",
    });
  });

  it("erkennt Europace am source_type", () => {
    expect(leiteQuelleAb({ sourceType: "EuropaceCase" }).quelle).toBe("europace");
  });

  it("erkennt Europace auch am Freitext in source", () => {
    expect(
      leiteQuelleAb({ source: "Imported via Europace by Organization: ISH GmbH" }).quelle
    ).toBe("europace");
  });

  it("erkennt Baufi24 am Leadshop", () => {
    expect(leiteQuelleAb({ source: "Leadshop" })).toEqual({
      quelle: "baufi24",
      detail: "Leadshop",
    });
  });

  it("liefert 'unbekannt', wenn beide Felder leer sind", () => {
    expect(leiteQuelleAb({})).toEqual({ quelle: "unbekannt", detail: null });
    expect(leiteQuelleAb({ sourceType: null, source: "" })).toEqual({
      quelle: "unbekannt",
      detail: null,
    });
  });

  it("behält den Rohwert, wenn der Wert unbekannt ist", () => {
    // Kommt morgen ein neuer Quellentyp, darf der Originalwert nicht verloren
    // gehen – sonst muss man raten, was passiert ist.
    expect(leiteQuelleAb({ sourceType: "TiktokLead" })).toEqual({
      quelle: "unbekannt",
      detail: "TiktokLead",
    });
  });

  it("bevorzugt source_type gegenüber source", () => {
    expect(
      leiteQuelleAb({ sourceType: "ImmoscoutLead", source: "Leadshop" }).quelle
    ).toBe("immoscout24");
  });
});
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/finlink-source.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/platforms/finlink/source"`.

- [ ] **Step 6: Ableitung schreiben**

Create `src/lib/platforms/finlink/source.ts`:

```ts
import type { LeadSource } from "@/lib/domain/enums";

/**
 * Leitet die Quelle aus den FinLink-Rohwerten ab. Reine Logik.
 *
 * Am 07.08.2026 an 200 echten Leads geprüft: `source_type` ist der
 * verlässlichere Wert (ImmoscoutLead 126, EuropaceCase 26), `source` trägt den
 * Leadshop (35) und einen Europace-Freitext. Bei 48 von 200 fehlt beides.
 */
export interface QuellenRohwerte {
  sourceType?: string | null;
  source?: string | null;
}

export function leiteQuelleAb(roh: QuellenRohwerte): {
  quelle: LeadSource;
  detail: string | null;
} {
  const typ = roh.sourceType?.trim() || null;
  const src = roh.source?.trim() || null;
  const detail = typ ?? src;

  if (typ === "ImmoscoutLead") return { quelle: "immoscout24", detail };
  if (typ === "EuropaceCase") return { quelle: "europace", detail };
  if (src?.startsWith("Imported via Europace")) return { quelle: "europace", detail };
  if (src === "Leadshop") return { quelle: "baufi24", detail };

  return { quelle: "unbekannt", detail };
}
```

- [ ] **Step 7: Test, Typecheck, Commit**

Run: `npx vitest run tests/finlink-source.test.ts && npm run typecheck`
Expected: PASS (7 Tests), keine Ausgabe.

```bash
git add prisma/schema.prisma src/lib/domain/enums.ts src/lib/platforms/finlink/source.ts tests/finlink-source.test.ts
git commit -m "feat(lead-eingang): Quellenliste, Fallfelder und Ableitung aus den Rohwerten"
```

---

### Task 2: Leadseite abrufen und auswählen

**Files:**
- Modify: `src/lib/platforms/finlink/dto.ts`
- Modify: `src/lib/platforms/finlink/client.ts`
- Create: `src/lib/platforms/finlink/select.ts`
- Test: `tests/finlink-select.test.ts` (neu)

**Interfaces:**
- Consumes: `leiteQuelleAb` (Task 1).
- Produces:
  - `interface FinLinkLeadRoh { id: string; createdAt: string | null; sourceType: string | null; source: string | null; einwilligungKontakt: boolean | null; einwilligungMarketing: boolean | null }`
  - `parseFinLinkLeadsRoh(body: unknown): FinLinkLeadRoh[]`
  - `FinLinkClient.fetchLeadsPage(limit: number): Promise<FinLinkLeadRoh[]>`
  - `waehleNeueLeads(leads: FinLinkLeadRoh[], syncedUntil: Date | null, max: number): FinLinkLeadRoh[]`

- [ ] **Step 1: Rohparser in dto.ts ergänzen**

In `src/lib/platforms/finlink/dto.ts` am Dateiende ergänzen:

```ts
/**
 * Die Felder, die der Lead-Abgleich braucht – bewusst getrennt von
 * `FinLinkLeadSummary` (Anzeige) und `FinLinkVorgangDTO` (Fallinhalt).
 * `extras_meta` ist in echten Daten mal Objekt, mal null.
 */
export interface FinLinkLeadRoh {
  id: string;
  /** ISO-Zeitstempel des Eingangs; null, wenn FinLink keinen liefert. */
  createdAt: string | null;
  sourceType: string | null;
  source: string | null;
  einwilligungKontakt: boolean | null;
  einwilligungMarketing: boolean | null;
}

const rohLeadSchema = z.object({
  id: z.string().min(1),
  attributes: z
    .object({
      created_at: z.string().optional().nullable(),
      extras_meta: z
        .object({
          source: z.string().optional().nullable(),
          source_type: z.string().optional().nullable(),
          consent_to_contact: z.boolean().optional().nullable(),
          consent_marketing: z.boolean().optional().nullable(),
        })
        .passthrough()
        .optional()
        .nullable(),
    })
    .passthrough(),
});

export function parseFinLinkLeadsRoh(body: unknown): FinLinkLeadRoh[] {
  const parsed = z.object({ data: z.array(rohLeadSchema) }).parse(body);
  return parsed.data.map((l) => {
    const e = l.attributes.extras_meta ?? {};
    return {
      id: l.id,
      createdAt: l.attributes.created_at ?? null,
      sourceType: e.source_type ?? null,
      source: e.source ?? null,
      einwilligungKontakt: e.consent_to_contact ?? null,
      einwilligungMarketing: e.consent_marketing ?? null,
    };
  });
}
```

- [ ] **Step 2: Client-Methode ergänzen**

In `src/lib/platforms/finlink/client.ts` das Interface erweitern:

```ts
export interface FinLinkClient {
  fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO>;
  listLeads(): Promise<FinLinkLeadSummary[]>;
  /** Nur die neueste Seite – der Abgleich braucht nicht alle Seiten. */
  fetchLeadsPage(limit: number): Promise<FinLinkLeadRoh[]>;
}
```

In `HttpFinLinkClient` ergänzen (Import von `parseFinLinkLeadsRoh` und
`FinLinkLeadRoh` aus `./dto` nicht vergessen):

```ts
  async fetchLeadsPage(limit: number): Promise<FinLinkLeadRoh[]> {
    // Eine Seite genügt: Die Liste kommt absteigend nach Eingang, und der
    // Abgleich interessiert sich nur für das Neue.
    const body = await this.fetchJson(`${LEADS_PATH}?limit=${limit}&page=1`);
    return parseFinLinkLeadsRoh(body);
  }
```

- [ ] **Step 3: Test schreiben**

Create `tests/finlink-select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { waehleNeueLeads } from "@/lib/platforms/finlink/select";
import type { FinLinkLeadRoh } from "@/lib/platforms/finlink/dto";

function lead(id: string, createdAt: string | null): FinLinkLeadRoh {
  return {
    id,
    createdAt,
    sourceType: null,
    source: null,
    einwilligungKontakt: null,
    einwilligungMarketing: null,
  };
}

const marke = new Date("2026-08-07T10:00:00Z");

describe("waehleNeueLeads", () => {
  it("nimmt nur Leads, die neuer als die Marke sind", () => {
    const gewaehlt = waehleNeueLeads(
      [
        lead("neu", "2026-08-07T11:00:00Z"),
        lead("alt", "2026-08-07T09:00:00Z"),
      ],
      marke,
      200
    );
    expect(gewaehlt.map((l) => l.id)).toEqual(["neu"]);
  });

  it("nimmt einen Lead mit exakt der Marke NICHT erneut", () => {
    expect(waehleNeueLeads([lead("gleich", "2026-08-07T10:00:00Z")], marke, 200)).toEqual([]);
  });

  it("nimmt ohne Marke nichts – der erste Lauf holt keinen Bestand nach", () => {
    expect(waehleNeueLeads([lead("a", "2026-08-01T10:00:00Z")], null, 200)).toEqual([]);
  });

  it("überspringt Leads ohne Eingangszeitpunkt", () => {
    // Ohne Zeitstempel ist nicht entscheidbar, ob der Lead neu ist – ihn
    // mitzunehmen würde bei jedem Lauf denselben Fall erzeugen wollen.
    expect(waehleNeueLeads([lead("ohne", null)], marke, 200)).toEqual([]);
  });

  it("deckelt die Menge und nimmt dabei die ältesten zuerst", () => {
    const viele = Array.from({ length: 5 }, (_, i) =>
      lead(`l${i}`, `2026-08-07T1${i}:00:00Z`)
    );
    const gewaehlt = waehleNeueLeads(viele, marke, 3);
    // Älteste zuerst, damit die Marke lückenlos vorrückt.
    expect(gewaehlt.map((l) => l.id)).toEqual(["l0", "l1", "l2"]);
  });

  it("verkraftet einen unlesbaren Zeitstempel", () => {
    expect(waehleNeueLeads([lead("kaputt", "morgen frueh")], marke, 200)).toEqual([]);
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/finlink-select.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/platforms/finlink/select"`.

- [ ] **Step 5: Auswahl schreiben**

Create `src/lib/platforms/finlink/select.ts`:

```ts
import type { FinLinkLeadRoh } from "@/lib/platforms/finlink/dto";

/**
 * Welche Leads sind seit der letzten Marke dazugekommen? Reine Logik.
 *
 * Ohne Marke wird nichts genommen: Der erste Lauf setzt den Stichtag, statt
 * hunderte Bestandsleads einzuspielen.
 *
 * Sortiert aufsteigend, damit die Marke lückenlos vorrücken kann – bricht ein
 * Lauf nach der Hälfte ab, steht sie auf dem letzten wirklich verarbeiteten Lead.
 */
export function waehleNeueLeads(
  leads: FinLinkLeadRoh[],
  syncedUntil: Date | null,
  max: number
): FinLinkLeadRoh[] {
  if (!syncedUntil) return [];

  const mitZeit = leads
    .map((l) => ({ lead: l, zeit: l.createdAt ? new Date(l.createdAt) : null }))
    .filter((x): x is { lead: FinLinkLeadRoh; zeit: Date } =>
      x.zeit !== null && !Number.isNaN(x.zeit.getTime())
    );

  return mitZeit
    .filter((x) => x.zeit.getTime() > syncedUntil.getTime())
    .sort((a, b) => a.zeit.getTime() - b.zeit.getTime())
    .slice(0, max)
    .map((x) => x.lead);
}
```

- [ ] **Step 6: Test, Typecheck, Commit**

Run: `npx vitest run tests/finlink-select.test.ts && npm run typecheck`
Expected: PASS (6 Tests), keine Ausgabe.

```bash
git add src/lib/platforms/finlink/dto.ts src/lib/platforms/finlink/client.ts src/lib/platforms/finlink/select.ts tests/finlink-select.test.ts
git commit -m "feat(lead-eingang): Rohparser, Seitenabruf und Auswahl neuer Leads"
```

---

### Task 3: Der Abgleich

**Files:**
- Create: `src/lib/platforms/finlink/sync.ts`
- Test: `tests/finlink-sync.test.ts` (neu)

**Interfaces:**
- Consumes: `waehleNeueLeads` (Task 2), `leiteQuelleAb` (Task 1), `finlinkToCanonical`, `createCaseFromCanonical`, `getFinLinkClient`.
- Produces:
  - `interface SyncErgebnis { status: "ok" | "nicht_konfiguriert" | "fehler"; angelegt: number; uebersprungen: string[]; fehler?: string }`
  - `syncFinLinkLeads(ctx: { organizationId: string; userId: string }, deps?: { client?: FinLinkClient | null; jetzt?: Date }): Promise<SyncErgebnis>`

- [ ] **Step 1: Test schreiben**

Create `tests/finlink-sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const stateFindUnique = vi.fn();
const stateUpsert = vi.fn();
const caseUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadSyncState: {
      findUnique: (...a: unknown[]) => stateFindUnique(...a),
      upsert: (...a: unknown[]) => stateUpsert(...a),
    },
    case: { update: (...a: unknown[]) => caseUpdate(...a) },
  },
}));

const createCaseFromCanonical = vi.fn();
vi.mock("@/lib/platforms/case-writer", () => ({
  createCaseFromCanonical: (...a: unknown[]) => createCaseFromCanonical(...a),
}));

const fetchVorgang = vi.fn();
const fetchLeadsPage = vi.fn();
vi.mock("@/lib/platforms/finlink/client", () => ({
  getFinLinkClient: () => ({ fetchVorgang, fetchLeadsPage, listLeads: vi.fn() }),
}));

vi.mock("@/lib/platforms/finlink/mapping", () => ({
  finlinkToCanonical: () => ({ platformIds: { finlinkId: "L1" }, applicants: [] }),
}));

import { syncFinLinkLeads } from "@/lib/platforms/finlink/sync";

const ctx = { organizationId: "org-A", userId: "u1" };
const marke = new Date("2026-08-07T10:00:00Z");

function rohLead(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    createdAt,
    sourceType: "ImmoscoutLead",
    source: null,
    einwilligungKontakt: true,
    einwilligungMarketing: null,
    ...extra,
  };
}

beforeEach(() => {
  [stateFindUnique, stateUpsert, caseUpdate, createCaseFromCanonical, fetchVorgang, fetchLeadsPage].forEach(
    (m) => m.mockReset()
  );
  stateFindUnique.mockResolvedValue({ id: "s1", syncedUntil: marke });
  stateUpsert.mockResolvedValue({});
  caseUpdate.mockResolvedValue({});
  createCaseFromCanonical.mockResolvedValue({ caseId: "c1", caseNumber: "UP-1", deduped: false });
  fetchVorgang.mockResolvedValue({ id: "L1", antragsteller: [] });
  fetchLeadsPage.mockResolvedValue([rohLead("L1", "2026-08-07T11:00:00Z")]);
});

describe("syncFinLinkLeads", () => {
  it("legt für einen neuen Lead einen Fall an und setzt die Quelle", async () => {
    const r = await syncFinLinkLeads(ctx);
    expect(r.status).toBe("ok");
    expect(r.angelegt).toBe(1);
    const arg = caseUpdate.mock.calls[0]![0] as {
      data: { quelle: string; quelleDetail: string; einwilligungKontakt: boolean };
    };
    expect(arg.data.quelle).toBe("immoscout24");
    expect(arg.data.quelleDetail).toBe("ImmoscoutLead");
    expect(arg.data.einwilligungKontakt).toBe(true);
  });

  it("schiebt die Marke auf den neuesten verarbeiteten Lead", async () => {
    await syncFinLinkLeads(ctx);
    const arg = stateUpsert.mock.calls[0]![0] as { update: { syncedUntil: Date } };
    expect(arg.update.syncedUntil.toISOString()).toBe("2026-08-07T11:00:00.000Z");
  });

  it("meldet 'nicht konfiguriert', wenn kein Client da ist", async () => {
    const r = await syncFinLinkLeads(ctx, { client: null });
    expect(r.status).toBe("nicht_konfiguriert");
    expect(stateUpsert).not.toHaveBeenCalled();
  });

  it("lässt die Marke bei einem API-Fehler stehen", async () => {
    fetchLeadsPage.mockRejectedValue(new Error("502 Bad Gateway"));
    const r = await syncFinLinkLeads(ctx);
    expect(r.status).toBe("fehler");
    const arg = stateUpsert.mock.calls[0]![0] as {
      update: { lastError: string; syncedUntil?: Date };
    };
    expect(arg.update.lastError).toContain("502");
    expect(arg.update.syncedUntil).toBeUndefined();
  });

  it("überspringt einen kaputten Lead, blockiert den Rest aber nicht", async () => {
    fetchLeadsPage.mockResolvedValue([
      rohLead("L1", "2026-08-07T11:00:00Z"),
      rohLead("L2", "2026-08-07T12:00:00Z"),
    ]);
    fetchVorgang.mockImplementation(async (id: string) => {
      if (id === "L1") throw new Error("Antwort unparsebar");
      return { id, antragsteller: [] };
    });
    const r = await syncFinLinkLeads(ctx);
    expect(r.angelegt).toBe(1);
    expect(r.uebersprungen).toEqual(["L1"]);
    // Marke rückt trotzdem vor – ein kaputter Datensatz darf den Zufluss nicht
    // dauerhaft blockieren.
    const arg = stateUpsert.mock.calls[0]![0] as { update: { syncedUntil: Date } };
    expect(arg.update.syncedUntil.toISOString()).toBe("2026-08-07T12:00:00.000Z");
  });

  it("zählt eine Dublette nicht als Neuanlage", async () => {
    createCaseFromCanonical.mockResolvedValue({ caseId: "c1", caseNumber: "UP-1", deduped: true });
    const r = await syncFinLinkLeads(ctx);
    expect(r.angelegt).toBe(0);
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("setzt beim ersten Lauf nur den Stichtag und legt nichts an", async () => {
    stateFindUnique.mockResolvedValue(null);
    const jetzt = new Date("2026-08-07T13:00:00Z");
    const r = await syncFinLinkLeads(ctx, { jetzt });
    expect(r.angelegt).toBe(0);
    const arg = stateUpsert.mock.calls[0]![0] as { create: { syncedUntil: Date } };
    expect(arg.create.syncedUntil.toISOString()).toBe(jetzt.toISOString());
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/finlink-sync.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/platforms/finlink/sync"`.

- [ ] **Step 3: Abgleich schreiben**

Create `src/lib/platforms/finlink/sync.ts`:

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getFinLinkClient, type FinLinkClient } from "@/lib/platforms/finlink/client";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import { createCaseFromCanonical } from "@/lib/platforms/case-writer";
import { waehleNeueLeads } from "@/lib/platforms/finlink/select";
import { leiteQuelleAb } from "@/lib/platforms/finlink/source";

/**
 * Holt neue Leads aus FinLink und legt daraus Fälle an.
 *
 * Zwei Grundsätze, die den Zufluss am Leben halten:
 *  - Ein API-Fehler lässt die Marke stehen; der nächste Lauf holt nach.
 *  - Ein einzelner kaputter Lead wird übersprungen, die Marke rückt trotzdem
 *    vor. Bliebe sie stehen, würde ein Datensatz alles Weitere dauerhaft
 *    blockieren – der Schaden wäre größer als der eine verlorene Lead.
 */
const QUELLE = "finlink";
const MAX_PRO_LAUF = 200;

export interface SyncErgebnis {
  status: "ok" | "nicht_konfiguriert" | "fehler";
  angelegt: number;
  /** IDs übersprungener Leads. */
  uebersprungen: string[];
  fehler?: string;
}

export async function syncFinLinkLeads(
  ctx: { organizationId: string; userId: string },
  deps?: { client?: FinLinkClient | null; jetzt?: Date }
): Promise<SyncErgebnis> {
  const client = deps?.client === undefined ? getFinLinkClient() : deps.client;
  if (!client) return { status: "nicht_konfiguriert", angelegt: 0, uebersprungen: [] };

  const jetzt = deps?.jetzt ?? new Date();
  const state = await prisma.leadSyncState.findUnique({
    where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } },
  });

  // Erster Lauf: nur Stichtag setzen. Sonst käme der gesamte Bestand herein.
  if (!state) {
    await prisma.leadSyncState.upsert({
      where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } },
      create: {
        organizationId: ctx.organizationId,
        quelle: QUELLE,
        syncedUntil: jetzt,
        lastRunAt: jetzt,
        lastCreated: 0,
      },
      update: { lastRunAt: jetzt },
    });
    return { status: "ok", angelegt: 0, uebersprungen: [] };
  }

  let leads;
  try {
    leads = await client.fetchLeadsPage(MAX_PRO_LAUF);
  } catch (e) {
    const fehler = e instanceof Error ? e.message.slice(0, 300) : String(e);
    await prisma.leadSyncState.upsert({
      where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } },
      create: { organizationId: ctx.organizationId, quelle: QUELLE, lastRunAt: jetzt, lastError: fehler },
      update: { lastRunAt: jetzt, lastError: fehler },
    });
    return { status: "fehler", angelegt: 0, uebersprungen: [], fehler };
  }

  const neue = waehleNeueLeads(leads, state.syncedUntil, MAX_PRO_LAUF);
  const uebersprungen: string[] = [];
  let angelegt = 0;
  let letzteZeit: Date | null = null;

  for (const roh of neue) {
    letzteZeit = new Date(roh.createdAt!);
    try {
      const dto = await client.fetchVorgang(roh.id);
      const ergebnis = await createCaseFromCanonical(ctx, finlinkToCanonical(dto));
      if (ergebnis.deduped) continue;

      const { quelle, detail } = leiteQuelleAb(roh);
      await prisma.case.update({
        where: { id: ergebnis.caseId },
        data: {
          quelle,
          quelleDetail: detail,
          einwilligungKontakt: roh.einwilligungKontakt,
          einwilligungMarketing: roh.einwilligungMarketing,
        },
      });
      angelegt += 1;
    } catch (e) {
      console.warn(
        `[finlink-sync] Lead ${roh.id} übersprungen: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`
      );
      uebersprungen.push(roh.id);
    }
  }

  await prisma.leadSyncState.upsert({
    where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } },
    create: {
      organizationId: ctx.organizationId,
      quelle: QUELLE,
      syncedUntil: letzteZeit ?? state.syncedUntil,
      lastRunAt: jetzt,
      lastCreated: angelegt,
    },
    update: {
      ...(letzteZeit ? { syncedUntil: letzteZeit } : {}),
      lastRunAt: jetzt,
      lastCreated: angelegt,
      lastError: null,
    },
  });

  if (angelegt > 0) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "case.created",
      entityType: "organization",
      entityId: ctx.organizationId,
      metadata: { quelle: QUELLE, angelegt, uebersprungen: uebersprungen.length },
    });
  }

  return { status: "ok", angelegt, uebersprungen };
}
```

- [ ] **Step 4: Test, Typecheck, Commit**

Run: `npx vitest run tests/finlink-sync.test.ts && npm run typecheck`
Expected: PASS (7 Tests), keine Ausgabe.

```bash
git add src/lib/platforms/finlink/sync.ts tests/finlink-sync.test.ts
git commit -m "feat(lead-eingang): Abgleich mit Wasserstandsmarke und Fehlerbuchfuehrung"
```

---

### Task 4: Cron-Einstieg und Knopf „Jetzt abgleichen"

**Files:**
- Create: `src/app/api/cron/finlink-leads/route.ts`
- Create: `src/lib/actions/lead-sync.ts`
- Modify: `vercel.json`
- Test: `tests/finlink-cron.test.ts` (neu)

**Interfaces:**
- Consumes: `syncFinLinkLeads` (Task 3).
- Produces: `gleicheLeadsAb(): Promise<SyncErgebnis>` als Server Action.

- [ ] **Step 1: Test schreiben**

Create `tests/finlink-cron.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getEnv = vi.fn();
vi.mock("@/lib/env", () => ({ getEnv: () => getEnv() }));

const sync = vi.fn();
vi.mock("@/lib/platforms/finlink/sync", () => ({
  syncFinLinkLeads: (...a: unknown[]) => sync(...a),
}));

const organizationFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { organization: { findMany: (...a: unknown[]) => organizationFindMany(...a) } },
}));

import { GET } from "@/app/api/cron/finlink-leads/route";

function anfrage(header?: string): Request {
  return new Request("https://baufidesk.de/api/cron/finlink-leads", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  [getEnv, sync, organizationFindMany].forEach((m) => m.mockReset());
  getEnv.mockReturnValue({ CRON_SECRET: "geheim" });
  organizationFindMany.mockResolvedValue([{ id: "org-A" }]);
  sync.mockResolvedValue({ status: "ok", angelegt: 2, uebersprungen: [] });
});

describe("Cron /api/cron/finlink-leads", () => {
  it("weist eine Anfrage ohne Geheimnis mit 401 ab", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage() as any);
    expect(res.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("weist ein falsches Geheimnis ab", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer falsch") as any);
    expect(res.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("antwortet 503, wenn CRON_SECRET gar nicht gesetzt ist", async () => {
    getEnv.mockReturnValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(503);
  });

  it("gleicht jede Organisation ab und meldet die Summe", async () => {
    organizationFindMany.mockResolvedValue([{ id: "org-A" }, { id: "org-B" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    expect(sync).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.angelegt).toBe(4);
  });

  it("lässt einen Fehler in einer Organisation die anderen nicht kippen", async () => {
    organizationFindMany.mockResolvedValue([{ id: "org-A" }, { id: "org-B" }]);
    sync.mockImplementation(async (ctx: { organizationId: string }) => {
      if (ctx.organizationId === "org-A") throw new Error("kaputt");
      return { status: "ok", angelegt: 1, uebersprungen: [] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.angelegt).toBe(1);
    expect(body.fehler).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/finlink-cron.test.ts`
Expected: FAIL — Modul `@/app/api/cron/finlink-leads/route` fehlt.

- [ ] **Step 3: Cron-Route schreiben**

Create `src/app/api/cron/finlink-leads/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { syncFinLinkLeads } from "@/lib/platforms/finlink/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Holt alle 15 Minuten neue FinLink-Leads und legt daraus Fälle an.
 *
 * Absicherung wie bei den übrigen Cron-Routen: nur mit gesetztem CRON_SECRET
 * und passendem Bearer-Header (Vercel-Cron liefert ihn automatisch).
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: "CRON_SECRET nicht gesetzt" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let angelegt = 0;
  let fehler = 0;

  for (const org of orgs) {
    try {
      // userId leer: Der Lauf gehört keinem Menschen, das Audit hält das fest.
      const r = await syncFinLinkLeads({ organizationId: org.id, userId: "" });
      angelegt += r.angelegt;
      if (r.status === "fehler") fehler += 1;
    } catch (e) {
      // Eine kaputte Organisation darf die anderen nicht mitreißen.
      console.error(`[finlink-cron] Organisation ${org.id} fehlgeschlagen:`, e);
      fehler += 1;
    }
  }

  return NextResponse.json({ ok: true, organisationen: orgs.length, angelegt, fehler });
}
```

- [ ] **Step 4: Server Action für den Knopf**

Create `src/lib/actions/lead-sync.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { syncFinLinkLeads, type SyncErgebnis } from "@/lib/platforms/finlink/sync";

/** „Jetzt abgleichen" – derselbe Lauf wie der Cron, nur von Hand ausgelöst. */
export async function gleicheLeadsAb(): Promise<SyncErgebnis> {
  const ctx = await requireContext();
  const ergebnis = await syncFinLinkLeads({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  revalidatePath("/pipeline");
  return ergebnis;
}
```

- [ ] **Step 5: Cron eintragen**

In `vercel.json` bei den vorhandenen `crons` ergänzen:

```json
    { "path": "/api/cron/finlink-leads", "schedule": "*/15 * * * *" }
```

- [ ] **Step 6: Test, Typecheck, Commit**

Run: `npx vitest run tests/finlink-cron.test.ts && npm run typecheck`
Expected: PASS (5 Tests), keine Ausgabe.

```bash
git add src/app/api/cron/finlink-leads src/lib/actions/lead-sync.ts vercel.json tests/finlink-cron.test.ts
git commit -m "feat(lead-eingang): Cron alle 15 Minuten und Knopf zum Abgleichen"
```

---

### Task 5: Oberfläche

**Files:**
- Create: `src/components/pipeline/sync-status.tsx`
- Modify: `src/app/(app)/pipeline/page.tsx`
- Modify: `src/components/pipeline/lead-board.tsx`
- Modify: `src/lib/cases/lead-board.ts` (`BoardKarte` um `quelle`)
- Modify: `tests/lead-board.test.ts` (Testhelfer nachziehen)
- Modify: `src/app/(app)/cases/[id]/page.tsx`
- Modify: `src/lib/cases/dashboard.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `gleicheLeadsAb` (Task 4), `LEAD_SOURCE_LABELS` (Task 1).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Statuszeile schreiben**

Create `src/components/pipeline/sync-status.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gleicheLeadsAb } from "@/lib/actions/lead-sync";

/**
 * Zeigt, wann zuletzt abgeglichen wurde – und vor allem, wenn es scheiterte.
 * Ohne diese Zeile fällt ein kaputter Zugang erst auf, wenn tagelang nichts
 * mehr hereinkommt.
 */
export function SyncStatus({
  zuletzt,
  angelegt,
  fehler,
}: {
  /** Fertig formatiert, z. B. "vor 4 Minuten" oder "noch nie". */
  zuletzt: string;
  angelegt: number;
  fehler: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
      <div className={fehler ? "flex items-center gap-1.5 text-destructive" : "text-muted-foreground"}>
        {fehler ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Letzter Abgleich fehlgeschlagen: {fehler}</span>
          </>
        ) : (
          <span>
            Zuletzt abgeglichen {zuletzt}
            {angelegt > 0 && ` · ${angelegt} neue${angelegt === 1 ? "r Lead" : " Leads"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {meldung && <span className="text-muted-foreground">{meldung}</span>}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await gleicheLeadsAb();
              setMeldung(
                r.status === "nicht_konfiguriert"
                  ? "FinLink ist nicht verbunden."
                  : r.status === "fehler"
                    ? `Fehlgeschlagen: ${r.fehler ?? "unbekannt"}`
                    : `${r.angelegt} neue Leads`
              );
            })
          }
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${pending ? "animate-spin" : ""}`} />
          Jetzt abgleichen
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Quelle auf die Karte**

In `src/components/pipeline/lead-board.tsx` das Kartenmodell erweitern:

```tsx
export interface BoardKarteView {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  volumen: number | null;
  leadPhase: string;
  liegezeit: number;
  wiedervorlage: string | null;
  verlorenGrund: string | null;
  vorschlag: string | null;
  /** Anzeigename der Quelle, z. B. "ImmoScout24". */
  quelle: string;
}
```

Auf der Karte, direkt unter der Zeile mit Volumen und Liegezeit:

```tsx
                  <p className="text-xs text-muted-foreground">{k.quelle}</p>
```

**Achtung, das bricht bestehende Tests:** `BoardKarte` in
`src/lib/cases/lead-board.ts` bekommt ebenfalls ein Pflichtfeld `quelle: string`
— damit schlägt der Testhelfer in `tests/lead-board.test.ts` fehl. Dort die
Vorgabe ergänzen, **nicht** das Feld optional machen (eine Karte ohne Quelle
gibt es nicht; optional hieße, die Anzeige müsste raten):

```ts
function karte(over: Partial<BoardKarte> = {}): BoardKarte {
  return {
    caseId: "c1",
    caseNumber: "UP-2026-0001",
    kundenName: "Muster",
    volumen: 300000,
    quelle: "ImmoScout24",
    leadPhase: "neu",
    // … restliche Felder unverändert
    ...over,
  };
}
```

Run: `npx vitest run tests/lead-board.test.ts`
Expected: PASS (7 Tests) — vorher schlägt der Typecheck fehl.

- [ ] **Step 3: Pipeline-Seite ergänzen**

In `src/app/(app)/pipeline/page.tsx`:

Importe:

```tsx
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/domain/enums";
import { SyncStatus } from "@/components/pipeline/sync-status";
```

Die Board-Abfrage um `quelle` erweitern (bei den übrigen `select`-Feldern):

```tsx
      quelle: true,
```

In `alsView` je Karte ergänzen — dafür trägt `BoardKarte` das Feld mit; erweitere
in `src/lib/cases/lead-board.ts` das Interface `BoardKarte` um `quelle: string`
und reiche es in `boardKarten` durch:

```tsx
    quelle: LEAD_SOURCE_LABELS[c.quelle as LeadSource],
```

Zustand des Abgleichs laden (in der bestehenden `Promise.all`-Kette oder
direkt darunter):

```tsx
  const syncState = await prisma.leadSyncState.findUnique({
    where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: "finlink" } },
    select: { lastRunAt: true, lastCreated: true, lastError: true },
  });

  const zuletzt = syncState?.lastRunAt
    ? `vor ${Math.max(0, Math.round((jetzt.getTime() - syncState.lastRunAt.getTime()) / 60000))} Minuten`
    : "noch nie";

  // Quellen-Zähler über alle nicht verlorenen Karten.
  const quellenZaehler = new Map<string, number>();
  for (const k of boardKarten) {
    if (k.verlorenAm) continue;
    quellenZaehler.set(k.quelle, (quellenZaehler.get(k.quelle) ?? 0) + 1);
  }
```

Im JSX, in der Kanban-Karte über dem Board:

```tsx
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {[...quellenZaehler.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([quelle, anzahl]) => (
                <span key={quelle} className="rounded-full border px-2 py-0.5">
                  {quelle} {anzahl}
                </span>
              ))}
          </div>
```

Und unter dem Board, innerhalb derselben Karte:

```tsx
          <SyncStatus
            zuletzt={zuletzt}
            angelegt={syncState?.lastCreated ?? 0}
            fehler={syncState?.lastError ?? null}
          />
```

- [ ] **Step 4: Quelle und Einwilligung auf der Fallseite**

In `src/app/(app)/cases/[id]/page.tsx` im Kopfbereich, neben der Phasenauswahl:

```tsx
              <Badge variant="neutral">{LEAD_SOURCE_LABELS[caseRow.quelle as LeadSource]}</Badge>
              <Badge variant={caseRow.einwilligungKontakt === true ? "success" : "neutral"}>
                Telefon:{" "}
                {caseRow.einwilligungKontakt === true
                  ? "erlaubt"
                  : caseRow.einwilligungKontakt === false
                    ? "nicht erlaubt"
                    : "keine Angabe"}
              </Badge>
```

Mit dem Import:

```tsx
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/domain/enums";
```

- [ ] **Step 5: Kennzahl im Dashboard**

In `src/lib/cases/dashboard.ts` die Kennzahlen um einen Eintrag erweitern. Bei
den übrigen Zählungen ergänzen:

```ts
  const neueLeads = await prisma.case.count({
    where: {
      organizationId: ctx.organizationId,
      createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      quelle: { not: "manuell" },
    },
  });
```

Im `kpis`-Objekt ergänzen: `neueLeads,` — und im Interface `DashboardData` bei
den übrigen Kennzahlen `neueLeads: number;`. Die Dashboard-Seite zeigt sie mit
einer `MetricCard` wie die vorhandenen:

```tsx
        <MetricCard label="Neue Leads (7 Tage)" value={data.kpis.neueLeads} icon={UserPlus} />
```

- [ ] **Step 6: Typecheck, Tests, Build**

Run: `npm run typecheck && npm test && npm run build`
Expected: keine Ausgabe, alle Tests grün, Build „Compiled successfully".

- [ ] **Step 7: Committen**

```bash
git add src/components/pipeline "src/app/(app)/pipeline/page.tsx" "src/app/(app)/cases/[id]/page.tsx" src/lib/cases/lead-board.ts src/lib/cases/dashboard.ts "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(lead-eingang): Quelle auf Karte und Fallseite, Statuszeile, Kennzahl"
```

---

### Task 6: Integrationstest, manuelle Anlage und Rollout

**Files:**
- Modify: `src/lib/actions/cases.ts` (`createCase` setzt `quelle: "manuell"`)
- Create: `tests/lead-eingang-db.test.ts`

**Interfaces:**
- Consumes: alles Vorherige.

- [ ] **Step 1: Manuelle Anlage kennzeichnen**

In `src/lib/actions/cases.ts` in `createCase` beim `prisma.case.create` ergänzen:

```ts
      // Damit "manuell" kein toter Buchstabe bleibt: Bestandsfälle behalten
      // "unbekannt", ab jetzt angelegte tragen ihre Herkunft.
      quelle: "manuell",
```

- [ ] **Step 2: Integrationstest schreiben**

Create `tests/lead-eingang-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Zwei Läufe hintereinander gegen das echte Schema: Der zweite darf nichts
 * doppelt anlegen.
 *   RUN_DB_IT=1 npx vitest run tests/lead-eingang-db.test.ts
 */
describe.runIf(RUN)("Lead-Eingang (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;

  const lead = {
    id: "L-1",
    createdAt: "2026-08-07T12:00:00Z",
    sourceType: "ImmoscoutLead",
    source: null,
    einwilligungKontakt: true,
    einwilligungMarketing: null,
  };

  const client = {
    fetchLeadsPage: async () => [lead],
    fetchVorgang: async () => ({
      id: "L-1",
      antragsteller: [{ vorname: "Test", nachname: "Person" }],
    }),
    listLeads: async () => [],
  };

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
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-le" } });
    orgId = org.id;
    // Marke vor dem Lead setzen, damit er als neu gilt.
    await prisma.leadSyncState.create({
      data: { organizationId: orgId, quelle: "finlink", syncedUntil: new Date("2026-08-07T00:00:00Z") },
    });
  }, 180_000);

  it("legt den Lead als Fall in Phase 'neu' mit Quelle an", async () => {
    const { syncFinLinkLeads } = await import("@/lib/platforms/finlink/sync");
    const r = await syncFinLinkLeads({ organizationId: orgId, userId: "u1" }, { client });
    expect(r.status).toBe("ok");
    expect(r.angelegt).toBe(1);

    const fall = await prisma.case.findFirst({ where: { organizationId: orgId } });
    expect(fall.quelle).toBe("immoscout24");
    expect(fall.quelleDetail).toBe("ImmoscoutLead");
    expect(fall.einwilligungKontakt).toBe(true);
    expect(fall.leadPhase).toBe("neu");

    const state = await prisma.leadSyncState.findFirst({ where: { organizationId: orgId } });
    expect(state.syncedUntil.toISOString()).toBe("2026-08-07T12:00:00.000Z");
  }, 60_000);

  it("legt beim zweiten Lauf nichts doppelt an", async () => {
    const { syncFinLinkLeads } = await import("@/lib/platforms/finlink/sync");
    const r = await syncFinLinkLeads({ organizationId: orgId, userId: "u1" }, { client });
    expect(r.angelegt).toBe(0);
    expect(await prisma.case.count({ where: { organizationId: orgId } })).toBe(1);
  }, 60_000);
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/lead-eingang-db.test.ts`
Expected: PASS.

Ohne `RUN_DB_IT=1`: „skipped".

- [ ] **Step 4: Volle Suite, Typecheck, Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün.

- [ ] **Step 5: Committen**

```bash
git add src/lib/actions/cases.ts tests/lead-eingang-db.test.ts
git commit -m "feat(lead-eingang): manuelle Anlage kennzeichnen, Integrationstest"
```

- [ ] **Step 6: Schema in die Datenbank bringen**

**Nur nach ausdrücklicher Freigabe** — gegen die Produktionsdatenbank:

Run: `npm run db:push`
Gegenprüfen: `npx prisma db pull --print | grep -E "quelle|lead_sync_states|einwilligung"`

- [ ] **Step 7: Deployen und ersten Lauf prüfen**

Nach Freigabe: `git push`, Vercel-Build abwarten, `vercel ls --prod` prüfen.

Danach den ersten Lauf **von Hand** auslösen (Knopf „Jetzt abgleichen" auf
`/pipeline`). Erwartung: „0 neue Leads", weil der erste Lauf nur den Stichtag
setzt. In der Datenbank prüfen, dass `lead_sync_states` einen Eintrag mit
gesetztem `syncedUntil` hat.

Den zweiten Lauf übernimmt der Cron. Ob er greift, zeigt die Statuszeile unter
dem Board („Zuletzt abgeglichen vor n Minuten"). Behauptungen über den
Live-Stand erst nach dieser Sichtprüfung (siehe `verify-deployed-claims`).

---

## Offene Punkte für später

- Mail-Weg für vergleich.de (eigenes Projekt).
- Bei FinLink erfragen, ob die Partner-API Webhooks anbietet.
- `CASE_SOURCE_TYPES` in `enums.ts` ist weiterhin totes Inventar — entfernen
  oder mit `LeadSource` zusammenführen.
- Weitere Felder aus `extras_meta` (`reachability_time`, `source_landing_page`).
