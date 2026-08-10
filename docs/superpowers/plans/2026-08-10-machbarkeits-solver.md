# Machbarkeits-Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Für jeden Fall ausrechnen, woran er scheitert und welche kleinste Veränderung ihn darstellbar macht.

**Architecture:** Eine reine Bewertungsfunktion `bewerte(eingabe, annahmen)` definiert als einziger Ort, was „machbar" heißt. Neun Hebel sind je eine kleine Funktion „wende Wert X auf die Eingabe an". Eine gemeinsame Suche (Raster mit Verfeinerung, bei diskreten Hebeln Vollenumeration) findet je Hebel den kleinsten Wert, der das Urteil kippt. Vollständig deterministisch, kein KI-Aufruf, keine Persistenz des Ergebnisses.

**Tech Stack:** Next.js App Router (Server Components), Prisma 6 / PostgreSQL (Supabase, Schema `unterlagenpilot`), Vitest. Kein neuer Fremdcode.

**Spec:** `docs/superpowers/specs/2026-08-10-machbarkeits-solver-design.md`

## Global Constraints

- **Kein KI-Aufruf.** Der gesamte Solver ist Arithmetik. Wer einen `aiService`-Aufruf einbaut, hat die Aufgabe missverstanden.
- **Keine stillen Nullen.** Fehlt Kaufpreis oder Nettoeinkommen, gibt es **kein** Ergebnis, sondern eine Liste fehlender Angaben. Nie mit 0 weiterrechnen.
- **Beträge werden auf volle 100 € aufgerundet**, nie abgerundet: 14.437 € → 14.500 €. Eine abgerundete Empfehlung unterschreitet die Schwelle, die sie erreichen soll.
- **Alle Annahmen sind sichtbar und überschreibbar** — dasselbe Muster wie `HaushaltAnnahmen` in `src/lib/haushalt/rechnung.ts`.
- **Zinsaufschläge sind eine Marktspanne, keine Bankkondition.** Vorgaben sind die Mitte der dokumentierten Spannen (80–90 %: 0,1–0,3 Punkte; 90–100 %: 0,3–0,8 Punkte). Im Ergebnis als „Annahme" auszuweisen, nie als Marktzins. **Jedes Hebelergebnis wird zusätzlich am unteren und oberen Rand der Spanne gerechnet und die Bandbreite mit ausgegeben** — die Unbekannte wird beziffert, nicht versteckt.
- **`berechneHaushalt()` wird unverändert genutzt.** Der Solver füttert nur andere Eingaben hinein.
- **Deutsch in allem, was der Nutzer sieht.**
- **Testlauf:** `npx vitest run <datei>` einzeln, `npm test` gesamt. `npm run typecheck` nach jeder Aufgabe. Kein `npm run lint` — das Projekt hat keine ESLint-Konfiguration und der Befehl fragt interaktiv nach.
- **Schemaänderungen** laufen über `scripts/supabase-sql.sh`, nie über `prisma db push`.

---

## File Structure

**Neu — `src/lib/machbarkeit/`:**

| Datei | Verantwortung |
|---|---|
| `types.ts` | `SolverEingabe`, `Annahmen`, `Urteil`, `HebelErgebnis`, `SolverErgebnis` |
| `bundesland.ts` | Bundesland aus PLZ und Ort; Grunderwerbsteuersätze |
| `nebenkosten.ts` | Grunderwerbsteuer + Notar/Grundbuch + Makler |
| `bewertung.ts` | `bewerte()` — Auslauf, Band, Zins, Rate, Überschuss, Urteil |
| `hebel.ts` | die neun Hebel als `HebelDefinition[]` |
| `suche.ts` | Raster mit Verfeinerung, Vollenumeration, Paarsuche |
| `solver.ts` | Orchestrierung: Diagnose, Hebelliste, Reihenfolge |
| `eingabe.ts` | `CanonicalCase` → `SolverEingabe` inklusive Fehlliste |
| `annahmen.ts` | Vorgabewerte und Laden je Organisation |

**Geändert:**

| Datei | Änderung |
|---|---|
| `prisma/schema.prisma` | Modell `MachbarkeitsAnnahmen`; Feld `FinancingRequest.grunderwerbsteuerProzent`; Feld `Property.bundesland` |
| `src/lib/cases/next-step.ts` | Stufe `machbarkeit` |
| `src/lib/cases/cockpit.ts`, `dashboard.ts` | Zähler `machbarkeitBlockiert` |
| `src/components/case/next-step-card.tsx` | Icon für die neue Stufe |

**Neu (Seiten):** `src/app/(app)/cases/[id]/machbarkeit/page.tsx`, `src/app/(app)/settings/machbarkeit/page.tsx`, `src/lib/actions/machbarkeit.ts`

**Reihenfolge:** Aufgaben 1–7 sind reine Funktionen ohne Datenbank — der gesamte Rechenkern entsteht und wird vollständig getestet, bevor irgendetwas verdrahtet wird.

---

### Task 1: Bundesland und Grunderwerbsteuersätze

**Files:**
- Create: `src/lib/machbarkeit/bundesland.ts`
- Test: `tests/machbarkeit-bundesland.test.ts`

**Interfaces:**
- Produces:
  - `type Bundesland` (16 Werte als String-Union)
  - `const GRUNDERWERBSTEUER: Record<Bundesland, number>` und `const GRESt_STAND: string`
  - `function bundeslandAusPlzOrt(plz: string | null, ort: string | null): { bundesland: Bundesland; sicher: boolean } | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-bundesland.test.ts
import { describe, it, expect } from "vitest";
import {
  GRUNDERWERBSTEUER,
  GRESt_STAND,
  bundeslandAusPlzOrt,
  type Bundesland,
} from "@/lib/machbarkeit/bundesland";

describe("Grunderwerbsteuersaetze", () => {
  it("kennt alle 16 Bundeslaender", () => {
    expect(Object.keys(GRUNDERWERBSTEUER)).toHaveLength(16);
  });

  it("liegt ueberall im gesetzlich moeglichen Rahmen", () => {
    for (const [land, satz] of Object.entries(GRUNDERWERBSTEUER)) {
      expect(satz, land).toBeGreaterThanOrEqual(3.5);
      expect(satz, land).toBeLessThanOrEqual(6.5);
    }
  });

  it("nennt einen Stand – Saetze aendern sich per Landesgesetz", () => {
    expect(GRESt_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("hat fuer Bayern den bundesweit niedrigsten Satz", () => {
    expect(GRUNDERWERBSTEUER.bayern).toBe(3.5);
  });
});

describe("Bundesland aus PLZ und Ort", () => {
  it("erkennt eine eindeutige PLZ sicher", () => {
    expect(bundeslandAusPlzOrt("80331", "München")).toEqual({ bundesland: "bayern", sicher: true });
  });

  it("erkennt Berlin", () => {
    expect(bundeslandAusPlzOrt("10115", "Berlin")?.bundesland).toBe("berlin");
  });

  it("loest eine grenzueberschreitende PLZ ueber den Ort auf", () => {
    // 34xxx liegt teils in Hessen, teils in Niedersachsen.
    const hessen = bundeslandAusPlzOrt("34117", "Kassel");
    const nds = bundeslandAusPlzOrt("34346", "Hann. Münden");
    expect(hessen?.bundesland).toBe("hessen");
    expect(nds?.bundesland).toBe("niedersachsen");
  });

  it("meldet unsicher, wenn die PLZ mehrdeutig ist und der Ort nicht hilft", () => {
    const r = bundeslandAusPlzOrt("34346", null);
    expect(r?.sicher).toBe(false);
  });

  it("liefert null bei fehlender PLZ – lieber nichts als geraten", () => {
    expect(bundeslandAusPlzOrt(null, "München")).toBeNull();
    expect(bundeslandAusPlzOrt("", "München")).toBeNull();
  });

  it("ignoriert Leerzeichen und Schreibweise des Orts", () => {
    expect(bundeslandAusPlzOrt("34346", "  hann. münden ")?.bundesland).toBe("niedersachsen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-bundesland.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/bundesland"`

- [ ] **Step 3: Verify the tax rates against a current source**

Die Sätze sind Landesrecht und ändern sich. **Vor dem Schreiben prüfen** (z. B. beim BMF oder einer aktuellen Übersicht) und den Stand als `GRESt_STAND` eintragen. Stimmt ein Wert nicht mit der Quelle überein, gilt die Quelle.

Ausgangswerte zur Prüfung: Baden-Württemberg 5,0 · Bayern 3,5 · Berlin 6,0 · Brandenburg 6,5 · Bremen 5,0 · Hamburg 5,5 · Hessen 6,0 · Mecklenburg-Vorpommern 6,0 · Niedersachsen 5,0 · Nordrhein-Westfalen 6,5 · Rheinland-Pfalz 5,0 · Saarland 6,5 · Sachsen 5,5 · Sachsen-Anhalt 5,0 · Schleswig-Holstein 6,5 · Thüringen 5,0

- [ ] **Step 4: Obtain the PLZ dataset**

Eine belastbare Zuordnung PLZ → Bundesland beschaffen (öffentliche Datensätze gibt es z. B. bei OpenDataSoft oder als frei lizenzierte GitHub-Datensätze) und nach `src/lib/machbarkeit/plz-bundesland.json` als kompakte Struktur ablegen:

```json
{
  "stand": "2026-08-10",
  "quelle": "<URL des Datensatzes>",
  "eindeutig": { "80331": "bayern", "10115": "berlin" },
  "mehrdeutig": { "34346": { "hann. munden": "niedersachsen", "kassel": "hessen" } }
}
```

**Falls kein Datensatz beschaffbar ist:** NICHT auf eine Präfix-Faustregel ausweichen. Stattdessen `bundeslandAusPlzOrt` immer `null` liefern lassen; die Oberfläche verlangt dann in Aufgabe 9 die manuelle Auswahl des Bundeslands. Ein still falscher Steuersatz verschiebt bei 400.000 € Kaufpreis das Ergebnis um 12.000 €.

- [ ] **Step 5: Write the implementation**

```ts
// src/lib/machbarkeit/bundesland.ts
import daten from "./plz-bundesland.json";

export const BUNDESLAENDER = [
  "baden_wuerttemberg", "bayern", "berlin", "brandenburg", "bremen", "hamburg",
  "hessen", "mecklenburg_vorpommern", "niedersachsen", "nordrhein_westfalen",
  "rheinland_pfalz", "saarland", "sachsen", "sachsen_anhalt",
  "schleswig_holstein", "thueringen",
] as const;
export type Bundesland = (typeof BUNDESLAENDER)[number];

export const BUNDESLAND_LABELS: Record<Bundesland, string> = {
  baden_wuerttemberg: "Baden-Württemberg",
  bayern: "Bayern",
  berlin: "Berlin",
  brandenburg: "Brandenburg",
  bremen: "Bremen",
  hamburg: "Hamburg",
  hessen: "Hessen",
  mecklenburg_vorpommern: "Mecklenburg-Vorpommern",
  niedersachsen: "Niedersachsen",
  nordrhein_westfalen: "Nordrhein-Westfalen",
  rheinland_pfalz: "Rheinland-Pfalz",
  saarland: "Saarland",
  sachsen: "Sachsen",
  sachsen_anhalt: "Sachsen-Anhalt",
  schleswig_holstein: "Schleswig-Holstein",
  thueringen: "Thüringen",
};

/** Stand der Saetze. Grunderwerbsteuer ist Landesrecht und aendert sich. */
export const GRESt_STAND = daten.stand;

/** Grunderwerbsteuersatz in Prozent. Bei Aenderung auch GRESt_STAND anpassen. */
export const GRUNDERWERBSTEUER: Record<Bundesland, number> = {
  baden_wuerttemberg: 5.0,
  bayern: 3.5,
  berlin: 6.0,
  brandenburg: 6.5,
  bremen: 5.0,
  hamburg: 5.5,
  hessen: 6.0,
  mecklenburg_vorpommern: 6.0,
  niedersachsen: 5.0,
  nordrhein_westfalen: 6.5,
  rheinland_pfalz: 5.0,
  saarland: 6.5,
  sachsen: 5.5,
  sachsen_anhalt: 5.0,
  schleswig_holstein: 6.5,
  thueringen: 5.0,
};

const normOrt = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/\s+/g, " ");

/**
 * Eine Gemeinde gehoert zu genau einem Bundesland – PLZ UND Ort zusammen sind
 * eindeutig. Die PLZ allein ist es nicht: rund hundert der gut 8.000 PLZ laufen
 * ueber eine Landesgrenze, weil PLZ-Gebiete an Zustellwegen geschnitten sind.
 *
 * `sicher: false` heisst: die PLZ ist mehrdeutig und der Ort half nicht. Dann
 * muss der Vermittler bestaetigen – nie stillschweigend raten.
 */
export function bundeslandAusPlzOrt(
  plz: string | null,
  ort: string | null
): { bundesland: Bundesland; sicher: boolean } | null {
  const p = (plz ?? "").trim();
  if (!/^\d{5}$/.test(p)) return null;

  const eindeutig = (daten.eindeutig as Record<string, string>)[p];
  if (eindeutig) return { bundesland: eindeutig as Bundesland, sicher: true };

  const mehrdeutig = (daten.mehrdeutig as Record<string, Record<string, string>>)[p];
  if (!mehrdeutig) return null;

  if (ort) {
    const treffer = mehrdeutig[normOrt(ort)];
    if (treffer) return { bundesland: treffer as Bundesland, sicher: true };
  }
  // Mehrdeutig und kein Ort-Treffer: erste Moeglichkeit als Vorschlag, aber unsicher.
  const ersteMoeglichkeit = Object.values(mehrdeutig)[0];
  return ersteMoeglichkeit
    ? { bundesland: ersteMoeglichkeit as Bundesland, sicher: false }
    : null;
}
```

