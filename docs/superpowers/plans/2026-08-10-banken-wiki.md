# Banken-Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Finanzierungskriterien von 664 Banken als durchsuchbares Nachschlagewerk in BaufiDesk.

**Architecture:** Ein Importskript liest den Abzug aus `data/`, bereinigt den Freitext und schreibt ihn per Upsert in zwei organisationsübergreifende Tabellen. Eine Seite `/banken` sucht serverseitig über die Adresszeile; die Bankseite gruppiert die 69 Kriterien nach Kategorie und blendet Unbeantwortetes standardmäßig aus.

**Tech Stack:** Next.js App Router (Server Components), Prisma 6 / PostgreSQL (Supabase, Schema `unterlagenpilot`), Vitest, `tsx` für das Skript. Keine neue Abhängigkeit.

**Spec:** `docs/superpowers/specs/2026-08-10-banken-wiki-design.md`

## Global Constraints

- **„Keine Angabe" ist keine Ablehnung.** Es heißt: die Bank hat sich nicht geäußert. 46 % aller Felder (21.006 von 45.816) tragen diesen Status. Wer ihn wie „nicht machbar" darstellt, macht das Wiki unbrauchbar.
- **Fremdes HTML wird beim Import bereinigt**, nicht erst beim Anzeigen. Erlaubt: `p`, `br`, `ul`, `ol`, `li`, `strong`, `em` — **ohne Attribute**. In diesem Projekt gab es dafür schon einen Stored-XSS-Befund.
- **Der Status ist eine Zeichenkette, kein Datenbank-Enum.** Ein unbekannter sechster Wert darf den Import nicht zum Absturz bringen — protokollieren, neutral anzeigen.
- **Zwei Daten, nicht eines:** `standAm` ist das Datum von Europace je Zeile, `importiertAm` unser Abrufdatum. Auf der Seite steht beides und wird nicht verwechselt.
- **Der Import ist mehrfach ausführbar** und erzeugt keine Dubletten.
- **Deutsch in allem, was der Nutzer sieht.**
- **Schemaänderungen** über `scripts/supabase-sql.sh`, nie `prisma db push`.
- **Testlauf:** `npx vitest run <datei>`, `npm test`, `npm run typecheck`. Kein `npm run lint` — keine ESLint-Konfiguration im Projekt.

---

## File Structure

**Neu — `src/lib/banken/`:**

| Datei | Verantwortung |
|---|---|
| `status.ts` | die fünf Statuswerte: Beschriftung, Farbton, Umgang mit Unbekanntem |
| `bereinigen.ts` | HTML auf den erlaubten Satz reduzieren |
| `kategorien.ts` | Kriteriumsname → Kategorie, Rückfall „Sonstige" |
| `suche.ts` | Namensvergleich ohne Groß-/Kleinschreibung und Umlaute |
| `abfrage.ts` | Datenbankzugriffe für Liste und Bankseite |

**Neu (Skript und Seiten):** `scripts/banken-wiki-import.ts`,
`src/app/(app)/banken/page.tsx`, `src/app/(app)/banken/[bankId]/page.tsx`

**Geändert:** `prisma/schema.prisma`, `prisma/sql/2026-08-10-banken-wiki.sql`,
`src/components/sidebar-nav.tsx`

**Tests:** `tests/banken-status.test.ts`, `tests/banken-bereinigen.test.ts`,
`tests/banken-kategorien.test.ts`, `tests/banken-suche.test.ts`,
`tests/banken-import-db.test.ts`

**Reihenfolge:** Aufgaben 1–2 sind reine Funktionen. Danach Schema, Import, Seiten.

---

### Task 1: Status, Kategorien, Suche

Drei kleine reine Funktionen, die zusammen die Darstellungslogik tragen.

**Files:**
- Create: `src/lib/banken/status.ts`, `src/lib/banken/kategorien.ts`, `src/lib/banken/suche.ts`
- Test: `tests/banken-status.test.ts`, `tests/banken-kategorien.test.ts`, `tests/banken-suche.test.ts`

**Interfaces:**
- Produces:
  - `type BankStatus = "MACHBAR" | "VORBEHALTLICH" | "NICHT_MACHBAR" | "INFORMATION" | "KEINE_ANGABE"`
  - `const BEKANNTE_STATUS: readonly string[]`
  - `function statusAnzeige(status: string): { label: string; ton: "ready" | "review" | "blocker" | "neutral"; istUrteil: boolean }`
  - `function kategorieFuer(kriterium: string): string`
  - `function normalisiere(s: string): string`
  - `function passtZurSuche(name: string, suche: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/banken-status.test.ts
import { describe, it, expect } from "vitest";
import { statusAnzeige, BEKANNTE_STATUS } from "@/lib/banken/status";

describe("Statusanzeige", () => {
  it("kennt genau fuenf Werte", () => {
    expect(BEKANNTE_STATUS).toHaveLength(5);
  });

  it("stellt eine Ablehnung als Blocker dar", () => {
    const a = statusAnzeige("NICHT_MACHBAR");
    expect(a.ton).toBe("blocker");
    expect(a.label).toMatch(/nicht machbar/i);
    expect(a.istUrteil).toBe(true);
  });

  it("stellt einen Vorbehalt als Pruefpunkt dar", () => {
    expect(statusAnzeige("VORBEHALTLICH").ton).toBe("review");
  });

  it("stellt Machbarkeit als bereit dar", () => {
    expect(statusAnzeige("MACHBAR").ton).toBe("ready");
  });

  it("behandelt Information als neutral und NICHT als Urteil", () => {
    const a = statusAnzeige("INFORMATION");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
  });

  it("beschriftet 'Keine Angabe' als fehlende Aeusserung, nicht als Ablehnung", () => {
    const a = statusAnzeige("KEINE_ANGABE");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
    // Der Text muss klarstellen, dass die Bank sich nicht geaeussert hat.
    expect(a.label).toMatch(/nicht geäußert|keine Angabe/i);
    expect(a.label).not.toMatch(/nicht machbar|abgelehnt/i);
  });

  it("stuerzt bei einem unbekannten sechsten Wert nicht ab", () => {
    const a = statusAnzeige("VIELLEICHT_IRGENDWANN");
    expect(a.ton).toBe("neutral");
    expect(a.istUrteil).toBe(false);
    expect(a.label.length).toBeGreaterThan(0);
  });
});
```

