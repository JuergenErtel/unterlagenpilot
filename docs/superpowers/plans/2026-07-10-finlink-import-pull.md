# FinLink-Import (Pull) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen bestehenden FinLink-Vorgang per Vorgangs-ID in einen neuen BaufiDesk-Fall (Antragsteller-Stammdaten, Beschäftigung/Einkommen-Basics, Objekt, Finanzierungseckdaten) übernehmen.

**Architecture:** Eine isolierte „Naht" zur (noch unbekannten) FinLink-API: `FinLinkClient.fetchVorgang(id)` liefert ein typisiertes, Zod-validiertes `FinLinkVorgangDTO`; die reine Funktion `finlinkToCanonical(dto)` mappt in das kanonische Modell; `createCaseFromCanonical(ctx, canonical)` schreibt den Fall in einer Prisma-Transaktion. `FinLinkConnector.importCaseById` orchestriert alles und ersetzt den bisherigen Stub. Die Import-Seite aktiviert das vorhandene Vorgangs-ID-Feld.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Prisma, Zod, Vitest (+ PGlite für DB-Integrationstests).

## Global Constraints

- **Manuelle Freigabe gewahrt:** Der Pull macht KEINEN Outbound-Call und sendet nichts nach außen; er legt nur einen lokalen Fall an.
- **Mandantentrennung:** Jeder importierte Fall gehört der Organisation des angemeldeten Vermittlers (`requireContext()` aus `@/lib/auth/context`).
- **Secrets nie loggen:** `FINLINK_API_KEY` erscheint nie in Logs/Sentry/Fehlermeldungen.
- **Keine erratenen Endpunkte in Tests:** Kein Test macht einen echten Netzwerk-Call; `FinLinkClient` wird gemockt.
- **DTO ist provisorisch:** Die konkrete FinLink-Feldstruktur ist bis zum Vorliegen der API-Doku + Beispiel-JSON eine fundierte Annahme. Nur `dto.ts`/`client.ts` werden später an das reale Schema angepasst; Mapping/Writer/Connector/UI bleiben stabil.
- **Kein Raten von Werten:** Nicht gelieferte Felder bleiben leer/undefined; unbekannte Enum-Werte werden zu `undefined` gemappt (keine Default-Erfindung).
- **Dedup über vorhandenes Feld:** `Case.finlinkId` (existiert bereits) dient als externe ID + Herkunftsmarker. KEINE Prisma-Migration.

**Kanonische Zieltypen** (aus `@/lib/domain/canonical`): `CanonicalCase`, `CanonicalApplicant`, `CanonicalEmployment`, `CanonicalIncome`, `CanonicalProperty`, `CanonicalFinancing`.

**Kanonische Enums** (aus `@/lib/domain/enums`), gültige Werte:
- `MaritalStatus`: `ledig | verheiratet | geschieden | verwitwet | eingetragene_partnerschaft | getrennt_lebend`
- `EmploymentType`: `angestellter | selbststaendiger | beamter | rentner | geschaeftsfuehrer | gesellschafter | sonstiges`
- `PropertyType`: `einfamilienhaus | doppelhaushaelfte | reihenhaus | eigentumswohnung | mehrfamilienhaus | grundstueck | gewerbe | sonstiges`
- `FinancingType`: `kauf | neubau | anschlussfinanzierung | umschuldung | modernisierung | kapitalbeschaffung`

**Testlauf-Befehle:**
- Unit: `npm run test -- <pfad>`
- DB-Integration (PGlite): `RUN_DB_IT=1 npm run test -- tests/finlink-case-writer.test.ts`
- Typecheck: `npm run typecheck`

---

## File Structure

- `src/lib/platforms/finlink/dto.ts` (neu) — Zod-Schema + Typ `FinLinkVorgangDTO`.
- `src/lib/platforms/finlink/mapping.ts` (neu) — reine Funktion `finlinkToCanonical`.
- `src/lib/platforms/finlink/client.ts` (neu) — `FinLinkClient` (HTTP-Naht + Auth).
- `src/lib/platforms/case-writer.ts` (neu) — `createCaseFromCanonical` + Dedup.
- `src/lib/platforms/connectors.ts` (ändern) — `FinLinkConnector.importCaseById` verdrahten.
- `src/lib/actions/finlink.ts` (neu) — Server-Action `importFromFinLink`.
- `src/app/(app)/cases/import/page.tsx` (ändern) — Feld/Submit aktivieren, Fehleranzeige.
- `src/lib/env.ts` + `.env.example` — bereits vorhandene `FINLINK_BASE_URL`/`FINLINK_API_KEY` dokumentieren (nur ergänzen falls fehlen).
- Tests: `tests/finlink-dto.test.ts`, `tests/finlink-mapping.test.ts`, `tests/finlink-case-writer.test.ts`, `tests/finlink-connector.test.ts`, `tests/finlink-action.test.ts`.

---

## Task 1: FinLink-DTO + Zod-Schema

**Files:**
- Create: `src/lib/platforms/finlink/dto.ts`
- Test: `tests/finlink-dto.test.ts`

**Interfaces:**
- Produces: `finlinkVorgangSchema` (Zod), `type FinLinkVorgangDTO = z.infer<typeof finlinkVorgangSchema>`, `parseFinLinkVorgang(input: unknown): FinLinkVorgangDTO` (wirft `ZodError` bei ungültig).

- [ ] **Step 1: Write the failing test**