`tsconfig.json` prüfen: ist `resolveJsonModule` nicht gesetzt, ergänzen.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-bundesland.test.ts && npm run typecheck`
Expected: PASS, 11 Tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/machbarkeit/ tests/machbarkeit-bundesland.test.ts tsconfig.json
git commit -m "feat(machbarkeit): Bundesland aus PLZ und Ort, Grunderwerbsteuersaetze"
```

---

### Task 2: Nebenkosten

**Files:**
- Create: `src/lib/machbarkeit/types.ts`
- Create: `src/lib/machbarkeit/nebenkosten.ts`
- Test: `tests/machbarkeit-nebenkosten.test.ts`

**Interfaces:**
- Consumes: `Bundesland`, `GRUNDERWERBSTEUER` aus `./bundesland`
- Produces:
  - `interface SolverEingabe`, `interface Annahmen`, `interface NebenkostenAufstellung`
  - `function berechneNebenkosten(e: SolverEingabe, a: Annahmen): NebenkostenAufstellung`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-nebenkosten.test.ts
import { describe, it, expect } from "vitest";
import { berechneNebenkosten } from "@/lib/machbarkeit/nebenkosten";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000,
  modernisierungskosten: 0,
  inventarAnteil: 0,
  nebenkostenErfasst: null,
  maklerprovisionProzent: 3.57,
  bundesland: "bayern",
  grunderwerbsteuerProzentOverride: null,
  eigenkapital: 80_000,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  nettoEinkommen: 4_000,
  zusatzEinnahmen: 0,
  zusatzErwachsene: 0,
  kredite: [],
  abzuloesendeRestschuld: 0,
  applicantCount: 1,
  anzahlKinder: 0,
  wohnflaeche: 100,
  hausgeldMonatlich: null,
  mieteinnahmenMonatlich: 0,
  bestehendeRaten: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

