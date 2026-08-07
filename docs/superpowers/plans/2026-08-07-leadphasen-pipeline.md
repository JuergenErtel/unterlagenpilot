# Leadphasen und Pipeline-Ansicht – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder Fall trägt eine Vertriebsphase; die Pipeline zeigt als Kanban, wo Leads und Volumen liegen, und BaufiDesk schlägt den nächsten Phasenwechsel vor.

**Architecture:** Die Phase ist ein Feld am Fall (`Case.leadPhase`), unabhängig vom Bearbeitungsstatus. Der Vorschlag wird nie gespeichert, sondern bei jedem Aufruf aus dem Fallzustand gerechnet — reine Logik in `src/lib/cases/lead-phase.ts`, testbar ohne Datenbank. Die Kanban-Gruppierung ist ebenfalls rein; die Seite `/pipeline` setzt nur zusammen.

**Tech Stack:** Next.js App Router (Server Actions), Prisma/PostgreSQL, Vitest, PGlite für den Bestandsdaten-Test, Tailwind + vorhandene UI-Komponenten. Ziehen per HTML5-Drag-and-Drop, ohne zusätzliche Bibliothek.

## Global Constraints

- Sprache im Produkt und in Kommentaren: **Deutsch**.
- Die Phase ist eine **zweite Dimension** neben `CaseStatus` — kein Wert wird abgeleitet oder überschrieben.
- **„Verloren" ist kein Phasenwert:** `verlorenAm` gesetzt heißt verloren, `leadPhase` bleibt stehen.
- Ein Vorschlag geht **nur vorwärts** und **nie bei einem verlorenen Fall**.
- Für `finanzierungsvorschlag` und `zusage` gibt es **bewusst keinen** Vorschlag.
- Keine automatische Phasenänderung: Jeder Wechsel braucht einen Klick und schreibt einen Audit-Eintrag.
- Archivierte Fälle erscheinen nicht im Board.
- Je Spalte höchstens **50** Karten laden.
- Wiedervorlage wird **nur angezeigt**, nicht neu modelliert (`Case.wiedervorlage` bleibt unverändert).
- Tests: `npx vitest run <datei>`, volle Suite `npm test`, Typecheck `npm run typecheck`.
- `npm run db:push` läuft gegen die **Produktionsdatenbank** — nur in Task 6 und nur nach Freigabe.

---

## Dateiübersicht

| Datei | Verantwortung |
| --- | --- |
| `prisma/schema.prisma` | `enum LeadPhase`, vier Felder am `Case` |
| `src/lib/domain/enums.ts` | `LEAD_PHASES`, `LEAD_PHASE_LABELS`, `LOSS_REASONS`, `LOSS_REASON_LABELS` |
| `src/lib/cases/lead-phase.ts` | Reine Logik: `schlagePhaseVor`, `phasenIndex`, `istVerloren` |
| `src/lib/cases/lead-board.ts` | Reine Logik: Karten in Spalten gruppieren, Summen, Sortierung, Deckelung |
| `src/lib/actions/lead-phase.ts` | Server Actions: Phase setzen, verloren setzen, Verlust aufheben |
| `src/components/pipeline/lead-board.tsx` | Kanban (Client): Spalten, Ziehen, Menü, Vorschlags-Chip |
| `src/app/(app)/pipeline/page.tsx` | Lädt Daten, rendert Kanban über der Courtage-Auswertung |
| `src/app/(app)/cases/[id]/page.tsx` | Phase samt Vorschlag im Fallkopf |
| `scripts/backfill-lead-phase.ts` | Einmaliger Lauf für Bestandsfälle |

Reihenfolge: reine Logik (1–2), Persistenz und Aktionen (3), Oberfläche (4–5), Bestandsdaten und Rollout (6).

---

### Task 1: Phasen, Verlustgründe und Vorschlagsregel

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain/enums.ts`
- Create: `src/lib/cases/lead-phase.ts`
- Test: `tests/lead-phase.test.ts` (neu)

**Interfaces:**
- Produces:
  - `LEAD_PHASES: readonly LeadPhase[]`, `LEAD_PHASE_LABELS: Record<LeadPhase, string>`
  - `LOSS_REASONS: readonly LossReason[]`, `LOSS_REASON_LABELS: Record<LossReason, string>`
  - `interface PhasenSignale { leadPhase: string; verlorenAm: Date | null; status: string; abschlussdatum: Date | null; hatLink: boolean; hatGesendeteNachricht: boolean; selbstauskunftBegonnen: boolean; dokumenteVorhanden: boolean }`
  - `schlagePhaseVor(s: PhasenSignale): LeadPhase | null`
  - `phasenIndex(p: string): number`

- [ ] **Step 1: Schema erweitern**

In `prisma/schema.prisma` bei den übrigen Enums ergänzen:

```prisma
/** Vertriebsphase eines Leads – zweite Dimension neben CaseStatus. */
enum LeadPhase {
  neu
  anfrage_erstellt
  selbstauskunft_laeuft
  finanzierungsvorschlag
  kreditpruefung_eingereicht
  zusage
  abgeschlossen
}
```

Im Modell `Case` direkt nach `statusBeforeArchive` einfügen:

```prisma
  // Vertriebsphase – unabhängig vom Bearbeitungsstatus. "Verloren" ist KEIN
  // Phasenwert: verlorenAm gesetzt heißt verloren, die zuletzt erreichte Phase
  // bleibt erhalten (damit auswertbar ist, WO verloren wird).
  leadPhase      LeadPhase @default(neu)
  leadPhaseSeit  DateTime  @default(now())
  verlorenAm     DateTime?
  verlorenGrund  String?
```

Außerdem fehlt die Gegenrelation zu den Selbstauskunftsbögen — ohne sie lässt
sich in Task 4 nicht abfragen, ob ein Kunde den Bogen begonnen hat. Im Modell
`Case` bei den übrigen Relationen ergänzen:

```prisma
  selfDisclosures     SelfDisclosure[]
```

Und im Modell `SelfDisclosure` die Relation vervollständigen (dort steht heute
nur `caseId String` ohne Verknüpfung):

```prisma
  case        Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Prisma-Client erzeugen**

Run: `npx prisma generate`
Expected: „Generated Prisma Client". Kein `db:push` — das kommt in Task 6.

- [ ] **Step 3: Aufzählungen in enums.ts ergänzen**

In `src/lib/domain/enums.ts` direkt nach `CASE_STATUS_LABELS` einfügen:

```ts
/**
 * Vertriebsphasen in ihrer natürlichen Reihenfolge. Die Bezeichnungen sind an
 * FinLink angelehnt, weil Jürgen sie von dort kennt.
 */
export const LEAD_PHASES = [
  "neu",
  "anfrage_erstellt",
  "selbstauskunft_laeuft",
  "finanzierungsvorschlag",
  "kreditpruefung_eingereicht",
  "zusage",
  "abgeschlossen",
] as const;
export type LeadPhase = (typeof LEAD_PHASES)[number];

export const LEAD_PHASE_LABELS: Record<LeadPhase, string> = {
  neu: "Neu",
  anfrage_erstellt: "Anfrage erstellt",
  selbstauskunft_laeuft: "Selbstauskunft läuft",
  finanzierungsvorschlag: "Finanzierungsvorschlag",
  kreditpruefung_eingereicht: "Kreditprüfung eingereicht",
  zusage: "Zusage",
  abgeschlossen: "Finanzierung abgeschlossen",
};

/**
 * Verlustgründe als feste Liste – Freitext lässt sich nicht auswerten. Das
 * Freitextfeld daneben bleibt trotzdem, weil keine Liste vollständig ist.
 */
export const LOSS_REASONS = [
  "kondition",
  "objekt_weg",
  "bank_abgelehnt",
  "nicht_erreichbar",
  "anderer_vermittler",
  "verschoben",
  "sonstiges",
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  kondition: "Kondition zu teuer",
  objekt_weg: "Objekt anderweitig vergeben",
  bank_abgelehnt: "Bank hat abgelehnt",
  nicht_erreichbar: "Kunde nicht erreichbar",
  anderer_vermittler: "Anderer Vermittler",
  verschoben: "Vorhaben verschoben",
  sonstiges: "Sonstiges",
};
```

- [ ] **Step 4: Test schreiben**

Create `tests/lead-phase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { schlagePhaseVor, phasenIndex, type PhasenSignale } from "@/lib/cases/lead-phase";

function signale(over: Partial<PhasenSignale> = {}): PhasenSignale {
  return {
    leadPhase: "neu",
    verlorenAm: null,
    status: "neu",
    abschlussdatum: null,
    hatLink: false,
    hatGesendeteNachricht: false,
    selbstauskunftBegonnen: false,
    dokumenteVorhanden: false,
    ...over,
  };
}

describe("schlagePhaseVor", () => {
  it("schlägt für einen frischen Fall ohne Aktivität nichts vor", () => {
    expect(schlagePhaseVor(signale())).toBeNull();
  });

  it("schlägt 'Anfrage erstellt' vor, sobald ein Link existiert", () => {
    expect(schlagePhaseVor(signale({ hatLink: true }))).toBe("anfrage_erstellt");
  });

  it("schlägt 'Anfrage erstellt' auch bei einer gesendeten Nachricht vor", () => {
    expect(schlagePhaseVor(signale({ hatGesendeteNachricht: true }))).toBe("anfrage_erstellt");
  });

  it("schlägt 'Selbstauskunft läuft' vor, sobald der Kunde begonnen hat", () => {
    expect(schlagePhaseVor(signale({ hatLink: true, selbstauskunftBegonnen: true }))).toBe(
      "selbstauskunft_laeuft"
    );
  });

  it("wertet eingegangene Dokumente wie einen begonnenen Bogen", () => {
    expect(schlagePhaseVor(signale({ dokumenteVorhanden: true }))).toBe("selbstauskunft_laeuft");
  });

  it("schlägt 'Kreditprüfung eingereicht' vor, wenn der Fall exportiert wurde", () => {
    expect(schlagePhaseVor(signale({ status: "exportiert" }))).toBe("kreditpruefung_eingereicht");
    expect(schlagePhaseVor(signale({ status: "uebertragen" }))).toBe("kreditpruefung_eingereicht");
  });

  it("schlägt 'Finanzierung abgeschlossen' bei Abschlussdatum oder Status vor", () => {
    expect(schlagePhaseVor(signale({ abschlussdatum: new Date() }))).toBe("abgeschlossen");
    expect(schlagePhaseVor(signale({ status: "abgeschlossen" }))).toBe("abgeschlossen");
  });

  it("schlägt nie rückwärts vor", () => {
    // Fall steht schon auf Zusage; ein Dokument darf ihn nicht zurückholen.
    expect(
      schlagePhaseVor(signale({ leadPhase: "zusage", dokumenteVorhanden: true, hatLink: true }))
    ).toBeNull();
  });

  it("schlägt nichts vor, wenn die Phase bereits stimmt", () => {
    expect(
      schlagePhaseVor(signale({ leadPhase: "anfrage_erstellt", hatLink: true }))
    ).toBeNull();
  });

  it("schlägt bei einem verlorenen Fall nichts vor", () => {
    expect(
      schlagePhaseVor(signale({ verlorenAm: new Date(), status: "exportiert" }))
    ).toBeNull();
  });

  it("schlägt Finanzierungsvorschlag und Zusage nie vor – dafür gibt es kein Signal", () => {
    const alle = [
      signale({ hatLink: true }),
      signale({ dokumenteVorhanden: true }),
      signale({ status: "einreichungsfertig", dokumenteVorhanden: true }),
      signale({ status: "bank_nachforderung" }),
    ].map(schlagePhaseVor);
    expect(alle).not.toContain("finanzierungsvorschlag");
    expect(alle).not.toContain("zusage");
  });

  it("kennt die Reihenfolge der Phasen", () => {
    expect(phasenIndex("neu")).toBe(0);
    expect(phasenIndex("abgeschlossen")).toBe(6);
    expect(phasenIndex("quatsch")).toBe(-1);
  });
});
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/lead-phase.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/cases/lead-phase"`.

- [ ] **Step 6: Vorschlagsregel schreiben**

Create `src/lib/cases/lead-phase.ts`:

```ts
import { LEAD_PHASES, type LeadPhase } from "@/lib/domain/enums";

/**
 * Vorschlag für die nächste Vertriebsphase – reine Logik, keine Datenbank.
 *
 * Grundsätze:
 *  - Nur vorwärts. Ein zurückgestufter Fall wäre eine stille Korrektur der
 *    Einschätzung des Vermittlers.
 *  - Nichts bei verlorenen Fällen.
 *  - Kein Vorschlag für `finanzierungsvorschlag` und `zusage`: Beides passiert
 *    außerhalb (Europace, Mail der Bank). Ein oft falscher Vorschlag ist
 *    schlimmer als keiner – man gewöhnt sich das Wegklicken an.
 */
export interface PhasenSignale {
  /** Aktuelle Phase des Falls. */
  leadPhase: string;
  verlorenAm: Date | null;
  status: string;
  abschlussdatum: Date | null;
  /** Ein Upload- oder Selbstauskunftslink wurde erzeugt. */
  hatLink: boolean;
  /** Eine GeneratedMessage mit sent = true liegt vor. */
  hatGesendeteNachricht: boolean;
  /** Der Kunde hat den Selbstauskunftsbogen begonnen. */
  selbstauskunftBegonnen: boolean;
  dokumenteVorhanden: boolean;
}

/** Position in der Phasenkette; -1 für unbekannte Werte. */
export function phasenIndex(p: string): number {
  return (LEAD_PHASES as readonly string[]).indexOf(p);
}

export function schlagePhaseVor(s: PhasenSignale): LeadPhase | null {
  if (s.verlorenAm) return null;

  // Von hinten nach vorn: die am weitesten fortgeschrittene erkennbare Phase.
  let erkannt: LeadPhase | null = null;
  if (s.status === "abgeschlossen" || s.abschlussdatum) {
    erkannt = "abgeschlossen";
  } else if (s.status === "exportiert" || s.status === "uebertragen") {
    erkannt = "kreditpruefung_eingereicht";
  } else if (s.selbstauskunftBegonnen || s.dokumenteVorhanden) {
    erkannt = "selbstauskunft_laeuft";
  } else if (s.hatLink || s.hatGesendeteNachricht) {
    erkannt = "anfrage_erstellt";
  }

  if (!erkannt) return null;
  return phasenIndex(erkannt) > phasenIndex(s.leadPhase) ? erkannt : null;
}
```

- [ ] **Step 7: Test laufen lassen**

Run: `npx vitest run tests/lead-phase.test.ts`
Expected: PASS (12 Tests).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Step 9: Committen**

```bash
git add prisma/schema.prisma src/lib/domain/enums.ts src/lib/cases/lead-phase.ts tests/lead-phase.test.ts
git commit -m "feat(leadphasen): Phasen, Verlustgruende und Vorschlagsregel"
```

---

### Task 2: Kanban-Gruppierung (reine Logik)

**Files:**
- Create: `src/lib/cases/lead-board.ts`
- Test: `tests/lead-board.test.ts` (neu)

**Interfaces:**
- Consumes: `LEAD_PHASES`, `LEAD_PHASE_LABELS` (Task 1), `schlagePhaseVor`, `PhasenSignale` (Task 1).
- Produces:
  - `interface BoardKarte { caseId: string; caseNumber: string; kundenName: string; volumen: number | null; leadPhase: string; leadPhaseSeit: Date; wiedervorlage: Date | null; verlorenAm: Date | null; verlorenGrund: string | null; vorschlag: string | null }`
  - `interface BoardSpalte { phase: string; titel: string; anzahl: number; summe: number; karten: BoardKarte[]; weitere: number }`
  - `buildBoard(karten: BoardKarte[], jetzt: Date, maxProSpalte?: number): { spalten: BoardSpalte[]; verloren: BoardSpalte }`
  - `liegezeitTage(seit: Date, jetzt: Date): number`

- [ ] **Step 1: Test schreiben**

Create `tests/lead-board.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBoard, liegezeitTage, type BoardKarte } from "@/lib/cases/lead-board";

const JETZT = new Date("2026-08-07T12:00:00Z");
const tageVorher = (n: number) => new Date(JETZT.getTime() - n * 86400_000);

function karte(over: Partial<BoardKarte> = {}): BoardKarte {
  return {
    caseId: "c1",
    caseNumber: "UP-2026-0001",
    kundenName: "Muster",
    volumen: 300000,
    leadPhase: "neu",
    leadPhaseSeit: tageVorher(1),
    wiedervorlage: null,
    verlorenAm: null,
    verlorenGrund: null,
    vorschlag: null,
    ...over,
  };
}

describe("buildBoard", () => {
  it("legt für jede Phase eine Spalte an, auch wenn sie leer ist", () => {
    const { spalten } = buildBoard([], JETZT);
    expect(spalten).toHaveLength(7);
    expect(spalten[0]!.phase).toBe("neu");
    expect(spalten[0]!.titel).toBe("Neu");
    expect(spalten[6]!.titel).toBe("Finanzierung abgeschlossen");
  });

  it("zählt Karten und summiert das Volumen je Spalte", () => {
    const { spalten } = buildBoard(
      [
        karte({ caseId: "a", volumen: 300000 }),
        karte({ caseId: "b", volumen: 200000 }),
        karte({ caseId: "c", volumen: 500000, leadPhase: "zusage" }),
      ],
      JETZT
    );
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.anzahl).toBe(2);
    expect(neu.summe).toBe(500000);
    expect(spalten.find((s) => s.phase === "zusage")!.summe).toBe(500000);
  });

  it("ignoriert Fälle ohne Volumen in der Summe, zählt sie aber mit", () => {
    const { spalten } = buildBoard(
      [karte({ caseId: "a", volumen: null }), karte({ caseId: "b", volumen: 100000 })],
      JETZT
    );
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.anzahl).toBe(2);
    expect(neu.summe).toBe(100000);
  });

  it("sortiert je Spalte nach Liegezeit, das Älteste oben", () => {
    const { spalten } = buildBoard(
      [
        karte({ caseId: "jung", leadPhaseSeit: tageVorher(1) }),
        karte({ caseId: "alt", leadPhaseSeit: tageVorher(30) }),
        karte({ caseId: "mittel", leadPhaseSeit: tageVorher(7) }),
      ],
      JETZT
    );
    expect(spalten[0]!.karten.map((k) => k.caseId)).toEqual(["alt", "mittel", "jung"]);
  });

  it("hält verlorene Fälle aus den Phasenspalten heraus", () => {
    const { spalten, verloren } = buildBoard(
      [
        karte({ caseId: "offen" }),
        karte({ caseId: "weg", verlorenAm: tageVorher(3), verlorenGrund: "kondition" }),
      ],
      JETZT
    );
    expect(spalten.find((s) => s.phase === "neu")!.anzahl).toBe(1);
    expect(verloren.anzahl).toBe(1);
    expect(verloren.karten[0]!.caseId).toBe("weg");
  });

  it("deckelt die Kartenzahl je Spalte und meldet den Rest", () => {
    const viele = Array.from({ length: 55 }, (_, i) =>
      karte({ caseId: `c${i}`, leadPhaseSeit: tageVorher(i + 1) })
    );
    const { spalten } = buildBoard(viele, JETZT, 50);
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.karten).toHaveLength(50);
    expect(neu.weitere).toBe(5);
    // Anzahl und Summe zählen weiterhin ALLE Karten – sonst lügt der Spaltenkopf.
    expect(neu.anzahl).toBe(55);
  });

  it("rechnet die Liegezeit in vollen Tagen", () => {
    expect(liegezeitTage(tageVorher(6), JETZT)).toBe(6);
    expect(liegezeitTage(JETZT, JETZT)).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/lead-board.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/cases/lead-board"`.

