# Europace-Anbindung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein freigegebener BaufiDesk-Fall wird per Klick zu einem Europace-Vorgang, und die geprüften Unterlagen hängen danach dort dran.

**Architecture:** Neues Verzeichnis `src/lib/platforms/europace/` nach dem Vorbild von `finlink/`. Das kanonische Datenmodell bleibt führend; ein reines Mapping ohne I/O erzeugt den Europace-Request, ein Client kapselt OAuth und HTTP. Weil noch keine Zugangsdaten existieren, ist die Absicherung ein Vertragstest gegen das eingecheckte offizielle OpenAPI-Schema.

**Tech Stack:** TypeScript, Next.js App Router, Prisma, Vitest, ajv (neu, nur für Tests), Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-08-09-europace-anbindung-design.md`

## Global Constraints

- **Keine Übertragung ohne manuelle Freigabe.** Der bestehende Grundsatz `PlatformMapping.released` gilt unverändert.
- **Keine Attrappen.** Fehlen Zugangsdaten, ist die Funktion sichtbar deaktiviert mit klarem Hinweis. Niemals Erfolg melden, wo nichts passiert ist.
- **Ein Fall gilt nur als übertragen, wenn eine echte Vorgangsnummer gespeichert wurde.** Ein erfolgreicher Trockenlauf allein ist keine Übertragung.
- **Jeder Ausgang landet in `PlatformSyncLog`** — auch der Erfolg.
- **Deutsch** in UI-Texten, Kommentaren und Commit-Nachrichten. Keine internen Kürzel in kundensichtbaren Texten.
- **Kein `PUT`/Update** bereits übertragener Kundenangaben, **kein Import** aus Europace. Beides ist bewusst ausgeschlossen.
- **Tests laufen offline.** Kein Test spricht mit Europace.
- **Migrationen wirken gegen die Produktivdatenbank** (`scripts/supabase-sql.sh`, Schema `unterlagenpilot`). Nur additive, nullable Spalten.
- Hosts stehen fest im Code, nicht in Env-Variablen: `https://api.europace.de` (Token), `https://baufinanzierung.api.europace.de` (Kundenangaben), `https://api.europace2.de` (Unterlagen).

---

### Task 1: Offizielle Schemata einchecken und Vertragstest-Werkzeug

Fundament für alles Weitere: Ohne validierbares Schema ist jedes Mapping geraten.

**Files:**
- Create: `scripts/europace-schema-holen.sh`
- Create: `src/lib/platforms/europace/schema/kundenangaben-openapi.json` (Download)
- Create: `src/lib/platforms/europace/schema/dokument-kategorien.json` (Download)
- Create: `src/lib/platforms/europace/schema/HERKUNFT.md`
- Create: `tests/helpers/europace-schema.ts`
- Create: `tests/europace-schema-vertrag.test.ts`
- Modify: `package.json` (devDependency `ajv`)

**Interfaces:**
- Consumes: nichts
- Produces: `validateKundenangabenRequest(payload: unknown): { valid: boolean; errors: string[] }` aus `tests/helpers/europace-schema.ts`; `EUROPACE_KATEGORIEN: string[]` als JSON-Array in `schema/dokument-kategorien.json`

- [ ] **Schritt 1: ajv installieren**

```bash
npm install --save-dev ajv
```

- [ ] **Schritt 2: Hol-Skript schreiben**

Erstelle `scripts/europace-schema-holen.sh`:

```bash
#!/usr/bin/env bash
# Holt die offiziellen Europace-Schemata. Bewusst ein Skript statt Handarbeit,
# damit eine spaetere Aktualisierung nachvollziehbar bleibt.
#
#   scripts/europace-schema-holen.sh
set -euo pipefail

ZIEL="src/lib/platforms/europace/schema"
mkdir -p "$ZIEL"

curl -sSfL -o "$ZIEL/kundenangaben-openapi.json" \
  https://raw.githubusercontent.com/europace/baufismart-kundenangaben-api/master/kundenangaben-openapi.json

# Die Kategorienliste steht als Markdown-Tabelle in der README der Dokumente-API.
# Wir ziehen die erste Spalte der Kategorie-Tabelle heraus.
curl -sSfL https://raw.githubusercontent.com/europace/dokumente-api/master/README.md \
  | node -e '
      let md = "";
      process.stdin.on("data", (c) => (md += c));
      process.stdin.on("end", () => {
        const kategorien = md
          .split("\n")
          .map((z) => z.match(/^\|\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9_]*)\s*\|/))
          .filter(Boolean)
          .map((m) => m[1])
          .filter((k) => k !== "ID" && k !== "Scope" && k !== "Beschreibung");
        const eindeutig = [...new Set(kategorien)].sort();
        if (eindeutig.length < 50) {
          console.error(`Nur ${eindeutig.length} Kategorien gefunden – Format der README hat sich geaendert.`);
          process.exit(1);
        }
        process.stdout.write(JSON.stringify(eindeutig, null, 2) + "\n");
      });
    ' > "$ZIEL/dokument-kategorien.json"

echo "Kundenangaben-Schema: $(node -p "Object.keys(require('./$ZIEL/kundenangaben-openapi.json').components.schemas).length") Typen"
echo "Kategorien:           $(node -p "require('./$ZIEL/dokument-kategorien.json').length")"
```

- [ ] **Schritt 3: Skript ausführen**

```bash
chmod +x scripts/europace-schema-holen.sh && scripts/europace-schema-holen.sh
```

Erwartet: „Kundenangaben-Schema: 337 Typen" (Zahl darf abweichen, muss > 300 sein) und „Kategorien: " mit einem Wert über 100. Bricht das Skript mit „Format der README hat sich geaendert" ab, ist die Tabelle umgebaut worden — dann die README von Hand ansehen und den Regex anpassen.

- [ ] **Schritt 4: Herkunft dokumentieren**

Erstelle `src/lib/platforms/europace/schema/HERKUNFT.md`:

```markdown
# Herkunft der Schemadateien

Nicht von Hand bearbeiten. Neu holen mit `scripts/europace-schema-holen.sh`.

| Datei | Quelle | Abgerufen |
| --- | --- | --- |
| `kundenangaben-openapi.json` | https://github.com/europace/baufismart-kundenangaben-api | 2026-08-09 |
| `dokument-kategorien.json` | https://github.com/europace/dokumente-api (README-Tabelle) | 2026-08-09 |

Diese Dateien sind die Vertragsgrundlage der Tests in
`tests/europace-mapping.test.ts`. Solange kein API-Zugang besteht, sind sie
die einzige Absicherung gegen falsche Feldnamen.
```

- [ ] **Schritt 5: Validierungs-Helfer schreiben**

Erstelle `tests/helpers/europace-schema.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";

const SCHEMA_PFAD = resolve(
  __dirname,
  "../../src/lib/platforms/europace/schema/kundenangaben-openapi.json"
);

/**
 * Validiert gegen das offizielle Europace-OpenAPI-Schema.
 *
 * `strict: false` ist noetig, weil OpenAPI 3.0 Schlüsselwörter mitbringt, die
 * JSON Schema nicht kennt (`nullable`, `discriminator`, `format: "double"`).
 * Ajv wuerde sie im Strict-Modus als Fehler werten, obwohl das Dokument gueltig ist.
 */
let validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const dokument = JSON.parse(readFileSync(SCHEMA_PFAD, "utf8")) as object;
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(dokument, "europace");
  const v = ajv.getSchema("europace#/components/schemas/ImportKundenangabenRequest");
  if (!v) throw new Error("ImportKundenangabenRequest nicht im Schema gefunden");
  validator = v;
  return v;
}

export function validateKundenangabenRequest(payload: unknown): {
  valid: boolean;
  errors: string[];
} {
  const v = getValidator();
  const valid = v(payload) as boolean;
  return {
    valid,
    errors: (v.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()),
  };
}
```

- [ ] **Schritt 6: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-schema-vertrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateKundenangabenRequest } from "./helpers/europace-schema";

describe("Europace-Schema als Vertrag", () => {
  it("akzeptiert einen minimalen gueltigen Request", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: {},
    });
    expect(ergebnis.errors).toEqual([]);
    expect(ergebnis.valid).toBe(true);
  });

  it("lehnt einen Request ohne importMetadaten ab", () => {
    const ergebnis = validateKundenangabenRequest({ kundenangaben: {} });
    expect(ergebnis.valid).toBe(false);
  });

  it("lehnt einen unbekannten Datenkontext ab", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "PROBIERMODUS" },
      kundenangaben: {},
    });
    expect(ergebnis.valid).toBe(false);
  });

  it("lehnt einen Kunden ohne referenzId ab", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: { haushalte: [{ kunden: [{ personendaten: {} }] }] },
    });
    expect(ergebnis.valid).toBe(false);
  });
});
```

- [ ] **Schritt 7: Test ausführen**

```bash
npx vitest run tests/europace-schema-vertrag.test.ts
```

Erwartet: alle vier grün. Schlägt der erste Test fehl, stimmt die Ajv-Konfiguration nicht — die Fehlermeldungen in `ergebnis.errors` zeigen dann, welches OpenAPI-Schlüsselwort stört. Schlagen die drei Ablehnungs-Tests fehl (also: alles wird akzeptiert), validiert Ajv in Wahrheit gar nicht — dann ist der `getSchema`-Pointer falsch. **Dieser Fall ist der gefährlichste: ein Vertragstest, der nichts prüft, ist schlimmer als keiner.**

- [ ] **Schritt 8: Committen**

```bash
git add scripts/europace-schema-holen.sh src/lib/platforms/europace/schema tests/helpers/europace-schema.ts tests/europace-schema-vertrag.test.ts package.json package-lock.json
git commit -m "feat(europace): offizielle Schemata einchecken und Vertragstest aufsetzen"
```

---

### Task 2: Request-Typen und Mapping der Haushalte

Das Herzstück, erster Teil: Antragsteller mit Personendaten, Kontakt, Beschäftigung und Einkommen.

**Files:**
- Create: `src/lib/platforms/europace/types.ts`
- Create: `src/lib/platforms/europace/kundenangaben-mapping.ts`
- Create: `tests/europace-mapping.test.ts`

**Interfaces:**
- Consumes: `validateKundenangabenRequest` (Task 1); `CanonicalCase`, `CanonicalApplicant`, `CanonicalEmployment`, `CanonicalIncome` aus `@/lib/domain/canonical`
- Produces:
  - `type Datenkontext = "TEST_MODUS" | "ECHT_GESCHAEFT"`
  - `interface EuropaceKundenangabenRequest` mit `importMetadaten` und `kundenangaben`
  - `function canonicalToKundenangaben(c: CanonicalCase, opts: { datenkontext: Datenkontext }): EuropaceKundenangabenRequest`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalToKundenangaben } from "@/lib/platforms/europace/kundenangaben-mapping";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { validateKundenangabenRequest } from "./helpers/europace-schema";

/** Minimaler Fall; einzelne Tests ueberschreiben gezielt Felder. */
function fall(teil: Partial<CanonicalCase> = {}): CanonicalCase {
  return {
    caseNumber: "UP-2026-0001",
    applicants: [],
    employment: [],
    income: [],
    liabilities: [],
    assets: [],
    financing: {},
    ...teil,
  } as CanonicalCase;
}

describe("canonicalToKundenangaben – Grundgeruest", () => {
  it("setzt den Datenkontext und die BaufiDesk-Fallnummer als externeVorgangsId", () => {
    const r = canonicalToKundenangaben(fall(), { datenkontext: "TEST_MODUS" });
    expect(r.importMetadaten.datenkontext).toBe("TEST_MODUS");
    expect(r.importMetadaten.externeVorgangsId).toBe("UP-2026-0001");
  });

  it("erzeugt fuer einen leeren Fall einen schemakonformen Request", () => {
    const r = canonicalToKundenangaben(fall(), { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});

describe("canonicalToKundenangaben – Haushalt", () => {
  const angestellt = fall({
    applicants: [
      {
        position: 1,
        vorname: "Anna",
        nachname: "Muster",
        geburtsdatum: "1985-04-12",
        familienstand: "verheiratet",
        anzahlKinder: 2,
        email: "anna@example.de",
        telefon: "030 1234567",
        strasse: "Hauptstr. 5",
        plz: "10115",
        ort: "Berlin",
      },
    ],
    employment: [
      {
        applicantPosition: 1,
        beschaeftigungsart: "angestellter",
        beruf: "Projektleiterin",
        arbeitgeber: "Beispiel GmbH",
        eintrittsdatum: "2019-03-01",
        inProbezeit: false,
      },
    ],
    income: [{ applicantPosition: 1, nettoMonatlich: 3200, bruttoMonatlich: 5000 }],
  });

  it("mappt Personendaten inklusive Familienstand als @type", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const kunde = r.kundenangaben.haushalte![0].kunden![0];
    expect(kunde.referenzId).toBe("antragsteller-1");
    expect(kunde.personendaten!.person).toEqual({ vorname: "Anna", nachname: "Muster" });
    expect(kunde.personendaten!.geburtsdatum).toBe("1985-04-12");
    expect(kunde.personendaten!.familienstand).toEqual({ "@type": "VERHEIRATET" });
  });

  it("mappt Kontakt und Wohnsituation", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const kunde = r.kundenangaben.haushalte![0].kunden![0];
    expect(kunde.kontakt!.email).toBe("anna@example.de");
    expect(kunde.wohnsituation!.anschrift).toEqual({
      strasse: "Hauptstr.",
      hausnummer: "5",
      plz: "10115",
      ort: "Berlin",
    });
  });

  it("mappt Beschaeftigung als ANGESTELLTER mit Arbeitgeber und Probezeit", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const finanzielles = r.kundenangaben.haushalte![0].kunden![0].finanzielles!;
    expect(finanzielles.einkommenNetto).toBe(3200);
    expect(finanzielles.beschaeftigung).toEqual({
      "@type": "ANGESTELLTER",
      beruf: "Projektleiterin",
      beschaeftigungsverhaeltnis: {
        arbeitgeber: { name: "Beispiel GmbH" },
        beschaeftigtSeit: "2019-03-01",
        probezeit: false,
      },
    });
  });

  it("mappt Selbststaendige ohne Arbeitgeberblock", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [{ position: 1, vorname: "Bert", nachname: "Sole" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "selbststaendiger", beruf: "Tischler" }],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    expect(r.kundenangaben.haushalte![0].kunden![0].finanzielles!.beschaeftigung).toEqual({
      "@type": "SELBSTSTAENDIGER",
      beruf: "Tischler",
    });
  });

  it("legt zwei Antragsteller in denselben Haushalt", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [
          { position: 1, vorname: "Anna", nachname: "Muster" },
          { position: 2, vorname: "Ben", nachname: "Muster" },
        ],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    expect(r.kundenangaben.haushalte).toHaveLength(1);
    expect(r.kundenangaben.haushalte![0].kunden).toHaveLength(2);
    expect(r.kundenangaben.haushalte![0].kunden![1].referenzId).toBe("antragsteller-2");
  });

  it("erzeugt auch mit vollem Haushalt einen schemakonformen Request", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-mapping.test.ts
```

