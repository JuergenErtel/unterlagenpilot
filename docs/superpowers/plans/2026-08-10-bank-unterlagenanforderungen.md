# Unterlagenliste an eine Bank schärfen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Fall auf Knopfdruck die Unterlagenanforderungen der Bank aus Europace holen und die Checkliste damit schärfen.

**Architecture:** Ein Leseclient holt die Anforderungen (Europace-Endpunkte). Zwei **reine** Module übersetzen sie in unsere Welt (Dokumenttyp, Antragsteller) und gleichen sie gegen die bestehende Checkliste ab. Eine Server Action speichert einen **Abruf** je Bank; die Checklisten-Engine bekommt daraus eine vierte Positionsquelle. Netzaufruf und Entscheidungslogik sind getrennt, damit die Logik ohne Zugangsdaten vollständig testbar ist.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma 6 / PostgreSQL (Supabase, Schema `unterlagenpilot`), Vitest, TypeScript mit `noUncheckedIndexedAccess`.

**Branch:** Vor Task 1 anlegen — `git checkout -b feat/bank-anforderungen`. Nicht auf `main` entwickeln.

## Global Constraints

- Schemaänderungen laufen über `scripts/supabase-sql.sh`, **niemals** `prisma db push` — die Produktions-`DATABASE_URL` ist in Vercel als sensitiv markiert und nicht auslesbar.
- Dateien unter `"use server"` dürfen **ausschließlich** async Funktionen exportieren. Konstanten und Hilfsfunktionen gehören in eigene Module (Muster: `src/lib/detektiv/keys.ts`).
- Datenbanktests laufen nur mit `RUN_DB_IT=1` (`describe.runIf`) über PGlite (`tests/helpers/pglite-setup.ts`) und erzwingen `AI_PROVIDER=mock` per `vi.hoisted`, weil `getEnv()` beim ersten Aufruf zwischenspeichert.
- `RequirementLevel` kennt genau: `zwingend | spaeter | optional | bankabhaengig`. Es gibt **kein** `pflicht`.
- `RequirementScope`: `allgemein | bankbezogen | produktbezogen`.
- `PlatformSyncLog.direction` und `.status` sind freie Textfelder, kein Enum.
- Alle Kommentare und alle Nutzertexte auf Deutsch. Kommentare begründen das *Warum*, nicht das *Was*.
- Keine Automatik ohne menschliche Auslösung; hier ist der Knopfdruck die Auslösung.
- Nie mit stillen Nullen rechnen: Eine leere Anforderungsliste wird benannt, nicht als Erfolg mit 0 Zeilen verbucht.

## Dateien im Überblick

| Datei | Verantwortung |
|---|---|
| `src/lib/platforms/europace/types.ts` (ändern) | Drahttypen `Unterlagenanforderung`, `Bezugskategorie`, `Produktanbieter`, `EuropaceAntrag`, `EuropaceFinanzierungsvorschlag` |
| `src/lib/platforms/europace/dokument-kategorien.ts` (ändern) | `KATEGORIE` exportieren (bisher privat) |
| `src/lib/platforms/europace/client.ts` (ändern) | Zwei Scopes ergänzen, drei Lesemethoden im Interface + HTTP-Client |
| `src/lib/platforms/europace/anforderungen.ts` (neu) | Auswahl und Anforderungen laden, Drahtformat → Auswahlliste |
| `src/lib/anforderungen/zuordnung.ts` (neu) | Rein: Kategorie → Dokumenttyp, Bezug → Antragsteller |
| `src/lib/anforderungen/abgleich.ts` (neu) | Rein: deckt sich / neu / erledigt / verlangt die Bank nicht |
| `src/lib/anforderungen/positionen.ts` (neu) | Rein: gespeicherte Anforderungen → `ChecklistItemDef[]` |
| `src/lib/actions/anforderungen.ts` (neu) | Server Actions: Vorgangsnummer setzen, Auswahl laden, Abruf ausführen |
| `src/lib/cases/service.ts` (ändern) | Vierte Positionsquelle + Abgleichzahlen ins Aggregat |
| `src/components/case/bank-anforderungen.tsx` (neu) | Karte im Fall: Auswahl, Abruf, Abgleichzahlen |
| `prisma/schema.prisma` (ändern) | `BankAnforderungsAbruf`, `BankAnforderung` |
| `prisma/sql/2026-08-10-bank-anforderungen.sql` (neu) | Migration |

---

### Task 1: Zuordnung — Kategorie zu Dokumenttyp, Bezug zu Antragsteller

**Files:**
- Create: `src/lib/anforderungen/zuordnung.ts`
- Modify: `src/lib/platforms/europace/types.ts` (Drahttypen anhängen)
- Modify: `src/lib/platforms/europace/dokument-kategorien.ts:20` (`const KATEGORIE` → `export const KATEGORIE`)
- Test: `tests/anforderungen-zuordnung.test.ts`

**Interfaces:**
- Consumes: `DOCUMENT_TYPES`, `DocumentType` aus `@/lib/domain/enums`; `matchApplicant`, `ApplicantCandidate` aus `@/lib/documents/applicant-match`
- Produces:
  - `interface Produktanbieter { id?: string; bezeichnung?: string }`
  - `interface Bezugskategorie { typ?: string; id?: string; name?: string; rolle?: { typ?: string; name?: string } }`
  - `interface Unterlagenanforderung { id: string; code?: string; text?: string; kurzbezeichnung?: string; erfuellungskategorien?: string[]; produktanbieter?: Produktanbieter; bezug?: Bezugskategorie; liegtVor?: boolean; ausgeblendet?: boolean }`
  - `function dokumenttypFuer(erfuellungskategorien: string[] | undefined): DocumentType | null`
  - `function antragstellerFuer(bezug: Bezugskategorie | undefined, applicants: ApplicantCandidate[]): string | null`
  - `function bezeichnungFuer(a: Unterlagenanforderung): string`

- [ ] **Step 1: Drahttypen anhängen**

Ans Ende von `src/lib/platforms/europace/types.ts`:

```ts
/**
 * Antwortformen der Europace-Unterlagen-API (GET /dokumente/anforderungen und
 * GET /dokumente/antrag/anforderungen). Quelle: europace/unterlagen-api,
 * swagger.yaml, Schema "Unterlagenanforderung".
 *
 * Fast alles ist optional: Die Spezifikation kennzeichnet kein Feld als
 * required. Wer hier Pflichtfelder annimmt, baut sich einen Absturz bei der
 * ersten Bank, die ein Feld weglaesst.
 */
export interface Produktanbieter {
  id?: string;
  bezeichnung?: string;
}

export interface Bezugskategorie {
  /** antragsteller | immobilie | vorhaben | ratenkredit */
  typ?: string;
  id?: string;
  name?: string;
  rolle?: { typ?: string; name?: string };
}

export interface Unterlagenanforderung {
  id: string;
  code?: string;
  text?: string;
  kurzbezeichnung?: string;
  erfuellungskategorien?: string[];
  produktanbieter?: Produktanbieter;
  bezug?: Bezugskategorie;
  liegtVor?: boolean;
  ausgeblendet?: boolean;
}

/** Auszug aus GET /v3/vorgaenge/{nr}/antraege (Vorgaenge-API v3). */
export interface EuropaceAntrag {
  antragsNummer?: string;
  produktAnbieter?: Produktanbieter;
  status?: { name?: string } | string;
}

/** Auszug aus GET /v3/vorgaenge/{nr}/finanzierungsvorschlaege (Vorgaenge-API v3). */
export interface EuropaceFinanzierungsvorschlag {
  id?: string;
  darlehensSumme?: number;
  rateMonatlich?: number;
  sollZins?: number;
  effektivZins?: number;
  darlehen?: Array<{ produktAnbieter?: Produktanbieter }>;
}
```

- [ ] **Step 2: `KATEGORIE` exportieren**

In `src/lib/platforms/europace/dokument-kategorien.ts` Zeile 20:

```ts
export const KATEGORIE: Record<DocumentType, string> = {
```

Darüber diesen Kommentar ergänzen:

```ts
/**
 * Exportiert, weil die Rueckrichtung (Europace-Kategorie -> BaufiDesk-Typ) in
 * src/lib/anforderungen/zuordnung.ts genau diese Tabelle umkehren muss. Zwei
 * getrennt gepflegte Tabellen wuerden auseinanderlaufen.
 */
```

- [ ] **Step 3: Den fehlschlagenden Test schreiben**

`tests/anforderungen-zuordnung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dokumenttypFuer, antragstellerFuer, bezeichnungFuer } from "@/lib/anforderungen/zuordnung";
import type { ApplicantCandidate } from "@/lib/documents/applicant-match";

const zwei: ApplicantCandidate[] = [
  { id: "a1", position: 1, vorname: "Max", nachname: "Mustermann" },
  { id: "a2", position: 2, vorname: "Erika", nachname: "Musterfrau" },
];

describe("Kategorie -> Dokumenttyp", () => {
  it("findet den eindeutigen Typ", () => {
    expect(dokumenttypFuer(["Gehaltsabrechnung"])).toBe("gehaltsabrechnung");
    expect(dokumenttypFuer(["Ausweis"])).toBe("personalausweis");
    expect(dokumenttypFuer(["Teilungserklaerung"])).toBe("teilungserklaerung");
  });

  it("waehlt bei Mehrdeutigkeit nach fester Rangfolge", () => {
    // BWA ist Ziel von bwa, susa, jahresabschluss UND euer. Gewinnen muss der,
    // der in DOCUMENT_TYPES zuerst steht - sonst haengt das Ergebnis an der
    // Schluesselreihenfolge eines Objekts.
    expect(dokumenttypFuer(["BWA"])).toBe("bwa");
  });

  it("liefert null fuer Sonstiges", () => {
    // "Sonstiges" ist der Sammelkorb dreier Typen und sagt nichts aus.
    expect(dokumenttypFuer(["Sonstiges"])).toBeNull();
  });

  it("liefert null fuer Unbekanntes und Leeres", () => {
    expect(dokumenttypFuer(["Gibtsnicht"])).toBeNull();
    expect(dokumenttypFuer([])).toBeNull();
    expect(dokumenttypFuer(undefined)).toBeNull();
  });

  it("nimmt die erste Kategorie, die passt", () => {
    expect(dokumenttypFuer(["Gibtsnicht", "Ausweis"])).toBe("personalausweis");
  });
});

describe("Bezug -> Antragsteller", () => {
  it("ordnet ueber den Namen zu", () => {
    expect(antragstellerFuer({ typ: "antragsteller", name: "Erika Musterfrau" }, zwei)).toBe("a2");
  });

  it("ignoriert Bezuege, die keine Person sind", () => {
    expect(antragstellerFuer({ typ: "immobilie", name: "Hauptstr. 1" }, zwei)).toBeNull();
    expect(antragstellerFuer({ typ: "vorhaben", name: "Kauf" }, zwei)).toBeNull();
  });

  it("kommt ohne Bezug zurecht", () => {
    expect(antragstellerFuer(undefined, zwei)).toBeNull();
  });

  it("liefert null, wenn der Name auf niemanden eindeutig passt", () => {
    expect(antragstellerFuer({ typ: "antragsteller", name: "Klaus Kleber" }, zwei)).toBeNull();
  });
});

describe("Bezeichnung", () => {
  it("bevorzugt die Kurzbezeichnung", () => {
    expect(bezeichnungFuer({ id: "1", kurzbezeichnung: "Perso", text: "Ausweisdokument" })).toBe("Perso");
  });

  it("faellt auf text und dann auf code zurueck", () => {
    expect(bezeichnungFuer({ id: "1", text: "Ausweisdokument" })).toBe("Ausweisdokument");
    expect(bezeichnungFuer({ id: "1", code: "AW01" })).toBe("AW01");
  });

  it("nennt die Anforderung notfalls unbenannt statt leer", () => {
    expect(bezeichnungFuer({ id: "1" })).toBe("Unbenannte Anforderung");
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/anforderungen-zuordnung.test.ts`
Expected: FAIL mit `Failed to resolve import "@/lib/anforderungen/zuordnung"`