```ts
// tests/finlink-dto.test.ts
import { describe, it, expect } from "vitest";
import { parseFinLinkVorgang } from "@/lib/platforms/finlink/dto";

const valid = {
  id: "FL-2026-04821",
  antragsteller: [
    {
      vorname: "Anna",
      nachname: "Muster",
      geburtsdatum: "1985-04-12",
      familienstand: "verheiratet",
      email: "anna@example.com",
      beschaeftigung: { art: "angestellter", arbeitgeber: "ACME GmbH" },
      einkommen: { nettoMonatlich: 3200 },
    },
  ],
  objekt: { art: "eigentumswohnung", ort: "Karlsruhe" },
  finanzierung: { art: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
};

describe("parseFinLinkVorgang", () => {
  it("akzeptiert einen vollständigen Vorgang", () => {
    const dto = parseFinLinkVorgang(valid);
    expect(dto.id).toBe("FL-2026-04821");
    expect(dto.antragsteller[0]?.vorname).toBe("Anna");
  });

  it("akzeptiert einen minimalen Vorgang (nur id + leere Antragstellerliste)", () => {
    const dto = parseFinLinkVorgang({ id: "FL-1", antragsteller: [] });
    expect(dto.antragsteller).toHaveLength(0);
  });

  it("lehnt einen Vorgang ohne id ab", () => {
    expect(() => parseFinLinkVorgang({ antragsteller: [] })).toThrow();
  });

  it("lehnt einen falschen Typ für kaufpreis ab", () => {
    expect(() =>
      parseFinLinkVorgang({ id: "x", antragsteller: [], finanzierung: { kaufpreis: "viel" } })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/finlink-dto.test.ts`