Erwartet: FAIL, `Cannot find module '@/lib/platforms/europace/kundenangaben-mapping'`.

- [ ] **Schritt 3: Typen schreiben**

Erstelle `src/lib/platforms/europace/types.ts`. Bewusst nur die Teilmenge, die BaufiDesk sendet — nicht alle 337 Schematypen:

```ts
/**
 * Teilmenge des Europace-Kundenangaben-Schemas, die BaufiDesk sendet.
 * Vollstaendigkeit ist kein Ziel: Europace verlangt formal nur den
 * Datenkontext, alles Weitere ist optional. Der Vertragstest gegen
 * schema/kundenangaben-openapi.json sichert die Struktur ab.
 */

export type Datenkontext = "TEST_MODUS" | "ECHT_GESCHAEFT";

/** Polymorphe Typen tragen einen @type-Diskriminator. */
export interface MitTyp {
  "@type": string;
}

export interface EuropaceAnschrift {
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
}

export interface EuropacePerson {
  vorname?: string;
  nachname?: string;
}

export interface EuropacePersonendaten {
  person?: EuropacePerson;
  geburtsdatum?: string;
  geburtsort?: string;
  staatsangehoerigkeit?: string;
  familienstand?: MitTyp;
}

export interface EuropaceKontakt {
  email?: string;
  telefonnummer?: { vorwahl?: string; nummer?: string };
}

export interface EuropaceWohnsituation {
  anschrift?: EuropaceAnschrift;
}

export interface EuropaceBeschaeftigungsverhaeltnis {
  arbeitgeber?: { name?: string };
  beschaeftigtSeit?: string;
  probezeit?: boolean;
}

export interface EuropaceBeschaeftigung extends MitTyp {
  beruf?: string;
  beschaeftigungsverhaeltnis?: EuropaceBeschaeftigungsverhaeltnis;
}

export interface EuropaceFinanzielles {
  einkommenNetto?: number;
  beschaeftigung?: EuropaceBeschaeftigung;
}

export interface EuropaceKunde {
  referenzId: string;
  personendaten?: EuropacePersonendaten;
  kontakt?: EuropaceKontakt;
  wohnsituation?: EuropaceWohnsituation;
  finanzielles?: EuropaceFinanzielles;
}

export interface EuropaceHaushaltsvermoegen {
  summeBankUndSparguthaben?: { guthaben?: number };
}

export interface EuropaceFinanzielleSituation {
  vermoegen?: EuropaceHaushaltsvermoegen;
}

export interface EuropaceHaushalt {
  kunden?: EuropaceKunde[];
  finanzielleSituation?: EuropaceFinanzielleSituation;
}

export interface EuropaceGebaeude {
  baujahr?: number;
  nutzung?: { wohnen?: { gesamtflaeche?: number } };
}

export interface EuropaceImmobilientyp extends MitTyp {
  gebaeude?: EuropaceGebaeude;
  grundstuecksgroesse?: number;
}

export interface EuropaceImmobilie {
  adresse?: EuropaceAnschrift;
  typ?: EuropaceImmobilientyp;
}

export interface EuropaceFinanzierungsobjekt {
  immobilie?: EuropaceImmobilie;
}

export interface EuropaceWertInEuroOderProzent {
  einheit: "EURO" | "PROZENT";
  wert: number;
}

export interface EuropaceFinanzierungszweck extends MitTyp {
  kaufpreis?: number;
  nebenkosten?: {
    grunderwerbsteuer?: EuropaceWertInEuroOderProzent;
    maklergebuehr?: EuropaceWertInEuroOderProzent;
    notargebuehr?: EuropaceWertInEuroOderProzent;
  };
}

export interface EuropaceFinanzierungsbaustein extends MitTyp {
  darlehensbetrag?: number;
}

export interface EuropaceFinanzierungsbedarf {
  finanzierungszweck?: EuropaceFinanzierungszweck;
  finanzierungsbausteine?: EuropaceFinanzierungsbaustein[];
}

export interface EuropaceKundenangabenRequest {
  importMetadaten: {
    datenkontext: Datenkontext;
    externeVorgangsId?: string;
    importquelle?: string;
  };
  kundenangaben: {
    haushalte?: EuropaceHaushalt[];
    finanzierungsobjekt?: EuropaceFinanzierungsobjekt;
    finanzierungsbedarf?: EuropaceFinanzierungsbedarf;
  };
}
```

- [ ] **Schritt 4: Mapping für Haushalte schreiben**

Erstelle `src/lib/platforms/europace/kundenangaben-mapping.ts`:

```ts
import type {
  CanonicalApplicant,
  CanonicalCase,
  CanonicalEmployment,
} from "@/lib/domain/canonical";
import type { EmploymentType, MaritalStatus } from "@/lib/domain/enums";
import type {
  Datenkontext,
  EuropaceAnschrift,
  EuropaceBeschaeftigung,
  EuropaceHaushalt,
  EuropaceKunde,
  EuropaceKundenangabenRequest,
} from "./types";

/**
 * Mappt einen kanonischen Fall auf den Europace-Kundenangaben-Request.
 *
 * Reine Funktion ohne I/O – die einzige Absicherung gegen falsche Feldnamen
 * ist der Vertragstest gegen das eingecheckte OpenAPI-Schema.
 *
 * Grundregel: Was BaufiDesk nicht kennt, wird weggelassen statt geraten.
 * Europace verlangt formal nur den Datenkontext, Teilbefuellung ist erlaubt.
 */

/** Leere Objekte wuerden als "gesetzt, aber leer" beim Kunden landen. */
function wegLassenWennLeer<T extends object>(o: T): T | undefined {
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
}

const FAMILIENSTAND: Record<MaritalStatus, string> = {
  ledig: "LEDIG",
  verheiratet: "VERHEIRATET",
  geschieden: "GESCHIEDEN",
  verwitwet: "VERWITWET",
  eingetragene_partnerschaft: "LEBENSPARTNERSCHAFT",
  getrennt_lebend: "GETRENNT_LEBEND",
};

/**
 * Europace kennt keine Entsprechung fuer "geschaeftsfuehrer" und
 * "gesellschafter" – beide sind dort Selbststaendige. "sonstiges" hat gar kein
 * Gegenstueck; dann bleibt die Beschaeftigung leer, statt einen falschen Typ zu
 * behaupten.
 */
const BESCHAEFTIGUNGSTYP: Record<EmploymentType, string | null> = {
  angestellter: "ANGESTELLTER",
  beamter: "BEAMTER",
  selbststaendiger: "SELBSTSTAENDIGER",
  geschaeftsfuehrer: "SELBSTSTAENDIGER",
  gesellschafter: "SELBSTSTAENDIGER",
  rentner: "RENTNER",
  sonstiges: null,
};

/** Nur ANGESTELLTER und BEAMTER kennen ein Beschaeftigungsverhaeltnis. */
const MIT_ARBEITGEBER = new Set(["ANGESTELLTER", "BEAMTER"]);

/**
 * Trennt "Hauptstr. 5" in Strasse und Hausnummer. Europace fuehrt beide
 * getrennt, BaufiDesk speichert eine Zeile. Ohne erkennbare Hausnummer wandert
 * alles in `strasse` – lieber unvollstaendig als falsch zerschnitten.
 */
export function anschriftAufteilen(
  strasse: string | undefined,
  plz: string | undefined,
  ort: string | undefined
): EuropaceAnschrift | undefined {
  let strasseTeil = strasse;
  let hausnummer: string | undefined;
  if (strasse) {
    const treffer = strasse.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?(?:[-/]\s*\d+\s*[a-zA-Z]?)?)$/);
    if (treffer) {
      strasseTeil = treffer[1].trim();
      hausnummer = treffer[2].replace(/\s+/g, "");
    }
  }
  return wegLassenWennLeer({ strasse: strasseTeil, hausnummer, plz, ort });
}

/** "030 1234567" -> { vorwahl: "030", nummer: "1234567" } */
function telefonAufteilen(telefon: string | undefined) {
  if (!telefon) return undefined;
  const treffer = telefon.trim().match(/^(\+?[\d()/-]+)[\s/-]+(.+)$/);
  if (!treffer) return { nummer: telefon.trim() };
  return { vorwahl: treffer[1].trim(), nummer: treffer[2].replace(/\s+/g, "") };
}

function beschaeftigung(e: CanonicalEmployment | undefined): EuropaceBeschaeftigung | undefined {
  if (!e?.beschaeftigungsart) return undefined;
  const typ = BESCHAEFTIGUNGSTYP[e.beschaeftigungsart];
  if (!typ) return undefined;

  const verhaeltnis = MIT_ARBEITGEBER.has(typ)
    ? wegLassenWennLeer({
        arbeitgeber: e.arbeitgeber ? { name: e.arbeitgeber } : undefined,
        beschaeftigtSeit: e.eintrittsdatum,
        probezeit: e.inProbezeit,
      })
    : undefined;

  return {
    "@type": typ,
    ...(e.beruf ? { beruf: e.beruf } : {}),
    ...(verhaeltnis ? { beschaeftigungsverhaeltnis: verhaeltnis } : {}),
  };
}

function kunde(c: CanonicalCase, a: CanonicalApplicant): EuropaceKunde {
  const e = c.employment.find((x) => x.applicantPosition === a.position);
  const i = c.income.find((x) => x.applicantPosition === a.position);

  return {
    // Gilt laut Schema nur innerhalb dieses Aufrufs und wird nicht gespeichert.
    referenzId: `antragsteller-${a.position}`,
    personendaten: wegLassenWennLeer({
      person: wegLassenWennLeer({ vorname: a.vorname, nachname: a.nachname }),
      geburtsdatum: a.geburtsdatum,
      geburtsort: a.geburtsort,
      staatsangehoerigkeit: a.staatsangehoerigkeit,
      familienstand: a.familienstand ? { "@type": FAMILIENSTAND[a.familienstand] } : undefined,
    }),
    kontakt: wegLassenWennLeer({
      email: a.email,
      telefonnummer: telefonAufteilen(a.telefon),
    }),
    wohnsituation: wegLassenWennLeer({
      anschrift: anschriftAufteilen(a.strasse, a.plz, a.ort),
    }),
    finanzielles: wegLassenWennLeer({
      einkommenNetto: i?.nettoMonatlich,
      beschaeftigung: beschaeftigung(e),
    }),
  };
}

/** Alle Antragsteller bilden einen Haushalt; Europace erlaubt hoechstens zwei Kunden. */
function haushalte(c: CanonicalCase): EuropaceHaushalt[] | undefined {
  if (c.applicants.length === 0) return undefined;
  const kunden = [...c.applicants]
    .sort((a, b) => a.position - b.position)
    .slice(0, 2)
    .map((a) => kunde(c, a));
  return [{ kunden }];
}

export function canonicalToKundenangaben(
  c: CanonicalCase,
  opts: { datenkontext: Datenkontext }
): EuropaceKundenangabenRequest {
  return {
    importMetadaten: {
      datenkontext: opts.datenkontext,
      externeVorgangsId: c.caseNumber,
      importquelle: "BaufiDesk",
    },
    kundenangaben: {
      haushalte: haushalte(c),
    },
  };
}
```