- [ ] **Step 5: Umsetzung schreiben**

`src/lib/anforderungen/zuordnung.ts`:

```ts
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/enums";
import { KATEGORIE } from "@/lib/platforms/europace/dokument-kategorien";
import { matchApplicant, type ApplicantCandidate } from "@/lib/documents/applicant-match";
import type { Bezugskategorie, Unterlagenanforderung } from "@/lib/platforms/europace/types";

/**
 * Kategorien, die keine Aussage treffen. "Sonstiges" ist bei uns das Ziel von
 * darlehensvertrag, weg_protokoll UND sonstige – daraus laesst sich kein Typ
 * zurueckrechnen, und ein geratener waere schlechter als keiner.
 */
const NICHTSSAGEND = new Set(["Sonstiges"]);

/**
 * Europace-Kategorie -> BaufiDesk-Dokumenttyp, also die Umkehrung von KATEGORIE.
 *
 * Die Umkehrung ist mehrdeutig: BWA ist Ziel von vier Typen. Aufgeloest wird
 * ueber die Reihenfolge in DOCUMENT_TYPES – eine ausdrueckliche, im Code
 * nachlesbare Rangfolge statt der Schluesselreihenfolge eines Objekts, die
 * niemand als Entscheidung erkennt.
 */
const RUECKWAERTS: Map<string, DocumentType> = (() => {
  const m = new Map<string, DocumentType>();
  for (const typ of DOCUMENT_TYPES) {
    const kategorie = KATEGORIE[typ];
    if (NICHTSSAGEND.has(kategorie)) continue;
    if (!m.has(kategorie)) m.set(kategorie, typ);
  }
  return m;
})();

export function dokumenttypFuer(
  erfuellungskategorien: string[] | undefined
): DocumentType | null {
  for (const k of erfuellungskategorien ?? []) {
    const treffer = RUECKWAERTS.get(k);
    if (treffer) return treffer;
  }
  return null;
}

/**
 * Ordnet den Bezug einer Anforderung einem Antragsteller zu.
 *
 * Nutzt bewusst denselben strengen Namensabgleich wie die Auto-Zuordnung von
 * Dokumenten: Ein Fall darf nicht zwei verschiedene Vorstellungen davon haben,
 * wem etwas gehoert.
 */
export function antragstellerFuer(
  bezug: Bezugskategorie | undefined,
  applicants: ApplicantCandidate[]
): string | null {
  if (bezug?.typ !== "antragsteller") return null;
  return matchApplicant(bezug.name, applicants);
}

/** Anzeigename einer Anforderung – nie leer, damit keine namenlose Zeile entsteht. */
export function bezeichnungFuer(a: Unterlagenanforderung): string {
  return a.kurzbezeichnung || a.text || a.code || "Unbenannte Anforderung";
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run tests/anforderungen-zuordnung.test.ts && npm run typecheck`
Expected: 12 Tests grün, Typecheck ohne Fehler

**Achtung bei `matchApplicant`:** Bei genau *einem* Antragsteller ordnet die
Funktion immer diesem zu, auch ohne Namenstreffer. Das ist beabsichtigt (dort
dokumentiert) und darf hier nicht „korrigiert" werden.

- [ ] **Step 7: Commit**

```bash
git add tests/anforderungen-zuordnung.test.ts src/lib/anforderungen/zuordnung.ts src/lib/platforms/europace/types.ts src/lib/platforms/europace/dokument-kategorien.ts
git commit -m "feat(anforderungen): Zuordnung Kategorie->Dokumenttyp und Bezug->Antragsteller"
```

---

### Task 2: Abgleich gegen die bestehende Checkliste

**Files:**
- Create: `src/lib/anforderungen/abgleich.ts`
- Test: `tests/anforderungen-abgleich.test.ts`

**Interfaces:**
- Consumes: `ResolvedChecklistItem` aus `@/lib/checklists/engine`; `DocumentType` aus `@/lib/domain/enums`
- Produces:
  - `interface AbgleichAnforderung { id: string; bezeichnung: string; documentType: DocumentType | null; liegtVor: boolean; ausgeblendet: boolean }`
  - `type AbgleichBefund = { art: "deckt_sich"; anforderungId: string; positionKey: string } | { art: "neu"; anforderungId: string } | { art: "erledigt"; anforderungId: string } | { art: "bank_verlangt_nicht"; positionKey: string }`
  - `interface AbgleichZahlen { neu: number; verlangtBankNicht: number; decktSich: number; erledigt: number }`
  - `function gleicheAb(anforderungen: AbgleichAnforderung[], positionen: ResolvedChecklistItem[]): AbgleichBefund[]`
  - `function zaehle(befunde: AbgleichBefund[]): AbgleichZahlen`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`tests/anforderungen-abgleich.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gleicheAb, zaehle, type AbgleichAnforderung } from "@/lib/anforderungen/abgleich";
import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

const position = (
  key: string,
  name: string,
  documentType: ResolvedChecklistItem["documentType"]
): ResolvedChecklistItem => ({
  key,
  name,
  customerDescription: name,
  documentType,
  level: "zwingend",
  scope: "allgemein",
  platforms: ["europace"],
  status: "offen",
  matchedDocuments: 0,
  customerVisible: true,
  effectiveRequiredCount: 1,
});

const anforderung = (
  id: string,
  bezeichnung: string,
  documentType: AbgleichAnforderung["documentType"],
  extra: Partial<AbgleichAnforderung> = {}
): AbgleichAnforderung => ({
  id,
  bezeichnung,
  documentType,
  liegtVor: false,
  ausgeblendet: false,
  ...extra,
});

describe("Abgleich", () => {
  it("erkennt eine Deckung ueber den Dokumenttyp", () => {
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis")],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.perso" });
  });

  it("erkennt eine Deckung ueber den Namen, wenn kein Dokumenttyp da ist", () => {
    const b = gleicheAb(
      [anforderung("r1", "Grundbuchauszug", null)],
      [position("tpl.gb", "Grundbuchauszug", null)]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.gb" });
  });

  it("gleicht Namen unabhaengig von Umlauten und Grossschreibung ab", () => {
    const b = gleicheAb(
      [anforderung("r1", "TEILUNGSERKLAERUNG", null)],
      [position("tpl.te", "Teilungserklärung", null)]
    );
    expect(b.some((x) => x.art === "deckt_sich")).toBe(true);
  });

  it("meldet eine Anforderung ohne Gegenstueck als neu", () => {
    const b = gleicheAb(
      [anforderung("r1", "Nachweis Eigenkapital", "eigenkapitalnachweis")],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "neu", anforderungId: "r1" });
  });

  it("meldet unsere Position ohne Gegenstueck, loescht sie aber nicht", () => {
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis")],
      [
        position("tpl.perso", "Personalausweis", "personalausweis"),
        position("tpl.gb", "Grundbuchauszug", "grundbuchauszug"),
      ]
    );
    expect(b).toContainEqual({ art: "bank_verlangt_nicht", positionKey: "tpl.gb" });
  });

  it("ueberspringt Ausgeblendetes vollstaendig", () => {
    const b = gleicheAb(
      [anforderung("r1", "Irgendwas", null, { ausgeblendet: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b.some((x) => "anforderungId" in x && x.anforderungId === "r1")).toBe(false);
  });

  it("macht aus liegtVor keine offene Position", () => {
    const b = gleicheAb(
      [anforderung("r1", "Nachweis Eigenkapital", "eigenkapitalnachweis", { liegtVor: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "erledigt", anforderungId: "r1" });
    expect(b.some((x) => x.art === "neu")).toBe(false);
  });

  it("laesst liegtVor am Abgleich teilnehmen", () => {
    // Sonst truege unsere Position faelschlich "verlangt die Bank nicht".
    const b = gleicheAb(
      [anforderung("r1", "Ausweisdokument", "personalausweis", { liegtVor: true })],
      [position("tpl.perso", "Personalausweis", "personalausweis")]
    );
    expect(b).toContainEqual({ art: "deckt_sich", anforderungId: "r1", positionKey: "tpl.perso" });
    expect(b.some((x) => x.art === "bank_verlangt_nicht")).toBe(false);
  });

  it("erzeugt keine Dublette, wenn zwei Anforderungen denselben Typ tragen", () => {
    // Bank verlangt Gehaltsabrechnung fuer beide Antragsteller; wir haben EINE
    // Position mit perApplicant. Beide muessen sich darauf decken.
    const b = gleicheAb(
      [
        anforderung("r1", "Einkommensnachweis AS1", "gehaltsabrechnung"),
        anforderung("r2", "Einkommensnachweis AS2", "gehaltsabrechnung"),
      ],
      [position("tpl.gehalt", "Gehaltsabrechnungen", "gehaltsabrechnung")]
    );
    expect(b.filter((x) => x.art === "deckt_sich")).toHaveLength(2);
    expect(b.some((x) => x.art === "neu")).toBe(false);
  });

  it("zaehlt die vier Arten", () => {
    const z = zaehle([
      { art: "deckt_sich", anforderungId: "r1", positionKey: "p1" },
      { art: "neu", anforderungId: "r2" },
      { art: "neu", anforderungId: "r3" },
      { art: "erledigt", anforderungId: "r4" },
      { art: "bank_verlangt_nicht", positionKey: "p2" },
    ]);
    expect(z).toEqual({ decktSich: 1, neu: 2, erledigt: 1, verlangtBankNicht: 1 });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/anforderungen-abgleich.test.ts`