Expected: FAIL (`Cannot find module '@/lib/platforms/finlink/dto'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/platforms/finlink/dto.ts
import { z } from "zod";

/**
 * PROVISORISCHES FinLink-Vorgangs-Schema.
 *
 * Die reale FinLink-API-Struktur liegt noch nicht vor (Doku/Beispiel-JSON
 * ausstehend). Diese Form ist eine fundierte Annahme, damit Mapping, Writer,
 * Connector und UI jetzt gebaut und getestet werden können. Beim Vorliegen des
 * echten Schemas wird NUR diese Datei (+ client.ts) angepasst.
 *
 * Grundsätze: alles außer `id` optional; unbekannte Felder werden ignoriert
 * (kein `.strict()`), damit ein erweiterter Payload nicht bricht.
 */
const beschaeftigung = z
  .object({
    art: z.string().optional(),
    beruf: z.string().optional(),
    arbeitgeber: z.string().optional(),
  })
  .optional();

const einkommen = z
  .object({
    nettoMonatlich: z.number().optional(),
    bruttoMonatlich: z.number().optional(),
  })
  .optional();

const antragsteller = z.object({
  vorname: z.string().optional(),
  nachname: z.string().optional(),
  geburtsdatum: z.string().optional(), // ISO yyyy-mm-dd
  geburtsort: z.string().optional(),
  staatsangehoerigkeit: z.string().optional(),
  familienstand: z.string().optional(),
  anzahlKinder: z.number().int().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  beschaeftigung,
  einkommen,
});

const objekt = z
  .object({
    art: z.string().optional(),
    strasse: z.string().optional(),
    plz: z.string().optional(),
    ort: z.string().optional(),
  })
  .optional();

const finanzierung = z
  .object({
    art: z.string().optional(),
    kaufpreis: z.number().optional(),
    darlehenswunsch: z.number().optional(),
  })
  .optional();

export const finlinkVorgangSchema = z.object({
  id: z.string().min(1),
  antragsteller: z.array(antragsteller).default([]),
  objekt,
  finanzierung,
});

export type FinLinkVorgangDTO = z.infer<typeof finlinkVorgangSchema>;

/** Validiert einen rohen FinLink-Payload; wirft ZodError bei ungültig. */
export function parseFinLinkVorgang(input: unknown): FinLinkVorgangDTO {
  return finlinkVorgangSchema.parse(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/finlink-dto.test.ts`
Expected: PASS (4 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms/finlink/dto.ts tests/finlink-dto.test.ts
git commit -m "feat(finlink): provisorisches Vorgangs-DTO + Zod-Schema"
```

---

## Task 2: Mapping FinLink-DTO → kanonisches Modell

**Files:**
- Create: `src/lib/platforms/finlink/mapping.ts`
- Test: `tests/finlink-mapping.test.ts`

**Interfaces:**
- Consumes: `FinLinkVorgangDTO` aus Task 1; `CanonicalCase` aus `@/lib/domain/canonical`.
- Produces: `finlinkToCanonical(dto: FinLinkVorgangDTO): CanonicalCase`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/finlink-mapping.test.ts
import { describe, it, expect } from "vitest";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import type { FinLinkVorgangDTO } from "@/lib/platforms/finlink/dto";

const full: FinLinkVorgangDTO = {
  id: "FL-2026-04821",
  antragsteller: [
    {
      vorname: "Anna", nachname: "Muster", geburtsdatum: "1985-04-12",
      familienstand: "verheiratet", email: "anna@example.com", anzahlKinder: 2,
      beschaeftigung: { art: "angestellter", beruf: "Ingenieurin", arbeitgeber: "ACME GmbH" },
      einkommen: { nettoMonatlich: 3200, bruttoMonatlich: 5200 },
    },
    { vorname: "Ben", nachname: "Muster", familienstand: "verheiratet" },
  ],
  objekt: { art: "eigentumswohnung", ort: "Karlsruhe", plz: "76131" },
  finanzierung: { art: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
};

describe("finlinkToCanonical", () => {
  it("mappt Antragsteller mit fortlaufender Position", () => {
    const c = finlinkToCanonical(full);
    expect(c.applicants).toHaveLength(2);
    expect(c.applicants[0]).toMatchObject({ position: 1, vorname: "Anna", nachname: "Muster" });
    expect(c.applicants[1]).toMatchObject({ position: 2, vorname: "Ben" });
    expect(c.applicants[0]?.familienstand).toBe("verheiratet");
    expect(c.applicants[0]?.anzahlKinder).toBe(2);
  });

  it("mappt Beschäftigung/Einkommen mit applicantPosition", () => {
    const c = finlinkToCanonical(full);
    expect(c.employment[0]).toMatchObject({ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME GmbH" });
    expect(c.income[0]).toMatchObject({ applicantPosition: 1, nettoMonatlich: 3200, bruttoMonatlich: 5200 });
  });

  it("mappt Objekt und Finanzierung", () => {
    const c = finlinkToCanonical(full);
    expect(c.property).toMatchObject({ objektart: "eigentumswohnung", ort: "Karlsruhe", plz: "76131" });
    expect(c.financing).toMatchObject({ finanzierungsart: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 });
    expect(c.platformIds.finlinkId).toBe("FL-2026-04821");
  });

  it("mappt unbekannte Enum-Werte zu undefined (kein Raten)", () => {
    const c = finlinkToCanonical({ id: "x", antragsteller: [{ familienstand: "kompliziert" }], objekt: { art: "villa" } });
    expect(c.applicants[0]?.familienstand).toBeUndefined();
    expect(c.property?.objektart).toBeUndefined();
  });

  it("lässt fehlende Felder leer und erzeugt keine leeren Objekt/Beschäftigungseinträge", () => {
    const c = finlinkToCanonical({ id: "x", antragsteller: [{ vorname: "Nur" }] });
    expect(c.employment).toHaveLength(0);
    expect(c.income).toHaveLength(0);
    expect(c.property).toBeUndefined();
    expect(c.applicants[0]?.email).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/finlink-mapping.test.ts`
Expected: FAIL (`Cannot find module '@/lib/platforms/finlink/mapping'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/platforms/finlink/mapping.ts
import type { FinLinkVorgangDTO } from "./dto";
import type {
  CanonicalCase,
  CanonicalApplicant,
  CanonicalEmployment,
  CanonicalIncome,
  CanonicalProperty,
} from "@/lib/domain/canonical";
import {
  MARITAL_STATUSES,
  EMPLOYMENT_TYPES,
  PROPERTY_TYPES,
  FINANCING_TYPES,
  type MaritalStatus,
  type EmploymentType,
  type PropertyType,
  type FinancingType,
} from "@/lib/domain/enums";

/**
 * Übersetzt einen FinLink-String in einen kanonischen Enum-Wert.
 * Unbekannte Werte -> undefined (kein Raten). Die konkrete FinLink-Vokabel
 * ist provisorisch: hier wird case-insensitiv gegen die kanonischen Werte
 * geprüft. Beim Vorliegen der echten FinLink-Werte werden hier gezielt
 * Aliase ergänzt (z.B. { "married": "verheiratet" }).
 */
function toEnum<T extends string>(allowed: readonly T[], raw: string | undefined): T | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === norm);
}

export function finlinkToCanonical(dto: FinLinkVorgangDTO): CanonicalCase {
  const applicants: CanonicalApplicant[] = dto.antragsteller.map((a, i) => ({
    position: i + 1,
    vorname: a.vorname,
    nachname: a.nachname,
    geburtsdatum: a.geburtsdatum,
    geburtsort: a.geburtsort,
    staatsangehoerigkeit: a.staatsangehoerigkeit,
    familienstand: toEnum<MaritalStatus>(MARITAL_STATUSES, a.familienstand),
    anzahlKinder: a.anzahlKinder,
    strasse: a.strasse,
    plz: a.plz,
    ort: a.ort,
    email: a.email,
    telefon: a.telefon,
  }));

  const employment: CanonicalEmployment[] = [];
  const income: CanonicalIncome[] = [];
  dto.antragsteller.forEach((a, i) => {
    const b = a.beschaeftigung;
    if (b && (b.art || b.beruf || b.arbeitgeber)) {
      employment.push({
        applicantPosition: i + 1,
        beschaeftigungsart: toEnum<EmploymentType>(EMPLOYMENT_TYPES, b.art),
        beruf: b.beruf,
        arbeitgeber: b.arbeitgeber,
      });
    }
    const e = a.einkommen;
    if (e && (e.nettoMonatlich != null || e.bruttoMonatlich != null)) {
      income.push({
        applicantPosition: i + 1,
        nettoMonatlich: e.nettoMonatlich,
        bruttoMonatlich: e.bruttoMonatlich,
      });
    }
  });

  const o = dto.objekt;
  const property: CanonicalProperty | undefined =
    o && (o.art || o.strasse || o.plz || o.ort)
      ? {
          objektart: toEnum<PropertyType>(PROPERTY_TYPES, o.art),
          strasse: o.strasse,
          plz: o.plz,
          ort: o.ort,
        }
      : undefined;

  const f = dto.finanzierung;
  const finanzierungsart = toEnum<FinancingType>(FINANCING_TYPES, f?.art);

  return {
    caseNumber: "", // wird beim Anlegen vergeben (case-writer)
    financingType: finanzierungsart,
    applicants,
    employment,
    income,
    liabilities: [],
    assets: [],
    property,
    financing: {
      finanzierungsart,
      kaufpreis: f?.kaufpreis,
      darlehenswunsch: f?.darlehenswunsch,
    },
    platformIds: { finlinkId: dto.id },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/finlink-mapping.test.ts`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms/finlink/mapping.ts tests/finlink-mapping.test.ts
git commit -m "feat(finlink): Mapping FinLink-Vorgang -> kanonisches Modell"
```

---

## Task 3: createCaseFromCanonical + Dedup (DB)

**Files:**
- Create: `src/lib/platforms/case-writer.ts`
- Test: `tests/finlink-case-writer.test.ts` (PGlite-Integration, `RUN_DB_IT=1`)

**Interfaces:**
- Consumes: `CanonicalCase` (`@/lib/domain/canonical`), `prisma` (`@/lib/db`), Fallnummer-Helfer (`@/lib/cases/case-number`).
- Produces:
  - `type WriteContext = { organizationId: string; userId: string }`
  - `type WriteResult = { caseId: string; caseNumber: string; deduped: boolean }`
  - `createCaseFromCanonical(ctx: WriteContext, canonical: CanonicalCase): Promise<WriteResult>` — legt bei neuem `finlinkId` einen Fall an; existiert bereits einer mit (`organizationId`, `finlinkId`), wird dessen `{caseId, caseNumber, deduped: true}` zurückgegeben (kein zweiter Fall).

- [ ] **Step 1: Write the failing test**

```ts
// tests/finlink-case-writer.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe.runIf(RUN)("createCaseFromCanonical (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let userId: string;

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
    const adapter = new PrismaPGlite(pg as any);
    prisma = new PrismaClient({ adapter } as any);
    g.prisma = prisma; // Injektion für @/lib/db-Singleton (vor erstem Import von @/lib/db)

    const org = await prisma.organization.create({ data: { name: "Testorg" } });
    orgId = org.id;
    const user = await prisma.user.create({
      data: { organizationId: orgId, name: "Tester", email: "t@example.com", role: "vermittler", active: true },
    });
    userId = user.id;
  });

  it("legt einen Fall mit Antragstellern, Objekt und Finanzierung an", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const res = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        financingType: "kauf",
        applicants: [{ position: 1, vorname: "Anna", nachname: "Muster", familienstand: "verheiratet" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME" }],
        income: [{ applicantPosition: 1, nettoMonatlich: 3200 }],
        liabilities: [],
        assets: [],
        property: { objektart: "eigentumswohnung", ort: "Karlsruhe" },
        financing: { finanzierungsart: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
        platformIds: { finlinkId: "FL-1" },
      }
    );
    expect(res.deduped).toBe(false);
    expect(res.caseNumber).toMatch(/^UP-\d{4}-\d{4}$/);

    const row = await prisma.case.findUnique({
      where: { id: res.caseId },
      include: { applicants: { include: { employment: true, income: true } }, property: true, financingRequest: true },
    });
    expect(row.finlinkId).toBe("FL-1");
    expect(row.organizationId).toBe(orgId);
    expect(row.applicants).toHaveLength(1);
    expect(row.applicants[0].employment[0].arbeitgeber).toBe("ACME");
    expect(row.applicants[0].income[0].nettoMonatlich).toBe(3200);
    expect(row.property.objektart).toBe("eigentumswohnung");
    expect(row.financingRequest.kaufpreis).toBe(450000);
  });

  it("dedupliziert bei gleicher finlinkId in derselben Organisation", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const base = {
      caseNumber: "", applicants: [{ position: 1, vorname: "Dup" }],
      employment: [], income: [], liabilities: [], assets: [],
      financing: {}, platformIds: { finlinkId: "FL-DUP" },
    } as const;
    const first = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    const second = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    expect(second.deduped).toBe(true);
    expect(second.caseId).toBe(first.caseId);
    const count = await prisma.case.count({ where: { organizationId: orgId, finlinkId: "FL-DUP" } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_IT=1 npm run test -- tests/finlink-case-writer.test.ts`
Expected: FAIL (`Cannot find module '@/lib/platforms/case-writer'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/platforms/case-writer.ts
import { prisma } from "@/lib/db";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { formatCaseNumber, highestSequence, caseNumberPrefix } from "@/lib/cases/case-number";

export interface WriteContext {
  organizationId: string;
  userId: string;
}

export interface WriteResult {
  caseId: string;
  caseNumber: string;
  deduped: boolean;
}

/** true bei Prisma-Unique-Constraint-Verletzung (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function nextCaseNumber(organizationId: string, year: number): Promise<string> {
  const rows = await prisma.case.findMany({
    where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(year) } },
    select: { caseNumber: true },
  });
  return formatCaseNumber(year, highestSequence(rows.map((r) => r.caseNumber)) + 1);
}

/**
 * Legt aus einem kanonischen Fall einen neuen BaufiDesk-Fall an
 * (Case + Applicants + Employment/Income + Property + FinancingRequest) in einer
 * Transaktion. Existiert bereits ein Fall mit (organizationId, finlinkId), wird
 * dieser zurückgegeben statt eine Dublette anzulegen.
 */
export async function createCaseFromCanonical(
  ctx: WriteContext,
  canonical: CanonicalCase
): Promise<WriteResult> {
  const finlinkId = canonical.platformIds.finlinkId ?? null;

  // Dedup: gleicher externer Vorgang in derselben Organisation.
  if (finlinkId) {
    const existing = await prisma.case.findFirst({
      where: { organizationId: ctx.organizationId, finlinkId },
      select: { id: true, caseNumber: true },
    });
    if (existing) return { caseId: existing.id, caseNumber: existing.caseNumber, deduped: true };
  }

  const year = new Date().getFullYear();

  const applicantsCreate = canonical.applicants.map((a) => {
    const emp = canonical.employment.filter((e) => e.applicantPosition === a.position);
    const inc = canonical.income.filter((i) => i.applicantPosition === a.position);
    return {
      position: a.position,
      vorname: a.vorname ?? null,
      nachname: a.nachname ?? null,
      geburtsdatum: a.geburtsdatum ? new Date(a.geburtsdatum) : null,
      geburtsort: a.geburtsort ?? null,
      staatsangehoerigkeit: a.staatsangehoerigkeit ?? null,
      familienstand: a.familienstand ?? null,
      anzahlKinder: a.anzahlKinder ?? null,
      street: a.strasse ?? null,
      zip: a.plz ?? null,
      city: a.ort ?? null,
      email: a.email ?? null,
      phone: a.telefon ?? null,
      employment: {
        create: emp.map((e) => ({
          beschaeftigungsart: e.beschaeftigungsart ?? null,
          beruf: e.beruf ?? null,
          arbeitgeber: e.arbeitgeber ?? null,
        })),
      },
      income: {
        create: inc.map((i) => ({
          nettoMonatlich: i.nettoMonatlich ?? null,
          bruttoMonatlich: i.bruttoMonatlich ?? null,
        })),
      },
    };
  });

  const p = canonical.property;
  const f = canonical.financing;

  const buildData = (caseNumber: string) => ({
    organizationId: ctx.organizationId,
    brokerId: ctx.userId,
    caseNumber,
    status: "neu" as const,
    financingType: canonical.financingType ?? null,
    finlinkId,
    applicants: { create: applicantsCreate },
    property: p
      ? { create: { objektart: p.objektart ?? null, street: p.strasse ?? null, zip: p.plz ?? null, city: p.ort ?? null } }
      : undefined,
    financingRequest: {
      create: { kaufpreis: f.kaufpreis ?? null, darlehenswunsch: f.darlehenswunsch ?? null },
    },
    sources: { create: { type: "finlink_import" as const, externalId: finlinkId } },
  });

  // Race-Schutz auf @@unique([organizationId, caseNumber]): bei P2002 neu berechnen.
  let created: { id: string; caseNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const caseNumber = await nextCaseNumber(ctx.organizationId, year);
    try {
      created = await prisma.case.create({ data: buildData(caseNumber), select: { id: true, caseNumber: true } });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue;
      throw e;
    }
  }
  return { caseId: created!.id, caseNumber: created!.caseNumber, deduped: false };
}
```

> **Hinweis für den Umsetzer:** `CaseSourceType` (in `prisma/schema.prisma`) enthält bereits den passenden Wert `finlink_import` (weitere Werte: `kundenformular`, `dokumenten_upload`, `manuell`, `europace_import`). `CaseSource` besitzt zudem ein optionales `externalId`-Feld – hier die FinLink-Vorgangs-ID.

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_IT=1 npm run test -- tests/finlink-case-writer.test.ts`
Expected: PASS (2 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms/case-writer.ts tests/finlink-case-writer.test.ts
git commit -m "feat(finlink): createCaseFromCanonical + Dedup über finlinkId"
```

---

## Task 4: FinLinkClient (HTTP-Naht) + Env-Doku

**Files:**
- Create: `src/lib/platforms/finlink/client.ts`
- Modify: `.env.example` (nur falls `FINLINK_BASE_URL`/`FINLINK_API_KEY` fehlen — sie sind vorhanden), `src/lib/env.ts` (Kommentar ergänzen, optional)
- Test: `tests/finlink-connector.test.ts` (Client-Teil; erweitert in Task 5)

**Interfaces:**
- Consumes: `parseFinLinkVorgang` (Task 1).
- Produces:
  - `class FinLinkNotConfiguredError extends Error`
  - `class FinLinkNotFoundError extends Error`
  - `class FinLinkAuthError extends Error`
  - `class FinLinkApiError extends Error` (Netzwerk/Timeout/Schema/sonstige)
  - `interface FinLinkClient { fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO> }`
  - `function getFinLinkClient(): FinLinkClient | null` — `null`, wenn nicht konfiguriert.

- [ ] **Step 1: Write the failing test**

```ts
// tests/finlink-connector.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  HttpFinLinkClient,
  FinLinkNotFoundError,
  FinLinkAuthError,
  FinLinkApiError,
} from "@/lib/platforms/finlink/client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const validBody = { id: "FL-1", antragsteller: [{ vorname: "Anna" }] };

afterEach(() => vi.restoreAllMocks());

describe("HttpFinLinkClient.fetchVorgang", () => {
  it("sendet Auth-Header + Base-URL und validiert die Antwort", async () => {
    const fetchMock = mockFetch(200, validBody);
    const client = new HttpFinLinkClient({ baseUrl: "https://api.finlink.test", apiKey: "secret" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.id).toBe("FL-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://api.finlink.test");
    expect(String(url)).toContain("FL-1");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
  });

  it("wirft FinLinkNotFoundError bei 404", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(404, {}));
    await expect(client.fetchVorgang("nope")).rejects.toBeInstanceOf(FinLinkNotFoundError);
  });

  it("wirft FinLinkAuthError bei 401/403", async () => {
    const c401 = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(401, {}));
    await expect(c401.fetchVorgang("x")).rejects.toBeInstanceOf(FinLinkAuthError);
  });

  it("wirft FinLinkApiError bei unerwartetem Schema", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(200, { unerwartet: true }));
    await expect(client.fetchVorgang("x")).rejects.toBeInstanceOf(FinLinkApiError);
  });

  it("leakt den API-Key nicht in Fehlermeldungen", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "supersecret" }, mockFetch(500, {}));
    const err = await client.fetchVorgang("x").catch((e) => e as Error);
    expect(err.message).not.toContain("supersecret");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/finlink-connector.test.ts`
Expected: FAIL (`Cannot find module '@/lib/platforms/finlink/client'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/platforms/finlink/client.ts
import { parseFinLinkVorgang, type FinLinkVorgangDTO } from "./dto";

export class FinLinkNotConfiguredError extends Error {}
export class FinLinkNotFoundError extends Error {}
export class FinLinkAuthError extends Error {}
export class FinLinkApiError extends Error {}

export interface FinLinkClient {
  fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO>;
}

interface FinLinkConfig {
  baseUrl: string;
  apiKey: string;
}

type FetchLike = typeof fetch;

/**
 * HTTP-Anbindung an die FinLink-API.
 *
 * PROVISORISCH: Endpunktpfad und Auth-Schema sind eine Annahme, bis die
 * FinLink-Doku vorliegt. Anzupassen sind später NUR:
 *   - VORGANG_PATH (Endpunkt zum Abruf eines Vorgangs per ID)
 *   - der Auth-Header (aktuell `Authorization: Bearer <key>`)
 * Die Fehlerklassifizierung und DTO-Validierung bleiben unverändert.
 */
const VORGANG_PATH = (id: string) => `/vorgaenge/${encodeURIComponent(id)}`;

export class HttpFinLinkClient implements FinLinkClient {
  constructor(private readonly config: FinLinkConfig, private readonly fetchImpl: FetchLike = fetch) {}

  async fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO> {
    const url = new URL(VORGANG_PATH(externalId), this.config.baseUrl);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" },
      });
    } catch {
      // Netzwerk/Timeout – KEINE Details/Key durchreichen.
      throw new FinLinkApiError("FinLink nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 404) throw new FinLinkNotFoundError("FinLink-Vorgang nicht gefunden.");
    if (res.status === 401 || res.status === 403) throw new FinLinkAuthError("FinLink-Zugang abgelehnt (Auth).");
    if (!res.ok) throw new FinLinkApiError(`FinLink-Fehler (HTTP ${res.status}).`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new FinLinkApiError("FinLink-Antwort war kein gültiges JSON.");
    }
    try {
      return parseFinLinkVorgang(body);
    } catch {
      throw new FinLinkApiError("FinLink-Antwort hat ein unerwartetes Format.");
    }
  }
}