- [ ] **Schritt 5: Tests ausführen**

```bash
npx vitest run tests/europace-mapping.test.ts
```

Erwartet: alle grün. Meldet der Vertragstest Fehler, zeigt `errors` den JSON-Pointer der Fundstelle — dort weicht die Struktur vom offiziellen Schema ab.

- [ ] **Schritt 6: Typprüfung**

```bash
npm run typecheck
```

- [ ] **Schritt 7: Committen**

```bash
git add src/lib/platforms/europace/types.ts src/lib/platforms/europace/kundenangaben-mapping.ts tests/europace-mapping.test.ts
git commit -m "feat(europace): Haushalte und Antragsteller auf Kundenangaben mappen"
```

---

### Task 3: Mapping des Finanzierungsobjekts

**Files:**
- Modify: `src/lib/platforms/europace/kundenangaben-mapping.ts`
- Modify: `tests/europace-mapping.test.ts`

**Interfaces:**
- Consumes: `canonicalToKundenangaben` (Task 2), `EuropaceFinanzierungsobjekt` (Task 2)
- Produces: `canonicalToKundenangaben` füllt zusätzlich `kundenangaben.finanzierungsobjekt`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Ergänze in `tests/europace-mapping.test.ts` am Ende:

```ts
describe("canonicalToKundenangaben – Finanzierungsobjekt", () => {
  const mitObjekt = fall({
    property: {
      objektart: "einfamilienhaus",
      strasse: "Feldweg 12a",
      plz: "14467",
      ort: "Potsdam",
      wohnflaeche: 142.5,
      baujahr: 1998,
      grundstuecksflaeche: 620,
    },
  });

  it("mappt die Objektart als @type und die Adresse getrennt", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    const immobilie = r.kundenangaben.finanzierungsobjekt!.immobilie!;
    expect(immobilie.typ!["@type"]).toBe("EINFAMILIENHAUS");
    expect(immobilie.adresse).toEqual({
      strasse: "Feldweg",
      hausnummer: "12a",
      plz: "14467",
      ort: "Potsdam",
    });
  });

  it("legt die Wohnflaeche unter gebaeude.nutzung.wohnen.gesamtflaeche ab", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ.gebaeude).toEqual({
      baujahr: 1998,
      nutzung: { wohnen: { gesamtflaeche: 142.5 } },
    });
    expect(typ.grundstuecksgroesse).toBe(620);
  });

  it("nutzt IMMOBILIE_OHNE_TYP fuer Objektarten ohne Europace-Entsprechung", () => {
    const r = canonicalToKundenangaben(fall({ property: { objektart: "gewerbe" } }), {
      datenkontext: "TEST_MODUS",
    });
    expect(r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!["@type"]).toBe("IMMOBILIE_OHNE_TYP");
  });

  it("laesst die Eigentumswohnung ohne Grundstuecksgroesse", () => {
    const r = canonicalToKundenangaben(
      fall({ property: { objektart: "eigentumswohnung", wohnflaeche: 78, grundstuecksflaeche: 500 } }),
      { datenkontext: "TEST_MODUS" }
    );
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ["@type"]).toBe("EIGENTUMSWOHNUNG");
    expect(typ.grundstuecksgroesse).toBeUndefined();
  });

  it("bleibt schemakonform", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-mapping.test.ts -t "Finanzierungsobjekt"
```

Erwartet: FAIL — `finanzierungsobjekt` ist `undefined`.

- [ ] **Schritt 3: Objekt-Mapping implementieren**

Ergänze in `src/lib/platforms/europace/kundenangaben-mapping.ts` vor `canonicalToKundenangaben`:

```ts
/**
 * BaufiDesk kennt Objektarten, fuer die Europace keinen eigenen Typ hat
 * (Grundstueck ist dort BAUGRUNDSTUECK, Gewerbe hat gar kein Gegenstueck).
 * Ohne Entsprechung faellt es auf IMMOBILIE_OHNE_TYP zurueck – das ist ein
 * vorgesehener Wert des Schemas, keine Notluege.
 */
const OBJEKTART: Record<PropertyType, string> = {
  einfamilienhaus: "EINFAMILIENHAUS",
  doppelhaushaelfte: "DOPPELHAUSHAELFTE",
  reihenhaus: "REIHENHAUS",
  eigentumswohnung: "EIGENTUMSWOHNUNG",
  mehrfamilienhaus: "MEHRFAMILIENHAUS",
  grundstueck: "BAUGRUNDSTUECK",
  gewerbe: "IMMOBILIE_OHNE_TYP",
  sonstiges: "IMMOBILIE_OHNE_TYP",
};

/** Diese Typen kennen keine eigene Grundstuecksgroesse. */
const OHNE_GRUNDSTUECK = new Set(["EIGENTUMSWOHNUNG", "IMMOBILIE_OHNE_TYP"]);

function finanzierungsobjekt(c: CanonicalCase): EuropaceFinanzierungsobjekt | undefined {
  const p = c.property;
  if (!p) return undefined;

  const typ = p.objektart ? OBJEKTART[p.objektart] : "IMMOBILIE_OHNE_TYP";
  const gebaeude = wegLassenWennLeer({
    baujahr: p.baujahr,
    nutzung: p.wohnflaeche ? { wohnen: { gesamtflaeche: p.wohnflaeche } } : undefined,
  });

  const immobilie = wegLassenWennLeer({
    adresse: anschriftAufteilen(p.strasse, p.plz, p.ort),
    typ: {
      "@type": typ,
      ...(gebaeude ? { gebaeude } : {}),
      ...(OHNE_GRUNDSTUECK.has(typ) || !p.grundstuecksflaeche
        ? {}
        : { grundstuecksgroesse: p.grundstuecksflaeche }),
    },
  });

  return immobilie ? { immobilie } : undefined;
}
```

Ergänze die Importe am Dateikopf:

```ts
import type { EmploymentType, MaritalStatus, PropertyType } from "@/lib/domain/enums";
import type {
  Datenkontext,
  EuropaceAnschrift,
  EuropaceBeschaeftigung,
  EuropaceFinanzierungsobjekt,
  EuropaceHaushalt,
  EuropaceKunde,
  EuropaceKundenangabenRequest,
} from "./types";
```

Und erweitere den Rückgabewert von `canonicalToKundenangaben`:

```ts
    kundenangaben: {
      haushalte: haushalte(c),
      finanzierungsobjekt: finanzierungsobjekt(c),
    },
```

- [ ] **Schritt 4: Tests ausführen**

```bash
npx vitest run tests/europace-mapping.test.ts && npm run typecheck
```

Erwartet: alle grün.

- [ ] **Schritt 5: Committen**

```bash
git add src/lib/platforms/europace/kundenangaben-mapping.ts tests/europace-mapping.test.ts
git commit -m "feat(europace): Finanzierungsobjekt auf Kundenangaben mappen"
```

---

### Task 4: Mapping des Finanzierungsbedarfs

**Files:**
- Modify: `src/lib/platforms/europace/kundenangaben-mapping.ts`
- Modify: `tests/europace-mapping.test.ts`

**Interfaces:**
- Consumes: `canonicalToKundenangaben` (Task 3)
- Produces: `canonicalToKundenangaben` füllt zusätzlich `kundenangaben.finanzierungsbedarf` und das Eigenkapital in `haushalte[0].finanzielleSituation`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Ergänze in `tests/europace-mapping.test.ts` am Ende:

```ts
describe("canonicalToKundenangaben – Finanzierungsbedarf", () => {
  const kauffall = fall({
    applicants: [{ position: 1, vorname: "Anna", nachname: "Muster" }],
    financing: {
      finanzierungsart: "kauf",
      kaufpreis: 450_000,
      nebenkosten: 40_000,
      maklerprovisionProzent: 3.57,
      eigenkapital: 90_000,
      darlehenswunsch: 400_000,
    },
  });

  it("mappt den Zweck als KAUF mit Kaufpreis", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    const zweck = r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!;
    expect(zweck["@type"]).toBe("KAUF");
    expect(zweck.kaufpreis).toBe(450_000);
  });

  it("mappt die Maklerprovision als Prozentwert", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!.nebenkosten).toEqual({
      maklergebuehr: { einheit: "PROZENT", wert: 3.57 },
    });
  });

  it("macht aus dem Darlehenswunsch ein Annuitaetendarlehen", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungsbausteine).toEqual([
      { "@type": "ANNUITAETENDARLEHEN", darlehensbetrag: 400_000 },
    ]);
  });

  it("legt das Eigenkapital als Bank- und Sparguthaben im Haushalt ab", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.haushalte![0].finanzielleSituation).toEqual({
      vermoegen: { summeBankUndSparguthaben: { guthaben: 90_000 } },
    });
  });

  it("mappt die Anschlussfinanzierung auf ihren eigenen Zweck", () => {
    const r = canonicalToKundenangaben(
      fall({ financing: { finanzierungsart: "anschlussfinanzierung", darlehenswunsch: 210_000 } }),
      { datenkontext: "TEST_MODUS" }
    );
    const zweck = r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!;
    expect(zweck["@type"]).toBe("ANSCHLUSSFINANZIERUNG");
    expect(zweck.kaufpreis).toBeUndefined();
  });

  it("laesst den Zweck weg, wenn die Finanzierungsart unbekannt ist", () => {
    const r = canonicalToKundenangaben(fall({ financing: { darlehenswunsch: 100_000 } }), {
      datenkontext: "TEST_MODUS",
    });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungszweck).toBeUndefined();
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungsbausteine).toHaveLength(1);
  });

  it("bleibt schemakonform", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-mapping.test.ts -t "Finanzierungsbedarf"
```