```ts
// tests/banken-kategorien.test.ts
import { describe, it, expect } from "vitest";
import { kategorieFuer } from "@/lib/banken/kategorien";

describe("Kategoriezuordnung", () => {
  it("ordnet ein Antragstellerkriterium zu", () => {
    expect(kategorieFuer("Grenzgänger")).toBe("Antragsteller");
    expect(kategorieFuer("Auszubildende")).toBe("Antragsteller");
  });

  it("ordnet Immobilien-, Vorhaben- und Prozesskriterien zu", () => {
    expect(kategorieFuer("Ferienobjekt")).toBe("Immobilie");
    expect(kategorieFuer("Prolongation")).toBe("Vorhaben");
    expect(kategorieFuer("MaBV-Bürgschaft")).toBe("Prozesse");
  });

  it("faellt bei unbekanntem Kriterium auf Sonstige zurueck, statt zu scheitern", () => {
    expect(kategorieFuer("Völlig neues Kriterium")).toBe("Sonstige");
  });
});
```

```ts
// tests/banken-suche.test.ts
import { describe, it, expect } from "vitest";
import { normalisiere, passtZurSuche } from "@/lib/banken/suche";

describe("Namenssuche", () => {
  it("loest Umlaute auf", () => {
    expect(normalisiere("München")).toBe("muenchen");
  });

  it("findet Umlautorte ueber die ae-Schreibweise", () => {
    expect(passtZurSuche("Sparkasse München", "muenchen")).toBe(true);
    expect(passtZurSuche("Sparkasse München", "münchen")).toBe(true);
  });

  it("ignoriert Gross- und Kleinschreibung", () => {
    expect(passtZurSuche("Berliner Sparkasse", "SPARKASSE")).toBe(true);
  });

  it("findet Teiltreffer mitten im Namen", () => {
    expect(passtZurSuche("VR-Bank Main-Rhön eG", "rhoen")).toBe(true);
  });

  it("liefert bei leerer Suche alles", () => {
    expect(passtZurSuche("Irgendeine Bank", "")).toBe(true);
    expect(passtZurSuche("Irgendeine Bank", "   ")).toBe(true);
  });

  it("schliesst Nichttreffer aus", () => {
    expect(passtZurSuche("1822direkt", "sparkasse")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/banken-status.test.ts tests/banken-kategorien.test.ts tests/banken-suche.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/banken/status"`

- [ ] **Step 3: Write status.ts**

```ts
// src/lib/banken/status.ts

/**
 * Die fuenf Werte, die Europace liefert. Bewusst KEIN Datenbank-Enum: kaeme ein
 * sechster Wert, wuerde er den ganzen Import zum Absturz bringen.
 */
export const BEKANNTE_STATUS = [
  "MACHBAR",
  "VORBEHALTLICH",
  "NICHT_MACHBAR",
  "INFORMATION",
  "KEINE_ANGABE",
] as const;

export type BankStatus = (typeof BEKANNTE_STATUS)[number];

export interface StatusAnzeige {
  label: string;
  ton: "ready" | "review" | "blocker" | "neutral";
  /**
   * Trifft die Bank hier eine Aussage ueber Machbarkeit? Nur dann darf die
   * Zeile wie ein Urteil gelesen werden. "Keine Angabe" und "Information"
   * sind KEINE Urteile – das ist der Kern des ganzen Features.
   */
  istUrteil: boolean;
}

export function statusAnzeige(status: string): StatusAnzeige {
  switch (status) {
    case "MACHBAR":
      return { label: "machbar", ton: "ready", istUrteil: true };
    case "VORBEHALTLICH":
      return { label: "machbar unter Vorbehalt", ton: "review", istUrteil: true };
    case "NICHT_MACHBAR":
      return { label: "nicht machbar", ton: "blocker", istUrteil: true };
    case "INFORMATION":
      return { label: "Information", ton: "neutral", istUrteil: false };
    case "KEINE_ANGABE":
      return { label: "Bank hat sich nicht geäußert", ton: "neutral", istUrteil: false };
    default:
      // Unbekannter Wert: neutral zeigen statt abstuerzen oder raten.
      return { label: status || "unbekannt", ton: "neutral", istUrteil: false };
  }
}
```

- [ ] **Step 4: Write kategorien.ts**