/**
 * Baut den Client aus der Umgebung. Gibt null zurück, wenn FinLink nicht
 * konfiguriert ist (FINLINK_BASE_URL / FINLINK_API_KEY fehlen).
 */
export function getFinLinkClient(fetchImpl: FetchLike = fetch): FinLinkClient | null {
  const baseUrl = process.env.FINLINK_BASE_URL;
  const apiKey = process.env.FINLINK_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return new HttpFinLinkClient({ baseUrl, apiKey }, fetchImpl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/finlink-connector.test.ts`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Verify env docs**

Prüfe, dass `.env.example` bereits `FINLINK_BASE_URL`/`FINLINK_API_KEY` enthält (Block „Plattform-Connectoren"). Falls ein erläuternder Kommentar fehlt, ergänze eine Zeile:
```
# FinLink-CRM-API (Pull-Import). Auth: Authorization: Bearer <FINLINK_API_KEY>.
```
Kein Code-Change nötig, falls schon dokumentiert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/platforms/finlink/client.ts tests/finlink-connector.test.ts .env.example
git commit -m "feat(finlink): HTTP-Client mit Auth, Fehlerklassifizierung, DTO-Validierung"
```

---

## Task 5: FinLinkConnector.importCaseById verdrahten

**Files:**
- Modify: `src/lib/platforms/connectors.ts` (`FinLinkConnector`)
- Test: erweitere `tests/finlink-connector.test.ts`

**Interfaces:**
- Consumes: `getFinLinkClient`/`FinLinkClient` (Task 4), `finlinkToCanonical` (Task 2), `createCaseFromCanonical` (Task 3).
- Produces: `FinLinkConnector.importCaseById(externalId, ctx, deps?)` liefert `ImportResult` (`{ ok, importedCaseIds, message }`).
  - Signatur: `importCaseById(externalId: string, ctx: { organizationId: string; userId: string }, deps?: { client?: FinLinkClient | null }): Promise<ImportResult>`
  - `deps.client` erlaubt Injektion im Test; ohne `deps` wird `getFinLinkClient()` genutzt.

> **Hinweis:** Das bestehende `PlatformConnector`-Interface deklariert `importCaseById?(externalId: string)` ohne `ctx`. Erweitere die Signatur im Interface (`src/lib/platforms/types.ts`) um die optionalen Parameter `ctx`/`deps` ODER implementiere die neue Methode zusätzlich; der Aufrufer (Server-Action, Task 6) ruft die erweiterte Signatur. Halte Europace/eHyp-Stubs kompatibel (Parameter optional).

- [ ] **Step 1: Write the failing test** (an `tests/finlink-connector.test.ts` anhängen)

```ts
import { FinLinkConnector } from "@/lib/platforms/connectors";
import type { FinLinkClient } from "@/lib/platforms/finlink/client";

vi.mock("@/lib/platforms/case-writer", () => ({
  createCaseFromCanonical: vi.fn(async (_ctx, canonical) => ({
    caseId: "case-123",
    caseNumber: "UP-2026-0001",
    deduped: Boolean((canonical as any).__dedup),
  })),
}));

const ctx = { organizationId: "org-1", userId: "user-1" };

function clientReturning(dto: any): FinLinkClient {
  return { fetchVorgang: vi.fn().mockResolvedValue(dto) };
}

describe("FinLinkConnector.importCaseById", () => {
  it("importiert und liefert die neue caseId", async () => {
    const connector = new FinLinkConnector();
    const client = clientReturning({ id: "FL-1", antragsteller: [{ vorname: "Anna" }] });
    const res = await connector.importCaseById("FL-1", ctx, { client });
    expect(res.ok).toBe(true);
    expect(res.importedCaseIds).toEqual(["case-123"]);
  });

  it("meldet 'nicht konfiguriert', wenn kein Client vorhanden ist", async () => {
    const connector = new FinLinkConnector();
    const res = await connector.importCaseById("FL-1", ctx, { client: null });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nicht (verbunden|konfiguriert)/i);
  });

  it("meldet eine klare Fehlermeldung bei unbekanntem Vorgang (404)", async () => {
    const { FinLinkNotFoundError } = await import("@/lib/platforms/finlink/client");
    const connector = new FinLinkConnector();
    const client: FinLinkClient = { fetchVorgang: vi.fn().mockRejectedValue(new FinLinkNotFoundError("x")) };
    const res = await connector.importCaseById("nope", ctx, { client });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nicht gefunden/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/finlink-connector.test.ts`
Expected: FAIL (importCaseById nutzt noch Stub-Signatur / gibt Stub-Meldung).

- [ ] **Step 3: Write minimal implementation** (ersetze die `FinLinkConnector`-Methoden in `connectors.ts`; Imports oben ergänzen)

```ts
// Imports am Dateikopf ergänzen:
import { getFinLinkClient, type FinLinkClient, FinLinkNotFoundError, FinLinkAuthError } from "./finlink/client";
import { finlinkToCanonical } from "./finlink/mapping";
import { createCaseFromCanonical } from "./case-writer";

// innerhalb von class FinLinkConnector ... importCases-Stub ersetzen/ergänzen:
async importCaseById(
  externalId: string,
  ctx: { organizationId: string; userId: string },
  deps?: { client?: FinLinkClient | null }
): Promise<ImportResult> {
  const client = deps && "client" in deps ? deps.client : getFinLinkClient();
  if (!client) {
    return { ok: false, importedCaseIds: [], message: "FinLink ist nicht verbunden. Bitte FINLINK_BASE_URL/FINLINK_API_KEY setzen." };
  }
  try {
    const dto = await client.fetchVorgang(externalId);
    const canonical = finlinkToCanonical(dto);
    const { caseId, deduped } = await createCaseFromCanonical(ctx, canonical);
    return {
      ok: true,
      importedCaseIds: [caseId],
      message: deduped ? "Vorgang bereits importiert – bestehender Fall geöffnet." : "FinLink-Vorgang übernommen.",
    };
  } catch (e) {
    if (e instanceof FinLinkNotFoundError) return { ok: false, importedCaseIds: [], message: "FinLink-Vorgang nicht gefunden. Bitte ID prüfen." };
    if (e instanceof FinLinkAuthError) return { ok: false, importedCaseIds: [], message: "FinLink-Zugang abgelehnt. Bitte API-Key prüfen." };
    return { ok: false, importedCaseIds: [], message: "FinLink-Import fehlgeschlagen. Bitte später erneut versuchen." };
  }
}
```

> Die alte `importCases()`-Stub-Methode bleibt bestehen (Listen-Import ist ein späterer Slice).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/finlink-connector.test.ts`
Expected: PASS (alle Tests grün, inkl. Task-4-Tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler (ggf. `PlatformConnector.importCaseById`-Signatur in `types.ts` angepasst).

- [ ] **Step 6: Commit**

```bash
git add src/lib/platforms/connectors.ts src/lib/platforms/types.ts tests/finlink-connector.test.ts
git commit -m "feat(finlink): importCaseById verdrahtet (Client -> Mapping -> Fall-Anlage)"
```

---

## Task 6: Server-Action + Import-Seite aktivieren

**Files:**
- Create: `src/lib/actions/finlink.ts`
- Modify: `src/app/(app)/cases/import/page.tsx`
- Test: `tests/finlink-action.test.ts`

**Interfaces:**
- Consumes: `requireContext` (`@/lib/auth/context`), `FinLinkConnector` (Task 5).
- Produces:
  - `type FinLinkImportState = { error?: string }`
  - `importFromFinLink(prev: FinLinkImportState, formData: FormData): Promise<FinLinkImportState>` — Server-Action; bei Erfolg `redirect("/cases/<id>")`, sonst `{ error }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/finlink-action.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/auth/context", () => ({
  requireContext: vi.fn(async () => ({ organizationId: "org-1", userId: "user-1" })),
}));
const redirectMock = vi.fn((url: string) => { throw new Error("REDIRECT:" + url); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectMock(u) }));
const importCaseById = vi.fn();
vi.mock("@/lib/platforms/connectors", () => ({
  FinLinkConnector: class { importCaseById = importCaseById; },
}));