Erwartet: FAIL — `finanzierungsbedarf` ist `undefined`.

- [ ] **Schritt 3: Bedarfs-Mapping implementieren**

Ergänze in `src/lib/platforms/europace/kundenangaben-mapping.ts`:

```ts
/**
 * "umschuldung" hat in Europace keinen eigenen Zweck – fachlich ist es dort
 * eine Anschlussfinanzierung. Fehlt die Finanzierungsart, bleibt der Zweck leer,
 * statt KAUF zu unterstellen.
 */
const FINANZIERUNGSZWECK: Record<FinancingType, string> = {
  kauf: "KAUF",
  neubau: "NEUBAU",
  anschlussfinanzierung: "ANSCHLUSSFINANZIERUNG",
  umschuldung: "ANSCHLUSSFINANZIERUNG",
  modernisierung: "MODERNISIERUNG_UMBAU_ANBAU",
  kapitalbeschaffung: "KAPITALBESCHAFFUNG",
};

/** Nur der Kauf kennt einen Kaufpreis samt Kaufnebenkosten. */
const MIT_KAUFPREIS = new Set(["KAUF", "KAUF_NEUBAU_VOM_BAUTRAEGER"]);

function finanzierungsbedarf(c: CanonicalCase): EuropaceFinanzierungsbedarf | undefined {
  const f = c.financing;
  const typ = f.finanzierungsart ? FINANZIERUNGSZWECK[f.finanzierungsart] : undefined;

  const nebenkosten = wegLassenWennLeer({
    maklergebuehr:
      f.maklerprovisionProzent != null
        ? { einheit: "PROZENT" as const, wert: f.maklerprovisionProzent }
        : undefined,
  });

  const zweck =
    typ === undefined
      ? undefined
      : {
          "@type": typ,
          ...(MIT_KAUFPREIS.has(typ) && f.kaufpreis != null ? { kaufpreis: f.kaufpreis } : {}),
          ...(MIT_KAUFPREIS.has(typ) && nebenkosten ? { nebenkosten } : {}),
        };

  const bausteine =
    f.darlehenswunsch != null
      ? [{ "@type": "ANNUITAETENDARLEHEN", darlehensbetrag: f.darlehenswunsch }]
      : undefined;

  return wegLassenWennLeer({
    finanzierungszweck: zweck,
    finanzierungsbausteine: bausteine,
  });
}
```

Erweitere `haushalte`, damit das Eigenkapital am Haushalt landet:

```ts
function haushalte(c: CanonicalCase): EuropaceHaushalt[] | undefined {
  const eigenkapital = c.financing.eigenkapital;
  if (c.applicants.length === 0 && eigenkapital == null) return undefined;

  const kunden = [...c.applicants]
    .sort((a, b) => a.position - b.position)
    .slice(0, 2)
    .map((a) => kunde(c, a));

  // Eigenkapital ist eine Haushaltsgroesse, keine Eigenschaft eines Antragstellers.
  const finanzielleSituation =
    eigenkapital != null
      ? { vermoegen: { summeBankUndSparguthaben: { guthaben: eigenkapital } } }
      : undefined;

  return [wegLassenWennLeer({ kunden: kunden.length ? kunden : undefined, finanzielleSituation })!];
}
```

Ergänze Importe und den Rückgabewert:

```ts
import type { EmploymentType, FinancingType, MaritalStatus, PropertyType } from "@/lib/domain/enums";
```

```ts
    kundenangaben: {
      haushalte: haushalte(c),
      finanzierungsobjekt: finanzierungsobjekt(c),
      finanzierungsbedarf: finanzierungsbedarf(c),
    },
```

`EuropaceFinanzierungsbedarf` muss zu den Typimporten aus `./types` hinzu.

- [ ] **Schritt 4: Tests ausführen**

```bash
npx vitest run tests/europace-mapping.test.ts && npm run typecheck
```

Erwartet: alle grün, inklusive der Tests aus Task 2 und 3.

- [ ] **Schritt 5: Committen**

```bash
git add src/lib/platforms/europace/kundenangaben-mapping.ts tests/europace-mapping.test.ts
git commit -m "feat(europace): Finanzierungsbedarf und Eigenkapital mappen"
```

---

### Task 5: OAuth-Client

**Files:**
- Create: `src/lib/platforms/europace/client.ts`
- Create: `tests/europace-client.test.ts`

**Interfaces:**
- Consumes: `fetchWithRateLimitRetry(url, init, timeoutMs)` aus `@/lib/ai/http`; `EuropaceKundenangabenRequest`, `Datenkontext` (Task 2)
- Produces:
  - `class EuropaceAuthError`, `EuropaceValidationError` (Feld `meldungen: string[]`), `EuropaceApiError`
  - `interface EuropaceClient { validiereKundenangaben(req): Promise<void>; legeVorgangAn(req): Promise<string>; ladeDokumentHoch(input: DokumentUpload): Promise<string>; }`
  - `interface DokumentUpload { vorgangsnummer: string; datei: Buffer; dateiname: string; mimeType: string; anzeigename: string; kategorie: string }`
  - `function getEuropaceClient(organizationId: string, fetchImpl?: typeof fetch): EuropaceClient | null` — `null`, wenn nicht konfiguriert
  - `function getDatenkontext(): Datenkontext`

**Warum `organizationId`, obwohl sie heute nicht benutzt wird.** BaufiDesk soll ein
Produkt für viele Vermittler werden, und jeder Vermittler ist bei Europace ein
eigener Partner. Der saubere SaaS-Weg dafür ist Europaces Authorization-Code-Flow:
BaufiDesk registriert sich einmalig als Tech-Partner, jeder Vermittler autorisiert
es per Consent-Seite, und niemand tippt Secrets ab. Das ist ein eigenes Projekt und
setzt eine Tech-Partner-Registrierung voraus, die es noch nicht gibt.

Damit der spätere Umbau nicht durch den halben Code wandert, nimmt
`getEuropaceClient` die `organizationId` **jetzt schon** entgegen — und ignoriert
sie vorerst bewusst. Wenn der SaaS-Weg kommt, ändert sich genau diese eine
Funktion, kein Aufrufer.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EuropaceAuthError,
  EuropaceValidationError,
  HttpEuropaceClient,
} from "@/lib/platforms/europace/client";