Expected: FAIL mit `Failed to resolve import "@/lib/anforderungen/abgleich"`

- [ ] **Step 3: Umsetzung schreiben**

`src/lib/anforderungen/abgleich.ts`:

```ts
import type { DocumentType } from "@/lib/domain/enums";
import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

export interface AbgleichAnforderung {
  id: string;
  bezeichnung: string;
  documentType: DocumentType | null;
  liegtVor: boolean;
  ausgeblendet: boolean;
}

export type AbgleichBefund =
  | { art: "deckt_sich"; anforderungId: string; positionKey: string }
  | { art: "neu"; anforderungId: string }
  | { art: "erledigt"; anforderungId: string }
  | { art: "bank_verlangt_nicht"; positionKey: string };

export interface AbgleichZahlen {
  neu: number;
  verlangtBankNicht: number;
  decktSich: number;
  erledigt: number;
}

/** Kleinschreibung, Umlaute aufgeloest – dieselbe Faltung wie in applicant-match.ts. */
function falte(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Gleicht die Anforderungen der Bank gegen unsere Checkliste ab.
 *
 * Getroffen wird ueber den Dokumenttyp, ersatzweise ueber den gefalteten Namen.
 * Der Antragstellerbezug geht BEWUSST nicht ein: Eine Checklisten-Position ist
 * keine Zeile pro Person – `perApplicant` multipliziert nur die Sollzahl. Eine
 * Anforderung fuer Antragsteller 2 ist deshalb von derselben Position gedeckt
 * wie eine fuer Antragsteller 1. Folge: Verlangt die Bank etwas nur fuer eine
 * Person, waehrend wir es von allen einsammeln, gilt das als Treffer – wir
 * fordern dann mehr an als noetig, nie weniger.
 */
export function gleicheAb(
  anforderungen: AbgleichAnforderung[],
  positionen: ResolvedChecklistItem[]
): AbgleichBefund[] {
  const befunde: AbgleichBefund[] = [];
  const getroffenePositionen = new Set<string>();

  for (const a of anforderungen) {
    // Was der Vermittler in Europace ausgeblendet hat, kommt hier nicht zurueck.
    if (a.ausgeblendet) continue;

    const treffer = positionen.find((p) =>
      a.documentType
        ? p.documentType === a.documentType
        : falte(p.name) === falte(a.bezeichnung)
    );

    if (treffer) {
      getroffenePositionen.add(treffer.key);
      befunde.push({ art: "deckt_sich", anforderungId: a.id, positionKey: treffer.key });
      continue;
    }

    // liegtVor heisst: liegt der Bank bereits vor. Keine offene Position daraus.
    befunde.push(
      a.liegtVor ? { art: "erledigt", anforderungId: a.id } : { art: "neu", anforderungId: a.id }
    );
  }

  for (const p of positionen) {
    if (!getroffenePositionen.has(p.key)) {
      befunde.push({ art: "bank_verlangt_nicht", positionKey: p.key });
    }
  }

  return befunde;
}

export function zaehle(befunde: AbgleichBefund[]): AbgleichZahlen {
  return {
    decktSich: befunde.filter((b) => b.art === "deckt_sich").length,
    neu: befunde.filter((b) => b.art === "neu").length,
    erledigt: befunde.filter((b) => b.art === "erledigt").length,
    verlangtBankNicht: befunde.filter((b) => b.art === "bank_verlangt_nicht").length,
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/anforderungen-abgleich.test.ts && npm run typecheck`
Expected: 10 Tests grün, Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add tests/anforderungen-abgleich.test.ts src/lib/anforderungen/abgleich.ts
git commit -m "feat(anforderungen): Abgleich Bankanforderung gegen Checkliste"
```

---

### Task 3: Datenbankschema und Migration

**Files:**
- Modify: `prisma/schema.prisma` (zwei Modelle + Relation an `Case`)
- Create: `prisma/sql/2026-08-10-bank-anforderungen.sql`

**Interfaces:**
- Produces: Prisma-Modelle `BankAnforderungsAbruf`, `BankAnforderung`

- [ ] **Step 1: Modelle ins Schema**

Ans Ende von `prisma/schema.prisma`:

```prisma
/// Ein Abruf der Unterlagenanforderungen fuer GENAU EINE Bank.
/// Bankwechsel ist deshalb eine Frage von `aktiv`, keine Loeschung: Was fuer
/// Bank A geholt wurde, bleibt als Verlauf liegen.
model BankAnforderungsAbruf {
  id             String                @id @default(cuid())
  caseId         String
  case           Case                  @relation(fields: [caseId], references: [id], onDelete: Cascade)
  /// Europace-Produktanbieter-Id (z. B. ING_DIBA), wenn ermittelbar.
  bankId         String?
  bankName       String
  /// "antrag" (verbindlich) | "vorschlag" (vor der Einreichung)
  quelle         String
  vorgangsNummer String
  /// antragsNummer oder finanzierungsvorschlagsId
  bezugsId       String
  abgerufenAm    DateTime
  aktiv          Boolean               @default(true)
  anforderungen  BankAnforderung[]

  @@unique([caseId, quelle, bezugsId])
  @@index([caseId, aktiv])
  @@map("bank_anforderungs_abrufe")
}

model BankAnforderung {
  id                    String                @id @default(cuid())
  abrufId               String
  abruf                 BankAnforderungsAbruf @relation(fields: [abrufId], references: [id], onDelete: Cascade)
  /// Unterlagenanforderung.id aus Europace
  externeId             String
  code                  String
  text                  String
  kurzbezeichnung       String
  erfuellungskategorien String[]              @default([])
  bezugTyp              String?
  bezugName             String?
  bezugRolle            String?
  liegtVor              Boolean               @default(false)
  ausgeblendet          Boolean               @default(false)
  /// Beim Abruf aufgeloest und abgelegt, nicht bei jeder Anzeige neu gerechnet.
  documentType          DocumentType?
  applicantId           String?

  @@unique([abrufId, externeId])
  @@map("bank_anforderungen")
}
```

Im Modell `Case` in der Relationsliste ergänzen:

```prisma
  anforderungsAbrufe    BankAnforderungsAbruf[]
```

- [ ] **Step 2: Prisma-Client erzeugen**

Run: `npx prisma generate`
Expected: „Generated Prisma Client"

- [ ] **Step 3: Migration schreiben**

`prisma/sql/2026-08-10-bank-anforderungen.sql`:

```sql
-- Unterlagenanforderungen der Bank aus Europace.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql
--
-- Rein additiv: zwei neue Tabellen, kein DROP.

