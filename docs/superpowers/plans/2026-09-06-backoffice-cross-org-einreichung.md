# Backoffice: Cross-Org-Übergabe, Einreichungslink, Vertragstest – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Vertriebsakte aus Organisation A kann an ein Backoffice in Organisation B übergeben werden; Auftraggeber ohne BaufiDesk-Konto reichen Aufträge über einen geheimen Link ein; der Vertragstest prüft zusätzlich die Aufrufreihenfolge der Guards.

**Architecture:** Der `BackofficeAuftrag` wird zur Zugriffsbrücke: `akteSichtbarWhere` und die Guards lassen eine fremde Akte zu, wenn ein Auftrag der eigenen Backoffice-Organisation daran hängt. `requireCaseAccess` verweigert Fremdakten standardmäßig; nur Unterlagen-Seiten und -Actions setzen `fremdakteErlaubt: true`. Der Einreichungslink ist ein neues Modell je Auftraggeber; das Absenden erzeugt über den bestehenden Service Akte, Auftrag und einen normalen Kunden-Upload-Link.

**Tech Stack:** Next.js App Router (Server Actions, Route Handler), Prisma/Postgres (PGlite in Tests), Vitest, bestehende Helfer `createLinkToken`/`hashToken`, `checkRateLimit`, `processUpload`.

**Spec:** `docs/superpowers/specs/2026-09-06-backoffice-cross-org-einreichung-design.md`

## Global Constraints

- Kein Backoffice-Schritt schreibt `Case.status`, `Case.leadPhase` oder ein anderes Vertriebsfeld.
- Verweigerungen antworten mit 404 (`notFound()`), nie 403; Fehlversuche landen ohne Inhalt im Audit (`access.denied`).
- Storage-Präfix kommt immer aus `case.organizationId`.
- Schemaänderungen: DDL als Datei unter `prisma/sql/`, gegen PROD per `scripts/supabase-sql.sh <datei> --dry-run` und dann ohne `--dry-run`; lokal `npm run db:push`. Nie den vollen `migrate diff` anwenden.
- Es wird nichts automatisch versendet.
- Texte in der Oberfläche auf Deutsch, Sie-Form für Externe.
- DB-Tests laufen mit `RUN_DB_IT=1 npx vitest run <datei>`; sie erzwingen `AI_PROVIDER=mock` per `vi.hoisted`.
- Commit-Nachrichten enden mit den zwei Trailer-Zeilen (Co-Authored-By, Claude-Session), wie in dieser Session vorgegeben.

---

## Dateiübersicht

**Neu**
- `src/lib/backoffice/uebergabe-ziele.ts` – Ziele der Übergabe-Karte (eigenes Backoffice + Partner).
- `src/lib/backoffice/einreichung.ts` – Einreichungslink: erzeugen, deaktivieren, Token auflösen, Einreichung ausführen.
- `src/lib/actions/einreichung.ts` – öffentliche Server Action des Einreichungsformulars.
- `src/components/backoffice/einreichungslink-block.tsx` – Manager-Block auf der Auftraggeberseite.
- `src/components/einreichung/einreichung-form.tsx` – öffentliches Formular.
- `src/app/einreichen/[token]/page.tsx`, `src/app/einreichen/[token]/danke/page.tsx`.
- `prisma/sql/2026-09-06-einreichungslink.sql`.
- `tests/backoffice-cross-org-db.test.ts`, `tests/fremdakte-vertrag.test.ts`, `tests/einreichung-db.test.ts`, `tests/einreichung-action.test.ts`.

**Geändert**
- `prisma/schema.prisma` – Modell `BackofficeEinreichungsLink`, Relation am Auftraggeber.
- `src/lib/domain/enums.ts` – zwei Audit-Aktionen.
- `src/lib/auth/context.ts` – Auftragsbrücke, `eigeneAkteWhere`, `entscheideAktenzugriff`, `requireCaseAccess` mit `fremdakteErlaubt`.
- `src/lib/auth/akte-zugriff.ts` – Schreibprüfung auch für Fremdakten, `fremdakteErlaubt` in `requireAkteAccess`.
- `src/lib/backoffice/service.ts` – `erzeugeAuftrag`: Akte darf dem Auftraggeber gehören, `quelle` „einreichung“, zweiter Antragsteller.
- `src/lib/actions/backoffice-vertrieb.ts`, `src/components/case/backoffice-uebergabe-karte.tsx`, `src/components/case/backoffice-uebergabe-form.tsx`, `src/components/case/backoffice-status-karte.tsx`.
- `src/app/(app)/cases/[id]/layout.tsx`, `src/app/(app)/cases/[id]/page.tsx`, `src/components/case/case-nav.tsx`.
- `src/lib/actions/upload.ts`, `einkommen.ts`, `wohnflaeche.ts`, `lageplan.ts`, `buendelung.ts`, `cases.ts`, `backoffice-portal.ts` – Opt-in und Storage-Präfix.
- `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx`, `lageplan/page.tsx`, `wohnflaeche/page.tsx` – Opt-in.
- `src/app/(app)/cases/[id]/edit/page.tsx`, `messages/page.tsx`, `src/lib/actions/machbarkeit.ts`, `finlink.ts` – `eigeneAkteWhere`.
- `src/middleware.ts` – `/einreichen` öffentlich.
- `src/app/(app)/backoffice/auftraggeber/[id]/page.tsx`, `src/app/(app)/backoffice/auftraege/[id]/page.tsx` – Block bzw. Quellen-Label.
- `src/lib/actions/backoffice.ts` – zwei Actions für den Link.
- `tests/dokument-zugriff-vertrag.test.ts` – Aufrufreihenfolge.
- `docs/BACKOFFICE-PILOT-READINESS-2026-09-02.md` – Nachtrag.

---

### Task 1: Auftragsbrücke im Zugriffsmodell

**Files:**
- Modify: `src/lib/auth/context.ts:170-265`
- Modify: `src/lib/auth/akte-zugriff.ts:40-115`
- Test: `tests/backoffice-cross-org-db.test.ts` (neu)

**Interfaces:**
- Produces:
  - `export interface AktenzugriffOptionen { schreibend?: boolean; fremdakteErlaubt?: boolean }` (context.ts)
  - `export function eigeneAkteWhere(ctx: AppContext): Prisma.CaseWhereInput` – bisheriges Verhalten von `akteSichtbarWhere` (nur eigene Organisation).
  - `export function akteSichtbarWhere(ctx: AppContext): Prisma.CaseWhereInput` – eigene Akten **oder** Auftragsbrücke.
  - `export async function entscheideAktenzugriff(ctx, akte: { id; organizationId; akteArt }, optionen): Promise<{ erlaubt: true; fremd: boolean } | { erlaubt: false }>`
  - `requireCaseAccess(caseId, optionen?: AktenzugriffOptionen)` liefert zusätzlich `fremd: boolean`.
  - `requireAkteAccess(caseId, optionen?: AktenzugriffOptionen)` (akte-zugriff.ts) akzeptiert `fremdakteErlaubt`; `AkteZugriff` bekommt `fremd: boolean`.

- [ ] **Step 1: DB-Test anlegen (schlägt fehl)**

Datei `tests/backoffice-cross-org-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((u: string) => { throw new Error("NEXT_REDIRECT:" + u); }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
let aktuellerNutzer: any = null;
vi.mock("@/lib/auth/context", async (orig) => {
  const echt = (await orig()) as Record<string, unknown>;
  return {
    ...echt,
    getCurrentContext: vi.fn(async () => aktuellerNutzer),
    requireContext: vi.fn(async () => {
      if (!aktuellerNutzer) throw new Error("NEXT_REDIRECT:/login");
      return aktuellerNutzer;
    }),
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/**
 * Cross-Org-Uebergabe gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts
 *
 * A = Vertrieb (Eigentuemer der Akte), B = Backoffice-Partner, C = Dritter.
 */
describe.runIf(RUN)("Cross-Org-Uebergabe (PGlite)", () => {
  let prisma: any;
  let ctxModul: typeof import("@/lib/auth/context");
  let zugriff: typeof import("@/lib/auth/akte-zugriff");
  let service: typeof import("@/lib/backoffice/service");
  const org = { A: "", B: "", C: "" };
  const nutzer: Record<string, any> = {};
  let akteA: string;
  let dokA: string;
  let agAinB: string;
  let auftragId: string;

  const ctx = (u: any) => ({
    organizationId: u.organizationId,
    organizationName: "x",
    userId: u.id,
    userName: u.name,
    role: u.role,
    platformAdmin: false,
    backofficeRolle: u.backofficeRolle,
    isDemo: false,
  });
  const als = (u: any) => { aktuellerNutzer = ctx(u); };

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    for (const [k, slug] of [["A", "xorg-a"], ["B", "xorg-b"], ["C", "xorg-c"]]) {
      org[k as keyof typeof org] = (await prisma.organization.create({ data: { name: `Org ${k}`, slug } })).id;
    }
    await prisma.featureFlag.create({ data: { organizationId: org.B, key: "backoffice", enabled: true } });
    await prisma.featureFlag.create({ data: { organizationId: org.C, key: "backoffice", enabled: true } });
    const mk = async (key: string, orgId: string, role: string, rolle: string | null) => {
      nutzer[key] = await prisma.user.create({ data: { organizationId: orgId, email: `${key}@x.de`, name: key, role, backofficeRolle: rolle } });
    };
    await mk("aVermittler", org.A, "vermittler", null);
    await mk("bManager", org.B, "org_admin", "manager");
    await mk("bBearbeiter1", org.B, "teammitglied", "bearbeiter");
    await mk("bBearbeiter2", org.B, "teammitglied", "bearbeiter");
    await mk("bOhneRolle", org.B, "vermittler", null);
    await mk("cManager", org.C, "org_admin", "manager");

    agAinB = (await prisma.backofficeAuftraggeber.create({
      data: { backofficeOrganizationId: org.B, organizationId: org.A, name: "Vertrieb A", abrechnungsmodell: "partner" },
    })).id;

    akteA = (await prisma.case.create({
      data: { organizationId: org.A, caseNumber: "UP-2026-0100", quelle: "immoscout24", leadPhase: "selbstauskunft_laeuft", status: "upload_offen" },
    })).id;
    dokA = (await prisma.document.create({
      data: {
        caseId: akteA,
        originalName: "gehalt.pdf",
        generatedName: "gehalt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storageKey: `${org.A}/${akteA}/gehalt.pdf`,
        checksumSha256: "x",
      },
    })).id;

    ctxModul = await import("@/lib/auth/context");
    zugriff = await import("@/lib/auth/akte-zugriff");
    service = await import("@/lib/backoffice/service");
  }, 180_000);

  it("erzeugeAuftrag nimmt eine Akte des Auftraggebers an (Cross-Org)", async () => {
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: org.B,
      auftraggeberId: agAinB,
      caseId: akteA,
      aktenbezeichnung: "Muster",
      auftragsart: "basis_pruefung",
      quelle: "vertrieb_uebergabe",
      erstelltVonId: nutzer.aVermittler.id,
    });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    auftragId = e.wert.id;
    const akte = await prisma.case.findUnique({ where: { id: akteA } });
    expect(akte.akteArt).toBe("vertrieb");
    expect(akte.organizationId).toBe(org.A);
    expect(akte.leadPhase).toBe("selbstauskunft_laeuft");
  });

  it("erzeugeAuftrag lehnt eine Akte ab, die weder B noch dem Auftraggeber gehoert", async () => {
    const fremd = (await prisma.case.create({ data: { organizationId: org.C, caseNumber: "UP-2026-0101" } })).id;
    const e = await service.erzeugeAuftrag({
      backofficeOrganizationId: org.B,
      auftraggeberId: agAinB,
      caseId: fremd,
      auftragsart: "basis_pruefung",
      quelle: "manuell",
      erstelltVonId: nutzer.bManager.id,
    });
    expect(e.ok).toBe(false);
  });

  it("B-Manager sieht das Dokument der Fremdakte ueber akteSichtbarWhere", async () => {
    als(nutzer.bManager);
    const r = await zugriff.requireDocumentAccess(dokA);
    expect(r.dokument.organizationId).toBe(org.A);
  });

  it("requireAkteAccess verweigert die Fremdakte ohne Opt-in und erlaubt sie mit", async () => {
    als(nutzer.bManager);
    await expect(zugriff.requireAkteAccess(akteA)).rejects.toThrow("NEXT_NOT_FOUND");
    const r = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true });
    expect(r.fremd).toBe(true);
    const s = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true, schreibend: true });
    expect(s.akte.id).toBe(akteA);
  });

  it("entscheideAktenzugriff: A-Vermittler eigene Akte, B ohne Rolle 404, C 404", async () => {
    const akte = { id: akteA, organizationId: org.A, akteArt: "vertrieb" as const };
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.aVermittler), akte, {})).toEqual({ erlaubt: true, fremd: false });
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.bOhneRolle), akte, { fremdakteErlaubt: true })).toEqual({ erlaubt: false });
    expect(await ctxModul.entscheideAktenzugriff(ctx(nutzer.cManager), akte, { fremdakteErlaubt: true })).toEqual({ erlaubt: false });
  });

  it("B-Bearbeiter: frei ja, fremd zugewiesen nein", async () => {
    const akte = { id: akteA, organizationId: org.A, akteArt: "vertrieb" as const };
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter1), akte, { fremdakteErlaubt: true })).erlaubt).toBe(true);
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { bearbeiterId: nutzer.bBearbeiter2.id } });
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter1), akte, { fremdakteErlaubt: true })).erlaubt).toBe(false);
    expect((await ctxModul.entscheideAktenzugriff(ctx(nutzer.bBearbeiter2), akte, { fremdakteErlaubt: true })).erlaubt).toBe(true);
    als(nutzer.bBearbeiter1);
    await expect(zugriff.requireDocumentAccess(dokA)).rejects.toThrow("NEXT_NOT_FOUND");
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { bearbeiterId: null } });
  });

  it("nach Abschluss: lesen ja, schreiben nein", async () => {
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { status: "abgeschlossen" } });
    als(nutzer.bManager);
    const r = await zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true });
    expect(r.fremd).toBe(true);
    await expect(zugriff.requireAkteAccess(akteA, { fremdakteErlaubt: true, schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(zugriff.requireDocumentAccess(dokA, { schreibend: true })).rejects.toThrow("NEXT_NOT_FOUND");
    await prisma.backofficeAuftrag.update({ where: { id: auftragId }, data: { status: "in_aufbereitung" } });
  });

  it("A-Akte taucht in keiner Vertriebsliste von B auf", async () => {
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    const n = await prisma.case.count({ where: { organizationId: org.B, ...nurVertrieb } });
    expect(n).toBe(0);
  });
});
```