const REQUEST = {
  importMetadaten: { datenkontext: "TEST_MODUS" as const },
  kundenangaben: {},
};

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpEuropaceClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holt ein Token per Basic Auth und haengt es an den Folgeaufruf", async () => {
    const aufrufe: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      aufrufe.push({ url, init });
      if (url.includes("/auth/token")) return antwort({ access_token: "tok-1", expires_in: 3600 });
      return antwort({ vorgangsnummer: "YX4MDU" }, 201);
    }) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    const nummer = await client.legeVorgangAn(REQUEST);

    expect(nummer).toBe("YX4MDU");
    expect(aufrufe[0].url).toBe("https://api.europace.de/auth/token");
    expect((aufrufe[0].init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("id:geheim").toString("base64")}`
    );
    expect((aufrufe[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("holt das Token nur einmal, solange es gueltig ist", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort({ vorgangsnummer: "AAA111" }, 201)
    ) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    await client.legeVorgangAn(REQUEST);
    await client.legeVorgangAn(REQUEST);

    const tokenAufrufe = (fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls.filter(
      (c) => String(c[0]).includes("/auth/token")
    );
    expect(tokenAufrufe).toHaveLength(1);
  });

  it("meldet abgelehnte Zugangsdaten als EuropaceAuthError", async () => {
    const fetchImpl = vi.fn(async () => antwort({ error: "invalid_client" }, 401)) as unknown as typeof fetch;
    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "falsch" }, fetchImpl);
    await expect(client.legeVorgangAn(REQUEST)).rejects.toBeInstanceOf(EuropaceAuthError);
  });

  it("reicht Validierungsmeldungen aus einer 400-Antwort feldgenau durch", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort(
            { messages: [{ path: "kundenangaben.haushalte[0]", message: "Kunde ohne referenzId" }] },
            400
          )
    ) as unknown as typeof fetch;

    const client = new HttpEuropaceClient({ clientId: "id", clientSecret: "geheim" }, fetchImpl);
    const fehler = await client.validiereKundenangaben(REQUEST).catch((e) => e);

    expect(fehler).toBeInstanceOf(EuropaceValidationError);
    expect((fehler as EuropaceValidationError).meldungen).toEqual([
      "kundenangaben.haushalte[0]: Kunde ohne referenzId",
    ]);
  });

  it("schickt bei der Validierung keinen Anlege-Request", async () => {
    const pfade: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      pfade.push(String(url));
      return url.includes("/auth/token")
        ? antwort({ access_token: "tok-1", expires_in: 3600 })
        : antwort({}, 200);
    }) as unknown as typeof fetch;

    await new HttpEuropaceClient({ clientId: "id", clientSecret: "g" }, fetchImpl).validiereKundenangaben(
      REQUEST
    );
    expect(pfade.some((p) => p.endsWith("/kundenangaben"))).toBe(false);
    expect(pfade.some((p) => p.endsWith("/kundenangaben/body-validation"))).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-client.test.ts
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 3: Client implementieren**

Erstelle `src/lib/platforms/europace/client.ts`:

```ts
import { fetchWithRateLimitRetry } from "@/lib/ai/http";
import type { Datenkontext, EuropaceKundenangabenRequest } from "./types";

export class EuropaceNotConfiguredError extends Error {}
export class EuropaceAuthError extends Error {}
export class EuropaceApiError extends Error {}

/** Traegt die Feldmeldungen von Europace, damit die UI sie einzeln zeigen kann. */
export class EuropaceValidationError extends Error {
  constructor(readonly meldungen: string[]) {
    super("Europace hat die Kundenangaben abgelehnt.");
  }
}

const TOKEN_URL = "https://api.europace.de/auth/token";
const BAUFI_HOST = "https://baufinanzierung.api.europace.de";
const UNTERLAGEN_HOST = "https://api.europace2.de";

/** Token laeuft nach 3600 s ab; wir erneuern es eine Minute vorher. */
const TOKEN_PUFFER_MS = 60_000;
const TIMEOUT_MS = 30_000;
/** Der Upload darf laenger dauern – Europace erlaubt bis 100 MB je Datei. */
const UPLOAD_TIMEOUT_MS = 120_000;

const SCOPES = [
  "baufinanzierung:vorgang:schreiben",
  "baufinanzierung:vorgang:lesen",
  "unterlagen:dokument:schreiben",
  "unterlagen:unterlage:schreiben",
].join(" ");

export interface DokumentUpload {
  vorgangsnummer: string;
  datei: Buffer;
  dateiname: string;
  mimeType: string;
  anzeigename: string;
  kategorie: string;
}

export interface EuropaceClient {
  /** Trockenlauf: prueft den Request, legt nichts an. */
  validiereKundenangaben(req: EuropaceKundenangabenRequest): Promise<void>;
  /** Legt den Vorgang an und liefert die Vorgangsnummer. */
  legeVorgangAn(req: EuropaceKundenangabenRequest): Promise<string>;
  /** Laedt ein Dokument hoch und liefert die Europace-Dokument-ID. */
  ladeDokumentHoch(input: DokumentUpload): Promise<string>;
}

interface EuropaceConfig {
  clientId: string;
  clientSecret: string;
}

export class HttpEuropaceClient implements EuropaceClient {
  private token: { wert: string; gueltigBis: number } | null = null;

  constructor(
    private readonly config: EuropaceConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async holeToken(): Promise<string> {
    if (this.token && Date.now() < this.token.gueltigBis) return this.token.wert;

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        TOKEN_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPES }).toString(),
        },
        TIMEOUT_MS
      );
    } catch {
      // Keine Details durchreichen – der Basic-Header darf nirgends landen.
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Client-ID und Secret pruefen.");
    }
    if (!res.ok) {
      console.warn(`[europace] Token -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Europace-Token fehlgeschlagen (HTTP ${res.status}).`);
    }

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new EuropaceApiError("Europace lieferte kein Token.");

    this.token = {
      wert: body.access_token,
      gueltigBis: Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_PUFFER_MS,
    };
    return this.token.wert;
  }

  /** Zieht die Feldmeldungen aus einer 400-Antwort; Format variiert je Endpunkt. */
  private static meldungenAus(body: unknown): string[] {
    const eintraege =
      (body as { messages?: unknown[] })?.messages ??
      (body as { errors?: unknown[] })?.errors ??
      [];
    const gelesen = (Array.isArray(eintraege) ? eintraege : []).map((e) => {
      if (typeof e === "string") return e;
      const o = e as { path?: string; field?: string; message?: string; detail?: string };
      const pfad = o.path ?? o.field;
      const text = o.message ?? o.detail ?? JSON.stringify(e);
      return pfad ? `${pfad}: ${text}` : text;
    });
    return gelesen.length ? gelesen : ["Europace nannte keinen Grund."];
  }

  private async sendeKundenangaben(pfad: string, req: EuropaceKundenangabenRequest): Promise<Response> {
    const token = await this.holeToken();
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        `${BAUFI_HOST}${pfad}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json;version=1.0",
            Accept: "application/json;version=1.0",
          },
          body: JSON.stringify(req),
        },
        TIMEOUT_MS
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Scopes des API-Clients pruefen.");
    }
    if (res.status === 400) {
      throw new EuropaceValidationError(HttpEuropaceClient.meldungenAus(await res.json().catch(() => ({}))));
    }
    if (!res.ok) {
      console.warn(`[europace] POST ${pfad} -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Europace antwortete mit HTTP ${res.status}.`);
    }
    return res;
  }

  async validiereKundenangaben(req: EuropaceKundenangabenRequest): Promise<void> {
    await this.sendeKundenangaben("/kundenangaben/body-validation", req);
  }

  async legeVorgangAn(req: EuropaceKundenangabenRequest): Promise<string> {
    const res = await this.sendeKundenangaben("/kundenangaben", req);
    const body = (await res.json()) as { vorgangsnummer?: string };
    if (!body.vorgangsnummer) {
      // Ohne Nummer gilt der Fall NICHT als uebertragen.
      throw new EuropaceApiError("Europace lieferte keine Vorgangsnummer.");
    }
    return body.vorgangsnummer;
  }

  async ladeDokumentHoch(input: DokumentUpload): Promise<string> {
    const token = await this.holeToken();
    const form = new FormData();
    form.append("caseId", input.vorgangsnummer);
    form.append("displayName", input.anzeigename);
    form.append("category", input.kategorie);
    form.append(
      "file",
      new Blob([new Uint8Array(input.datei)], { type: input.mimeType }),
      input.dateiname
    );

    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        `${UNTERLAGEN_HOST}/v2/dokumente`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
        UPLOAD_TIMEOUT_MS
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Unterlagen-Scopes pruefen.");
    }
    if (!res.ok) {
      console.warn(`[europace] Dokument-Upload -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Dokument-Upload fehlgeschlagen (HTTP ${res.status}).`);
    }

    const body = (await res.json()) as { id?: string; dokumentId?: string };
    const id = body.id ?? body.dokumentId;
    if (!id) throw new EuropaceApiError("Europace lieferte keine Dokument-ID.");
    return id;
  }
}

/**
 * Liefert den Client fuer eine Organisation. null, wenn keine Zugangsdaten
 * gesetzt sind – die UI zeigt dann den Hinweis statt eines toten Knopfes.
 *
 * `organizationId` wird im Pilotbetrieb bewusst NICHT ausgewertet: es gibt genau
 * einen Europace-Partner, dessen Zugangsdaten in der Umgebung stehen. Der
 * Parameter ist die Naht fuer den spaeteren SaaS-Betrieb, in dem jeder Vermittler
 * ein eigener Europace-Partner ist (Authorization-Code-Flow ueber einen
 * BaufiDesk-Tech-Partner-Client). Dann aendert sich nur diese Funktion.
 */
export function getEuropaceClient(
  organizationId: string,
  fetchImpl: typeof fetch = fetch
): EuropaceClient | null {
  void organizationId;
  const clientId = process.env.EUROPACE_CLIENT_ID;
  const clientSecret = process.env.EUROPACE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new HttpEuropaceClient({ clientId, clientSecret }, fetchImpl);
}

/**
 * Vorgabe ist der Testmodus. Echtgeschaeft muss ausdruecklich gesetzt werden,
 * damit niemand versehentlich echte Vorgaenge erzeugt.
 */
export function getDatenkontext(): Datenkontext {
  return process.env.EUROPACE_DATENKONTEXT === "ECHT_GESCHAEFT" ? "ECHT_GESCHAEFT" : "TEST_MODUS";
}
```

- [ ] **Schritt 4: Tests ausführen**

```bash
npx vitest run tests/europace-client.test.ts && npm run typecheck
```

Erwartet: alle grün.

- [ ] **Schritt 5: Committen**

```bash
git add src/lib/platforms/europace/client.ts tests/europace-client.test.ts
git commit -m "feat(europace): OAuth-Client mit Trockenlauf, Anlegen und Dokument-Upload"
```

---

### Task 6: Dokumentkategorien zuordnen

**Files:**
- Create: `src/lib/platforms/europace/dokument-kategorien.ts`
- Create: `tests/europace-kategorien.test.ts`

**Interfaces:**
- Consumes: `DocumentType`, `DOCUMENT_TYPES` aus `@/lib/domain/enums`; `schema/dokument-kategorien.json` (Task 1)
- Produces: `function europaceKategorie(typ: DocumentType | null): string`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-kategorien.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { europaceKategorie } from "@/lib/platforms/europace/dokument-kategorien";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";

const ERLAUBT: string[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../src/lib/platforms/europace/schema/dokument-kategorien.json"),
    "utf8"
  )
);