```ts
// src/lib/banken/kategorien.ts
import daten from "../../../data/europace-kriterien-kategorien.json";

/**
 * Die Oberflaeche von Europace gruppiert die 69 Kriterien; die Schnittstelle
 * liefert diese Zuordnung NICHT mit. Sie wurde einmal aus der Oberflaeche
 * gezogen und liegt als Datei bei.
 */
const ZUORDNUNG: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [kategorie, namen] of Object.entries(daten.kategorien as Record<string, string[]>)) {
    for (const n of namen) m[n] = kategorie;
  }
  return m;
})();

/** Reihenfolge der Abschnitte auf der Bankseite. */
export const KATEGORIE_REIHENFOLGE = ["Antragsteller", "Immobilie", "Vorhaben", "Prozesse", "Sonstige"];

/**
 * Ein unbekanntes Kriterium landet in "Sonstige", statt den Import scheitern zu
 * lassen – Europace kann den Katalog jederzeit erweitern.
 */
export function kategorieFuer(kriterium: string): string {
  return ZUORDNUNG[kriterium] ?? "Sonstige";
}
```

**Achtung:** Der Import aus `data/` funktioniert nur, wenn `resolveJsonModule` in `tsconfig.json` aktiv ist (ist es) **und** der Ordner nicht vom Build ausgeschlossen wird. Schlägt der Build fehl, die Datei stattdessen nach `src/lib/banken/kategorien.json` kopieren und von dort importieren — sie ist klein und gehört fachlich zum Code.

- [ ] **Step 5: Write suche.ts**

```ts
// src/lib/banken/suche.ts

/**
 * Kleinschreibung, Umlaute in die ae-Form. Ohne das findet "muenchen" nichts,
 * und genau so tippt man im Alltag.
 */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leere Suche liefert alles. */
export function passtZurSuche(name: string, suche: string): boolean {
  const s = normalisiere(suche);
  if (!s) return true;
  return normalisiere(name).includes(s);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/banken-status.test.ts tests/banken-kategorien.test.ts tests/banken-suche.test.ts && npm run typecheck`