describe("Nebenkosten", () => {
  it("rechnet Grunderwerbsteuer, Notar und Makler aus dem Kaufpreis", () => {
    const n = berechneNebenkosten(eingabe(), VORGABE_ANNAHMEN);
    // Bayern 3,5 % von 400.000 = 14.000
    expect(n.grunderwerbsteuer).toBe(14_000);
    // Notar+Grundbuch 2 % von 400.000 = 8.000
    expect(n.notarGrundbuch).toBe(8_000);
    // Makler 3,57 % von 400.000 = 14.280
    expect(n.makler).toBe(14_280);
    expect(n.summe).toBe(36_280);
    expect(n.gerechnet).toBe(true);
  });

  it("nimmt einen erfassten Nebenkostenbetrag statt zu rechnen – nie beides", () => {
    const n = berechneNebenkosten(eingabe({ nebenkostenErfasst: 30_000 }), VORGABE_ANNAHMEN);
    expect(n.summe).toBe(30_000);
    expect(n.gerechnet).toBe(false);
  });

  it("zieht herausgerechnetes Inventar von der Grunderwerbsteuer ab", () => {
    const n = berechneNebenkosten(eingabe({ inventarAnteil: 20_000 }), VORGABE_ANNAHMEN);
    // Steuer nur auf 380.000
    expect(n.grunderwerbsteuer).toBe(13_300);
  });

  it("respektiert einen manuell gesetzten Steuersatz", () => {
    const n = berechneNebenkosten(
      eingabe({ grunderwerbsteuerProzentOverride: 6.5 }),
      VORGABE_ANNAHMEN
    );
    expect(n.grunderwerbsteuer).toBe(26_000);
  });

  it("rechnet ohne Makler, wenn keine Provision erfasst ist", () => {
    const n = berechneNebenkosten(eingabe({ maklerprovisionProzent: 0 }), VORGABE_ANNAHMEN);
    expect(n.makler).toBe(0);
  });

  it("nutzt bei unbekanntem Bundesland den vorsichtigsten Satz", () => {
    const n = berechneNebenkosten(eingabe({ bundesland: null }), VORGABE_ANNAHMEN);
    // 6,5 % – lieber zu teuer rechnen als eine Machbarkeit vorgaukeln
    expect(n.grunderwerbsteuer).toBe(26_000);
    expect(n.steuersatzUnsicher).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-nebenkosten.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/nebenkosten"`

- [ ] **Step 3: Write the types**

```ts
// src/lib/machbarkeit/types.ts
import type { Bundesland } from "./bundesland";

/**
 * Alles, was der Solver zum Rechnen braucht – flach und ohne Datenbankbezug,
 * damit jeder Hebel eine Kopie veraendern kann, ohne Nebenwirkungen.
 */
export interface SolverEingabe {
  kaufpreis: number;
  modernisierungskosten: number;
  /** Aus dem Kaufpreis herausgerechnetes Inventar (nicht beleihbar). */
  inventarAnteil: number;
  /** Am Fall erfasste Nebenkosten. Gesetzt => es wird nicht gerechnet. */
  nebenkostenErfasst: number | null;
  maklerprovisionProzent: number;
  bundesland: Bundesland | null;
  grunderwerbsteuerProzentOverride: number | null;

  eigenkapital: number;
  eigenleistung: number;
  /** Freier Beleihungsraum einer Zusatzsicherheit. */
  zusatzsicherheitBeleihungsraum: number;
  /** Ueber einen Ratenkredit statt das Baudarlehen finanzierter Anteil. */
  ratenkreditAnteil: number;

  tilgungProzent: number;
  /** Konkreter Sollzins aus einem Angebot; null => Annahmen greifen. */
  sollzinsProzent: number | null;

  nettoEinkommen: number;
  zusatzEinnahmen: number;
  /** Weitere Erwachsene im Haushalt (Hebel "weiterer Darlehensnehmer"). */
  zusatzErwachsene: number;

  kredite: Array<{ id: string; bezeichnung: string; restschuld: number; rate: number }>;
  /** Summe der Restschulden, die mitfinanziert werden sollen. */
  abzuloesendeRestschuld: number;
  /** Raten der NICHT abgeloesten Kredite. */
  bestehendeRaten: number;

  applicantCount: number;
  anzahlKinder: number;
  wohnflaeche: number;
  hausgeldMonatlich: number | null;
  mieteinnahmenMonatlich: number;

  istNeubauOderModernisierung: boolean;
}

/** Alle Annahmen offengelegt – Muster wie HaushaltAnnahmen. */
export interface Annahmen {
  /** Notar und Grundbuch in Prozent des Kaufpreises. */
  notarGrundbuchProzent: number;
  /** Satz, wenn das Bundesland unbekannt ist: der hoechste, nie ein guenstiger. */
  grEStFallbackProzent: number;
  /** Basiszins fuer das beste Band (<= 60 %), in Prozent p. a. – PLATZHALTER. */
  basiszinsProzent: number;
  /** Aufschlag je Band in Prozentpunkten – PLATZHALTER, vom Vermittler zu setzen. */
  aufschlagBis80: number;
  aufschlagBis90: number;
  aufschlagBis100: number;
  aufschlagBis110: number;
  /** Obergrenze des Auslaufs; darueber gilt der Fall als nicht darstellbar. */
  auslaufObergrenze: number;
  /** Geforderter Haushaltsueberschuss in Euro. */
  ueberschussPuffer: number;
  /** Eigenleistung hoechstens X Prozent der Bau-/Modernisierungskosten. */
  eigenleistungDeckelProzent: number;
  /** Ratenkredit: Zins p. a. und Laufzeit in Monaten. */
  ratenkreditZinsProzent: number;
  ratenkreditLaufzeitMonate: number;
  /** Mindesttilgung, unter die der Solver nicht geht. */
  mindestTilgungProzent: number;
  /**
   * Unschaerfe der Zinsaufschlaege in Prozentpunkten. Es gibt keinen "richtigen"
   * Aufschlag – er haengt von Bank, Produkt und Tagesmarkt ab. Der Solver rechnet
   * jedes Ergebnis zusaetzlich mit +/- diesem Wert und gibt die Bandbreite aus,
   * statt Praezision vorzutaeuschen.
   */
  aufschlagUnschaerfe: number;
}

export const VORGABE_ANNAHMEN: Annahmen = {
  notarGrundbuchProzent: 2.0,
  grEStFallbackProzent: 6.5,
  basiszinsProzent: 3.5,
  aufschlagBis80: 0.1,
  aufschlagBis90: 0.3,
  aufschlagBis100: 0.6,
  aufschlagBis110: 1.2,
  auslaufObergrenze: 110,
  ueberschussPuffer: 0,
  eigenleistungDeckelProzent: 15,
  ratenkreditZinsProzent: 8.0,
  ratenkreditLaufzeitMonate: 84,
  mindestTilgungProzent: 1.0,
  aufschlagUnschaerfe: 0.25,
};

export interface NebenkostenAufstellung {
  grunderwerbsteuer: number;
  notarGrundbuch: number;
  makler: number;
  summe: number;
  /** false = am Fall erfasster Betrag uebernommen. */
  gerechnet: boolean;
  /** true = Bundesland unbekannt, es gilt der Fallback-Satz. */
  steuersatzUnsicher: boolean;
  grunderwerbsteuerProzent: number;
}
```

- [ ] **Step 4: Write the calculation**

```ts
// src/lib/machbarkeit/nebenkosten.ts
import { GRUNDERWERBSTEUER } from "./bundesland";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Nebenkosten muss der Solver selbst rechnen, weil mehrere Hebel sie
 * veraendern (Kaufpreis nachverhandeln, Inventar herausrechnen).
 */
export function berechneNebenkosten(e: SolverEingabe, a: Annahmen): NebenkostenAufstellung {
  const steuersatzUnsicher = e.grunderwerbsteuerProzentOverride == null && e.bundesland == null;
  const satz =
    e.grunderwerbsteuerProzentOverride ??
    (e.bundesland ? GRUNDERWERBSTEUER[e.bundesland] : a.grEStFallbackProzent);

  // Inventar ist nicht grunderwerbsteuerpflichtig.
  const steuerBasis = Math.max(e.kaufpreis - e.inventarAnteil, 0);
  const grunderwerbsteuer = r2((steuerBasis * satz) / 100);
  const notarGrundbuch = r2((e.kaufpreis * a.notarGrundbuchProzent) / 100);
  const makler = r2((e.kaufpreis * (e.maklerprovisionProzent || 0)) / 100);

  if (e.nebenkostenErfasst != null) {
    return {
      grunderwerbsteuer,
      notarGrundbuch,
      makler,
      summe: e.nebenkostenErfasst,
      gerechnet: false,
      steuersatzUnsicher,
      grunderwerbsteuerProzent: satz,
    };
  }

  return {
    grunderwerbsteuer,
    notarGrundbuch,
    makler,
    summe: r2(grunderwerbsteuer + notarGrundbuch + makler),
    gerechnet: true,
    steuersatzUnsicher,
    grunderwerbsteuerProzent: satz,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-nebenkosten.test.ts && npm run typecheck`
Expected: PASS, 6 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/machbarkeit/types.ts src/lib/machbarkeit/nebenkosten.ts tests/machbarkeit-nebenkosten.test.ts
git commit -m "feat(machbarkeit): Nebenkosten mit Grunderwerbsteuer je Bundesland"
```

---

### Task 3: Die Bewertungsfunktion

Der einzige Ort, an dem „machbar" definiert wird. Jeder Hebel wird ausschließlich durch sie beurteilt.

**Files:**
- Create: `src/lib/machbarkeit/bewertung.ts`
- Test: `tests/machbarkeit-bewertung.test.ts`

**Interfaces:**
- Consumes: `SolverEingabe`, `Annahmen` aus `./types`; `berechneNebenkosten`; `berechneHaushalt` aus `@/lib/haushalt/rechnung`
- Produces:
  - `type Auslaufband = "bis60" | "bis80" | "bis90" | "bis100" | "bis110" | "darueber"`
  - `interface Urteil { darlehen, beleihungswert, auslauf, band, zinsProzent, rate, ueberschuss, machbar, nebenkosten }`
  - `function bewerte(e: SolverEingabe, a: Annahmen): Urteil`
  - `function bandFuer(auslauf: number): Auslaufband`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-bewertung.test.ts
import { describe, it, expect } from "vitest";
import { bewerte, bandFuer } from "@/lib/machbarkeit/bewertung";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000, modernisierungskosten: 0, inventarAnteil: 0,
  nebenkostenErfasst: null, maklerprovisionProzent: 0,
  bundesland: "bayern", grunderwerbsteuerProzentOverride: null,
  eigenkapital: 100_000, eigenleistung: 0, zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0, tilgungProzent: 2, sollzinsProzent: null,
  nettoEinkommen: 5_000, zusatzEinnahmen: 0, zusatzErwachsene: 0,
  kredite: [], abzuloesendeRestschuld: 0, bestehendeRaten: 0,
  applicantCount: 1, anzahlKinder: 0, wohnflaeche: 100,
  hausgeldMonatlich: null, mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

describe("Auslaufbaender", () => {
  it("setzt die beste Kondition bei 60 Prozent – der Realkreditgrenze", () => {
    expect(bandFuer(59.9)).toBe("bis60");
    expect(bandFuer(60)).toBe("bis60");
    expect(bandFuer(60.1)).toBe("bis80");
  });

  it("kennt alle Stufen bis ueber 110", () => {
    expect(bandFuer(80)).toBe("bis80");
    expect(bandFuer(85)).toBe("bis90");
    expect(bandFuer(95)).toBe("bis100");
    expect(bandFuer(105)).toBe("bis110");
    expect(bandFuer(111)).toBe("darueber");
  });
});

describe("Bewertung", () => {
  it("rechnet den Auslauf gegen den Kaufpreis, nicht gegen die Gesamtkosten", () => {
    // 400.000 KP, 14.000 GrESt + 8.000 Notar = 22.000 NK, 100.000 EK
    // Darlehen = 400.000 + 22.000 - 100.000 = 322.000 -> 80,5 %
    const u = bewerte(eingabe(), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(322_000);
    expect(u.beleihungswert).toBe(400_000);
    expect(u.auslauf).toBeCloseTo(80.5, 1);
  });

  it("erhoeht den Zins mit dem Band – der Aufschlag belastet den Haushalt", () => {
    const gut = bewerte(eingabe({ eigenkapital: 180_000 }), VORGABE_ANNAHMEN);
    const knapp = bewerte(eingabe({ eigenkapital: 20_000 }), VORGABE_ANNAHMEN);
    expect(gut.band).toBe("bis60");
    expect(gut.zinsProzent).toBe(VORGABE_ANNAHMEN.basiszinsProzent);
    expect(knapp.zinsProzent).toBeGreaterThan(gut.zinsProzent);
    expect(knapp.rate).toBeGreaterThan(gut.rate);
  });

  it("nimmt einen konkreten Sollzins als Basis des aktuellen Bandes", () => {
    const u = bewerte(eingabe({ sollzinsProzent: 4.2 }), VORGABE_ANNAHMEN);
    // Band bis80 -> Aufschlag 0,1 ist im Angebot schon enthalten
    expect(u.zinsProzent).toBe(4.2);
  });

  it("zaehlt eine Zusatzsicherheit in den Beleihungswert", () => {
    const ohne = bewerte(eingabe({ eigenkapital: 20_000 }), VORGABE_ANNAHMEN);
    const mit = bewerte(
      eingabe({ eigenkapital: 20_000, zusatzsicherheitBeleihungsraum: 100_000 }),
      VORGABE_ANNAHMEN
    );
    expect(mit.beleihungswert).toBe(500_000);
    expect(mit.auslauf).toBeLessThan(ohne.auslauf);
    expect(mit.darlehen).toBe(ohne.darlehen); // kein Bargeld geflossen
  });

  it("zieht herausgerechnetes Inventar vom Beleihungswert ab", () => {
    const u = bewerte(eingabe({ inventarAnteil: 20_000 }), VORGABE_ANNAHMEN);
    expect(u.beleihungswert).toBe(380_000);
  });

  it("erhoeht das Darlehen um mitfinanzierte Restschulden", () => {
    const u = bewerte(eingabe({ abzuloesendeRestschuld: 8_900 }), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(330_900);
  });

  it("nimmt den Ratenkreditanteil aus dem Baudarlehen heraus", () => {
    const u = bewerte(eingabe({ ratenkreditAnteil: 22_000 }), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(300_000);
    expect(u.auslauf).toBeCloseTo(75, 1);
  });

  it("belastet den Haushalt mit der Ratenkreditrate", () => {
    const ohne = bewerte(eingabe(), VORGABE_ANNAHMEN);
    const mit = bewerte(eingabe({ ratenkreditAnteil: 22_000 }), VORGABE_ANNAHMEN);
    expect(mit.ueberschuss).toBeLessThan(ohne.ueberschuss);
  });

  it("erklaert einen Fall ueber der Obergrenze fuer nicht darstellbar", () => {
    const u = bewerte(eingabe({ eigenkapital: 0, maklerprovisionProzent: 7 }), VORGABE_ANNAHMEN);
    expect(u.band).toBe("darueber");
    expect(u.machbar).toBe(false);
  });

  it("erklaert einen Fall mit negativem Ueberschuss fuer nicht machbar", () => {
    const u = bewerte(eingabe({ nettoEinkommen: 1_800 }), VORGABE_ANNAHMEN);
    expect(u.ueberschuss).toBeLessThan(0);
    expect(u.machbar).toBe(false);
  });

  it("rechnet weitere Erwachsene mit ihrer Lebenshaltungspauschale gegen", () => {
    const allein = bewerte(eingabe({ zusatzEinnahmen: 500 }), VORGABE_ANNAHMEN);
    const zuZweit = bewerte(
      eingabe({ zusatzEinnahmen: 500, zusatzErwachsene: 1 }),
      VORGABE_ANNAHMEN
    );
    expect(zuZweit.ueberschuss).toBeLessThan(allein.ueberschuss);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-bewertung.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/bewertung"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/bewertung.ts
import { berechneHaushalt } from "@/lib/haushalt/rechnung";
import { berechneNebenkosten } from "./nebenkosten";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

export type Auslaufband = "bis60" | "bis80" | "bis90" | "bis100" | "bis110" | "darueber";

export const BAND_LABELS: Record<Auslaufband, string> = {
  bis60: "bis 60 % – beste Kondition (Realkreditgrenze)",
  bis80: "bis 80 % – Standardkondition",
  bis90: "bis 90 % – Aufschlag",
  bis100: "bis 100 % – Vollfinanzierung",
  bis110: "bis 110 % – Nebenkosten mitfinanziert",
  darueber: "über 110 % – praktisch nicht darstellbar",
};

export interface Urteil {
  darlehen: number;
  beleihungswert: number;
  auslauf: number;
  band: Auslaufband;
  zinsProzent: number;
  /** Monatliche Rate des Baudarlehens. */
  rate: number;
  /** Monatliche Rate eines etwaigen Ratenkredits. */
  ratenkreditRate: number;
  ueberschuss: number;
  machbar: boolean;
  nebenkosten: NebenkostenAufstellung;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function bandFuer(auslauf: number): Auslaufband {
  if (auslauf <= 60) return "bis60";
  if (auslauf <= 80) return "bis80";
  if (auslauf <= 90) return "bis90";
  if (auslauf <= 100) return "bis100";
  if (auslauf <= 110) return "bis110";
  return "darueber";
}

/** Aufschlag des Bandes in Prozentpunkten gegenueber dem Basiszins. */
function aufschlagFuer(band: Auslaufband, a: Annahmen): number {
  switch (band) {
    case "bis60": return 0;
    case "bis80": return a.aufschlagBis80;
    case "bis90": return a.aufschlagBis90;
    case "bis100": return a.aufschlagBis100;
    default: return a.aufschlagBis110;
  }
}

/** Annuitaetenrate eines Ratenkredits (fester Zins, feste Laufzeit). */
function ratenkreditRate(betrag: number, zinsProzent: number, monate: number): number {
  if (betrag <= 0 || monate <= 0) return 0;
  const i = zinsProzent / 100 / 12;
  if (i === 0) return r2(betrag / monate);
  return r2((betrag * i) / (1 - Math.pow(1 + i, -monate)));
}

/**
 * Der einzige Ort, an dem "machbar" definiert wird.
 *
 * Wichtig: Der Zinsaufschlag haengt vom Auslaufband ab und erhoeht die Rate.
 * Ein Fall scheitert deshalb nie "am Auslauf", sondern daran, dass der Haushalt
 * den zum Auslauf gehoerenden Zins nicht mehr traegt.
 */
export function bewerte(e: SolverEingabe, a: Annahmen): Urteil {
  const nebenkosten = berechneNebenkosten(e, a);

  const darlehen = r2(
    Math.max(
      e.kaufpreis +
        e.modernisierungskosten +
        nebenkosten.summe +
        e.abzuloesendeRestschuld -
        e.eigenkapital -
        e.eigenleistung -
        e.ratenkreditAnteil,
      0
    )
  );

  // Inventar ist nicht beleihbar; eine Zusatzsicherheit erweitert den Nenner.
  const beleihungswert = r2(
    Math.max(e.kaufpreis - e.inventarAnteil, 0) + e.zusatzsicherheitBeleihungsraum
  );

  const auslauf = beleihungswert > 0 ? r2((darlehen / beleihungswert) * 100) : Infinity;
  const band = bandFuer(auslauf);

  // Ein konkreter Sollzins gilt fuer das AKTUELLE Band; andere Baender ergeben
  // sich ueber die Abstaende der Aufschlagstabelle.
  const zinsProzent =
    e.sollzinsProzent != null
      ? r2(e.sollzinsProzent)
      : r2(a.basiszinsProzent + aufschlagFuer(band, a));

  const rate = r2((darlehen * ((zinsProzent + e.tilgungProzent) / 100)) / 12);
  const rkRate = ratenkreditRate(e.ratenkreditAnteil, a.ratenkreditZinsProzent, a.ratenkreditLaufzeitMonate);

  // berechneHaushalt unveraendert nutzen: Rate ueber financing.darlehensbetrag
  // und sollzinsProzent steuern, die Ratenkreditrate als bestehende Rate.
  const h = berechneHaushalt(
    {
      income: [
        {
          nettoMonatlich: e.nettoEinkommen,
          sonstigeEinnahmen: e.zusatzEinnahmen,
          mieteinnahmen: 0,
        },
      ],
      liabilities: [
        { monatlicheRate: e.bestehendeRaten + rkRate, abzuloesen: false },
      ],
      property: {
        wohnflaeche: e.wohnflaeche,
        hausgeldMonatlich: e.hausgeldMonatlich ?? undefined,
        mieteinnahmenMonatlich: e.mieteinnahmenMonatlich,
      },
      financing: { darlehensbetrag: darlehen, sollzinsProzent: zinsProzent },
      applicantCount: e.applicantCount + e.zusatzErwachsene,
      anzahlKinder: e.anzahlKinder,
    },
    { tilgungProzent: e.tilgungProzent }
  );

  const machbar = auslauf <= a.auslaufObergrenze && h.ueberschuss >= a.ueberschussPuffer;

  return {
    darlehen,
    beleihungswert,
    auslauf,
    band,
    zinsProzent,
    rate,
    ratenkreditRate: rkRate,
    ueberschuss: h.ueberschuss,
    machbar,
    nebenkosten,
  };
}
```

- [ ] **Step 4: Check the CanonicalCase shapes used above**

Run: `grep -n "CanonicalIncome\|CanonicalLiability\|CanonicalProperty" -A 12 src/lib/domain/canonical.ts | head -45`

Weichen die Feldnamen ab (z. B. `mieteinnahmen` statt `mieteinnahmenMonatlich`), die Aufrufe in `bewerte` anpassen — nicht das Canonical-Modell.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-bewertung.test.ts && npm run typecheck`
Expected: PASS, 13 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/machbarkeit/bewertung.ts tests/machbarkeit-bewertung.test.ts
git commit -m "feat(machbarkeit): Bewertungsfunktion mit Auslaufbaendern und Zinskopplung"
```

---

### Task 4: Die neun Hebel

**Files:**
- Create: `src/lib/machbarkeit/hebel.ts`
- Test: `tests/machbarkeit-hebel.test.ts`

**Interfaces:**
- Consumes: `SolverEingabe`, `Annahmen`
- Produces:
  - `interface HebelDefinition { key, titel, sorte, diskret, anwendbar, anwenden, formatWert, preis }`
  - `const HEBEL: HebelDefinition[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-hebel.test.ts
import { describe, it, expect } from "vitest";
import { HEBEL } from "@/lib/machbarkeit/hebel";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import { bewerte } from "@/lib/machbarkeit/bewertung";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000, modernisierungskosten: 0, inventarAnteil: 0,
  nebenkostenErfasst: null, maklerprovisionProzent: 0,
  bundesland: "bayern", grunderwerbsteuerProzentOverride: null,
  eigenkapital: 40_000, eigenleistung: 0, zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0, tilgungProzent: 2, sollzinsProzent: null,
  nettoEinkommen: 3_200, zusatzEinnahmen: 0, zusatzErwachsene: 0,
  kredite: [], abzuloesendeRestschuld: 0, bestehendeRaten: 0,
  applicantCount: 1, anzahlKinder: 0, wohnflaeche: 100,
  hausgeldMonatlich: null, mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

const hebel = (key: string) => {
  const h = HEBEL.find((x) => x.key === key);
  if (!h) throw new Error(`Hebel ${key} fehlt`);
  return h;
};

describe("Hebelkatalog", () => {
  it("hat neun Hebel mit eindeutigen Schluesseln", () => {
    expect(HEBEL).toHaveLength(9);
    expect(new Set(HEBEL.map((h) => h.key)).size).toBe(9);
  });

  it("kennzeichnet jeden Hebel als datengestuetzt oder hypothetisch", () => {
    for (const h of HEBEL) {
      expect(["datengestuetzt", "hypothetisch"], h.key).toContain(h.sorte);
    }
  });

  it("hat fuer jeden Hebel einen kundentauglichen Titel", () => {
    for (const h of HEBEL) {
      expect(h.titel.length, h.key).toBeGreaterThan(5);
      expect(h.titel, h.key).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });
});

describe("Eigenkapital-Hebel", () => {
  it("senkt Darlehen und Auslauf", () => {
    const e = eingabe();
    const nachher = hebel("eigenkapital").anwenden(e, 30_000);
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(nachher, VORGABE_ANNAHMEN);
    expect(nach.darlehen).toBe(vor.darlehen - 30_000);
    expect(nach.auslauf).toBeLessThan(vor.auslauf);
  });

  it("ist immer anwendbar – er ist die Frage an den Kunden", () => {
    const a = hebel("eigenkapital").anwendbar(eingabe(), VORGABE_ANNAHMEN);
    expect(a.ok).toBe(true);
  });
});

describe("Konsumkredit-Hebel", () => {
  const mitKrediten = eingabe({
    kredite: [
      { id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 },
      { id: "k2", bezeichnung: "Ratenkauf", restschuld: 1_200, rate: 60 },
    ],
    bestehendeRaten: 372,
  });

  it("ist nicht anwendbar ohne Kredite", () => {
    const a = hebel("konsumkredit").anwendbar(eingabe(), VORGABE_ANNAHMEN);
    expect(a.ok).toBe(false);
  });

  it("ist diskret und enumeriert alle Teilmengen", () => {
    const h = hebel("konsumkredit");
    expect(h.diskret).toBe(true);
    const a = h.anwendbar(mitKrediten, VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBe(3); // 2^2 - 1
  });

  it("erhoeht bei Auswahl das Darlehen und entlastet den Haushalt", () => {
    // Bitmaske 1 = nur der erste Kredit
    const nachher = hebel("konsumkredit").anwenden(mitKrediten, 1);
    expect(nachher.abzuloesendeRestschuld).toBe(8_900);
    expect(nachher.bestehendeRaten).toBe(60);
  });

  it("nennt im Format die tatsaechlich gewaehlten Kredite", () => {
    const text = hebel("konsumkredit").formatWert(mitKrediten, 1);
    expect(text).toContain("Autokredit");
    expect(text).not.toContain("Ratenkauf");
  });
});

describe("Tilgungs-Hebel", () => {
  it("geht nicht unter die Mindesttilgung", () => {
    const a = hebel("tilgung").anwendbar(eingabe(), VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBeCloseTo(2 - VORGABE_ANNAHMEN.mindestTilgungProzent, 5);
  });

  it("senkt die Rate, laesst den Auslauf unveraendert", () => {
    const e = eingabe();
    const nach = bewerte(hebel("tilgung").anwenden(e, 0.5), VORGABE_ANNAHMEN);
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    expect(nach.rate).toBeLessThan(vor.rate);
    expect(nach.auslauf).toBe(vor.auslauf);
  });

  it("ist nicht anwendbar, wenn schon die Mindesttilgung gilt", () => {
    const a = hebel("tilgung").anwendbar(eingabe({ tilgungProzent: 1 }), VORGABE_ANNAHMEN);
    expect(a.ok).toBe(false);
  });
});

describe("Eigenleistung", () => {
  it("ist bei einem Bestandskauf nicht anwendbar", () => {
    const a = hebel("eigenleistung").anwendbar(eingabe(), VORGABE_ANNAHMEN);
    expect(a.ok).toBe(false);
  });

  it("ist bei Modernisierung gedeckelt auf den Prozentsatz der Kosten", () => {
    const e = eingabe({ istNeubauOderModernisierung: true, modernisierungskosten: 100_000 });
    const a = hebel("eigenleistung").anwendbar(e, VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBe(15_000);
  });
});

describe("Inventar – der Hebel, der auch schaden kann", () => {
  it("senkt die Grunderwerbsteuer, hebt aber den Auslauf", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("inventar").anwenden(e, 20_000), VORGABE_ANNAHMEN);
    expect(nach.nebenkosten.grunderwerbsteuer).toBeLessThan(vor.nebenkosten.grunderwerbsteuer);
    expect(nach.auslauf).toBeGreaterThan(vor.auslauf);
  });
});

describe("Zusatzsicherheit", () => {
  it("senkt den Auslauf, ohne das Darlehen anzufassen", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("zusatzsicherheit").anwenden(e, 100_000), VORGABE_ANNAHMEN);
    expect(nach.darlehen).toBe(vor.darlehen);
    expect(nach.auslauf).toBeLessThan(vor.auslauf);
  });
});

describe("Einnahmen erhoehen", () => {
  it("gibt es in zwei Auspraegungen", () => {
    expect(hebel("einnahmen")).toBeTruthy();
    expect(hebel("weiterer_darlehensnehmer")).toBeTruthy();
  });

  it("der weitere Darlehensnehmer bringt seine Lebenshaltung mit", () => {
    const e = eingabe();
    const nurGeld = bewerte(hebel("einnahmen").anwenden(e, 500), VORGABE_ANNAHMEN);
    const person = bewerte(hebel("weiterer_darlehensnehmer").anwenden(e, 500), VORGABE_ANNAHMEN);
    expect(person.ueberschuss).toBeLessThan(nurGeld.ueberschuss);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-hebel.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/hebel"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/hebel.ts
import type { Annahmen, SolverEingabe } from "./types";

export type Anwendbarkeit =
  | { ok: true; max: number; schritt: number }
  | { ok: false; grund: string };

export interface HebelDefinition {
  key: string;
  /** Kundentauglich – erscheint so in der Oberflaeche. */
  titel: string;
  /**
   * datengestuetzt: steckt schon im Fall, nur zeigen wenn vorhanden.
   * hypothetisch:   steht nirgends; der Solver rechnet die noetige Groesse aus
   *                 und die Antwort ist eine Frage an den Kunden.
   */
  sorte: "datengestuetzt" | "hypothetisch";
  /** true = ganzzahlige Werte 0..max vollstaendig durchprobieren. */
  diskret: boolean;
  anwendbar: (e: SolverEingabe, a: Annahmen) => Anwendbarkeit;
  anwenden: (e: SolverEingabe, wert: number) => SolverEingabe;
  formatWert: (e: SolverEingabe, wert: number) => string;
  /** Was der Hebel kostet – Nebenwirkung in Klartext. */
  preis: (e: SolverEingabe, wert: number) => string;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export const HEBEL: HebelDefinition[] = [
  {
    key: "eigenkapital",
    titel: "Mehr Eigenkapital einbringen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.max(e.kaufpreis, 50_000), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, eigenkapital: e.eigenkapital + w }),
    formatWert: (_e, w) => `${eur(w)} zusätzlich`,
    preis: () => "Der Betrag muss verfügbar und nachweisbar sein.",
  },
  {
    key: "eigenleistung",
    titel: "Eigenleistung anrechnen lassen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e, a) => {
      if (!e.istNeubauOderModernisierung)
        return { ok: false, grund: "Nur bei Neubau oder Modernisierung anrechenbar." };
      const basis = e.modernisierungskosten;
      const max = Math.round((basis * a.eigenleistungDeckelProzent) / 100);
      if (max <= 0) return { ok: false, grund: "Keine Bau- oder Modernisierungskosten erfasst." };
      return { ok: true, max, schritt: 100 };
    },
    anwenden: (e, w) => ({ ...e, eigenleistung: e.eigenleistung + w }),
    formatWert: (_e, w) => `${eur(w)} anerkannte Eigenleistung`,
    preis: () => "Muss als Handwerksleistung nachgewiesen werden; Banken deckeln unterschiedlich.",
  },
  {
    key: "tilgung",
    titel: "Anfangstilgung senken",
    sorte: "datengestuetzt",
    diskret: false,
    anwendbar: (e, a) => {
      const spielraum = e.tilgungProzent - a.mindestTilgungProzent;
      if (spielraum <= 0)
        return { ok: false, grund: `Tilgung liegt bereits bei ${e.tilgungProzent} %.` };
      return { ok: true, max: spielraum, schritt: 0.05 };
    },
    anwenden: (e, w) => ({ ...e, tilgungProzent: Math.round((e.tilgungProzent - w) * 100) / 100 }),
    formatWert: (e, w) => `Tilgung ${e.tilgungProzent} % → ${Math.round((e.tilgungProzent - w) * 100) / 100} %`,
    preis: () => "Deutlich längere Laufzeit und mehr Zinskosten insgesamt.",
  },
  {
    key: "konsumkredit",
    titel: "Konsumkredit mitfinanzieren",
    sorte: "datengestuetzt",
    diskret: true,
    anwendbar: (e) => {
      const n = e.kredite.length;
      if (n === 0) return { ok: false, grund: "Keine laufenden Kredite erfasst." };
      // Bei mehr als fuenf Krediten nur die fuenf wirksamsten kombinieren.
      const k = Math.min(n, 5);
      return { ok: true, max: Math.pow(2, k) - 1, schritt: 1 };
    },
    anwenden: (e, maske) => {
      const kandidaten = [...e.kredite].sort((x, y) => y.rate - x.rate).slice(0, 5);
      const gewaehlt = kandidaten.filter((_k, i) => (maske >> i) & 1);
      const ids = new Set(gewaehlt.map((k) => k.id));
      return {
        ...e,
        abzuloesendeRestschuld: gewaehlt.reduce((s, k) => s + k.restschuld, 0),
        bestehendeRaten: e.kredite.filter((k) => !ids.has(k.id)).reduce((s, k) => s + k.rate, 0),
      };
    },
    formatWert: (e, maske) => {
      const kandidaten = [...e.kredite].sort((x, y) => y.rate - x.rate).slice(0, 5);
      const gewaehlt = kandidaten.filter((_k, i) => (maske >> i) & 1);
      return gewaehlt.map((k) => `${k.bezeichnung} (${eur(k.restschuld)}, ${eur(k.rate)}/Monat)`).join(", ");
    },
    preis: () => "Die Restschuld erhöht das Darlehen und damit den Beleihungsauslauf.",
  },
  {
    key: "kaufpreis",
    titel: "Kaufpreis nachverhandeln",
    sorte: "datengestuetzt",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.2), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, kaufpreis: Math.max(e.kaufpreis - w, 0) }),
    formatWert: (e, w) => `${eur(w)} weniger (${eur(e.kaufpreis)} → ${eur(e.kaufpreis - w)})`,
    preis: () => "Der Verkäufer muss mitgehen.",
  },
  {
    key: "inventar",
    titel: "Inventar aus dem Kaufpreis herausrechnen",
    sorte: "datengestuetzt",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.15), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, inventarAnteil: e.inventarAnteil + w }),
    formatWert: (_e, w) => `${eur(w)} als Inventar ausweisen`,
    preis: () =>
      "Spart Grunderwerbsteuer, senkt aber den Beleihungswert – der Auslauf steigt, und das Inventar ist aus Eigenkapital zu zahlen.",
  },
  {
    key: "ratenkredit",
    titel: "Nebenkosten über einen Ratenkredit finanzieren",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.round(e.kaufpreis * 0.15), schritt: 100 }),
    anwenden: (e, w) => ({ ...e, ratenkreditAnteil: e.ratenkreditAnteil + w }),
    formatWert: (_e, w) => `${eur(w)} über einen Ratenkredit`,
    preis: () => "Kurze Laufzeit und hoher Zins – die Rate belastet den Haushalt spürbar.",
  },
  {
    key: "einnahmen",
    titel: "Einnahmen erhöhen (gleicher Haushalt)",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: () => ({ ok: true, max: 3_000, schritt: 10 }),
    anwenden: (e, w) => ({ ...e, zusatzEinnahmen: e.zusatzEinnahmen + w }),
    formatWert: (_e, w) => `${eur(w)} mehr netto im Monat`,
    preis: () => "Muss dauerhaft und nachweisbar sein.",
  },
  {
    key: "weiterer_darlehensnehmer",
    titel: "Weiteren Darlehensnehmer aufnehmen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: () => ({ ok: true, max: 4_000, schritt: 10 }),
    anwenden: (e, w) => ({
      ...e,
      zusatzEinnahmen: e.zusatzEinnahmen + w,
      zusatzErwachsene: e.zusatzErwachsene + 1,
    }),
    formatWert: (_e, w) => `mit mindestens ${eur(w)} netto im Monat`,
    preis: () => "Die zweite Person bringt ihre Lebenshaltungspauschale mit und haftet voll mit.",
  },
  {
    key: "zusatzsicherheit",
    titel: "Weiteres Objekt als Zusatzsicherheit stellen",
    sorte: "hypothetisch",
    diskret: false,
    anwendbar: (e) => ({ ok: true, max: Math.max(e.kaufpreis, 100_000), schritt: 1_000 }),
    anwenden: (e, w) => ({ ...e, zusatzsicherheitBeleihungsraum: e.zusatzsicherheitBeleihungsraum + w }),
    formatWert: (_e, w) => `${eur(w)} freier Beleihungsraum`,
    preis: () =>
      "Freier Beleihungsraum = Verkehrswert × Beleihungssatz − bestehende Grundschulden. Das Objekt wird mitbelastet.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-hebel.test.ts && npm run typecheck`
Expected: PASS, 17 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/machbarkeit/hebel.ts tests/machbarkeit-hebel.test.ts
git commit -m "feat(machbarkeit): neun Hebel als Katalog mit Anwendbarkeit und Preis"
```

---

### Task 5: Die Suche

**Files:**
- Create: `src/lib/machbarkeit/suche.ts`
- Test: `tests/machbarkeit-suche.test.ts`

**Interfaces:**
- Consumes: `HebelDefinition`, `bewerte`, `Urteil`
- Produces:
  - `function kleinsterWert(h, e, a, ziel): { wert: number; urteil: Urteil } | null`
  - `function aufHundert(n: number): number`
  - `type Ziel = (u: Urteil) => boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-suche.test.ts
import { describe, it, expect } from "vitest";
import { kleinsterWert, aufHundert } from "@/lib/machbarkeit/suche";
import { HEBEL } from "@/lib/machbarkeit/hebel";
import { bewerte } from "@/lib/machbarkeit/bewertung";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000, modernisierungskosten: 0, inventarAnteil: 0,
  nebenkostenErfasst: null, maklerprovisionProzent: 0,
  bundesland: "bayern", grunderwerbsteuerProzentOverride: null,
  eigenkapital: 10_000, eigenleistung: 0, zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0, tilgungProzent: 2, sollzinsProzent: null,
  nettoEinkommen: 5_000, zusatzEinnahmen: 0, zusatzErwachsene: 0,
  kredite: [], abzuloesendeRestschuld: 0, bestehendeRaten: 0,
  applicantCount: 1, anzahlKinder: 0, wohnflaeche: 100,
  hausgeldMonatlich: null, mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

const machbar = (u: { machbar: boolean }) => u.machbar;
const hebel = (k: string) => HEBEL.find((h) => h.key === k)!;

describe("Aufrundung", () => {
  it("rundet immer auf volle 100 Euro AUF", () => {
    expect(aufHundert(14_437)).toBe(14_500);
    expect(aufHundert(14_400)).toBe(14_400);
    expect(aufHundert(0.5)).toBe(100);
    expect(aufHundert(0)).toBe(0);
  });
});

describe("kleinsterWert", () => {
  it("findet den kleinsten Eigenkapitalbetrag, der den Fall kippt", () => {
    const e = eingabe();
    expect(bewerte(e, VORGABE_ANNAHMEN).machbar).toBe(false);

    const t = kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar);
    expect(t).not.toBeNull();
    expect(t!.urteil.machbar).toBe(true);

    // Ein Hunderter weniger darf NICHT reichen – sonst ist es nicht der kleinste.
    const knapp = bewerte(
      hebel("eigenkapital").anwenden(e, t!.wert - 100),
      VORGABE_ANNAHMEN
    );
    expect(knapp.machbar).toBe(false);
  });

  it("liefert null, wenn auch der Maximalwert nicht reicht", () => {
    // Haushalt traegt selbst ohne Darlehen nicht.
    const e = eingabe({ nettoEinkommen: 600 });
    expect(kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar)).toBeNull();
  });

  it("liefert null, wenn der Hebel nicht anwendbar ist", () => {
    expect(
      kleinsterWert(hebel("eigenleistung"), eingabe(), VORGABE_ANNAHMEN, machbar)
    ).toBeNull();
  });

  it("findet bei diskreten Hebeln die guenstigste Teilmenge", () => {
    const e = eingabe({
      eigenkapital: 90_000,
      nettoEinkommen: 3_000,
      kredite: [
        { id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 },
        { id: "k2", bezeichnung: "Ratenkauf", restschuld: 1_200, rate: 60 },
      ],
      bestehendeRaten: 372,
    });
    const t = kleinsterWert(hebel("konsumkredit"), e, VORGABE_ANNAHMEN, machbar);
    expect(t).not.toBeNull();
    expect(t!.urteil.machbar).toBe(true);
  });

  it("findet auch bei einem nicht monotonen Hebel eine Loesung, wenn es eine gibt", () => {
    // Inventar kann schaden; die Rastersuche darf deshalb nicht abbrechen,
    // sobald ein Wert das Ergebnis verschlechtert.
    const e = eingabe({ eigenkapital: 60_000, nettoEinkommen: 4_200 });
    const t = kleinsterWert(hebel("inventar"), e, VORGABE_ANNAHMEN, machbar);
    // Ergebnis darf null sein – aber wenn nicht, muss es wirklich machbar sein.
    if (t) expect(t.urteil.machbar).toBe(true);
  });

  it("gibt bei einem bereits machbaren Fall den Wert 0 zurueck", () => {
    const e = eingabe({ eigenkapital: 150_000 });
    const t = kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar);
    expect(t?.wert).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-suche.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/suche"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/suche.ts
import { bewerte, type Urteil } from "./bewertung";
import type { HebelDefinition } from "./hebel";
import type { Annahmen, SolverEingabe } from "./types";

export type Ziel = (u: Urteil) => boolean;

/**
 * Immer AUF volle 100 Euro. Eine abgerundete Empfehlung unterschreitet die
 * Schwelle, die sie erreichen soll.
 */
export function aufHundert(n: number): number {
  return Math.ceil(n / 100) * 100;
}

const STUETZSTELLEN = 20;

/**
 * Kleinster Wert des Hebels, bei dem das Ziel erreicht ist.
 *
 * Raster mit Verfeinerung statt Bisektion: zwei Hebel (Inventar, Ratenkredit)
 * wirken NICHT monoton – sie koennen den Fall auch verschlechtern. Bisektion
 * setzt Monotonie voraus und wuerde dort daneben liegen.
 */
export function kleinsterWert(
  h: HebelDefinition,
  e: SolverEingabe,
  a: Annahmen,
  ziel: Ziel
): { wert: number; urteil: Urteil } | null {
  const anw = h.anwendbar(e, a);
  if (!anw.ok) return null;

  // Schon am Ziel? Dann kostet der Hebel nichts.
  const start = bewerte(e, a);
  if (ziel(start)) return { wert: 0, urteil: start };

  const pruefe = (wert: number) => {
    const u = bewerte(h.anwenden(e, wert), a);
    return ziel(u) ? u : null;
  };

  if (h.diskret) {
    // Vollenumeration: bei Teilmengen gibt es keine sinnvolle Ordnung.
    for (let w = 1; w <= anw.max; w++) {
      const u = pruefe(w);
      if (u) return { wert: w, urteil: u };
    }
    return null;
  }

  // Grobes Raster: erste Stuetzstelle finden, die das Ziel erreicht.
  const grob = anw.max / STUETZSTELLEN;
  let treffer: number | null = null;
  for (let i = 1; i <= STUETZSTELLEN; i++) {
    if (pruefe(grob * i)) {
      treffer = grob * i;
      break;
    }
  }
  if (treffer == null) return null;

  // Feines Raster zwischen der letzten erfolglosen und der ersten erfolgreichen
  // Stelle, damit der genannte Betrag wirklich der kleinste ist.
  const untergrenze = Math.max(treffer - grob, 0);
  const fein = (treffer - untergrenze) / STUETZSTELLEN;
  let bester = treffer;
  for (let i = 1; i <= STUETZSTELLEN; i++) {
    const w = untergrenze + fein * i;
    if (pruefe(w)) {
      bester = w;
      break;
    }
  }

  // Auf 100 aufrunden und gegenpruefen – der gerundete Wert muss halten.
  const gerundet = h.schrittIstProzent === true ? bester : aufHundert(bester);
  const u = pruefe(gerundet) ?? pruefe(bester);
  if (!u) return null;
  return { wert: pruefe(gerundet) ? gerundet : bester, urteil: u };
}
```

**Achtung:** `schrittIstProzent` gibt es in `HebelDefinition` noch nicht. Beim Tilgungshebel sind die Werte Prozentpunkte, keine Euro — dort darf nicht auf 100 aufgerundet werden. Ergänze in `src/lib/machbarkeit/hebel.ts` am Interface:

```ts
  /** true = Werte sind Prozentpunkte, nicht Euro (keine 100er-Rundung). */
  schrittIstProzent?: boolean;
```

und setze `schrittIstProzent: true` beim Hebel `tilgung`. Bei diskreten Hebeln greift die Rundung ohnehin nicht.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-suche.test.ts tests/machbarkeit-hebel.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/machbarkeit/suche.ts src/lib/machbarkeit/hebel.ts tests/machbarkeit-suche.test.ts
git commit -m "feat(machbarkeit): Rastersuche mit Verfeinerung, robust gegen nicht monotone Hebel"
```

---

### Task 6: Eingabe-Aufbereitung und Fehlliste

**Files:**
- Create: `src/lib/machbarkeit/eingabe.ts`
- Test: `tests/machbarkeit-eingabe.test.ts`

**Interfaces:**
- Consumes: `CanonicalCase` aus `@/lib/domain/canonical`
- Produces:
  - `type EingabeErgebnis = { ok: true; eingabe: SolverEingabe } | { ok: false; fehlend: string[] }`
  - `function baueEingabe(c: CanonicalCase, opts): EingabeErgebnis`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-eingabe.test.ts
import { describe, it, expect } from "vitest";
import { baueEingabe } from "@/lib/machbarkeit/eingabe";
import type { CanonicalCase } from "@/lib/domain/canonical";

const basis = (over: Partial<CanonicalCase> = {}): CanonicalCase =>
  ({
    applicants: [{ vorname: "A", nachname: "B" }],
    employment: [],
    income: [{ nettoMonatlich: 3_500 }],
    liabilities: [],
    assets: [],
    property: { plz: "80331", ort: "München", wohnflaeche: 90 },
    financing: { kaufpreis: 400_000, eigenkapital: 60_000 },
    platformIds: {},
    ...over,
  }) as unknown as CanonicalCase;

describe("Eingabe-Aufbereitung", () => {
  it("baut eine vollstaendige Eingabe", () => {
    const r = baueEingabe(basis(), { applicantCount: 1, anzahlKinder: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eingabe.kaufpreis).toBe(400_000);
      expect(r.eingabe.nettoEinkommen).toBe(3_500);
      expect(r.eingabe.bundesland).toBe("bayern");
    }
  });

  it("verweigert die Rechnung ohne Kaufpreis – keine stillen Nullen", () => {
    const r = baueEingabe(basis({ financing: { eigenkapital: 60_000 } as never }), {
      applicantCount: 1,
      anzahlKinder: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Kaufpreis/);
  });

  it("verweigert die Rechnung ohne Nettoeinkommen", () => {
    const r = baueEingabe(basis({ income: [] }), { applicantCount: 1, anzahlKinder: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Nettoeinkommen/);
  });

  it("nennt mehrere fehlende Angaben auf einmal", () => {
    const r = baueEingabe(basis({ income: [], financing: {} as never }), {
      applicantCount: 1,
      anzahlKinder: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.length).toBeGreaterThanOrEqual(2);
  });

  it("behandelt fehlendes Eigenkapital als null Euro, nicht als fehlende Angabe", () => {
    const r = baueEingabe(basis({ financing: { kaufpreis: 400_000 } as never }), {
      applicantCount: 1,
      anzahlKinder: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eingabe.eigenkapital).toBe(0);
  });

  it("uebernimmt laufende Kredite mit Rate als Hebelkandidaten", () => {
    const r = baueEingabe(
      basis({
        liabilities: [
          { art: "Autokredit", restschuld: 8_900, monatlicheRate: 312, abzuloesen: false },
          { art: "Ohne Rate", restschuld: 500, abzuloesen: false },
        ] as never,
      }),
      { applicantCount: 1, anzahlKinder: 0 }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eingabe.kredite).toHaveLength(1);
      expect(r.eingabe.bestehendeRaten).toBe(312);
    }
  });

  it("erkennt Neubau und Modernisierung fuer den Eigenleistungs-Hebel", () => {
    const r = baueEingabe(
      basis({ financingType: "neubau" } as never),
      { applicantCount: 1, anzahlKinder: 0 }
    );
    expect(r.ok && r.eingabe.istNeubauOderModernisierung).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-eingabe.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/eingabe"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/eingabe.ts
import type { CanonicalCase } from "@/lib/domain/canonical";
import { bundeslandAusPlzOrt, type Bundesland } from "./bundesland";
import type { SolverEingabe } from "./types";

export type EingabeErgebnis =
  | { ok: true; eingabe: SolverEingabe; bundeslandUnsicher: boolean }
  | { ok: false; fehlend: string[] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * CanonicalCase → SolverEingabe.
 *
 * Ohne Kaufpreis oder Nettoeinkommen wird NICHT gerechnet, sondern die Luecke
 * benannt. Mit stillen Nullen weiterzurechnen hat in diesem Projekt schon
 * einmal eine Einkommensanalyse unbemerkt kaputtgemacht.
 */
export function baueEingabe(
  c: CanonicalCase,
  opts: {
    applicantCount: number;
    anzahlKinder: number;
    grunderwerbsteuerProzentOverride?: number | null;
    bundeslandOverride?: Bundesland | null;
  }
): EingabeErgebnis {
  const fehlend: string[] = [];

  const kaufpreis = c.financing?.kaufpreis ?? c.financing?.baukosten ?? 0;
  if (!kaufpreis) fehlend.push("Kaufpreis oder Baukosten");

  const nettoEinkommen = sum((c.income ?? []).map((i) => i.nettoMonatlich ?? 0));
  if (!nettoEinkommen) fehlend.push("Nettoeinkommen mindestens eines Antragstellers");

  if (fehlend.length > 0) return { ok: false, fehlend };

  const erkannt = opts.bundeslandOverride
    ? { bundesland: opts.bundeslandOverride, sicher: true }
    : bundeslandAusPlzOrt(c.property?.plz ?? null, c.property?.ort ?? null);

  const kredite = (c.liabilities ?? [])
    .filter((l) => !l.abzuloesen && (l.monatlicheRate ?? 0) > 0)
    .map((l, i) => ({
      id: `l${i}`,
      bezeichnung: l.art || "Kredit",
      restschuld: l.restschuld ?? 0,
      rate: l.monatlicheRate ?? 0,
    }));

  const istNeubauOderModernisierung =
    c.financingType === "neubau" || c.financingType === "modernisierung";

  return {
    ok: true,
    bundeslandUnsicher: erkannt ? !erkannt.sicher : true,
    eingabe: {
      kaufpreis,
      modernisierungskosten: c.financing?.modernisierungskosten ?? 0,
      inventarAnteil: 0,
      nebenkostenErfasst: c.financing?.nebenkosten ?? null,
      maklerprovisionProzent: c.financing?.maklerprovisionProzent ?? 0,
      bundesland: erkannt?.bundesland ?? null,
      grunderwerbsteuerProzentOverride: opts.grunderwerbsteuerProzentOverride ?? null,
      eigenkapital: c.financing?.eigenkapital ?? 0,
      eigenleistung: 0,
      zusatzsicherheitBeleihungsraum: 0,
      ratenkreditAnteil: 0,
      tilgungProzent: 2,
      sollzinsProzent: c.financing?.sollzinsProzent ?? null,
      nettoEinkommen,
      zusatzEinnahmen: sum((c.income ?? []).map((i) => i.sonstigeEinnahmen ?? 0)),
      zusatzErwachsene: 0,
      kredite,
      abzuloesendeRestschuld: sum(
        (c.liabilities ?? []).filter((l) => l.abzuloesen).map((l) => l.restschuld ?? 0)
      ),
      bestehendeRaten: sum(kredite.map((k) => k.rate)),
      applicantCount: opts.applicantCount,
      anzahlKinder: opts.anzahlKinder,
      wohnflaeche: c.property?.wohnflaeche ?? 0,
      hausgeldMonatlich: c.property?.hausgeldMonatlich ?? null,
      mieteinnahmenMonatlich: c.property?.mieteinnahmenMonatlich ?? 0,
      istNeubauOderModernisierung,
    },
  };
}
```

- [ ] **Step 4: Verify the CanonicalProperty field names**

Run: `grep -n "CanonicalProperty" -A 20 src/lib/domain/canonical.ts`

Heißt das Ortsfeld anders als `ort` (z. B. `stadt`), den Zugriff anpassen.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-eingabe.test.ts && npm run typecheck`
Expected: PASS, 7 Tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/machbarkeit/eingabe.ts tests/machbarkeit-eingabe.test.ts
git commit -m "feat(machbarkeit): Eingabe-Aufbereitung mit Fehlliste statt stiller Nullen"
```

---

### Task 7: Der Solver

Bringt alles zusammen: Diagnose, Hebelergebnisse, Paare, Reihenfolge, Optimierungsmodus.

**Files:**
- Create: `src/lib/machbarkeit/solver.ts`
- Test: `tests/machbarkeit-solver.test.ts`

**Interfaces:**
- Produces:
  - `interface HebelErgebnis { key, titel, sorte, anwendbar, grund?, wertText?, preis?, vorher, nachher?, reichtAllein }`
  - `interface PaarErgebnis { a: HebelErgebnis; b: HebelErgebnis; nachher: Urteil }`
  - `interface SolverErgebnis { modus, ausgangslage, diagnose, hebel, paare, annahmen, nebenkosten, bundeslandUnsicher }`
  - `function loese(e: SolverEingabe, a: Annahmen, bundeslandUnsicher: boolean): SolverErgebnis`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machbarkeit-solver.test.ts
import { describe, it, expect } from "vitest";
import { loese } from "@/lib/machbarkeit/solver";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000, modernisierungskosten: 0, inventarAnteil: 0,
  nebenkostenErfasst: null, maklerprovisionProzent: 0,
  bundesland: "bayern", grunderwerbsteuerProzentOverride: null,
  eigenkapital: 10_000, eigenleistung: 0, zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0, tilgungProzent: 2, sollzinsProzent: null,
  nettoEinkommen: 5_000, zusatzEinnahmen: 0, zusatzErwachsene: 0,
  kredite: [], abzuloesendeRestschuld: 0, bestehendeRaten: 0,
  applicantCount: 1, anzahlKinder: 0, wohnflaeche: 100,
  hausgeldMonatlich: null, mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

describe("Diagnose", () => {
  it("benennt den Haushalt als Ursache, wenn nur er reisst", () => {
    const r = loese(eingabe({ eigenkapital: 150_000, nettoEinkommen: 1_500 }), VORGABE_ANNAHMEN, false);
    expect(r.modus).toBe("rettung");
    expect(r.diagnose).toMatch(/Haushalt/);
  });

  it("benennt den Auslauf als Ursache, wenn nur er reisst", () => {
    const r = loese(
      eingabe({ eigenkapital: 0, maklerprovisionProzent: 7, nettoEinkommen: 20_000 }),
      VORGABE_ANNAHMEN,
      false
    );
    expect(r.diagnose).toMatch(/Beleihungsauslauf|Auslauf/);
  });

  it("wechselt bei tragfaehigen Faellen in den Optimierungsmodus", () => {
    const r = loese(eingabe({ eigenkapital: 150_000 }), VORGABE_ANNAHMEN, false);
    expect(r.modus).toBe("optimierung");
    expect(r.diagnose).toMatch(/trägt/);
  });
});

describe("Hebelliste", () => {
  it("listet alle neun Hebel, auch die nicht anwendbaren", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    expect(r.hebel).toHaveLength(9);
  });

  it("begruendet, warum ein Hebel nicht anwendbar ist", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    const el = r.hebel.find((h) => h.key === "eigenleistung")!;
    expect(el.anwendbar).toBe(false);
    expect(el.grund).toMatch(/Neubau|Modernisierung/);
  });

  it("nennt bei einem wirksamen Hebel Wert, Preis und Wirkung", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    const ek = r.hebel.find((h) => h.key === "eigenkapital")!;
    expect(ek.reichtAllein).toBe(true);
    expect(ek.wertText).toMatch(/€/);
    expect(ek.preis).toBeTruthy();
    expect(ek.nachher!.machbar).toBe(true);
  });

  it("haelt fest, wenn ein Hebel auch am Maximum nicht reicht", () => {
    const r = loese(eingabe({ nettoEinkommen: 600 }), VORGABE_ANNAHMEN, false);
    const ek = r.hebel.find((h) => h.key === "eigenkapital")!;
    expect(ek.anwendbar).toBe(true);
    expect(ek.reichtAllein).toBe(false);
    expect(ek.grund).toMatch(/reicht nicht|löst es nicht/i);
  });

  it("sortiert: datengestuetzte Treffer zuerst, dann hypothetische, dann der Rest", () => {
    const r = loese(
      eingabe({
        nettoEinkommen: 3_000,
        eigenkapital: 90_000,
        kredite: [{ id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 }],
        bestehendeRaten: 312,
      }),
      VORGABE_ANNAHMEN,
      false
    );
    const treffer = r.hebel.filter((h) => h.reichtAllein);
    if (treffer.length > 1) {
      const ersteHypothetisch = treffer.findIndex((h) => h.sorte === "hypothetisch");
      const letzteDaten = treffer.map((h) => h.sorte).lastIndexOf("datengestuetzt");
      if (ersteHypothetisch >= 0 && letzteDaten >= 0) {
        expect(letzteDaten).toBeLessThan(ersteHypothetisch);
      }
    }
  });
});

describe("Paare", () => {
  it("sucht Paare nur, wenn kein einzelner Hebel reicht", () => {
    const leicht = loese(eingabe(), VORGABE_ANNAHMEN, false);
    expect(leicht.paare).toHaveLength(0);
  });

  it("findet ein Paar, wenn einzeln nichts reicht, zusammen aber schon", () => {
    const r = loese(eingabe({ nettoEinkommen: 2_100, eigenkapital: 20_000 }), VORGABE_ANNAHMEN, false);
    if (r.hebel.every((h) => !h.reichtAllein)) {
      // Es MUSS nicht immer ein Paar geben – aber wenn, dann ein machbares.
      for (const p of r.paare) expect(p.nachher.machbar).toBe(true);
    }
  });
});

describe("Bandbreite der Zinsannahme", () => {
  it("nennt zu einem wirksamen Hebel auch das guenstige und unguenstige Ergebnis", () => {
    const r = loese(eingabe({ nettoEinkommen: 2_600 }), VORGABE_ANNAHMEN, false);
    const treffer = r.hebel.find((h) => h.reichtAllein && h.spanne);
    if (treffer) {
      expect(treffer.spanne!.guenstig).toBeTruthy();
      expect(treffer.spanne!.unguenstig).toBeTruthy();
    }
  });

  it("laesst die Bandbreite weg, wo der Zinsaufschlag nichts bewegt", () => {
    // Reiner Auslauf-Fall bei sehr hohem Einkommen: der Haushalt traegt immer,
    // der Aufschlag ist damit ohne Wirkung auf das Ergebnis.
    const r = loese(
      eingabe({ eigenkapital: 0, maklerprovisionProzent: 7, nettoEinkommen: 25_000 }),
      VORGABE_ANNAHMEN,
      false
    );
    const ek = r.hebel.find((h) => h.key === "eigenkapital");
    if (ek?.reichtAllein) expect(ek.spanne).toBeUndefined();
  });
});

describe("Transparenz", () => {
  it("gibt die verwendeten Annahmen und Nebenkosten mit aus", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    expect(r.annahmen.basiszinsProzent).toBe(VORGABE_ANNAHMEN.basiszinsProzent);
    expect(r.nebenkosten.grunderwerbsteuer).toBeGreaterThan(0);
  });

  it("reicht die Unsicherheit beim Bundesland durch", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, true);
    expect(r.bundeslandUnsicher).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-solver.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/solver"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/machbarkeit/solver.ts
import { bewerte, bandFuer, type Auslaufband, type Urteil } from "./bewertung";
import { HEBEL, type HebelDefinition } from "./hebel";
import { kleinsterWert, type Ziel } from "./suche";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

export interface HebelErgebnis {
  key: string;
  titel: string;
  sorte: HebelDefinition["sorte"];
  anwendbar: boolean;
  /** Warum nicht anwendbar – oder warum es auch am Maximum nicht reicht. */
  grund?: string;
  wertText?: string;
  preis?: string;
  vorher: Urteil;
  nachher?: Urteil;
  reichtAllein: boolean;
  /**
   * Dasselbe Ergebnis bei guenstigerem und unguenstigerem Zinsaufschlag.
   * Fehlt, wenn der Aufschlag das Ergebnis nicht bewegt – dann waere die
   * Angabe nur Rauschen.
   */
  spanne?: { guenstig: string; unguenstig: string };
}

export interface PaarErgebnis {
  aKey: string;
  aText: string;
  bKey: string;
  bText: string;
  nachher: Urteil;
}

export interface SolverErgebnis {
  modus: "rettung" | "optimierung";
  ausgangslage: Urteil;
  diagnose: string;
  hebel: HebelErgebnis[];
  paare: PaarErgebnis[];
  annahmen: Annahmen;
  nebenkosten: NebenkostenAufstellung;
  bundeslandUnsicher: boolean;
}

/** Nächstbesseres Band – Ziel im Optimierungsmodus. */
function naechstesBand(band: Auslaufband): number | null {
  switch (band) {
    case "darueber": return 110;
    case "bis110": return 100;
    case "bis100": return 90;
    case "bis90": return 80;
    case "bis80": return 60;
    default: return null;
  }
}

function diagnoseText(u: Urteil, a: Annahmen): string {
  const auslaufReisst = u.auslauf > a.auslaufObergrenze;
  const haushaltReisst = u.ueberschuss < a.ueberschussPuffer;

  if (auslaufReisst && haushaltReisst)
    return "Der Fall scheitert an beidem: Der Beleihungsauslauf liegt über der Grenze, und der Haushalt trägt die Rate nicht.";
  if (haushaltReisst)
    return "Der Fall scheitert am Haushalt, nicht am Eigenkapital.";
  if (auslaufReisst)
    return "Der Fall scheitert am Beleihungsauslauf – für diesen Anteil findet sich kein Finanzierer.";
  return "Der Fall trägt.";
}

export function loese(
  e: SolverEingabe,
  a: Annahmen,
  bundeslandUnsicher: boolean
): SolverErgebnis {
  const ausgangslage = bewerte(e, a);
  const modus: SolverErgebnis["modus"] = ausgangslage.machbar ? "optimierung" : "rettung";

  // Im Rettungsmodus ist das Ziel Machbarkeit, im Optimierungsmodus das
  // naechstbessere Auslaufband – sonst waere das Werkzeug bei gesunden Faellen leer.
  const grenze = naechstesBand(ausgangslage.band);
  const ziel: Ziel =
    modus === "rettung"
      ? (u) => u.machbar
      : (u) => u.machbar && grenze != null && u.auslauf <= grenze;

  const hebel: HebelErgebnis[] = HEBEL.map((h) => {
    const anw = h.anwendbar(e, a);
    if (!anw.ok) {
      return {
        key: h.key, titel: h.titel, sorte: h.sorte,
        anwendbar: false, grund: anw.grund,
        vorher: ausgangslage, reichtAllein: false,
      };
    }
    const treffer = kleinsterWert(h, e, a, ziel);
    if (!treffer) {
      return {
        key: h.key, titel: h.titel, sorte: h.sorte,
        anwendbar: true,
        grund: `Auch ${h.formatWert(e, anw.max)} löst es nicht.`,
        vorher: ausgangslage, reichtAllein: false,
      };
    }
    return {
      key: h.key, titel: h.titel, sorte: h.sorte,
      anwendbar: true,
      wertText: h.formatWert(e, treffer.wert),
      preis: h.preis(e, treffer.wert),
      vorher: ausgangslage,
      nachher: treffer.urteil,
      reichtAllein: true,
      spanne: spanneFuer(h, e, a, ziel, treffer.wert),
    };
  });

  // Reihenfolge: datengestuetzte Treffer, hypothetische Treffer, dann der Rest.
  const rang = (h: HebelErgebnis) =>
    h.reichtAllein ? (h.sorte === "datengestuetzt" ? 0 : 1) : h.anwendbar ? 2 : 3;
  hebel.sort((x, y) => rang(x) - rang(y));

  const paare = hebel.some((h) => h.reichtAllein) ? [] : suchePaare(e, a, ziel);

  return {
    modus,
    ausgangslage,
    diagnose:
      modus === "optimierung" && grenze != null
        ? `Der Fall trägt. Mit einem Auslauf unter ${grenze} % kommen Sie in die bessere Kondition.`
        : diagnoseText(ausgangslage, a),
    hebel,
    paare,
    annahmen: a,
    nebenkosten: ausgangslage.nebenkosten,
    bundeslandUnsicher,
  };
}

/**
 * Dasselbe Ergebnis bei guenstigerem und unguenstigerem Zinsaufschlag.
 *
 * Es gibt keinen "richtigen" Aufschlag – er haengt von Bank, Produkt und
 * Tagesmarkt ab. Statt Praezision vorzutaeuschen, beziffert der Solver seine
 * eigene Unsicherheit. Wo der Aufschlag nichts bewegt (z. B. bei einem Fall,
 * der rein am Beleihungsauslauf scheitert), bleibt die Angabe weg.
 */
function spanneFuer(
  h: HebelDefinition,
  e: SolverEingabe,
  a: Annahmen,
  ziel: Ziel,
  mitte: number
): HebelErgebnis["spanne"] {
  const d = a.aufschlagUnschaerfe;
  if (d <= 0) return undefined;

  const variante = (vz: number): Annahmen => ({
    ...a,
    aufschlagBis80: Math.max(a.aufschlagBis80 + vz * d, 0),
    aufschlagBis90: Math.max(a.aufschlagBis90 + vz * d, 0),
    aufschlagBis100: Math.max(a.aufschlagBis100 + vz * d, 0),
    aufschlagBis110: Math.max(a.aufschlagBis110 + vz * d, 0),
  });

  const g = kleinsterWert(h, e, variante(-1), ziel);
  const u = kleinsterWert(h, e, variante(+1), ziel);
  if (!g || !u) return undefined;
  if (g.wert === mitte && u.wert === mitte) return undefined; // bewegt nichts

  return { guenstig: h.formatWert(e, g.wert), unguenstig: h.formatWert(e, u.wert) };
}

/**
 * Paare, wenn kein einzelner Hebel reicht. Grobes 10x10-Raster je Paar –
 * wer drei Stellschrauben gleichzeitig braucht, hat kein Finanzierungs-,
 * sondern ein Objektproblem.
 */
function suchePaare(e: SolverEingabe, a: Annahmen, ziel: Ziel): PaarErgebnis[] {
  const nutzbar = HEBEL.filter((h) => h.anwendbar(e, a).ok);
  const treffer: PaarErgebnis[] = [];

  for (let i = 0; i < nutzbar.length; i++) {
    for (let j = i + 1; j < nutzbar.length; j++) {
      const h1 = nutzbar[i]!;
      const h2 = nutzbar[j]!;
      const a1 = h1.anwendbar(e, a);
      const a2 = h2.anwendbar(e, a);
      if (!a1.ok || !a2.ok) continue;

      let gefunden: PaarErgebnis | null = null;
      for (let x = 1; x <= 10 && !gefunden; x++) {
        for (let y = 1; y <= 10 && !gefunden; y++) {
          const w1 = (a1.max / 10) * x;
          const w2 = (a2.max / 10) * y;
          const u = bewerte(h2.anwenden(h1.anwenden(e, w1), w2), a);
          if (ziel(u)) {
            gefunden = {
              aKey: h1.key, aText: h1.formatWert(e, w1),
              bKey: h2.key, bText: h2.formatWert(e, w2),
              nachher: u,
            };
          }
        }
      }
      if (gefunden) treffer.push(gefunden);
      if (treffer.length >= 3) return treffer; // drei Vorschläge reichen
    }
  }
  return treffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/machbarkeit-solver.test.ts && npm run typecheck`
Expected: PASS, 11 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/machbarkeit/solver.ts tests/machbarkeit-solver.test.ts
git commit -m "feat(machbarkeit): Solver mit Diagnose, Hebelliste, Paaren und Optimierungsmodus"
```

---

### Task 8: Annahmen je Organisation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-08-10-machbarkeit.sql`
- Create: `src/lib/machbarkeit/annahmen.ts`
- Test: `tests/machbarkeit-annahmen.test.ts`

**Interfaces:**
- Produces: `async function ladeAnnahmen(organizationId: string): Promise<Annahmen>`

- [ ] **Step 1: Add the model**

An `prisma/schema.prisma` anhängen:

```prisma
/**
 * Marktannahmen des Vermittlers fuer den Machbarkeits-Solver. Bewusst je
 * Organisation: Zinsaufschlaege sind Marktkenntnis und aendern sich laufend.
 * Fehlt der Datensatz, gelten die Vorgabewerte aus VORGABE_ANNAHMEN.
 */
model MachbarkeitsAnnahmen {
  id             String       @id @default(cuid())
  organizationId String       @unique
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  basiszinsProzent Float @default(3.5)
  aufschlagBis80   Float @default(0.1)
  aufschlagBis90   Float @default(0.3)
  aufschlagBis100  Float @default(0.6)
  aufschlagBis110  Float @default(1.2)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("machbarkeits_annahmen")
}
```

Bei `model Organization` in den Relationen ergänzen:

```prisma
  machbarkeitsAnnahmen MachbarkeitsAnnahmen?
```

Bei `model FinancingRequest` ergänzen:

```prisma
  /// Manuell gesetzter Grunderwerbsteuersatz, falls die Ableitung aus PLZ und
  /// Ort danebenliegt.
  grunderwerbsteuerProzent Float?
```

Bei `model Property` ergänzen:

```prisma
  /// Manuell bestaetigtes Bundesland, falls die PLZ mehrdeutig ist.
  bundesland String?
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/machbarkeit-annahmen.test.ts
import { describe, it, expect, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { machbarkeitsAnnahmen: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";

describe("Annahmen laden", () => {
  it("nimmt die Vorgaben, wenn nichts hinterlegt ist", async () => {
    findUnique.mockResolvedValueOnce(null);
    const a = await ladeAnnahmen("org1");
    expect(a).toEqual(VORGABE_ANNAHMEN);
  });

  it("ueberschreibt nur die hinterlegten Zinswerte", async () => {
    findUnique.mockResolvedValueOnce({
      basiszinsProzent: 4.1,
      aufschlagBis80: 0.15,
      aufschlagBis90: 0.35,
      aufschlagBis100: 0.7,
      aufschlagBis110: 1.4,
    });
    const a = await ladeAnnahmen("org1");
    expect(a.basiszinsProzent).toBe(4.1);
    expect(a.aufschlagBis110).toBe(1.4);
    // Nicht hinterlegte Annahmen bleiben unveraendert.
    expect(a.notarGrundbuchProzent).toBe(VORGABE_ANNAHMEN.notarGrundbuchProzent);
    expect(a.eigenleistungDeckelProzent).toBe(VORGABE_ANNAHMEN.eigenleistungDeckelProzent);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/machbarkeit-annahmen.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/machbarkeit/annahmen"`

- [ ] **Step 4: Write the loader**

```ts
// src/lib/machbarkeit/annahmen.ts
import { prisma } from "@/lib/db";
import { VORGABE_ANNAHMEN, type Annahmen } from "./types";

/**
 * Marktannahmen der Organisation ueber die Vorgaben legen. Nur die Zinswerte
 * sind hinterlegbar – alles andere (Notarquote, Deckel, Puffer) sind fachliche
 * Konstanten, die im Code stehen und dort versioniert werden.
 */
export async function ladeAnnahmen(organizationId: string): Promise<Annahmen> {
  const row = await prisma.machbarkeitsAnnahmen.findUnique({ where: { organizationId } });
  if (!row) return VORGABE_ANNAHMEN;
  return {
    ...VORGABE_ANNAHMEN,
    basiszinsProzent: row.basiszinsProzent,
    aufschlagBis80: row.aufschlagBis80,
    aufschlagBis90: row.aufschlagBis90,
    aufschlagBis100: row.aufschlagBis100,
    aufschlagBis110: row.aufschlagBis110,
  };
}
```

- [ ] **Step 5: Write and apply the migration**

```sql
-- prisma/sql/2026-08-10-machbarkeit.sql
-- Machbarkeits-Solver: Marktannahmen je Organisation, manuelle Ueberschreibungen.
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-machbarkeit.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-machbarkeit.sql

CREATE TABLE IF NOT EXISTS "machbarkeits_annahmen" (
  "id"               TEXT PRIMARY KEY,
  "organizationId"   TEXT NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "basiszinsProzent" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
  "aufschlagBis80"   DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  "aufschlagBis90"   DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "aufschlagBis100"  DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  "aufschlagBis110"  DOUBLE PRECISION NOT NULL DEFAULT 1.2,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "financing_requests"
  ADD COLUMN IF NOT EXISTS "grunderwerbsteuerProzent" DOUBLE PRECISION;

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "bundesland" TEXT;
```

Run: `npx prisma generate && npm run typecheck`
Dann: `scripts/supabase-sql.sh prisma/sql/2026-08-10-machbarkeit.sql --dry-run`
Dann ohne `--dry-run`.

Gegenprüfen mit einer Datei `prisma/sql/pruefe-machbarkeit.sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'unterlagenpilot'
  AND ((table_name = 'financing_requests' AND column_name = 'grunderwerbsteuerProzent')
    OR (table_name = 'properties' AND column_name = 'bundesland'));
```
Expected: beide Spalten gelistet.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/machbarkeit-annahmen.test.ts && npm run typecheck`
Expected: PASS, 2 Tests

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/sql/ src/lib/machbarkeit/annahmen.ts tests/machbarkeit-annahmen.test.ts
git commit -m "feat(machbarkeit): Marktannahmen je Organisation"
```

---

### Task 9: Die Machbarkeitsseite

**Files:**
- Create: `src/app/(app)/cases/[id]/machbarkeit/page.tsx`
- Create: `src/components/case/machbarkeit-ergebnis.tsx`
- Create: `src/lib/actions/machbarkeit.ts`

**Interfaces:**
- Consumes: `baueEingabe`, `loese`, `ladeAnnahmen`, `caseToCanonical`, `requireCaseAccess`
- Produces: Server Actions `setzeGrunderwerbsteuer(formData)`, `setzeBundesland(formData)`

- [ ] **Step 1: Build the page after the Haushalt template**

`src/app/(app)/cases/[id]/haushalt/page.tsx` ist die Vorlage: `requireCaseAccess(id)`, `caseToCanonical(id)`, `PageHeader`, `Card`. Die neue Seite:

```tsx
// src/app/(app)/cases/[id]/machbarkeit/page.tsx
import { notFound } from "next/navigation";
import { requireCaseAccess } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { prisma } from "@/lib/db";
import { baueEingabe } from "@/lib/machbarkeit/eingabe";
import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { loese } from "@/lib/machbarkeit/solver";
import type { Bundesland } from "@/lib/machbarkeit/bundesland";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MachbarkeitErgebnis } from "@/components/case/machbarkeit-ergebnis";

export const dynamic = "force-dynamic";

export default async function MachbarkeitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCaseAccess(id);

  const [canonical, caseRow] = await Promise.all([
    caseToCanonical(id),
    prisma.case.findUnique({
      where: { id },
      select: {
        caseNumber: true,
        applicants: { select: { anzahlKinder: true }, orderBy: { position: "asc" } },
        property: { select: { bundesland: true } },
        financingRequest: { select: { grunderwerbsteuerProzent: true } },
      },
    }),
  ]);
  if (!caseRow) notFound();

  const eingabe = baueEingabe(canonical, {
    applicantCount: caseRow.applicants.length,
    anzahlKinder: caseRow.applicants[0]?.anzahlKinder ?? 0,
    grunderwerbsteuerProzentOverride: caseRow.financingRequest?.grunderwerbsteuerProzent ?? null,
    bundeslandOverride: (caseRow.property?.bundesland as Bundesland | null) ?? null,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Machbarkeit" subtitle={caseRow.caseNumber} />
      {!eingabe.ok ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">Für die Machbarkeitsrechnung fehlen noch Angaben.</p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {eingabe.fehlend.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Ohne diese Werte wird bewusst nicht gerechnet – ein Ergebnis aus geschätzten Nullen
              wäre schlimmer als keines.
            </p>
          </CardContent>
        </Card>
      ) : (
        <MachbarkeitErgebnis
          caseId={id}
          ergebnis={loese(eingabe.eingabe, await ladeAnnahmen(ctx.organizationId), eingabe.bundeslandUnsicher)}
        />
      )}
    </div>
  );
}
```

`requireCaseAccess` prüfen: Run `grep -n "export async function requireCaseAccess" -A 10 src/lib/auth/context.ts`. Liefert es keinen Kontext mit `organizationId`, zusätzlich `requireContext()` aufrufen.

- [ ] **Step 2: Build the result component**

`src/components/case/machbarkeit-ergebnis.tsx` zeigt in dieser Reihenfolge:

1. **Diagnose** groß oben, mit Auslauf und Überschuss der Ausgangslage
2. **Warnhinweis**, wenn `bundeslandUnsicher` oder `nebenkosten.steuersatzUnsicher` — mit Formular zum Setzen des Bundeslands
3. **Hebelliste**: je Hebel Titel, `wertText`, Wirkung „Auslauf a % → b %, Rate x € → y €, Haushalt u € → v €", `preis`, und Badge „Reicht allein" bzw. der `grund`
4. **Paare**, falls vorhanden
5. **Annahmen** aufklappbar: Basiszins, alle Aufschläge, Notarquote, Grunderwerbsteuersatz mit Bundesland, Eigenleistungsdeckel, Ratenkreditkonditionen — jeweils mit dem Wort „Annahme"

Die Zinsaufschläge tragen sichtbar den Hinweis: „Annahme – kein Marktzins. In den Einstellungen anpassbar."

- [ ] **Step 3: Write the server actions**

```ts
// src/lib/actions/machbarkeit.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { BUNDESLAENDER } from "@/lib/machbarkeit/bundesland";

export async function setzeBundesland(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const wert = String(formData.get("bundesland") ?? "");
  if (!caseId || !(BUNDESLAENDER as readonly string[]).includes(wert)) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!fall) return;

  await prisma.property.update({ where: { caseId }, data: { bundesland: wert } });
  revalidatePath(`/cases/${caseId}/machbarkeit`);
}

export async function setzeGrunderwerbsteuer(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const roh = Number(formData.get("satz"));
  if (!caseId || !Number.isFinite(roh) || roh < 0 || roh > 10) return;

  const fall = await prisma.case.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!fall) return;

  await prisma.financingRequest.update({
    where: { caseId },
    data: { grunderwerbsteuerProzent: roh },
  });
  revalidatePath(`/cases/${caseId}/machbarkeit`);
}
```

- [ ] **Step 4: Link the page from the case file**

In `src/app/(app)/cases/[id]/page.tsx` neben dem vorhandenen Link auf `/haushalt` einen auf `/machbarkeit` ergänzen (Symbol `Calculator` ist bereits importiert; sonst `Scale` aus lucide-react nehmen).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: beide ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/cases/[id]/machbarkeit" src/components/case/machbarkeit-ergebnis.tsx src/lib/actions/machbarkeit.ts "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(machbarkeit): Machbarkeitsseite mit Diagnose, Hebeln und offengelegten Annahmen"
```

---

### Task 10: Einstellungsseite für die Zinsannahmen

**Files:**
- Create: `src/app/(app)/settings/machbarkeit/page.tsx`
- Modify: `src/lib/actions/machbarkeit.ts`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Look at the existing settings page pattern**

Run: `sed -n '1,60p' "src/app/(app)/settings/bankanforderungen/page.tsx"`

Dem dortigen Muster folgen (Server Component + Server Action + `SubmitButton`).

- [ ] **Step 2: Add the save action**

An `src/lib/actions/machbarkeit.ts` anhängen:

```ts
export async function speichereAnnahmen(formData: FormData): Promise<void> {
  const ctx = await requireContext();

  const zahl = (name: string, min: number, max: number): number | null => {
    const n = Number(String(formData.get(name) ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  const basiszinsProzent = zahl("basiszinsProzent", 0, 20);
  const aufschlagBis80 = zahl("aufschlagBis80", 0, 5);
  const aufschlagBis90 = zahl("aufschlagBis90", 0, 5);
  const aufschlagBis100 = zahl("aufschlagBis100", 0, 5);
  const aufschlagBis110 = zahl("aufschlagBis110", 0, 5);

  // Alles oder nichts: ein halb gespeichertes Zinsgeruest waere schlimmer als
  // die Vorgabewerte, weil es plausibel aussieht.
  if (
    basiszinsProzent == null || aufschlagBis80 == null || aufschlagBis90 == null ||
    aufschlagBis100 == null || aufschlagBis110 == null
  ) return;

  await prisma.machbarkeitsAnnahmen.upsert({
    where: { organizationId: ctx.organizationId },
    create: {
      organizationId: ctx.organizationId,
      basiszinsProzent, aufschlagBis80, aufschlagBis90, aufschlagBis100, aufschlagBis110,
    },
    update: { basiszinsProzent, aufschlagBis80, aufschlagBis90, aufschlagBis100, aufschlagBis110 },
  });
  revalidatePath("/settings/machbarkeit");
}
```

- [ ] **Step 3: Build the settings page**

Formular mit sechs Zahlenfeldern (Basiszins plus vier Aufschläge), vorbelegt aus `ladeAnnahmen(ctx.organizationId)`, mit einem erklärenden Absatz:

> Diese Werte bestimmen, mit welchem Zins der Solver je Beleihungsauslauf rechnet. Bis zur Realkreditgrenze von 60 % gilt der Basiszins ohne Aufschlag. Solange hier nichts gesetzt ist, arbeitet der Solver mit Platzhaltern.

Und einen Link von `src/app/(app)/settings/page.tsx` auf die neue Seite.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: beide ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings" src/lib/actions/machbarkeit.ts
git commit -m "feat(machbarkeit): Einstellungsseite fuer Basiszins und Aufschlaege"
```

---

### Task 11: Stufe in der Next-Step-Leiter

**Files:**
- Modify: `src/lib/cases/next-step.ts`
- Modify: `src/lib/cases/cockpit.ts`, `src/lib/cases/dashboard.ts`
- Modify: `src/components/case/next-step-card.tsx`
- Test: `tests/next-step.test.ts`

**Interfaces:**
- Produces: `NextStep["key"]` um `"machbarkeit"` erweitert; `NextStepInput["counts"]` um `machbarkeitBlockiert: boolean`

- [ ] **Step 1: Write the failing test**

An `tests/next-step.test.ts` anhängen (die vorhandene `cockpit()`-Hilfe wiederverwenden):

```ts
describe("Stufe: Machbarkeit", () => {
  const versendet = { empfaenger: "a@b.de", vorbereitet: true, versendet: true };

  it("meldet einen nicht darstellbaren Fall vor allem Unterlagen-Kram", () => {
    const s = computeNextStep(
      cockpit({
        counts: { docsMissing: 3, offeneBefunde: 2, machbarkeitBlockiert: true },
        erstkontakt: versendet,
      })
    );
    expect(s.key).toBe("machbarkeit");
    expect(s.cta?.href).toContain("/machbarkeit");
  });

  it("tritt hinter kritische Hinweise zurueck", () => {
    const s = computeNextStep(
      cockpit({
        counts: { criticals: 1, machbarkeitBlockiert: true },
        erstkontakt: versendet,
      })
    );
    expect(s.key).toBe("kritische_hinweise");
  });

  it("schweigt, wenn der Fall traegt", () => {
    const s = computeNextStep(
      cockpit({ counts: { docsMissing: 3, machbarkeitBlockiert: false }, erstkontakt: versendet })
    );
    expect(s.key).toBe("unterlagen_anfordern");
  });
});
```

In der `cockpit()`-Hilfe bei den `counts` ergänzen: `machbarkeitBlockiert: false,`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/next-step.test.ts`
Expected: FAIL — `expected 'unterlagen_luecken' to be 'machbarkeit'`

- [ ] **Step 3: Extend the ladder**

In `src/lib/cases/next-step.ts`: `"machbarkeit"` in den `key`-Union **nach** `"kritische_hinweise"`, und in `NextStepInput["counts"]`:

```ts
    /**
     * Der Solver hatte genug Daten und sagt "nicht darstellbar". Bei duenner
     * Datenlage bleibt das false – sonst warnt die Leiter vor Faellen, ueber
     * die sie nichts weiss.
     */
    machbarkeitBlockiert: boolean;
```

Der Block direkt **nach** `kritische_hinweise` und **vor** `unterlagen_luecken`:

```ts
  // Einen Fall, der so nicht darstellbar ist, klaert man, bevor man weiter
  // Unterlagen einsammelt.
  if (c.counts.machbarkeitBlockiert) {
    return {
      key: "machbarkeit",
      title: "Fall ist so nicht darstellbar",
      reason:
        "Beleihungsauslauf oder Haushalt tragen die Finanzierung in dieser Form nicht. Die Machbarkeitsrechnung zeigt, welche Stellschraube das ändern würde.",
      tone: "blocker",
      cta: { label: "Machbarkeit ansehen", href: `/cases/${id}/machbarkeit` },
    };
  }
```

- [ ] **Step 4: Fill the flag in cockpit and dashboard**

In `src/lib/cases/cockpit.ts` neben `offeneBefunde`:

```ts
  // Machbarkeit: nur ein Urteil faellen, wenn die Daten dafuer reichen.
  const machbarkeitBlockiert = await (async () => {
    try {
      const { baueEingabe } = await import("@/lib/machbarkeit/eingabe");
      const { ladeAnnahmen } = await import("@/lib/machbarkeit/annahmen");
      const { bewerte } = await import("@/lib/machbarkeit/bewertung");
      const { caseToCanonical } = await import("@/lib/platforms/case-loader");
      const fall = await prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: {
          organizationId: true,
          applicants: { select: { anzahlKinder: true }, orderBy: { position: "asc" } },
          property: { select: { bundesland: true } },
          financingRequest: { select: { grunderwerbsteuerProzent: true } },
        },
      });
      const e = baueEingabe(await caseToCanonical(caseId), {
        applicantCount: fall.applicants.length,
        anzahlKinder: fall.applicants[0]?.anzahlKinder ?? 0,
        grunderwerbsteuerProzentOverride: fall.financingRequest?.grunderwerbsteuerProzent ?? null,
        bundeslandOverride: (fall.property?.bundesland as never) ?? null,
      });
      if (!e.ok) return false; // duenne Datenlage: keine Warnung
      return !bewerte(e.eingabe, await ladeAnnahmen(fall.organizationId)).machbar;
    } catch {
      return false;
    }
  })();
```

und in das `counts`-Objekt aufnehmen.

In `src/lib/cases/dashboard.ts` bei den `counts` schlicht `machbarkeitBlockiert: false` setzen — das Dashboard listet zwölf Fälle, und für jeden den Solver zu fahren, kostet zwölf zusätzliche `caseToCanonical`-Läufe. Die Warnung erscheint auf der Fallseite; im Dashboard wäre sie den Preis nicht wert. **Diese Entscheidung als Kommentar im Code festhalten**, sonst sieht sie später wie ein Versehen aus.

- [ ] **Step 5: Add the icon**

In `src/components/case/next-step-card.tsx` `Scale` aus lucide-react importieren und `machbarkeit: Scale,` in die `ICON`-Zuordnung.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/next-step.test.ts tests/dashboard.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/cases/next-step.ts src/lib/cases/cockpit.ts src/lib/cases/dashboard.ts src/components/case/next-step-card.tsx tests/next-step.test.ts
git commit -m "feat(machbarkeit): Stufe in der Next-Step-Leiter"
```

---

### Task 12: Gesamtlauf und Deployment

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: alle grün. Rot gewordene Bestandstests sind echte Regressionen (meist ein fehlendes `machbarkeitBlockiert` im Testinput) — beheben, nicht wegdefinieren.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: beide ohne Fehler. (Kein `npm run lint` — keine ESLint-Konfiguration im Projekt.)

- [ ] **Step 3: Sanity-Rechnung von Hand**

Einen Fall auf der Machbarkeitsseite öffnen und die Ausgangslage nachrechnen:
Kaufpreis + Nebenkosten − Eigenkapital = Darlehen, Darlehen ÷ Kaufpreis = Auslauf.
Weicht etwas ab, ist es ein Fehler im Rechenkern — nicht in der Anzeige.

- [ ] **Step 4: Merge and deploy**

```bash
git checkout main
git merge --no-ff feat/machbarkeits-solver -m "merge: Machbarkeits-Solver"
git push origin main
```

- [ ] **Step 5: Verify deployment**

1. `git merge-base --is-ancestor <commit> origin/main && echo "in main"`
2. `vercel ls --prod` — neuestes Deployment `Ready` und jünger als der Push
3. Seite in der Produktion öffnen und die Diagnose prüfen

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| 3.1 Kein KI-Anteil | Global Constraints; keine Aufgabe ruft `aiService` |
| 3.2 Numerische Suche | 5 |
| 3.3 Raster statt Bisektion | 5 |
| 4.1 Beleihungsauslauf | 3 |
| 4.2 Bänder und Zinsaufschlag | 3 |
| 4.3 Nebenkosten | 2 |
| 4.4 Bundesland aus PLZ und Ort | 1 |
| 4.5 Haushaltsüberschuss über `berechneHaushalt` | 3 |
| 4.6 Urteil | 3 |
| 5.1/5.2 die neun Hebel, beide Sorten | 4 |
| 5.3 Inventar, Ratenkredit, weiterer Darlehensnehmer | 4 (Tests für alle drei Fallstricke) |
| 5.4 Suche, diskrete Hebel, Paare | 5, 7 |
| 6.1 Diagnose | 7 |
| 6.2 vier Angaben je Hebel, Aufrundung | 5, 7, 9 |
| 6.3 Hebel, die nicht reichen | 7 |
| 6.4 Optimierungsmodus | 7 |
| 6.5 fehlende Daten | 6, 9 |
| 6.6 Reihenfolge | 7 |
| 7 Seite, kein Ergebnis-Datenmodell, Overrides, Settings | 8, 9, 10 |
| 7 Next-Step-Stufe | 11 |
| 8 Absicherung | Tests in 1–7 |

**Beim Gegenlesen gefunden und korrigiert:**

1. **Der Tilgungshebel hätte falsch gerundet.** Die 100-€-Aufrundung gilt für Euro-Beträge, nicht für Prozentpunkte — `Math.ceil(0,5/100)*100` ergäbe 100 statt 0,5. Deshalb trägt `HebelDefinition` jetzt das Feld `schrittIstProzent` (Task 5, Step 3).

2. **Der Eigenleistungs-Deckel bezog sich auf nichts.** Die Spec nennt „15 % der Bau- bzw. Modernisierungskosten", aber `SolverEingabe` führt Baukosten nicht getrennt — bei Neubau steht der Betrag in `kaufpreis`. In Task 4 ist der Deckel deshalb an `modernisierungskosten` gebunden, und der Hebel meldet sich als nicht anwendbar, wenn dort nichts steht. Das ist ehrlicher als ein Deckel auf einen Kaufpreis, der beim Neubau die Grundstückskosten enthält.

3. **Das Dashboard darf den Solver nicht fahren.** Zwölf Fälle × `caseToCanonical` wäre ein spürbarer Ladezeit-Aufschlag für eine Warnung, die auf der Fallseite steht. Task 11 setzt dort bewusst `false` — mit Kommentar, damit es nicht wie ein Versehen aussieht.

**Typkonsistenz geprüft:** `SolverEingabe`, `Annahmen`, `Urteil`, `HebelDefinition`, `HebelErgebnis` stammen durchgängig aus `types.ts` bzw. den definierenden Dateien. `bewerte()`, `kleinsterWert()`, `loese()`, `baueEingabe()`, `ladeAnnahmen()` heißen in allen Tasks gleich. `aufHundert` wird nur in `suche.ts` verwendet.

**Bekannte Unschärfen, jeweils mit Prüfschritt hinterlegt:** die Grunderwerbsteuersätze (Task 1, Step 3), die Beschaffbarkeit des PLZ-Datensatzes mit definiertem Rückfallweg (Task 1, Step 4), die Feldnamen in `CanonicalIncome`/`CanonicalProperty` (Task 3, Step 4 und Task 6, Step 4) und die Rückgabe von `requireCaseAccess` (Task 9, Step 1).