describe("europaceKategorie", () => {
  it("bildet jeden BaufiDesk-Dokumenttyp auf eine gueltige Europace-Kategorie ab", () => {
    const ungueltig = DOCUMENT_TYPES.filter((t) => !ERLAUBT.includes(europaceKategorie(t)));
    expect(ungueltig).toEqual([]);
  });

  it("ordnet den Personalausweis der Kategorie Ausweis zu", () => {
    expect(europaceKategorie("personalausweis")).toBe("Ausweis");
  });

  it("faellt fuer unbekannte Typen auf Sonstiges zurueck", () => {
    expect(europaceKategorie(null)).toBe("Sonstiges");
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-kategorien.test.ts
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 3: Zuordnung implementieren**

Erstelle `src/lib/platforms/europace/dokument-kategorien.ts`. Die rechte Spalte muss exakt einem Wert aus `schema/dokument-kategorien.json` entsprechen — der Test in Schritt 1 prüft genau das:

```ts
import type { DocumentType } from "@/lib/domain/enums";

/**
 * BaufiDesk-Dokumenttyp -> Europace-Kategorie.
 *
 * Die Zielwerte stammen aus schema/dokument-kategorien.json (offizielle Liste
 * der Dokumente-API). Wo BaufiDesk feiner unterscheidet als Europace, laufen
 * mehrere Typen auf dieselbe Kategorie – das ist gewollt.
 */
const KATEGORIE: Record<DocumentType, string> = {
  personalausweis: "Ausweis",
  gehaltsabrechnung: "Gehaltsabrechnung",
  grundbuchauszug: "Grundbuchauszug",
  expose: "Objektbeschreibung",
  kontoauszug: "Kontoauszug",
  einkommensteuerbescheid: "Einkommensteuerbescheid",
  einkommensteuererklaerung: "Einkommensteuererklaerung",
  eigenkapitalnachweis: "Eigenkapitalnachweis",
  kaufvertragsentwurf: "Kaufvertrag",
  teilungserklaerung: "Teilungserklaerung",
  wohnflaechenberechnung: "Wohnflaechenberechnung",
  flurkarte_lageplan: "Lageplan",
  baubeschreibung: "Baubeschreibung",
  baukostenaufstellung: "Baukostenaufstellung",
  baugenehmigung: "Baugenehmigung",
  darlehensvertrag: "Darlehensvertrag",
  restschuldnachweis: "Restschuldbescheinigung",
  mietvertrag: "Mietvertrag",
  mietaufstellung: "Mietaufstellung",
  bwa: "BWA",
  susa: "Summen_und_Saldenliste",
  jahresabschluss: "Jahresabschluss",
  euer: "Einnahmenueberschussrechnung",
  rentenbescheid: "Rentenbescheid",
  versicherungsnachweis: "Versicherungsnachweis",
  sonstige: "Sonstiges",
};

export function europaceKategorie(typ: DocumentType | null): string {
  return (typ && KATEGORIE[typ]) || "Sonstiges";
}
```

- [ ] **Schritt 4: Test ausführen und Abweichungen korrigieren**

```bash
npx vitest run tests/europace-kategorien.test.ts
```

Der erste Test listet jeden Typ auf, dessen Zielwert nicht in der offiziellen Liste steht. Das ist der Normalfall beim ersten Lauf, weil die obigen Werte aus der Doku-Zusammenfassung stammen. Für jeden gemeldeten Typ den passenden Wert in der Liste nachschlagen und eintragen:

```bash
node -p "require('./src/lib/platforms/europace/schema/dokument-kategorien.json').filter(k => /miet|renten|susa|salden/i.test(k))"
```

Findet sich keine passende Kategorie, ist `"Sonstiges"` die richtige Antwort — nicht ein ähnlich klingender Wert. Danach erneut ausführen, bis alle drei Tests grün sind.

- [ ] **Schritt 5: Committen**

```bash
git add src/lib/platforms/europace/dokument-kategorien.ts tests/europace-kategorien.test.ts
git commit -m "feat(europace): Dokumenttypen auf Europace-Kategorien abbilden"
```

---

### Task 7: Datenbankspalten ergänzen

**Files:**
- Modify: `prisma/schema.prisma` (Modell `PlatformMapping` ~Zeile 1048, Modell `Document` ~Zeile 706)
- Create: `prisma/sql/2026-08-09-europace-spalten.sql`

**Interfaces:**
- Consumes: nichts
- Produces: `PlatformMapping.externalId: string | null`, `Document.europaceDokumentId: string | null` im Prisma-Client

- [ ] **Schritt 1: Prisma-Schema ergänzen**

In `prisma/schema.prisma`, Modell `PlatformMapping`, nach `missingRequiredFields`:

```prisma
  /// Vorgangsnummer der Plattform (Europace). Gesetzt = Vorgang wurde angelegt.
  externalId            String?
```

Im Modell `Document`, nach `detectedApplicant`:

```prisma
  /// Von Europace vergebene Dokument-ID. Gesetzt = bereits uebertragen.
  europaceDokumentId String?
```

- [ ] **Schritt 2: SQL-Datei schreiben**

Erstelle `prisma/sql/2026-08-09-europace-spalten.sql`:

```sql
-- Europace-Anbindung: Vorgangsnummer je Fall, Dokument-ID je Unterlage.
-- Additiv und nullable – keine Auswirkung auf Bestandsdaten.
ALTER TABLE platform_mappings ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "europaceDokumentId" TEXT;
```

- [ ] **Schritt 3: Trockenlauf**

```bash
scripts/supabase-sql.sh prisma/sql/2026-08-09-europace-spalten.sql --dry-run
```

Prüfen, dass genau die beiden `ALTER TABLE` angezeigt werden und das Schema `unterlagenpilot` ist.

- [ ] **Schritt 4: Migration ausführen**

Dies wirkt gegen die Produktivdatenbank.

```bash
scripts/supabase-sql.sh prisma/sql/2026-08-09-europace-spalten.sql
```

- [ ] **Schritt 5: Prisma-Client neu erzeugen und prüfen**

```bash
npx prisma generate && npm run typecheck
```

- [ ] **Schritt 6: Committen**

```bash
git add prisma/schema.prisma prisma/sql/2026-08-09-europace-spalten.sql
git commit -m "feat(europace): Spalten fuer Vorgangsnummer und Dokument-ID"
```

---

### Task 8: Server-Action „Vorgang anlegen"

**Files:**
- Create: `src/lib/platforms/europace/uebertragung.ts`
- Modify: `src/lib/actions/cases.ts` (neue Action am Dateiende)
- Create: `tests/europace-uebertragung.test.ts`

**Interfaces:**
- Consumes: `canonicalToKundenangaben` (Task 4), `getEuropaceClient`, `getDatenkontext`, `EuropaceValidationError`, `EuropaceAuthError` (Task 5), `caseToCanonical` aus `@/lib/platforms/case-loader`
- Produces:
  - `interface UebertragungErgebnis { ok: boolean; vorgangsnummer?: string; meldung: string; feldmeldungen?: string[] }`
  - `function uebertrageFallNachEuropace(caseId, deps): Promise<UebertragungErgebnis>` mit `deps: { client, datenkontext, canonical, mapping, syncLog }`
  - Server-Action `europaceVorgangAnlegen(caseId: string): Promise<UebertragungErgebnis>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-uebertragung.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { uebertrageFallNachEuropace } from "@/lib/platforms/europace/uebertragung";
import { EuropaceAuthError, EuropaceValidationError } from "@/lib/platforms/europace/client";
import type { CanonicalCase } from "@/lib/domain/canonical";

const CANONICAL = {
  caseNumber: "UP-2026-0007",
  applicants: [{ position: 1, vorname: "Anna", nachname: "Muster" }],
  employment: [],
  income: [],
  liabilities: [],
  assets: [],
  financing: {},
} as CanonicalCase;

function deps(over: Partial<Parameters<typeof uebertrageFallNachEuropace>[1]> = {}) {
  return {
    client: {
      validiereKundenangaben: vi.fn(async () => {}),
      legeVorgangAn: vi.fn(async () => "YX4MDU"),
      ladeDokumentHoch: vi.fn(async () => "dok-1"),
    },
    datenkontext: "TEST_MODUS" as const,
    ladeCanonical: vi.fn(async () => CANONICAL),
    ladeVorhandeneNummer: vi.fn(async () => null),
    speichereNummer: vi.fn(async () => {}),
    protokolliere: vi.fn(async () => {}),
    ...over,
  };
}

describe("uebertrageFallNachEuropace", () => {
  it("validiert erst, legt dann an und speichert die Nummer", async () => {
    const d = deps();
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis).toMatchObject({ ok: true, vorgangsnummer: "YX4MDU" });
    expect(d.client.validiereKundenangaben).toHaveBeenCalledOnce();
    expect(d.client.legeVorgangAn).toHaveBeenCalledOnce();
    expect(d.speichereNummer).toHaveBeenCalledWith("case-1", "YX4MDU");
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({ status: "erfolg" })
    );
  });

  it("legt nichts an, wenn der Trockenlauf scheitert", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          throw new EuropaceValidationError(["kundenangaben.haushalte[0]: Kunde ohne referenzId"]);
        }),
        legeVorgangAn: vi.fn(async () => "SOLLTE-NICHT-PASSIEREN"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.feldmeldungen).toEqual(["kundenangaben.haushalte[0]: Kunde ohne referenzId"]);
    expect(d.client.legeVorgangAn).not.toHaveBeenCalled();
    expect(d.speichereNummer).not.toHaveBeenCalled();
  });

  it("uebertraegt einen Fall mit vorhandener Vorgangsnummer nicht erneut", async () => {
    const d = deps({ ladeVorhandeneNummer: vi.fn(async () => "ALT123") });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.vorgangsnummer).toBe("ALT123");
    expect(d.client.legeVorgangAn).not.toHaveBeenCalled();
  });

  it("meldet fehlenden Zugang verstaendlich", async () => {
    const d = deps({ client: null });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain("nicht verbunden");
  });

  it("protokolliert auch den Auth-Fehler", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          throw new EuropaceAuthError("Europace-Zugang abgelehnt.");
        }),
        legeVorgangAn: vi.fn(async () => "X"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);
    expect(ergebnis.ok).toBe(false);
    expect(d.protokolliere).toHaveBeenCalledWith(expect.objectContaining({ status: "fehler" }));
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-uebertragung.test.ts
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 3: Übertragungslogik implementieren**

Erstelle `src/lib/platforms/europace/uebertragung.ts`. Bewusst ohne direkte Prisma-Zugriffe — die kommen als `deps` herein, damit die Logik ohne Datenbank testbar bleibt:

```ts
import type { CanonicalCase } from "@/lib/domain/canonical";
import { canonicalToKundenangaben } from "./kundenangaben-mapping";
import { EuropaceAuthError, EuropaceValidationError, type EuropaceClient } from "./client";
import type { Datenkontext } from "./types";

export interface UebertragungErgebnis {
  ok: boolean;
  vorgangsnummer?: string;
  meldung: string;
  /** Feldgenaue Meldungen aus einer abgelehnten Validierung. */
  feldmeldungen?: string[];
}

export interface UebertragungDeps {
  client: EuropaceClient | null;
  datenkontext: Datenkontext;
  ladeCanonical: (caseId: string) => Promise<CanonicalCase>;
  ladeVorhandeneNummer: (caseId: string) => Promise<string | null>;
  speichereNummer: (caseId: string, vorgangsnummer: string) => Promise<void>;
  protokolliere: (eintrag: { caseId: string; status: string; meldung: string }) => Promise<void>;
}

/**
 * Legt den Fall als Europace-Vorgang an.
 *
 * Reihenfolge ist wesentlich: erst Trockenlauf (body-validation), dann anlegen.
 * Scheitert der Trockenlauf, entsteht in Europace kein halbfertiger Vorgang.
 */
export async function uebertrageFallNachEuropace(
  caseId: string,
  deps: UebertragungDeps
): Promise<UebertragungErgebnis> {
  if (!deps.client) {
    return {
      ok: false,
      meldung:
        "Europace ist nicht verbunden. Bitte EUROPACE_CLIENT_ID und EUROPACE_CLIENT_SECRET hinterlegen.",
    };
  }

  const vorhanden = await deps.ladeVorhandeneNummer(caseId);
  if (vorhanden) {
    return {
      ok: false,
      vorgangsnummer: vorhanden,
      meldung: `Fuer diesen Fall besteht bereits der Europace-Vorgang ${vorhanden}. Unterlagen koennen weiterhin nachgeschoben werden.`,
    };
  }

  const canonical = await deps.ladeCanonical(caseId);
  const request = canonicalToKundenangaben(canonical, { datenkontext: deps.datenkontext });

  try {
    await deps.client.validiereKundenangaben(request);
  } catch (e) {
    if (e instanceof EuropaceValidationError) {
      await deps.protokolliere({
        caseId,
        status: "fehler",
        meldung: `Validierung abgelehnt: ${e.meldungen.join(" | ")}`,
      });
      return {
        ok: false,
        meldung: "Europace hat die Daten abgelehnt. Es wurde kein Vorgang angelegt.",
        feldmeldungen: e.meldungen,
      };
    }
    return await fehlerAusgang(caseId, e, deps);
  }

  try {
    const vorgangsnummer = await deps.client.legeVorgangAn(request);
    await deps.speichereNummer(caseId, vorgangsnummer);
    await deps.protokolliere({
      caseId,
      status: "erfolg",
      meldung: `Vorgang ${vorgangsnummer} angelegt (${deps.datenkontext}).`,
    });
    return {
      ok: true,
      vorgangsnummer,
      meldung: `Europace-Vorgang ${vorgangsnummer} angelegt.`,
    };
  } catch (e) {
    return await fehlerAusgang(caseId, e, deps);
  }
}

async function fehlerAusgang(
  caseId: string,
  e: unknown,
  deps: UebertragungDeps
): Promise<UebertragungErgebnis> {
  const meldung =
    e instanceof EuropaceAuthError
      ? "Europace-Zugang abgelehnt. Bitte Client-ID, Secret und Scopes pruefen."
      : e instanceof Error
        ? e.message
        : "Uebertragung fehlgeschlagen.";
  await deps.protokolliere({ caseId, status: "fehler", meldung });
  return { ok: false, meldung };
}
```

- [ ] **Schritt 4: Tests ausführen**

```bash
npx vitest run tests/europace-uebertragung.test.ts
```

Erwartet: alle fünf grün.

- [ ] **Schritt 5: Server-Action ergänzen**

Am Ende von `src/lib/actions/cases.ts`:

```ts
/**
 * Legt den Fall als Europace-Vorgang an. Nur nach manueller Freigabe.
 */
export async function europaceVorgangAnlegen(caseId: string): Promise<UebertragungErgebnis> {
  const { ctx } = await requireCaseAccess(caseId);

  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { released: true },
  });
  if (!mapping?.released) {
    return { ok: false, meldung: "Der Fall ist fuer Europace noch nicht freigegeben." };
  }

  const ergebnis = await uebertrageFallNachEuropace(caseId, {
    client: getEuropaceClient(ctx.organizationId),
    datenkontext: getDatenkontext(),
    ladeCanonical: (id) => caseToCanonical(id),
    ladeVorhandeneNummer: async (id) =>
      (
        await prisma.platformMapping.findUnique({
          where: { caseId_platform: { caseId: id, platform: "europace" } },
          select: { externalId: true },
        })
      )?.externalId ?? null,
    speichereNummer: async (id, vorgangsnummer) => {
      await prisma.platformMapping.update({
        where: { caseId_platform: { caseId: id, platform: "europace" } },
        data: { externalId: vorgangsnummer },
      });
    },
    protokolliere: async ({ caseId: id, status, meldung }) => {
      await prisma.platformSyncLog.create({
        data: { caseId: id, platform: "europace", direction: "export", status, message: meldung },
      });
    },
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "europace.vorgang.angelegt",
      entityType: "case",
      entityId: caseId,
    });
  }

  revalidatePath(`/cases/${caseId}/export`);
  return ergebnis;
}
```

Ergänze die Importe am Dateikopf von `src/lib/actions/cases.ts`:

```ts
import { getDatenkontext, getEuropaceClient } from "@/lib/platforms/europace/client";
import {
  uebertrageFallNachEuropace,
  type UebertragungErgebnis,
} from "@/lib/platforms/europace/uebertragung";
```

- [ ] **Schritt 6: Typprüfung und Gesamttests**

```bash
npm run typecheck && npm test
```

- [ ] **Schritt 7: Committen**

```bash
git add src/lib/platforms/europace/uebertragung.ts src/lib/actions/cases.ts tests/europace-uebertragung.test.ts
git commit -m "feat(europace): Vorgang anlegen mit Trockenlauf und Protokoll"
```

---

### Task 9: Unterlagen übertragen

**Files:**
- Create: `src/lib/platforms/europace/unterlagen.ts`
- Modify: `src/lib/actions/cases.ts` (Action am Dateiende)
- Create: `tests/europace-unterlagen.test.ts`

**Interfaces:**
- Consumes: `EuropaceClient` (Task 5), `europaceKategorie` (Task 6), `getStorage()` aus `@/lib/storage`
- Produces:
  - `interface UnterlagenErgebnis { ok: boolean; uebertragen: number; uebersprungen: number; fehlgeschlagen: Array<{ name: string; grund: string }>; meldung: string }`
  - `function uebertrageUnterlagen(caseId, deps): Promise<UnterlagenErgebnis>`
  - Server-Action `europaceUnterlagenUebertragen(caseId: string): Promise<UnterlagenErgebnis>`

**Bewusst offen: die Antragsteller-Zuordnung (`assignmentId`).** Die Unterlagen-API
kann ein Dokument einem bestimmten Antragsteller zuordnen; die gültigen Werte
liefert ein Endpunkt namens `moeglicheZuordnungen`. Dessen genaue URL und
Antwortformat sind nicht verifiziert — sie stehen nicht in den bisher gelesenen
Quellen. **Nicht raten.** Die Dokumente gehen ohne `assignmentId` an den Vorgang,
was funktioniert; die Zuordnung wird nachgereicht, sobald der API-Zugang die
Prüfung des Endpunkts erlaubt. Bis dahin ordnet Jürgen in Europace zu — genau
wie heute auch.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/europace-unterlagen.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { uebertrageUnterlagen } from "@/lib/platforms/europace/unterlagen";
import { EuropaceApiError } from "@/lib/platforms/europace/client";

const DOKUMENTE = [
  {
    id: "d1",
    generatedName: "Personalausweis Anna Muster.pdf",
    originalName: "scan1.pdf",
    documentType: "personalausweis" as const,
    mimeType: "application/pdf",
    storageKey: "org/case/d1.pdf",
    europaceDokumentId: null,
  },
  {
    id: "d2",
    generatedName: "Gehaltsabrechnung 05-2026.pdf",
    originalName: "scan2.pdf",
    documentType: "gehaltsabrechnung" as const,
    mimeType: "application/pdf",
    storageKey: "org/case/d2.pdf",
    europaceDokumentId: null,
  },
];

function deps(over: Partial<Parameters<typeof uebertrageUnterlagen>[1]> = {}) {
  return {
    client: {
      validiereKundenangaben: vi.fn(async () => {}),
      legeVorgangAn: vi.fn(async () => "YX4MDU"),
      ladeDokumentHoch: vi.fn(async () => "ep-dok-1"),
    },
    ladeVorgangsnummer: vi.fn(async () => "YX4MDU" as string | null),
    ladeDokumente: vi.fn(async () => DOKUMENTE),
    ladeDatei: vi.fn(async () => Buffer.from("PDF")),
    merkeDokumentId: vi.fn(async () => {}),
    protokolliere: vi.fn(async () => {}),
    ...over,
  };
}

describe("uebertrageUnterlagen", () => {
  it("laedt jedes akzeptierte Dokument hoch und merkt sich die ID", async () => {
    const d = deps();
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis).toMatchObject({ ok: true, uebertragen: 2 });
    expect(d.client.ladeDokumentHoch).toHaveBeenCalledTimes(2);
    expect(d.client.ladeDokumentHoch).toHaveBeenCalledWith(
      expect.objectContaining({
        vorgangsnummer: "YX4MDU",
        kategorie: "Ausweis",
        anzeigename: "Personalausweis Anna Muster.pdf",
      })
    );
    expect(d.merkeDokumentId).toHaveBeenCalledWith("d1", "ep-dok-1");
  });

  it("ueberspringt bereits uebertragene Dokumente", async () => {
    const d = deps({
      ladeDokumente: vi.fn(async () => [
        { ...DOKUMENTE[0], europaceDokumentId: "schon-da" },
        DOKUMENTE[1],
      ]),
    });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.uebersprungen).toBe(1);
    expect(d.client.ladeDokumentHoch).toHaveBeenCalledOnce();
  });

  it("laedt die uebrigen weiter hoch, wenn eine Datei scheitert", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {}),
        legeVorgangAn: vi.fn(async () => "YX4MDU"),
        ladeDokumentHoch: vi
          .fn()
          .mockRejectedValueOnce(new EuropaceApiError("Dokument-Upload fehlgeschlagen (HTTP 500)."))
          .mockResolvedValueOnce("ep-dok-2"),
      },
    });

    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.fehlgeschlagen).toEqual([
      { name: "Personalausweis Anna Muster.pdf", grund: "Dokument-Upload fehlgeschlagen (HTTP 500)." },
    ]);
    expect(ergebnis.ok).toBe(false);
  });

  it("verweigert die Uebertragung ohne Vorgangsnummer", async () => {
    const d = deps({ ladeVorgangsnummer: vi.fn(async () => null) });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain("Vorgang");
    expect(d.client.ladeDokumentHoch).not.toHaveBeenCalled();
  });

  it("meldet eine im Speicher fehlende Datei, ohne abzubrechen", async () => {
    const d = deps({ ladeDatei: vi.fn(async (key: string) => (key.endsWith("d1.pdf") ? null : Buffer.from("PDF"))) });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.fehlgeschlagen[0].grund).toContain("Speicher");
  });
});
```

- [ ] **Schritt 2: Test ausführen, Fehlschlag bestätigen**

```bash
npx vitest run tests/europace-unterlagen.test.ts
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Schritt 3: Upload-Logik implementieren**

Erstelle `src/lib/platforms/europace/unterlagen.ts`:

```ts
import type { DocumentType } from "@/lib/domain/enums";
import type { EuropaceClient } from "./client";
import { europaceKategorie } from "./dokument-kategorien";

export interface UnterlagenDokument {
  id: string;
  generatedName: string | null;
  originalName: string;
  documentType: DocumentType | null;
  mimeType: string;
  storageKey: string;
  europaceDokumentId: string | null;
}

export interface UnterlagenErgebnis {
  ok: boolean;
  uebertragen: number;
  uebersprungen: number;
  fehlgeschlagen: Array<{ name: string; grund: string }>;
  meldung: string;
}

export interface UnterlagenDeps {
  client: EuropaceClient | null;
  ladeVorgangsnummer: (caseId: string) => Promise<string | null>;
  ladeDokumente: (caseId: string) => Promise<UnterlagenDokument[]>;
  ladeDatei: (storageKey: string) => Promise<Buffer | null>;
  merkeDokumentId: (dokumentId: string, europaceDokumentId: string) => Promise<void>;
  protokolliere: (eintrag: { caseId: string; status: string; meldung: string }) => Promise<void>;
}

/**
 * Laedt die akzeptierten Unterlagen an den bestehenden Europace-Vorgang.
 *
 * Bewusst je Datei: Ein Fehlschlag bei einem Dokument darf die uebrigen nicht
 * verhindern. Bereits uebertragene Dokumente werden uebersprungen, damit
 * mehrfaches Anstossen nichts doppelt.
 */
export async function uebertrageUnterlagen(
  caseId: string,
  deps: UnterlagenDeps
): Promise<UnterlagenErgebnis> {
  const leer = { uebertragen: 0, uebersprungen: 0, fehlgeschlagen: [] };

  if (!deps.client) {
    return { ok: false, ...leer, meldung: "Europace ist nicht verbunden." };
  }

  const vorgangsnummer = await deps.ladeVorgangsnummer(caseId);
  if (!vorgangsnummer) {
    return {
      ok: false,
      ...leer,
      meldung: "Es gibt noch keinen Europace-Vorgang. Bitte zuerst den Vorgang anlegen.",
    };
  }

  const dokumente = await deps.ladeDokumente(caseId);
  let uebertragen = 0;
  let uebersprungen = 0;
  const fehlgeschlagen: Array<{ name: string; grund: string }> = [];

  for (const d of dokumente) {
    const name = d.generatedName ?? d.originalName;
    if (d.europaceDokumentId) {
      uebersprungen += 1;
      continue;
    }

    try {
      const datei = await deps.ladeDatei(d.storageKey);
      if (!datei) {
        fehlgeschlagen.push({ name, grund: "Datei im Speicher nicht gefunden." });
        continue;
      }

      const europaceDokumentId = await deps.client.ladeDokumentHoch({
        vorgangsnummer,
        datei,
        dateiname: name,
        mimeType: d.mimeType,
        anzeigename: name,
        kategorie: europaceKategorie(d.documentType),
      });

      await deps.merkeDokumentId(d.id, europaceDokumentId);
      uebertragen += 1;
    } catch (e) {
      fehlgeschlagen.push({ name, grund: e instanceof Error ? e.message : "Unbekannter Fehler." });
    }
  }

  const ok = fehlgeschlagen.length === 0;
  const meldung = ok
    ? `${uebertragen} Unterlage(n) uebertragen${uebersprungen ? `, ${uebersprungen} bereits vorhanden` : ""}.`
    : `${uebertragen} uebertragen, ${fehlgeschlagen.length} fehlgeschlagen.`;

  await deps.protokolliere({ caseId, status: ok ? "erfolg" : "teilweise", meldung });

  return { ok, uebertragen, uebersprungen, fehlgeschlagen, meldung };
}
```

- [ ] **Schritt 4: Tests ausführen**

```bash
npx vitest run tests/europace-unterlagen.test.ts
```

Erwartet: alle fünf grün.

- [ ] **Schritt 5: Server-Action ergänzen**

Am Ende von `src/lib/actions/cases.ts`:

```ts
/**
 * Schiebt die akzeptierten Unterlagen an den bestehenden Europace-Vorgang.
 */
export async function europaceUnterlagenUebertragen(caseId: string): Promise<UnterlagenErgebnis> {
  const { ctx } = await requireCaseAccess(caseId);
  const storage = getStorage();

  const ergebnis = await uebertrageUnterlagen(caseId, {
    client: getEuropaceClient(ctx.organizationId),
    ladeVorgangsnummer: async (id) =>
      (
        await prisma.platformMapping.findUnique({
          where: { caseId_platform: { caseId: id, platform: "europace" } },
          select: { externalId: true },
        })
      )?.externalId ?? null,
    ladeDokumente: (id) =>
      prisma.document.findMany({
        where: { caseId: id, reviewStatus: "akzeptiert" },
        select: {
          id: true,
          generatedName: true,
          originalName: true,
          documentType: true,
          mimeType: true,
          storageKey: true,
          europaceDokumentId: true,
        },
      }),
    ladeDatei: (storageKey) => storage.get(storageKey),
    merkeDokumentId: async (dokumentId, europaceDokumentId) => {
      await prisma.document.update({ where: { id: dokumentId }, data: { europaceDokumentId } });
    },
    protokolliere: async ({ caseId: id, status, meldung }) => {
      await prisma.platformSyncLog.create({
        data: { caseId: id, platform: "europace", direction: "export", status, message: meldung },
      });
    },
  });

  revalidatePath(`/cases/${caseId}/export`);
  return ergebnis;
}
```

Ergänze die Importe:

```ts
import { getStorage } from "@/lib/storage";
import {
  uebertrageUnterlagen,
  type UnterlagenErgebnis,
} from "@/lib/platforms/europace/unterlagen";
```

- [ ] **Schritt 6: Typprüfung und Gesamttests**

```bash
npm run typecheck && npm test
```

- [ ] **Schritt 7: Committen**

```bash
git add src/lib/platforms/europace/unterlagen.ts src/lib/actions/cases.ts tests/europace-unterlagen.test.ts
git commit -m "feat(europace): Unterlagen je Datei an den Vorgang uebertragen"
```

---

### Task 10: Bedienoberfläche im Einreichungsassistenten

**Files:**
- Create: `src/components/case/europace-uebertragung.tsx`
- Modify: `src/app/(app)/cases/[id]/export/page.tsx`
- Modify: `src/lib/platforms/connectors.ts` (Methode `testConnection` und `pushCaseData` des `EuropaceConnector`)

**Interfaces:**
- Consumes: `europaceVorgangAnlegen`, `europaceUnterlagenUebertragen` (Tasks 8, 9); `getDatenkontext`, `getEuropaceClient` (Task 5)
- Produces: React-Komponente `<EuropaceUebertragung caseId freigegeben vorgangsnummer konfiguriert datenkontext offeneDokumente />`

- [ ] **Schritt 1: Komponente schreiben**

Erstelle `src/components/case/europace-uebertragung.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Send, Upload, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { europaceUnterlagenUebertragen, europaceVorgangAnlegen } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  caseId: string;
  freigegeben: boolean;
  vorgangsnummer: string | null;
  konfiguriert: boolean;
  datenkontext: "TEST_MODUS" | "ECHT_GESCHAEFT";
  /** Anzahl noch nicht akzeptierter Dokumente – nur als Hinweis. */
  offeneDokumente: number;
}