afterEach(() => vi.clearAllMocks());

function fd(id: string) { const f = new FormData(); f.set("finlinkId", id); return f; }

describe("importFromFinLink", () => {
  it("leitet bei Erfolg auf den neuen Fall um", async () => {
    importCaseById.mockResolvedValue({ ok: true, importedCaseIds: ["case-9"], message: "ok" });
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    await expect(importFromFinLink({}, fd("FL-1"))).rejects.toThrow("REDIRECT:/cases/case-9");
  });

  it("gibt einen Fehler zurück, wenn die ID leer ist", async () => {
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("  "));
    expect(res.error).toMatch(/Vorgangs-ID/i);
    expect(importCaseById).not.toHaveBeenCalled();
  });

  it("reicht die Connector-Fehlermeldung durch", async () => {
    importCaseById.mockResolvedValue({ ok: false, importedCaseIds: [], message: "FinLink-Vorgang nicht gefunden. Bitte ID prüfen." });
    const { importFromFinLink } = await import("@/lib/actions/finlink");
    const res = await importFromFinLink({}, fd("nope"));
    expect(res.error).toMatch(/nicht gefunden/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/finlink-action.test.ts`
Expected: FAIL (`Cannot find module '@/lib/actions/finlink'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/actions/finlink.ts
"use server";

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { FinLinkConnector } from "@/lib/platforms/connectors";

export interface FinLinkImportState {
  error?: string;
}

export async function importFromFinLink(
  _prev: FinLinkImportState,
  formData: FormData
): Promise<FinLinkImportState> {
  const externalId = String(formData.get("finlinkId") ?? "").trim();
  if (!externalId) return { error: "Bitte eine FinLink-Vorgangs-ID eingeben." };

  const ctx = await requireContext();
  const connector = new FinLinkConnector();
  const res = await connector.importCaseById(externalId, { organizationId: ctx.organizationId, userId: ctx.userId });

  if (!res.ok || res.importedCaseIds.length === 0) {
    return { error: res.message || "FinLink-Import fehlgeschlagen." };
  }
  redirect(`/cases/${res.importedCaseIds[0]}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/finlink-action.test.ts`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Verdrahte die Import-Seite (Client-Formular)**

Ersetze in `src/app/(app)/cases/import/page.tsx` die deaktivierte Karte „Vorgang übernehmen" durch ein aktives Formular. Lege dazu eine Client-Komponente an und binde sie ein.

```tsx
// src/components/finlink/finlink-import-form.tsx
"use client";

import { useActionState } from "react";
import { importFromFinLink, type FinLinkImportState } from "@/lib/actions/finlink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FinLinkImportForm() {
  const [state, action, pending] = useActionState<FinLinkImportState, FormData>(importFromFinLink, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="finlinkId">FinLink-Vorgangs-ID</Label>
        <Input id="finlinkId" name="finlinkId" placeholder="z. B. FL-2026-04821" required />
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? "Import läuft …" : "Import vorbereiten"}</Button>
    </form>
  );
}
```

Dann in `page.tsx` die deaktivierte Karte ersetzen: statt des `disabled` Input/Button `<FinLinkImportForm />` rendern und den Hinweistext von „bald verfügbar" auf einen aktiven Hinweis anpassen (z.B. „Sobald die FinLink-Zugangsdaten hinterlegt sind, lädt BaufiDesk den Vorgang und legt den Fall an."). Import oben: `import { FinLinkImportForm } from "@/components/finlink/finlink-import-form";`.

- [ ] **Step 6: Verify build/typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/finlink.ts src/components/finlink/finlink-import-form.tsx "src/app/(app)/cases/import/page.tsx"
git commit -m "feat(finlink): Import-Seite aktiviert (Server-Action + Formular)"
```

---

## Nach dem letzten Task: Verifikation

- [ ] Alle Unit-Tests: `npm run test -- tests/finlink-dto.test.ts tests/finlink-mapping.test.ts tests/finlink-connector.test.ts tests/finlink-action.test.ts`
- [ ] DB-Integration: `RUN_DB_IT=1 npm run test -- tests/finlink-case-writer.test.ts`
- [ ] Typecheck: `npm run typecheck`
- [ ] Der reale FinLink-Zugang (Doku + Beispiel-JSON + Key) wird gebraucht, um `dto.ts` (Feldnamen/Enum-Aliase) und `client.ts` (`VORGANG_PATH`, Auth-Header) an die echte API anzupassen. Danach: End-to-End-Test gegen die FinLink-Sandbox.

## Self-Review (durchgeführt beim Schreiben)

- **Spec-Abdeckung:** Modulgrenzen (Client/Mapping/Writer/Connector/UI), Datenfluss (ID→fetch→map→dedup→create→redirect), Umfang (Stammdaten + Beschäftigung/Einkommen + Objekt + Finanzierung, keine Dateien), Sicherheit (requireContext, kein Key-Leak, kein Outbound), Fehlerpfade (nicht konfiguriert/404/401/Netzwerk/Schema), Teststrategie — jeweils durch Task 1–6 abgedeckt.
- **Platzhalter:** Provisorisches DTO/Client-Naht ist bewusst und klar markiert (externe Abhängigkeit, kein Plan-Platzhalter). `CaseSource`-Enum-Wert ist mit Fallback-Anweisung versehen.
- **Typkonsistenz:** `WriteContext {organizationId,userId}` einheitlich; `importCaseById(externalId, ctx, deps?)` in Connector-Test und Server-Action identisch; `FinLinkImportState {error?}` konsistent.
