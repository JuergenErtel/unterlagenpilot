# Erstgespräch (geführtes Interview) — Umsetzungsplan

> **Für agentische Ausführung:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Schritte tragen Checkboxen (`- [ ]`).

**Ziel:** Ein Vermittlermodus über dem bestehenden Fragenkatalog, mit dem Jürgen im Erstgespräch gemeinsam mit dem Kunden alle Angaben erfasst, die für ein Europace-Angebot zählen.

**Architektur:** Ein Katalog, zwei Ansichten. Der Kundenmodus (Magic Link, Freigabe) bleibt unangetastet. Der neue Vermittlermodus schreibt direkt in die Falldaten und nutzt dafür denselben Schreibkern wie die Selbstauskunfts-Übernahme. Die Angebotsreife ist eine reine Funktion über dem Fall, keine gespeicherte Zahl.

**Tech-Stack:** Next.js App Router (Server Components + Server Actions), Prisma, Vitest, Tailwind.

**Spezifikation:** `docs/superpowers/specs/2026-08-12-erstgespraech-design.md`

## Globale Randbedingungen

- **Kein Feld blockiert.** Keine Pflichtfeldprüfung, keine Validierung, die das Speichern verhindert. Die Fortschrittsleiste informiert, sie sperrt nicht.
- **„An Europace übertragen" ist immer bedienbar**, auch bei 3 von 26 Angaben. Lücken werden gemeldet, nie erzwungen.
- **Die manuelle Freigabe vor jeder Übertragung bleibt** (`pruefeEuropaceFreigabe`). Sie ist eine Zusage an den Kunden, kein Vollständigkeitsgatter.
- **Ein Katalog.** Keine zweite Fragenliste. Neue Fragen wirken in beiden Modi.
- Alle Bezeichner und Kommentare auf Deutsch, wie im übrigen Code.
- Schemaänderungen gegen PROD **nur** per `scripts/supabase-sql.sh` mit gezieltem `ALTER TABLE`, nie `migrate diff`.

## Dateien im Überblick

| Datei | Verantwortung |
|---|---|
| `src/lib/domain/enums.ts` (M) | `freiberufler` im Enum + Label |
| `prisma/schema.prisma` (M) | `freiberufler`; drei Felder an `FinancingRequest` |
| `src/lib/platforms/finlink/dto.ts` (M) | `freelancer` → `freiberufler` |
| `src/lib/platforms/europace/kundenangaben-mapping.ts` (M) | `freiberufler` → `FREIBERUFLER` |
| `src/lib/checklists/templates.ts` (M) | Vorlage `freiberufler_kauf`, Gehaltsabrechnung ausschließen |
| `src/lib/checklists/engine.ts` (M) | Vorlagenauswahl für `freiberufler` |
| `src/lib/erstgespraech/reife.ts` (N) | Welche der 26 Angaben fehlen — reine Funktion |
| `src/lib/erstgespraech/nebenkosten-vorschau.ts` (N) | Nebenkosten aus dem Fallstand, ohne Solver-Ballast |
| `src/lib/actions/zielwert.ts` (N) | `schreibeZielwert` — gemeinsamer Schreibkern |
| `src/lib/actions/erstgespraech.ts` (N) | Server Action: ein Feld speichern |
| `src/app/(app)/cases/[id]/erstgespraech/page.tsx` (N) | Die Seite |
| `src/components/erstgespraech/abschnitt.tsx` (N) | Ein Abschnitt, ein-/ausklappbar |
| `src/components/erstgespraech/feld.tsx` (N) | Ein Feld, speichert bei Verlassen |
| `src/components/erstgespraech/reifeleiste.tsx` (N) | Fortschritt |
| `src/components/erstgespraech/uebergabe.tsx` (N) | Kopiermaske + Übertragen-Knopf |
| `src/lib/cases/next-step.ts` (M) | Stufe `erstgespraech` |

**Bewusst NICHT in diesem Plan:** Zinsbindung, Sondertilgung und Wunschrate an Europace zu senden. Das Europace-Schema führt sie unter `finanzierungsbausteine` (`sondertilgungJaehrlich`, `rateMonatlich`), unser Mapping füllt dort heute nur `darlehensbetrag`. Ohne Europace-Zugang lässt sich die Erweiterung nicht gegen die echte API prüfen — sie kommt, wenn der Zugang da ist. Die Kopiermaske trägt die Werte ab Tag eins.

---

### Aufgabe 1: Beschäftigungsart „Freiberufler"

**Dateien:**
- Ändern: `src/lib/domain/enums.ts`, `prisma/schema.prisma`, `src/lib/platforms/finlink/dto.ts`, `src/lib/platforms/europace/kundenangaben-mapping.ts`, `src/lib/checklists/templates.ts`, `src/lib/checklists/engine.ts`
- Test: `tests/checklist.test.ts`, `tests/finlink-dto.test.ts`, `tests/europace-mapping.test.ts`

**Schnittstellen:**
- Erzeugt: `EmploymentType` enthält `"freiberufler"`; Vorlagenschlüssel `"freiberufler_kauf"`.

- [ ] **Schritt 1: Die scheiternden Tests schreiben**

In `tests/finlink-dto.test.ts`:

```ts
it("uebersetzt freelancer auf die eigene Kategorie, nicht auf selbststaendig", () => {
  const body = {
    data: [{ id: "as-1", attributes: { first_name: "Mo", employment_status: "freelancer" } }],
  };
  const [a] = parseFinLinkApplicantsResponse(body);
  expect(a!.beschaeftigung?.art).toBe("freiberufler");
});
```

In `tests/checklist.test.ts`:

```ts
it("verlangt vom Freiberufler EUER statt Bilanz", () => {
  const eingabe = {
    financingType: "kauf" as const,
    applicantCount: 1,
    applicantIds: ["a1"],
    applicants: [{ id: "a1", employmentType: "freiberufler" as const }],
  };
  const list = buildChecklistForCase(eingabe, []);
  const schluessel = list.map((p) => p.key);
  expect(schluessel).toContain("euer");
  expect(schluessel).toContain("bwa");
  expect(schluessel).not.toContain("jahresabschluss");
  expect(schluessel).not.toContain("susa");
  expect(schluessel).not.toContain("gehaltsabrechnung");
});
```