Hinweis für den Ausführenden: Falls `prisma.document.create` weitere Pflichtfelder verlangt, die Felder aus `tests/backoffice-dokument-zugriff-db.test.ts` übernehmen (dort wird bereits ein Dokument angelegt).

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts`
Expected: FAIL – `erzeugeAuftrag` antwortet „Akte nicht gefunden.“; `entscheideAktenzugriff` existiert nicht.

- [ ] **Step 3: context.ts umbauen**

In `src/lib/auth/context.ts` den Block von `requireCaseAccess` bis einschließlich `darfBackofficeAkteSehen` ersetzen durch:

```ts
export interface AktenzugriffOptionen {
  /** Mutation: Backoffice-Akten und Fremdakten nur mit offenem Auftrag. */
  schreibend?: boolean;
  /**
   * Fremdakte zulassen: eine Akte einer anderen Organisation, an der ein
   * Auftrag der eigenen Backoffice-Organisation haengt. Standard false -
   * Vertriebsseiten (Erstgespraech, Verwaltung, Provision ...) bleiben dem
   * Eigentuemer vorbehalten; nur die Unterlagenarbeit setzt das Opt-in.
   * Allowlist: tests/fremdakte-vertrag.test.ts.
   */
  fremdakteErlaubt?: boolean;
}

/** Bearbeiter sehen nur freie oder eigene Auftraege. */
function auftragsFilterFuer(ctx: AppContext): Prisma.BackofficeAuftragWhereInput {
  return {
    backofficeOrganizationId: ctx.organizationId,
    ...(ctx.backofficeRolle === "bearbeiter" ? { OR: [{ bearbeiterId: null }, { bearbeiterId: ctx.userId }] } : {}),
  };
}

/**
 * Prisma-Where fuer Akten der EIGENEN Organisation: Vertriebsakten immer,
 * Backoffice-Akten nur mit Backoffice-Rolle (Bearbeiter: freier oder eigener
 * Auftrag). Fuer Vertriebsseiten, die eine Fremdakte nie zeigen duerfen.
 */
export function eigeneAkteWhere(ctx: AppContext): Prisma.CaseWhereInput {
  const backoffice: Prisma.CaseWhereInput[] = ctx.backofficeRolle
    ? [{ akteArt: "backoffice", backofficeAuftraege: { some: auftragsFilterFuer(ctx) } }]
    : [];
  return { organizationId: ctx.organizationId, OR: [{ akteArt: "vertrieb" }, ...backoffice] };
}

/**
 * Prisma-Where fuer "Akten, die dieser Kontext sehen darf" - eigene Akten
 * (eigeneAkteWhere) ODER die Auftragsbruecke: eine Akte einer anderen
 * Organisation, an der ein Auftrag der eigenen Backoffice-Organisation haengt
 * (Cross-Org-Uebergabe). Fuer Dokumente, Review-Center und den
 * Unterlagen-Arbeitsplatz, also die Unterlagenarbeit.
 */
export function akteSichtbarWhere(ctx: AppContext): Prisma.CaseWhereInput {
  const bruecke: Prisma.CaseWhereInput[] = ctx.backofficeRolle
    ? [{ backofficeAuftraege: { some: auftragsFilterFuer(ctx) } }]
    : [];
  return { OR: [eigeneAkteWhere(ctx), ...bruecke] };
}

/**
 * Gibt es einen fuer den Kontext sichtbaren Auftrag seiner Backoffice-
 * Organisation an dieser Akte? Gilt fuer eigene Backoffice-Akten und fuer
 * Fremdakten gleichermassen.
 */
export async function darfBackofficeAkteSehen(ctx: AppContext, caseId: string): Promise<boolean> {
  if (!ctx.backofficeRolle) return false;
  const auftrag = await prisma.backofficeAuftrag.findFirst({ where: { caseId, ...auftragsFilterFuer(ctx) }, select: { id: true } });
  return auftrag != null;
}

/**
 * Darf der Kontext an dieser Akte noch ARBEITEN? Ja, wenn ein sichtbarer
 * Auftrag existiert, der nicht abgeschlossen, abgelehnt oder storniert ist.
 */
export async function darfBackofficeAkteBearbeiten(ctx: AppContext, caseId: string): Promise<boolean> {
  if (!ctx.backofficeRolle) return false;
  const auftrag = await prisma.backofficeAuftrag.findFirst({
    where: { caseId, status: { notIn: [...BACKOFFICE_TERMINAL_STATUS] }, ...auftragsFilterFuer(ctx) },
    select: { id: true },
  });
  return auftrag != null;
}

/**
 * DIE Regel fuer den Zugriff auf eine Akte - requireCaseAccess und
 * requireAkteAccess fragen hier. Eigene Vertriebsakte: immer. Eigene
 * Backoffice-Akte: sichtbarer Auftrag, schreibend offener Auftrag. Fremdakte:
 * nur mit Opt-in UND sichtbarem Auftrag, schreibend offener Auftrag.
 */
export async function entscheideAktenzugriff(
  ctx: AppContext,
  akte: { id: string; organizationId: string; akteArt: AkteArt },
  optionen: AktenzugriffOptionen
): Promise<{ erlaubt: true; fremd: boolean } | { erlaubt: false }> {
  const fremd = akte.organizationId !== ctx.organizationId;
  if (fremd && !optionen.fremdakteErlaubt) return { erlaubt: false };
  const auftragsgebunden = fremd || akte.akteArt === "backoffice";
  if (auftragsgebunden && !(await darfBackofficeAkteSehen(ctx, akte.id))) return { erlaubt: false };
  if (auftragsgebunden && optionen.schreibend && !(await darfBackofficeAkteBearbeiten(ctx, akte.id))) return { erlaubt: false };
  return { erlaubt: true, fremd };
}

/**
 * Lädt einen Fall NUR, wenn der Kontext ihn sehen darf (entscheideAktenzugriff).
 * Existiert er nicht oder ist er verwehrt, antworten wir identisch (404).
 * `status` gehört mit in die Auskunft: Fast jede schreibende Action prüft
 * danach, ob der Fall gesperrt ist (`LOCKED_CASE_STATUSES`).
 */
export async function requireCaseAccess(
  caseId: string,
  optionen: AktenzugriffOptionen = {}
): Promise<{
  ctx: AppContext;
  caseRow: { id: string; organizationId: string; status: CaseStatus; akteArt: AkteArt };
  /** true, wenn die Akte einer anderen Organisation gehoert (Auftragsbruecke). */
  fremd: boolean;
}> {
  const ctx = await requireContext();
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, organizationId: true, status: true, akteArt: true },
  });
  const entscheidung = caseRow
    ? await entscheideAktenzugriff(ctx, { id: caseRow.id, organizationId: caseRow.organizationId, akteArt: caseRow.akteArt as AkteArt }, optionen)
    : ({ erlaubt: false } as const);
  if (!caseRow || !entscheidung.erlaubt) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return {
    ctx,
    caseRow: caseRow as { id: string; organizationId: string; status: CaseStatus; akteArt: AkteArt },
    fremd: (entscheidung as { erlaubt: true; fremd: boolean }).fremd,
  };
}
```

Die alten Definitionen von `darfBackofficeAkteBearbeiten`, `akteSichtbarWhere`, `darfBackofficeAkteSehen` entfernen (sie sind oben ersetzt). Der Import von `Prisma` bleibt.

- [ ] **Step 4: akte-zugriff.ts anpassen**

In `src/lib/auth/akte-zugriff.ts`:

```ts
import {
  akteSichtbarWhere,
  entscheideAktenzugriff,
  getCurrentContext,
  requireContext,
  type AktenzugriffOptionen,
  type AppContext,
} from "@/lib/auth/context";
```

`ZugriffOptionen` löschen und überall durch `AktenzugriffOptionen` ersetzen. `AkteZugriff` erhält `fremd: boolean`.

`requireDocumentAccess` – die Schreibprüfung:

```ts
  if (optionen.schreibend) {
    const e = await entscheideAktenzugriff(
      ctx,
      { id: doc.caseId, organizationId: doc.case.organizationId, akteArt: doc.case.akteArt as AkteArt },
      { schreibend: true, fremdakteErlaubt: true }
    );
    if (!e.erlaubt) return verweigert(ctx, "dokument", documentId, true);
  }