CREATE TABLE IF NOT EXISTS "bank_anforderungs_abrufe" (
  "id"             TEXT PRIMARY KEY,
  "caseId"         TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "bankId"         TEXT,
  "bankName"       TEXT NOT NULL,
  "quelle"         TEXT NOT NULL,
  "vorgangsNummer" TEXT NOT NULL,
  "bezugsId"       TEXT NOT NULL,
  "abgerufenAm"    TIMESTAMP(3) NOT NULL,
  "aktiv"          BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_anforderungs_abrufe_caseId_quelle_bezugsId_key"
  ON "bank_anforderungs_abrufe"("caseId", "quelle", "bezugsId");
CREATE INDEX IF NOT EXISTS "bank_anforderungs_abrufe_caseId_aktiv_idx"
  ON "bank_anforderungs_abrufe"("caseId", "aktiv");

CREATE TABLE IF NOT EXISTS "bank_anforderungen" (
  "id"                    TEXT PRIMARY KEY,
  "abrufId"               TEXT NOT NULL REFERENCES "bank_anforderungs_abrufe"("id") ON DELETE CASCADE,
  "externeId"             TEXT NOT NULL,
  "code"                  TEXT NOT NULL,
  "text"                  TEXT NOT NULL,
  "kurzbezeichnung"       TEXT NOT NULL,
  "erfuellungskategorien" TEXT[] NOT NULL DEFAULT '{}',
  "bezugTyp"              TEXT,
  "bezugName"             TEXT,
  "bezugRolle"            TEXT,
  "liegtVor"              BOOLEAN NOT NULL DEFAULT false,
  "ausgeblendet"          BOOLEAN NOT NULL DEFAULT false,
  "documentType"          "DocumentType",
  "applicantId"           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_anforderungen_abrufId_externeId_key"
  ON "bank_anforderungen"("abrufId", "externeId");
```

**Prüfen:** Der Tabellenname des `Case`-Modells muss `cases` sein. Nachsehen mit
`grep -n '@@map("cases")' prisma/schema.prisma`. Weicht er ab, den Fremdschlüssel
anpassen — nicht raten.

- [ ] **Step 4: Trockenlauf**

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql --dry-run`
Expected: Zeigt das SQL, führt nichts aus, meldet keine DROP/TRUNCATE-Warnung

- [ ] **Step 5: Migration ausführen**

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql`
Expected: `HTTP 201` und „Erfolgreich."

- [ ] **Step 6: In der Produktion gegenprüfen**

```bash
cat > /tmp/pruef-anforderungen.sql <<'SQL'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'unterlagenpilot'
  AND table_name IN ('bank_anforderungs_abrufe', 'bank_anforderungen');
SQL
scripts/supabase-sql.sh /tmp/pruef-anforderungen.sql
```

Expected: beide Tabellennamen in der Antwort

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-08-10-bank-anforderungen.sql
git commit -m "feat(anforderungen): Schema fuer Abrufe und Bankanforderungen"
```

---

### Task 4: Leseclient für Europace

**Files:**
- Modify: `src/lib/platforms/europace/client.ts` (Scopes, Interface, drei Methoden)
- Create: `src/lib/platforms/europace/anforderungen.ts`
- Create: `src/lib/platforms/europace/schema/unterlagen-swagger.yaml`, `src/lib/platforms/europace/schema/vorgaenge-openapi-v3.json`
- Modify: `src/lib/platforms/europace/schema/HERKUNFT.md`
- Test: `tests/europace-anforderungen.test.ts`

**Interfaces:**
- Consumes: `Unterlagenanforderung`, `EuropaceAntrag`, `EuropaceFinanzierungsvorschlag` aus Task 1
- Produces:
  - `interface AnbieterAuswahl { quelle: "antrag" | "vorschlag"; bezugsId: string; bankId: string | null; bankName: string; hinweis?: string }`
  - Auf `EuropaceClient`: `holeAntraege(vorgangsNummer: string): Promise<EuropaceAntrag[]>`, `holeFinanzierungsvorschlaege(vorgangsNummer: string): Promise<EuropaceFinanzierungsvorschlag[]>`, `holeAnforderungen(p: { quelle: "antrag" | "vorschlag"; vorgangsNummer: string; bezugsId: string }): Promise<Unterlagenanforderung[]>`
  - `function auswahlAus(antraege: EuropaceAntrag[], vorschlaege: EuropaceFinanzierungsvorschlag[]): AnbieterAuswahl[]`

- [ ] **Step 1: Scopes ergänzen**

In `src/lib/platforms/europace/client.ts` die Liste `SCOPES` (Zeile 28-33) ersetzen:

```ts
const SCOPES = [
  "baufinanzierung:vorgang:schreiben",
  "baufinanzierung:vorgang:lesen",
  "unterlagen:dokument:schreiben",
  "unterlagen:unterlage:schreiben",
  // Lesend fuer die Unterlagenanforderungen:
  //   unterlagen:unterlage:lesen  -> GET /dokumente/anforderungen
  //   unterlagen:freigabe:lesen   -> GET /dokumente/antrag/anforderungen
  // Beide muessen im Zugangsantrag bei Europace stehen, sonst kommt der Zugang,
  // aber die Anforderungen bleiben unlesbar.
  "unterlagen:unterlage:lesen",
  "unterlagen:freigabe:lesen",
].join(" ");
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`tests/europace-anforderungen.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { HttpEuropaceClient } from "@/lib/platforms/europace/client";
import { auswahlAus } from "@/lib/platforms/europace/anforderungen";

/** Antwortet auf den Token-Aufruf und danach mit der uebergebenen Nutzlast. */
function fetchMitAntwort(nutzlast: unknown, status = 200) {
  return vi.fn(async (url: string | URL) => {
    if (String(url).includes("/auth/token")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify(nutzlast), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const client = (f: typeof fetch) =>
  new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, f);

describe("Anforderungen lesen", () => {
  it("liest die Anforderungen eines Antrags", async () => {
    const f = fetchMitAntwort([
      { id: "r1", code: "AW01", text: "Ausweisdokument", erfuellungskategorien: ["Ausweis"] },
    ]);
    const r = await client(f).holeAnforderungen({
      quelle: "antrag",
      vorgangsNummer: "CH6407",
      bezugsId: "A-1",
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("r1");

    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/dokumente/antrag/anforderungen");
    expect(aufgerufen).toContain("antragsNummer=A-1");
  });

  it("liest die Anforderungen eines Finanzierungsvorschlags mit beiden Parametern", async () => {
    const f = fetchMitAntwort([]);
    await client(f).holeAnforderungen({
      quelle: "vorschlag",
      vorgangsNummer: "CH6407",
      bezugsId: "FV-9",
    });
    const aufgerufen = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(aufgerufen).toContain("/dokumente/anforderungen");
    expect(aufgerufen).toContain("vorgangsNummer=CH6407");
    expect(aufgerufen).toContain("finanzierungsvorschlagsId=FV-9");
  });

  it("nennt einen fehlenden Scope beim Namen", async () => {
    const f = fetchMitAntwort({ message: "forbidden" }, 403);
    await expect(
      client(f).holeAnforderungen({ quelle: "antrag", vorgangsNummer: "X", bezugsId: "A-1" })
    ).rejects.toThrow(/Scope|Zugang/i);
  });

  it("liefert eine leere Liste, wenn Europace nichts zurueckgibt", async () => {
    const f = fetchMitAntwort([]);
    const r = await client(f).holeAnforderungen({
      quelle: "antrag",
      vorgangsNummer: "X",
      bezugsId: "A-1",
    });
    expect(r).toEqual([]);
  });
});

describe("Auswahlliste", () => {
  it("stellt Antraege vor Vorschlaege", () => {
    const a = auswahlAus(
      [{ antragsNummer: "A-1", produktAnbieter: { id: "ING_DIBA", bezeichnung: "ING" } }],
      [{ id: "FV-9", darlehen: [{ produktAnbieter: { id: "DSL_BANK", bezeichnung: "DSL Bank" } }] }]
    );
    expect(a[0]!.quelle).toBe("antrag");
    expect(a[0]!.bankId).toBe("ING_DIBA");
    expect(a[1]!.quelle).toBe("vorschlag");
  });

  it("holt die Bank eines Vorschlags aus dem ersten Darlehen", () => {
    const a = auswahlAus(
      [],
      [{ id: "FV-9", darlehen: [{ produktAnbieter: { id: "DSL_BANK", bezeichnung: "DSL Bank" } }] }]
    );
    expect(a[0]!.bankName).toBe("DSL Bank");
    expect(a[0]!.bankId).toBe("DSL_BANK");
  });

  it("nennt einen Vorschlag ohne Bank ehrlich unbekannt", () => {
    const a = auswahlAus([], [{ id: "FV-9" }]);
    expect(a[0]!.bankName).toBe("Bank unbekannt");
    expect(a[0]!.bankId).toBeNull();
  });

  it("beschreibt Vorschlaege mit Zins und Rate, damit sie unterscheidbar sind", () => {
    const a = auswahlAus([], [{ id: "FV-9", sollZins: 1.89, rateMonatlich: 1240 }]);
    expect(a[0]!.hinweis).toContain("1,89");
    expect(a[0]!.hinweis).toContain("1.240");
  });

  it("laesst Eintraege ohne Kennung weg", () => {
    // Ohne Id koennten wir die Anforderungen gar nicht abrufen.
    expect(auswahlAus([{ produktAnbieter: { id: "X" } }], [{ sollZins: 1 }])).toEqual([]);
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/europace-anforderungen.test.ts`
Expected: FAIL mit `Failed to resolve import "@/lib/platforms/europace/anforderungen"`

- [ ] **Step 4: Client um die Lesemethoden erweitern**

In `src/lib/platforms/europace/client.ts` den Import ergänzen:

```ts
import type {
  Datenkontext,
  EuropaceAntrag,
  EuropaceFinanzierungsvorschlag,
  EuropaceKundenangabenRequest,
  Unterlagenanforderung,
} from "./types";
```

Das Interface `EuropaceClient` um drei Methoden erweitern:

```ts
  /** Alle Antraege zum Vorgang (verbindlich, weil bereits eingereicht). */
  holeAntraege(vorgangsNummer: string): Promise<EuropaceAntrag[]>;
  /** Alle ausgehaendigten Finanzierungsvorschlaege zum Vorgang. */
  holeFinanzierungsvorschlaege(vorgangsNummer: string): Promise<EuropaceFinanzierungsvorschlag[]>;
  /** Die Unterlagenanforderungen zu einem Antrag oder Vorschlag. */
  holeAnforderungen(p: {
    quelle: "antrag" | "vorschlag";
    vorgangsNummer: string;
    bezugsId: string;
  }): Promise<Unterlagenanforderung[]>;
```

In `HttpEuropaceClient` diese Methoden ergänzen (vor der schliessenden Klammer der Klasse):

```ts
  /**
   * Gemeinsamer GET-Weg. Eigene Methode, weil sich die drei Leseaufrufe nur in
   * der URL unterscheiden – und damit die Fehlermeldungen an EINER Stelle
   * stehen und nicht dreimal auseinanderdriften.
   */
  private async hole<T>(url: string, was: string): Promise<T> {
    const token = await this.holeToken();
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
        TIMEOUT_MS,
        this.fetchImpl
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError(
        `Europace verweigert ${was}. Fehlt der Scope unterlagen:unterlage:lesen ` +
          `bzw. unterlagen:freigabe:lesen im Zugang?`
      );
    }
    if (res.status === 404) {
      throw new EuropaceApiError(`${was}: in Europace nicht auffindbar.`);
    }
    if (!res.ok) {
      console.warn(`[europace] ${was} -> HTTP ${res.status}`);
      throw new EuropaceApiError(`${was} fehlgeschlagen (HTTP ${res.status}).`);
    }
    return (await res.json()) as T;
  }

  async holeAntraege(vorgangsNummer: string): Promise<EuropaceAntrag[]> {
    const body = await this.hole<{ antraege?: EuropaceAntrag[] } | EuropaceAntrag[]>(
      `${BAUFI_HOST}/v3/vorgaenge/${encodeURIComponent(vorgangsNummer)}/antraege`,
      `Antraege zu Vorgang ${vorgangsNummer}`
    );
    // Die Vorgaenge-API liefert je nach Endpunkt eine Liste oder eine Huelle.
    return Array.isArray(body) ? body : (body.antraege ?? []);
  }

  async holeFinanzierungsvorschlaege(
    vorgangsNummer: string
  ): Promise<EuropaceFinanzierungsvorschlag[]> {
    const body = await this.hole<
      { finanzierungsvorschlaege?: EuropaceFinanzierungsvorschlag[] } | EuropaceFinanzierungsvorschlag[]
    >(
      `${BAUFI_HOST}/v3/vorgaenge/${encodeURIComponent(vorgangsNummer)}/finanzierungsvorschlaege`,
      `Finanzierungsvorschlaege zu Vorgang ${vorgangsNummer}`
    );
    return Array.isArray(body) ? body : (body.finanzierungsvorschlaege ?? []);
  }

  async holeAnforderungen(p: {
    quelle: "antrag" | "vorschlag";
    vorgangsNummer: string;
    bezugsId: string;
  }): Promise<Unterlagenanforderung[]> {
    const url =
      p.quelle === "antrag"
        ? `${UNTERLAGEN_HOST}/dokumente/antrag/anforderungen?antragsNummer=${encodeURIComponent(p.bezugsId)}`
        : `${UNTERLAGEN_HOST}/dokumente/anforderungen?vorgangsNummer=${encodeURIComponent(p.vorgangsNummer)}&finanzierungsvorschlagsId=${encodeURIComponent(p.bezugsId)}`;

    const body = await this.hole<Unterlagenanforderung[]>(url, "Unterlagenanforderungen");
    return Array.isArray(body) ? body : [];
  }
```

- [ ] **Step 5: Auswahlliste schreiben**

`src/lib/platforms/europace/anforderungen.ts`:

```ts
import type { EuropaceAntrag, EuropaceFinanzierungsvorschlag } from "./types";

export interface AnbieterAuswahl {
  quelle: "antrag" | "vorschlag";
  /** antragsNummer oder finanzierungsvorschlagsId */
  bezugsId: string;
  bankId: string | null;
  bankName: string;
  /** Nur bei Vorschlaegen: macht mehrere Angebote unterscheidbar. */
  hinweis?: string;
}

const zahl = (n: number, nachkomma = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });

/**
 * Was Europace zu einem Vorgang anbietet, als eine Liste.
 *
 * Antraege stehen vorn: Sie tragen die verbindliche Anforderungsliste der Bank,
 * waehrend ein Vorschlag nur zeigt, was der Produktanbieter im Angebot erwartet.
 *
 * Eintraege ohne Kennung fallen weg – ohne sie liesse sich gar nichts abrufen.
 */
export function auswahlAus(
  antraege: EuropaceAntrag[],
  vorschlaege: EuropaceFinanzierungsvorschlag[]
): AnbieterAuswahl[] {
  const aus: AnbieterAuswahl[] = [];

  for (const a of antraege) {
    if (!a.antragsNummer) continue;
    aus.push({
      quelle: "antrag",
      bezugsId: a.antragsNummer,
      bankId: a.produktAnbieter?.id ?? null,
      bankName: a.produktAnbieter?.bezeichnung ?? "Bank unbekannt",
    });
  }

  for (const v of vorschlaege) {
    if (!v.id) continue;
    // Der Vorschlag selbst nennt keine Bank; sie haengt am ersten Darlehen.
    const anbieter = v.darlehen?.[0]?.produktAnbieter;
    const teile: string[] = [];
    if (typeof v.sollZins === "number") teile.push(`${zahl(v.sollZins, 2)} %`);
    if (typeof v.rateMonatlich === "number") teile.push(`${zahl(v.rateMonatlich)} €/Monat`);
    aus.push({
      quelle: "vorschlag",
      bezugsId: v.id,
      bankId: anbieter?.id ?? null,
      bankName: anbieter?.bezeichnung ?? "Bank unbekannt",
      ...(teile.length > 0 ? { hinweis: teile.join(" · ") } : {}),
    });
  }

  return aus;
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run tests/europace-anforderungen.test.ts && npm run typecheck`
Expected: 9 Tests grün, Typecheck ohne Fehler

**Wenn der Typecheck über `EuropaceClient` klagt:** Es gibt Testdoubles, die das
Interface umsetzen. Mit `grep -rn "EuropaceClient" src tests --include="*.ts"` alle
Stellen suchen und die drei neuen Methoden dort ergänzen.

- [ ] **Step 7: Schemadateien einchecken**

```bash
cd /tmp && rm -rf ua-plan va-plan
git clone -q --depth 1 https://github.com/europace/unterlagen-api.git ua-plan
git clone -q --depth 1 https://github.com/europace/baufismart-vorgaenge-api.git va-plan
cd /Users/jurgenertel/Coding/Unterlagenpilot
cp /tmp/ua-plan/swagger.yaml src/lib/platforms/europace/schema/unterlagen-swagger.yaml
cp /tmp/va-plan/openapi-v3.json src/lib/platforms/europace/schema/vorgaenge-openapi-v3.json
```

In `src/lib/platforms/europace/schema/HERKUNFT.md` anhängen:

```markdown
## unterlagen-swagger.yaml

Quelle: https://github.com/europace/unterlagen-api (`swagger.yaml`, master)
Geholt am: 2026-08-10
Genutzt fuer: `GET /dokumente/anforderungen`, `GET /dokumente/antrag/anforderungen`,
Schema `Unterlagenanforderung`.

## vorgaenge-openapi-v3.json

Quelle: https://github.com/europace/baufismart-vorgaenge-api (`openapi-v3.json`, master)
Geholt am: 2026-08-10
Genutzt fuer: `GET /v3/vorgaenge/{vorgangsNummer}/antraege` und
`/finanzierungsvorschlaege`.

**Warnung aus der Spezifikation:** Beide Finanzierungsvorschlags-Endpunkte tragen
den Hinweis „Achtung: Bei den ausgegebenen Finanzierungsvorschlaegen handelt es
sich um Mockdaten." Ob das nur das Doku-Beispiel meint, ist ohne Zugang nicht
entscheidbar. Der Antrags-Weg traegt diesen Hinweis nicht.
```

- [ ] **Step 8: Vertragstest gegen das Schema**

Ans Ende von `tests/europace-anforderungen.test.ts`:

```ts
import { readFileSync } from "node:fs";

describe("Vertrag gegen die eingecheckte Spezifikation", () => {
  const swagger = readFileSync("src/lib/platforms/europace/schema/unterlagen-swagger.yaml", "utf-8");

  it("kennt beide Anforderungs-Endpunkte", () => {
    expect(swagger).toContain("/dokumente/anforderungen:");
    expect(swagger).toContain("/dokumente/antrag/anforderungen:");
  });

  it("nennt genau die Scopes, die der Client anfordert", () => {
    expect(swagger).toContain("unterlagen:unterlage:lesen");
    expect(swagger).toContain("unterlagen:freigabe:lesen");
  });

  it("belegt jedes Feld, das wir aus Unterlagenanforderung lesen", () => {
    const ab = swagger.indexOf("    Unterlagenanforderung:");
    expect(ab).toBeGreaterThan(-1);
    const block = swagger.slice(ab, ab + 2000);
    for (const feld of [
      "id:",
      "code:",
      "text:",
      "kurzbezeichnung:",
      "erfuellungskategorien:",
      "produktanbieter:",
      "bezug:",
      "liegtVor:",
      "ausgeblendet:",
    ]) {
      expect(block).toContain(feld);
    }
  });

  it("belegt die Pfade der Vorgaenge-API", () => {
    const v3 = readFileSync("src/lib/platforms/europace/schema/vorgaenge-openapi-v3.json", "utf-8");
    expect(v3).toContain("/v3/vorgaenge/{vorgangsNummer}/antraege");
    expect(v3).toContain("/v3/vorgaenge/{vorgangsNummer}/finanzierungsvorschlaege");
  });
});
```

- [ ] **Step 9: Tests laufen lassen**

Run: `npx vitest run tests/europace-anforderungen.test.ts`
Expected: 13 Tests grün

- [ ] **Step 10: Commit**

```bash
git add src/lib/platforms/europace tests/europace-anforderungen.test.ts
git commit -m "feat(europace): lesende Aufrufe fuer Unterlagenanforderungen"
```

---

### Task 5: Abruf speichern

**Files:**
- Create: `src/lib/anforderungen/speicher.ts`
- Test: `tests/anforderungen-speicher-db.test.ts`

**Interfaces:**
- Consumes: `Unterlagenanforderung` (Task 1), `dokumenttypFuer`/`antragstellerFuer`/`bezeichnungFuer` (Task 1), Prisma-Modelle (Task 3)
- Produces:
  - `interface AbrufEingabe { caseId: string; quelle: "antrag" | "vorschlag"; vorgangsNummer: string; bezugsId: string; bankId: string | null; bankName: string; anforderungen: Unterlagenanforderung[] }`
  - `function speichereAbruf(e: AbrufEingabe, jetzt?: Date): Promise<{ abrufId: string; zeilen: number }>`
  - `function ladeAktivenAbruf(caseId: string): Promise<AktiverAbruf | null>` mit `interface AktiverAbruf { id: string; bankId: string | null; bankName: string; quelle: string; bezugsId: string; abgerufenAm: Date; anforderungen: Array<{ id: string; bezeichnung: string; documentType: DocumentType | null; liegtVor: boolean; ausgeblendet: boolean; code: string; bezugName: string | null; applicantId: string | null }> }`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`tests/anforderungen-speicher-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  // getEnv() und die Provider-Fabrik merken sich den ersten Aufruf – ohne das
  // hier liefe der Test gegen die echte Mistral-API.
  process.env.AI_PROVIDER = "mock";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 *   RUN_DB_IT=1 npx vitest run tests/anforderungen-speicher-db.test.ts
 */
describe.runIf(RUN)("Abruf speichern (PGlite)", () => {
  let prisma: any;
  let speichereAbruf: any;
  let ladeAktivenAbruf: any;
  let caseId = "";

  const anforderungen = () => [
    {
      id: "r1",
      code: "AW01",
      text: "Ausweisdokument",
      kurzbezeichnung: "Perso",
      erfuellungskategorien: ["Ausweis"],
      bezug: { typ: "antragsteller", name: "Max Mustermann" },
      liegtVor: false,
      ausgeblendet: false,
    },
    {
      id: "r2",
      code: "EK01",
      text: "Nachweis Eigenkapital",
      erfuellungskategorien: ["Gibtsnicht"],
      liegtVor: true,
      ausgeblendet: false,
    },
  ];

  const eingabe = (extra: Record<string, unknown> = {}) => ({
    caseId,
    quelle: "antrag" as const,
    vorgangsNummer: "CH6407",
    bezugsId: "A-1",
    bankId: "ING_DIBA",
    bankName: "ING",
    anforderungen: anforderungen(),
    ...extra,
  });

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    ({ speichereAbruf, ladeAktivenAbruf } = await import("@/lib/anforderungen/speicher"));

    const org = await prisma.organization.create({ data: { name: "Testorg" } });
    const fall = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0001" },
    });
    caseId = fall.id;
    await prisma.applicant.create({
      data: { caseId, position: 1, vorname: "Max", nachname: "Mustermann" },
    });
  }, 180_000);

  it("legt Abruf und Anforderungen an", async () => {
    const r = await speichereAbruf(eingabe());
    expect(r.zeilen).toBe(2);

    const abruf = await prisma.bankAnforderungsAbruf.findUnique({
      where: { id: r.abrufId },
      include: { anforderungen: true },
    });
    expect(abruf.bankName).toBe("ING");
    expect(abruf.aktiv).toBe(true);
    expect(abruf.anforderungen).toHaveLength(2);
  });

  it("loest den Dokumenttyp beim Abruf auf", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r1" } });
    expect(a.documentType).toBe("personalausweis");
  });

  it("laesst den Dokumenttyp leer, wenn die Kategorie unbekannt ist", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r2" } });
    expect(a.documentType).toBeNull();
  });

  it("ordnet den Antragsteller ueber den Bezugsnamen zu", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r1" } });
    const as1 = await prisma.applicant.findFirst({ where: { caseId, position: 1 } });
    expect(a.applicantId).toBe(as1.id);
  });

  it("uebernimmt liegtVor unveraendert", async () => {
    await speichereAbruf(eingabe());
    const a = await prisma.bankAnforderung.findFirst({ where: { externeId: "r2" } });
    expect(a.liegtVor).toBe(true);
  });

  it("erzeugt beim zweiten Abruf derselben Bank keinen zweiten Datensatz", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(eingabe());
    const anzahl = await prisma.bankAnforderungsAbruf.count({
      where: { caseId, quelle: "antrag", bezugsId: "A-1" },
    });
    expect(anzahl).toBe(1);
  });

  it("entfernt Anforderungen, die die Bank nicht mehr nennt", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(eingabe({ anforderungen: [anforderungen()[0]] }));
    const abruf = await prisma.bankAnforderungsAbruf.findFirst({
      where: { caseId, bezugsId: "A-1" },
      include: { anforderungen: true },
    });
    expect(abruf.anforderungen).toHaveLength(1);
    expect(abruf.anforderungen[0].externeId).toBe("r1");
  });

  it("setzt beim Bankwechsel nur das Kennzeichen um und loescht nichts", async () => {
    await speichereAbruf(eingabe());
    await speichereAbruf(
      eingabe({ bezugsId: "A-2", bankId: "DSL_BANK", bankName: "DSL Bank" })
    );

    const alle = await prisma.bankAnforderungsAbruf.findMany({ where: { caseId } });
    expect(alle.length).toBeGreaterThanOrEqual(2);
    expect(alle.filter((a: any) => a.aktiv)).toHaveLength(1);
    expect(alle.find((a: any) => a.aktiv).bankName).toBe("DSL Bank");
    expect(alle.find((a: any) => a.bezugsId === "A-1")).toBeTruthy();
  });

  it("liefert den aktiven Abruf in Abgleichsform", async () => {
    await speichereAbruf(eingabe());
    const aktiv = await ladeAktivenAbruf(caseId);
    expect(aktiv.bankName).toBe("ING");
    expect(aktiv.anforderungen.find((a: any) => a.id === "r1").bezeichnung).toBe("Perso");
    expect(aktiv.anforderungen.find((a: any) => a.id === "r1").documentType).toBe("personalausweis");
  });

  it("liefert null, wenn nie abgerufen wurde", async () => {
    const org = await prisma.organization.create({ data: { name: "Leer" } });
    const leer = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0002" },
    });
    expect(await ladeAktivenAbruf(leer.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `RUN_DB_IT=1 npx vitest run tests/anforderungen-speicher-db.test.ts`
Expected: FAIL mit `Failed to resolve import "@/lib/anforderungen/speicher"`

**Wenn stattdessen Prisma-Felder fehlen:** Task 3 wurde nicht ausgeführt oder
`npx prisma generate` fehlt. Nachholen, nicht umgehen.

- [ ] **Step 3: Umsetzung schreiben**

`src/lib/anforderungen/speicher.ts`:

```ts
import { prisma } from "@/lib/db";
import type { DocumentType } from "@/lib/domain/enums";
import type { Unterlagenanforderung } from "@/lib/platforms/europace/types";
import { antragstellerFuer, bezeichnungFuer, dokumenttypFuer } from "./zuordnung";

export interface AbrufEingabe {
  caseId: string;
  quelle: "antrag" | "vorschlag";
  vorgangsNummer: string;
  bezugsId: string;
  bankId: string | null;
  bankName: string;
  anforderungen: Unterlagenanforderung[];
}

export interface AktiverAbruf {
  id: string;
  bankId: string | null;
  bankName: string;
  quelle: string;
  bezugsId: string;
  abgerufenAm: Date;
  anforderungen: Array<{
    id: string;
    bezeichnung: string;
    documentType: DocumentType | null;
    liegtVor: boolean;
    ausgeblendet: boolean;
    code: string;
    bezugName: string | null;
    applicantId: string | null;
  }>;
}

/**
 * Schreibt einen Abruf und macht ihn zum aktiven.
 *
 * Bankwechsel loescht nichts: Der Abruf fuer die alte Bank bleibt als Verlauf
 * liegen und verliert nur das Kennzeichen. Was der Kunde fuer Bank A geschickt
 * hat, soll nicht verschwinden, weil der Fall zu Bank B wandert.
 *
 * Dokumenttyp und Antragsteller werden HIER aufgeloest, nicht bei der Anzeige –
 * einmal sauber ablegen statt bei jedem Aufruf neu rechnen.
 */
export async function speichereAbruf(
  e: AbrufEingabe,
  jetzt: Date = new Date()
): Promise<{ abrufId: string; zeilen: number }> {
  const applicants = await prisma.applicant.findMany({
    where: { caseId: e.caseId },
    select: { id: true, position: true, vorname: true, nachname: true },
    orderBy: { position: "asc" },
  });

  return prisma.$transaction(async (tx) => {
    const abruf = await tx.bankAnforderungsAbruf.upsert({
      where: {
        caseId_quelle_bezugsId: {
          caseId: e.caseId,
          quelle: e.quelle,
          bezugsId: e.bezugsId,
        },
      },
      create: {
        caseId: e.caseId,
        quelle: e.quelle,
        bezugsId: e.bezugsId,
        vorgangsNummer: e.vorgangsNummer,
        bankId: e.bankId,
        bankName: e.bankName,
        abgerufenAm: jetzt,
        aktiv: true,
      },
      update: {
        vorgangsNummer: e.vorgangsNummer,
        bankId: e.bankId,
        bankName: e.bankName,
        abgerufenAm: jetzt,
        aktiv: true,
      },
    });

    // Genau ein Abruf je Fall ist aktiv.
    await tx.bankAnforderungsAbruf.updateMany({
      where: { caseId: e.caseId, id: { not: abruf.id } },
      data: { aktiv: false },
    });

    const behalten: string[] = [];
    for (const a of e.anforderungen) {
      const werte = {
        code: a.code ?? "",
        text: a.text ?? "",
        kurzbezeichnung: a.kurzbezeichnung ?? "",
        erfuellungskategorien: a.erfuellungskategorien ?? [],
        bezugTyp: a.bezug?.typ ?? null,
        bezugName: a.bezug?.name ?? null,
        bezugRolle: a.bezug?.rolle?.typ ?? null,
        liegtVor: a.liegtVor ?? false,
        ausgeblendet: a.ausgeblendet ?? false,
        documentType: dokumenttypFuer(a.erfuellungskategorien),
        applicantId: antragstellerFuer(a.bezug, applicants),
      };
      await tx.bankAnforderung.upsert({
        where: { abrufId_externeId: { abrufId: abruf.id, externeId: a.id } },
        create: { abrufId: abruf.id, externeId: a.id, ...werte },
        update: werte,
      });
      behalten.push(a.id);
    }

    // Was die Bank nicht mehr nennt, faellt weg – sonst bliebe eine Anforderung
    // ewig stehen, die zurueckgezogen wurde.
    await tx.bankAnforderung.deleteMany({
      where: { abrufId: abruf.id, externeId: { notIn: behalten } },
    });

    return { abrufId: abruf.id, zeilen: e.anforderungen.length };
  });
}

/** Der aktive Abruf des Falls, aufbereitet fuer Abgleich und Anzeige. */
export async function ladeAktivenAbruf(caseId: string): Promise<AktiverAbruf | null> {
  const abruf = await prisma.bankAnforderungsAbruf.findFirst({
    where: { caseId, aktiv: true },
    include: { anforderungen: { orderBy: { kurzbezeichnung: "asc" } } },
  });
  if (!abruf) return null;

  return {
    id: abruf.id,
    bankId: abruf.bankId,
    bankName: abruf.bankName,
    quelle: abruf.quelle,
    bezugsId: abruf.bezugsId,
    abgerufenAm: abruf.abgerufenAm,
    anforderungen: abruf.anforderungen.map((a) => ({
      id: a.externeId,
      bezeichnung: bezeichnungFuer({
        id: a.externeId,
        code: a.code,
        text: a.text,
        kurzbezeichnung: a.kurzbezeichnung,
      }),
      documentType: a.documentType,
      liegtVor: a.liegtVor,
      ausgeblendet: a.ausgeblendet,
      code: a.code,
      bezugName: a.bezugName,
      applicantId: a.applicantId,
    })),
  };
}
```

**Hinweis zu `bezeichnungFuer`:** Die Funktion erwartet leere Zeichenketten als
„nicht gesetzt". Weil `kurzbezeichnung` in der Datenbank `NOT NULL` ist und beim
Fehlen als `""` abgelegt wird, greift der Rückfall auf `text` bzw. `code` korrekt.

- [ ] **Step 4: Tests laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/anforderungen-speicher-db.test.ts && npm run typecheck`
Expected: 10 Tests grün, Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add tests/anforderungen-speicher-db.test.ts src/lib/anforderungen/speicher.ts
git commit -m "feat(anforderungen): Abruf speichern, Bankwechsel ohne Datenverlust"
```

---

### Task 6: Positionen, Server Actions und Anzeige

**Files:**
- Create: `src/lib/anforderungen/positionen.ts`
- Create: `src/lib/actions/anforderungen.ts`
- Create: `src/components/case/bank-anforderungen.tsx`
- Modify: `src/lib/cases/service.ts` (vierte Quelle + Abgleichzahlen)
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Karte einhängen)
- Create: `src/lib/rules/schluessel.ts` (`slug` als gemeinsame Quelle)
- Modify: `src/lib/actions/bank-requirements.ts:9` (eigene `slug`-Funktion durch den Import ersetzen)
- Test: `tests/anforderungen-positionen.test.ts`

**Interfaces:**
- Consumes: `AktiverAbruf` (Task 5), `gleicheAb`/`zaehle` (Task 2), `ChecklistItemDef` aus `@/lib/checklists/templates`
- Produces:
  - `function anforderungsPositionen(abruf: AktiverAbruf): ChecklistItemDef[]`
  - Server Actions `vorgangsnummerSetzen(formData: FormData): Promise<void>`, `auswahlLaden(formData: FormData): Promise<void>`, `anforderungenAbrufen(formData: FormData): Promise<void>`

- [ ] **Step 1: `slug` in ein eigenes Modul heben**

`src/lib/actions/bank-requirements.ts` beginnt mit `"use server"`. Solche Dateien
dürfen **ausschließlich async Funktionen exportieren** — `slug` von dort zu
exportieren bricht den Build. Deshalb wandert die Funktion in ein eigenes Modul.

Neu, `src/lib/rules/schluessel.ts` — den Rumpf **wörtlich** aus
`src/lib/actions/bank-requirements.ts:9` übernehmen, nicht neu erfinden:

```ts
/**
 * Erzeugt den stabilen Teil eines Positionsschluessels.
 *
 * Liegt hier und nicht in einer Action-Datei: Module mit "use server" duerfen
 * nur async Funktionen exportieren. Und es gibt bewusst nur EINE Fassung —
 * zwei Schluesselgeneratoren laufen auseinander und erzeugen Dubletten, die
 * spaeter niemand mehr zuordnen kann.
 */
export function slug(s: string): string {
  // Rumpf woertlich aus src/lib/actions/bank-requirements.ts:9 uebernehmen.
}
```

In `src/lib/actions/bank-requirements.ts` die lokale Funktion löschen und
stattdessen importieren:

```ts
import { slug } from "@/lib/rules/schluessel";
```

Prüfen, dass nichts anderes gebrochen ist:
Run: `npx vitest run && npm run typecheck`

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`tests/anforderungen-positionen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { anforderungsPositionen } from "@/lib/anforderungen/positionen";
import type { AktiverAbruf } from "@/lib/anforderungen/speicher";

const abruf = (
  anforderungen: AktiverAbruf["anforderungen"]
): AktiverAbruf => ({
  id: "ab1",
  bankId: "ING_DIBA",
  bankName: "ING",
  quelle: "antrag",
  bezugsId: "A-1",
  abgerufenAm: new Date("2026-08-10T10:00:00Z"),
  anforderungen,
});

const a = (
  id: string,
  bezeichnung: string,
  extra: Partial<AktiverAbruf["anforderungen"][number]> = {}
): AktiverAbruf["anforderungen"][number] => ({
  id,
  bezeichnung,
  documentType: null,
  liegtVor: false,
  ausgeblendet: false,
  code: "",
  bezugName: null,
  applicantId: null,
  ...extra,
});

describe("Anforderungen als Checklisten-Positionen", () => {
  it("baut eine Position je Anforderung", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis Eigenkapital")]));
    expect(p).toHaveLength(1);
    expect(p[0]!.name).toBe("Nachweis Eigenkapital");
  });

  it("setzt Stufe zwingend und bankbezogenen Geltungsbereich", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis")]));
    expect(p[0]!.level).toBe("zwingend");
    expect(p[0]!.scope).toBe("bankbezogen");
    expect(p[0]!.bankSpecific).toBe(true);
  });

  it("nennt die Bank in der internen Beschreibung", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis")]));
    expect(p[0]!.internalDescription).toContain("ING");
  });

  it("baut einen stabilen Schluessel aus Bank und Code", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis", { code: "EK01" })]));
    expect(p[0]!.key).toBe("europace.ING_DIBA.ek01");
  });

  it("weicht ohne Code auf die Bezeichnung aus", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis Eigenkapital")]));
    expect(p[0]!.key).toBe("europace.ING_DIBA.nachweis-eigenkapital");
  });

  it("laesst Ausgeblendetes und bereits Vorliegendes weg", () => {
    const p = anforderungsPositionen(
      abruf([
        a("r1", "Versteckt", { ausgeblendet: true }),
        a("r2", "Liegt vor", { liegtVor: true }),
        a("r3", "Offen"),
      ])
    );
    expect(p).toHaveLength(1);
    expect(p[0]!.name).toBe("Offen");
  });

  it("uebernimmt den Dokumenttyp", () => {
    const p = anforderungsPositionen(
      abruf([a("r1", "Ausweis", { documentType: "personalausweis" })])
    );
    expect(p[0]!.documentType).toBe("personalausweis");
  });

  it("nennt den Bezug in der internen Beschreibung, wenn es einen gibt", () => {
    const p = anforderungsPositionen(
      abruf([a("r1", "Gehalt", { bezugName: "Erika Musterfrau" })])
    );
    expect(p[0]!.internalDescription).toContain("Erika Musterfrau");
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/anforderungen-positionen.test.ts`
Expected: FAIL mit `Failed to resolve import "@/lib/anforderungen/positionen"`

- [ ] **Step 4: Positionen schreiben**

`src/lib/anforderungen/positionen.ts`:

```ts
import type { ChecklistItemDef } from "@/lib/checklists/templates";
import { slug } from "@/lib/rules/schluessel";
import type { AktiverAbruf } from "./speicher";

/**
 * Macht aus dem aktiven Abruf Checklisten-Positionen – die vierte Quelle neben
 * Vorlagen, gepflegten Bankanforderungen und den Funden des Detektivs.
 *
 * Bewusst NICHT kundensichtbar (`scope: "bankbezogen"`): Banktexte lauten
 * „Nachweis gem. Ziffer 3.2" und taugen nicht fuer den Kunden. Der Vermittler
 * gibt sie frei, nachdem er sie umformuliert hat.
 */
export function anforderungsPositionen(abruf: AktiverAbruf): ChecklistItemDef[] {
  const bank = abruf.bankId ?? slug(abruf.bankName);

  return abruf.anforderungen
    // Ausgeblendetes hat der Vermittler in Europace weggeklickt; was bereits
    // vorliegt, braucht keine offene Position.
    .filter((a) => !a.ausgeblendet && !a.liegtVor)
    .map((a) => ({
      key: `europace.${bank}.${a.code ? slug(a.code) : slug(a.bezeichnung)}`,
      name: a.bezeichnung,
      customerDescription: a.bezeichnung,
      internalDescription: a.bezugName
        ? `Anforderung von ${abruf.bankName} (Europace) · ${a.bezugName}`
        : `Anforderung von ${abruf.bankName} (Europace).`,
      documentType: a.documentType,
      level: "zwingend" as const,
      scope: "bankbezogen" as const,
      platforms: ["europace" as const],
      bankSpecific: true,
      acceptedFileTypes: ["pdf", "jpg", "png"],
      requiredCount: 1,
    }));
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/anforderungen-positionen.test.ts && npm run typecheck`
Expected: 8 Tests grün

**Falls der Schlüssel-Test scheitert:** `slug()` in `bank-requirements.ts` ansehen
und die erwarteten Werte im Test an das tatsächliche Verhalten anpassen — die
Funktion ist die Wahrheit, nicht meine Annahme über sie.

- [ ] **Step 6: Vierte Quelle in `cases/service.ts`**

Import ergänzen:

```ts
import { ladeAktivenAbruf } from "@/lib/anforderungen/speicher";
import { anforderungsPositionen } from "@/lib/anforderungen/positionen";
import { gleicheAb, zaehle, type AbgleichZahlen } from "@/lib/anforderungen/abgleich";
```

Nach dem bestehenden `const extraItems = bankRequirementItems(...)`-Block einfügen:

```ts
  // Vierte Quelle: was die Bank laut Europace tatsaechlich verlangt. Die
  // einzige verbindliche Quelle – die anderen drei raten.
  const aktiverAbruf = await ladeAktivenAbruf(caseId);
  const alleExtras = aktiverAbruf
    ? [...extraItems, ...anforderungsPositionen(aktiverAbruf)]
    : extraItems;
```

Den Aufruf von `buildChecklistForCase` auf `alleExtras` umstellen:

```ts
  const checklist = buildChecklistForCase(
    checklistEingabeFuerFall(caseRow),
    existing,
    alleExtras
  );
```

Nach `const readiness = computeReadiness(...)` ergänzen:

```ts
  // Der Abgleich laeuft gegen die FERTIGE Checkliste, damit die Zahlen zu dem
  // passen, was der Vermittler sieht.
  const anforderungsAbgleich: {
    bankName: string;
    abgerufenAm: Date;
    quelle: string;
    zahlen: AbgleichZahlen;
  } | null = aktiverAbruf
    ? {
        bankName: aktiverAbruf.bankName,
        abgerufenAm: aktiverAbruf.abgerufenAm,
        quelle: aktiverAbruf.quelle,
        zahlen: zaehle(gleicheAb(aktiverAbruf.anforderungen, checklist)),
      }
    : null;
```

`anforderungsAbgleich` in das zurückgegebene Objekt aufnehmen und im Interface
`CaseAggregate` ergänzen:

```ts
  /** Nur gesetzt, wenn fuer diesen Fall schon Anforderungen geholt wurden. */
  anforderungsAbgleich: {
    bankName: string;
    abgerufenAm: Date;
    quelle: string;
    zahlen: AbgleichZahlen;
  } | null;
```

- [ ] **Step 7: Server Actions schreiben**

`src/lib/actions/anforderungen.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { getEuropaceClient } from "@/lib/platforms/europace/client";
import { auswahlAus } from "@/lib/platforms/europace/anforderungen";
import { speichereAbruf } from "@/lib/anforderungen/speicher";

/**
 * Holt die Unterlagenanforderungen der Bank – ausgeloest vom Vermittler, nie
 * von allein. Welche Bank es wird, steht erst fest, wenn in Europace gerechnet
 * wurde; ein Zeitplan haette nichts, woran er sich orientieren koennte.
 */

/** Stellt sicher, dass der Fall zur Organisation des Nutzers gehoert. */
async function ladeFall(caseId: string, organizationId: string) {
  return prisma.case.findFirst({
    where: { id: caseId, organizationId },
    select: { id: true },
  });
}

async function protokolliere(caseId: string, status: string, message: string) {
  await prisma.platformSyncLog.create({
    data: { caseId, platform: "europace", direction: "import", status, message },
  });
}

export async function vorgangsnummerSetzen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const nummer = String(formData.get("vorgangsnummer") ?? "").trim();
  if (!caseId || !nummer) return;
  if (!(await ladeFall(caseId, ctx.organizationId))) return;

  // Dasselbe Feld, das die bestehende Uebertragung fuellt – dadurch profitiert
  // auch der Unterlagen-Upload von der Eingabe.
  await prisma.platformMapping.upsert({
    where: { caseId_platform: { caseId, platform: "europace" } },
    create: { caseId, platform: "europace", payload: {}, externalId: nummer },
    update: { externalId: nummer },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "Case",
    entityId: caseId,
    metadata: { feld: "europaceVorgangsnummer", nummer },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function anforderungenAbrufen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const quelle = String(formData.get("quelle") ?? "");
  const bezugsId = String(formData.get("bezugsId") ?? "").trim();
  const bankId = String(formData.get("bankId") ?? "").trim() || null;
  const bankName = String(formData.get("bankName") ?? "").trim() || "Bank unbekannt";

  if (!caseId || !bezugsId) return;
  if (quelle !== "antrag" && quelle !== "vorschlag") return;
  if (!(await ladeFall(caseId, ctx.organizationId))) return;

  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });
  const vorgangsNummer = mapping?.externalId;
  if (!vorgangsNummer) {
    await protokolliere(caseId, "fehler", "Keine Vorgangsnummer hinterlegt.");
    revalidatePath(`/cases/${caseId}`);
    return;
  }

  const client = getEuropaceClient(ctx.organizationId);
  if (!client) {
    await protokolliere(caseId, "fehler", "Europace-Zugangsdaten fehlen.");
    revalidatePath(`/cases/${caseId}`);
    return;
  }

  try {
    const anforderungen = await client.holeAnforderungen({ quelle, vorgangsNummer, bezugsId });

    // Eine leere Liste ist ein Ergebnis, kein Erfolg mit null Zeilen.
    if (anforderungen.length === 0) {
      await protokolliere(
        caseId,
        "leer",
        `${bankName} hat zu diesem Vorgang keine Unterlagen angefordert.`
      );
      revalidatePath(`/cases/${caseId}`);
      return;
    }

    const r = await speichereAbruf({
      caseId,
      quelle,
      vorgangsNummer,
      bezugsId,
      bankId,
      bankName,
      anforderungen,
    });

    await protokolliere(caseId, "erfolg", `${r.zeilen} Anforderungen von ${bankName} geholt.`);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "platform.pushed",
      entityType: "Case",
      entityId: caseId,
      metadata: { richtung: "import", bankName, quelle, anzahl: r.zeilen },
    });
  } catch (e) {
    // Alles-oder-nichts: kein Teilstand, der spaeter jemanden in die Irre fuehrt.
    await protokolliere(caseId, "fehler", e instanceof Error ? e.message : "Unbekannter Fehler.");
  }

  revalidatePath(`/cases/${caseId}`);
}

/** Was Europace zu diesem Vorgang anbietet – fuer die Auswahl in der Karte. */
export async function auswahlLaden(caseId: string) {
  const ctx = await requireContext();
  if (!(await ladeFall(caseId, ctx.organizationId))) return { fehler: "Fall nicht gefunden." };

  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });
  if (!mapping?.externalId) return { fehler: "Keine Vorgangsnummer hinterlegt." };

  const client = getEuropaceClient(ctx.organizationId);
  if (!client) return { fehler: "Europace-Zugangsdaten fehlen." };

  try {
    const [antraege, vorschlaege] = await Promise.all([
      client.holeAntraege(mapping.externalId),
      client.holeFinanzierungsvorschlaege(mapping.externalId),
    ]);
    return { auswahl: auswahlAus(antraege, vorschlaege) };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Europace nicht erreichbar." };
  }
}
```

**Zu `audit()`:** Die Funktion nimmt **ein Objekt**, nicht `(ctx, aktion, meta)`, und
`action` ist auf die Liste `AUDIT_ACTIONS` in `src/lib/domain/enums.ts:543-585`
festgelegt. Es gibt dort **keine** Europace-spezifische Aktion — deshalb oben die
vorhandenen `case.updated` bzw. `platform.pushed` mit sprechenden `metadata`. Eine
neue Aktion in die Liste aufzunehmen wäre auch möglich, ist hier aber nicht nötig
und würde die Aufzählung ohne Gewinn verbreitern.

**Prüfen:** Ob `requireContext()` das Feld `userId` liefert
(`grep -n "userId" src/lib/auth/context.ts`). Falls es anders heißt, den Aufruf
anpassen. Ebenso den Unique-Namen `caseId_platform` gegen
`@@unique([caseId, platform])` in `prisma/schema.prisma:1088`.

- [ ] **Step 8: Karte im Fall**

`src/components/case/bank-anforderungen.tsx`:

```tsx
import { Landmark } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { anforderungenAbrufen, auswahlLaden, vorgangsnummerSetzen } from "@/lib/actions/anforderungen";
import type { AbgleichZahlen } from "@/lib/anforderungen/abgleich";

const datum = (d: Date) => d.toLocaleDateString("de-DE");

/**
 * Die Karte im Fall. Server Component: Die Auswahl wird beim Rendern geholt,
 * damit kein Zwischenklick noetig ist.
 */
export async function BankAnforderungen({
  caseId,
  abgleich,
}: {
  caseId: string;
  abgleich: {
    bankName: string;
    abgerufenAm: Date;
    quelle: string;
    zahlen: AbgleichZahlen;
  } | null;
}) {
  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });

  if (!mapping?.externalId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold">Unterlagenliste an eine Bank anpassen</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Dafür braucht BaufiDesk die Europace-Vorgangsnummer. Du findest sie in
            Europace oben am Vorgang.
          </p>
          <form action={vorgangsnummerSetzen} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="caseId" value={caseId} />
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Vorgangsnummer</span>
              <Input name="vorgangsnummer" placeholder="z. B. CH6407" required />
            </label>
            <button type="submit" className="feld h-9 px-4 text-sm">
              Merken
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const ergebnis = await auswahlLaden(caseId);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Unterlagenliste an eine Bank anpassen</h2>
          <Badge variant="neutral">Vorgang {mapping.externalId}</Badge>
        </div>

        {abgleich && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {abgleich.bankName} · {abgleich.quelle === "antrag" ? "Antrag" : "Finanzierungsvorschlag"} ·
              abgerufen am {datum(abgleich.abgerufenAm)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {abgleich.zahlen.neu} Anforderungen waren bei uns nicht auf dem Schirm ·{" "}
              {abgleich.zahlen.verlangtBankNicht} Positionen verlangt diese Bank nicht ·{" "}
              {abgleich.zahlen.decktSich} decken sich
              {abgleich.zahlen.erledigt > 0 && ` · ${abgleich.zahlen.erledigt} liegen der Bank vor`}
            </p>
          </div>
        )}

        {"fehler" in ergebnis && ergebnis.fehler ? (
          <p className="text-sm text-muted-foreground">{ergebnis.fehler}</p>
        ) : null}

        {"auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length > 0 ? (
          <div className="space-y-2">
            {ergebnis.auswahl.map((a) => (
              <form
                key={`${a.quelle}-${a.bezugsId}`}
                action={anforderungenAbrufen}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="quelle" value={a.quelle} />
                <input type="hidden" name="bezugsId" value={a.bezugsId} />
                <input type="hidden" name="bankId" value={a.bankId ?? ""} />
                <input type="hidden" name="bankName" value={a.bankName} />
                <div className="text-sm">
                  <p className="font-medium">{a.bankName}</p>
                  <p className="text-muted-foreground">
                    {a.quelle === "antrag" ? "Antrag" : "Vorschlag"} {a.bezugsId}
                    {a.hinweis ? ` · ${a.hinweis}` : ""}
                  </p>
                </div>
                <button type="submit" className="feld h-8 shrink-0 px-3 text-sm">
                  Liste schärfen
                </button>
              </form>
            ))}
          </div>
        ) : null}

        {"auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Europace nennt zu diesem Vorgang weder Anträge noch Finanzierungsvorschläge.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 9: Karte einhängen**

In `src/app/(app)/cases/[id]/page.tsx` die Komponente importieren und dort einsetzen,
wo die anderen Fallkarten stehen (Muster: `europace-uebertragung.tsx` suchen mit
`grep -n "EuropaceUebertragung" src/app/\(app\)/cases/\[id\]/page.tsx`):

```tsx
<BankAnforderungen caseId={aggregate.caseId} abgleich={aggregate.anforderungsAbgleich} />
```

- [ ] **Step 10: Alles prüfen**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün

- [ ] **Step 11: Commit**

```bash
git add src/lib/anforderungen src/lib/actions/anforderungen.ts src/lib/actions/bank-requirements.ts src/components/case/bank-anforderungen.tsx "src/app/(app)/cases/[id]/page.tsx" src/lib/cases/service.ts tests/anforderungen-positionen.test.ts
git commit -m "feat(anforderungen): vierte Checklistenquelle, Abruf-Karte im Fall"
```

---

### Task 7: Gesamtlauf, Dokumentation, Deployment

- [ ] **Step 1: Vollständiger Lauf**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün

- [ ] **Step 2: Datenbanktests**

Run: `RUN_DB_IT=1 npx vitest run tests/anforderungen-speicher-db.test.ts tests/pglite.test.ts`
Expected: PASS

- [ ] **Step 3: README nachziehen**

In `README.md` bei den Europace-Umgebungsvariablen (Zeile ~97) ergänzen:

```markdown
> **Scopes im Zugangsantrag:** Neben `baufinanzierung:vorgang:schreiben|lesen`,
> `unterlagen:dokument:schreiben` und `unterlagen:unterlage:schreiben` müssen
> **`unterlagen:unterlage:lesen`** und **`unterlagen:freigabe:lesen`** beantragt
> werden. Ohne sie kommt der Zugang, aber die Unterlagenanforderungen der Bank
> bleiben unlesbar.
```

In der Statustabelle (Zeile ~158) eine Zeile ergänzen:

```markdown
| **Bank-Unterlagenanforderungen** | **echt (API)** | Liest `GET /dokumente/anforderungen` bzw. `/dokumente/antrag/anforderungen` und schärft damit die Fall-Checkliste. Wartet auf echte Zugangsdaten. Abruf nur auf Knopfdruck. |
```

Den Satz „es fehlen … der Rückkanal (Vorgang aus Europace laden)" (Zeile ~141)
anpassen: Der Rückkanal existiert jetzt lesend für Anträge, Vorschläge und
Anforderungen.

- [ ] **Step 4: Merge und Deployment**

```bash
git add README.md && git commit -m "docs(europace): Lese-Scopes und Anforderungs-Abruf in der README"
git checkout main
git merge --no-ff feat/bank-anforderungen -m "merge: Unterlagenliste an eine Bank schaerfen"
git push origin main
```

- [ ] **Step 5: Deployment prüfen**

```bash
for i in $(seq 1 30); do s=$(vercel ls --prod 2>&1 | grep -m1 -oE '● (Ready|Building|Error)'); case "$s" in *Ready*|*Error*) echo "$s"; break;; esac; sleep 20; done
git merge-base --is-ancestor $(git rev-parse HEAD) origin/main && echo "in main"
curl -s -o /dev/null -w "%{http_code}\n" https://baufidesk.de/cases
```

Expected: `Ready`, „in main", HTTP 307 (Passwort-Gate — das ist richtig, kein Fehler)

- [ ] **Step 6: Ehrlicher Abschlussbericht**

Im Bericht an Jürgen **muss** stehen: Der echte Netzaufruf gegen Europace ist
**nicht** getestet, weil keine Zugangsdaten vorliegen. Getestet sind Zuordnung,
Abgleich, Speicherung, Positionsbau und der Vertrag gegen die eingecheckte
Spezifikation. Erst der erste Abruf mit echtem Zugang beweist die Kette.

---

## Selbstprüfung

**Abdeckung der Spec:** Auslöser (Task 6), Endpunktkette (Task 4), Scopes (Task 4 +
7), Datenmodell (Task 3), Zuordnung (Task 1), Abgleich (Task 2), Einspeisung in die
Checkliste (Task 6), Anzeige (Task 6), Fehlerfälle (Task 4 Client + Task 6 Action),
Tests (jede Task), Schemadateien und HERKUNFT (Task 4).

**Bewusst nicht enthalten**, wie in der Spec festgehalten: `liegtVor`
zurückschreiben, Cron, mehrere aktive Banken, automatisch erzeugte Kundentexte.

**Offene Unsicherheit, die kein Plan auflösen kann:** ob die
Finanzierungsvorschlags-Endpunkte echte Daten liefern („Mockdaten"-Warnung) und ob
`produktanbieter.id` denselben Schlüsselraum nutzt wie das Banken-Wiki. Beides
entscheidet sich erst mit echten Zugangsdaten; der Antrags-Weg und der
Namensrückfall sind die Gegenmaßnahmen.