In `tests/europace-mapping.test.ts` (Datei existiert; ans Ende anfügen):

```ts
it("sendet FREIBERUFLER als eigenen Typ – das Schema kennt ihn", () => {
  const r = canonicalToKundenangaben(
    {
      applicants: [{ position: 1, vorname: "Mo", nachname: "Lahwani" }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "freiberufler" }],
      income: [], liabilities: [], assets: [], financing: {}, platformIds: {},
    } as never,
    "TEST_MODUS"
  );
  const kunde = r.kundenangaben.haushalte![0]!.kunden![0]!;
  expect(kunde.finanzielles?.beschaeftigung?.["@type"]).toBe("FREIBERUFLER");
});
```

- [ ] **Schritt 2: Tests laufen lassen — sie müssen scheitern**

Ausführen: `npx vitest run tests/finlink-dto.test.ts tests/checklist.test.ts tests/europace-mapping.test.ts`
Erwartung: FAIL — `freiberufler` ist kein gültiger Wert.

- [ ] **Schritt 3: Enum und Label ergänzen**

In `src/lib/domain/enums.ts`, `EMPLOYMENT_TYPES` nach `"selbststaendiger"` einfügen:

```ts
  "selbststaendiger",
  "freiberufler",
```

und in `EMPLOYMENT_TYPE_LABELS`:

```ts
  freiberufler: "Freiberufler:in",
```

In `prisma/schema.prisma`, `enum EmploymentType` um `freiberufler` erweitern (Reihenfolge wie im TS-Enum).

- [ ] **Schritt 4: Die drei Zuordnungen ergänzen**

`src/lib/platforms/finlink/dto.ts`, in `EMPLOYMENT_DE`:

```ts
  self_employed: "selbststaendiger",
  freelancer: "freiberufler", // eigene Kategorie: Europace fuehrt FREIBERUFLER getrennt
```

`src/lib/platforms/europace/kundenangaben-mapping.ts`, in `BESCHAEFTIGUNGSTYP`:

```ts
  selbststaendiger: "SELBSTSTAENDIGER",
  freiberufler: "FREIBERUFLER",
```

`src/lib/checklists/templates.ts`, neue Vorlage direkt nach `selbststaendiger_kauf`:

```ts
  {
    key: "freiberufler_kauf",
    name: "Freiberufler + Kauf",
    description: "Kauf durch freiberuflich taetige Antragsteller.",
    // Ein Freiberufler ermittelt den Gewinn per Einnahmen-Ueberschuss-Rechnung,
    // nicht per Bilanz: kein Jahresabschluss, keine Summen-/Saldenliste.
    items: [I.ausweis, I.estBescheid, I.estErklaerung, I.euer, I.bwa, I.eigenkapital, I.grundbuch, I.expose],
  },
```

Im selben Bestand die Gehaltsabrechnung unangetastet lassen — `freiberufler` steht schlicht nicht in ihrer `nurBeiBeschaeftigung`-Liste und ist damit ausgeschlossen.

`src/lib/checklists/engine.ts`, in der `switch (art)`-Kette:

```ts
      case "selbststaendiger":
        keys.add("selbststaendiger_kauf");
        break;
      case "freiberufler":
        keys.add("freiberufler_kauf");
        break;
```

- [ ] **Schritt 5: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run && npx tsc --noEmit`
Erwartung: PASS. Der erschöpfende `Record<EmploymentType, …>` in `BESCHAEFTIGUNGSTYP` und `EMPLOYMENT_TYPE_LABELS` erzwingt die Vollständigkeit — fehlt eine Stelle, meldet es der Typecheck.

- [ ] **Schritt 6: Schema gegen PROD nachziehen**

```bash
cat > /tmp/freiberufler.sql <<'SQL'
ALTER TYPE unterlagenpilot."EmploymentType" ADD VALUE IF NOT EXISTS 'freiberufler';
SQL
scripts/supabase-sql.sh /tmp/freiberufler.sql
```

**Wenn das scheitert:** `scripts/supabase-sql.sh` faehrt jede Datei in einer
Transaktion. Aeltere Postgres-Versionen verweigern `ALTER TYPE … ADD VALUE`
darin ("cannot run inside a transaction block"). Kommt dieser Fehler, den
Befehl einmalig ohne Transaktion absetzen — NICHT das Skript umbauen, andere
Aufgaben verlassen sich auf dessen Rollback-Verhalten:

```bash
npx tsx --env-file=.env -e 'import{PrismaClient}from"@prisma/client";const p=new PrismaClient();await p.$executeRawUnsafe(`ALTER TYPE unterlagenpilot."EmploymentType" ADD VALUE IF NOT EXISTS '"'"'freiberufler'"'"'`);await p.$disconnect()'
```

Gegenprüfen:

```bash
cat > /tmp/pruef.sql <<'SQL'
SELECT unnest(enum_range(NULL::unterlagenpilot."EmploymentType"))::text AS wert;
SQL
scripts/supabase-sql.sh /tmp/pruef.sql
```

Erwartung: `freiberufler` ist in der Liste.

- [ ] **Schritt 7: Commit**

```bash
git add -A
git commit -m "feat(stammdaten): Freiberufler als eigene Beschaeftigungsart"
```

---

### Aufgabe 2: Drei Konditionsfelder am Finanzierungswunsch

**Dateien:**
- Ändern: `prisma/schema.prisma`, `src/lib/domain/canonical.ts`, `src/lib/platforms/case-loader.ts`
- Test: `tests/canonical-loader.test.ts` (falls nicht vorhanden: `tests/erstgespraech-felder.test.ts` anlegen)

**Schnittstellen:**
- Erzeugt: `CanonicalFinancing` trägt `zinsbindungJahre?: number`, `sondertilgungGewuenscht?: boolean`, `wunschrateMonatlich?: number`.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

`tests/erstgespraech-felder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CanonicalFinancing } from "@/lib/domain/canonical";