export function EuropaceUebertragung({
  caseId,
  freigegeben,
  vorgangsnummer,
  konfiguriert,
  datenkontext,
  offeneDokumente,
}: Props) {
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [feldmeldungen, setFeldmeldungen] = useState<string[]>([]);
  const [erfolg, setErfolg] = useState(false);

  const anlegen = () =>
    starte(async () => {
      const e = await europaceVorgangAnlegen(caseId);
      setMeldung(e.meldung);
      setFeldmeldungen(e.feldmeldungen ?? []);
      setErfolg(e.ok);
    });

  const unterlagen = () =>
    starte(async () => {
      const e = await europaceUnterlagenUebertragen(caseId);
      setMeldung(
        e.fehlgeschlagen.length
          ? `${e.meldung} ${e.fehlgeschlagen.map((f) => `${f.name}: ${f.grund}`).join(" | ")}`
          : e.meldung
      );
      setFeldmeldungen([]);
      setErfolg(e.ok);
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Übertragung nach Europace</CardTitle>
        {datenkontext === "TEST_MODUS" && konfiguriert && (
          <Badge variant="outline">Testmodus – keine echten Vorgänge</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!konfiguriert && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            Europace ist noch nicht verbunden. Dafür wird ein API-Client benötigt (Antrag an
            helpdesk@europace2.de); Client-ID und Secret stehen danach in der persönlichen Linkliste
            in Europace.
          </p>
        )}

        {vorgangsnummer ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Vorgang <span className="font-mono font-semibold">{vorgangsnummer}</span> angelegt.
            </p>
            <p className="text-sm text-muted-foreground">
              Stammdaten werden bewusst nur einmal übertragen. Spätere Korrekturen nimmst du direkt
              in Europace vor. Unterlagen kannst du jederzeit nachschieben.
            </p>
            <Button onClick={unterlagen} disabled={!konfiguriert || laeuft}>
              <Upload />
              {laeuft ? "Überträgt…" : "Unterlagen nachschieben"}
            </Button>
            {offeneDokumente > 0 && (
              <p className="text-sm text-muted-foreground">
                {offeneDokumente} Dokument(e) sind noch nicht geprüft und werden nicht übertragen.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Legt den Fall als Europace-Vorgang an. Die Daten werden vorab geprüft – schlägt die
              Prüfung fehl, entsteht kein Vorgang.
            </p>
            <Button onClick={anlegen} disabled={!konfiguriert || !freigegeben || laeuft}>
              <Send />
              {laeuft ? "Überträgt…" : "Nach Europace übertragen"}
            </Button>
            {!freigegeben && (
              <p className="text-sm text-muted-foreground">
                Der Fall muss zuerst für Europace freigegeben werden.
              </p>
            )}
          </>
        )}

        {meldung && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="flex items-start gap-2">
              {erfolg ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              )}
              {meldung}
            </p>
            {feldmeldungen.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
                {feldmeldungen.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Schritt 2: In die Export-Seite einhängen**

In `src/app/(app)/cases/[id]/export/page.tsx` die Datenabfrage erweitern. `mappings` lädt bisher nur `platform` und `released` — ergänze `externalId`:

```ts
    prisma.platformMapping.findMany({
      where: { caseId: id },
      select: { platform: true, released: true, externalId: true },
    }),
```

Ergänze die Importe:

```ts
import { getDatenkontext, getEuropaceClient } from "@/lib/platforms/europace/client";
import { EuropaceUebertragung } from "@/components/case/europace-uebertragung";
```

Die Seite ruft heute `await requireCaseAccess(id);` ohne das Ergebnis zu nutzen. Für
die Organisation brauchen wir es jetzt:

```ts
const { ctx } = await requireCaseAccess(id);
```

Und rendere die Komponente innerhalb des Europace-Tabs, direkt über der Feldtabelle:

```tsx
{active === "europace" && (
  <EuropaceUebertragung
    caseId={id}
    freigegeben={releasedOf("europace")}
    vorgangsnummer={mappings.find((m) => m.platform === "europace")?.externalId ?? null}
    konfiguriert={getEuropaceClient(ctx.organizationId) !== null}
    datenkontext={getDatenkontext()}
    offeneDokumente={docsOpen}
  />
)}
```

- [ ] **Schritt 3: Connector aufräumen**

In `src/lib/platforms/connectors.ts`, Klasse `EuropaceConnector`: `testConnection` sagt echt, was Sache ist, und `pushCaseData` verweist auf den neuen Weg statt „TODO". Ersetze die Methode `testConnection` und ergänze `pushCaseData`:

```ts
  async isConfigured() {
    return Boolean(process.env.EUROPACE_CLIENT_ID && process.env.EUROPACE_CLIENT_SECRET);
  }
  async testConnection(): Promise<ConnectionStatus> {
    const ok = await this.isConfigured();
    const kontext = process.env.EUROPACE_DATENKONTEXT === "ECHT_GESCHAEFT" ? "Echtgeschäft" : "Testmodus";
    return {
      ok,
      message: ok
        ? `Europace verbunden (${kontext}). Vorgang anlegen und Unterlagen übertragen im Einreichungsassistenten.`
        : "Europace nicht verbunden. EUROPACE_CLIENT_ID und EUROPACE_CLIENT_SECRET setzen (API-Client bei helpdesk@europace2.de beantragen).",
    };
  }
  /**
   * Die Übertragung läuft über den Einreichungsassistenten, weil sie eine
   * manuelle Freigabe und den Trockenlauf voraussetzt.
   */
  async pushCaseData(): Promise<PushResult> {
    return {
      ok: false,
      transmitted: false,
      message: "Bitte im Einreichungsassistenten übertragen – dort läuft die Prüfung vor dem Anlegen.",
    };
  }
```

- [ ] **Schritt 4: Bauen und prüfen**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Schritt 5: Sichtprüfung im laufenden Programm**

```bash
npm run dev
```

Einen freigegebenen Fall öffnen, `/cases/<id>/export?platform=europace` aufrufen. Erwartet ohne gesetzte Zugangsdaten: Karte sichtbar, Knopf **deaktiviert**, Hinweis auf den fehlenden API-Client. Genau das ist das gewünschte Verhalten — keine Attrappe, die Erfolg meldet.

- [ ] **Schritt 6: Committen**

```bash
git add src/components/case/europace-uebertragung.tsx "src/app/(app)/cases/[id]/export/page.tsx" src/lib/platforms/connectors.ts
git commit -m "feat(europace): Uebertragung im Einreichungsassistenten bedienbar machen"
```

---

### Task 11: Konfiguration und Produktspec nachziehen

**Files:**
- Modify: `.env.example` (die drei `EUROPACE_*`-Zeilen)
- Modify: `docs/PRODUCTSPEC.md` (Tabellenzeile „Plattform-Connectoren" ~Zeile 309, Abschnitt 14 ~Zeile 351)

**Interfaces:**
- Consumes: nichts
- Produces: nichts

- [ ] **Schritt 1: .env.example aktualisieren**

Ersetze die drei bisherigen Europace-Zeilen (`EUROPACE_BASE_URL`, `EUROPACE_CLIENT_ID`, `EUROPACE_CLIENT_SECRET`):

```bash
# Europace (API-Client per Mail an helpdesk@europace2.de beantragen; Client-ID
# und Secret stehen danach in der persoenlichen Linkliste in Europace).
# Benoetigte Scopes: baufinanzierung:vorgang:schreiben, baufinanzierung:vorgang:lesen,
# unterlagen:dokument:schreiben, unterlagen:unterlage:schreiben.
# baufinanzierung:echtgeschaeft erst fuer den Produktivbetrieb.
EUROPACE_CLIENT_ID=
EUROPACE_CLIENT_SECRET=
# TEST_MODUS (Vorgabe) oder ECHT_GESCHAEFT. Ohne diese Variable laeuft alles im Testmodus.
EUROPACE_DATENKONTEXT=TEST_MODUS
```

`EUROPACE_BASE_URL` entfällt: Die Hosts stehen fest im Client, damit niemand versehentlich gegen einen falschen Endpunkt sendet.

- [ ] **Schritt 2: Produktspec korrigieren**

In `docs/PRODUCTSPEC.md`, Abschnitt 14, den ersten Aufzählungspunkt ersetzen:

```markdown
- **Europace-API angebunden (Stand 09.08.2026):** Die Endpunkte sind öffentlich
  dokumentiert und als OpenAPI-Schema eingecheckt (`src/lib/platforms/europace/schema/`).
  Vorgang anlegen und Unterlagen übertragen sind umgesetzt; es fehlt allein der
  API-Client-Zugang. **FinLink** ist per Partner-API angebunden. Für **eHyp home**
  liegen die produktiven Endpunkte weiterhin nicht vor → Adapter/Stub mit
  ManualExport-Fallback, keine geratenen Endpunkte.
```

In der Tabelle in Abschnitt 13 die Zeile „Plattform-Connectoren" anpassen:

```markdown
| Plattform-Connectoren | Europace: Vorgang anlegen + Unterlagen (API). FinLink: Import. eHyp: Stub mit ManualExport-Fallback | eHyp-API, Rückkanal aus Europace |
```

- [ ] **Schritt 3: Gesamtprüfung**

```bash
npm run typecheck && npm run lint && npm test
```

Erwartet: alles grün.

- [ ] **Schritt 4: Committen**

```bash
git add .env.example docs/PRODUCTSPEC.md
git commit -m "docs(europace): Konfiguration dokumentieren und Produktspec nachziehen"
```

---

## Nach dem letzten Task: Scharfschalten

Diese Schritte gehen erst, wenn der API-Zugang vorliegt. Sie gehören nicht in die Umsetzung, sondern an den Tag danach.

1. Zugangsdaten setzen: `vercel env add EUROPACE_CLIENT_ID production` und dasselbe für `EUROPACE_CLIENT_SECRET`. `EUROPACE_DATENKONTEXT` zunächst auf `TEST_MODUS` lassen.
2. Einen echten Fall im Testmodus übertragen. Der Trockenlauf ist der erste Realkontakt — hier zeigen sich die fachlichen Regeln, die das Schema nicht ausdrückt. Gemeldete Felder ins Mapping einarbeiten, Tests ergänzen.
3. Den Endpunkt `moeglicheZuordnungen` der Unterlagen-API prüfen und die Antragsteller-Zuordnung (`assignmentId`) nachrüsten — siehe Hinweis in Task 9.
4. Erst wenn ein Testmodus-Vorgang sauber durchläuft und die Unterlagen ankommen: Scope `baufinanzierung:echtgeschaeft` freischalten lassen und `EUROPACE_DATENKONTEXT=ECHT_GESCHAEFT` setzen.
5. Von außen gegenprüfen, dass die Vorgangsnummer wirklich in der Datenbank steht und der Vorgang in Europace sichtbar ist — nicht auf die Erfolgsmeldung der Oberfläche verlassen.
