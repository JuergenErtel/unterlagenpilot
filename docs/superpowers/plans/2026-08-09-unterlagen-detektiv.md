# Unterlagen-Detektiv Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Objektunterlagen lesen, daraus ableiten welche weiteren Urkunden existieren müssen, gegen die Akte abgleichen und die Lücken dem Vermittler zur Freigabe vorschlagen.

**Architecture:** Hybrid. Die KI liest aus einem Dokument nur Fakten (welche Urkunden nennt es, und welche Urkunde ist es selbst) und speichert sie als `DocumentReference`. Ein deterministischer Regelkatalog leitet daraus Folgeanforderungen ab, ein deterministischer Abgleich prüft, was davon schon in der Akte liegt, und persistiert die Lücken als `CaseFinding`. Freigegebene Befunde werden zu `CaseChecklistItem` — damit greift die bestehende Nachforderungs-Maschinerie unverändert.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma 6 / PostgreSQL (Supabase, Schema `unterlagenpilot`), Zod, Vitest, Mistral über die vorhandene `AIService`-Schicht.

**Spec:** `docs/superpowers/specs/2026-08-09-unterlagen-detektiv-design.md`

## Global Constraints

- **Deutsch in allem, was der Nutzer sieht.** Titel von Befunden sind kundentauglich formuliert (sie landen über die Checkliste im Upload-Link) — keine internen Kürzel wie `te_nachtrag_2`.
- **Keine Kundendaten in Logs.** Bestehende Regel der `AIService`-Schicht; `console.error` nur mit IDs und Fehlertyp.
- **Fachwissen gehört in Code, nicht in Prompts.** Die KI liefert nur Fakten; welche Folgeunterlage eine Last auslöst, entscheidet ausschließlich `src/lib/detektiv/rules.ts`.
- **Nichts ohne Freigabe.** Der Detektiv legt niemals selbst eine Checklistenposition an. Erst eine Server Action nach Klick des Vermittlers tut das.
- **Ein gescheiterter Detektiv-Lauf darf nichts anderes kippen.** Weder OCR, Klassifikation noch Feld-Extraktion. Und er darf nicht wie „nichts gefunden" aussehen.
- **Token-Budget:** Mistral-Konto erlaubt 50 Req/min und 50.000 Tokens/min. Nie ein Volldokument an die KI geben — immer nur Kandidatenseiten, hart gedeckelt auf 12 Seiten.
- **Schemaänderungen laufen über `scripts/supabase-sql.sh`**, nicht über `prisma db push` (DATABASE_URL ist in Vercel write-only; db:push gegen PROD ist in diesem Projekt schon einmal schiefgegangen).
- **Testlauf:** `npx vitest run <datei>` für Einzeltests, `npm test` für alles. DB-Tests laufen nur mit `RUN_DB_IT=1`.

---

## File Structure

**Neu — `src/lib/detektiv/`** (fachlich abgeschlossen, jede Datei eine Aufgabe):

| Datei | Verantwortung |
|---|---|
| `types.ts` | gemeinsame Typen: `DocReference`, `FindingCode`, `Resolution`, `SelbstAuskunft` |
| `pages.ts` | deterministischer Kandidatenseiten-Filter vor dem KI-Aufruf |
| `schema.ts` | Zod-Schema des KI-Antwortvertrags |
| `fingerprint.ts` | stabiler Fingerabdruck eines Befunds |
| `rules.ts` | Folgeregel-Katalog (Bestandsverzeichnis, Abt. II, Abt. III, Kaufvertrag, WEG) |
| `match.ts` | Normalisierung und stufenweiser Abgleich |
| `completeness.ts` | Seitenzahl-Logik, Anlagen, Aktualität |
| `service.ts` | Orchestrierung mit DB: Verweislauf (KI) und Abgleichslauf (deterministisch) |

**Geändert:**

| Datei | Änderung |
|---|---|
| `prisma/schema.prisma` | Modelle `DocumentReference`, `CaseFinding`; Feld `Document.referenceStatus` |
| `src/lib/domain/enums.ts` | zwei neue `AUDIT_ACTIONS` |
| `src/lib/ai/service.ts` | Methode `extractDocumentReferences` |
| `src/lib/ai/mock-provider.ts` | Mock-Zweig `documentReferences` |
| `src/lib/documents/pipeline.ts` | Detektiv-Lauf im Hintergrund anstoßen |
| `src/lib/cases/next-step.ts` | neue Stufe `unterlagen_luecken` |
| `src/lib/actions/detektiv.ts` (neu) | Server Actions für Übernehmen/Verwerfen/Zuordnen/Prüfen |
| `src/components/case/findings-panel.tsx` (neu) | Oberfläche |
| `src/app/(app)/cases/[id]/page.tsx` | Panel einbinden |

**Tests:** `tests/detektiv-pages.test.ts`, `detektiv-fingerprint.test.ts`, `detektiv-rules.test.ts`, `detektiv-match.test.ts`, `detektiv-completeness.test.ts`, `detektiv-schema-vertrag.test.ts`, `detektiv-service-db.test.ts`, `detektiv-actions.test.ts`; Erweiterung von `tests/next-step.test.ts`.

**Reihenfolge:** Tasks 1–5 sind reine Funktionen ohne DB und ohne KI — sie tragen das Fachwissen und lassen sich vollständig testen. Task 6 ist der KI-Vertrag. Task 7 legt das Schema an. Ab Task 8 wird verdrahtet.

---

### Task 1: Kandidatenseiten-Filter

Reduziert eine 60-seitige Teilungserklärung auf die Seiten, die überhaupt Verweise enthalten können. Ohne diesen Filter sprengt ein einziges Dokument das Token-Budget.

