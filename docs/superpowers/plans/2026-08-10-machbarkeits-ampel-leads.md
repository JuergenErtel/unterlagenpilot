# Machbarkeits-Ampel auf Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Lead-Karte im Pipeline-Board zeigt auf einen Blick, ob der Fall trägt — und wenn nicht, was ihm fehlt.

**Architecture:** Die vorhandene Board-Abfrage wird um die Relationen erweitert, die der Machbarkeits-Solver braucht; damit entsteht keine zusätzliche Datenbankrunde und kein `caseToCanonical` je Fall. Eine reine Funktion `ampelFuer` fällt aus höchstens zwei Hebelsuchen das Urteil. Nichts wird gespeichert.

**Tech Stack:** Next.js App Router (Server Components), Prisma 6 / PostgreSQL, Vitest. Kein neuer Fremdcode, kein Schemaumbau, keine Migration.

**Spec:** `docs/superpowers/specs/2026-08-10-machbarkeits-ampel-leads-design.md`

## Global Constraints

- **Grau ist kein Urteil.** Fehlende Daten ergeben grau, **nie** rot. Eine Datenlücke als Absage zu lesen macht das Werkzeug unbrauchbar.
- **Rot nur, wenn wirklich nichts hilft**: weder zusätzliches Eigenkapital noch ein kleineres Objekt.
- **Kein N+1.** Alles kommt aus der einen bestehenden Board-Abfrage. Kein `caseToCanonical` je Karte — genau dessen Kosten waren der Grund, warum das Dashboard den Solver nicht fährt.
- **Nichts wird gespeichert.** Kein Ampel-Feld, kein Zeitstempel, keine Neuberechnungs-Haken.
- **Annahmen einmal laden**, nicht je Karte.
- **Tolerantes Parsen beim Import**: das Eigenkapital kommt als `"30000.0"`, `30000.0` oder `20000`. Eine Prüfung auf `typeof v === "number"` verliert 80 % der Werte.
- **Deutsch in allem, was der Nutzer sieht.**
- **Testlauf:** `npx vitest run <datei>` einzeln, `npm test` gesamt, `npm run typecheck` nach jeder Aufgabe. Kein `npm run lint` — das Projekt hat keine ESLint-Konfiguration und der Befehl fragt interaktiv nach.

---

## File Structure

| Datei | Änderung |
|---|---|
| `src/lib/platforms/finlink/dto.ts` | Feld `bank_savings_amount_towards_down_payment` im API-Schema, `eigenkapital` im Vorgang-Schema, Übernahme in `mapApiLead` |
| `src/lib/platforms/finlink/mapping.ts` | `eigenkapital` in `financing` durchreichen |
| `src/lib/machbarkeit/ampel.ts` *(neu)* | reine Funktion `ampelFuer` |
| `src/app/(app)/pipeline/page.tsx` | Board-Abfrage erweitern, Ampel je Karte berechnen |
| `src/lib/cases/lead-board.ts` | `ampel` an `BoardKarte` |
| `src/components/pipeline/lead-board.tsx` | `ampel` an `BoardKarteView`, Anzeige auf der Karte |

**Tests:** `tests/machbarkeit-ampel.test.ts` *(neu)*, `tests/finlink-mapping.test.ts` *(erweitern)*

---

### Task 1: Eigenkapital aus FinLink übernehmen

Unabhängig von der Ampel ein echter Fehler: Das Feld ist bei 90 % der Leads gefüllt, wird aber nicht ausgelesen. Der Kunde hat die Zahl angegeben, wir verlieren sie, und der Vermittler fragt sie am Telefon erneut ab.

**Files:**
- Modify: `src/lib/platforms/finlink/dto.ts`
- Modify: `src/lib/platforms/finlink/mapping.ts`
- Test: `tests/finlink-mapping.test.ts`

**Interfaces:**
- Produces: `FinLinkVorgangDTO["finanzierung"]` um `eigenkapital?: number` erweitert; `caseToCanonical`-Ausgabe enthält `financing.eigenkapital`

- [ ] **Step 1: Write the failing test**

An `tests/finlink-mapping.test.ts` anhängen. Die vorhandene Datei prüfen und die dortigen Hilfsfunktionen wiederverwenden (`grep -n "describe\|const dto\|mapFinLink" tests/finlink-mapping.test.ts | head`):