Expected: PASS, 16 Tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/banken/ tests/banken-status.test.ts tests/banken-kategorien.test.ts tests/banken-suche.test.ts
git commit -m "feat(banken): Status, Kategorien und Namenssuche"
```

---

### Task 2: HTML-Bereinigung

Der wichtigste Baustein: Wir holen fremden Inhalt in unsere Oberfläche.

**Files:**
- Create: `src/lib/banken/bereinigen.ts`
- Test: `tests/banken-bereinigen.test.ts`

**Interfaces:**
- Produces: `function bereinigeHtml(roh: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/banken-bereinigen.test.ts
import { describe, it, expect } from "vitest";
import { bereinigeHtml } from "@/lib/banken/bereinigen";

describe("HTML-Bereinigung – was durchkommt", () => {
  it("behaelt erlaubte Auszeichnung", () => {
    const r = bereinigeHtml("<p>Ein <strong>wichtiger</strong> Hinweis.</p>");
    expect(r).toContain("<p>");
    expect(r).toContain("<strong>");
    expect(r).toContain("wichtiger");
  });

  it("behaelt Listen", () => {
    const r = bereinigeHtml("<ul><li>eins</li><li>zwei</li></ul>");
    expect(r).toContain("<ul>");
    expect(r).toContain("<li>");
  });

  it("laesst reinen Text unveraendert", () => {
    expect(bereinigeHtml("Nur Text ohne Auszeichnung")).toBe("Nur Text ohne Auszeichnung");
  });
});

describe("HTML-Bereinigung – was NICHT durchkommt", () => {
  it("entfernt Skripte samt Inhalt", () => {
    const r = bereinigeHtml('<p>Hallo</p><script>alert("xss")</script>');
    expect(r).not.toMatch(/script/i);
    expect(r).not.toContain("alert");
    expect(r).toContain("Hallo");
  });

  it("entfernt Ereignis-Attribute", () => {
    const r = bereinigeHtml('<p onclick="stehlen()">Text</p>');
    expect(r).not.toMatch(/onclick/i);
    expect(r).toContain("Text");
  });

  it("entfernt Bilder mit onerror", () => {
    const r = bereinigeHtml('<img src=x onerror="alert(1)">');
    expect(r).not.toMatch(/img|onerror|alert/i);
  });

  it("entfernt Verweise – auch harmlos aussehende", () => {
    const r = bereinigeHtml('<a href="https://example.com">Klick</a>');
    expect(r).not.toMatch(/<a[\s>]/i);
    expect(r).toContain("Klick");
  });

  it("entfernt style-Attribute und iframes", () => {
    const r = bereinigeHtml('<p style="position:fixed">A</p><iframe src="x"></iframe>');
    expect(r).not.toMatch(/style=|iframe/i);
    expect(r).toContain("A");
  });

  it("kommt mit leerer und fehlender Eingabe zurecht", () => {
    expect(bereinigeHtml("")).toBe("");
    expect(bereinigeHtml(null as unknown as string)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/banken-bereinigen.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/banken/bereinigen"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/banken/bereinigen.ts

/** Erlaubte Auszeichnung – bewusst knapp und ohne jedes Attribut. */
const ERLAUBT = new Set(["p", "br", "ul", "ol", "li", "strong", "em", "b", "i"]);

/**
 * Reduziert fremdes HTML auf einen sicheren Satz.
 *
 * Laeuft beim IMPORT, nicht beim Anzeigen: Was in der Datenbank steht, ist
 * bereits sauber. In diesem Projekt gab es fuer ungepruefen Fremdinhalt schon
 * einen Stored-XSS-Befund im Review.
 *
 * Bewusst ohne Fremdbibliothek: Die Eingabe ist eng umrissen (Europace liefert
 * Absaetze und Listen), und eine eigene, vollstaendig getestete Funktion ist
 * hier weniger Angriffsflaeche als eine weitere Abhaengigkeit.
 */
export function bereinigeHtml(roh: string): string {
  if (!roh) return "";

  let s = String(roh);

  // 1) Elemente, deren INHALT ebenfalls weg muss.
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  // 2) Selbstschliessende oder unvollstaendige Varianten derselben Elemente.
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>/gi, "");
  // 3) Kommentare (koennen bedingte Auswertung enthalten).
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // 4) Alle uebrigen Tags: erlaubte ohne Attribute behalten, Rest entfernen.
  s = s.replace(/<\/?([a-zA-Z0-9-]+)\b[^>]*>/g, (treffer, name: string) => {
    const tag = name.toLowerCase();
    if (!ERLAUBT.has(tag)) return "";
    return treffer.startsWith("</") ? `</${tag}>` : `<${tag}>`;
  });

  return s.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/banken-bereinigen.test.ts && npm run typecheck`
Expected: PASS, 10 Tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/banken/bereinigen.ts tests/banken-bereinigen.test.ts
git commit -m "feat(banken): HTML-Bereinigung fuer fremden Freitext"
```

---

### Task 3: Datenbankschema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-08-10-banken-wiki.sql`

- [ ] **Step 1: Add the models**

Am Ende von `prisma/schema.prisma`:

```prisma
/**
 * Kreditinstitut aus dem Europace-Kriteriencheck. Bewusst OHNE
 * organizationId: die Kriterien sind fuer alle gleich – Referenzwissen,
 * keine Mandantendaten.
 */
model Bank {
  id               String   @id @default(cuid())
  /// Europace-Kennung, z. B. "SPK_DIREKT".
  bankId           String   @unique
  name             String
  zuletztGesehenAm DateTime

  kriterien BankKriterium[]

  @@index([name])
  @@map("banken")
}

/**
 * Ein Finanzierungskriterium einer Bank.
 *
 * `standAm` ist das Datum, das EUROPACE fuer diese Zeile nennt.
 * `importiertAm` ist unser Abrufdatum. Die beiden nie verwechseln: Wir koennen
 * heute geholt haben, waehrend die Bank sich zuletzt im Februar geaeussert hat.
 */
model BankKriterium {
  id        String @id @default(cuid())
  bankRefId String
  bank      Bank   @relation(fields: [bankRefId], references: [id], onDelete: Cascade)

  kriterium String
  kategorie String
  /// MACHBAR | VORBEHALTLICH | NICHT_MACHBAR | INFORMATION | KEINE_ANGABE
  /// Bewusst Text statt Enum – ein neuer Wert darf den Import nicht kippen.
  status    String
  /// Bereits bereinigtes HTML (siehe src/lib/banken/bereinigen.ts).
  inhalt    String

  standAm      DateTime?
  importiertAm DateTime

  @@unique([bankRefId, kriterium])
  @@index([kriterium, status])
  @@map("bank_kriterien")
}
```

- [ ] **Step 2: Generate the client**

Run: `npx prisma generate && npm run typecheck`
Expected: keine Fehler

- [ ] **Step 3: Write and apply the migration**

```sql
-- prisma/sql/2026-08-10-banken-wiki.sql
-- Banken-Wiki: Kreditinstitute und ihre Finanzierungskriterien.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-banken-wiki.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-banken-wiki.sql
--
-- Rein additiv: zwei neue Tabellen, kein DROP.

CREATE TABLE IF NOT EXISTS "banken" (
  "id"               TEXT PRIMARY KEY,
  "bankId"           TEXT NOT NULL UNIQUE,
  "name"             TEXT NOT NULL,
  "zuletztGesehenAm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "banken_name_idx" ON "banken"("name");

CREATE TABLE IF NOT EXISTS "bank_kriterien" (
  "id"           TEXT PRIMARY KEY,
  "bankRefId"    TEXT NOT NULL REFERENCES "banken"("id") ON DELETE CASCADE,
  "kriterium"    TEXT NOT NULL,
  "kategorie"    TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "inhalt"       TEXT NOT NULL,
  "standAm"      TIMESTAMP(3),
  "importiertAm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_kriterien_bankRefId_kriterium_key"
  ON "bank_kriterien"("bankRefId", "kriterium");
CREATE INDEX IF NOT EXISTS "bank_kriterien_kriterium_status_idx"
  ON "bank_kriterien"("kriterium", "status");
```

Run: `scripts/supabase-sql.sh prisma/sql/2026-08-10-banken-wiki.sql --dry-run`
Dann ohne `--dry-run`.

Gegenprüfen mit `prisma/sql/pruefe-banken-wiki.sql`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'unterlagenpilot' AND table_name IN ('banken','bank_kriterien')
ORDER BY table_name;
```

Run: `scripts/supabase-sql.sh prisma/sql/pruefe-banken-wiki.sql`
Expected: beide Tabellen gelistet

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/sql/
git commit -m "feat(banken): Schema fuer Banken und ihre Kriterien"
```

---

### Task 4: Import

**Files:**
- Create: `scripts/banken-wiki-import.ts`
- Create: `src/lib/banken/import.ts`
- Test: `tests/banken-import-db.test.ts`

**Interfaces:**
- Consumes: `bereinigeHtml`, `kategorieFuer`, `BEKANNTE_STATUS`
- Produces:
  - `interface AbzugBank { bankId: string; name: string; kriterien: Array<{ criterionName: string; status: string; content: string; lastUpdated: string | null }> }`
  - `async function importiereBanken(banken: AbzugBank[], jetzt?: Date): Promise<{ banken: number; zeilen: number; unbekannteStatus: string[]; ohneKategorie: string[] }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/banken-import-db.test.ts
import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Banken-Import (PGlite)", () => {
  let prisma: any;
  let importiereBanken: (b: any[], jetzt?: Date) => Promise<any>;

  const abzug = (status = "NICHT_MACHBAR", inhalt = "<p>Wird nicht unterstützt.</p>") => [
    {
      bankId: "TEST_BANK",
      name: "Testbank eG",
      kriterien: [
        { criterionName: "Auszubildende", status, content: inhalt, lastUpdated: "2026-06-04T15:43:06Z" },
        { criterionName: "Ferienobjekt", status: "KEINE_ANGABE", content: "", lastUpdated: null },
      ],
    },
  ];

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    ({ importiereBanken } = await import("@/lib/banken/import"));
  }, 180_000);

  it("legt Bank und Kriterien an", async () => {
    const r = await importiereBanken(abzug());
    expect(r.banken).toBe(1);
    expect(r.zeilen).toBe(2);

    const bank = await prisma.bank.findUnique({
      where: { bankId: "TEST_BANK" },
      include: { kriterien: true },
    });
    expect(bank.name).toBe("Testbank eG");
    expect(bank.kriterien).toHaveLength(2);
  });

  it("ordnet die Kategorie zu", async () => {
    await importiereBanken(abzug());
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.kategorie).toBe("Antragsteller");
  });

  it("uebernimmt das Datum von Europace getrennt vom Importdatum", async () => {
    const jetzt = new Date("2026-08-10T12:00:00Z");
    await importiereBanken(abzug(), jetzt);
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.standAm.toISOString().slice(0, 10)).toBe("2026-06-04");
    expect(k.importiertAm.toISOString().slice(0, 10)).toBe("2026-08-10");
  });

  it("laesst standAm leer, wenn Europace kein Datum nennt", async () => {
    await importiereBanken(abzug());
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Ferienobjekt" } });
    expect(k.standAm).toBeNull();
  });

  it("bereinigt den Freitext BEIM Import", async () => {
    await importiereBanken(abzug("NICHT_MACHBAR", '<p>Text</p><script>alert(1)</script>'));
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.inhalt).not.toMatch(/script|alert/i);
    expect(k.inhalt).toContain("Text");
  });

  it("erzeugt beim zweiten Lauf keine Dubletten und aktualisiert", async () => {
    await importiereBanken(abzug("NICHT_MACHBAR"));
    await importiereBanken(abzug("MACHBAR"));
    expect(await prisma.bank.count({ where: { bankId: "TEST_BANK" } })).toBe(1);
    expect(await prisma.bankKriterium.count({ where: { kriterium: "Auszubildende" } })).toBe(1);
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.status).toBe("MACHBAR");
  });

  it("meldet einen unbekannten Status, statt zu scheitern", async () => {
    const r = await importiereBanken(abzug("VIELLEICHT"));
    expect(r.unbekannteStatus).toContain("VIELLEICHT");
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Auszubildende" } });
    expect(k.status).toBe("VIELLEICHT");
  });

  it("meldet ein Kriterium ohne Kategorie, statt zu scheitern", async () => {
    const sonder = [
      {
        bankId: "TEST_BANK2",
        name: "Zweite Bank",
        kriterien: [
          { criterionName: "Brandneues Kriterium", status: "MACHBAR", content: "", lastUpdated: null },
        ],
      },
    ];
    const r = await importiereBanken(sonder);
    expect(r.ohneKategorie).toContain("Brandneues Kriterium");
    const k = await prisma.bankKriterium.findFirst({ where: { kriterium: "Brandneues Kriterium" } });
    expect(k.kategorie).toBe("Sonstige");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_IT=1 npx vitest run tests/banken-import-db.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/banken/import"`

- [ ] **Step 3: Write the import logic**

```ts
// src/lib/banken/import.ts
import { prisma } from "@/lib/db";
import { bereinigeHtml } from "./bereinigen";
import { kategorieFuer } from "./kategorien";
import { BEKANNTE_STATUS } from "./status";

export interface AbzugKriterium {
  criterionName: string;
  status: string;
  content: string;
  lastUpdated: string | null;
}

export interface AbzugBank {
  bankId: string;
  name: string;
  kriterien: AbzugKriterium[];
}

export interface ImportErgebnis {
  banken: number;
  zeilen: number;
  /** Statuswerte, die wir nicht kennen – gespeichert, aber gemeldet. */
  unbekannteStatus: string[];
  /** Kriterien ohne Kategoriezuordnung – gelandet in "Sonstige". */
  ohneKategorie: string[];
}

const alsDatum = (s: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Schreibt einen Abzug per Upsert. Mehrfach ausfuehrbar: derselbe Abzug zweimal
 * eingespielt erzeugt keine Dubletten, ein neuerer aktualisiert die Zeilen.
 *
 * Unbekannte Statuswerte und Kriterien ohne Kategorie werden GEMELDET, nicht
 * verschluckt – Europace kann den Katalog jederzeit erweitern, und das soll
 * auffallen, statt still danebenzulaufen.
 */
export async function importiereBanken(
  banken: AbzugBank[],
  jetzt: Date = new Date()
): Promise<ImportErgebnis> {
  const unbekannteStatus = new Set<string>();
  const ohneKategorie = new Set<string>();
  let zeilen = 0;

  for (const b of banken) {
    const bank = await prisma.bank.upsert({
      where: { bankId: b.bankId },
      create: { bankId: b.bankId, name: b.name, zuletztGesehenAm: jetzt },
      update: { name: b.name, zuletztGesehenAm: jetzt },
    });

    for (const k of b.kriterien) {
      if (!(BEKANNTE_STATUS as readonly string[]).includes(k.status)) {
        unbekannteStatus.add(k.status);
      }
      const kategorie = kategorieFuer(k.criterionName);
      if (kategorie === "Sonstige") ohneKategorie.add(k.criterionName);

      const werte = {
        kategorie,
        status: k.status,
        inhalt: bereinigeHtml(k.content),
        standAm: alsDatum(k.lastUpdated),
        importiertAm: jetzt,
      };

      await prisma.bankKriterium.upsert({
        where: { bankRefId_kriterium: { bankRefId: bank.id, kriterium: k.criterionName } },
        create: { bankRefId: bank.id, kriterium: k.criterionName, ...werte },
        update: werte,
      });
      zeilen++;
    }
  }

  return {
    banken: banken.length,
    zeilen,
    unbekannteStatus: [...unbekannteStatus],
    ohneKategorie: [...ohneKategorie],
  };
}
```

- [ ] **Step 4: Write the script**

```ts
// scripts/banken-wiki-import.ts
/**
 * Spielt den Europace-Abzug in die Datenbank.
 *
 *   npx tsx scripts/banken-wiki-import.ts data/europace-finanzierungskriterien.json
 *
 * Kein Cron: Der Europace-Endpunkt haengt an der angemeldeten Browsersitzung,
 * die ein Server nicht hat. Der Abzug wird von Hand geholt (siehe Spec),
 * dieses Skript spielt ihn ein. Mehrfach ausfuehrbar.
 */
import { readFileSync } from "node:fs";
import { importiereBanken, type AbzugBank } from "../src/lib/banken/import";

async function main() {
  const datei = process.argv[2] ?? "data/europace-finanzierungskriterien.json";
  const roh = JSON.parse(readFileSync(datei, "utf-8")) as { banken: AbzugBank[]; geholtAm?: string };

  if (!Array.isArray(roh.banken) || roh.banken.length === 0) {
    console.error(`Kein verwertbarer Abzug in ${datei}.`);
    process.exit(1);
  }

  console.log(`Spiele ${roh.banken.length} Banken aus ${datei} ein …`);
  const r = await importiereBanken(roh.banken);

  console.log(`Fertig: ${r.banken} Banken, ${r.zeilen} Kriterienzeilen.`);
  if (r.unbekannteStatus.length > 0) {
    console.warn(`Unbekannte Statuswerte (gespeichert, bitte prüfen): ${r.unbekannteStatus.join(", ")}`);
  }
  if (r.ohneKategorie.length > 0) {
    console.warn(`Ohne Kategorie, gelandet in "Sonstige": ${r.ohneKategorie.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("Import fehlgeschlagen:", e);
  process.exit(1);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `RUN_DB_IT=1 npx vitest run tests/banken-import-db.test.ts && npm run typecheck`
Expected: PASS, 8 Tests

- [ ] **Step 6: Run the real import**

Run: `npx tsx scripts/banken-wiki-import.ts data/europace-finanzierungskriterien.json`
Expected: `Fertig: 664 Banken, 45816 Kriterienzeilen.`

Meldet das Skript unbekannte Statuswerte oder Kriterien ohne Kategorie: **nicht ignorieren** — es heißt, Europace hat den Katalog erweitert und `data/europace-kriterien-kategorien.json` ist veraltet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/banken/import.ts scripts/banken-wiki-import.ts tests/banken-import-db.test.ts
git commit -m "feat(banken): Import des Europace-Abzugs, mehrfach ausfuehrbar"
```

---

### Task 5: Suchseite und Bankseite

**Files:**
- Create: `src/lib/banken/abfrage.ts`
- Create: `src/app/(app)/banken/page.tsx`, `src/app/(app)/banken/[bankId]/page.tsx`
- Modify: `src/components/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `passtZurSuche`, `statusAnzeige`, `KATEGORIE_REIHENFOLGE`
- Produces:
  - `async function sucheBanken(q: string, limit?: number): Promise<Array<{ bankId: string; name: string; urteile: number }>>`
  - `async function ladeBank(bankId: string): Promise<{ name: string; importiertAm: Date | null; kriterien: Array<{ kriterium: string; kategorie: string; status: string; inhalt: string; standAm: Date | null }> } | null>`

- [ ] **Step 1: Write the query layer**

```ts
// src/lib/banken/abfrage.ts
import { prisma } from "@/lib/db";
import { passtZurSuche } from "./suche";

/**
 * Banken zur Suche. 664 Namen passen muehelos in den Speicher – deshalb wird
 * im Prozess gefiltert statt mit einer datenbankseitigen Textsuche, die
 * Umlaute anders behandelt als der Nutzer erwartet.
 */
export async function sucheBanken(q: string, limit = 50) {
  const alle = await prisma.bank.findMany({
    select: {
      bankId: true,
      name: true,
      _count: { select: { kriterien: { where: { status: { in: ["NICHT_MACHBAR", "VORBEHALTLICH"] } } } } },
    },
    orderBy: { name: "asc" },
  });

  return alle
    .filter((b) => passtZurSuche(b.name, q))
    .slice(0, limit)
    .map((b) => ({ bankId: b.bankId, name: b.name, urteile: b._count.kriterien }));
}

export async function ladeBank(bankId: string) {
  const bank = await prisma.bank.findUnique({
    where: { bankId },
    include: { kriterien: { orderBy: { kriterium: "asc" } } },
  });
  if (!bank) return null;

  return {
    name: bank.name,
    importiertAm: bank.kriterien[0]?.importiertAm ?? null,
    kriterien: bank.kriterien.map((k) => ({
      kriterium: k.kriterium,
      kategorie: k.kategorie,
      status: k.status,
      inhalt: k.inhalt,
      standAm: k.standAm,
    })),
  };
}
```

Schlägt der `_count`-Filter im installierten Prisma-Client fehl (gefilterte Zähler sind erst ab Prisma 5.x verfügbar), stattdessen `kriterien: { where: { status: { in: [...] } }, select: { id: true } }` laden und im Code zählen.

- [ ] **Step 2: Build the search page**

```tsx
// src/app/(app)/banken/page.tsx
import Link from "next/link";
import { Landmark } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { sucheBanken } from "@/lib/banken/abfrage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function BankenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireContext();
  const { q } = await searchParams;
  const treffer = await sucheBanken(q ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banken-Wiki"
        subtitle="Finanzierungskriterien der Kreditinstitute – nachschlagen, bevor du einreichst."
      />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Bank suchen</span>
              <Input name="q" defaultValue={q ?? ""} placeholder="z. B. Sparkasse, ING, muenchen" />
            </label>
            <button type="submit" className="feld h-9 px-4 text-sm">
              Suchen
            </button>
          </form>
        </CardContent>
      </Card>

      {treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Bank gefunden. Umlaute lassen sich auch als „ae", „oe", „ue" schreiben.
        </p>
      ) : (
        <div className="space-y-2">
          {treffer.map((b) => (
            <Link key={b.bankId} href={`/banken/${encodeURIComponent(b.bankId)}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Landmark className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium">{b.name}</span>
                  </div>
                  {b.urteile > 0 && (
                    <Badge variant="neutral">{b.urteile} Einschränkungen</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the bank page**

```tsx
// src/app/(app)/banken/[bankId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeBank } from "@/lib/banken/abfrage";
import { statusAnzeige } from "@/lib/banken/status";
import { KATEGORIE_REIHENFOLGE } from "@/lib/banken/kategorien";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TONE } from "@/lib/ui/tone";

export const dynamic = "force-dynamic";

const datum = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "—");

export default async function BankPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ alle?: string }>;
}) {
  await requireContext();
  const { bankId } = await params;
  const { alle } = await searchParams;
  const zeigeAlle = alle === "1";

  const bank = await ladeBank(decodeURIComponent(bankId));
  if (!bank) notFound();

  const sichtbar = zeigeAlle
    ? bank.kriterien
    : bank.kriterien.filter((k) => k.status !== "KEINE_ANGABE");

  const ausschluesse = bank.kriterien.filter((k) => k.status === "NICHT_MACHBAR").length;
  const vorbehalte = bank.kriterien.filter((k) => k.status === "VORBEHALTLICH").length;
  const unbeantwortet = bank.kriterien.length - sichtbar.length;

  return (
    <div className="space-y-6">
      <Link
        href="/banken"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Bankensuche
      </Link>

      <PageHeader
        eyebrow="Banken-Wiki"
        title={bank.name}
        subtitle={`${ausschluesse} harte Ausschlüsse · ${vorbehalte} unter Vorbehalt · Abzug vom ${datum(bank.importiertAm)}`}
      />

      {KATEGORIE_REIHENFOLGE.map((kat) => {
        const zeilen = sichtbar.filter((k) => k.kategorie === kat);
        if (zeilen.length === 0) return null;
        return (
          <section key={kat} className="space-y-2">
            <h2 className="text-sm font-semibold">{kat}</h2>
            {zeilen.map((k) => {
              const a = statusAnzeige(k.status);
              return (
                <Card key={k.kriterium}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium">{k.kriterium}</p>
                      <Badge variant={TONE[a.ton].badge}>{a.label}</Badge>
                    </div>
                    {k.inhalt && (
                      <div
                        className="prose-sm mt-2 text-sm text-muted-foreground [&_li]:ml-4 [&_li]:list-disc"
                        // Bereits beim Import bereinigt (src/lib/banken/bereinigen.ts).
                        dangerouslySetInnerHTML={{ __html: k.inhalt }}
                      />
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Stand laut Europace: {datum(k.standAm)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        );
      })}

      {!zeigeAlle && unbeantwortet > 0 && (
        <Link
          href={`/banken/${encodeURIComponent(bankId)}?alle=1`}
          className="inline-block text-sm underline"
        >
          {unbeantwortet} Kriterien anzeigen, zu denen sich die Bank nicht geäußert hat
        </Link>
      )}
      {zeigeAlle && (
        <Link href={`/banken/${encodeURIComponent(bankId)}`} className="inline-block text-sm underline">
          Unbeantwortetes ausblenden
        </Link>
      )}
    </div>
  );
}
```

**Prüfen:** `TONE[a.ton].badge` gegen `src/lib/ui/tone.ts` abgleichen —
`grep -n "badge\|export const TONE" src/lib/ui/tone.ts`. Gibt es dort kein
`badge`-Feld, die passende Badge-Variante direkt zuordnen
(`blocker` → `destructive`, `review` → `warning`, `ready` → `success`,
`neutral` → `neutral`).

- [ ] **Step 4: Add the navigation entry**

In `src/components/sidebar-nav.tsx` in der Gruppe „Arbeit" nach dem
Pipeline-Eintrag ergänzen und `Landmark` importieren:

```ts
      { href: "/banken", label: "Banken-Wiki", icon: Landmark },
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: beide ohne Fehler

- [ ] **Step 6: Sanity-Prüfung**

Die Seite `/banken` öffnen, nach „ing" suchen, die ING öffnen und prüfen:
- Kopfzeile nennt Ausschlüsse, Vorbehalte und das Abzugsdatum
- die vier Kategorien erscheinen in fester Reihenfolge
- „Keine Angabe" ist zunächst ausgeblendet, der Schalter blendet es ein
- eingeblendete Zeilen sagen „Bank hat sich nicht geäußert", **nicht** „nicht machbar"
- der Freitext ist lesbar und enthält kein rohes HTML

- [ ] **Step 7: Commit**

```bash
git add src/lib/banken/abfrage.ts "src/app/(app)/banken" src/components/sidebar-nav.tsx
git commit -m "feat(banken): Suchmaske und Bankseite"
```

---

### Task 6: Gesamtlauf und Deployment

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün

- [ ] **Step 2: DB tests**

Run: `RUN_DB_IT=1 npx vitest run tests/banken-import-db.test.ts tests/pglite.test.ts`
Expected: PASS

- [ ] **Step 3: Merge and deploy**

```bash
git checkout main
git merge --no-ff feat/banken-wiki -m "merge: Banken-Wiki"
git push origin main
```

- [ ] **Step 4: Import gegen die Produktionsdatenbank**

Das Skript schreibt gegen die Datenbank aus der lokalen Umgebung. Damit die
Daten **in der Produktion** landen, muss es mit der Produktions-`DATABASE_URL`
laufen — diese ist in Vercel als sensitiv markiert und nicht auslesbar.

**Deshalb hier stoppen und Jürgen fragen**, wie der Import in die Produktion
gelangen soll. Ohne Antwort ist das Wiki live, aber leer. Die Optionen sind
gleichwertig genug, dass es seine Entscheidung ist: die URL einmalig lokal
bereitstellen, oder eine geschützte Import-Route in der Anwendung.

- [ ] **Step 5: Verify deployment**

1. `git merge-base --is-ancestor <commit> origin/main && echo "in main"`
2. `vercel ls --prod` — neuestes Deployment `Ready`
3. `/banken` in der Produktion öffnen

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| 2.1 „Keine Angabe" ist keine Ablehnung | 1 (eigener Test), 5 (Ausblenden + Beschriftung) |
| 2.2 Kategorien aus separater Datei | 1 |
| 4 Datenmodell, organisationsübergreifend | 3 |
| 4.1 Status als Zeichenkette, Unbekanntes melden | 1, 4 |
| 4.2 HTML beim Import bereinigen | 2, 4 |
| 5 Import als Skript, mehrfach ausführbar | 4 |
| 6.1 Suche ohne Umlaut-/Schreibweisenproblem | 1, 5 |
| 6.2 Bankseite mit beiden Daten | 5 |
| 6.3 „Keine Angabe" ausgeblendet, umschaltbar | 5 |
| 7 Absicherung | 1, 2, 4 |

**Beim Gegenlesen gefunden und korrigiert:**

1. **Der Import in die Produktion war ungeklärt.** Das Skript schreibt gegen die
   Datenbank der lokalen Umgebung; die Produktions-`DATABASE_URL` ist in Vercel
   write-only. Ohne diesen Schritt wäre das Wiki live, aber leer — der Plan hält
   jetzt an dieser Stelle an und fragt, statt eine Lösung zu erfinden.

2. **`inhalt` kann leer sein.** Bei `KEINE_ANGABE` liefert Europace teils einen
   Standardsatz, teils nichts. Die Bankseite rendert den Block nur, wenn Inhalt
   da ist — sonst stünde ein leerer Kasten.

3. **Die Zusammenfassung zählt über ALLE Kriterien**, nicht nur über die
   sichtbaren. Sonst änderte sich die Zahl der Ausschlüsse beim Umschalten der
   Ansicht, was niemand erwartet.

**Typkonsistenz geprüft:** `statusAnzeige`, `kategorieFuer`, `passtZurSuche`,
`bereinigeHtml`, `importiereBanken`, `sucheBanken`, `ladeBank` heißen in allen
Tasks gleich. Das Prisma-Feld heißt durchgängig `bankRefId` für die Beziehung
und `bankId` für die Europace-Kennung — die Verwechslung dieser beiden wäre der
naheliegendste Fehler, deshalb sind sie im Schema kommentiert.

**Bekannte Unschärfen mit Prüfschritt:** das `badge`-Feld in `TONE`
(Task 5, Step 3), der gefilterte `_count` in Prisma (Task 5, Step 1) und der
JSON-Import aus `data/` im Produktionsbuild (Task 1, Step 4).