**Files:**
- Create: `src/lib/detektiv/types.ts`
- Create: `src/lib/detektiv/pages.ts`
- Test: `tests/detektiv-pages.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `type ReferenceKind = "selbst" | "bezugsurkunde" | "nachtrag" | "anlage" | "last" | "grundpfandrecht"`
  - `interface DocReference` (siehe Code unten)
  - `interface SeitenText { pageNumber: number; text: string | null }`
  - `function candidatePages(pages: SeitenText[], max?: number): Array<{ pageNumber: number; text: string }>`
  - `const REFERENCE_PATTERNS: RegExp[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-pages.test.ts
import { describe, it, expect } from "vitest";
import { candidatePages } from "@/lib/detektiv/pages";

describe("Kandidatenseiten-Filter", () => {
  it("nimmt nur Seiten mit Verweis-Mustern", () => {
    const pages = [
      { pageNumber: 1, text: "Wohnungsgrundbuch von Musterstadt, Blatt 4711" },
      { pageNumber: 2, text: "Bezug: Bewilligung vom 12.03.1998, UR-Nr. 456/1998" },
      { pageNumber: 3, text: "Lageplan ohne besondere Angaben" },
      { pageNumber: 4, text: "Abteilung II: Erbbaurecht fuer die Stadt Musterstadt" },
    ];
    const out = candidatePages(pages);
    expect(out.map((p) => p.pageNumber)).toEqual([2, 4]);
  });

  it("ueberspringt Seiten ohne OCR-Text", () => {
    const out = candidatePages([
      { pageNumber: 1, text: null },
      { pageNumber: 2, text: "1. Nachtrag zur Teilungserklaerung" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pageNumber).toBe(2);
  });

  it("deckelt auf hoechstens max Seiten", () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Anlage ${i + 1} zur Urkunde`,
    }));
    expect(candidatePages(pages, 12)).toHaveLength(12);
  });

  it("findet Muster unabhaengig von Gross-/Kleinschreibung und Umlauten", () => {
    const out = candidatePages([
      { pageNumber: 1, text: "abgeschlossenheitsbescheinigung liegt vor" },
      { pageNumber: 2, text: "AUFTEILUNGSPLAN Nr. 12" },
      { pageNumber: 3, text: "Teilungserklärung nebst Nachträgen" },
    ]);
    expect(out.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it("liefert bei fehlenden Treffern eine leere Liste (kein Fehler)", () => {
    expect(candidatePages([{ pageNumber: 1, text: "nichts davon hier" }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-pages.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/pages"`

- [ ] **Step 3: Write the types**

```ts
// src/lib/detektiv/types.ts

/**
 * Art eines im Dokument gefundenen Verweises.
 *  - selbst:          Eigenauskunft ("Ich bin der 2. Nachtrag, UR 789/2011").
 *                     Ohne sie ist kein Abgleich moeglich.
 *  - bezugsurkunde:   im Bestandsverzeichnis in Bezug genommene Urkunde
 *  - nachtrag:        Nachtrag zu einer Bezugsurkunde
 *  - anlage:          im Text erwaehnte Anlage (Aufteilungsplan, Bescheinigung)
 *  - last:            Eintragung in Abteilung II
 *  - grundpfandrecht: Eintragung in Abteilung III
 */
export type ReferenceKind =
  | "selbst"
  | "bezugsurkunde"
  | "nachtrag"
  | "anlage"
  | "last"
  | "grundpfandrecht";

/** Ein von der KI gelesener Verweis. Reine Faktenebene, noch keine Bewertung. */
export interface DocReference {
  kind: ReferenceKind;
  /** z. B. "2. Nachtrag zur Teilungserklärung" oder "Erbbaurecht" */
  label: string;
  /** ISO-Datum yyyy-mm-dd, sofern im Text genannt */
  urkundeDatum: string | null;
  /** z. B. "789/2011" */
  urkundenNummer: string | null;
  notar: string | null;
  abteilung: "BV" | "II" | "III" | null;
  laufendeNummer: string | null;
  sourcePage: number;
  /** woertliches Zitat – Grundlage der Nachpruefbarkeit im UI */
  sourceQuote: string;
  confidence: number;
}

/** Eigenauskunft eines bereits in der Akte liegenden Dokuments. */
export interface SelbstAuskunft {
  documentId: string;
  documentType: string | null;
  label: string;
  urkundeDatum: string | null;
  urkundenNummer: string | null;
}

export interface SeitenText {
  pageNumber: number;
  text: string | null;
}

export type FindingCode =
  | "referenz_fehlt"
  | "folgeunterlage_noetig"
  | "anlage_fehlt"
  | "seiten_unvollstaendig"
  | "dokument_veraltet"
  | "serienluecke";

/**
 * neue_position:        Freigabe legt eine NEUE Checklistenposition an.
 * dokument_nachfordern: Freigabe setzt die BESTEHENDE Position auf
 *                       "unvollstaendig" – verhindert Dubletten.
 */
export type Resolution = "neue_position" | "dokument_nachfordern";
```

- [ ] **Step 4: Write the filter**

```ts
// src/lib/detektiv/pages.ts
import type { SeitenText } from "./types";

/**
 * Muster, an denen eine Seite ueberhaupt Verweise tragen kann. Bewusst grosszuegig
 * (Recall vor Precision): eine Seite zuviel an die KI zu geben kostet Tokens, eine
 * Seite zu wenig laesst eine Luecke unentdeckt – und das ist der teurere Fehler.
 */
export const REFERENCE_PATTERNS: RegExp[] = [
  /ur[-\s.]*nr/i,
  /urkundenrolle/i,
  /bezug\s*:/i,
  /bewilligung\s+vom/i,
  /nachtr[aä]g/i,
  /teilungserkl[aä]rung/i,
  /abteilung\s*(ii|iii|2|3)\b/i,
  /\banlage\b/i,
  /aufteilungsplan/i,
  /abgeschlossenheitsbescheinigung/i,
  /gemeinschaftsordnung/i,
  /erbbaurecht/i,
  /sonderumlage/i,
  /wirtschaftsplan/i,
  /jahresabrechnung/i,
];

/**
 * Waehlt die Seiten aus, die an die KI gehen. Harte Deckelung, weil das
 * Mistral-Konto 50.000 Tokens pro Minute erlaubt und eine Teilungserklaerung
 * 40–80 Seiten hat.
 */
export function candidatePages(
  pages: SeitenText[],
  max = 12
): Array<{ pageNumber: number; text: string }> {
  const treffer: Array<{ pageNumber: number; text: string }> = [];
  for (const p of pages) {
    if (!p.text) continue;
    if (REFERENCE_PATTERNS.some((re) => re.test(p.text as string))) {
      treffer.push({ pageNumber: p.pageNumber, text: p.text });
    }
    if (treffer.length >= max) break;
  }
  return treffer;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/detektiv-pages.test.ts`
Expected: PASS, 5 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/detektiv/types.ts src/lib/detektiv/pages.ts tests/detektiv-pages.test.ts
git commit -m "feat(detektiv): Kandidatenseiten-Filter vor dem KI-Lauf"
```

---

### Task 2: Fingerabdruck

Ohne stabilen Fingerabdruck erzeugt jeder Lauf dieselben Befunde neu und verworfene Befunde kehren zurück. Das Feature wäre nach einer Woche unbrauchbar.

**Files:**
- Create: `src/lib/detektiv/fingerprint.ts`
- Test: `tests/detektiv-fingerprint.test.ts`

**Interfaces:**
- Consumes: `FindingCode` aus `src/lib/detektiv/types.ts`
- Produces: `function fingerprint(input: { sourceDocumentId: string; code: FindingCode; refKey: string }): string` — 32 Zeichen Hex
- Produces: `function refKeyOf(ref: Pick<DocReference, "urkundenNummer" | "urkundeDatum" | "label">): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-fingerprint.test.ts
import { describe, it, expect } from "vitest";
import { fingerprint, refKeyOf } from "@/lib/detektiv/fingerprint";

describe("Fingerabdruck", () => {
  const basis = { sourceDocumentId: "doc1", code: "referenz_fehlt" as const, refKey: "ur:789/2011" };

  it("ist stabil ueber Laeufe", () => {
    expect(fingerprint(basis)).toBe(fingerprint({ ...basis }));
  });

  it("unterscheidet verschiedene Urkunden", () => {
    expect(fingerprint(basis)).not.toBe(fingerprint({ ...basis, refKey: "ur:512/2004" }));
  });

  it("unterscheidet verschiedene Codes am selben Dokument", () => {
    expect(fingerprint(basis)).not.toBe(fingerprint({ ...basis, code: "anlage_fehlt" }));
  });

  it("liefert 32 Zeichen Hex", () => {
    expect(fingerprint(basis)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("refKeyOf – Vorrang der Kennungen", () => {
  it("nimmt die Urkundennummer, wenn vorhanden", () => {
    expect(
      refKeyOf({ urkundenNummer: "789/2011", urkundeDatum: "2011-08-11", label: "2. Nachtrag" })
    ).toBe("ur:789/2011");
  });

  it("faellt auf das Datum zurueck", () => {
    expect(
      refKeyOf({ urkundenNummer: null, urkundeDatum: "2011-08-11", label: "2. Nachtrag" })
    ).toBe("dat:2011-08-11");
  });

  it("faellt zuletzt auf das normalisierte Label zurueck", () => {
    expect(refKeyOf({ urkundenNummer: null, urkundeDatum: null, label: "2. Nachtrag zur TE" })).toBe(
      "lab:2nachtragzurte"
    );
  });

  it("ignoriert Schreibweise und Leerzeichen der Urkundennummer", () => {
    expect(refKeyOf({ urkundenNummer: " UR 789 / 2011 ", urkundeDatum: null, label: "x" })).toBe(
      refKeyOf({ urkundenNummer: "789/2011", urkundeDatum: null, label: "y" })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-fingerprint.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/fingerprint"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/detektiv/fingerprint.ts
import { createHash } from "node:crypto";
import type { DocReference, FindingCode } from "./types";

/**
 * Kennung einer Urkunde fuer den Fingerabdruck. Vorrang: Urkundennummer, dann
 * Datum, dann normalisiertes Label. Bewusst OHNE Zitat, Seitenzahl und
 * Confidence – die aendern sich bei einer erneuten Extraktion, und ein Befund
 * darf dadurch nicht zu einem neuen Befund werden.
 */
export function refKeyOf(
  ref: Pick<DocReference, "urkundenNummer" | "urkundeDatum" | "label">
): string {
  if (ref.urkundenNummer) {
    const nr = ref.urkundenNummer.toLowerCase().replace(/ur[-\s.]*nr\.?/g, "").replace(/\s+/g, "");
    if (nr) return `ur:${nr}`;
  }
  if (ref.urkundeDatum) return `dat:${ref.urkundeDatum}`;
  const lab = ref.label
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
  return `lab:${lab}`;
}

/** Stabiler Fingerabdruck eines Befunds. Trägt den Unique-Index je Fall. */
export function fingerprint(input: {
  sourceDocumentId: string;
  code: FindingCode;
  refKey: string;
}): string {
  return createHash("sha256")
    .update(`${input.sourceDocumentId}|${input.code}|${input.refKey}`)
    .digest("hex")
    .slice(0, 32);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/detektiv-fingerprint.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/detektiv/fingerprint.ts tests/detektiv-fingerprint.test.ts
git commit -m "feat(detektiv): stabiler Fingerabdruck fuer Befunde"
```

---

### Task 3: Folgeregel-Katalog

Das Fachwissen des Vermittlers als deklarativer, versionierter Code. Ausschließlich hier wird entschieden, was aus einer Eintragung folgt — nie im Prompt.

**Files:**
- Create: `src/lib/detektiv/rules.ts`
- Test: `tests/detektiv-rules.test.ts`

**Interfaces:**
- Consumes: `DocReference`, `FindingCode`, `Resolution` aus `./types`; `refKeyOf` aus `./fingerprint`; `DocumentType`, `Severity` aus `@/lib/domain/enums`
- Produces:
  - `interface FollowUp { code: FindingCode; title: string; reason: string; severity: Severity; resolution: Resolution; documentType: DocumentType | null; refKey: string; hinweisOnly: boolean }`
  - `function followUpsFor(ref: DocReference, sourceType: DocumentType | null): FollowUp[]`
  - `const LAST_RULES: LastRule[]` (exportiert für den Test auf eindeutige Schlüssel)

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-rules.test.ts
import { describe, it, expect } from "vitest";
import { followUpsFor, LAST_RULES } from "@/lib/detektiv/rules";
import type { DocReference } from "@/lib/detektiv/types";

const ref = (over: Partial<DocReference>): DocReference => ({
  kind: "last",
  label: "",
  urkundeDatum: null,
  urkundenNummer: null,
  notar: null,
  abteilung: null,
  laufendeNummer: null,
  sourcePage: 1,
  sourceQuote: "Zitat",
  confidence: 0.9,
  ...over,
});

describe("Folgeregel-Katalog – Bestandsverzeichnis", () => {
  it("macht aus jedem Nachtrag eine eigene Position mit Datum und Nummer im Titel", () => {
    const out = followUpsFor(
      ref({ kind: "nachtrag", label: "2. Nachtrag zur Teilungserklärung", urkundeDatum: "2011-08-11", urkundenNummer: "789/2011" }),
      "grundbuchauszug"
    );
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("referenz_fehlt");
    expect(out[0].resolution).toBe("neue_position");
    expect(out[0].documentType).toBe("teilungserklaerung");
    expect(out[0].title).toContain("2. Nachtrag zur Teilungserklärung");
    expect(out[0].title).toContain("11.08.2011");
    expect(out[0].title).toContain("789/2011");
  });

  it("erzeugt fuer die Bezugsurkunde Teilungserklaerung eine Position", () => {
    const out = followUpsFor(
      ref({ kind: "bezugsurkunde", label: "Teilungserklärung", urkundeDatum: "1998-03-12" }),
      "grundbuchauszug"
    );
    expect(out[0].documentType).toBe("teilungserklaerung");
  });

  it("erzeugt fuer erwaehnte Anlagen einen anlage_fehlt-Befund", () => {
    const out = followUpsFor(ref({ kind: "anlage", label: "Aufteilungsplan" }), "teilungserklaerung");
    expect(out[0].code).toBe("anlage_fehlt");
    expect(out[0].resolution).toBe("neue_position");
  });
});

describe("Folgeregel-Katalog – Abteilung II", () => {
  it("Erbbaurecht verlangt Vertrag UND Beleihungszustimmung", () => {
    const out = followUpsFor(ref({ label: "Erbbaurecht", abteilung: "II" }), "grundbuchauszug");
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/Erbbaurechtsvertrag/);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/Zustimmung/);
    expect(out.every((f) => f.code === "folgeunterlage_noetig")).toBe(true);
  });

  it("Sanierungsvermerk verlangt die Genehmigung nach Paragraf 144 BauGB", () => {
    const out = followUpsFor(ref({ label: "Sanierungsvermerk", abteilung: "II" }), "grundbuchauszug");
    expect(out[0].reason).toContain("144");
  });

  it("Wegerecht ist ein reiner Hinweis ohne Unterlage", () => {
    const out = followUpsFor(ref({ label: "Geh- und Fahrtrecht", abteilung: "II" }), "grundbuchauszug");
    expect(out).toHaveLength(1);
    expect(out[0].hinweisOnly).toBe(true);
    expect(out[0].documentType).toBeNull();
  });

  it("Nießbrauch und Wohnrecht verlangen Loeschungsbewilligung oder Bewertung", () => {
    for (const label of ["Nießbrauch", "Wohnungsrecht"]) {
      const out = followUpsFor(ref({ label, abteilung: "II" }), "grundbuchauszug");
      expect(out.length, label).toBeGreaterThan(0);
      expect(out[0].hinweisOnly, label).toBe(false);
    }
  });

  it("ignoriert eine unbekannte Last, statt etwas zu erfinden", () => {
    expect(followUpsFor(ref({ label: "Irgendwas Unbekanntes", abteilung: "II" }), "grundbuchauszug")).toEqual([]);
  });
});

describe("Folgeregel-Katalog – Abteilung III", () => {
  it("jede Grundschuld verlangt eine Lastenfreistellung", () => {
    const out = followUpsFor(
      ref({ kind: "grundpfandrecht", label: "Grundschuld 250.000 EUR Sparkasse", abteilung: "III" }),
      "grundbuchauszug"
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toMatch(/Lastenfreistellung|Löschungsbewilligung/);
  });
});

describe("Folgeregel-Katalog – Kaufvertrag und WEG", () => {
  it("Bautraegervertrag zieht vier Unterlagen nach", () => {
    const out = followUpsFor(ref({ kind: "last", label: "Bauträgervertrag" }), "kaufvertragsentwurf");
    expect(out).toHaveLength(4);
    expect(out.map((f) => f.title).join(" | ")).toMatch(/MaBV/);
  });

  it("beschlossene Sonderumlage verlangt den Beschluss", () => {
    const out = followUpsFor(ref({ kind: "last", label: "Sonderumlage" }), "weg_protokoll");
    expect(out[0].code).toBe("folgeunterlage_noetig");
  });
});

describe("Katalog-Hygiene", () => {
  it("hat eindeutige Regelschluessel", () => {
    const keys = LAST_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("jede Folge hat einen kundentauglichen Titel ohne interne Kuerzel", () => {
    for (const r of LAST_RULES) {
      for (const f of r.requires) {
        expect(f.title, r.key).not.toMatch(/[a-z]+_[a-z]+/);
        expect(f.title.length, r.key).toBeGreaterThan(5);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-rules.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/rules"`

- [ ] **Step 3: Prüfen, ob der Dokumenttyp `weg_protokoll` existiert**

Run: `grep -n "weg_protokoll\|protokoll" src/lib/domain/enums.ts prisma/schema.prisma`

Fehlt der Wert, ihn in **beiden** Dateien ergänzen (`DOCUMENT_TYPES` in `src/lib/domain/enums.ts`, `enum DocumentType` in `prisma/schema.prisma`) und ein Label in `DOCUMENT_TYPE_LABELS` setzen: `weg_protokoll: "Protokoll der Eigentümerversammlung"`. Die Enum-Erweiterung wandert in Task 7 mit ins Migrations-SQL.

- [ ] **Step 4: Write the rules**

```ts
// src/lib/detektiv/rules.ts
import type { DocumentType, Severity } from "@/lib/domain/enums";
import type { DocReference, FindingCode, Resolution } from "./types";
import { refKeyOf } from "./fingerprint";

export interface FollowUp {
  code: FindingCode;
  /** kundentauglich – landet ueber die Checkliste im Upload-Link */
  title: string;
  reason: string;
  severity: Severity;
  resolution: Resolution;
  documentType: DocumentType | null;
  refKey: string;
  /** true = nur Hinweis, erzeugt keine Unterlagen-Anforderung */
  hinweisOnly: boolean;
}

interface FollowUpDef {
  title: string;
  reason: string;
  severity: Severity;
  documentType: DocumentType | null;
  hinweisOnly?: boolean;
}

export interface LastRule {
  key: string;
  /** gegen das kleingeschriebene Label geprueft */
  match: RegExp;
  /** auf welche Quelldokumente die Regel anwendbar ist; leer = alle */
  sourceTypes: DocumentType[];
  requires: FollowUpDef[];
}

/**
 * Was folgt aus einer Eintragung? Ausschliesslich hier – nie im Prompt.
 *
 * Bewusste Grenze: Baulasten stehen NICHT im Grundbuch, sondern im
 * Baulastenverzeichnis der Bauaufsicht, und das gibt es nicht in allen
 * Bundeslaendern (u. a. nicht in Bayern und Brandenburg). Die Baulastenauskunft
 * wird deshalb aus dem Kaufvertrag abgeleitet, nicht aus dem Grundbuch.
 */
export const LAST_RULES: LastRule[] = [
  {
    key: "abt2.erbbaurecht",
    match: /erbbaurecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Erbbaurechtsvertrag nebst allen Nachträgen",
        reason: "In Abteilung II ist ein Erbbaurecht eingetragen. Ohne den Vertrag kann keine Bank den Beleihungswert bestimmen.",
        severity: "kritisch",
        documentType: null,
      },
      {
        title: "Zustimmung des Erbbaurechtsgebers zur Beleihung",
        reason: "Bei Erbbaurecht ist die Belastung des Erbbaurechts zustimmungspflichtig. Ohne die Zustimmung ist die Grundschuld nicht eintragbar.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.wohnrecht",
    match: /wohnungsrecht|wohnrecht|nie(ß|ss)brauch/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Löschungsbewilligung oder Bewertung des Wohn-/Nießbrauchrechts",
        reason: "Ein Wohnungsrecht oder Nießbrauch mindert den Beleihungswert erheblich, solange es nicht gelöscht wird.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.sanierungsvermerk",
    match: /sanierungsvermerk|sanierungsgebiet/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Sanierungsrechtliche Genehmigung der Gemeinde",
        reason: "Bei einem Sanierungsvermerk ist der Kaufvertrag nach § 144 BauGB genehmigungspflichtig.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.vorkaufsrecht",
    match: /vorkaufsrecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Negativattest zum Vorkaufsrecht der Gemeinde",
        reason: "Solange die Gemeinde ihr Vorkaufsrecht nicht abbedungen hat, ist der Eigentumsübergang nicht gesichert.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.reallast",
    match: /reallast|altenteil|leibgeding/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Bewertung der Reallast bzw. des Altenteils",
        reason: "Eine Reallast belastet das Objekt dauerhaft und ist für den Beleihungswert zu kapitalisieren.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.wegerecht",
    match: /geh-?\s*und\s*fahrtrecht|wegerecht|leitungsrecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Hinweis: eingetragenes Geh-, Fahrt- oder Leitungsrecht",
        reason: "Bewertungsrelevant, aber es ist dafür keine zusätzliche Unterlage beizubringen.",
        severity: "warnung",
        documentType: null,
        hinweisOnly: true,
      },
    ],
  },
  {
    key: "kv.bautraeger",
    match: /bautr[aä]gervertrag|bautr[aä]ger/,
    sourceTypes: ["kaufvertragsentwurf"],
    requires: [
      { title: "MaBV-Zahlungsplan", reason: "Beim Bauträgerkauf richten sich die Auszahlungen nach den Raten der Makler- und Bauträgerverordnung.", severity: "kritisch", documentType: null },
      { title: "Baubeschreibung", reason: "Die Bank bewertet das noch nicht fertige Objekt anhand der Baubeschreibung.", severity: "kritisch", documentType: "baubeschreibung" },
      { title: "Baugenehmigung", reason: "Ohne Baugenehmigung finanziert keine Bank einen Bauträgerkauf.", severity: "kritisch", documentType: null },
      { title: "Fertigstellungsbürgschaft des Bauträgers", reason: "Absicherung gegen Insolvenz des Bauträgers vor Fertigstellung.", severity: "warnung", documentType: null },
    ],
  },
  {
    key: "kv.inventar",
    match: /inventar|zubeh[oö]r|einbauk[uü]che/,
    sourceTypes: ["kaufvertragsentwurf"],
    requires: [
      {
        title: "Hinweis: im Kaufvertrag herausgerechnetes Inventar",
        reason: "Die Bank beleiht Inventar nicht mit. Der beleihungsfähige Kaufpreis liegt entsprechend niedriger.",
        severity: "warnung",
        documentType: null,
        hinweisOnly: true,
      },
    ],
  },
  {
    key: "weg.sonderumlage",
    match: /sonderumlage/,
    sourceTypes: ["weg_protokoll"],
    requires: [
      {
        title: "Beschluss über die Sonderumlage mit Höhe und Fälligkeit",
        reason: "Eine beschlossene Sonderumlage belastet den Haushalt und ist der Bank offenzulegen.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "weg.wirtschaftsplan",
    match: /wirtschaftsplan|jahresabrechnung|instandhaltungsr[uü]cklage|r[uü]cklage/,
    sourceTypes: ["weg_protokoll"],
    requires: [
      {
        title: "Wirtschaftsplan, Jahresabrechnung und Rücklagenstand",
        reason: "Im Protokoll erwähnt, aber nicht in der Akte. Die Bank verlangt die Unterlagen der Eigentümergemeinschaft.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
];

const DATUM_DE = (iso: string | null): string | null => {
  if (!iso) return null;
  const [j, m, t] = iso.split("-");
  return j && m && t ? `${t}.${m}.${j}` : null;
};

/** "2. Nachtrag zur Teilungserklärung (11.08.2011, UR 789/2011)" */
function titelMitKennung(label: string, ref: DocReference): string {
  const teile = [DATUM_DE(ref.urkundeDatum), ref.urkundenNummer ? `UR ${ref.urkundenNummer}` : null].filter(Boolean);
  return teile.length > 0 ? `${label} (${teile.join(", ")})` : label;
}

/** Leitet aus einem gelesenen Verweis die Folgeanforderungen ab. */
export function followUpsFor(ref: DocReference, sourceType: DocumentType | null): FollowUp[] {
  const refKey = refKeyOf(ref);

  if (ref.kind === "selbst") return [];

  if (ref.kind === "bezugsurkunde" || ref.kind === "nachtrag") {
    const istTeilung = /teilungserkl/i.test(ref.label) || ref.kind === "nachtrag";
    return [
      {
        code: "referenz_fehlt",
        title: titelMitKennung(ref.label, ref),
        reason: `Im ${sourceType === "grundbuchauszug" ? "Grundbuchauszug" : "Dokument"} in Bezug genommen, liegt aber nicht in der Akte.`,
        severity: "kritisch",
        resolution: "neue_position",
        documentType: istTeilung ? "teilungserklaerung" : null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  if (ref.kind === "anlage") {
    return [
      {
        code: "anlage_fehlt",
        title: ref.label,
        reason: "Im Dokument als Anlage genannt, aber nicht beigefügt.",
        severity: "warnung",
        resolution: "neue_position",
        documentType: null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  if (ref.kind === "grundpfandrecht") {
    return [
      {
        code: "folgeunterlage_noetig",
        title: "Lastenfreistellung / Löschungsbewilligung des Altgläubigers",
        reason: `In Abteilung III eingetragen: ${ref.label}. Die Bank verlangt die lastenfreie Übergabe.`,
        severity: "kritisch",
        resolution: "neue_position",
        documentType: null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  // kind === "last": Regelkatalog befragen
  const label = ref.label.toLowerCase();
  const regel = LAST_RULES.find(
    (r) =>
      r.match.test(label) &&
      (r.sourceTypes.length === 0 || (sourceType != null && r.sourceTypes.includes(sourceType)))
  );
  if (!regel) return [];

  return regel.requires.map((f) => ({
    code: "folgeunterlage_noetig" as const,
    title: f.title,
    reason: f.reason,
    severity: f.severity,
    resolution: "neue_position" as const,
    documentType: f.documentType,
    refKey: `${regel.key}:${f.title}`,
    hinweisOnly: f.hinweisOnly ?? false,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/detektiv-rules.test.ts`
Expected: PASS, 12 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/detektiv/rules.ts tests/detektiv-rules.test.ts src/lib/domain/enums.ts prisma/schema.prisma
git commit -m "feat(detektiv): Folgeregel-Katalog fuer Grundbuch, Kaufvertrag und WEG"
```

---

### Task 4: Abgleich und Normalisierung

Entscheidet, ob eine genannte Urkunde schon in der Akte liegt. Der Zustand „unsicher" ist der Kern: ein falscher Alarm kostet mehr Vertrauen als ein ehrliches Fragezeichen.

**Files:**
- Create: `src/lib/detektiv/match.ts`
- Test: `tests/detektiv-match.test.ts`

**Interfaces:**
- Consumes: `DocReference`, `SelbstAuskunft` aus `./types`
- Produces:
  - `function normalizeLabel(s: string): string`
  - `function ordinalOf(s: string): number | null`
  - `type MatchResult = { kind: "sicher" | "unsicher"; documentId: string } | { kind: "keiner" }`
  - `function matchReference(ref: DocReference, vorhanden: SelbstAuskunft[]): MatchResult`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-match.test.ts
import { describe, it, expect } from "vitest";
import { matchReference, normalizeLabel, ordinalOf } from "@/lib/detektiv/match";
import type { DocReference, SelbstAuskunft } from "@/lib/detektiv/types";

const ref = (over: Partial<DocReference>): DocReference => ({
  kind: "nachtrag",
  label: "2. Nachtrag zur Teilungserklärung",
  urkundeDatum: null,
  urkundenNummer: null,
  notar: null,
  abteilung: null,
  laufendeNummer: null,
  sourcePage: 3,
  sourceQuote: "Zitat",
  confidence: 0.9,
  ...over,
});

const doc = (over: Partial<SelbstAuskunft>): SelbstAuskunft => ({
  documentId: "d1",
  documentType: "teilungserklaerung",
  label: "2. Nachtrag zur Teilungserklärung",
  urkundeDatum: null,
  urkundenNummer: null,
  ...over,
});

describe("Normalisierung", () => {
  it("loest Umlaute auf und entfernt Satzzeichen", () => {
    expect(normalizeLabel("2. Nachtrag zur Teilungserklärung")).toBe("2nachtragzurteilungserklarung");
  });

  it("vereinheitlicht Ordnungszahlen", () => {
    expect(ordinalOf("2. Nachtrag")).toBe(2);
    expect(ordinalOf("zweiter Nachtrag")).toBe(2);
    expect(ordinalOf("II. Nachtrag")).toBe(2);
    expect(ordinalOf("Nachtrag ohne Zahl")).toBeNull();
  });
});

describe("Abgleich – Stufe 1: Urkundennummer und Jahr", () => {
  it("trifft sicher bei gleicher Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [doc({ urkundenNummer: "789/2011" })]);
    expect(r).toEqual({ kind: "sicher", documentId: "d1" });
  });

  it("trifft auch bei abweichender Schreibweise der Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "UR-Nr. 789 / 2011" }), [doc({ urkundenNummer: "789/2011" })]);
    expect(r.kind).toBe("sicher");
  });

  it("trifft nicht bei anderer Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [doc({ urkundenNummer: "512/2004" })]);
    expect(r.kind).not.toBe("sicher");
  });
});

describe("Abgleich – Stufe 2: Typ und Datum", () => {
  it("trifft sicher bei gleichem Typ und Datum", () => {
    const r = matchReference(
      ref({ urkundeDatum: "2011-08-11" }),
      [doc({ urkundeDatum: "2011-08-11", label: "Nachtrag" })]
    );
    expect(r).toEqual({ kind: "sicher", documentId: "d1" });
  });
});

describe("Abgleich – Stufe 3: unsicher", () => {
  it("meldet unsicher bei aehnlichem Label ohne Kennung", () => {
    const r = matchReference(ref({}), [doc({ label: "Zweiter Nachtrag zur Teilungserklaerung" })]);
    expect(r).toEqual({ kind: "unsicher", documentId: "d1" });
  });

  it("behauptet NICHT fehlt, wenn Ordnungszahl und Typ passen", () => {
    const r = matchReference(ref({}), [doc({ label: "II. Nachtrag TE" })]);
    expect(r.kind).toBe("unsicher");
  });

  it("meldet keinen Treffer bei abweichender Ordnungszahl", () => {
    const r = matchReference(ref({}), [doc({ label: "1. Nachtrag zur Teilungserklärung" })]);
    expect(r).toEqual({ kind: "keiner" });
  });
});

describe("Abgleich – kein Treffer", () => {
  it("meldet keinen Treffer bei leerer Akte", () => {
    expect(matchReference(ref({}), [])).toEqual({ kind: "keiner" });
  });

  it("bevorzugt den sicheren Treffer vor dem unsicheren", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [
      doc({ documentId: "unsicher", label: "2. Nachtrag zur Teilungserklärung" }),
      doc({ documentId: "sicher", urkundenNummer: "789/2011", label: "Irgendwas" }),
    ]);
    expect(r).toEqual({ kind: "sicher", documentId: "sicher" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-match.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/match"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/detektiv/match.ts
import type { DocReference, SelbstAuskunft } from "./types";

export type MatchResult =
  | { kind: "sicher"; documentId: string }
  | { kind: "unsicher"; documentId: string }
  | { kind: "keiner" };

/** Kleinschreibung, Umlaute aufgeloest, alles Nicht-Alphanumerische entfernt. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const WORT_ZAHL: Record<string, number> = {
  erster: 1, erste: 1, ersten: 1,
  zweiter: 2, zweite: 2, zweiten: 2,
  dritter: 3, dritte: 3, dritten: 3,
  vierter: 4, vierte: 4, vierten: 4,
  fuenfter: 5, fuenfte: 5, fuenften: 5,
};

const ROEMISCH: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/**
 * Ordnungszahl aus einem Label. "2.", "zweiter" und "II." fuehren alle auf 2.
 * Ohne diese Vereinheitlichung findet Stufe 3 des Abgleichs praktisch nie einen
 * Treffer, weil Kanzleien und Grundbuchaemter beliebig zwischen den Schreibweisen
 * wechseln.
 */
export function ordinalOf(s: string): number | null {
  const t = s.toLowerCase().replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe");
  const ziffer = t.match(/(^|\s)(\d{1,2})\.\s/);
  if (ziffer) return Number(ziffer[2]);
  for (const [wort, zahl] of Object.entries(WORT_ZAHL)) {
    if (t.includes(wort)) return zahl;
  }
  const roem = t.match(/(^|\s)(i{1,3}|iv|v)\.\s/);
  if (roem) return ROEMISCH[roem[2]] ?? null;
  return null;
}

/** Urkundennummer auf die reine Kennung reduzieren: "UR-Nr. 789 / 2011" → "789/2011". */
function normNummer(s: string | null): string | null {
  if (!s) return null;
  const n = s.toLowerCase().replace(/ur[-\s.]*nr\.?/g, "").replace(/\s+/g, "");
  return n || null;
}

/**
 * Stufenweiser Abgleich – die erste greifende Stufe gewinnt.
 *  1. Urkundennummer identisch          → sicher
 *  2. Datum identisch                   → sicher
 *  3. Label aehnlich, Ordnungszahl passt → unsicher (Rueckfrage statt Behauptung)
 *  4. sonst                             → keiner
 */
export function matchReference(ref: DocReference, vorhanden: SelbstAuskunft[]): MatchResult {
  const refNr = normNummer(ref.urkundenNummer);
  if (refNr) {
    const treffer = vorhanden.find((d) => normNummer(d.urkundenNummer) === refNr);
    if (treffer) return { kind: "sicher", documentId: treffer.documentId };
  }

  if (ref.urkundeDatum) {
    const treffer = vorhanden.find((d) => d.urkundeDatum === ref.urkundeDatum);
    if (treffer) return { kind: "sicher", documentId: treffer.documentId };
  }

  const refNorm = normalizeLabel(ref.label);
  const refOrd = ordinalOf(ref.label);
  const kandidat = vorhanden.find((d) => {
    const dOrd = ordinalOf(d.label);
    if (refOrd != null && dOrd != null && refOrd !== dOrd) return false;
    const dNorm = normalizeLabel(d.label);
    if (!dNorm || !refNorm) return false;
    // Gemeinsamer Wortstamm reicht: die Bezeichnungen weichen in der Praxis stark ab.
    const kern = refNorm.replace(/^\d+/, "").slice(0, 12);
    return kern.length >= 6 && (dNorm.includes(kern) || refNorm.includes(dNorm.replace(/^\d+/, "").slice(0, 12)));
  });
  if (kandidat) return { kind: "unsicher", documentId: kandidat.documentId };

  return { kind: "keiner" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/detektiv-match.test.ts`
Expected: PASS, 11 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/detektiv/match.ts tests/detektiv-match.test.ts
git commit -m "feat(detektiv): stufenweiser Urkundenabgleich mit unsicher-Zustand"
```

---

### Task 5: Vollständigkeitsprüfungen

Rein deterministisch, für alle Dokumenttypen. Findet die Lücken, die man ohne Zeile-für-Zeile-Vergleich nie sieht.

**Files:**
- Create: `src/lib/detektiv/completeness.ts`
- Test: `tests/detektiv-completeness.test.ts`

**Interfaces:**
- Consumes: `SeitenText`, `FindingCode`, `Resolution` aus `./types`; `DocumentType` aus `@/lib/domain/enums`
- Produces:
  - `interface CompletenessFinding { code: FindingCode; title: string; reason: string; resolution: Resolution; refKey: string }`
  - `function seitenBefund(pages: SeitenText[], pageCount: number | null): CompletenessFinding | null`
  - `function aktualitaetsBefund(documentType: DocumentType | null, dokumentDatum: Date | null, jetzt: Date): CompletenessFinding | null`
  - `const MAX_ALTER_MONATE: Partial<Record<DocumentType, number>>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-completeness.test.ts
import { describe, it, expect } from "vitest";
import { seitenBefund, aktualitaetsBefund, MAX_ALTER_MONATE } from "@/lib/detektiv/completeness";

describe("Seitenzahl-Logik", () => {
  it("meldet fehlende Seiten, wenn 'Seite X von Y' mehr verspricht als da ist", () => {
    const b = seitenBefund(
      [
        { pageNumber: 1, text: "Seite 1 von 37" },
        { pageNumber: 2, text: "Seite 2 von 37" },
      ],
      2
    );
    expect(b).not.toBeNull();
    expect(b!.code).toBe("seiten_unvollstaendig");
    expect(b!.resolution).toBe("dokument_nachfordern");
    expect(b!.title).toContain("37");
  });

  it("erkennt auch die Schreibweise 'Blatt 3/12'", () => {
    const b = seitenBefund([{ pageNumber: 1, text: "Blatt 3/12" }], 1);
    expect(b!.title).toContain("12");
  });

  it("schweigt, wenn die Seitenzahl aufgeht", () => {
    expect(
      seitenBefund([{ pageNumber: 1, text: "Seite 1 von 2" }, { pageNumber: 2, text: "Seite 2 von 2" }], 2)
    ).toBeNull();
  });

  it("schweigt ohne Seitenangabe im Text", () => {
    expect(seitenBefund([{ pageNumber: 1, text: "kein Hinweis" }], 1)).toBeNull();
  });

  it("schweigt bei unbekanntem pageCount", () => {
    expect(seitenBefund([{ pageNumber: 1, text: "Seite 1 von 9" }], null)).toBeNull();
  });

  it("nimmt die groesste gefundene Gesamtzahl", () => {
    const b = seitenBefund(
      [{ pageNumber: 1, text: "Seite 1 von 4" }, { pageNumber: 2, text: "Anlage: Seite 2 von 40" }],
      2
    );
    expect(b!.title).toContain("40");
  });
});

describe("Aktualitaet", () => {
  const jetzt = new Date("2026-08-09T00:00:00Z");

  it("meldet einen zu alten Grundbuchauszug", () => {
    const b = aktualitaetsBefund("grundbuchauszug", new Date("2025-06-01T00:00:00Z"), jetzt);
    expect(b).not.toBeNull();
    expect(b!.code).toBe("dokument_veraltet");
    expect(b!.resolution).toBe("dokument_nachfordern");
  });

  it("schweigt bei einem frischen Grundbuchauszug", () => {
    expect(aktualitaetsBefund("grundbuchauszug", new Date("2026-07-01T00:00:00Z"), jetzt)).toBeNull();
  });

  it("schweigt bei Dokumenttypen ohne Hoechstalter", () => {
    expect(aktualitaetsBefund("teilungserklaerung", new Date("1998-03-12T00:00:00Z"), jetzt)).toBeNull();
  });

  it("schweigt ohne Dokumentdatum", () => {
    expect(aktualitaetsBefund("grundbuchauszug", null, jetzt)).toBeNull();
  });

  it("hat fuer den Grundbuchauszug 6 Monate hinterlegt", () => {
    expect(MAX_ALTER_MONATE.grundbuchauszug).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-completeness.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/completeness"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/detektiv/completeness.ts
import type { DocumentType } from "@/lib/domain/enums";
import type { FindingCode, Resolution, SeitenText } from "./types";

export interface CompletenessFinding {
  code: FindingCode;
  title: string;
  reason: string;
  resolution: Resolution;
  refKey: string;
}

/** "Seite 12 von 37", "Seite 12/37", "Blatt 3/12" */
const SEITEN_MUSTER = [/seite\s+\d{1,3}\s*(?:von|\/)\s*(\d{1,3})/gi, /blatt\s+\d{1,3}\s*\/\s*(\d{1,3})/gi];

/**
 * Verspricht das Dokument mehr Seiten, als hochgeladen wurden? Der haeufigste
 * stille Fehler beim Kunden-Upload: der Scanner haelt nach der Haelfte an.
 */
export function seitenBefund(pages: SeitenText[], pageCount: number | null): CompletenessFinding | null {
  if (pageCount == null) return null;
  let versprochen = 0;
  for (const p of pages) {
    if (!p.text) continue;
    for (const muster of SEITEN_MUSTER) {
      muster.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = muster.exec(p.text)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > versprochen) versprochen = n;
      }
    }
  }
  if (versprochen <= pageCount) return null;
  return {
    code: "seiten_unvollstaendig",
    title: `Dokument unvollständig – ${pageCount} von ${versprochen} Seiten vorhanden`,
    reason: `Im Text steht eine Gesamtseitenzahl von ${versprochen}, hochgeladen wurden ${pageCount} Seiten.`,
    resolution: "dokument_nachfordern",
    refKey: `seiten:${versprochen}`,
  };
}

/**
 * Hoechstalter je Dokumenttyp in Monaten. Startwerte; spaeter je Organisation
 * konfigurierbar. Nur Typen, bei denen Banken tatsaechlich auf Aktualitaet
 * bestehen – ein 1998er Teilungserklaerung ist nie "veraltet".
 */
export const MAX_ALTER_MONATE: Partial<Record<DocumentType, number>> = {
  grundbuchauszug: 6,
};

export function aktualitaetsBefund(
  documentType: DocumentType | null,
  dokumentDatum: Date | null,
  jetzt: Date
): CompletenessFinding | null {
  if (!documentType || !dokumentDatum) return null;
  const grenze = MAX_ALTER_MONATE[documentType];
  if (!grenze) return null;

  const monate =
    (jetzt.getFullYear() - dokumentDatum.getFullYear()) * 12 +
    (jetzt.getMonth() - dokumentDatum.getMonth());
  if (monate < grenze) return null;

  return {
    code: "dokument_veraltet",
    title: `Dokument ist älter als ${grenze} Monate – aktuelle Fassung nötig`,
    reason: `Ausgestellt vor rund ${monate} Monaten. Banken verlangen bei diesem Dokumenttyp in der Regel eine Fassung, die nicht älter als ${grenze} Monate ist.`,
    resolution: "dokument_nachfordern",
    refKey: `alter:${grenze}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/detektiv-completeness.test.ts`
Expected: PASS, 11 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/detektiv/completeness.ts tests/detektiv-completeness.test.ts
git commit -m "feat(detektiv): Seitenzahl- und Aktualitaetspruefung"
```

---

### Task 6: KI-Vertrag und AIService-Methode

Die KI liefert **nur Fakten**. Eigener Aufruf mit eigenem Schema, damit ein Fehlschlag hier die Feld-Extraktion nicht mitreißt.

**Files:**
- Create: `src/lib/detektiv/schema.ts`
- Modify: `src/lib/ai/service.ts` (neue Methode am Ende der Klasse, vor der schließenden Klammer)
- Modify: `src/lib/ai/mock-provider.ts` (neuer `case` im `switch (req.schemaName)`)
- Test: `tests/detektiv-schema-vertrag.test.ts`

**Interfaces:**
- Consumes: `DocReference` aus `@/lib/detektiv/types`
- Produces:
  - `const documentReferencesSchema` (Zod)
  - `type DocumentReferencesResult = { references: DocReference[] }`
  - `aiService.extractDocumentReferences(documentType: DocumentType | null, pages: Array<{ pageNumber: number; text: string }>): Promise<DocumentReferencesResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-schema-vertrag.test.ts
import { describe, it, expect } from "vitest";
import { documentReferencesSchema } from "@/lib/detektiv/schema";
import { AIService } from "@/lib/ai/service";
import type { AIProvider } from "@/lib/ai/types";

const gueltig = {
  references: [
    {
      kind: "nachtrag",
      label: "2. Nachtrag zur Teilungserklärung",
      urkundeDatum: "2011-08-11",
      urkundenNummer: "789/2011",
      notar: "Dr. Müller",
      abteilung: "BV",
      laufendeNummer: null,
      sourcePage: 3,
      sourceQuote: "2. Nachtrag vom 11.08.2011, UR-Nr. 789/2011",
      confidence: 0.9,
    },
  ],
};

describe("KI-Antwortvertrag", () => {
  it("nimmt eine gueltige Antwort an", () => {
    expect(documentReferencesSchema.parse(gueltig).references).toHaveLength(1);
  });

  it("weist eine unbekannte kind-Angabe zurueck", () => {
    const kaputt = { references: [{ ...gueltig.references[0], kind: "phantasie" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("weist ein Datum im falschen Format zurueck", () => {
    const kaputt = { references: [{ ...gueltig.references[0], urkundeDatum: "11.08.2011" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("verlangt eine Fundstelle – ohne Zitat keine Nachpruefbarkeit", () => {
    const kaputt = { references: [{ ...gueltig.references[0], sourceQuote: "" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("akzeptiert eine leere Liste", () => {
    expect(documentReferencesSchema.parse({ references: [] }).references).toEqual([]);
  });
});

describe("AIService.extractDocumentReferences", () => {
  const stubProvider = (antwort: unknown): AIProvider => ({
    name: "stub",
    isConfigured: () => true,
    completeJSON: async () => antwort,
  });

  it("liefert die validierten Verweise", async () => {
    const svc = new AIService(stubProvider(gueltig));
    const out = await svc.extractDocumentReferences("grundbuchauszug", [
      { pageNumber: 3, text: "2. Nachtrag vom 11.08.2011" },
    ]);
    expect(out.references[0].urkundenNummer).toBe("789/2011");
  });

  it("ruft die KI gar nicht erst auf, wenn keine Kandidatenseite uebergeben wird", async () => {
    let aufrufe = 0;
    const svc = new AIService({
      name: "zaehler",
      isConfigured: () => true,
      completeJSON: async () => {
        aufrufe++;
        return gueltig;
      },
    });
    const out = await svc.extractDocumentReferences("grundbuchauszug", []);
    expect(aufrufe).toBe(0);
    expect(out.references).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-schema-vertrag.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/schema"`

- [ ] **Step 3: Write the schema**

```ts
// src/lib/detektiv/schema.ts
import { z } from "zod";

/**
 * Vertrag mit der KI. Sie liefert AUSSCHLIESSLICH Fakten aus dem Text – niemals
 * eine Bewertung, welche Folgeunterlage noetig ist. Das entscheidet
 * src/lib/detektiv/rules.ts.
 */
export const referenceSchema = z.object({
  kind: z.enum(["selbst", "bezugsurkunde", "nachtrag", "anlage", "last", "grundpfandrecht"]),
  label: z.string().min(1),
  urkundeDatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  urkundenNummer: z.string().nullable(),
  notar: z.string().nullable(),
  abteilung: z.enum(["BV", "II", "III"]).nullable(),
  laufendeNummer: z.string().nullable(),
  sourcePage: z.number().int().positive(),
  /** Ohne woertliches Zitat ist ein Befund nicht nachpruefbar – deshalb Pflicht. */
  sourceQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const documentReferencesSchema = z.object({
  references: z.array(referenceSchema),
});

export type DocumentReferencesResult = z.infer<typeof documentReferencesSchema>;
```

- [ ] **Step 4: Add the AIService method**

In `src/lib/ai/service.ts` zuerst den Import ergänzen:

```ts
import { documentReferencesSchema, type DocumentReferencesResult } from "@/lib/detektiv/schema";
```

Dann als letzte Methode der Klasse `AIService` (direkt vor der schließenden `}` der Klasse):

```ts
  /**
   * Liest aus den Kandidatenseiten eines Dokuments, welche anderen Urkunden es
   * nennt – und welche Urkunde es selbst ist. Eigener Aufruf mit eigenem Schema:
   * ein Fehlschlag hier darf die Feld-Extraktion nicht mitreissen.
   */
  async extractDocumentReferences(
    documentType: DocumentType | null,
    pages: Array<{ pageNumber: number; text: string }>
  ): Promise<DocumentReferencesResult> {
    if (pages.length === 0) return { references: [] };

    const seiten = pages.map((p) => `--- Seite ${p.pageNumber} ---\n${p.text}`).join("\n\n");
    return this.run(
      "documentReferences",
      documentReferencesSchema,
      [
        "Du liest deutsche Grundstuecks- und Wohnungseigentumsunterlagen.",
        "Deine EINZIGE Aufgabe ist es, Fakten zu melden: welche anderen Urkunden nennt dieses Dokument, und welche Urkunde ist es selbst.",
        "Bewerte NICHTS. Schlage KEINE Unterlagen vor. Erfinde nichts.",
        "kind=selbst genau einmal, wenn das Dokument sich selbst als Urkunde ausweist (Datum, UR-Nummer, Bezeichnung).",
        "kind=bezugsurkunde fuer in Bezug genommene Urkunden, kind=nachtrag fuer Nachtraege,",
        "kind=anlage fuer im Text erwaehnte Anlagen, kind=last fuer Eintragungen in Abteilung II,",
        "kind=grundpfandrecht fuer Eintragungen in Abteilung III.",
        "sourcePage ist die Seitenzahl aus der Ueberschrift '--- Seite N ---'.",
        "sourceQuote ist ein woertliches Zitat aus genau dieser Seite, hoechstens 200 Zeichen.",
        "Datumsangaben im Format yyyy-mm-dd. Unbekanntes ist null, nie geraten.",
      ].join(" "),
      `Dokumenttyp: ${documentType ?? "unbekannt"}\n\n${seiten}`,
      { documentType }
    );
  }
```

- [ ] **Step 5: Add the mock branch**

In `src/lib/ai/mock-provider.ts` im `switch (req.schemaName)` ergänzen:

```ts
      case "documentReferences":
        return {
          references: [
            {
              kind: "nachtrag",
              label: "2. Nachtrag zur Teilungserklärung",
              urkundeDatum: "2011-08-11",
              urkundenNummer: "789/2011",
              notar: "Dr. Mustermann",
              abteilung: "BV",
              laufendeNummer: null,
              sourcePage: 1,
              sourceQuote: "2. Nachtrag vom 11.08.2011, UR-Nr. 789/2011",
              confidence: 0.88,
            },
          ],
        };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/detektiv-schema-vertrag.test.ts && npm run typecheck`
Expected: PASS, 7 Tests; typecheck ohne Fehler

- [ ] **Step 7: Commit**

```bash
git add src/lib/detektiv/schema.ts src/lib/ai/service.ts src/lib/ai/mock-provider.ts tests/detektiv-schema-vertrag.test.ts
git commit -m "feat(detektiv): KI-Vertrag fuer Urkundenverweise"
```

---

### Task 7: Datenbankschema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-08-09-detektiv.sql`
- Modify: `src/lib/domain/enums.ts` (zwei neue Audit-Aktionen)

**Interfaces:**
- Produces: Prisma-Modelle `DocumentReference`, `CaseFinding`; Feld `Document.referenceStatus`; Relationen `Document.references`, `Document.findings`, `Case.findings`

- [ ] **Step 1: Add the models to the Prisma schema**

In `prisma/schema.prisma` am Ende der Modelldefinitionen einfügen:

```prisma
/**
 * Ein von der KI im Dokument gefundener Verweis auf eine andere Urkunde.
 * Reine Faktenebene ohne Bewertung. kind = "selbst" ist die Eigenauskunft
 * des Dokuments und die Voraussetzung fuer den Abgleich.
 */
model DocumentReference {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  caseId     String
  case       Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)

  kind           String
  label          String
  urkundeDatum   DateTime?
  urkundenNummer String?
  notar          String?
  abteilung      String?
  laufendeNummer String?
  sourcePage     Int
  sourceQuote    String
  confidence     Float?

  createdAt DateTime @default(now())

  findings CaseFinding[]

  @@index([documentId])
  @@index([caseId])
  @@map("document_references")
}

/**
 * Ein aus Verweisen und Regeln abgeleiteter Befund. Traegt Zustand, weil die
 * Freigabe- und Verwerf-Entscheidungen des Vermittlers einen erneuten Lauf
 * ueberleben muessen. Der fingerprint sichert das ueber den Unique-Index ab.
 */
model CaseFinding {
  id     String @id @default(cuid())
  caseId String
  case   Case   @relation(fields: [caseId], references: [id], onDelete: Cascade)

  code       String
  title      String
  reason     String
  severity   Severity @default(warnung)
  resolution String

  suggestedDocumentType DocumentType?

  sourceDocumentId String
  sourceDocument   Document @relation("FindingSource", fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  sourcePage       Int?
  sourceQuote      String?

  referenceId String?
  reference   DocumentReference? @relation(fields: [referenceId], references: [id], onDelete: SetNull)

  /** Bei unsicherem Abgleich: das vermutete, bereits vorhandene Dokument. */
  matchCandidateId String?

  /** offen | unsicher | freigegeben | verworfen | erledigt */
  status String @default("offen")

  checklistItemId String?

  fingerprint String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([caseId, fingerprint])
  @@index([caseId, status])
  @@map("case_findings")
}
```

Am Modell `Document` ergänzen:

```prisma
  referenceStatus      ProcessingStatus     @default(ausstehend)
```

und bei den Relationen von `Document`:

```prisma
  references       DocumentReference[]
  findings         CaseFinding[]            @relation("FindingSource")
```

Am Modell `Case` bei den Relationen ergänzen:

```prisma
  documentReferences DocumentReference[]
  findings           CaseFinding[]
```

- [ ] **Step 2: Add the audit actions**

In `src/lib/domain/enums.ts` in `AUDIT_ACTIONS` vor `"access.viewed"` einfügen:

```ts
  "finding.accepted",
  "finding.dismissed",
```

- [ ] **Step 3: Generate the client and typecheck**

Run: `npx prisma generate && npm run typecheck`
Expected: Client erzeugt; typecheck ohne Fehler

- [ ] **Step 4: Write the migration SQL**

```sql
-- prisma/sql/2026-08-09-detektiv.sql
-- Unterlagen-Detektiv: Verweise und Befunde.
-- Ausfuehren mit: scripts/supabase-sql.sh prisma/sql/2026-08-09-detektiv.sql --dry-run
-- danach ohne --dry-run.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "referenceStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend';

CREATE TABLE IF NOT EXISTS "document_references" (
  "id"             TEXT PRIMARY KEY,
  "documentId"     TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "caseId"         TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "kind"           TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "urkundeDatum"   TIMESTAMP(3),
  "urkundenNummer" TEXT,
  "notar"          TEXT,
  "abteilung"      TEXT,
  "laufendeNummer" TEXT,
  "sourcePage"     INTEGER NOT NULL,
  "sourceQuote"    TEXT NOT NULL,
  "confidence"     DOUBLE PRECISION,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "document_references_documentId_idx" ON "document_references"("documentId");
CREATE INDEX IF NOT EXISTS "document_references_caseId_idx" ON "document_references"("caseId");

CREATE TABLE IF NOT EXISTS "case_findings" (
  "id"                    TEXT PRIMARY KEY,
  "caseId"                TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "code"                  TEXT NOT NULL,
  "title"                 TEXT NOT NULL,
  "reason"                TEXT NOT NULL,
  "severity"              "Severity" NOT NULL DEFAULT 'warnung',
  "resolution"            TEXT NOT NULL,
  "suggestedDocumentType" "DocumentType",
  "sourceDocumentId"      TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "sourcePage"            INTEGER,
  "sourceQuote"           TEXT,
  "referenceId"           TEXT REFERENCES "document_references"("id") ON DELETE SET NULL,
  "matchCandidateId"      TEXT,
  "status"                TEXT NOT NULL DEFAULT 'offen',
  "checklistItemId"       TEXT,
  "fingerprint"           TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "case_findings_caseId_fingerprint_key" ON "case_findings"("caseId", "fingerprint");
CREATE INDEX IF NOT EXISTS "case_findings_caseId_status_idx" ON "case_findings"("caseId", "status");
```

**Falls Task 3, Step 3 den Dokumenttyp `weg_protokoll` ergänzt hat**, zusätzlich als **erste** Anweisung der Datei:

```sql
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'weg_protokoll';
```

- [ ] **Step 5: Dry-run the migration**

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-09-detektiv.sql --dry-run`
Expected: Ausgabe des SQL, keine Ausführung. Prüfen, dass der Tabellenname `cases` stimmt:
`grep -n '@@map("cases")' prisma/schema.prisma` — stimmt der Name nicht, das SQL anpassen.

- [ ] **Step 6: Apply the migration**

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-09-detektiv.sql`
Expected: Erfolgsmeldung ohne Fehler

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-08-09-detektiv.sql src/lib/domain/enums.ts
git commit -m "feat(detektiv): Schema fuer Urkundenverweise und Befunde"
```

---

### Task 8: Detektiv-Service

Bringt Tasks 1–7 zusammen. Zwei Einstiegspunkte: der teure KI-Lauf je Dokument und der billige Abgleichslauf über den ganzen Fall.

**Files:**
- Create: `src/lib/detektiv/service.ts`
- Test: `tests/detektiv-service-db.test.ts`

**Interfaces:**
- Consumes: alles aus `src/lib/detektiv/*`; `aiService` aus `@/lib/ai`; `prisma` aus `@/lib/db`
- Produces:
  - `async function runReferenceExtraction(documentId: string): Promise<void>`
  - `async function reconcileCase(caseId: string, jetzt?: Date): Promise<{ angelegt: number; erledigt: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-service-db.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";

/**
 * Abgleichslauf gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/detektiv-service-db.test.ts
 */
describe.runIf(RUN)("Detektiv-Abgleichslauf (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let caseId: string;
  let grundbuchId: string;
  let reconcileCase: (id: string, jetzt?: Date) => Promise<{ angelegt: number; erledigt: number }>;

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    // Aufbau wie in tests/lead-phase-db.test.ts: PGlite starten, DDL einspielen,
    // prisma-Client gegen die lokale URL erzeugen. Den dortigen beforeAll-Block
    // eins zu eins uebernehmen und nur die Fixtures unten ergaenzen.
    const helper = await import("./helpers/pglite-setup");
    prisma = await helper.startPGlite(ddl);

    const org = await prisma.organization.create({ data: { name: "Test", slug: `t-${Date.now()}` } });
    const c = await prisma.case.create({ data: { organizationId: org.id, caseNumber: "UP-TEST-0001" } });
    caseId = c.id;
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "grundbuch.pdf",
        storageKey: "k1",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "vermittler",
        documentType: "grundbuchauszug",
        pageCount: 3,
      },
    });
    grundbuchId = doc.id;
    ({ reconcileCase } = await import("@/lib/detektiv/service"));
  });

  it("legt fuer einen nicht vorhandenen Nachtrag einen offenen Befund an", async () => {
    await prisma.documentReference.create({
      data: {
        documentId: grundbuchId,
        caseId,
        kind: "nachtrag",
        label: "2. Nachtrag zur Teilungserklärung",
        urkundenNummer: "789/2011",
        urkundeDatum: new Date("2011-08-11"),
        sourcePage: 3,
        sourceQuote: "2. Nachtrag vom 11.08.2011",
      },
    });

    const r = await reconcileCase(caseId);
    expect(r.angelegt).toBe(1);

    const funde = await prisma.caseFinding.findMany({ where: { caseId } });
    expect(funde).toHaveLength(1);
    expect(funde[0].status).toBe("offen");
    expect(funde[0].title).toContain("789/2011");
    expect(funde[0].sourceQuote).toBe("2. Nachtrag vom 11.08.2011");
  });

  it("legt beim zweiten Lauf keinen zweiten Befund an", async () => {
    const r = await reconcileCase(caseId);
    expect(r.angelegt).toBe(0);
    expect(await prisma.caseFinding.count({ where: { caseId } })).toBe(1);
  });

  it("holt einen verworfenen Befund nicht zurueck", async () => {
    await prisma.caseFinding.updateMany({ where: { caseId }, data: { status: "verworfen" } });
    await reconcileCase(caseId);
    const funde = await prisma.caseFinding.findMany({ where: { caseId } });
    expect(funde).toHaveLength(1);
    expect(funde[0].status).toBe("verworfen");
  });

  it("erledigt einen Befund von selbst, sobald die Urkunde auftaucht", async () => {
    await prisma.caseFinding.updateMany({ where: { caseId }, data: { status: "offen" } });

    const nachtrag = await prisma.document.create({
      data: {
        caseId,
        originalName: "nachtrag2.pdf",
        storageKey: "k2",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "kunde",
        documentType: "teilungserklaerung",
        pageCount: 4,
      },
    });
    await prisma.documentReference.create({
      data: {
        documentId: nachtrag.id,
        caseId,
        kind: "selbst",
        label: "2. Nachtrag zur Teilungserklärung",
        urkundenNummer: "789/2011",
        urkundeDatum: new Date("2011-08-11"),
        sourcePage: 1,
        sourceQuote: "Nachtrag Nr. 2, UR-Nr. 789/2011",
      },
    });

    const r = await reconcileCase(caseId);
    expect(r.erledigt).toBe(1);
    const fund = await prisma.caseFinding.findFirst({ where: { caseId } });
    expect(fund.status).toBe("erledigt");
  });
});
```

- [ ] **Step 2: Create the PGlite helper if it does not exist**

Run: `ls tests/helpers/`

Gibt es keine `pglite-setup.ts`, den `beforeAll`-Block aus `tests/lead-phase-db.test.ts:16-60` in `tests/helpers/pglite-setup.ts` als `export async function startPGlite(ddl: string)` herausziehen und `tests/lead-phase-db.test.ts` darauf umstellen. Danach:

Run: `RUN_DB_IT=1 npx vitest run tests/lead-phase-db.test.ts`
Expected: PASS — die Umstellung hat den Bestandstest nicht kaputtgemacht.

- [ ] **Step 3: Run the new test to verify it fails**

Run: `RUN_DB_IT=1 npx vitest run tests/detektiv-service-db.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/detektiv/service"`

- [ ] **Step 4: Write the service**

```ts
// src/lib/detektiv/service.ts
import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import type { DocumentType } from "@/lib/domain/enums";
import { candidatePages } from "./pages";
import { followUpsFor } from "./rules";
import { matchReference } from "./match";
import { seitenBefund, aktualitaetsBefund } from "./completeness";
import { fingerprint } from "./fingerprint";
import type { DocReference, SelbstAuskunft } from "./types";

const ISO = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Stufe 1 – teuer, laeuft einmal je Dokument. Liest die Verweise aus den
 * Kandidatenseiten und legt sie als DocumentReference ab.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Feld-Extraktion mitreissen.
 * Er wird als referenceStatus = "fehler" sichtbar – "nichts gefunden" und
 * "nicht geprueft" duerfen im UI nie gleich aussehen.
 */
export async function runReferenceExtraction(documentId: string): Promise<void> {
  try {
    await prisma.document.update({ where: { id: documentId }, data: { referenceStatus: "laeuft" } });

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        caseId: true,
        documentType: true,
        pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
      },
    });
    if (!doc) return;

    const kandidaten = candidatePages(doc.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.ocrText })));
    const ergebnis = await aiService.extractDocumentReferences(doc.documentType, kandidaten);

    await prisma.$transaction([
      prisma.documentReference.deleteMany({ where: { documentId } }),
      prisma.documentReference.createMany({
        data: ergebnis.references.map((r) => ({
          documentId,
          caseId: doc.caseId,
          kind: r.kind,
          label: r.label,
          urkundeDatum: r.urkundeDatum ? new Date(r.urkundeDatum) : null,
          urkundenNummer: r.urkundenNummer,
          notar: r.notar,
          abteilung: r.abteilung,
          laufendeNummer: r.laufendeNummer,
          sourcePage: r.sourcePage,
          sourceQuote: r.sourceQuote,
          confidence: r.confidence,
        })),
      }),
      prisma.document.update({ where: { id: documentId }, data: { referenceStatus: "fertig" } }),
    ]);
  } catch (e) {
    console.error(`[detektiv] Verweislauf fuer Dokument ${documentId} fehlgeschlagen:`, e);
    await prisma.document
      .update({ where: { id: documentId }, data: { referenceStatus: "fehler" } })
      .catch(() => undefined);
  }
}

/**
 * Stufe 2 – billig und deterministisch, laeuft bei jeder Aenderung am Fall.
 * Nur so schliesst sich ein Befund von selbst, wenn die Urkunde spaeter kommt.
 */
export async function reconcileCase(
  caseId: string,
  jetzt: Date = new Date()
): Promise<{ angelegt: number; erledigt: number }> {
  const dokumente = await prisma.document.findMany({
    where: { caseId },
    select: {
      id: true,
      documentType: true,
      pageCount: true,
      createdAt: true,
      pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
      references: true,
    },
  });

  // Eigenauskuenfte aller Dokumente – die Gegenseite des Abgleichs.
  const vorhanden: SelbstAuskunft[] = dokumente.flatMap((d) =>
    d.references
      .filter((r) => r.kind === "selbst")
      .map((r) => ({
        documentId: d.id,
        documentType: d.documentType,
        label: r.label,
        urkundeDatum: ISO(r.urkundeDatum),
        urkundenNummer: r.urkundenNummer,
      }))
  );

  interface Kandidat {
    fingerprint: string;
    daten: Record<string, unknown>;
  }
  const kandidaten: Kandidat[] = [];

  for (const d of dokumente) {
    // a) Verweise → Folgeregeln → Abgleich
    for (const rRow of d.references) {
      if (rRow.kind === "selbst") continue;
      const ref: DocReference = {
        kind: rRow.kind as DocReference["kind"],
        label: rRow.label,
        urkundeDatum: ISO(rRow.urkundeDatum),
        urkundenNummer: rRow.urkundenNummer,
        notar: rRow.notar,
        abteilung: rRow.abteilung as DocReference["abteilung"],
        laufendeNummer: rRow.laufendeNummer,
        sourcePage: rRow.sourcePage,
        sourceQuote: rRow.sourceQuote,
        confidence: rRow.confidence ?? 0,
      };

      for (const f of followUpsFor(ref, d.documentType as DocumentType | null)) {
        if (f.hinweisOnly) continue; // Hinweise erzeugen keine Nachforderung
        const treffer = matchReference(ref, vorhanden);
        if (treffer.kind === "sicher") continue; // liegt vor – kein Befund

        kandidaten.push({
          fingerprint: fingerprint({ sourceDocumentId: d.id, code: f.code, refKey: f.refKey }),
          daten: {
            caseId,
            code: f.code,
            title: f.title,
            reason: f.reason,
            severity: f.severity,
            resolution: f.resolution,
            suggestedDocumentType: f.documentType,
            sourceDocumentId: d.id,
            sourcePage: ref.sourcePage,
            sourceQuote: ref.sourceQuote,
            referenceId: rRow.id,
            matchCandidateId: treffer.kind === "unsicher" ? treffer.documentId : null,
            status: treffer.kind === "unsicher" ? "unsicher" : "offen",
          },
        });
      }
    }

    // b) Vollstaendigkeit des Dokuments selbst
    const seiten = seitenBefund(
      d.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.ocrText })),
      d.pageCount
    );
    const alter = aktualitaetsBefund(d.documentType as DocumentType | null, d.createdAt, jetzt);
    for (const b of [seiten, alter]) {
      if (!b) continue;
      kandidaten.push({
        fingerprint: fingerprint({ sourceDocumentId: d.id, code: b.code, refKey: b.refKey }),
        daten: {
          caseId,
          code: b.code,
          title: b.title,
          reason: b.reason,
          severity: "warnung",
          resolution: b.resolution,
          suggestedDocumentType: d.documentType,
          sourceDocumentId: d.id,
          sourcePage: null,
          sourceQuote: null,
          referenceId: null,
          matchCandidateId: null,
          status: "offen",
        },
      });
    }
  }

  const bestand = await prisma.caseFinding.findMany({ where: { caseId } });
  const bekannt = new Map(bestand.map((f) => [f.fingerprint, f]));

  let angelegt = 0;
  for (const k of kandidaten) {
    if (bekannt.has(k.fingerprint)) continue; // Entscheidung des Vermittlers bleibt stehen
    await prisma.caseFinding.create({ data: { ...k.daten, fingerprint: k.fingerprint } as never });
    angelegt++;
  }

  // Was nicht mehr Kandidat ist, ist erledigt – die Urkunde ist aufgetaucht.
  const aktuell = new Set(kandidaten.map((k) => k.fingerprint));
  const zuErledigen = bestand.filter(
    (f) => (f.status === "offen" || f.status === "unsicher") && !aktuell.has(f.fingerprint)
  );
  if (zuErledigen.length > 0) {
    await prisma.caseFinding.updateMany({
      where: { id: { in: zuErledigen.map((f) => f.id) } },
      data: { status: "erledigt" },
    });
  }

  return { angelegt, erledigt: zuErledigen.length };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `RUN_DB_IT=1 npx vitest run tests/detektiv-service-db.test.ts && npm run typecheck`
Expected: PASS, 4 Tests; typecheck ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add src/lib/detektiv/service.ts tests/detektiv-service-db.test.ts tests/helpers/ tests/lead-phase-db.test.ts
git commit -m "feat(detektiv): Verweislauf und Abgleichslauf mit Auto-Erledigung"
```

---

### Task 9: Einbindung in die Upload-Pipeline

**Files:**
- Modify: `src/lib/documents/pipeline.ts` (in `processOcrAndAi`, nach dem `prisma.document.update`)
- Test: `tests/pipeline.test.ts` (erweitern)

**Interfaces:**
- Consumes: `runReferenceExtraction`, `reconcileCase` aus `@/lib/detektiv/service`

- [ ] **Step 1: Write the failing test**

An `tests/pipeline.test.ts` anhängen:

```ts
describe("Detektiv-Anstoss nach der Hintergrundanalyse", () => {
  it("ist so gebaut, dass ein Detektiv-Fehler die Analyse nicht kippt", async () => {
    const quelle = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/documents/pipeline.ts", "utf-8")
    );
    // Der Aufruf steht NACH dem Dokument-Update und in einem eigenen try/catch.
    const idxUpdate = quelle.indexOf("extractionStatus: ext ?");
    const idxDetektiv = quelle.indexOf("runReferenceExtraction");
    expect(idxDetektiv).toBeGreaterThan(idxUpdate);
    const umfeld = quelle.slice(idxDetektiv - 400, idxDetektiv + 400);
    expect(umfeld).toContain("try");
    expect(umfeld).toContain("catch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: FAIL — `expected -1 to be greater than …`

- [ ] **Step 3: Add the import**

In `src/lib/documents/pipeline.ts` bei den Imports:

```ts
import { runReferenceExtraction, reconcileCase } from "@/lib/detektiv/service";
```

- [ ] **Step 4: Call the detective after the update**

In `processOcrAndAi` direkt nach dem `catch`-Block des `prisma.document.update`:

```ts
  // Detektiv-Lauf ZULETZT und gekapselt: Verweise lesen, dann den Fall neu
  // abgleichen. Faellt das aus, bleibt die Dokumentanalyse davon unberuehrt –
  // sichtbar wird es ueber referenceStatus.
  try {
    await runReferenceExtraction(documentId);
    await reconcileCase(caseId);
  } catch (e) {
    console.error(`[pipeline] Detektiv-Lauf fuer Dokument ${documentId} fehlgeschlagen:`, e);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline.test.ts && npm run typecheck`
Expected: PASS; typecheck ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add src/lib/documents/pipeline.ts tests/pipeline.test.ts
git commit -m "feat(detektiv): Lauf nach der Hintergrundanalyse anstossen"
```

---

### Task 10: Server Actions

Die einzige Stelle, an der aus einem Befund eine Checklistenposition wird — nach Klick des Vermittlers, nie automatisch.

**Files:**
- Create: `src/lib/actions/detektiv.ts`
- Test: `tests/detektiv-actions.test.ts`

**Interfaces:**
- Consumes: `reconcileCase` aus `@/lib/detektiv/service`; `requireContext` aus `@/lib/auth/context`; `audit` aus `@/lib/audit`
- Produces:
  - `async function befundUebernehmen(formData: FormData): Promise<void>`
  - `async function befundVerwerfen(formData: FormData): Promise<void>`
  - `async function befundZuordnen(formData: FormData): Promise<void>`
  - `async function alleBefundeUebernehmen(formData: FormData): Promise<void>`
  - `async function aktePruefen(formData: FormData): Promise<void>`
  - `function checklistKeyFor(findingId: string): string` — exportiert für den Test

- [ ] **Step 1: Write the failing test**

```ts
// tests/detektiv-actions.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checklistKeyFor } from "@/lib/actions/detektiv";

const quelle = readFileSync("src/lib/actions/detektiv.ts", "utf-8");

describe("Checklisten-Schluessel", () => {
  it("traegt das Detektiv-Praefix, damit die Herkunft erkennbar bleibt", () => {
    expect(checklistKeyFor("abc123")).toBe("detektiv.abc123");
  });
});

describe("Absicherung der Actions", () => {
  it("jede Action prueft den Kontext", () => {
    const actions = [
      "befundUebernehmen",
      "befundVerwerfen",
      "befundZuordnen",
      "alleBefundeUebernehmen",
      "aktePruefen",
    ];
    for (const a of actions) {
      const start = quelle.indexOf(`export async function ${a}`);
      expect(start, a).toBeGreaterThan(-1);
      const rumpf = quelle.slice(start, start + 500);
      expect(rumpf, a).toContain("requireContext");
    }
  });

  it("prueft die Fallzugehoerigkeit ueber die Organisation, nicht nur die Fall-ID", () => {
    expect(quelle).toContain("organizationId");
  });

  it("schreibt Freigabe und Verwerfen ins Audit-Log", () => {
    expect(quelle).toContain("finding.accepted");
    expect(quelle).toContain("finding.dismissed");
  });

  it("legt bei resolution=dokument_nachfordern KEINE neue Position an", () => {
    expect(quelle).toContain("dokument_nachfordern");
    expect(quelle).toContain("unvollstaendig");
  });

  it("gleicht nach jeder Entscheidung neu ab", () => {
    expect(quelle).toContain("reconcileCase");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detektiv-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/detektiv"`

- [ ] **Step 3: Write the actions**

```ts
// src/lib/actions/detektiv.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { reconcileCase } from "@/lib/detektiv/service";

/** Schluessel der erzeugten Checklistenposition – Herkunft bleibt erkennbar. */
export function checklistKeyFor(findingId: string): string {
  return `detektiv.${findingId}`;
}

/** Laedt den Befund und stellt sicher, dass er zur Organisation des Nutzers gehoert. */
async function ladeBefund(findingId: string, organizationId: string) {
  const fund = await prisma.caseFinding.findFirst({
    where: { id: findingId, case: { organizationId } },
    include: { case: { select: { id: true } } },
  });
  return fund;
}

export async function befundUebernehmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx.organizationId);
  if (!fund || fund.status === "freigegeben") return;

  if (fund.resolution === "neue_position") {
    const item = await prisma.caseChecklistItem.create({
      data: {
        caseId: fund.caseId,
        key: checklistKeyFor(fund.id),
        name: fund.title,
        status: "offen",
        level: "zwingend",
        customerVisible: true,
        note: fund.reason,
      },
    });
    await prisma.caseFinding.update({
      where: { id: fund.id },
      data: { status: "freigegeben", checklistItemId: item.id },
    });
  } else {
    // dokument_nachfordern: die BESTEHENDE Position auf unvollstaendig setzen,
    // statt eine Dublette anzulegen.
    const bestehend = await prisma.caseChecklistItem.findFirst({
      where: { caseId: fund.caseId, documents: { some: { id: fund.sourceDocumentId } } },
    });
    if (bestehend) {
      await prisma.caseChecklistItem.update({
        where: { id: bestehend.id },
        data: { status: "unvollstaendig", note: fund.reason },
      });
    }
    await prisma.caseFinding.update({
      where: { id: fund.id },
      data: { status: "freigegeben", checklistItemId: bestehend?.id ?? null },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.accepted",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code, resolution: fund.resolution },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

export async function befundVerwerfen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx.organizationId);
  if (!fund) return;

  await prisma.caseFinding.update({ where: { id: fund.id }, data: { status: "verworfen" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.dismissed",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

/**
 * Unsicherer Abgleich bestaetigt: die vermutete Datei IST die gesuchte Urkunde.
 * Der Befund gilt damit als erledigt.
 */
export async function befundZuordnen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return;

  const fund = await ladeBefund(findingId, ctx.organizationId);
  if (!fund || !fund.matchCandidateId) return;

  await prisma.caseFinding.update({ where: { id: fund.id }, data: { status: "erledigt" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "finding.accepted",
    entityType: "CaseFinding",
    entityId: fund.id,
    metadata: { code: fund.code, zugeordnet: fund.matchCandidateId },
  });

  revalidatePath(`/cases/${fund.caseId}`);
}

export async function alleBefundeUebernehmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!fall) return;

  const offene = await prisma.caseFinding.findMany({
    where: { caseId, status: "offen" },
    select: { id: true },
  });
  for (const f of offene) {
    const fd = new FormData();
    fd.set("findingId", f.id);
    await befundUebernehmen(fd);
  }

  revalidatePath(`/cases/${caseId}`);
}

/** Manueller Anstoss des Abgleichslaufs ("Akte prüfen"). */
export async function aktePruefen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!fall) return;

  await reconcileCase(caseId);
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Step 4: Check the requireContext shape**

Run: `grep -n "return\|organizationId\|userId" src/lib/auth/context.ts | head -20`

Heißen die Felder anders (z. B. `orgId` statt `organizationId`), die Action entsprechend anpassen.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/detektiv-actions.test.ts && npm run typecheck`
Expected: PASS, 6 Tests; typecheck ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/detektiv.ts tests/detektiv-actions.test.ts
git commit -m "feat(detektiv): Server Actions fuer Freigabe, Verwerfen und Zuordnen"
```

---

### Task 11: Oberfläche

**Files:**
- Create: `src/components/case/findings-panel.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: die fünf Server Actions aus `@/lib/actions/detektiv`
- Produces: `interface FindingView`, `function FindingsPanel(props: { caseId: string; findings: FindingView[]; verworfen: FindingView[]; ungeprueft: string[] })`

- [ ] **Step 1: Write the panel**

```tsx
// src/components/case/findings-panel.tsx
import { AlertTriangle, FileSearch, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  befundUebernehmen,
  befundVerwerfen,
  befundZuordnen,
  alleBefundeUebernehmen,
  aktePruefen,
} from "@/lib/actions/detektiv";

export interface FindingView {
  id: string;
  title: string;
  reason: string;
  status: string;
  sourceDocumentName: string;
  sourceDocumentId: string;
  sourcePage: number | null;
  sourceQuote: string | null;
  matchCandidateName: string | null;
}

/**
 * "Lücken in den Unterlagen" – Vorschlaege des Detektivs. Jeder Fund traegt
 * seine Fundstelle: ohne Nachpruefbarkeit vertraut niemand dem Ergebnis.
 */
export function FindingsPanel({
  caseId,
  findings,
  verworfen,
  ungeprueft,
}: {
  caseId: string;
  findings: FindingView[];
  verworfen: FindingView[];
  ungeprueft: string[];
}) {
  const offene = findings.filter((f) => f.status === "offen");
  const unsichere = findings.filter((f) => f.status === "unsicher");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Lücken in den Unterlagen</h3>
          {findings.length > 0 && (
            <Badge variant="neutral" className="font-mono tabular">{findings.length}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {offene.length > 1 && (
            <form action={alleBefundeUebernehmen}>
              <input type="hidden" name="caseId" value={caseId} />
              <SubmitButton size="sm" variant="secondary">Alle {offene.length} übernehmen</SubmitButton>
            </form>
          )}
          <form action={aktePruefen}>
            <input type="hidden" name="caseId" value={caseId} />
            <SubmitButton size="sm" variant="ghost">Akte prüfen</SubmitButton>
          </form>
        </div>
      </div>

      {ungeprueft.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.05] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Verweisprüfung nicht möglich für: {ungeprueft.join(", ")}. Diese Dokumente wurden nicht auf
            Verweise geprüft – ein erneuter Lauf behebt das in der Regel.
          </span>
        </p>
      )}

      {findings.length === 0 && ungeprueft.length === 0 && (
        <p className="rounded-lg border border-success/30 bg-success/[0.04] p-4 text-sm text-success">
          Alle in den Unterlagen genannten Urkunden liegen vor.
        </p>
      )}

      {unsichere.map((f) => (
        <div key={f.id} className="rounded-lg border border-border p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            Ist die vorhandene Datei „{f.matchCandidateName}" der gesuchte Beleg „{f.title}"?
          </p>
          <Fundstelle f={f} />
          <div className="mt-3 flex gap-2">
            <form action={befundZuordnen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm">Ja, zuordnen</SubmitButton>
            </form>
            <form action={befundUebernehmen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm" variant="secondary">Nein, fehlt</SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {offene.map((f) => (
        <div key={f.id} className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{f.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{f.reason}</p>
          <Fundstelle f={f} />
          <div className="mt-3 flex gap-2">
            <form action={befundUebernehmen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm">Übernehmen</SubmitButton>
            </form>
            <form action={befundVerwerfen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm" variant="ghost">Verwerfen</SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {verworfen.length > 0 && (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {verworfen.length} verworfen
          </summary>
          <ul className="mt-2 space-y-2">
            {verworfen.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground line-through">{f.title}</span>
                <form action={befundUebernehmen}>
                  <input type="hidden" name="findingId" value={f.id} />
                  <SubmitButton size="sm" variant="ghost">Doch übernehmen</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Fundstelle({ f }: { f: FindingView }) {
  if (!f.sourceQuote) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">Grundlage: {f.sourceDocumentName}</p>
    );
  }
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Grundlage: {f.sourceDocumentName}
        {f.sourcePage != null ? `, Seite ${f.sourcePage}` : ""}
      </summary>
      <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
        {f.sourceQuote}
      </blockquote>
    </details>
  );
}
```

- [ ] **Step 2: Check the SubmitButton props**

Run: `sed -n '1,40p' src/components/ui/submit-button.tsx`

Kennt die Komponente `size`/`variant` nicht, die Props im Panel entsprechend anpassen.

- [ ] **Step 3: Load the data on the case page**

In `src/app/(app)/cases/[id]/page.tsx` bei den Imports:

```tsx
import { FindingsPanel, type FindingView } from "@/components/case/findings-panel";
```

Im Datenladeteil (neben den bestehenden `prisma`-Abfragen):

```tsx
  const befunde = await prisma.caseFinding.findMany({
    where: { caseId: id, status: { in: ["offen", "unsicher", "verworfen"] } },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    include: { sourceDocument: { select: { id: true, generatedName: true, originalName: true } } },
  });
  const kandidatenNamen = new Map(
    (
      await prisma.document.findMany({
        where: { id: { in: befunde.map((b) => b.matchCandidateId).filter((x): x is string => !!x) } },
        select: { id: true, generatedName: true, originalName: true },
      })
    ).map((d) => [d.id, d.generatedName ?? d.originalName])
  );
  const alsView = (b: (typeof befunde)[number]): FindingView => ({
    id: b.id,
    title: b.title,
    reason: b.reason,
    status: b.status,
    sourceDocumentId: b.sourceDocumentId,
    sourceDocumentName: b.sourceDocument.generatedName ?? b.sourceDocument.originalName,
    sourcePage: b.sourcePage,
    sourceQuote: b.sourceQuote,
    matchCandidateName: b.matchCandidateId ? (kandidatenNamen.get(b.matchCandidateId) ?? null) : null,
  });
  const ungeprueft = (
    await prisma.document.findMany({
      where: { caseId: id, referenceStatus: "fehler" },
      select: { generatedName: true, originalName: true },
    })
  ).map((d) => d.generatedName ?? d.originalName);
```

Im Reiter „Unterlagen" — direkt über der bestehenden `<MissingDocumentsPanel …/>`:

```tsx
          <FindingsPanel
            caseId={id}
            findings={befunde.filter((b) => b.status !== "verworfen").map(alsView)}
            verworfen={befunde.filter((b) => b.status === "verworfen").map(alsView)}
            ungeprueft={ungeprueft}
          />
```

- [ ] **Step 4: Verify build and types**

Run: `npm run typecheck && npm run lint`
Expected: beide ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/components/case/findings-panel.tsx "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(detektiv): Befund-Panel mit Fundstelle und Sammelfreigabe"
```

---

### Task 12: Stufe in der Next-Step-Leiter

Offene Befunde rangieren **nach** den kritischen Hinweisen und **vor** „Unterlagen anfordern" — erst sichten, dann nachfordern.

**Files:**
- Modify: `src/lib/cases/next-step.ts`
- Modify: `src/lib/cases/cockpit.ts` (Zähler befüllen)
- Test: `tests/next-step.test.ts` (erweitern)

**Interfaces:**
- Produces: `NextStep["key"]` um `"unterlagen_luecken"` erweitert; `NextStepInput["counts"]` um `offeneBefunde: number` erweitert

- [ ] **Step 1: Write the failing test**

An `tests/next-step.test.ts` anhängen (die vorhandene Helferfunktion für den Input wiederverwenden; heißt sie anders, entsprechend anpassen):

```ts
describe("Stufe: Lücken in den Unterlagen", () => {
  const basis = {
    caseId: "c1",
    status: "unterlagen_fehlen",
    counts: { pruefbereit: 0, docsMissing: 3, criticals: 0, docsFehler: 0, docsLaufend: 0, offeneBefunde: 0 },
    missingCustomerFields: [],
    erstkontakt: { empfaenger: "a@b.de", vorbereitet: true, versendet: true },
  };

  it("meldet offene Befunde, bevor Unterlagen angefordert werden", () => {
    const s = computeNextStep({ ...basis, counts: { ...basis.counts, offeneBefunde: 4 } });
    expect(s.key).toBe("unterlagen_luecken");
    expect(s.title).toContain("4");
    expect(s.cta?.href).toContain("/cases/c1");
  });

  it("tritt hinter kritische Hinweise zurueck", () => {
    const s = computeNextStep({
      ...basis,
      counts: { ...basis.counts, offeneBefunde: 4, criticals: 2 },
    });
    expect(s.key).toBe("kritische_hinweise");
  });

  it("verhaelt sich unveraendert, wenn keine Befunde offen sind", () => {
    expect(computeNextStep(basis).key).toBe("unterlagen_anfordern");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/next-step.test.ts`
Expected: FAIL — `expected 'unterlagen_anfordern' to be 'unterlagen_luecken'`

- [ ] **Step 3: Extend the type and the ladder**

In `src/lib/cases/next-step.ts` im `key`-Union nach `"kritische_hinweise"` einfügen:

```ts
    | "unterlagen_luecken"
```

In `NextStepInput["counts"]` ergänzen:

```ts
    /** Offene Detektiv-Befunde – vom Vermittler noch nicht gesichtet. */
    offeneBefunde: number;
```

In `computeNextStep` **direkt nach** dem `kritische_hinweise`-Block und **vor** dem `unterlagen_anfordern`-Block:

```ts
  // Erst die gefundenen Luecken sichten, dann nachfordern: sonst geht eine
  // Nachforderung raus, der die Haelfte fehlt, und der Kunde wird zweimal
  // angeschrieben.
  if (c.counts.offeneBefunde > 0) {
    return {
      key: "unterlagen_luecken",
      title: `${c.counts.offeneBefunde} Lücke${c.counts.offeneBefunde === 1 ? "" : "n"} in den Unterlagen gefunden`,
      reason:
        "Die vorliegenden Objektunterlagen nennen Urkunden, die noch nicht in der Akte sind. Sichten und übernehmen, bevor die Nachforderung rausgeht.",
      tone: "review",
      cta: { label: "Lücken ansehen", href: `/cases/${id}?tab=unterlagen` },
    };
  }
```

- [ ] **Step 4: Fill the counter in the cockpit**

Run: `grep -n "criticals" src/lib/cases/cockpit.ts`

An derselben Stelle, an der `criticals` ermittelt wird, ergänzen:

```ts
  const offeneBefunde = await prisma.caseFinding.count({
    where: { caseId, status: { in: ["offen", "unsicher"] } },
  });
```

und `offeneBefunde` in das `counts`-Objekt aufnehmen. Danach alle weiteren Aufrufer von `computeNextStep` prüfen:

Run: `grep -rn "computeNextStep" src/ | grep -v next-step.ts`

Jeder Aufrufer muss `offeneBefunde` mitgeben (Dashboard: eine `groupBy`-Zählung über alle Fälle statt einer Abfrage je Fall).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/next-step.test.ts tests/dashboard.test.ts && npm run typecheck`
Expected: PASS; typecheck ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add src/lib/cases/next-step.ts src/lib/cases/cockpit.ts tests/next-step.test.ts
git commit -m "feat(detektiv): Luecken-Stufe in der Next-Step-Leiter"
```

---

### Task 13: Gesamtlauf und Deployment

**Files:** keine neuen

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: alle Tests grün. Rot gewordene Bestandstests sind **echte** Regressionen (meist ein fehlendes `offeneBefunde` im Testinput) — beheben, nicht anpassen wegdefinieren.

- [ ] **Step 2: Run typecheck, lint and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: alle drei ohne Fehler

- [ ] **Step 3: Run the DB integration test**

Run: `RUN_DB_IT=1 npx vitest run tests/detektiv-service-db.test.ts tests/pglite.test.ts`
Expected: PASS

- [ ] **Step 4: Verify the production schema**

Run: `scripts/supabase-sql.sh /dev/stdin --dry-run <<< "SELECT 1"` — nur zur Prüfung, dass das Skript erreichbar ist.

Danach prüfen, dass die Tabellen wirklich stehen: eine Datei `prisma/sql/pruefe-detektiv.sql` mit
`SELECT table_name FROM information_schema.tables WHERE table_schema = 'unterlagenpilot' AND table_name IN ('document_references','case_findings');`
anlegen und mit `scripts/supabase-sql.sh prisma/sql/pruefe-detektiv.sql` ausführen.
Expected: beide Tabellen gelistet.

- [ ] **Step 5: Merge and deploy**

```bash
git checkout main
git merge --no-ff <branch> -m "merge: Unterlagen-Detektiv – Urkundenverweise und Vollstaendigkeit"
git push origin main
```

Vercel deployt `main` automatisch. Danach die drei Prüfungen aus `verify-deployed-claims`:
1. `git merge-base --is-ancestor <commit> origin/main && echo "in main"`
2. `vercel ls --prod` — neuestes Deployment ist `Ready` und jünger als der Push
3. Fall in der Produktion öffnen und prüfen, dass der Block „Lücken in den Unterlagen" erscheint

- [ ] **Step 6: Smoke test in production**

Einen Fall mit Grundbuchauszug öffnen, „Akte prüfen" klicken, prüfen:
- Befunde erscheinen mit Fundstelle und aufklappbarem Zitat
- „Übernehmen" erzeugt eine Checklistenposition mit demselben Titel
- Der Titel ist kundentauglich (keine internen Kürzel)
- Ein zweiter Klick auf „Akte prüfen" erzeugt **keine** Dubletten

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| 4 Datenmodell (`DocumentReference`, `CaseFinding`, `referenceStatus`) | 7 |
| 4 Fingerabdruck | 2 |
| 4 Zwei Auflösungsarten | 3 (Regeln), 10 (Umsetzung bei Freigabe) |
| 5 Stufe 1 KI-Lauf, eigener Status | 6, 8, 9 |
| 5 Kandidatenseiten | 1 |
| 5 Stufe 2 Abgleich bei jeder Änderung | 8, 9, 10 |
| 5 Ehrlichkeit bei Fehlschlägen | 8 (`referenceStatus`), 11 (Hinweis im UI) |
| 6 Folgeregel-Katalog inkl. Baulasten-Grenze | 3 |
| 7 Abgleichslogik mit „unsicher" | 4 |
| 8 Vollständigkeitsprüfungen | 5 |
| 9 Oberfläche, Sammelfreigabe, Kundensichtbarkeit | 11 |
| 9 Next-Step-Engine | 12 |
| 9 Audit | 10 |
| 10 Fehlerverhalten | 8, 9 |
| 11 Absicherung (Tests) | 1–6, 8, 10, 12 |

**Lücke, die ich beim Gegenlesen gefunden und geschlossen habe:** Die Spec verlangt in Abschnitt 10 „Freigegebene Position wird gelöscht → Fund geht zurück auf `offen`". Das deckt keiner der Tasks ab. Als Nachtrag zu Task 8, Step 4 gehört in `reconcileCase` vor der Erledigungs-Schleife:

```ts
  // Wurde die freigegebene Checklistenposition geloescht, ist die Luecke wieder offen.
  const freigegebene = bestand.filter((f) => f.status === "freigegeben" && f.checklistItemId);
  if (freigegebene.length > 0) {
    const nochDa = new Set(
      (
        await prisma.caseChecklistItem.findMany({
          where: { id: { in: freigegebene.map((f) => f.checklistItemId as string) } },
          select: { id: true },
        })
      ).map((i) => i.id)
    );
    const verwaist = freigegebene.filter((f) => !nochDa.has(f.checklistItemId as string));
    if (verwaist.length > 0) {
      await prisma.caseFinding.updateMany({
        where: { id: { in: verwaist.map((f) => f.id) } },
        data: { status: "offen", checklistItemId: null },
      });
    }
  }
```

Dazu in `tests/detektiv-service-db.test.ts` ein fünfter Test:

```ts
  it("oeffnet einen Befund wieder, wenn die freigegebene Position geloescht wurde", async () => {
    const item = await prisma.caseChecklistItem.create({
      data: { caseId, key: "detektiv.x", name: "Testposition", status: "offen" },
    });
    await prisma.caseFinding.updateMany({
      where: { caseId },
      data: { status: "freigegeben", checklistItemId: item.id },
    });
    await prisma.caseChecklistItem.delete({ where: { id: item.id } });

    await reconcileCase(caseId);
    const fund = await prisma.caseFinding.findFirst({ where: { caseId } });
    expect(fund.status).toBe("offen");
    expect(fund.checklistItemId).toBeNull();
  });
```

**Typkonsistenz geprüft:** `DocReference`, `SelbstAuskunft`, `SeitenText`, `FindingCode` und `Resolution` stammen durchgängig aus `src/lib/detektiv/types.ts`. `refKey` heißt in `FollowUp`, `CompletenessFinding` und `fingerprint()` gleich. `candidatePages` liefert `{ pageNumber, text }` — genau das, was `extractDocumentReferences` erwartet.

**Bekannte Unschärfen, die beim Umsetzen zu prüfen sind** (jeweils mit einem `grep`-Schritt im Plan hinterlegt): der Feldname in `requireContext` (Task 10, Step 4), die Props von `SubmitButton` (Task 11, Step 2), die Existenz von `weg_protokoll` als Dokumenttyp (Task 3, Step 3) und der Tabellenname `cases` im Migrations-SQL (Task 7, Step 5).