describe("Konditionswuensche im kanonischen Modell", () => {
  it("traegt Zinsbindung, Sondertilgung und Wunschrate", () => {
    const f: CanonicalFinancing = {
      kaufpreis: 895000,
      zinsbindungJahre: 15,
      sondertilgungGewuenscht: true,
      wunschrateMonatlich: 2400,
    };
    expect(f.zinsbindungJahre).toBe(15);
    expect(f.sondertilgungGewuenscht).toBe(true);
    expect(f.wunschrateMonatlich).toBe(2400);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

Ausführen: `npx vitest run tests/erstgespraech-felder.test.ts`
Erwartung: FAIL beim Typecheck der Testdatei — die Felder gibt es nicht.

- [ ] **Schritt 3: Prisma-Modell erweitern**

In `prisma/schema.prisma`, `model FinancingRequest`, nach `grunderwerbsteuerProzent`:

```prisma
  /// Gewuenschte Zinsbindung in Jahren. Freie Zahl, keine Auswahlliste:
  /// 5/10/15/20/30 sind ueblich, aber nicht die einzigen Werte.
  zinsbindungJahre         Int?
  /// Wunsch nach jaehrlicher Sondertilgungsoption. null = nicht gefragt,
  /// false = ausdruecklich nicht gewuenscht.
  sondertilgungGewuenscht  Boolean?
  /// Monatliche Wunschrate des Kunden. Nebenbedingung fuer den
  /// Machbarkeits-Solver: Er rechnet sonst nur gegen die TRAGBARE Rate.
  wunschrateMonatlich      Float?
```

- [ ] **Schritt 4: Kanonisches Modell und Loader erweitern**

`src/lib/domain/canonical.ts`, in `CanonicalFinancing`:

```ts
  zinsbindungJahre?: number;
  sondertilgungGewuenscht?: boolean;
  wunschrateMonatlich?: number;
```

`src/lib/platforms/case-loader.ts`, im `financing`-Block ergänzen (die vorhandenen Zeilen als Muster nehmen):

```ts
      zinsbindungJahre: c.financingRequest.zinsbindungJahre ?? undefined,
      sondertilgungGewuenscht: c.financingRequest.sondertilgungGewuenscht ?? undefined,
      wunschrateMonatlich: c.financingRequest.wunschrateMonatlich ?? undefined,
```

- [ ] **Schritt 5: Test laufen lassen — er muss bestehen**

Ausführen: `npx prisma generate && npx vitest run tests/erstgespraech-felder.test.ts && npx tsc --noEmit`
Erwartung: PASS.

- [ ] **Schritt 6: Schema gegen PROD nachziehen**

```bash
cat > /tmp/konditionen.sql <<'SQL'
ALTER TABLE unterlagenpilot.financing_requests
  ADD COLUMN IF NOT EXISTS "zinsbindungJahre" INTEGER,
  ADD COLUMN IF NOT EXISTS "sondertilgungGewuenscht" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "wunschrateMonatlich" DOUBLE PRECISION;
SQL
scripts/supabase-sql.sh /tmp/konditionen.sql
```

Gegenprüfen:

```bash
cat > /tmp/pruef2.sql <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_schema='unterlagenpilot' AND table_name='financing_requests'
  AND column_name IN ('zinsbindungJahre','sondertilgungGewuenscht','wunschrateMonatlich');
SQL
scripts/supabase-sql.sh /tmp/pruef2.sql
```

Erwartung: drei Zeilen.

- [ ] **Schritt 7: Commit**

```bash
git add -A
git commit -m "feat(finanzierung): Zinsbindung, Sondertilgung und Wunschrate erfassen"
```

---

### Aufgabe 3: Angebotsreife berechnen

**Dateien:**
- Anlegen: `src/lib/erstgespraech/reife.ts`
- Test: `tests/erstgespraech-reife.test.ts`

**Schnittstellen:**
- Erzeugt:
  ```ts
  export interface ReifeFeld { schluessel: string; label: string; abschnitt: string; gefuellt: boolean; person?: 1 | 2 }
  export interface Reife { felder: ReifeFeld[]; gefuellt: number; gesamt: number }
  export function berechneReife(stand: Fallstand, antragstellerZahl: number): Reife
  ```
  `Fallstand` wird aus `@/lib/self-disclosure/takeover` importiert und wiederverwendet.

- [ ] **Schritt 1: Die scheiternden Tests schreiben**

`tests/erstgespraech-reife.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { berechneReife } from "@/lib/erstgespraech/reife";

const leer = { applicants: [{ position: 1 }], property: null, financingRequest: null, caseFelder: {} };

describe("Angebotsreife", () => {
  it("zaehlt bei einem leeren Fall nichts als gefuellt", () => {
    const r = berechneReife(leer, 1);
    expect(r.gefuellt).toBe(0);
    expect(r.gesamt).toBeGreaterThan(15);
  });

  it("zaehlt personenbezogene Felder je Antragsteller doppelt", () => {
    const einer = berechneReife(leer, 1).gesamt;
    const zwei = berechneReife(
      { ...leer, applicants: [{ position: 1 }, { position: 2 }] },
      2
    ).gesamt;
    expect(zwei).toBeGreaterThan(einer);
  });

  it("erkennt gefuellte Felder ueber alle Entitaeten", () => {
    const r = berechneReife(
      {
        applicants: [{ position: 1, vorname: "Mo", nachname: "Lahwani", geburtsdatum: new Date("1987-09-18") }],
        property: { objektart: "einfamilienhaus", wohnflaeche: 242.7 },
        financingRequest: { kaufpreis: 895000, zinsbindungJahre: 15 },
        caseFelder: { financingType: "kauf" },
      },
      1
    );
    const gefuellt = r.felder.filter((f) => f.gefuellt).map((f) => f.schluessel);
    expect(gefuellt).toContain("kaufpreis");
    expect(gefuellt).toContain("zinsbindungJahre");
    expect(gefuellt).toContain("objektart");
  });

  it("wertet 0 und false als gefuellt, nur null/leer als Luecke", () => {
    // Eine Wunschrate von 0 ist unsinnig, aber "keine Sondertilgung
    // gewuenscht" (false) ist eine ANTWORT und darf nicht als Luecke zaehlen.
    const r = berechneReife(
      { ...leer, financingRequest: { sondertilgungGewuenscht: false, maklerprovisionProzent: 0 } },
      1
    );
    const gefuellt = r.felder.filter((f) => f.gefuellt).map((f) => f.schluessel);
    expect(gefuellt).toContain("sondertilgungGewuenscht");
    expect(gefuellt).toContain("maklerprovisionProzent");
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen — sie müssen scheitern**

Ausführen: `npx vitest run tests/erstgespraech-reife.test.ts`
Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Schritt 3: Modul schreiben**

`src/lib/erstgespraech/reife.ts`:

```ts
import type { Fallstand } from "@/lib/self-disclosure/takeover";

/**
 * Welche der angebotsrelevanten Angaben stehen, welche fehlen.
 *
 * Reine Funktion ueber dem Fallstand: Die Reife wird bei jedem Aufruf frisch
 * gerechnet und kann deshalb nicht veralten. Sie INFORMIERT nur – kein Feld
 * blockiert (bindende Zusicherung der Spezifikation).
 */
export interface ReifeFeld {
  schluessel: string;
  label: string;
  abschnitt: string;
  gefuellt: boolean;
  person?: 1 | 2;
}

export interface Reife {
  felder: ReifeFeld[];
  gefuellt: number;
  gesamt: number;
}

type Quelle = "applicant" | "employment" | "income" | "property" | "financingRequest" | "case";

interface Definition {
  schluessel: string;
  label: string;
  abschnitt: string;
  quelle: Quelle;
  /** Wird je Antragsteller gezaehlt. */
  jePerson?: boolean;
}

/** Die 26 angebotsrelevanten Angaben, bestaetigt von Juergen am 12.08.2026. */
const FELDER: Definition[] = [
  { schluessel: "vorname", label: "Vorname", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "nachname", label: "Nachname", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "geburtsdatum", label: "Geburtsdatum", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "staatsangehoerigkeit", label: "Staatsangehörigkeit", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "beschaeftigungsart", label: "Beschäftigungsart", abschnitt: "beruf", quelle: "employment", jePerson: true },
  { schluessel: "inProbezeit", label: "Probezeit", abschnitt: "beruf", quelle: "employment", jePerson: true },
  { schluessel: "befristetBis", label: "Befristung", abschnitt: "beruf", quelle: "employment", jePerson: true },
  { schluessel: "nettoMonatlich", label: "Nettoeinkommen", abschnitt: "beruf", quelle: "income", jePerson: true },
  { schluessel: "sonstigeEinnahmen", label: "Weitere Einkünfte", abschnitt: "beruf", quelle: "income", jePerson: true },
  { schluessel: "street", label: "Anschrift", abschnitt: "person", quelle: "applicant" },
  { schluessel: "familienstand", label: "Familienstand", abschnitt: "person", quelle: "applicant" },
  { schluessel: "anzahlKinder", label: "Kinder im Haushalt", abschnitt: "haushalt", quelle: "applicant" },
  { schluessel: "eigenkapital", label: "Eigenkapital", abschnitt: "eigenkapital", quelle: "financingRequest" },
  { schluessel: "objektart", label: "Objektart", abschnitt: "objekt", quelle: "property" },
  { schluessel: "zip", label: "PLZ des Objekts", abschnitt: "objekt", quelle: "property" },
  { schluessel: "wohnflaeche", label: "Wohnfläche", abschnitt: "objekt", quelle: "property" },
  { schluessel: "grundstuecksflaeche", label: "Grundstücksgröße", abschnitt: "objekt", quelle: "property" },
  { schluessel: "baujahr", label: "Baujahr", abschnitt: "objekt", quelle: "property" },
  { schluessel: "nutzung", label: "Nutzung", abschnitt: "objekt", quelle: "property" },
  { schluessel: "financingType", label: "Finanzierungsart", abschnitt: "vorhaben", quelle: "case" },
  { schluessel: "kaufpreis", label: "Kaufpreis", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "maklerprovisionProzent", label: "Maklerprovision", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "darlehenswunsch", label: "Darlehenswunsch", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "zinsbindungJahre", label: "Zinsbindung", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "sondertilgungGewuenscht", label: "Sondertilgung gewünscht", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "wunschrateMonatlich", label: "Wunschrate", abschnitt: "vorhaben", quelle: "financingRequest" },
];

/**
 * Nur null, undefined und der leere String sind Luecken.
 *
 * 0 und false sind ANTWORTEN: "keine Maklerprovision" und "keine
 * Sondertilgung gewuenscht" duerfen nicht als offen gelten, sonst fragt das
 * Interview ewig nach etwas, das schon beantwortet ist.
 */
function istGefuellt(wert: unknown): boolean {
  return wert !== null && wert !== undefined && wert !== "";
}

export function berechneReife(stand: Fallstand, antragstellerZahl: number): Reife {
  const personen = Math.max(antragstellerZahl, 1);
  const felder: ReifeFeld[] = [];

  const lies = (quelle: Quelle, schluessel: string, position: number): unknown => {
    if (quelle === "case") return stand.caseFelder[schluessel];
    if (quelle === "property") return stand.property?.[schluessel];
    if (quelle === "financingRequest") return stand.financingRequest?.[schluessel];
    const person = stand.applicants.find((a) => a.position === position);
    if (!person) return undefined;
    if (quelle === "applicant") return person[schluessel];
    // employment und income haengen als Liste am Antragsteller; der erste
    // Satz ist der aktuelle (so laedt ihn auch die Fallseite).
    const liste = person[quelle] as Array<Record<string, unknown>> | undefined;
    return liste?.[0]?.[schluessel];
  };

  for (const def of FELDER) {
    const positionen = def.jePerson ? Array.from({ length: personen }, (_, i) => i + 1) : [1];
    for (const position of positionen) {
      felder.push({
        schluessel: def.schluessel,
        label: def.label,
        abschnitt: def.abschnitt,
        gefuellt: istGefuellt(lies(def.quelle, def.schluessel, position)),
        person: def.jePerson ? (position as 1 | 2) : undefined,
      });
    }
  }

  return {
    felder,
    gefuellt: felder.filter((f) => f.gefuellt).length,
    gesamt: felder.length,
  };
}
```

- [ ] **Schritt 4: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run tests/erstgespraech-reife.test.ts && npx tsc --noEmit`
Erwartung: PASS.

- [ ] **Schritt 5: Gegen den echten Fall prüfen**

```bash
cat > scripts/tmp-reife.mts <<'TS'
import "dotenv/config";
const { prisma } = await import("../src/lib/db.js");
const { berechneReife } = await import("../src/lib/erstgespraech/reife.js");
const f = await prisma.case.findUniqueOrThrow({
  where: { id: "cmskc6aiq0001k4044mnrlgbj" },
  include: { applicants: { orderBy: { position: "asc" }, include: { employment: true, income: true } }, property: true, financingRequest: true },
});
const r = berechneReife(
  { applicants: f.applicants as never, property: f.property as never, financingRequest: f.financingRequest as never, caseFelder: { financingType: f.financingType } },
  f.applicants.length
);
console.log(`${r.gefuellt} von ${r.gesamt} gefuellt`);
for (const x of r.felder.filter((y) => !y.gefuellt)) console.log(`  fehlt: ${x.label}${x.person ? ` (AS${x.person})` : ""}`);
await prisma.$disconnect();
TS
npx tsx scripts/tmp-reife.mts; rm -f scripts/tmp-reife.mts
```

Erwartung: Eine plausible Liste. Beim Fall Lahwani müssen mindestens Zinsbindung, Sondertilgung und Wunschrate als fehlend erscheinen (die Felder sind neu), Kaufpreis und Objektart als gefüllt.

- [ ] **Schritt 6: Commit**

```bash
git add -A
git commit -m "feat(erstgespraech): Angebotsreife als reine Funktion"
```

---

### Aufgabe 4: Nebenkosten-Vorschau

**Dateien:**
- Anlegen: `src/lib/erstgespraech/nebenkosten-vorschau.ts`
- Test: `tests/erstgespraech-nebenkosten.test.ts`

**Schnittstellen:**
- Verwendet: `berechneNebenkosten` und `DEFAULT_ANNAHMEN` aus `@/lib/machbarkeit/*`, `bundeslandAusPlz` aus `@/lib/machbarkeit/bundesland`.
- Erzeugt: `export function nebenkostenVorschau(eingabe: VorschauEingabe): NebenkostenAufstellung | null`

- [ ] **Schritt 1: Den scheiternden Test schreiben**

`tests/erstgespraech-nebenkosten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nebenkostenVorschau } from "@/lib/erstgespraech/nebenkosten-vorschau";

describe("Nebenkosten-Vorschau", () => {
  it("rechnet erst, wenn ein Kaufpreis dasteht", () => {
    expect(nebenkostenVorschau({ kaufpreis: null, plz: "76744", maklerprovisionProzent: 3.57 })).toBeNull();
  });

  it("schluesselt Grunderwerbsteuer, Notar und Makler auf", () => {
    const r = nebenkostenVorschau({ kaufpreis: 895000, plz: "76744", maklerprovisionProzent: 3.57 })!;
    expect(r.grunderwerbsteuer).toBeGreaterThan(0);
    expect(r.notarGrundbuch).toBeGreaterThan(0);
    expect(r.makler).toBeCloseTo(895000 * 0.0357, 0);
    expect(r.summe).toBeCloseTo(r.grunderwerbsteuer + r.notarGrundbuch + r.makler, 0);
  });

  it("weist einen unsicheren Steuersatz aus, statt ihn zu verschweigen", () => {
    const r = nebenkostenVorschau({ kaufpreis: 400000, plz: null, maklerprovisionProzent: 0 })!;
    expect(r.steuersatzUnsicher).toBe(true);
  });

  it("laesst einen erfassten Betrag gewinnen, statt zu addieren", () => {
    const r = nebenkostenVorschau({
      kaufpreis: 895000, plz: "76744", maklerprovisionProzent: 3.57, nebenkostenErfasst: 60000,
    })!;
    expect(r.summe).toBe(60000);
    expect(r.gerechnet).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

Ausführen: `npx vitest run tests/erstgespraech-nebenkosten.test.ts`
Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Schritt 3: Modul schreiben**

`src/lib/erstgespraech/nebenkosten-vorschau.ts`:

```ts
import { berechneNebenkosten } from "@/lib/machbarkeit/nebenkosten";
import { bundeslandAusPlz } from "@/lib/machbarkeit/bundesland";
import { DEFAULT_ANNAHMEN } from "@/lib/machbarkeit/annahmen";
import type { NebenkostenAufstellung } from "@/lib/machbarkeit/types";

/**
 * Nebenkosten im Erstgespraech sofort zeigen, statt sie zu erfragen.
 *
 * Duenne Huelle um die Rechnung des Machbarkeits-Solvers – bewusst dieselbe,
 * damit Gespraech und spaetere Machbarkeitsrechnung nie verschiedene Zahlen
 * nennen. Nebenkosten sind nicht beleihbar; wer sie frueh sieht, erkennt
 * sofort, ob das Eigenkapital traegt.
 */
export interface VorschauEingabe {
  kaufpreis: number | null;
  plz: string | null;
  maklerprovisionProzent: number | null;
  /** Am Fall erfasster Betrag; gewinnt gegen die Rechnung. */
  nebenkostenErfasst?: number | null;
  grunderwerbsteuerProzentOverride?: number | null;
}

export function nebenkostenVorschau(e: VorschauEingabe): NebenkostenAufstellung | null {
  if (e.kaufpreis == null || e.kaufpreis <= 0) return null;
  return berechneNebenkosten(
    {
      kaufpreis: e.kaufpreis,
      inventarAnteil: 0,
      maklerprovisionProzent: e.maklerprovisionProzent ?? 0,
      nebenkostenErfasst: e.nebenkostenErfasst ?? null,
      bundesland: e.plz ? bundeslandAusPlz(e.plz) : null,
      grunderwerbsteuerProzentOverride: e.grunderwerbsteuerProzentOverride ?? null,
    } as never,
    DEFAULT_ANNAHMEN
  );
}
```

**Hinweis für die Umsetzung:** Vor dem Schreiben die tatsächlichen Namen prüfen — `bundeslandAusPlz` und `DEFAULT_ANNAHMEN` sind aus dem Bestand erschlossen. Weichen sie ab, die echten verwenden und diesen Plan nicht als Wahrheit über den Bestand nehmen:

```bash
grep -n "^export" src/lib/machbarkeit/bundesland.ts src/lib/machbarkeit/annahmen.ts
```

- [ ] **Schritt 4: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run tests/erstgespraech-nebenkosten.test.ts && npx tsc --noEmit`
Erwartung: PASS.

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "feat(erstgespraech): Nebenkosten aus dem Fallstand vorrechnen"
```

---

### Aufgabe 5: Gemeinsamer Schreibkern für Zielfelder

**Dateien:**
- Anlegen: `src/lib/actions/zielwert.ts`
- Ändern: `src/lib/actions/self-disclosure.ts` (nutzt den neuen Kern)
- Test: `tests/zielwert.test.ts`

**Schnittstellen:**
- Erzeugt: `export async function schreibeZielwert(caseId: string, ziel: { entitaet: string; feld: string; person?: 1 | 2 }, wert: string): Promise<void>`
- Wird verwendet von: Aufgabe 6.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

`tests/zielwert.test.ts` — geprüft wird die Typumwandlung, nicht die Datenbank:

```ts
import { describe, it, expect } from "vitest";
import { wandleWert } from "@/lib/actions/zielwert";

describe("Typumwandlung fuer Zielfelder", () => {
  it("macht aus Datumstexten ein Datum", () => {
    expect(wandleWert("geburtsdatum", "1987-09-18")).toEqual(new Date("1987-09-18"));
  });
  it("macht aus Zahltexten Zahlen, auch deutsch geschrieben", () => {
    expect(wandleWert("kaufpreis", "895.000")).toBe(895000);
    expect(wandleWert("wohnflaeche", "242,7")).toBe(242.7);
  });
  it("macht aus ja/nein einen Wahrheitswert", () => {
    expect(wandleWert("sondertilgungGewuenscht", "ja")).toBe(true);
    expect(wandleWert("sondertilgungGewuenscht", "nein")).toBe(false);
  });
  it("macht aus einem leeren Text null – eine geloeschte Angabe ist eine Angabe", () => {
    expect(wandleWert("kaufpreis", "")).toBeNull();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

Ausführen: `npx vitest run tests/zielwert.test.ts`
Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Schritt 3: Kern aus `self-disclosure.ts` herauslösen**

`src/lib/actions/zielwert.ts` anlegen. Die Listen `DATUMSFELDER` und `ZAHLENFELDER` sowie die Umwandlungsfunktion aus `src/lib/actions/self-disclosure.ts` (ab Zeile ~175) hierher verschieben, um `sondertilgungGewuenscht` als Wahrheitswert und `zinsbindungJahre`/`wunschrateMonatlich` als Zahlen erweitern:

```ts
const DATUMSFELDER = ["geburtsdatum", "eintrittsdatum", "befristetBis", "gruendungsdatum"];
const WAHRHEITSFELDER = ["inProbezeit", "sondertilgungGewuenscht"];
const ZAHLENFELDER = [
  /* die bestehende Liste unveraendert uebernehmen */
  "zinsbindungJahre",
  "wunschrateMonatlich",
];

/** Wandelt den Textwert in den Typ, den das Zielfeld erwartet. */
export function wandleWert(feld: string, roh: string): unknown {
  const wert = roh.trim();
  // Eine geloeschte Angabe ist eine Angabe: null schreiben, nicht ignorieren.
  if (wert === "") return null;
  if (DATUMSFELDER.includes(feld)) return new Date(wert);
  if (WAHRHEITSFELDER.includes(feld)) return /^(ja|true|1)$/i.test(wert);
  if (ZAHLENFELDER.includes(feld)) {
    const n = Number(wert.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return wert;
}
```

Dann `schreibeZielwert` ergänzen, das anhand von `ziel.entitaet` in `applicant` (über `position`), `employment`, `income`, `property`, `financingRequest` oder `case` schreibt — als Muster dient der bestehende Rumpf von `uebernehmen` in `self-disclosure.ts`. `self-disclosure.ts` importiert `wandleWert` künftig von hier, statt eine eigene Kopie zu halten.

- [ ] **Schritt 4: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run && npx tsc --noEmit`
Erwartung: PASS, auch die bestehenden Selbstauskunfts-Tests.

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "refactor(zielwerte): Schreibkern aus der Selbstauskunft herausloesen"
```

---

### Aufgabe 6: Die Interviewseite

**Dateien:**
- Anlegen: `src/app/(app)/cases/[id]/erstgespraech/page.tsx`, `src/lib/actions/erstgespraech.ts`, `src/components/erstgespraech/{abschnitt,feld,reifeleiste}.tsx`
- Test: `tests/erstgespraech-action.test.ts`

**Schnittstellen:**
- Verwendet: `berechneReife` (Aufgabe 3), `nebenkostenVorschau` (Aufgabe 4), `schreibeZielwert` (Aufgabe 5), `KATALOG` aus `@/lib/self-disclosure/catalog`.

- [ ] **Schritt 1: Den scheiternden Test für die Server Action schreiben**

`tests/erstgespraech-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx: { organizationId: "o1", userId: "u1" },
    caseRow: { id: caseId, organizationId: "o1" },
  })),
}));
const schreiben = vi.fn();
vi.mock("@/lib/actions/zielwert", () => ({ schreibeZielwert: schreiben }));

beforeEach(() => schreiben.mockReset());

describe("Erstgespraech: ein Feld speichern", () => {
  it("prueft den Fallzugriff, bevor geschrieben wird", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld: "kaufpreis" }, "895000");
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
    expect(schreiben).toHaveBeenCalled();
  });

  it("nimmt einen leeren Wert an – kein Feld blockiert", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld: "kaufpreis" }, "")
    ).resolves.not.toThrow();
  });

  it("weist ein Zielfeld ab, das nicht im Katalog steht", async () => {
    // Diese Datei traegt "use server": jede Funktion ist ein oeffentlicher
    // Endpunkt. Ohne Pruefung liesse sich jedes Feld jeder Tabelle schreiben.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "user", feld: "passwordHash" }, "x")
    ).rejects.toThrow();
    expect(schreiben).not.toHaveBeenCalled();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

Ausführen: `npx vitest run tests/erstgespraech-action.test.ts`
Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Schritt 3: Zuerst den Katalog um die Konditionsfragen erweitern**

Muss VOR der Server Action passieren: Deren Positivliste erlaubter Zielfelder
entsteht aus dem Katalog. Fehlen die drei Felder dort, weist sie die eigenen
Eingaben ab.

In `src/lib/self-disclosure/catalog.ts` einen Abschnitt ergaenzen — die
vorhandenen Eintraege als Muster nehmen:

```ts
  {
    id: "kondition",
    abschnitt: "vorhaben",
    frage: "Wie soll die Finanzierung aussehen?",
    felder: [
      { id: "zinsbindung", label: "Zinsbindung in Jahren", typ: "zahl", ziel: { entitaet: "financingRequest", feld: "zinsbindungJahre" } },
      { id: "sondertilgung", label: "Sondertilgung gewünscht?", typ: "janein", ziel: { entitaet: "financingRequest", feld: "sondertilgungGewuenscht" } },
      { id: "wunschrate", label: "Wunschrate monatlich", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "wunschrateMonatlich" } },
    ],
  },
```

Pruefen, ob der Feldtyp `janein` im Kundenmodus vorhanden ist
(`src/lib/self-disclosure/types.ts`); fehlt er, den vorhandenen Auswahltyp
verwenden statt einen neuen zu erfinden.

- [ ] **Schritt 4: Server Action schreiben**

`src/lib/actions/erstgespraech.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireCaseAccess } from "@/lib/auth/context";
import { schreibeZielwert } from "@/lib/actions/zielwert";
import { KATALOG } from "@/lib/self-disclosure/catalog";

/**
 * Ein einzelnes Feld aus dem Erstgespraech speichern.
 *
 * Der Vermittler ist die Quelle – anders als beim Kunden gibt es hier keinen
 * Freigabeschritt. Jedes Feld wird EINZELN gespeichert, damit ein Gespraech
 * jederzeit abbrechen kann, ohne dass etwas verloren geht.
 *
 * Kein Feld blockiert: Ein leerer Wert ist erlaubt und loescht die Angabe.
 */
const ERLAUBTE_ZIELE = new Set(
  KATALOG.flatMap((f) => f.felder ?? []).flatMap((feld) =>
    feld.ziel ? [`${feld.ziel.entitaet}.${feld.ziel.feld}`] : []
  )
);

export async function speichereGespraechsfeld(
  caseId: string,
  ziel: { entitaet: string; feld: string; person?: 1 | 2 },
  wert: string
): Promise<void> {
  await requireCaseAccess(caseId);
  // Diese Datei traegt "use server": jede exportierte Funktion ist ein
  // oeffentlich erreichbarer Endpunkt. Ohne diese Pruefung liesse sich jedes
  // Feld jeder Tabelle beschreiben.
  if (!ERLAUBTE_ZIELE.has(`${ziel.entitaet}.${ziel.feld}`)) {
    throw new Error(`Unbekanntes Zielfeld: ${ziel.entitaet}.${ziel.feld}`);
  }
  await schreibeZielwert(caseId, ziel, wert);
  revalidatePath(`/cases/${caseId}/erstgespraech`);
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Schritt 5: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run tests/erstgespraech-action.test.ts`
Erwartung: PASS.

- [ ] **Schritt 6: Seite und Bauteile schreiben**

`src/app/(app)/cases/[id]/erstgespraech/page.tsx` — Server Component:
- Fall laden (`applicants` mit `employment` und `income`, `property`, `financingRequest`).
- `berechneReife` und `nebenkostenVorschau` aufrufen.
- `<Reifeleiste>` oben, darunter je Katalogabschnitt ein `<Abschnitt>`.
- Ein Abschnitt ist **eingeklappt**, wenn alle seine angebotsrelevanten Felder gefüllt sind, und trägt dann den Vermerk „vollständig"; sonst aufgeklappt.
- Kopfzeile mit `PageHeader`, Titel „Erstgespräch · {caseNumber}".

`src/components/erstgespraech/feld.tsx` — Client Component: Eingabefeld, das bei `onBlur` `speichereGespraechsfeld` aufruft und einen kurzen Vermerk „gespeichert" zeigt. **Keine Validierung, kein Pflichtfeld.**

`src/components/erstgespraech/reifeleiste.tsx`: Balken plus Text „Noch {gesamt − gefuellt} Angaben bis zum Angebot". Bei 0 offenen: „Alle Angaben für ein Angebot stehen." **Kein Sperrverhalten.**

- [ ] **Schritt 7: Bauen und im Browser ansehen**

Ausführen: `npm run build && npx tsc --noEmit && npx vitest run`
Dann die Seite für den Fall `cmskc6aiq0001k4044mnrlgbj` öffnen und prüfen: Sind die bekannten Abschnitte eingeklappt? Steht die Nebenkostenrechnung? Speichert ein Feld beim Verlassen?

- [ ] **Schritt 8: Commit**

```bash
git add -A
git commit -m "feat(erstgespraech): gefuehrte Maske fuer das Erstgespraech"
```

---

### Aufgabe 7: Übergabe und Einbindung in die Fallreise

**Dateien:**
- Anlegen: `src/components/erstgespraech/uebergabe.tsx`
- Ändern: `src/lib/cases/next-step.ts`, `src/components/case/next-step-card.tsx`
- Test: `tests/next-step.test.ts`

**Schnittstellen:**
- Verwendet: `berechneReife` (Aufgabe 3), `canonicalToKundenangaben` für die Feldgruppen der Kopiermaske.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

In `tests/next-step.test.ts` ergänzen:

```ts
describe("computeNextStep – Erstgespräch", () => {
  it("führt nach dem Erstkontakt ins Erstgespräch, solange Angaben fehlen", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 6 },
      })
    );
    expect(s.key).toBe("erstgespraech");
    expect(s.cta?.href).toBe("/cases/c1/erstgespraech");
  });

  it("überspringt das Erstgespräch, wenn alle Angaben stehen", () => {
    const s = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "k@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 0 },
      })
    );
    expect(s.key).not.toBe("erstgespraech");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

Ausführen: `npx vitest run tests/next-step.test.ts`
Erwartung: FAIL — `erstgespraech` ist kein bekannter Schlüssel.

- [ ] **Schritt 3: Stufe in die Leiter einbauen**

`src/lib/cases/next-step.ts`: `NextStep["key"]` um `"erstgespraech"` erweitern, `NextStepInput` um

```ts
  /** Stand des Erstgespraechs; fehlt bei Aufrufern, die ihn nicht laden. */
  erstgespraech?: { offeneAngaben: number };
```

und die Stufe **nach** den Erstkontakt-Stufen, **vor** `dokumente_freigeben` einsetzen:

```ts
  // Nach dem Erstkontakt, vor der Dokumentfreigabe: Ohne die Angaben aus dem
  // Gespraech laesst sich kein Angebot rechnen – Unterlagen zu pruefen ist
  // dann verfrueht.
  if (c.erstgespraech && c.erstgespraech.offeneAngaben > 0) {
    return {
      key: "erstgespraech",
      title: "Erstgespräch führen",
      reason: `${c.erstgespraech.offeneAngaben} Angaben fehlen noch für ein Angebot. Die Maske führt dich durch die Fragen.`,
      tone: "review",
      cta: { label: "Erstgespräch öffnen", href: `/cases/${id}/erstgespraech` },
    };
  }
```

In `src/components/case/next-step-card.tsx` das Icon ergänzen: `erstgespraech: ClipboardList` (der erschöpfende `Record` verlangt es).

- [ ] **Schritt 4: Tests laufen lassen — sie müssen bestehen**

Ausführen: `npx vitest run tests/next-step.test.ts && npx tsc --noEmit`
Erwartung: PASS.

- [ ] **Schritt 5: Fallseite und Review-Seite mit dem Stand versorgen**

In `src/app/(app)/cases/[id]/page.tsx` und `src/app/(app)/review/page.tsx` beim `computeNextStep`-Aufruf ergänzen:

```ts
  erstgespraech: { offeneAngaben: reife.gesamt - reife.gefuellt },
```

`reife` dort über `berechneReife` berechnen.

- [ ] **Schritt 6: Kopiermaske schreiben**

`src/components/erstgespraech/uebergabe.tsx`: Am Ende der Interviewseite, nach Europace-Abschnitten gruppiert (Personendaten · Beschäftigung · Haushalt · Objekt · Finanzierungsbedarf · Konditionswunsch), je Gruppe ein `<CopyBlock>`. Daneben der Knopf „An Europace übertragen":

- **immer bedienbar**, auch bei Lücken,
- deaktiviert **nur**, solange der Europace-Zugang fehlt (`isConfigured`), mit dem Hinweis „Europace-Zugang fehlt noch — Werte bis dahin von Hand übertragen",
- bei Lücken ein Hinweis, keine Sperre: „{n} Angaben fehlen — in Europace nachtragen."

- [ ] **Schritt 7: Bauen, prüfen, ansehen**

Ausführen: `npm run build && npx tsc --noEmit && npx vitest run`
Dann die Fallseite öffnen: Steht „Erstgespräch führen" als nächster Schritt? Führt der Knopf zur Maske?

- [ ] **Schritt 8: Commit und ausliefern**

```bash
git add -A
git commit -m "feat(erstgespraech): Uebergabe und Stufe in der Fallreise"
git push origin main
```

Danach das Deployment abwarten und wie üblich gegenprüfen: `vercel ls --prod`, Status `Ready`, Alias `baufidesk.de` per `vercel inspect`.

---

## Selbstprüfung des Plans

**Abdeckung der Spezifikation:**

| Anforderung | Aufgabe |
|---|---|
| Ein Katalog, zwei Modi | 6 (Vermittlermodus über `KATALOG`) |
| Direkt in die Falldaten, keine Freigabe | 5, 6 |
| Bekanntes eingeklappt | 6 (Schritt 6) |
| Fortschrittsleiste | 3, 6 |
| 26 angebotsrelevante Angaben | 3 (`FELDER`) |
| Nebenkosten rechnen | 4 |
| Neue Felder Zinsbindung/Sondertilgung/Wunschrate | 2, 6 (Schritt 5) |
| Freiberufler als eigene Art | 1 |
| Kein Feld blockiert | Globale Randbedingungen; Tests in 6 |
| Übertragen trotz Lücken | 7 (Schritt 6) |
| Kopiermaske | 7 |
| Stufe in der Prioritätsleiter | 7 |

**Bewusst nicht abgedeckt:** Konditionswünsche an Europace senden (Begründung im Abschnitt „Dateien im Überblick"). Reihenfolge der Abschnitte bleibt die des Katalogs (Jürgens Entscheidung).

**Namensabgleich:** `berechneReife`/`Reife`/`ReifeFeld` (Aufgabe 3) werden in 6 und 7 unter genau diesen Namen verwendet. `schreibeZielwert`/`wandleWert` (Aufgabe 5) in 6. `nebenkostenVorschau` (Aufgabe 4) in 6.

**Offene Unsicherheit, die der Umsetzende prüfen muss:** Die Namen `bundeslandAusPlz`, `DEFAULT_ANNAHMEN` (Aufgabe 4), `KATALOG` und die Feldstruktur des Katalogs (Aufgabe 6) sind aus dem Bestand erschlossen, nicht verifiziert. Erster Schritt jeder dieser Aufgaben: mit `grep -n "^export"` die echten Namen prüfen und den Plan der Wirklichkeit anpassen, nicht umgekehrt.