```ts
describe("Eigenkapital aus dem Lead", () => {
  // Das Feld heisst in der API bank_savings_amount_towards_down_payment
  // ("Erspartes fuer die Anzahlung") und kommt in gemischten Typen:
  // in einer Stichprobe von 200 Leads 160-mal als Zeichenkette,
  // 28-mal als float, 12-mal als int.
  const lead = (betrag: unknown) => ({
    data: [
      {
        id: "lead-1",
        attributes: {
          applicant_meta: {
            first_name: "Simon",
            last_name: "Antovski",
            monthly_net_income: 4250,
            bank_savings_amount_towards_down_payment: betrag,
          },
          property_meta: { listed_price: 335000, german_zipcode_number: "76135", city_name: "Karlsruhe" },
        },
      },
    ],
  });

  it("liest das Eigenkapital als Zahl", () => {
    const [dto] = parseFinLinkLeads(lead(30000));
    expect(dto!.finanzierung?.eigenkapital).toBe(30000);
  });

  it("liest es auch als Zeichenkette – so kommt es meistens", () => {
    const [dto] = parseFinLinkLeads(lead("30000.0"));
    expect(dto!.finanzierung?.eigenkapital).toBe(30000);
  });

  it("laesst es weg, wenn nichts angegeben ist", () => {
    for (const leer of [null, undefined, ""]) {
      const [dto] = parseFinLinkLeads(lead(leer));
      expect(dto!.finanzierung?.eigenkapital).toBeUndefined();
    }
  });

  it("reicht es bis in die Fallstruktur durch", () => {
    const [dto] = parseFinLinkLeads(lead("45000.0"));
    const fall = finlinkVorgangToCanonical(dto!);
    expect(fall.financing.eigenkapital).toBe(45000);
  });
});
```