```

(Dokumente sind Unterlagenarbeit, deshalb `fremdakteErlaubt: true`; die Sichtbarkeit selbst kam schon aus `akteSichtbarWhere`.)

`requireAkteAccess`:

```ts
export async function requireAkteAccess(caseId: string, optionen: AktenzugriffOptionen = {}): Promise<AkteZugriff> {
  const ctx = await requireContext();
  const akte = caseId
    ? await prisma.case.findFirst({
        where: { id: caseId, ...akteSichtbarWhere(ctx) },
        select: { id: true, organizationId: true, akteArt: true, status: true, caseNumber: true },
      })
    : null;
  if (!akte) return verweigert(ctx, "akte", caseId, Boolean(optionen.schreibend));
  const e = await entscheideAktenzugriff(ctx, { id: akte.id, organizationId: akte.organizationId, akteArt: akte.akteArt as AkteArt }, optionen);
  if (!e.erlaubt) return verweigert(ctx, "akte", caseId, Boolean(optionen.schreibend));
  return {
    ctx,
    akte: { id: akte.id, organizationId: akte.organizationId, akteArt: akte.akteArt as AkteArt, status: akte.status as CaseStatus, caseNumber: akte.caseNumber },
    fremd: e.fremd,
  };
}
```

`ladeAkteFuerRoute` und `ladeDokumentFuerRoute` unverändert lassen (lesend; Sichtbarkeit über `akteSichtbarWhere`), aber im `AkteZugriff`-Rückgabewert von `ladeAkteFuerRoute` ebenfalls `fremd: akte.organizationId !== ctx.organizationId` setzen, damit der Typ stimmt.

- [ ] **Step 5: erzeugeAuftrag in service.ts erweitern**

In `src/lib/backoffice/service.ts`, Funktion `erzeugeAuftrag`: beim Laden des Auftraggebers `organizationId: true` ins `select` aufnehmen und die Aktenprüfung ersetzen:

```ts
  if (caseId) {
    // Interne Uebergabe: Akte der Backoffice-Organisation. Cross-Org: Akte der
    // Organisation, die als Auftraggeber verknuepft ist. Sonst nichts.
    const erlaubteOrgs = [input.backofficeOrganizationId, auftraggeber.organizationId].filter((x): x is string => Boolean(x));
    const akte = await prisma.case.findFirst({
      where: { id: caseId, organizationId: { in: erlaubteOrgs } },
      select: { id: true },
    });
    if (!akte) return { ok: false, grund: "Akte nicht gefunden." };
    ...
```

- [ ] **Step 6: Typecheck und Test**

Run: `npm run typecheck && RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts tests/backoffice-zugriff-db.test.ts tests/backoffice-dokument-zugriff-db.test.ts`
Expected: alle grün. Typfehler an Aufrufern von `requireCaseAccess`, die `{ ctx, caseRow }` destrukturieren, gibt es nicht (zusätzliches Feld); wer `ZugriffOptionen` importierte, wird auf `AktenzugriffOptionen` umgestellt.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/context.ts src/lib/auth/akte-zugriff.ts src/lib/backoffice/service.ts tests/backoffice-cross-org-db.test.ts
git commit -m "feat(backoffice): Auftragsbruecke - Fremdakten ueber den eigenen Auftrag sichtbar, Opt-in fremdakteErlaubt"
```

---

### Task 2: Opt-ins der Unterlagenarbeit, Storage-Präfix, Vertriebsseiten auf eigeneAkteWhere

**Files:**
- Modify: `src/lib/actions/upload.ts` (4 Aufrufe), `src/lib/actions/buendelung.ts` (5), `src/lib/actions/einkommen.ts` (7), `src/lib/actions/wohnflaeche.ts` (2), `src/lib/actions/lageplan.ts` (2), `src/lib/actions/cases.ts` (nur `runAiCheck`, `createUploadLink`, `createUploadLinkAction`, `regenerateUploadLinkAction`, `deactivateUploadLinkAction`)
- Modify: `src/lib/actions/backoffice-portal.ts:146-232`
- Modify: `src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx`, `lageplan/page.tsx`, `wohnflaeche/page.tsx`
- Modify: `src/app/(app)/cases/[id]/edit/page.tsx:37`, `messages/page.tsx:38`, `src/lib/actions/machbarkeit.ts:12`, `src/lib/actions/finlink.ts:83`
- Test: `tests/fremdakte-vertrag.test.ts` (neu)

**Interfaces:**
- Consumes: `requireCaseAccess(caseId, { schreibend?, fremdakteErlaubt? })` liefert `{ ctx, caseRow, fremd }`; `eigeneAkteWhere(ctx)`.

- [ ] **Step 1: Vertragstest schreiben**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vertragstest: Fremdakten (Cross-Org-Uebergabe) duerfen nur dort geoeffnet
 * werden, wo Unterlagenarbeit stattfindet. Jede Datei, die
 * `fremdakteErlaubt: true` setzt, steht hier mit Begruendung. Eine neue
 * Vertriebsseite mit dem Opt-in laesst den Test rot werden.
 */
const WURZEL = process.cwd();

function dateienUnter(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...dateienUnter(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const ERLAUBT: Record<string, string> = {
  "src/lib/actions/upload.ts": "Vermittler-Upload in die Akte",
  "src/lib/actions/buendelung.ts": "Einzelseiten buendeln",
  "src/lib/actions/einkommen.ts": "Einkommensauswertung Selbstaendige (Dokumentauswertung)",
  "src/lib/actions/wohnflaeche.ts": "Wohnflaeche aus Grundrissen",
  "src/lib/actions/lageplan.ts": "Lageplan zur Akte",
  "src/lib/actions/cases.ts": "KI-Pruefung starten, Upload-Links verwalten",
  "src/lib/auth/akte-zugriff.ts": "Dokumentguard: Dokumente sind Unterlagenarbeit",
  "src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx": "Seite Einkommensauswertung",
  "src/app/(app)/cases/[id]/lageplan/page.tsx": "Seite Lageplan",
  "src/app/(app)/cases/[id]/wohnflaeche/page.tsx": "Seite Wohnflaeche",
};

const VERTRIEB_MUSS_EIGENE = [
  "src/app/(app)/cases/[id]/edit/page.tsx",
  "src/app/(app)/cases/[id]/messages/page.tsx",
  "src/lib/actions/machbarkeit.ts",
  "src/lib/actions/finlink.ts",
];

describe("Vertrag: Fremdakte nur in der Unterlagenarbeit", () => {
  const dateien = dateienUnter(join(WURZEL, "src"), (p) => /\.(ts|tsx)$/.test(p));
  const mitOptIn = dateien.filter((p) => /fremdakteErlaubt:\s*true/.test(readFileSync(p, "utf-8")));

  it("findet Opt-ins (Selbsttest)", () => {
    expect(mitOptIn.length).toBeGreaterThan(5);
  });

  for (const p of mitOptIn) {
    const rel = p.slice(WURZEL.length + 1);
    it(`${rel} steht in der Allowlist`, () => {
      expect(ERLAUBT[rel], `${rel} setzt fremdakteErlaubt, ist aber nicht als Unterlagenarbeit begruendet`).toBeTruthy();
    });
  }

  for (const rel of Object.keys(ERLAUBT)) {
    it(`${rel} (Allowlist) existiert und setzt das Opt-in`, () => {
      const s = readFileSync(join(WURZEL, rel), "utf-8");
      expect(/fremdakteErlaubt:\s*true/.test(s)).toBe(true);
    });
  }

  for (const rel of VERTRIEB_MUSS_EIGENE) {
    it(`${rel} laedt nur eigene Akten (eigeneAkteWhere)`, () => {
      const s = readFileSync(join(WURZEL, rel), "utf-8");
      expect(s).toMatch(/\beigeneAkteWhere\b/);
      expect(s).not.toMatch(/\bakteSichtbarWhere\b/);
    });
  }

  it("Vertriebsseiten der Fallakte setzen kein Opt-in", () => {
    for (const rel of [
      "src/app/(app)/cases/[id]/erstgespraech/page.tsx",
      "src/app/(app)/cases/[id]/verwaltung/page.tsx",
      "src/app/(app)/cases/[id]/machbarkeit/page.tsx",
      "src/app/(app)/cases/[id]/haushalt/page.tsx",
      "src/app/(app)/cases/[id]/summary/page.tsx",
      "src/app/(app)/cases/[id]/export/page.tsx",
      "src/app/(app)/cases/[id]/ehyp-workflow/page.tsx",
      "src/lib/actions/erstgespraech.ts",
      "src/lib/actions/case-management.ts",
      "src/lib/actions/lead-phase.ts",
      "src/lib/actions/case-lifecycle.ts",
      "src/lib/actions/kreditpruefung.ts",
    ]) {
      expect(/fremdakteErlaubt:\s*true/.test(readFileSync(join(WURZEL, rel), "utf-8")), rel).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/fremdakte-vertrag.test.ts`
Expected: FAIL (Allowlist-Dateien setzen das Opt-in noch nicht; Vertriebsdateien nutzen noch `akteSichtbarWhere`).

- [ ] **Step 3: Opt-ins setzen**

In jeder Allowlist-Action/-Seite jeden `requireCaseAccess(caseId)`-Aufruf zu `requireCaseAccess(caseId, { fremdakteErlaubt: true })` und jeden `requireCaseAccess(caseId, { schreibend: true })` zu `requireCaseAccess(caseId, { schreibend: true, fremdakteErlaubt: true })` machen. In `cases.ts` nur in den fünf genannten Funktionen; `generateMessage`, `releasePlatform`, `europaceVorgangAnlegen`, `europaceUnterlagenUebertragen` bleiben ohne Opt-in.

Seiten `einkommen-selbststaendig/page.tsx`, `lageplan/page.tsx`, `wohnflaeche/page.tsx`: `requireCaseAccess(id, { fremdakteErlaubt: true })`. `einkommen-selbststaendig/page.tsx` lädt zusätzlich per `akteSichtbarWhere` – das bleibt (Brücke enthalten).

- [ ] **Step 4: Storage-Präfix aus der Akte**

`src/lib/actions/upload.ts`: in `processBrokerStoredUpload` und `requestBrokerUploadSlot` (und überall dort, wo `ctx.organizationId` an `isStorageKeyForCase`, `createSignedUploadUrl`, `processUpload`, `processStoredUpload` geht) `caseRow.organizationId` verwenden:

```ts
  const { ctx, caseRow } = await requireCaseAccess(caseId, { schreibend: true, fremdakteErlaubt: true });
  // Tenant-Isolation: der storageKey MUSS im Pfad der Akten-Organisation liegen
  // (bei einer Fremdakte ist das NICHT die Organisation des Kontexts).
  if (!isStorageKeyForCase(meta.storageKey, caseRow.organizationId, caseId)) {
```

und `organizationId: caseRow.organizationId` in `processStoredUpload`/`processUpload`/`createSignedUploadUrl`. Dasselbe in `src/lib/actions/einkommen.ts` (`requestEinkommenUploadSlot`, `processEinkommenStoredUpload`, `einkommenUploadOne`).

`src/lib/actions/backoffice-portal.ts`: Hilfsfunktion ergänzen und in `portalUploadOne`, `portalRequestUploadSlot`, `portalProcessStoredUpload` statt `auftrag.backofficeOrganizationId` für Storage/Pipeline verwenden (das Audit bleibt bei `auftrag.backofficeOrganizationId`):

```ts
/** Organisation der Akte - Eigentuemer des Storage-Pfads. Bei einer Vertriebsakte
 *  des Auftraggebers ist das dessen Organisation, nicht das Backoffice. */
async function aktenOrganisation(caseId: string): Promise<string> {
  const akte = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { organizationId: true } });
  return akte.organizationId;
}
```

- [ ] **Step 5: Vertriebsseiten auf eigeneAkteWhere**

In `edit/page.tsx`, `messages/page.tsx`, `machbarkeit.ts`, `finlink.ts`: Import `akteSichtbarWhere` → `eigeneAkteWhere` und den Aufruf ersetzen.

- [ ] **Step 6: Tests, Typecheck**

Run: `npm run typecheck && npx vitest run tests/fremdakte-vertrag.test.ts tests/dokument-zugriff-vertrag.test.ts tests/backoffice-vertrieb-trennung.test.ts`
Expected: grün. Falls `dokument-zugriff-vertrag` an `eigeneAkteWhere` scheitert (Guard-Liste), `"eigeneAkteWhere"` dort in `ERLAUBTE_GUARDS` aufnehmen.

- [ ] **Step 7: Commit**

```bash
git add -A src tests/fremdakte-vertrag.test.ts
git commit -m "feat(backoffice): Fremdakte nur in der Unterlagenarbeit; Storage-Praefix aus der Akten-Organisation"
```

---

### Task 3: Rahmen der Fallakte für Fremdakten (Layout, Umleitung, Navigation)

**Files:**
- Modify: `src/app/(app)/cases/[id]/layout.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx:131-143`
- Modify: `src/components/case/case-nav.tsx:40-110`

**Interfaces:**
- Produces: `CaseNavVariante = "vertrieb" | "backoffice" | "fremd"`.

- [ ] **Step 1: case-nav.tsx – Variante „fremd“**

Typ erweitern und eine dritte Bereichsliste ergänzen:

```ts
export type CaseNavVariante = "vertrieb" | "backoffice" | "fremd";

/** Fremdakte (Cross-Org): nur Auftrag und Unterlagen - die Vertriebsseiten
 *  gehoeren dem Eigentuemer und antworten fuer diesen Kontext mit 404. */
function fremdBereiche(caseId: string, auftragId: string): Bereich[] {
  const base = `/cases/${caseId}`;
  return [
    { href: `/backoffice/auftraege/${auftragId}`, label: "Auftrag", icon: ClipboardCheck },
    { href: `${base}/unterlagen`, label: "Unterlagen", icon: LayoutPanelLeft },
  ];
}
```

Bei der Auswahl der Bereiche:

```ts
  const bereiche =
    variante === "fremd" && auftragId
      ? fremdBereiche(caseId, auftragId)
      : variante === "backoffice" && auftragId
        ? backofficeBereiche(caseId, auftragId)
        : fallBereiche(caseId);
```

- [ ] **Step 2: layout.tsx**

Die Berechnung ab `const eigene = ...` ersetzen:

```ts
  const fremd = ctx != null && akte != null && akte.organizationId !== ctx.organizationId;
  const auftrag = akte?.backofficeAuftraege[0] ?? null;
  const status = auftrag ? (auftrag.status as BackofficeStatus) : null;

  // Eigene Backoffice-Akte ODER Fremdakte mit eigenem Auftrag: der Kopf ist der Auftrag.
  const istBackofficeAkte = auftrag != null && ((!fremd && akte!.akteArt === "backoffice") || fremd);
  const zeigeLeiste =
    auftrag != null &&
    status != null &&
    ctx?.backofficeRolle != null &&
    (istBackofficeAkte || istAktiv(status));
```

und im JSX:

```tsx
      {istBackofficeAkte ? (
        <CaseNav caseId={id} variante={fremd ? "fremd" : "backoffice"} auftragId={auftrag.id} />
      ) : (
        <CaseNav caseId={id} />
      )}
```

Kommentar am Kopf ergänzen: „Eine Fremdakte (Auftrag der eigenen Backoffice-Organisation an einer Akte einer anderen Organisation) bekommt die Variante fremd; ob die Seite darunter sie zeigt, entscheidet requireCaseAccess.“

- [ ] **Step 3: page.tsx – Umleitung auch für Fremdakten**

```ts
  // Eine Backoffice-Akte hat keine Fallakte im Vertriebssinn; eine Fremdakte
  // (Cross-Org) zeigt diesem Kontext ihre Vertriebsdaten nicht. Beide: zum Auftrag.
  if (caseRow.akteArt === "backoffice" || caseRow.organizationId !== ctx.organizationId) {
```

Prüfen, dass `organizationId` im `select`/`include` der Abfrage darüber enthalten ist (bei `include` ist es automatisch dabei; bei `select` ergänzen).

- [ ] **Step 4: Typecheck, Build-Smoke**

Run: `npm run typecheck`
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/cases/\[id\]/layout.tsx src/app/\(app\)/cases/\[id\]/page.tsx src/components/case/case-nav.tsx
git commit -m "feat(backoffice): Fremdakte im Rahmen der Fallakte - Auftrag und Unterlagen, Umleitung zum Auftrag"
```

---

### Task 4: Übergabe-Karte mit Zielwahl und Statuskarte für fremde Backoffices

**Files:**
- Create: `src/lib/backoffice/uebergabe-ziele.ts`
- Modify: `src/lib/actions/backoffice-vertrieb.ts`
- Modify: `src/components/case/backoffice-uebergabe-karte.tsx`, `backoffice-uebergabe-form.tsx`, `backoffice-status-karte.tsx`
- Test: `tests/backoffice-cross-org-db.test.ts` (ergänzen)

**Interfaces:**
- Produces:
  ```ts
  export interface UebergabeZiel { schluessel: string; name: string; intern: boolean; auftraggeberId: string | null; backofficeOrganizationId: string }
  export async function ladeUebergabeZiele(organizationId: string): Promise<UebergabeZiel[]>
  ```
  `schluessel` ist `"intern"` für das eigene Backoffice, sonst die `auftraggeberId`.
- Consumes: `istBackofficeAktiv`, `eigenerAuftraggeber`, `erzeugeAuftrag`.

- [ ] **Step 1: DB-Test ergänzen**

In `tests/backoffice-cross-org-db.test.ts` einen weiteren `it` anhängen:

```ts
  it("ladeUebergabeZiele: A sieht B als Partner, kein eigenes Backoffice; C sieht nur sich", async () => {
    const { ladeUebergabeZiele } = await import("@/lib/backoffice/uebergabe-ziele");
    const zieleA = await ladeUebergabeZiele(org.A);
    expect(zieleA.map((z) => z.schluessel)).toEqual([agAinB]);
    expect(zieleA[0].backofficeOrganizationId).toBe(org.B);
    expect(zieleA[0].intern).toBe(false);
    const zieleC = await ladeUebergabeZiele(org.C);
    expect(zieleC.map((z) => z.schluessel)).toEqual(["intern"]);
  });
```

Run: `RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 2: uebergabe-ziele.ts**

```ts
import { prisma } from "@/lib/db";
import { istBackofficeAktiv } from "./feature";

/**
 * Wohin kann ein Vertriebsfall uebergeben werden? An das eigene Backoffice
 * (wenn freigeschaltet) und an jeden Backoffice-Partner, bei dem diese
 * Organisation als Auftraggeber verknuepft ist. Reihenfolge: eigenes zuerst.
 */
export interface UebergabeZiel {
  /** "intern" fuer das eigene Backoffice, sonst die Auftraggeber-ID beim Partner. */
  schluessel: string;
  name: string;
  intern: boolean;
  auftraggeberId: string | null;
  backofficeOrganizationId: string;
}

export async function ladeUebergabeZiele(organizationId: string): Promise<UebergabeZiel[]> {
  const ziele: UebergabeZiel[] = [];
  if (await istBackofficeAktiv(organizationId)) {
    ziele.push({ schluessel: "intern", name: "Eigenes Backoffice", intern: true, auftraggeberId: null, backofficeOrganizationId: organizationId });
  }
  const partner = await prisma.backofficeAuftraggeber.findMany({
    where: { organizationId, aktiv: true, abrechnungsmodell: { not: "intern" } },
    select: { id: true, backofficeOrganizationId: true, backofficeOrganization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const p of partner) {
    // Partner ohne aktives Backoffice-Flag koennen keine Auftraege bearbeiten.
    if (!(await istBackofficeAktiv(p.backofficeOrganizationId))) continue;
    ziele.push({
      schluessel: p.id,
      name: p.backofficeOrganization.name,
      intern: false,
      auftraggeberId: p.id,
      backofficeOrganizationId: p.backofficeOrganizationId,
    });
  }
  return ziele;
}
```

Run: `RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts` → PASS.

- [ ] **Step 3: Action mit Ziel**

`src/lib/actions/backoffice-vertrieb.ts` – nach der Prüfung `akteArt !== "vertrieb"`:

```ts
  const ziele = await ladeUebergabeZiele(ctx.organizationId);
  const zielSchluessel = String(fd.get("ziel") ?? "intern");
  const ziel = ziele.find((z) => z.schluessel === zielSchluessel);
  if (!ziel) return { error: "Dieses Backoffice steht nicht zur Verfügung." };
```

Die Zeile `if (!(await istBackofficeAktiv(ctx.organizationId))) ...` entfällt (steckt in den Zielen). Beim Erzeugen:

```ts
  const auftraggeberId = ziel.intern ? await eigenerAuftraggeber(ctx.organizationId) : ziel.auftraggeberId!;
  const ergebnis = await erzeugeAuftrag({
    backofficeOrganizationId: ziel.backofficeOrganizationId,
    auftraggeberId,
    ...
```

Revalidierung: zusätzlich `revalidatePath("/portal")` und `revalidatePath("/portal/auftraege")`.

- [ ] **Step 4: Karte und Formular**

`backoffice-uebergabe-karte.tsx`: statt `istBackofficeAktiv` die Ziele laden; ohne Ziele `null`. Die Sperre „läuft bereits“ ohne `backofficeOrganizationId`-Filter (jedes Backoffice zählt), `select` um `backofficeOrganizationId` ergänzen; der Link „Zum Auftrag“ nur, wenn `aktiver.backofficeOrganizationId === organizationId && istBackofficeNutzer`, sonst Link „Im Portal ansehen“ nach `/portal/auftraege/${aktiver.id}`. Beschreibung: „Unterlagenprüfung und Aufbereitung an ein Backoffice geben.“ Formular bekommt `ziele` als Prop:

```tsx
<BackofficeUebergabeForm caseId={caseId} ziele={ziele.map((z) => ({ schluessel: z.schluessel, name: z.name }))} />
```

`backoffice-uebergabe-form.tsx`: Prop `ziele: Array<{ schluessel: string; name: string }>`. Vor der Auftragsart ein Fieldset „Backoffice“: bei einem Ziel ein `<input type="hidden" name="ziel" value=…/>` plus Textzeile „Geht an: {name}“; bei mehreren Radio-Kacheln im selben Stil wie die Auftragsarten (`name="ziel"`, erstes vorgewählt).

- [ ] **Step 5: Statuskarte**

`backoffice-status-karte.tsx`: `where: { caseId }` (ohne `backofficeOrganizationId`), `select` um `backofficeOrganizationId: true`. Link-Block:

```tsx
        {auftrag.backofficeOrganizationId === organizationId ? (
          istBackofficeNutzer && (
            <div className="pt-2"><Link href={`/backoffice/auftraege/${auftrag.id}`} className="...">Zum Auftrag<ArrowRight .../></Link></div>
          )
        ) : (
          <div className="pt-2"><Link href={`/portal/auftraege/${auftrag.id}`} className="...">Im Auftraggeberportal ansehen<ArrowRight .../></Link></div>
        )}
```

(Klassen wie im bestehenden Link übernehmen.)

- [ ] **Step 6: Typecheck, Tests, Commit**

Run: `npm run typecheck && RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts`
Expected: grün.

```bash
git add src/lib/backoffice/uebergabe-ziele.ts src/lib/actions/backoffice-vertrieb.ts src/components/case/backoffice-uebergabe-karte.tsx src/components/case/backoffice-uebergabe-form.tsx src/components/case/backoffice-status-karte.tsx tests/backoffice-cross-org-db.test.ts
git commit -m "feat(backoffice): Uebergabe an Backoffice-Partner anderer Organisationen (Zielwahl, Statuskarte mit Portal-Link)"
```

---

### Task 5: Einreichungslink – Schema, Service, DB-Test

**Files:**
- Modify: `prisma/schema.prisma` (nach `BackofficeAuftraggeberKontakt`), `src/lib/domain/enums.ts:627-646`, `src/lib/backoffice/service.ts:76-216`
- Create: `prisma/sql/2026-09-06-einreichungslink.sql`, `src/lib/backoffice/einreichung.ts`
- Test: `tests/einreichung-db.test.ts`

**Interfaces:**
- Produces (einreichung.ts):
  ```ts
  export function buildEinreichungUrl(token: string): string
  export async function erzeugeEinreichungsLink(input: { auftraggeberId: string; backofficeOrganizationId: string; userId: string | null }): Promise<ServiceErgebnis<{ url: string }>>
  export async function deaktiviereEinreichungsLink(input: { auftraggeberId: string; backofficeOrganizationId: string; userId: string | null }): Promise<ServiceErgebnis>
  export async function ladeEinreichungsLinkStand(auftraggeberId: string): Promise<{ aktiv: boolean; seit: Date | null; zuletztGenutzt: Date | null; einreichungen: number }>
  export interface EinreichungsZiel { linkId: string; auftraggeberId: string; backofficeOrganizationId: string; auftraggeberName: string; backofficeName: string }
  export async function loeseEinreichungsToken(token: string): Promise<EinreichungsZiel | null>
  export interface Einreichung { antragsteller1: { vorname: string; nachname: string; email?: string | null; phone?: string | null }; antragsteller2?: { vorname: string; nachname: string } | null; auftragsart: string; referenzExtern?: string | null; hinweise?: string | null; ansprechperson: { name: string; email?: string | null; phone?: string | null } }
  export async function reicheEin(ziel: EinreichungsZiel, e: Einreichung, jetzt?: Date): Promise<ServiceErgebnis<{ auftragsnummer: string; auftragId: string; caseId: string; uploadToken: string }>>
  ```
- `AuftragAnlage.quelle` erweitert um `"einreichung"`; `AuftragAnlage.antragsteller2?: { vorname?; nachname? } | null`.
- `AUDIT_ACTIONS` + `"backoffice.einreichungslink_geaendert"`, `"backoffice.einreichung"`.

- [ ] **Step 1: Schema und SQL**

`prisma/schema.prisma` – nach dem Modell `BackofficeAuftraggeberKontakt`:

```prisma
/// Geheimer Einreichungslink eines Auftraggebers ohne BaufiDesk-Konto:
/// Auftraege entstehen ueber ein oeffentliches Formular; Rueckfragen und
/// Ergebnis laufen persoenlich ueber das Backoffice. Genau ein aktiver Link
/// je Auftraggeber; Erneuern deaktiviert den alten. Token nur gehasht.
model BackofficeEinreichungsLink {
  id             String                 @id @default(cuid())
  auftraggeberId String
  auftraggeber   BackofficeAuftraggeber @relation(fields: [auftraggeberId], references: [id], onDelete: Cascade)
  tokenHash      String                 @unique
  aktiv          Boolean                @default(true)
  erstelltVonId  String?
  zuletztGenutzt DateTime?
  einreichungen  Int                    @default(0)
  createdAt      DateTime               @default(now())

  @@index([auftraggeberId, aktiv])
  @@map("backoffice_einreichungs_links")
}
```

Im Modell `BackofficeAuftraggeber` die Relation ergänzen: `einreichungsLinks BackofficeEinreichungsLink[]`.

`prisma/sql/2026-09-06-einreichungslink.sql`:

```sql
-- Einreichungslink je Backoffice-Auftraggeber (06.09.2026). Nur CREATE, kein DROP.
CREATE TABLE IF NOT EXISTS "backoffice_einreichungs_links" (
  "id" TEXT PRIMARY KEY,
  "auftraggeberId" TEXT NOT NULL REFERENCES "backoffice_auftraggeber"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  "erstelltVonId" TEXT,
  "zuletztGenutzt" TIMESTAMP(3),
  "einreichungen" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_einreichungs_links_tokenHash_key" ON "backoffice_einreichungs_links"("tokenHash");
CREATE INDEX IF NOT EXISTS "backoffice_einreichungs_links_auftraggeberId_aktiv_idx" ON "backoffice_einreichungs_links"("auftraggeberId", "aktiv");
```

Run: `npx prisma generate` (lokal `npm run db:push` gegen die PGlite-/lokale DB, falls die lokale Entwicklungsdatenbank läuft; die Tests starten PGlite selbst aus dem Schema).

- [ ] **Step 2: Audit-Aktionen**

In `src/lib/domain/enums.ts` nach `"backoffice.vertrieb_uebergabe",` einfügen:

```ts
  "backoffice.einreichungslink_geaendert",
  "backoffice.einreichung",
```

- [ ] **Step 3: DB-Test schreiben**

`tests/einreichung-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
  process.env.APP_BASE_URL = "https://test.local";
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Einreichungslink gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/einreichung-db.test.ts
 */
describe.runIf(RUN)("Einreichungslink (PGlite)", () => {
  let prisma: any;
  let mod: typeof import("@/lib/backoffice/einreichung");
  let orgB: string;
  let orgOhneFlag: string;
  let manager: any;
  let ag: string;
  let agIntern: string;
  let agOhneFlag: string;
  let token: string;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    orgB = (await prisma.organization.create({ data: { name: "Backoffice B", slug: "einr-b" } })).id;
    orgOhneFlag = (await prisma.organization.create({ data: { name: "Ohne Flag", slug: "einr-o" } })).id;
    await prisma.featureFlag.create({ data: { organizationId: orgB, key: "backoffice", enabled: true } });
    manager = await prisma.user.create({ data: { organizationId: orgB, email: "m@einr.de", name: "M", role: "org_admin", backofficeRolle: "manager" } });
    ag = (await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: orgB, name: "Makler Müller", abrechnungsmodell: "abo", kontingentMonatlich: 3 } })).id;
    agIntern = (await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: orgB, organizationId: orgB, name: "Eigen", abrechnungsmodell: "intern" } })).id;
    agOhneFlag = (await prisma.backofficeAuftraggeber.create({ data: { backofficeOrganizationId: orgOhneFlag, name: "X" } })).id;
    mod = await import("@/lib/backoffice/einreichung");
  }, 180_000);

  it("erzeugt einen Link, Klartext nur einmal, Hash in der DB", async () => {
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.url.startsWith("https://test.local/einreichen/")).toBe(true);
    token = r.wert.url.split("/einreichen/")[1];
    const zeile = await prisma.backofficeEinreichungsLink.findFirst({ where: { auftraggeberId: ag, aktiv: true } });
    expect(zeile.tokenHash).not.toBe(token);
  });

  it("verweigert den Link fuer das Modell intern und fuer fremde Auftraggeber", async () => {
    expect((await mod.erzeugeEinreichungsLink({ auftraggeberId: agIntern, backofficeOrganizationId: orgB, userId: manager.id })).ok).toBe(false);
    expect((await mod.erzeugeEinreichungsLink({ auftraggeberId: agOhneFlag, backofficeOrganizationId: orgB, userId: manager.id })).ok).toBe(false);
  });

  it("loest das Token auf; unbekannt, deaktiviert und Flag aus sehen gleich aus (null)", async () => {
    const ziel = await mod.loeseEinreichungsToken(token);
    expect(ziel?.auftraggeberName).toBe("Makler Müller");
    expect(ziel?.backofficeName).toBe("Backoffice B");
    expect(await mod.loeseEinreichungsToken("gibt-es-nicht")).toBeNull();
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: agOhneFlag, backofficeOrganizationId: orgOhneFlag, userId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await mod.loeseEinreichungsToken(r.wert.url.split("/einreichen/")[1])).toBeNull();
  });

  it("reicheEin erzeugt Backoffice-Akte, Auftrag mit Quelle einreichung, zwei Antragsteller und einen Upload-Link", async () => {
    const ziel = (await mod.loeseEinreichungsToken(token))!;
    const r = await mod.reicheEin(ziel, {
      antragsteller1: { vorname: "Erika", nachname: "Muster", email: "e@m.de" },
      antragsteller2: { vorname: "Max", nachname: "Muster" },
      auftragsart: "basis_pruefung",
      referenzExtern: "MM-17",
      hinweise: "Bitte Eile",
      ansprechperson: { name: "Frau Müller", email: "mueller@makler.de", phone: "0171" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const auftrag = await prisma.backofficeAuftrag.findUnique({ where: { id: r.wert.auftragId } });
    expect(auftrag.quelle).toBe("einreichung");
    expect(auftrag.auftraggeberId).toBe(ag);
    expect(auftrag.hinweiseAuftraggeber).toContain("Frau Müller");
    expect(auftrag.referenzExtern).toBe("MM-17");
    const akte = await prisma.case.findUnique({ where: { id: r.wert.caseId }, include: { applicants: true, uploadLinks: true } });
    expect(akte.akteArt).toBe("backoffice");
    expect(akte.organizationId).toBe(orgB);
    expect(akte.applicants.map((a: any) => a.vorname).sort()).toEqual(["Erika", "Max"]);
    expect(akte.uploadLinks).toHaveLength(1);
    expect(r.wert.uploadToken.length).toBeGreaterThan(10);
    const link = await prisma.backofficeEinreichungsLink.findFirst({ where: { auftraggeberId: ag, aktiv: true } });
    expect(link.einreichungen).toBe(1);
    expect(link.zuletztGenutzt).toBeTruthy();
    const { nurVertrieb } = await import("@/lib/cases/aktenart");
    expect(await prisma.case.count({ where: { organizationId: orgB, ...nurVertrieb } })).toBe(0);
  });

  it("Erneuern deaktiviert den alten Link, Deaktivieren laesst keinen aktiven zurueck", async () => {
    const r = await mod.erzeugeEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(r.ok).toBe(true);
    expect(await mod.loeseEinreichungsToken(token)).toBeNull();
    expect(await prisma.backofficeEinreichungsLink.count({ where: { auftraggeberId: ag, aktiv: true } })).toBe(1);
    const d = await mod.deaktiviereEinreichungsLink({ auftraggeberId: ag, backofficeOrganizationId: orgB, userId: manager.id });
    expect(d.ok).toBe(true);
    expect((await mod.ladeEinreichungsLinkStand(ag)).aktiv).toBe(false);
  });
});
```

Falls die Relation `Case.uploadLinks` anders heißt, den Namen aus `prisma/schema.prisma` (Modell `Case`, Relation zu `UploadLink`) übernehmen.

Run: `RUN_DB_IT=1 npx vitest run tests/einreichung-db.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 4: service.ts – quelle „einreichung“, zweiter Antragsteller**

`AuftragAnlage`: `quelle: "manuell" | "portal" | "vertrieb_uebergabe" | "einreichung";` und `antragsteller2?: { vorname?: string | null; nachname?: string | null } | null;`. Im `tx.case.create` das `applicants.create`-Array:

```ts
            applicants: {
              create: [
                { position: 1, vorname: ..., nachname: ..., email: ..., phone: ... },
                ...(input.antragsteller2 && (input.antragsteller2.vorname || input.antragsteller2.nachname)
                  ? [{ position: 2, vorname: input.antragsteller2.vorname?.trim() || null, nachname: input.antragsteller2.nachname?.trim() || null }]
                  : []),
              ],
            },
```

Im `protokolliere`-Aufruf am Ende: `text: input.quelle === "einreichung" ? \`Auftrag ${erzeugt.auftragsnummer} über Einreichungslink eingegangen\` : \`Auftrag ${erzeugt.auftragsnummer} eingegangen\``, `audit: input.quelle === "vertrieb_uebergabe" ? "backoffice.vertrieb_uebergabe" : input.quelle === "einreichung" ? "backoffice.einreichung" : "backoffice.auftrag_erstellt"`.

- [ ] **Step 5: einreichung.ts**

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { createLinkToken, hashToken } from "@/lib/security/upload-token";
import { createSecureUploadLink } from "@/lib/security/upload-link";
import { istBackofficeAktiv } from "./feature";
import { erzeugeAuftrag, type ServiceErgebnis } from "./service";

/**
 * Einreichungslink: die Eingangstuer fuer Auftraggeber ohne BaufiDesk-Konto.
 * Reine Einreichung - keine Statusansicht, kein Ergebnis, kein Versand.
 */

/** Gueltigkeit des Upload-Links, den eine Einreichung erzeugt. */
const UPLOAD_LINK_STUNDEN = 72;
const UPLOAD_LINK_MAX = 50;

export function buildEinreichungUrl(token: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/einreichen/${token}`;
}

async function ladeAuftraggeber(auftraggeberId: string, backofficeOrganizationId: string) {
  return prisma.backofficeAuftraggeber.findFirst({
    where: { id: auftraggeberId, backofficeOrganizationId, aktiv: true, abrechnungsmodell: { not: "intern" } },
    select: { id: true },
  });
}

export async function erzeugeEinreichungsLink(input: {
  auftraggeberId: string;
  backofficeOrganizationId: string;
  userId: string | null;
}): Promise<ServiceErgebnis<{ url: string }>> {
  const ag = await ladeAuftraggeber(input.auftraggeberId, input.backofficeOrganizationId);
  if (!ag) return { ok: false, grund: "Für diesen Auftraggeber gibt es keinen Einreichungslink." };
  const token = createLinkToken();
  await prisma.$transaction([
    prisma.backofficeEinreichungsLink.updateMany({ where: { auftraggeberId: ag.id, aktiv: true }, data: { aktiv: false } }),
    prisma.backofficeEinreichungsLink.create({ data: { auftraggeberId: ag.id, tokenHash: hashToken(token), erstelltVonId: input.userId } }),
  ]);
  await audit({
    organizationId: input.backofficeOrganizationId,
    userId: input.userId,
    action: "backoffice.einreichungslink_geaendert",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { aktion: "erzeugt" },
  });
  return { ok: true, wert: { url: buildEinreichungUrl(token) } };
}

export async function deaktiviereEinreichungsLink(input: {
  auftraggeberId: string;
  backofficeOrganizationId: string;
  userId: string | null;
}): Promise<ServiceErgebnis> {
  const ag = await ladeAuftraggeber(input.auftraggeberId, input.backofficeOrganizationId);
  if (!ag) return { ok: false, grund: "Auftraggeber nicht gefunden." };
  await prisma.backofficeEinreichungsLink.updateMany({ where: { auftraggeberId: ag.id, aktiv: true }, data: { aktiv: false } });
  await audit({
    organizationId: input.backofficeOrganizationId,
    userId: input.userId,
    action: "backoffice.einreichungslink_geaendert",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { aktion: "deaktiviert" },
  });
  return { ok: true, wert: undefined };
}

export async function ladeEinreichungsLinkStand(auftraggeberId: string) {
  const link = await prisma.backofficeEinreichungsLink.findFirst({
    where: { auftraggeberId, aktiv: true },
    select: { createdAt: true, zuletztGenutzt: true, einreichungen: true },
  });
  return { aktiv: link != null, seit: link?.createdAt ?? null, zuletztGenutzt: link?.zuletztGenutzt ?? null, einreichungen: link?.einreichungen ?? 0 };
}

export interface EinreichungsZiel {
  linkId: string;
  auftraggeberId: string;
  backofficeOrganizationId: string;
  auftraggeberName: string;
  backofficeName: string;
}

/**
 * Token -> Ziel. Unbekannt, deaktiviert, Auftraggeber inaktiv und Backoffice
 * ohne Flag antworten gleich (null): Wer raet, erfaehrt nichts.
 */
export async function loeseEinreichungsToken(token: string): Promise<EinreichungsZiel | null> {
  if (!token || token.length > 128) return null;
  const link = await prisma.backofficeEinreichungsLink.findFirst({
    where: { tokenHash: hashToken(token), aktiv: true, auftraggeber: { aktiv: true, abrechnungsmodell: { not: "intern" } } },
    select: {
      id: true,
      auftraggeber: { select: { id: true, name: true, backofficeOrganizationId: true, backofficeOrganization: { select: { name: true } } } },
    },
  });
  if (!link) return null;
  if (!(await istBackofficeAktiv(link.auftraggeber.backofficeOrganizationId))) return null;
  return {
    linkId: link.id,
    auftraggeberId: link.auftraggeber.id,
    backofficeOrganizationId: link.auftraggeber.backofficeOrganizationId,
    auftraggeberName: link.auftraggeber.name,
    backofficeName: link.auftraggeber.backofficeOrganization.name,
  };
}

export interface Einreichung {
  antragsteller1: { vorname: string; nachname: string; email?: string | null; phone?: string | null };
  antragsteller2?: { vorname: string; nachname: string } | null;
  auftragsart: string;
  referenzExtern?: string | null;
  hinweise?: string | null;
  ansprechperson: { name: string; email?: string | null; phone?: string | null };
}

/**
 * Fuehrt eine Einreichung aus: Akte + Auftrag (Quelle einreichung) ueber den
 * Backoffice-Service, dazu ein normaler Kunden-Upload-Link fuer die neue
 * Akte. Der Upload-Token steht nur in dieser Antwort.
 */
export async function reicheEin(
  ziel: EinreichungsZiel,
  e: Einreichung,
  jetzt = new Date()
): Promise<ServiceErgebnis<{ auftragsnummer: string; auftragId: string; caseId: string; uploadToken: string }>> {
  const ansprech = [e.ansprechperson.name, e.ansprechperson.email, e.ansprechperson.phone].filter(Boolean).join(", ");
  const hinweise = [e.hinweise?.trim() || null, ansprech ? `Ansprechperson: ${ansprech}` : null].filter(Boolean).join("\n\n");
  const erzeugt = await erzeugeAuftrag({
    backofficeOrganizationId: ziel.backofficeOrganizationId,
    auftraggeberId: ziel.auftraggeberId,
    antragsteller: e.antragsteller1,
    antragsteller2: e.antragsteller2 ?? null,
    auftragsart: e.auftragsart,
    referenzExtern: e.referenzExtern ?? null,
    hinweiseAuftraggeber: hinweise || null,
    quelle: "einreichung",
    erstelltVonId: null,
    jetzt,
  });
  if (!erzeugt.ok) return erzeugt;
  const ablauf = new Date(jetzt.getTime() + UPLOAD_LINK_STUNDEN * 3600 * 1000);
  const upload = await createSecureUploadLink(erzeugt.wert.caseId, ablauf, {
    maxUploads: UPLOAD_LINK_MAX,
    organizationId: ziel.backofficeOrganizationId,
    actorUserId: null,
  });
  await prisma.backofficeEinreichungsLink.update({
    where: { id: ziel.linkId },
    data: { zuletztGenutzt: jetzt, einreichungen: { increment: 1 } },
  });
  return { ok: true, wert: { auftragsnummer: erzeugt.wert.auftragsnummer, auftragId: erzeugt.wert.id, caseId: erzeugt.wert.caseId, uploadToken: upload.token } };
}
```

Run: `RUN_DB_IT=1 npx vitest run tests/einreichung-db.test.ts tests/backoffice-service-db.test.ts` → PASS. Zusätzlich `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-09-06-einreichungslink.sql src/lib/domain/enums.ts src/lib/backoffice/service.ts src/lib/backoffice/einreichung.ts tests/einreichung-db.test.ts
git commit -m "feat(backoffice): Einreichungslink - Modell, Service, Token-Aufloesung, Einreichung mit Upload-Link"
```

---

### Task 6: Einreichungslink – Manager-Block, öffentliche Route, Action

**Files:**
- Modify: `src/lib/actions/backoffice.ts` (zwei Actions anhängen), `src/app/(app)/backoffice/auftraggeber/[id]/page.tsx`, `src/app/(app)/backoffice/auftraege/[id]/page.tsx:367`, `src/middleware.ts:28-48`
- Create: `src/components/backoffice/einreichungslink-block.tsx`, `src/lib/actions/einreichung.ts`, `src/components/einreichung/einreichung-form.tsx`, `src/app/einreichen/[token]/page.tsx`, `src/app/einreichen/[token]/danke/page.tsx`
- Test: `tests/einreichung-action.test.ts`

**Interfaces:**
- Consumes: alles aus Task 5.
- Produces:
  ```ts
  // src/lib/actions/backoffice.ts
  export async function einreichungsLinkErzeugenAction(_prev: { url?: string; error?: string }, fd: FormData): Promise<{ url?: string; error?: string }>
  export async function einreichungsLinkDeaktivierenAction(auftraggeberId: string): Promise<AktionsErgebnis>
  // src/lib/actions/einreichung.ts
  export type EinreichungState = { error?: string; fieldErrors?: Record<string, string> }
  export async function einreichungAbsendenAction(token: string, _prev: EinreichungState, fd: FormData): Promise<EinreichungState>
  ```

- [ ] **Step 1: Unit-Test für die Action**

`tests/einreichung-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const reicheEin = vi.fn();
const loeseEinreichungsToken = vi.fn();
const checkRateLimit = vi.fn(async () => ({ ok: true }));
const redirect = vi.fn((u: string) => { throw new Error("NEXT_REDIRECT:" + u); });

vi.mock("@/lib/backoffice/einreichung", () => ({ reicheEin, loeseEinreichungsToken }));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-real-ip", "1.2.3.4"]]) }));

const ziel = { linkId: "l1", auftraggeberId: "ag", backofficeOrganizationId: "b", auftraggeberName: "Makler", backofficeName: "BO" };

function fd(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

const gueltig = {
  vorname1: "Erika", nachname1: "Muster", email1: "e@m.de", phone1: "",
  vorname2: "", nachname2: "",
  auftragsart: "basis_pruefung", referenz: "MM-1", hinweise: "",
  ansprechName: "Frau Müller", ansprechEmail: "m@m.de", ansprechPhone: "",
  firmenzusatz: "",
};

describe("einreichungAbsendenAction", () => {
  beforeEach(() => {
    reicheEin.mockReset();
    loeseEinreichungsToken.mockReset();
    checkRateLimit.mockClear();
    redirect.mockClear();
    loeseEinreichungsToken.mockResolvedValue(ziel);
    reicheEin.mockResolvedValue({ ok: true, wert: { auftragsnummer: "BO-2026-0001", auftragId: "a", caseId: "c", uploadToken: "tok" } });
  });

  it("Honeypot gefuellt: leitet scheinbar erfolgreich weiter, legt nichts an", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    await expect(einreichungAbsendenAction("t", {}, fd({ ...gueltig, firmenzusatz: "Bot GmbH" }))).rejects.toThrow("NEXT_REDIRECT:/einreichen/t/danke");
    expect(reicheEin).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("Rate-Limit greift vor der Datenbank", async () => {
    checkRateLimit.mockResolvedValueOnce({ ok: false, retryAfterSec: 60 });
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd(gueltig));
    expect(r.error).toMatch(/später/);
    expect(loeseEinreichungsToken).not.toHaveBeenCalled();
  });

  it("ungueltiges Token: neutrale Fehlermeldung", async () => {
    loeseEinreichungsToken.mockResolvedValueOnce(null);
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd(gueltig));
    expect(r.error).toMatch(/nicht mehr gültig/);
    expect(reicheEin).not.toHaveBeenCalled();
  });

  it("Pflichtfelder: Name des Antragstellers, Auftragsart, Ansprechperson", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    const r = await einreichungAbsendenAction("t", {}, fd({ ...gueltig, nachname1: "", auftragsart: "", ansprechName: "" }));
    expect(r.fieldErrors).toMatchObject({ nachname1: expect.any(String), auftragsart: expect.any(String), ansprechName: expect.any(String) });
    expect(reicheEin).not.toHaveBeenCalled();
  });

  it("gueltig: reicht ein und leitet mit Nummer und Upload-Token weiter", async () => {
    const { einreichungAbsendenAction } = await import("@/lib/actions/einreichung");
    await expect(einreichungAbsendenAction("t", {}, fd(gueltig))).rejects.toThrow("NEXT_REDIRECT:/einreichen/t/danke?nr=BO-2026-0001&upload=tok");
    expect(reicheEin).toHaveBeenCalledWith(ziel, expect.objectContaining({
      antragsteller1: expect.objectContaining({ vorname: "Erika", nachname: "Muster" }),
      antragsteller2: null,
      auftragsart: "basis_pruefung",
      ansprechperson: expect.objectContaining({ name: "Frau Müller" }),
    }));
  });
});
```

Run: `npx vitest run tests/einreichung-action.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 2: Action**

`src/lib/actions/einreichung.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { loeseEinreichungsToken, reicheEin } from "@/lib/backoffice/einreichung";

/**
 * Oeffentliche Server Action des Einreichungslinks. Kein Nutzerkontext: Der
 * Token ist der einzige Schluessel. Reihenfolge wie beim Anfrageformular -
 * Honeypot, dann Zaehler, dann erst die Datenbank.
 */

export type EinreichungState = { error?: string; fieldErrors?: Record<string, string> };

/** Einreichungen je Link und IP je Stunde. */
const MAX_JE_IP_STUNDE = 10;
/** Einreichungen je Link je Tag - ueber alle IPs. */
const MAX_JE_LINK_TAG = 60;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function text(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function einreichungAbsendenAction(token: string, _prev: EinreichungState, fd: FormData): Promise<EinreichungState> {
  // Honigtoepfchen: gefuellt heisst Maschine. Freundlich weiterleiten, nichts anlegen.
  if (text(fd, "firmenzusatz") !== "") redirect(`/einreichen/${encodeURIComponent(token)}/danke`);

  const ip = await clientIp();
  const grenzeIp = await checkRateLimit(`einreichung:${token.slice(0, 16)}:${ip}`, MAX_JE_IP_STUNDE, 3600);
  if (!grenzeIp.ok) return { error: "Zu viele Einreichungen. Bitte versuchen Sie es später noch einmal." };
  const grenzeLink = await checkRateLimit(`einreichung:${token.slice(0, 16)}`, MAX_JE_LINK_TAG, 86400);
  if (!grenzeLink.ok) return { error: "Zu viele Einreichungen. Bitte versuchen Sie es später noch einmal." };

  const ziel = await loeseEinreichungsToken(token);
  if (!ziel) return { error: "Dieser Link ist nicht mehr gültig. Bitte wenden Sie sich an Ihr Backoffice." };

  const fieldErrors: Record<string, string> = {};
  const vorname1 = text(fd, "vorname1");
  const nachname1 = text(fd, "nachname1");
  const auftragsart = text(fd, "auftragsart", 60);
  const ansprechName = text(fd, "ansprechName");
  if (!nachname1) fieldErrors.nachname1 = "Bitte den Nachnamen angeben.";
  if (!auftragsart) fieldErrors.auftragsart = "Bitte eine Auftragsart wählen.";
  if (!ansprechName) fieldErrors.ansprechName = "Bitte eine Ansprechperson angeben.";
  if (Object.keys(fieldErrors).length > 0) return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };

  const vorname2 = text(fd, "vorname2");
  const nachname2 = text(fd, "nachname2");
  const ergebnis = await reicheEin(ziel, {
    antragsteller1: { vorname: vorname1, nachname: nachname1, email: text(fd, "email1") || null, phone: text(fd, "phone1", 60) || null },
    antragsteller2: vorname2 || nachname2 ? { vorname: vorname2, nachname: nachname2 } : null,
    auftragsart,
    referenzExtern: text(fd, "referenz", 120) || null,
    hinweise: text(fd, "hinweise", 4000) || null,
    ansprechperson: { name: ansprechName, email: text(fd, "ansprechEmail") || null, phone: text(fd, "ansprechPhone", 60) || null },
  });
  if (!ergebnis.ok) return { error: ergebnis.grund };

  const q = new URLSearchParams({ nr: ergebnis.wert.auftragsnummer, upload: ergebnis.wert.uploadToken });
  redirect(`/einreichen/${encodeURIComponent(token)}/danke?${q.toString()}`);
}
```

Run: `npx vitest run tests/einreichung-action.test.ts` → PASS.

- [ ] **Step 3: Öffentliche Seiten**

`src/middleware.ts`: in `PUBLIC_PREFIXES` nach `"/anfrage",` die Zeile `"/einreichen",` mit Kommentar „Einreichungslink des Backoffice: Externe ohne Konto, Geheimnis im Pfad.“ Den Kopfkommentar der Datei (Zeile 12–16) um `/einreichen/*` ergänzen.

`src/app/einreichen/[token]/page.tsx`:

```tsx
import { Logo } from "@/components/brand/logo";
import { loeseEinreichungsToken } from "@/lib/backoffice/einreichung";
import { AUFTRAGSARTEN } from "@/lib/backoffice/leistungen";
import { EinreichungForm } from "@/components/einreichung/einreichung-form";

export const dynamic = "force-dynamic";

export default async function EinreichenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ziel = await loeseEinreichungsToken(token);

  if (!ziel) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
        <Logo />
        <h1 className="text-lg font-semibold">Dieser Link ist nicht mehr gültig</h1>
        <p className="text-sm text-muted-foreground">
          Bitte wenden Sie sich an Ihr Backoffice, um einen neuen Einreichungslink zu erhalten.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-6">
      <Logo />
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{ziel.backofficeName}</p>
        <h1 className="text-xl font-semibold">Auftrag einreichen</h1>
        <p className="text-sm text-muted-foreground">Für {ziel.auftraggeberName}. Nach dem Absenden können Sie die Unterlagen direkt hochladen.</p>
      </header>
      <EinreichungForm
        token={token}
        auftragsarten={AUFTRAGSARTEN.map((a) => ({ key: a.key, label: a.label, beschreibung: a.beschreibung ?? "" }))}
      />
      <p className="mt-auto text-xs text-muted-foreground">
        Ihre Angaben werden verschlüsselt übertragen und ausschließlich zur Bearbeitung dieses Auftrags verwendet.{" "}
        <a href="/datenschutz" className="underline">Datenschutzhinweise</a>
      </p>
    </main>
  );
}
```

(Feldnamen von `AUFTRAGSARTEN` – `label`, `beschreibung` – gegen `src/lib/backoffice/leistungen.ts` prüfen und anpassen.)

`src/app/einreichen/[token]/danke/page.tsx`:

```tsx
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Bestaetigung nach der Einreichung. Der Upload-Token kommt nur in dieser
 * einen Antwort; danach kann nur das Backoffice einen neuen Link erzeugen.
 * Ohne Parameter (Honeypot-Weiterleitung) steht hier nur der Dank.
 */
export default async function EinreichenDankePage({ searchParams }: { searchParams: Promise<{ nr?: string; upload?: string }> }) {
  const { nr, upload } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Logo />
      <h1 className="text-xl font-semibold">Vielen Dank, Ihr Auftrag ist eingegangen</h1>
      {nr && <p className="text-sm">Auftragsnummer: <span className="font-medium">{nr}</span>. Bitte nennen Sie sie bei Rückfragen.</p>}
      {upload ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm">Laden Sie jetzt die Unterlagen hoch. Dieser Upload-Zugang gilt 72 Stunden und ist nur über diese Seite erreichbar.</p>
          <Button asChild><a href={`/upload/${encodeURIComponent(upload)}`}>Unterlagen jetzt hochladen</a></Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Das Backoffice meldet sich bei Ihrer Ansprechperson.</p>
      )}
    </main>
  );
}
```

`src/components/einreichung/einreichung-form.tsx` (Client-Komponente, `useActionState` mit `einreichungAbsendenAction.bind(null, token)`): Fieldsets „Antragsteller“ (vorname1, nachname1, email1, phone1), „Zweiter Antragsteller (optional)“ (vorname2, nachname2), „Auftragsart“ (Radio-Kacheln wie in `backoffice-uebergabe-form.tsx`, `name="auftragsart"`, erste vorgewählt), „Referenz und Hinweise“ (referenz, hinweise Textarea), „Ansprechperson bei Ihnen“ (ansprechName, ansprechEmail, ansprechPhone), Honeypot:

```tsx
<div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
  <label>Firmenzusatz<input type="text" name="firmenzusatz" tabIndex={-1} autoComplete="off" /></label>
</div>
```

Fehler aus `state.error` oben, `state.fieldErrors[feld]` unter dem Feld, `SubmitButton` „Auftrag einreichen“. Bausteine: `Input`, `Label`, `Textarea`, `SubmitButton` aus `@/components/ui`.

- [ ] **Step 4: Manager-Block und Actions**

`src/lib/actions/backoffice.ts` (am Ende, Import `erzeugeEinreichungsLink`, `deaktiviereEinreichungsLink` aus `@/lib/backoffice/einreichung`):

```ts
// ---------------------------------------------------------------------------
// Einreichungslink
// ---------------------------------------------------------------------------

export async function einreichungsLinkErzeugenAction(_prev: { url?: string; error?: string }, fd: FormData): Promise<{ url?: string; error?: string }> {
  const ctx = await requireBackofficeManager();
  const auftraggeberId = text(fd, "auftraggeberId");
  const r = await erzeugeEinreichungsLink({ auftraggeberId, backofficeOrganizationId: ctx.organizationId, userId: ctx.userId });
  if (!r.ok) return { error: r.grund };
  revalidatePath(`/backoffice/auftraggeber/${auftraggeberId}`);
  return { url: r.wert.url };
}

export async function einreichungsLinkDeaktivierenAction(auftraggeberId: string): Promise<AktionsErgebnis> {
  const ctx = await requireBackofficeManager();
  const r = await deaktiviereEinreichungsLink({ auftraggeberId, backofficeOrganizationId: ctx.organizationId, userId: ctx.userId });
  if (!r.ok) return { error: r.grund };
  revalidatePath(`/backoffice/auftraggeber/${auftraggeberId}`);
  return { ok: true };
}
```

`src/components/backoffice/einreichungslink-block.tsx` (Client): Props `{ auftraggeberId: string; stand: { aktiv: boolean; seit: string | null; zuletztGenutzt: string | null; einreichungen: number } }`. Zeigt Status („Aktiv seit …“, „Zuletzt genutzt …“, „n Einreichungen“ oder „Kein aktiver Link“), Formular mit `useActionState(einreichungsLinkErzeugenAction, {})` und Knopf „Link erzeugen“ bzw. „Link erneuern“; nach Erfolg den Klartext-Link in einem `readOnly`-Input mit Hinweis „Nur jetzt sichtbar. Kopieren und dem Auftraggeber persönlich geben.“; zweiter Knopf „Deaktivieren“ ruft `einreichungsLinkDeaktivierenAction` in einer `startTransition`. Kein automatischer Versand.

`src/app/(app)/backoffice/auftraggeber/[id]/page.tsx`: `ladeEinreichungsLinkStand(ag.id)` laden; unterhalb der Verknüpfungs-Karte (nur `manager && !intern`) eine `Card` „Einreichungslink“ mit `CardDescription` „Für Auftraggeber ohne BaufiDesk-Konto: Aufträge über einen geheimen Link einreichen. Der Link zeigt keine Aufträge und keine Ergebnisse.“ und darin `<EinreichungslinkBlock auftraggeberId={ag.id} stand={{ ...stand, seit: stand.seit?.toISOString() ?? null, zuletztGenutzt: stand.zuletztGenutzt?.toISOString() ?? null }} />`.

`src/app/(app)/backoffice/auftraege/[id]/page.tsx:367`: Quelle-Label um `auftrag.quelle === "einreichung" ? "Einreichungslink"` ergänzen.

- [ ] **Step 5: Typecheck, Tests, Build**

Run: `npm run typecheck && npx vitest run tests/einreichung-action.test.ts tests/dokument-zugriff-vertrag.test.ts && npm run build`
Expected: grün. Fällt `dokument-zugriff-vertrag` über `src/lib/actions/einreichung.ts` (kein Guard importiert): Die Datei lädt weder Dokumente noch `prisma.case` – prüfen, dass sie nicht als Kandidat gilt (Muster `prisma\.document\.|documentId|prisma\.case\.find` trifft nicht). Trifft sie doch, `loeseEinreichungsToken` als erlaubten Guard eintragen mit Begründung „Token-Guard ohne Nutzerkontext“.

- [ ] **Step 6: Commit**

```bash
git add -A src tests/einreichung-action.test.ts
git commit -m "feat(backoffice): oeffentlicher Einreichungslink - Formular, Bestaetigung mit Upload, Manager-Block"
```

---

### Task 7: Vertragstest mit Aufrufreihenfolge

**Files:**
- Modify: `tests/dokument-zugriff-vertrag.test.ts`

- [ ] **Step 1: Prüfung ergänzen**

Am Ende der Datei, vor der schließenden `});` des `describe`, ein neuer Block. Zuerst Helfer oberhalb von `describe`:

```ts
/**
 * Schneidet exportierte async-Funktionen in Ruempfe: [name, rumpf]. Klammer-
 * zaehlung ab der ersten "{" nach dem Funktionskopf; Strings mit
 * unbalancierten Klammern gibt es in den Actions nicht - kippt das, meldet
 * der Selbsttest unten die Datei.
 */
function funktionsRuempfe(src: string): Array<{ name: string; rumpf: string }> {
  const out: Array<{ name: string; rumpf: string }> = [];
  const re = /export async function (\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = src.indexOf("{", re.lastIndex);
    if (start < 0) continue;
    let tiefe = 0;
    let i = start;
    for (; i < src.length; i++) {
      if (src[i] === "{") tiefe++;
      else if (src[i] === "}") {
        tiefe--;
        if (tiefe === 0) break;
      }
    }
    out.push({ name: m[1], rumpf: src.slice(start, i + 1) });
  }
  return out;
}

const GUARD_AUFRUF = new RegExp(`\\b(${ERLAUBTE_GUARDS.join("|")}|eigeneAkteWhere|requireBackoffice|requireBackofficeManager|requirePortal|requirePlatformAdmin)\\s*\\(`);
const DB_ZUGRIFF = /\b(prisma|tx)\./;

/**
 * Funktionen, die vor dem Guard in die Datenbank duerfen - jede mit Grund.
 * Schluessel: "<Pfad relativ>#<Funktion>".
 */
const REIHENFOLGE_AUSNAHMEN: Record<string, string> = {};
```

Dann der Block im `describe`:

```ts
  describe("Reihenfolge: Guard vor dem ersten Datenbankzugriff", () => {
    for (const datei of kandidaten) {
      const rel = datei.slice(WURZEL.length + 1);
      const ruempfe = funktionsRuempfe(readFileSync(datei, "utf-8"));
      for (const { name, rumpf } of ruempfe) {
        const db = rumpf.search(DB_ZUGRIFF);
        if (db < 0) continue;
        it(`${rel}#${name}`, () => {
          if (REIHENFOLGE_AUSNAHMEN[`${rel}#${name}`]) return;
          const guard = rumpf.search(GUARD_AUFRUF);
          // Der Guard darf im SELBEN Statement stehen wie der erste Zugriff
          // (findFirst({ where: { ...akteSichtbarWhere(ctx) } })).
          const statementEnde = rumpf.indexOf(";", db);
          const grenze = statementEnde < 0 ? rumpf.length : statementEnde;
          expect(guard >= 0 && guard < grenze, `${rel}#${name}: erster Datenbankzugriff vor dem Guard (oder ohne Guard)`).toBe(true);
        });
      }
    }

    it("Selbsttest: findet Funktionsruempfe", () => {
      const s = readFileSync(join(WURZEL, "src/lib/actions/upload.ts"), "utf-8");
      expect(funktionsRuempfe(s).length).toBeGreaterThan(3);
    });
  });
```

Den Kopfkommentar der Datei (Zeilen 5–19) anpassen: der Satz „nicht, dass der Guard vor jedem Zugriff aufgerufen wird“ wird zu „seit 06.09.2026 zusätzlich, dass in jeder exportierten Funktion der erste Guard-Aufruf vor dem ersten Datenbankzugriff steht (statisch, textlich; Ausnahmen in REIHENFOLGE_AUSNAHMEN)“.

- [ ] **Step 2: Laufen lassen und Treffer bewerten**

Run: `npx vitest run tests/dokument-zugriff-vertrag.test.ts`

Für jeden roten `Datei#Funktion`-Fall die Funktion lesen und genau eine von zwei Entscheidungen treffen:
1. **Echte Lücke** (Schreib- oder Lesezugriff auf Akte/Dokument vor dem Guard): Guard-Aufruf an den Anfang der Funktion ziehen. Diese Fälle im Commit-Text nennen.
2. **Unbedenklich** (z. B. Cron ohne Nutzer, Upload-Token-Routen, Zugriff nur auf nutzer-/organisationsgebundene Tabellen ohne Akte, Guard steckt in einer privaten Hilfsfunktion derselben Datei): Eintrag in `REIHENFOLGE_AUSNAHMEN` mit einem Satz Begründung. Steckt der Guard in einer privaten Hilfsfunktion, stattdessen deren Namen in `GUARD_AUFRUF` aufnehmen, wenn sie in mehr als einer Datei so heißt; sonst Ausnahme.

Erwartung nach der Bewertung: Test grün, Ausnahmenliste kurz (Richtwert unter 15 Einträge). Ist sie länger, ist die Regel zu grob – dann `DB_ZUGRIFF` auf `prisma\.(case|document|applicant|uploadLink|caseFinding|documentRequest)\b|tx\.` einengen und erneut bewerten.

- [ ] **Step 3: Commit**

```bash
git add tests/dokument-zugriff-vertrag.test.ts src/lib/actions
git commit -m "test(zugriff): Vertragstest prueft Guard-Aufruf vor dem ersten Datenbankzugriff"
```

---

### Task 8: Gesamtlauf, PROD-DDL, Deploy, Bericht, Gedächtnis

**Files:**
- Modify: `docs/BACKOFFICE-PILOT-READINESS-2026-09-02.md` (Abschnitt 12/13 Nachtrag), `docs/GO-LIVE.md` (kein Eintrag nötig), Memory `backoffice-produkt.md`, `MEMORY.md`

- [ ] **Step 1: Alle Tests, Typecheck, Build**

Run: `npm run typecheck && npx vitest run && RUN_DB_IT=1 npx vitest run tests/backoffice-cross-org-db.test.ts tests/einreichung-db.test.ts tests/backoffice-service-db.test.ts tests/backoffice-zugriff-db.test.ts tests/backoffice-dokument-zugriff-db.test.ts tests/backoffice-pilot-durchlauf-db.test.ts && npm run build`
Expected: alles grün.

- [ ] **Step 2: DDL gegen PROD**

```bash
scripts/supabase-sql.sh prisma/sql/2026-09-06-einreichungslink.sql --dry-run
scripts/supabase-sql.sh prisma/sql/2026-09-06-einreichungslink.sql
```

Danach prüfen: `printf 'SELECT count(*) FROM backoffice_einreichungs_links;' > /tmp/x.sql` ist nicht nötig – das Skript meldet die ausgeführten Statements; ein zweiter Lauf muss wegen `IF NOT EXISTS` ohne Fehler durchgehen.

- [ ] **Step 3: Deploy**

```bash
git push origin main
```

Vercel baut aus `main`. Danach von außen prüfen (Gate-Ausnahme): `curl -sI https://baufidesk.de/einreichen/ungueltig | head -1` muss `200` liefern (Seite „Link nicht mehr gültig“), nicht `307` auf `/gate`. Und `vercel ls` bzw. `vercel inspect` zeigt das Deployment mit dem letzten Commit-Hash als `Ready`.

- [ ] **Step 4: Nachtrag im Pilot-Readiness-Bericht**

In `docs/BACKOFFICE-PILOT-READINESS-2026-09-02.md` unter Abschnitt 12 einen Absatz „Nachtrag 06.09.2026“:

```markdown
### Nachtrag 06.09.2026

- **Cross-Org-Übergabe umgesetzt**: Der Auftrag ist die Zugriffsbrücke; Fremdakten sind für
  das Backoffice nur in der Unterlagenarbeit sichtbar (`fremdakteErlaubt`, Allowlist in
  `tests/fremdakte-vertrag.test.ts`). Dokument- und KI-Zähler laufen auf die Organisation der
  Akte (Eigentümer), nicht auf das Backoffice.
- **Externer Einreichungslink umgesetzt**: reine Eingangstür (`/einreichen/[token]`), kein
  Status, kein Ergebnis, kein Versand. Dateien laufen über den bestehenden Kunden-Upload-Link.
- **Vertragstest** prüft zusätzlich die Aufrufreihenfolge Guard → Datenbank.
- **Zahlungsabwicklung bleibt außen vor** (Entscheidung 06.09.2026): Abrechnung = Kontingent-
  Ereignisse + Abrechnungsstatus; Rechnung außerhalb von BaufiDesk.
```

- [ ] **Step 5: Gedächtnis**

`~/.claude/projects/-Users-jurgenertel-Coding-Unterlagenpilot/memory/backoffice-produkt.md`: den Satz „Cross-Org-Übergabe … ist NICHT umgesetzt … Externer Einreichungslink (ohne Login) ebenfalls offen.“ ersetzen durch den Stand vom 06.09. (Auftragsbrücke, `fremdakteErlaubt` Standard zu, Allowlist-Test, Storage-Präfix aus `case.organizationId`, Einreichungslink = Eingangstür, Zahlung bewusst nicht). Zeile in `MEMORY.md` entsprechend kürzen.

- [ ] **Step 6: Commit und Push**

```bash
git add docs/BACKOFFICE-PILOT-READINESS-2026-09-02.md
git commit -m "docs(backoffice): Nachtrag Cross-Org-Uebergabe, Einreichungslink, Vertragstest-Reihenfolge"
git push origin main
```