- [ ] **Step 3: Implementierung schreiben**

Create `src/lib/cases/lead-board.ts`:

```ts
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";

/**
 * Gruppiert Fälle in die Spalten des Kanbans. Reine Logik: keine Datenbank,
 * kein React – damit Summen, Sortierung und Deckelung prüfbar bleiben.
 */
export interface BoardKarte {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  /** Darlehensbetrag, sonst Darlehenswunsch, sonst Kaufpreis. */
  volumen: number | null;
  leadPhase: string;
  leadPhaseSeit: Date;
  wiedervorlage: Date | null;
  verlorenAm: Date | null;
  verlorenGrund: string | null;
  /** Offener Phasenvorschlag oder null. */
  vorschlag: string | null;
}

export interface BoardSpalte {
  phase: string;
  titel: string;
  /** Alle Karten der Spalte – auch die nicht geladenen. */
  anzahl: number;
  summe: number;
  karten: BoardKarte[];
  /** Wie viele Karten wegen der Deckelung fehlen. */
  weitere: number;
}

/** Volle Tage zwischen zwei Zeitpunkten, nie negativ. */
export function liegezeitTage(seit: Date, jetzt: Date): number {
  return Math.max(0, Math.floor((jetzt.getTime() - seit.getTime()) / 86400_000));
}

export function buildBoard(
  karten: BoardKarte[],
  jetzt: Date,
  maxProSpalte = 50
): { spalten: BoardSpalte[]; verloren: BoardSpalte } {
  const offen = karten.filter((k) => !k.verlorenAm);
  const weg = karten.filter((k) => k.verlorenAm);

  // Ältestes oben: Eine Pipeline soll Staus zeigen, nicht Neuzugänge.
  const nachLiegezeit = (a: BoardKarte, b: BoardKarte) =>
    a.leadPhaseSeit.getTime() - b.leadPhaseSeit.getTime();

  const spalte = (phase: string, titel: string, eigene: BoardKarte[]): BoardSpalte => {
    const sortiert = [...eigene].sort(nachLiegezeit);
    return {
      phase,
      titel,
      anzahl: sortiert.length,
      summe: sortiert.reduce((s, k) => s + (k.volumen ?? 0), 0),
      karten: sortiert.slice(0, maxProSpalte),
      weitere: Math.max(0, sortiert.length - maxProSpalte),
    };
  };

  const spalten = LEAD_PHASES.map((p: LeadPhase) =>
    spalte(p, LEAD_PHASE_LABELS[p], offen.filter((k) => k.leadPhase === p))
  );

  return {
    spalten,
    verloren: spalte("verloren", "Verloren", weg),
  };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/lead-board.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Typecheck und committen**

Run: `npm run typecheck`
Expected: keine Ausgabe.

```bash
git add src/lib/cases/lead-board.ts tests/lead-board.test.ts
git commit -m "feat(leadphasen): Kanban-Gruppierung als reine Logik"
```

---

### Task 3: Server Actions für Phasenwechsel und Verlust

**Files:**
- Create: `src/lib/actions/lead-phase.ts`
- Test: `tests/lead-phase-actions.test.ts` (neu)

**Interfaces:**
- Consumes: `requireCaseAccess` aus `@/lib/auth/context`, `audit`, `LOSS_REASONS`, `LEAD_PHASES` (Task 1).
- Produces:
  - `setzePhase(caseId: string, phase: string): Promise<{ error?: string }>`
  - `setzeVerloren(caseId: string, grund: string, notiz?: string): Promise<{ error?: string }>`
  - `hebeVerlustAuf(caseId: string): Promise<{ error?: string }>`

- [ ] **Step 1: Test schreiben**

Create `tests/lead-phase-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { setzePhase, setzeVerloren, hebeVerlustAuf } from "@/lib/actions/lead-phase";

beforeEach(() => {
  [requireCaseAccess, findUnique, update, audit].forEach((m) => m.mockReset());
  requireCaseAccess.mockResolvedValue({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } });
  findUnique.mockResolvedValue({ leadPhase: "neu", verlorenAm: null, verlorenGrund: null });
  update.mockResolvedValue({});
});

describe("setzePhase", () => {
  it("schreibt Phase und Zeitstempel", async () => {
    await setzePhase("case-A", "selbstauskunft_laeuft");
    const arg = update.mock.calls[0]![0] as {
      data: { leadPhase: string; leadPhaseSeit: Date };
    };
    expect(arg.data.leadPhase).toBe("selbstauskunft_laeuft");
    expect(arg.data.leadPhaseSeit).toBeInstanceOf(Date);
    expect(audit).toHaveBeenCalled();
  });

  it("tut nichts, wenn die Phase schon stimmt", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzePhase("case-A", "zusage");
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Phasenwert ab", async () => {
    const res = await setzePhase("case-A", "raumschiff");
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("erlaubt auch das Zurückstufen von Hand", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzePhase("case-A", "anfrage_erstellt");
    const arg = update.mock.calls[0]![0] as { data: { leadPhase: string } };
    expect(arg.data.leadPhase).toBe("anfrage_erstellt");
  });
});