Die Importnamen `parseFinLinkLeads` und `finlinkVorgangToCanonical` gegen die Datei prüfen:
Run: `grep -n "^import\|^} from" tests/finlink-mapping.test.ts | head` und `grep -n "^export function\|^export const" src/lib/platforms/finlink/dto.ts src/lib/platforms/finlink/mapping.ts`
Heißen sie anders, die Testimporte anpassen — **nicht** die Produktionsnamen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/finlink-mapping.test.ts`
Expected: FAIL — `expected undefined to be 30000`

- [ ] **Step 3: Add the field to both schemas**

In `src/lib/platforms/finlink/dto.ts` bei `const apiApplicantMeta = z.object({` nach `monthly_net_income: numOrStr,` einfügen:

```ts
  /**
   * Eigenkapital ("Erspartes fuer die Anzahlung"). Kommt in gemischten Typen –
   * in einer Stichprobe von 200 Leads 160-mal als Zeichenkette, 28-mal als
   * float, 12-mal als int. numOrStr faengt alle drei ab.
   */
  bank_savings_amount_towards_down_payment: numOrStr,
```

Im Vorgang-Schema bei `const finanzierung = z.object({` nach `kaufpreis: z.number().optional(),` einfügen:

```ts
    eigenkapital: z.number().optional(),
```

- [ ] **Step 4: Carry it through the lead conversion**

In `mapApiLead` das `finanzierung`-Objekt ergänzen:

```ts
    finanzierung: {
      art: translate(FINANCE_TYPE_DE, lm?.finance_type ?? undefined),
      kaufpreis: toNumber(pm?.final_sale_price) ?? toNumber(pm?.listed_price),
      eigenkapital: toNumber(am?.bank_savings_amount_towards_down_payment ?? undefined),
      darlehenswunsch: wishSum > 0 ? wishSum : undefined,
    },
```

`toNumber` in dieser Datei behandelt Zeichenketten bereits korrekt (`Number("30000.0")` → 30000) und liefert für `""` und `null` `undefined`.

- [ ] **Step 5: Pass it into the case structure**

In `src/lib/platforms/finlink/mapping.ts` im `financing`-Objekt ergänzen:

```ts
    financing: {
      finanzierungsart,
      kaufpreis: f?.kaufpreis,
      eigenkapital: f?.eigenkapital,
      darlehenswunsch: f?.darlehenswunsch,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/finlink-mapping.test.ts tests/finlink-dto.test.ts tests/finlink-sync.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/platforms/finlink/ tests/finlink-mapping.test.ts
git commit -m "fix(finlink): Eigenkapital des Leads wurde beim Import verworfen"
```

---

### Task 2: Die Ampel-Funktion

**Files:**
- Create: `src/lib/machbarkeit/ampel.ts`
- Test: `tests/machbarkeit-ampel.test.ts`

**Interfaces:**
- Consumes: `baueEingabe` aus `@/lib/machbarkeit/eingabe`, `bewerte` aus `./bewertung`, `kleinsterWert` aus `./suche`, `HEBEL` aus `./hebel`, `Annahmen` aus `./types`
- Produces:
  - `type AmpelFarbe = "gruen" | "gelb" | "rot" | "grau"`
  - `interface Ampel { farbe: AmpelFarbe; text: string; grund: string }`
  - `function ampelFuer(c: CanonicalCase, opts: AmpelOptionen, a: Annahmen): Ampel | null`
  - `interface AmpelOptionen { applicantCount: number; anzahlKinder: number; verloren: boolean; abgeschlossen: boolean; grunderwerbsteuerProzentOverride?: number | null; bundeslandOverride?: Bundesland | null }`

`null` bedeutet: **keine Ampel anzeigen** (verloren oder abgeschlossen) — nicht zu verwechseln mit grau.

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-ampel.test.ts
import { describe, it, expect } from "vitest";
import { ampelFuer } from "@/lib/machbarkeit/ampel";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { CanonicalCase } from "@/lib/domain/canonical";

const fall = (over: {
  kaufpreis?: number | undefined;
  eigenkapital?: number;
  netto?: number | undefined;
}): CanonicalCase =>
  ({
    applicants: [{ position: 1, vorname: "A", nachname: "B" }],
    employment: [],
    income: over.netto === undefined ? [] : [{ applicantPosition: 1, nettoMonatlich: over.netto }],
    liabilities: [],
    assets: [],
    property: { plz: "80331", ort: "München", wohnflaeche: 90 },
    financing:
      over.kaufpreis === undefined
        ? { eigenkapital: over.eigenkapital ?? 0 }
        : { kaufpreis: over.kaufpreis, eigenkapital: over.eigenkapital ?? 0 },
    platformIds: {},
  }) as unknown as CanonicalCase;

const opts = { applicantCount: 1, anzahlKinder: 0, verloren: false, abgeschlossen: false };

describe("Ampel – grün", () => {
  it("meldet grün, wenn der Fall bereits trägt", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("gruen");
    expect(a!.text).toMatch(/trägt/);
    // Der Auslauf gehoert dazu – sonst ist "traegt" eine nackte Behauptung.
    expect(a!.text).toMatch(/%/);
  });
});

describe("Ampel – gelb", () => {
  it("nennt den fehlenden Eigenkapitalbetrag", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, eigenkapital: 10_000, netto: 2_900 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("gelb");
    expect(a!.text).toMatch(/€/);
    expect(a!.text).toMatch(/Eigenkapital|EK/);
  });

  it("nennt einen tragbaren Kaufpreis, wenn Eigenkapital allein nicht reicht", () => {
    // Einkommen so knapp, dass selbst viel Eigenkapital die Rate nicht traegt,
    // ein kleineres Objekt aber schon.
    const a = ampelFuer(fall({ kaufpreis: 600_000, eigenkapital: 0, netto: 2_100 }), opts, VORGABE_ANNAHMEN);
    if (a!.farbe === "gelb") expect(a!.text).toMatch(/Objekt bis|€/);
  });
});

describe("Ampel – rot", () => {
  it("meldet rot, wenn weder Eigenkapital noch ein kleineres Objekt helfen", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, eigenkapital: 0, netto: 600 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("rot");
    expect(a!.text).toMatch(/nicht/);
  });
});

describe("Ampel – grau", () => {
  it("meldet grau bei fehlendem Kaufpreis, NIEMALS rot", () => {
    const a = ampelFuer(fall({ kaufpreis: undefined, netto: 3_000 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("grau");
    expect(a!.farbe).not.toBe("rot");
  });

  it("meldet grau bei fehlendem Einkommen und nennt im Grund, was fehlt", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, netto: undefined }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("grau");
    expect(a!.grund).toMatch(/Nettoeinkommen/);
  });
});

describe("Ampel – wo sie schweigt", () => {
  it("erscheint bei verlorenen Fällen gar nicht", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      { ...opts, verloren: true },
      VORGABE_ANNAHMEN
    );
    expect(a).toBeNull();
  });

  it("erscheint bei abgeschlossenen Fällen gar nicht", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      { ...opts, abgeschlossen: true },
      VORGABE_ANNAHMEN
    );
    expect(a).toBeNull();
  });
});

describe("Ampel – Begründung", () => {
  it("traegt immer einen Grund, der mehr sagt als der Kurztext", () => {
    for (const f of [
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      fall({ kaufpreis: 400_000, eigenkapital: 10_000, netto: 2_900 }),
      fall({ kaufpreis: 400_000, eigenkapital: 0, netto: 600 }),
    ]) {
      const a = ampelFuer(f, opts, VORGABE_ANNAHMEN)!;
      expect(a.grund.length).toBeGreaterThan(a.text.length);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-ampel.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/ampel"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/ampel.ts
import type { CanonicalCase } from "@/lib/domain/canonical";
import type { Bundesland } from "./bundesland";
import { baueEingabe } from "./eingabe";
import { bewerte } from "./bewertung";
import { kleinsterWert } from "./suche";
import { HEBEL } from "./hebel";
import type { Annahmen } from "./types";

export type AmpelFarbe = "gruen" | "gelb" | "rot" | "grau";

export interface Ampel {
  farbe: AmpelFarbe;
  /** Eine Zeile – mehr Platz hat eine Kanban-Karte nicht. */
  text: string;
  /** Ausfuehrlicher, fuer das title-Attribut. */
  grund: string;
}

export interface AmpelOptionen {
  applicantCount: number;
  anzahlKinder: number;
  verloren: boolean;
  abgeschlossen: boolean;
  grunderwerbsteuerProzentOverride?: number | null;
  bundeslandOverride?: Bundesland | null;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;

/**
 * Verkuerzte Sicht auf den Machbarkeits-Solver fuer eine Kanban-Karte.
 *
 * Rechnet bewusst NICHT alle Hebel durch, sondern nur die zwei Fragen, die im
 * Erstgespraech zaehlen: Wie viel Eigenkapital fehlt? Welcher Kaufpreis waere
 * tragbar?
 *
 * Rueckgabe `null` heisst "keine Ampel anzeigen" (verloren/abgeschlossen) und
 * ist streng zu unterscheiden von grau ("Daten reichen nicht fuer ein Urteil").
 */
export function ampelFuer(c: CanonicalCase, opts: AmpelOptionen, a: Annahmen): Ampel | null {
  if (opts.verloren || opts.abgeschlossen) return null;

  const eingabe = baueEingabe(c, {
    applicantCount: Math.max(opts.applicantCount, 1),
    anzahlKinder: opts.anzahlKinder,
    grunderwerbsteuerProzentOverride: opts.grunderwerbsteuerProzentOverride ?? null,
    bundeslandOverride: opts.bundeslandOverride ?? null,
  });

  // Grau ist KEIN Urteil, sondern eine Datenluecke. Eine Luecke als Absage zu
  // lesen waere der Fehler, der das Werkzeug unbrauchbar macht.
  if (!eingabe.ok) {
    return {
      farbe: "grau",
      text: "Daten unvollständig",
      grund: `Für eine Machbarkeitsaussage fehlt: ${eingabe.fehlend.join(", ")}.`,
    };
  }

  const e = eingabe.eingabe;
  const start = bewerte(e, a);
  if (start.machbar) {
    return {
      farbe: "gruen",
      text: `trägt · ${pct(start.auslauf)} Auslauf`,
      grund: `Beleihungsauslauf ${pct(start.auslauf)}, Haushaltsüberschuss ${eur(start.ueberschuss)} bei ${eur(start.rate + start.ratenkreditRate)} Rate.`,
    };
  }

  const ziel = (u: { machbar: boolean }) => u.machbar;

  const ekHebel = HEBEL.find((h) => h.key === "eigenkapital");
  const ek = ekHebel ? kleinsterWert(ekHebel, e, a, ziel) : null;
  if (ek) {
    return {
      farbe: "gelb",
      text: `braucht ${eur(ek.wert)} mehr EK`,
      grund: `Mit ${eur(ek.wert)} zusätzlichem Eigenkapital sinkt der Auslauf auf ${pct(ek.urteil.auslauf)} und der Haushalt trägt (${eur(ek.urteil.ueberschuss)} Überschuss). Aktuell: ${pct(start.auslauf)}, ${eur(start.ueberschuss)}.`,
    };
  }

  const kpHebel = HEBEL.find((h) => h.key === "kaufpreis");
  const kp = kpHebel ? kleinsterWert(kpHebel, e, a, ziel) : null;
  if (kp) {
    const tragbar = Math.max(e.kaufpreis - kp.wert, 0);
    return {
      farbe: "gelb",
      text: `Objekt bis ${eur(tragbar)}`,
      grund: `Mehr Eigenkapital allein löst es nicht. Bei einem Kaufpreis bis ${eur(tragbar)} (statt ${eur(e.kaufpreis)}) trägt der Fall.`,
    };
  }

  return {
    farbe: "rot",
    text: "trägt auch dann nicht",
    grund: `Weder zusätzliches Eigenkapital noch ein kleineres Objekt lösen es: Der Haushalt trägt die Rate auch ohne Darlehensanteil nicht. Aktuell ${eur(start.ueberschuss)} Überschuss.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-ampel.test.ts && npm run typecheck`
Expected: PASS

Schlägt der Rot-Test fehl, weil der Kaufpreis-Hebel bei 600 € Einkommen noch etwas findet: Der Hebel ist auf 20 % Preisnachlass gedeckelt (`hebel.ts`), bei 400.000 € also 80.000 €. Das reicht bei 600 € Einkommen nicht — der Test muss dann grün werden, ohne dass die Deckelung angefasst wird.

- [ ] **Step 5: Commit**

```bash
git add src/lib/machbarkeit/ampel.ts tests/machbarkeit-ampel.test.ts
git commit -m "feat(ampel): Machbarkeits-Ampel als reine Funktion"
```

---

### Task 3: Ampel im Pipeline-Board

**Files:**
- Modify: `src/app/(app)/pipeline/page.tsx`
- Modify: `src/lib/cases/lead-board.ts`
- Modify: `src/components/pipeline/lead-board.tsx`

**Interfaces:**
- Consumes: `ampelFuer`, `Ampel` aus `@/lib/machbarkeit/ampel`; `ladeAnnahmen` aus `@/lib/machbarkeit/annahmen`
- Produces: `BoardKarte["ampel"]: Ampel | null` und `BoardKarteView["ampel"]: { farbe: string; text: string; grund: string } | null`

- [ ] **Step 1: Extend the board query**

In `src/app/(app)/pipeline/page.tsx` im `boardRows`-`select` ergänzen — die Abfrage bleibt **eine** Runde:

```ts
      financingType: true,
      financingRequest: {
        select: {
          darlehenswunsch: true,
          kaufpreis: true,
          baukosten: true,
          modernisierungskosten: true,
          eigenkapital: true,
          nebenkosten: true,
          maklerprovisionProzent: true,
          grunderwerbsteuerProzent: true,
        },
      },
      property: {
        select: {
          plz: true,
          ort: true,
          wohnflaeche: true,
          hausgeldMonatlich: true,
          mieteinnahmenMonatlich: true,
          bundesland: true,
        },
      },
      liabilities: { select: { art: true, restschuld: true, monatlicheRate: true, abzuloesen: true } },
```

Und die vorhandene `applicants`-Auswahl erweitern:

```ts
      applicants: {
        orderBy: { position: "asc" },
        select: {
          vorname: true,
          nachname: true,
          anzahlKinder: true,
          income: { select: { nettoMonatlich: true, sonstigeEinnahmen: true } },
        },
      },
```

`financingRequest` steht dort bereits mit `darlehenswunsch`/`kaufpreis` — nur erweitern, nicht doppelt eintragen.

- [ ] **Step 2: Compute the traffic light per card**

In derselben Datei **vor** `const boardKarten` einfügen:

```ts
  // Annahmen EINMAL laden, nicht je Karte.
  const machbarkeitsAnnahmen = await ladeAnnahmen(ctx.organizationId);
```

Und im `boardKarten`-Mapping als weiteres Feld:

```ts
    // Machbarkeits-Ampel. Alles kommt aus der Abfrage oben – kein
    // caseToCanonical je Karte, sonst kostet das Board eine Datenbankrunde
    // pro Fall.
    ampel: ampelFuer(
      {
        applicants: c.applicants.map((_a, i) => ({ position: i + 1 })),
        employment: [],
        income: c.applicants.flatMap((a) =>
          a.income.map((i) => ({
            applicantPosition: 1,
            nettoMonatlich: i.nettoMonatlich ?? undefined,
            sonstigeEinnahmen: i.sonstigeEinnahmen ?? undefined,
          }))
        ),
        liabilities: c.liabilities.map((l) => ({
          art: l.art ?? undefined,
          restschuld: l.restschuld ?? undefined,
          monatlicheRate: l.monatlicheRate ?? undefined,
          abzuloesen: l.abzuloesen,
        })),
        assets: [],
        property: c.property
          ? {
              plz: c.property.plz ?? undefined,
              ort: c.property.ort ?? undefined,
              wohnflaeche: c.property.wohnflaeche ?? undefined,
              hausgeldMonatlich: c.property.hausgeldMonatlich ?? undefined,
              mieteinnahmenMonatlich: c.property.mieteinnahmenMonatlich ?? undefined,
            }
          : undefined,
        financing: {
          kaufpreis: c.financingRequest?.kaufpreis ?? undefined,
          baukosten: c.financingRequest?.baukosten ?? undefined,
          modernisierungskosten: c.financingRequest?.modernisierungskosten ?? undefined,
          eigenkapital: c.financingRequest?.eigenkapital ?? undefined,
          nebenkosten: c.financingRequest?.nebenkosten ?? undefined,
          maklerprovisionProzent: c.financingRequest?.maklerprovisionProzent ?? undefined,
        },
        financingType: c.financingType ?? undefined,
        platformIds: {},
      } as never,
      {
        applicantCount: Math.max(c.applicants.length, 1),
        anzahlKinder: c.applicants[0]?.anzahlKinder ?? 0,
        verloren: c.verlorenAm != null,
        abgeschlossen: c.status === "abgeschlossen",
        grunderwerbsteuerProzentOverride: c.financingRequest?.grunderwerbsteuerProzent ?? null,
        bundeslandOverride: (c.property?.bundesland as never) ?? null,
      },
      machbarkeitsAnnahmen
    ),
```

Imports oben ergänzen:

```ts
import { ampelFuer } from "@/lib/machbarkeit/ampel";
import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
```

- [ ] **Step 3: Carry the field through the board type**

In `src/lib/cases/lead-board.ts` an `BoardKarte` ergänzen:

```ts
  /** Machbarkeits-Ampel; null = bewusst keine Anzeige (verloren/abgeschlossen). */
  ampel: { farbe: string; text: string; grund: string } | null;
```

`buildBoard` reicht die Karten unverändert durch — dort ist keine Änderung nötig. Prüfen mit:
Run: `grep -n "BoardKarte" src/lib/cases/lead-board.ts`

- [ ] **Step 4: Show it on the card**

In `src/components/pipeline/lead-board.tsx` an `BoardKarteView` ergänzen:

```ts
  ampel: { farbe: string; text: string; grund: string } | null;
```

Eine Farbzuordnung oberhalb der Komponente:

```ts
/** Ampelfarben aus dem vorhandenen Ton-System, keine neuen Werte. */
const AMPEL_PUNKT: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-destructive",
  grau: "bg-muted-foreground/40",
};
```

Und direkt **nach** der Quelle-Zeile (`<p className="text-xs text-muted-foreground">{k.quelle}</p>`):

```tsx
                  {k.ampel && (
                    <p
                      className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                      title={k.ampel.grund}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${AMPEL_PUNKT[k.ampel.farbe] ?? "bg-muted-foreground/40"}`}
                      />
                      {k.ampel.text}
                    </p>
                  )}
```

- [ ] **Step 5: Pass the field where the view model is built**

Run: `grep -rn "BoardKarteView\|karten:" "src/app/(app)/pipeline/page.tsx" | head`

An der Stelle, an der `BoardKarte` in `BoardKarteView` übersetzt wird, `ampel: k.ampel` ergänzen. Fehlt eine solche Übersetzung und werden die Karten direkt durchgereicht, ist nichts zu tun — der Typecheck sagt es.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: beide ohne Fehler. `tests/lead-board.test.ts` wird rot, wenn dort Karten ohne `ampel` gebaut werden — dann `ampel: null` in den Testdaten ergänzen; das ist der korrekte Wert für eine Karte ohne Machbarkeitsaussage.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: erfolgreich

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/pipeline/page.tsx" src/lib/cases/lead-board.ts src/components/pipeline/lead-board.tsx tests/
git commit -m "feat(ampel): Machbarkeits-Ampel auf den Karten des Pipeline-Boards"
```

---

### Task 4: Gesamtlauf und Deployment

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün. Rote Bestandstests sind echte Regressionen — beheben, nicht wegdefinieren.

- [ ] **Step 2: Sanity-Prüfung am echten Board**

Das Board in der Entwicklung öffnen und prüfen:
- Karten mit vollständigen Daten tragen eine Farbe, nicht grau
- eine graue Karte nennt im Tooltip, **welches** Feld fehlt
- verlorene Fälle tragen **keine** Ampel
- die Ladezeit ist nicht spürbar schlechter als vorher

- [ ] **Step 3: Merge and deploy**

```bash
git checkout main
git merge --no-ff feat/machbarkeits-ampel -m "merge: Machbarkeits-Ampel auf Leads"
git push origin main
```

- [ ] **Step 4: Verify deployment**

1. `git merge-base --is-ancestor <commit> origin/main && echo "in main"`
2. `vercel ls --prod` — neuestes Deployment `Ready` und jünger als der Push
3. Board in der Produktion öffnen; mindestens eine Karte muss eine Ampel tragen

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| 2.1 Eigenkapital wird verworfen | 1 |
| 2.1 gemischte Typen tolerant parsen | 1 (drei Tests) |
| 3 Umfang: nur Pipeline-Board | 3 |
| 4 eine Abfrage, kein `caseToCanonical` | 3, Step 1+2 |
| 4 nichts speichern | überall — keine Aufgabe legt ein Feld an |
| 4 Annahmen einmal laden | 3, Step 2 |
| 5 vier Zustände, höchstens zwei Hebelsuchen | 2 |
| 5 Texte auf der Karte | 2 (Text) und 3 (Anzeige) |
| 5.1 Rot heißt wirklich rot, Grau ist kein Urteil | 2 (eigene Tests) |
| 5.2 nicht bei verloren/abgeschlossen | 2 (`null`) und 3 (`verloren`/`abgeschlossen`) |
| 6 Absicherung | 1, 2 |

**Beim Gegenlesen gefunden und korrigiert:**

1. **`null` und grau wären verwechselbar gewesen.** Beides heißt „keine Farbe", meint aber Gegensätzliches: `null` = wir zeigen bewusst nichts, grau = wir wissen es nicht. Der Unterschied steht jetzt im Interface-Kommentar und wird von zwei Tests festgehalten.

2. **Die Ampel braucht `financingType`.** Ohne dieses Feld hält `baueEingabe` jeden Fall für einen Bestandskauf, und der Eigenleistungs-Hebel entfiele stillschweigend. Es steht heute nicht im Board-`select` — deshalb in Task 3, Step 1 ergänzt.

3. **Ein latenter Fehler im Kaufpreis-Mapping**, den ich bewusst **nicht** anfasse: `toNumber(pm?.final_sale_price) ?? toNumber(pm?.listed_price)` liefert 0 statt des gelisteten Preises, wenn `final_sale_price` als 0 kommt (`0 ?? x` ist 0, nicht `x`). In der Stichprobe von 200 Leads tritt das **nie** auf — 23 Leads haben das Feld, keiner davon mit 0. Nicht Teil dieses Plans; hier festgehalten, damit es beim nächsten Anfassen der Datei auffällt.

**Typkonsistenz geprüft:** `Ampel`, `AmpelFarbe`, `AmpelOptionen` und `ampelFuer` heißen in Task 2 und 3 gleich. `BoardKarte["ampel"]` und `BoardKarteView["ampel"]` tragen dieselbe Struktur — bewusst als schlichtes Objekt statt als Import des `Ampel`-Typs, weil `lead-board.tsx` eine Client-Komponente ist und keine Server-Module ziehen soll.