describe("setzeVerloren", () => {
  it("schreibt Datum und Grund, ohne die Phase zu ändern", async () => {
    findUnique.mockResolvedValue({ leadPhase: "zusage", verlorenAm: null, verlorenGrund: null });
    await setzeVerloren("case-A", "kondition");
    const arg = update.mock.calls[0]![0] as {
      data: { verlorenAm: Date; verlorenGrund: string; leadPhase?: string };
    };
    expect(arg.data.verlorenAm).toBeInstanceOf(Date);
    expect(arg.data.verlorenGrund).toBe("kondition");
    expect(arg.data.leadPhase).toBeUndefined();
  });

  it("hängt eine Notiz an den Grund", async () => {
    await setzeVerloren("case-A", "sonstiges", "Kunde hat geerbt");
    const arg = update.mock.calls[0]![0] as { data: { verlorenGrund: string } };
    expect(arg.data.verlorenGrund).toContain("sonstiges");
    expect(arg.data.verlorenGrund).toContain("Kunde hat geerbt");
  });

  it("weist einen unbekannten Grund ab", async () => {
    const res = await setzeVerloren("case-A", "keine-lust");
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("hebeVerlustAuf", () => {
  it("löscht Datum und Grund", async () => {
    findUnique.mockResolvedValue({
      leadPhase: "zusage",
      verlorenAm: new Date(),
      verlorenGrund: "kondition",
    });
    await hebeVerlustAuf("case-A");
    const arg = update.mock.calls[0]![0] as {
      data: { verlorenAm: null; verlorenGrund: null };
    };
    expect(arg.data.verlorenAm).toBeNull();
    expect(arg.data.verlorenGrund).toBeNull();
  });

  it("tut nichts bei einem Fall, der gar nicht verloren ist", async () => {
    await hebeVerlustAuf("case-A");
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/lead-phase-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/lead-phase"`.

- [ ] **Step 3: Aktionen schreiben**

Create `src/lib/actions/lead-phase.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { LEAD_PHASES, LOSS_REASONS, type LeadPhase } from "@/lib/domain/enums";

/**
 * Vertriebsphase und Verlust. Jeder Wechsel ist eine Entscheidung des
 * Vermittlers und landet im Audit-Log – daraus lassen sich später Liegezeiten
 * auswerten, ohne heute eine Historientabelle zu bauen.
 */

function revalidiere(caseId: string): void {
  revalidatePath("/pipeline");
  revalidatePath(`/cases/${caseId}`);
}

export async function setzePhase(caseId: string, phase: string): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!(LEAD_PHASES as readonly string[]).includes(phase)) {
    return { error: "Unbekannte Phase." };
  }

  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    select: { leadPhase: true, verlorenAm: true, verlorenGrund: true },
  });
  if (!fall) return { error: "Fall nicht gefunden." };
  // Gleiche Phase: kein Schreibvorgang, kein Audit-Eintrag – sonst verwässert
  // das Log und die Liegezeit springt grundlos zurück.
  if (fall.leadPhase === phase) return {};

  await prisma.case.update({
    where: { id: caseId },
    data: { leadPhase: phase as LeadPhase, leadPhaseSeit: new Date() },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { leadPhaseVon: fall.leadPhase, leadPhaseNach: phase },
  });

  revalidiere(caseId);
  return {};
}

export async function setzeVerloren(
  caseId: string,
  grund: string,
  notiz?: string
): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!(LOSS_REASONS as readonly string[]).includes(grund)) {
    return { error: "Unbekannter Verlustgrund." };
  }

  // Die Phase bleibt bewusst stehen: So ist auswertbar, WO verloren wird.
  const gespeicherterGrund = notiz?.trim() ? `${grund}: ${notiz.trim()}` : grund;
  await prisma.case.update({
    where: { id: caseId },
    data: { verlorenAm: new Date(), verlorenGrund: gespeicherterGrund },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { verloren: true, grund },
  });

  revalidiere(caseId);
  return {};
}

export async function hebeVerlustAuf(caseId: string): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    select: { verlorenAm: true, verlorenGrund: true, leadPhase: true },
  });
  if (!fall) return { error: "Fall nicht gefunden." };
  if (!fall.verlorenAm) return {};

  await prisma.case.update({
    where: { id: caseId },
    data: { verlorenAm: null, verlorenGrund: null },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { verloren: false, vorherigerGrund: fall.verlorenGrund },
  });

  revalidiere(caseId);
  return {};
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/lead-phase-actions.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Typecheck und committen**

Run: `npm run typecheck`
Expected: keine Ausgabe.

```bash
git add src/lib/actions/lead-phase.ts tests/lead-phase-actions.test.ts
git commit -m "feat(leadphasen): Aktionen fuer Phasenwechsel, Verlust und Wiederaufnahme"
```

---

### Task 4: Kanban-Oberfläche

**Files:**
- Create: `src/components/pipeline/lead-board.tsx`
- Create: `src/components/pipeline/loss-dialog.tsx`
- Modify: `src/app/(app)/pipeline/page.tsx`

**Interfaces:**
- Consumes: `buildBoard`, `BoardKarte`, `BoardSpalte`, `liegezeitTage` (Task 2); `setzePhase`, `setzeVerloren`, `hebeVerlustAuf` (Task 3); `schlagePhaseVor` (Task 1).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Verlust-Dialog schreiben**

Create `src/components/pipeline/loss-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOSS_REASONS, LOSS_REASON_LABELS, type LossReason } from "@/lib/domain/enums";

/**
 * Fragt beim Verlust nach dem Grund. Feste Liste, weil sich Freitext nicht
 * auswerten lässt – Freitextfeld daneben, weil keine Liste vollständig ist.
 */
export function LossDialog({
  offen,
  onAbbrechen,
  onBestaetigen,
}: {
  offen: boolean;
  onAbbrechen: () => void;
  onBestaetigen: (grund: LossReason, notiz: string) => void;
}) {
  const [grund, setGrund] = useState<LossReason>("kondition");
  const [notiz, setNotiz] = useState("");
  if (!offen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-background p-5 shadow-lg">
        <h2 className="text-base font-semibold">Fall als verloren markieren</h2>
        <div className="space-y-1.5">
          <Label htmlFor="grund">Grund</Label>
          <select
            id="grund"
            value={grund}
            onChange={(e) => setGrund(e.target.value as LossReason)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {LOSS_REASONS.map((r) => (
              <option key={r} value={r}>
                {LOSS_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notiz">Anmerkung (optional)</Label>
          <Input id="notiz" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onAbbrechen}>
            Abbrechen
          </Button>
          <Button onClick={() => onBestaetigen(grund, notiz)}>Als verloren markieren</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Kanban schreiben**

Create `src/components/pipeline/lead-board.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CalendarClock, MoreHorizontal, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";
import { setzePhase, setzeVerloren, hebeVerlustAuf } from "@/lib/actions/lead-phase";
import { LossDialog } from "@/components/pipeline/loss-dialog";

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
}

export interface BoardSpalteView {
  phase: string;
  titel: string;
  anzahl: number;
  summe: number;
  karten: BoardKarteView[];
  weitere: number;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export function LeadBoard({
  spalten,
  verloren,
}: {
  spalten: BoardSpalteView[];
  verloren: BoardSpalteView;
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeVerlorene, setZeigeVerlorene] = useState(false);
  const [verlustFuer, setVerlustFuer] = useState<string | null>(null);
  const [gezogen, setGezogen] = useState<string | null>(null);

  const verschieben = (caseId: string, phase: string) =>
    startTransition(() => void setzePhase(caseId, phase));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={zeigeVerlorene}
            onChange={(e) => setZeigeVerlorene(e.target.checked)}
          />
          Verlorene anzeigen ({verloren.anzahl})
        </label>
        {pending && <span className="text-xs text-muted-foreground">wird gespeichert …</span>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 max-md:flex-col max-md:overflow-visible">
        {[...spalten, ...(zeigeVerlorene ? [verloren] : [])].map((s) => (
          <section
            key={s.phase}
            onDragOver={(e) => {
              if (s.phase !== "verloren") e.preventDefault();
            }}
            onDrop={() => {
              if (gezogen && s.phase !== "verloren") verschieben(gezogen, s.phase);
              setGezogen(null);
            }}
            className="w-64 shrink-0 rounded-lg bg-muted/40 p-2 max-md:w-full"
          >
            <header className="px-1 pb-2">
              <p className="text-sm font-semibold">{s.titel}</p>
              <p className="text-xs text-muted-foreground">
                {s.anzahl} {s.anzahl === 1 ? "Fall" : "Fälle"}
                {s.summe > 0 && ` · ${eur(s.summe)}`}
              </p>
            </header>

            <div className="space-y-2">
              {s.karten.map((k) => (
                <article
                  key={k.caseId}
                  draggable={s.phase !== "verloren"}
                  onDragStart={() => setGezogen(k.caseId)}
                  className="rounded-md border bg-background p-2.5 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/cases/${k.caseId}`} className="font-medium hover:underline">
                      {k.kundenName}
                    </Link>
                    <details className="relative">
                      <summary className="cursor-pointer list-none text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-56 space-y-0.5 rounded-md border bg-background p-1 shadow-md">
                        {s.phase === "verloren" ? (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              // Rückfrage, weil Grund und Datum dabei verloren gehen.
                              if (!confirm("Verlust aufheben? Grund und Datum gehen dabei verloren.")) return;
                              startTransition(() => void hebeVerlustAuf(k.caseId));
                            }}
                          >
                            <RotateCcw className="h-3 w-3" /> Verlust aufheben
                          </button>
                        ) : (
                          <>
                            {LEAD_PHASES.filter((p) => p !== k.leadPhase).map((p: LeadPhase) => (
                              <button
                                key={p}
                                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                                onClick={() => verschieben(k.caseId, p)}
                              >
                                → {LEAD_PHASE_LABELS[p]}
                              </button>
                            ))}
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-xs text-destructive hover:bg-muted"
                              onClick={() => setVerlustFuer(k.caseId)}
                            >
                              Als verloren markieren
                            </button>
                          </>
                        )}
                      </div>
                    </details>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {k.volumen != null ? eur(k.volumen) : "—"} · seit {k.liegezeit}{" "}
                    {k.liegezeit === 1 ? "Tag" : "Tagen"}
                  </p>

                  {k.wiedervorlage && (
                    <Badge variant="neutral" className="mt-1 gap-1">
                      <CalendarClock className="h-3 w-3" /> WV {k.wiedervorlage}
                    </Badge>
                  )}
                  {k.verlorenGrund && (
                    <p className="mt-1 text-xs text-muted-foreground">{k.verlorenGrund}</p>
                  )}

                  {k.vorschlag && (
                    <button
                      onClick={() => verschieben(k.caseId, k.vorschlag!)}
                      className="mt-2 flex w-full items-center justify-between rounded border border-dashed px-2 py-1 text-xs hover:bg-muted"
                    >
                      <span>→ {LEAD_PHASE_LABELS[k.vorschlag as LeadPhase]}?</span>
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </article>
              ))}

              {s.weitere > 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {s.weitere} weitere – in der Fallliste sichtbar
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <LossDialog
        offen={verlustFuer !== null}
        onAbbrechen={() => setVerlustFuer(null)}
        onBestaetigen={(grund, notiz) => {
          const id = verlustFuer!;
          setVerlustFuer(null);
          startTransition(() => void setzeVerloren(id, grund, notiz));
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Pipeline-Seite ergänzen**

In `src/app/(app)/pipeline/page.tsx` die Importe ergänzen:

```tsx
import { buildBoard, liegezeitTage, type BoardKarte } from "@/lib/cases/lead-board";
import { schlagePhaseVor } from "@/lib/cases/lead-phase";
import { LeadBoard } from "@/components/pipeline/lead-board";
```

Nach dem bestehenden `const pipeline = buildPipeline(input);` einfügen:

```tsx
  // Kanban: eigene Abfrage, weil die Courtage-Liste bewusst nur bepreiste Fälle
  // zeigt – im Board sollen aber ALLE nicht archivierten Fälle stehen.
  const boardRows = await prisma.case.findMany({
    where: { organizationId: ctx.organizationId, status: { not: "archiviert" } },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      leadPhase: true,
      leadPhaseSeit: true,
      wiedervorlage: true,
      verlorenAm: true,
      verlorenGrund: true,
      abschlussdatum: true,
      darlehensbetrag: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
      financingRequest: { select: { darlehenswunsch: true, kaufpreis: true } },
      _count: { select: { documents: true, uploadLinks: true, selfDisclosureLinks: true } },
      generatedMessages: { where: { sent: true }, select: { id: true }, take: 1 },
      selfDisclosures: { select: { currentStep: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const jetzt = new Date();
  const boardKarten: BoardKarte[] = boardRows.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    kundenName:
      c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
      "Ohne Namen",
    volumen: c.darlehensbetrag ?? c.financingRequest?.darlehenswunsch ?? c.financingRequest?.kaufpreis ?? null,
    leadPhase: c.leadPhase,
    leadPhaseSeit: c.leadPhaseSeit,
    wiedervorlage: c.wiedervorlage,
    verlorenAm: c.verlorenAm,
    verlorenGrund: c.verlorenGrund,
    vorschlag: schlagePhaseVor({
      leadPhase: c.leadPhase,
      verlorenAm: c.verlorenAm,
      status: c.status,
      abschlussdatum: c.abschlussdatum,
      hatLink: c._count.uploadLinks > 0 || c._count.selfDisclosureLinks > 0,
      hatGesendeteNachricht: c.generatedMessages.length > 0,
      selbstauskunftBegonnen: Boolean(c.selfDisclosures[0]?.currentStep),
      dokumenteVorhanden: c._count.documents > 0,
    }),
  }));

  const board = buildBoard(boardKarten, jetzt);
  const alsView = (s: (typeof board.spalten)[number]) => ({
    phase: s.phase,
    titel: s.titel,
    anzahl: s.anzahl,
    summe: s.summe,
    weitere: s.weitere,
    karten: s.karten.map((k) => ({
      caseId: k.caseId,
      caseNumber: k.caseNumber,
      kundenName: k.kundenName,
      volumen: k.volumen,
      leadPhase: k.leadPhase,
      liegezeit: liegezeitTage(k.leadPhaseSeit, jetzt),
      wiedervorlage: k.wiedervorlage ? k.wiedervorlage.toLocaleDateString("de-DE") : null,
      verlorenGrund: k.verlorenGrund,
      vorschlag: k.vorschlag,
    })),
  });
```

Im JSX das Kanban **über** die vorhandenen Karten setzen, direkt nach `<PageHeader …/>`:

```tsx
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leads nach Phase</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadBoard spalten={board.spalten.map(alsView)} verloren={alsView(board.verloren)} />
        </CardContent>
      </Card>
```

Die dafür nötigen Relationen (`selfDisclosures` am `Case`, `case` am
`SelfDisclosure`) sind bereits in Task 1 ergänzt worden. Sollte
`npm run typecheck` sie vermissen, dort nachziehen und `npx prisma generate`
laufen lassen.

- [ ] **Step 4: Typecheck und Build**

Run: `npm run typecheck && npm run build`
Expected: keine Ausgabe, Build „Compiled successfully".

- [ ] **Step 5: Committen**

```bash
git add src/components/pipeline "src/app/(app)/pipeline/page.tsx" prisma/schema.prisma
git commit -m "feat(leadphasen): Kanban auf der Pipeline-Seite"
```

---

### Task 5: Phase auf der Fallseite

**Files:**
- Create: `src/components/case/lead-phase-select.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `setzePhase`, `setzeVerloren`, `hebeVerlustAuf` (Task 3), `schlagePhaseVor` (Task 1).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Komponente schreiben**

Create `src/components/case/lead-phase-select.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";
import { setzePhase, hebeVerlustAuf } from "@/lib/actions/lead-phase";

/**
 * Vertriebsphase im Fallkopf – neben dem Bearbeitungsstatus, nicht statt seiner.
 * Der Vorschlag steht als Chip daneben und wird mit einem Klick bestätigt.
 */
export function LeadPhaseSelect({
  caseId,
  phase,
  vorschlag,
  verlorenGrund,
}: {
  caseId: string;
  phase: string;
  vorschlag: string | null;
  verlorenGrund: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (verlorenGrund !== null) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="warning">Verloren · {verlorenGrund}</Badge>
        <button
          className="text-xs text-muted-foreground hover:underline"
          disabled={pending}
          onClick={() => startTransition(() => void hebeVerlustAuf(caseId))}
        >
          Verlust aufheben
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Vertriebsphase"
        value={phase}
        disabled={pending}
        onChange={(e) => startTransition(() => void setzePhase(caseId, e.target.value))}
        className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
      >
        {LEAD_PHASES.map((p: LeadPhase) => (
          <option key={p} value={p}>
            {LEAD_PHASE_LABELS[p]}
          </option>
        ))}
      </select>
      {vorschlag && (
        <button
          disabled={pending}
          onClick={() => startTransition(() => void setzePhase(caseId, vorschlag))}
          className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs hover:bg-muted"
        >
          → {LEAD_PHASE_LABELS[vorschlag as LeadPhase]}? <Check className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: In die Fallseite einhängen**

In `src/app/(app)/cases/[id]/page.tsx` die Importe ergänzen:

```tsx
import { LeadPhaseSelect } from "@/components/case/lead-phase-select";
import { schlagePhaseVor } from "@/lib/cases/lead-phase";
```

Die bestehende Abfrage `caseRow` um die neuen Felder erweitern — sie lädt
bereits `include`, daher stehen `leadPhase`, `leadPhaseSeit`, `verlorenAm` und
`verlorenGrund` automatisch zur Verfügung.

Das Signal „gesendete Nachricht" muss geladen werden — sonst schlüge die
Fallseite eine andere Phase vor als das Board, und man traut keinem von beiden.
Die bestehende `Promise.all`-Liste um einen Eintrag erweitern:

```tsx
    prisma.generatedMessage.count({ where: { caseId: id, sent: true } }),
```

Das Ergebnis als `gesendeteNachrichten` aufnehmen und den Vorschlag danach
berechnen:

```tsx
  const phasenVorschlag = schlagePhaseVor({
    leadPhase: caseRow.leadPhase,
    verlorenAm: caseRow.verlorenAm,
    status: caseRow.status,
    abschlussdatum: caseRow.abschlussdatum,
    hatLink: uploadLinks.length > 0 || Boolean(selbstauskunftBogen?.link),
    hatGesendeteNachricht: gesendeteNachrichten > 0,
    selbstauskunftBegonnen: Boolean(selbstauskunftBogen?.currentStep),
    dokumenteVorhanden: documents.length > 0,
  });
```

Im Kopfbereich, direkt neben der bestehenden `wiedervorlage`-Anzeige
(um Zeile 170), einfügen:

```tsx
              <LeadPhaseSelect
                caseId={id}
                phase={caseRow.leadPhase}
                vorschlag={phasenVorschlag}
                verlorenGrund={caseRow.verlorenAm ? caseRow.verlorenGrund : null}
              />
```

- [ ] **Step 3: Typecheck, Tests, Build**

Run: `npm run typecheck && npm test && npm run build`
Expected: keine Ausgabe, alle Tests grün, Build „Compiled successfully".

- [ ] **Step 4: Committen**

```bash
git add src/components/case/lead-phase-select.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(leadphasen): Phase samt Vorschlag im Fallkopf"
```

---

### Task 6: Bestandsdaten, Integrationstest und Rollout

**Files:**
- Create: `scripts/backfill-lead-phase.ts`
- Create: `tests/lead-phase-db.test.ts`

**Interfaces:**
- Consumes: `schlagePhaseVor` (Task 1).
- Produces: `backfillLeadPhase(client): Promise<{ gesetzt: number; geprueft: number }>`

- [ ] **Step 1: Bestandsdaten-Skript schreiben**

Create `scripts/backfill-lead-phase.ts`:

```ts
/**
 * Setzt die Vertriebsphase aller vorhandenen Fälle – einmalig.
 *
 * Benutzt bewusst DIESELBE Vorschlagsfunktion wie der laufende Betrieb, damit
 * es keine zweite Zuordnung gibt, die anders altert als die Regel.
 *
 * Aufruf: npx tsx --env-file=.env scripts/backfill-lead-phase.ts
 */
import { PrismaClient } from "@prisma/client";
import { schlagePhaseVor } from "../src/lib/cases/lead-phase";

export async function backfillLeadPhase(
  prisma: PrismaClient
): Promise<{ gesetzt: number; geprueft: number }> {
  const faelle = await prisma.case.findMany({
    select: {
      id: true,
      status: true,
      leadPhase: true,
      verlorenAm: true,
      abschlussdatum: true,
      updatedAt: true,
      _count: { select: { documents: true, uploadLinks: true, selfDisclosureLinks: true } },
      generatedMessages: { where: { sent: true }, select: { id: true }, take: 1 },
      selfDisclosures: { select: { currentStep: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  let gesetzt = 0;
  for (const c of faelle) {
    const vorschlag = schlagePhaseVor({
      leadPhase: c.leadPhase,
      verlorenAm: c.verlorenAm,
      status: c.status,
      abschlussdatum: c.abschlussdatum,
      hatLink: c._count.uploadLinks > 0 || c._count.selfDisclosureLinks > 0,
      hatGesendeteNachricht: c.generatedMessages.length > 0,
      selbstauskunftBegonnen: Boolean(c.selfDisclosures[0]?.currentStep),
      dokumenteVorhanden: c._count.documents > 0,
    });
    if (!vorschlag) continue;
    await prisma.case.update({
      where: { id: c.id },
      // leadPhaseSeit auf updatedAt, damit die Liegezeiten nicht alle bei null
      // beginnen und das Board am ersten Tag nicht "alles frisch" behauptet.
      data: { leadPhase: vorschlag, leadPhaseSeit: c.updatedAt },
    });
    gesetzt += 1;
  }
  return { gesetzt, geprueft: faelle.length };
}

if (process.argv[1]?.includes("backfill-lead-phase")) {
  const prisma = new PrismaClient();
  backfillLeadPhase(prisma)
    .then((r) => console.log(`${r.gesetzt} von ${r.geprueft} Fällen gesetzt.`))
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 2: Integrationstest schreiben**

Create `tests/lead-phase-db.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Bestandsdaten-Lauf gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/lead-phase-db.test.ts
 */
describe.runIf(RUN)("Bestandsdaten-Lauf (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
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
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-lp" } });
    orgId = org.id;
  }, 180_000);

  it("setzt die Phase je nach Zustand des Falls", async () => {
    const frisch = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9200", status: "neu" },
    });
    const exportiert = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9201", status: "exportiert" },
    });
    const fertig = await prisma.case.create({
      data: {
        organizationId: orgId,
        caseNumber: "UP-2026-9202",
        status: "abgeschlossen",
        abschlussdatum: new Date(),
      },
    });
    const verloren = await prisma.case.create({
      data: {
        organizationId: orgId,
        caseNumber: "UP-2026-9203",
        status: "exportiert",
        verlorenAm: new Date(),
        verlorenGrund: "kondition",
      },
    });

    const { backfillLeadPhase } = await import("../scripts/backfill-lead-phase");
    const r = await backfillLeadPhase(prisma);
    expect(r.geprueft).toBe(4);

    const lies = async (id: string) =>
      (await prisma.case.findUnique({ where: { id } })).leadPhase;

    expect(await lies(frisch.id)).toBe("neu");
    expect(await lies(exportiert.id)).toBe("kreditpruefung_eingereicht");
    expect(await lies(fertig.id)).toBe("abgeschlossen");
    // Verlorene Fälle bleiben unangetastet – ihre Phase ist Teil der Geschichte.
    expect(await lies(verloren.id)).toBe("neu");
  }, 60_000);
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/lead-phase-db.test.ts`
Expected: PASS.

Ohne `RUN_DB_IT=1` muss er übersprungen werden:
`npx vitest run tests/lead-phase-db.test.ts` → „skipped".

- [ ] **Step 4: Volle Suite, Typecheck, Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün.

- [ ] **Step 5: Committen**

```bash
git add scripts/backfill-lead-phase.ts tests/lead-phase-db.test.ts
git commit -m "feat(leadphasen): Bestandsdaten-Lauf und Integrationstest"
```

- [ ] **Step 6: Schema in die Datenbank bringen**

**Nur nach ausdrücklicher Freigabe durch Jürgen** — der Befehl läuft gegen die
Produktionsdatenbank:

Run: `npm run db:push`
Expected: „Your database is now in sync with your Prisma schema."

Gegenprüfen: `npx prisma db pull --print | grep -E "leadPhase|verlorenAm"`
Expected: beide Felder vorhanden.

- [ ] **Step 7: Bestandsfälle setzen**

Run: `npx tsx --env-file=.env scripts/backfill-lead-phase.ts`
Expected: Ausgabe „n von m Fällen gesetzt."

Danach in der Datenbank gegenprüfen, dass nicht alle Fälle auf `neu` stehen:

```bash
npx prisma db execute --stdin <<'SQL'
SELECT "leadPhase", count(*) FROM unterlagenpilot.cases GROUP BY 1 ORDER BY 2 DESC;
SQL
```

- [ ] **Step 8: Deployen und nachsehen**

Nach Freigabe: `git push`, Vercel-Build abwarten, Status prüfen
(`vercel ls --prod`). Danach `/pipeline` öffnen: Die Spalten müssen gefüllt
sein, eine Karte per Ziehen verschieben lassen und den Wechsel nach dem
Neuladen behalten. Behauptungen über den Live-Stand erst nach dieser
Sichtprüfung (siehe `verify-deployed-claims`).

---

## Offene Punkte für später

- Verweildauer-Auswertung aus den Audit-Einträgen.
- Automatische Wiedervorlage beim Phasenwechsel.
- Signale für `finanzierungsvorschlag` und `zusage`, sobald Europace-Rückmeldungen
  angebunden sind.
- Der Nebenbefund aus der Spec: `next-step.ts:149` prüft `status === "eingereicht"`,
  einen Wert, den `CaseStatus` nicht kennt.
