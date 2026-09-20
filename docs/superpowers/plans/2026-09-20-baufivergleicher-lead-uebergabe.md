# Lead-Übergabe baufivergleicher → BaufiDesk — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein abgesendeter Funnel auf baufivergleicher.de wird zu einem Fall in BaufiDesk, ohne dass BaufiDesk eine E-Mail verschickt.

**Architecture:** baufivergleicher stößt die Übergabe beim Absenden an, aber als Zeile in der vorhandenen Benachrichtigungs-Warteschlange (`lead_store.notifications`), nicht als nacktes `fetch`. Der dort bereits laufende 10-Minuten-Cron wiederholt fehlgeschlagene Übergaben. BaufiDesk nimmt sie über eine signierte Route entgegen und legt über den vorhandenen kanonischen Weg einen Fall an.

**Tech Stack:** Beide Next.js. BaufiDesk: Prisma/Postgres, vitest, zod v3. baufivergleicher: `postgres`-Treiber gegen eigenes Supabase-Projekt, `node --test`, zod v4.

**Spec:** `docs/superpowers/specs/2026-09-20-baufivergleicher-lead-uebergabe-design.md`

## Global Constraints

- Route: `POST https://baufidesk.de/api/leads/baufivergleicher`
- Kopfzeilen: `Authorization: Bearer <secret>`, `X-Signature: sha256=<hex>` (HMAC-SHA256 über den rohen Rumpf), `Content-Type: application/json`
- Variablen BaufiDesk: `BAUFIVERGLEICHER_INGEST_SECRET`, `BAUFIVERGLEICHER_ORGANIZATION_ID`
- Variablen baufivergleicher: `BAUFIDESK_INGEST_URL`, `BAUFIVERGLEICHER_INGEST_SECRET` (identischer Wert)
- Feld `art`: `"offer_review"` | `"comparison"`
- Jedes Rumpffeld ist gefüllt **oder** `null` — nie weggelassen.
- BaufiDesk verschickt auf diesem Weg **keine** E-Mail.
- Zwei Repos: `~/Coding/Unterlagenpilot` (BaufiDesk) und `~/Coding/baufivergleicher`. Jede Aufgabe nennt ihr Repo.

---

### Task 1: Fall trägt eine allgemeine externe Herkunft (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Modify: `prisma/schema.prisma` (enum `LeadSource`, model `Case`)
- Test: `tests/externe-herkunft.test.ts`

**Interfaces:**
- Produces: `Case.externeQuelle: String?`, `Case.externeId: String?`, `@@unique([organizationId, externeQuelle, externeId])`, `LeadSource.baufivergleicher`

- [ ] **Step 1: Schema ergänzen**

In `enum LeadSource` nach `webformular` einfügen:

```prisma
  baufivergleicher
```

In `model Case` neben `finlinkId`:

```prisma
  /// Herkunft aus einem Fremdsystem, allgemein statt je Anbieter ein Feld.
  /// finlinkId bleibt, solange FinLink laeuft – neue Quellen kommen hierher.
  externeQuelle         String?
  externeId             String?
```

In den Block der Indizes von `Case`:

```prisma
  @@unique([organizationId, externeQuelle, externeId])
```

- [ ] **Step 2: DDL gegen PROD, zuerst trocken**

```bash
cd ~/Coding/Unterlagenpilot
cat > /tmp/externe-herkunft.sql <<'SQL'
ALTER TABLE cases ADD COLUMN IF NOT EXISTS "externeQuelle" TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS "externeId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS cases_externe_herkunft_uq ON cases ("organizationId", "externeQuelle", "externeId");
SQL
scripts/supabase-sql.sh /tmp/externe-herkunft.sql --dry-run
```

Erwartet: 3 Anweisungen, keine zerrissen. **Achtung:** Der Zerleger schneidet auch an Semikolons in Kommentaren — deshalb stehen hier keine.

Postgres behandelt NULL in eindeutigen Indizes als verschieden; Fälle ohne externe Herkunft kollidieren also nicht.

- [ ] **Step 3: DDL anwenden und Prisma-Client erzeugen**

```bash
scripts/supabase-sql.sh /tmp/externe-herkunft.sql
npx prisma generate
```

- [ ] **Step 4: Test schreiben**

```ts
import { describe, expect, it } from "vitest";
import { LeadSource } from "@prisma/client";

describe("Externe Herkunft am Fall", () => {
  it("kennt baufivergleicher als Quelle", () => {
    expect(LeadSource.baufivergleicher).toBe("baufivergleicher");
  });
});
```

- [ ] **Step 5: Test laufen lassen**

Run: `npx vitest run tests/externe-herkunft.test.ts`
Erwartet: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma tests/externe-herkunft.test.ts
git commit -m "feat(leads): Fall traegt allgemeine externe Herkunft"
```

---

### Task 2: Vertrag als Typ und Prüfung (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Create: `src/lib/leads/baufivergleicher/vertrag.ts`
- Test: `tests/baufivergleicher-vertrag.test.ts`

**Interfaces:**
- Produces: `uebergabeSchema` (zod), `type Uebergabe = z.infer<typeof uebergabeSchema>`

- [ ] **Step 1: Test schreiben — vollständiger Rumpf wird angenommen, unvollständiger nicht**

```ts
import { describe, expect, it } from "vitest";
import { uebergabeSchema } from "@/lib/leads/baufivergleicher/vertrag";

const vollstaendig = {
  quelle: "baufivergleicher",
  externeId: "offer_11111111-1111-4111-8111-111111111111",
  art: "offer_review",
  eingegangenAm: "2026-09-20T14:03:11.000Z",
  kontakt: { vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567" },
  finanzierung: {
    finanzierungsart: "purchase",
    betragSpanne: "300k_500k",
    eigenkapitalSpanne: "50k_100k",
    angebotVorhanden: true,
    angebotZins: 3.79,
    angebotAnbieter: "sparkasse",
    plz: null,
    kaufpreis: null,
    eigenkapital: null,
    darlehenswunsch: null,
    haushaltsnetto: null,
  },
  einwilligung: { fassung: "angebot-2026-09-v2", erteiltAm: "2026-09-20T14:03:09.000Z", werbung: false },
  herkunft: {
    quelleText: "landingpage-ads",
    kampagne: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
};

describe("Vertrag der Lead-Uebergabe", () => {
  it("nimmt einen vollstaendigen Rumpf an", () => {
    expect(uebergabeSchema.safeParse(vollstaendig).success).toBe(true);
  });

  it("weist ein WEGGELASSENES Feld zurueck, auch wenn es leer sein duerfte", () => {
    const ohne = structuredClone(vollstaendig) as Record<string, unknown>;
    delete (ohne.finanzierung as Record<string, unknown>).kaufpreis;
    expect(uebergabeSchema.safeParse(ohne).success).toBe(false);
  });

  it("weist eine fremde Quelle zurueck", () => {
    expect(uebergabeSchema.safeParse({ ...vollstaendig, quelle: "woanders" }).success).toBe(false);
  });

  it("verlangt eine Kontaktmoeglichkeit", () => {
    const ohneMail = structuredClone(vollstaendig);
    ohneMail.kontakt.email = "";
    expect(uebergabeSchema.safeParse(ohneMail).success).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/baufivergleicher-vertrag.test.ts`
Erwartet: FAIL — Modul nicht gefunden

- [ ] **Step 3: Schema schreiben**

`z.null()` statt `.nullable().optional()` ist Absicht: Ein weggelassenes Feld soll auffallen, kein „nicht angegeben" vortäuschen.

```ts
import { z } from "zod";

/** Nullbares Feld, das TROTZDEM dastehen muss. */
const pflichtLeerbar = <T extends z.ZodTypeAny>(inner: T) => z.union([inner, z.null()]);

export const uebergabeSchema = z.object({
  quelle: z.literal("baufivergleicher"),
  externeId: z.string().min(1).max(64),
  art: z.enum(["offer_review", "comparison"]),
  eingegangenAm: z.string().datetime(),
  kontakt: z.object({
    vorname: z.string().min(1).max(120),
    nachname: z.string().min(1).max(120),
    email: z.string().email(),
    telefon: z.string().min(1).max(60),
  }),
  finanzierung: z.object({
    finanzierungsart: z.string().min(1).max(40),
    betragSpanne: pflichtLeerbar(z.string().max(40)),
    eigenkapitalSpanne: pflichtLeerbar(z.string().max(40)),
    angebotVorhanden: pflichtLeerbar(z.boolean()),
    angebotZins: pflichtLeerbar(z.number().min(0).max(30)),
    angebotAnbieter: pflichtLeerbar(z.string().max(40)),
    plz: pflichtLeerbar(z.string().max(10)),
    kaufpreis: pflichtLeerbar(z.number().min(0)),
    eigenkapital: pflichtLeerbar(z.number().min(0)),
    darlehenswunsch: pflichtLeerbar(z.number().min(0)),
    haushaltsnetto: pflichtLeerbar(z.number().min(0)),
  }),
  einwilligung: z.object({
    fassung: z.string().min(1).max(60),
    erteiltAm: z.string().datetime(),
    werbung: z.boolean(),
  }),
  herkunft: z.object({
    quelleText: pflichtLeerbar(z.string().max(80)),
    kampagne: pflichtLeerbar(z.string().max(120)),
    gclid: pflichtLeerbar(z.string().max(200)),
    gbraid: pflichtLeerbar(z.string().max(200)),
    wbraid: pflichtLeerbar(z.string().max(200)),
    einstiegspfad: pflichtLeerbar(z.string().max(200)),
  }),
});

export type Uebergabe = z.infer<typeof uebergabeSchema>;
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/baufivergleicher-vertrag.test.ts`
Erwartet: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/baufivergleicher/vertrag.ts tests/baufivergleicher-vertrag.test.ts
git commit -m "feat(leads): Vertrag der baufivergleicher-Uebergabe"
```

---

### Task 3: Signaturprüfung (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Create: `src/lib/security/uebergabe-signatur.ts`
- Test: `tests/uebergabe-signatur.test.ts`

**Interfaces:**
- Produces: `signiere(rumpf: string, geheimnis: string): string` (liefert `sha256=<hex>`), `signaturStimmt(rumpf: string, kopfzeile: string | null, geheimnis: string): boolean`

- [ ] **Step 1: Test schreiben**

```ts
import { describe, expect, it } from "vitest";
import { signiere, signaturStimmt } from "@/lib/security/uebergabe-signatur";

const GEHEIM = "test-geheimnis";

describe("Signatur der Lead-Uebergabe", () => {
  it("erkennt die eigene Signatur", () => {
    const rumpf = '{"a":1}';
    expect(signaturStimmt(rumpf, signiere(rumpf, GEHEIM), GEHEIM)).toBe(true);
  });

  it("faellt auf einen veraenderten Rumpf herein NICHT", () => {
    const sig = signiere('{"a":1}', GEHEIM);
    expect(signaturStimmt('{"a":2}', sig, GEHEIM)).toBe(false);
  });

  it("lehnt ein falsches Geheimnis ab", () => {
    const rumpf = '{"a":1}';
    expect(signaturStimmt(rumpf, signiere(rumpf, "anderes"), GEHEIM)).toBe(false);
  });

  it("lehnt fehlende oder formlose Kopfzeilen ab", () => {
    expect(signaturStimmt('{"a":1}', null, GEHEIM)).toBe(false);
    expect(signaturStimmt('{"a":1}', "deadbeef", GEHEIM)).toBe(false);
    expect(signaturStimmt('{"a":1}', "sha256=", GEHEIM)).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/uebergabe-signatur.test.ts`
Erwartet: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

```ts
import { createHmac } from "node:crypto";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";

/**
 * HMAC-SHA256 ueber den ROHEN Rumpf. Der Bearer allein wuerde nicht abdecken,
 * dass der Rumpf unterwegs veraendert wurde.
 */
export function signiere(rumpf: string, geheimnis: string): string {
  return `sha256=${createHmac("sha256", geheimnis).update(rumpf, "utf8").digest("hex")}`;
}

export function signaturStimmt(rumpf: string, kopfzeile: string | null, geheimnis: string): boolean {
  if (!kopfzeile || !kopfzeile.startsWith("sha256=") || kopfzeile.length <= "sha256=".length) return false;
  return timingSafeEqualStrings(kopfzeile, signiere(rumpf, geheimnis));
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/uebergabe-signatur.test.ts`
Erwartet: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/uebergabe-signatur.ts tests/uebergabe-signatur.test.ts
git commit -m "feat(sicherheit): HMAC-Signatur fuer die Lead-Uebergabe"
```

---

### Task 4: Aus der Übergabe wird ein kanonischer Fall (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Create: `src/lib/leads/baufivergleicher/mapping.ts`
- Test: `tests/baufivergleicher-mapping.test.ts`

**Interfaces:**
- Consumes: `Uebergabe` aus Task 2, `CanonicalCase` aus `@/lib/domain/canonical`
- Produces: `zuKanonisch(u: Uebergabe): CanonicalCase`, `spannenVermerk(u: Uebergabe): string | null`

- [ ] **Step 1: Test schreiben — der wichtigste Test ist der, der KEINE Zahl erfindet**

```ts
import { describe, expect, it } from "vitest";
import { zuKanonisch, spannenVermerk } from "@/lib/leads/baufivergleicher/mapping";
import type { Uebergabe } from "@/lib/leads/baufivergleicher/vertrag";

const ads: Uebergabe = {
  quelle: "baufivergleicher",
  externeId: "offer_1",
  art: "offer_review",
  eingegangenAm: "2026-09-20T14:03:11.000Z",
  kontakt: { vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567" },
  finanzierung: {
    finanzierungsart: "purchase",
    betragSpanne: "300k_500k",
    eigenkapitalSpanne: "50k_100k",
    angebotVorhanden: true,
    angebotZins: 3.79,
    angebotAnbieter: "sparkasse",
    plz: null,
    kaufpreis: null,
    eigenkapital: null,
    darlehenswunsch: null,
    haushaltsnetto: null,
  },
  einwilligung: { fassung: "angebot-2026-09-v2", erteiltAm: "2026-09-20T14:03:09.000Z", werbung: false },
  herkunft: {
    quelleText: "landingpage-ads",
    kampagne: null, gclid: "abc", gbraid: null, wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
};

describe("Uebergabe zu kanonischem Fall", () => {
  it("uebernimmt den Kontakt als ersten Antragsteller", () => {
    const k = zuKanonisch(ads);
    expect(k.applicants).toHaveLength(1);
    expect(k.applicants[0]).toMatchObject({
      position: 1, vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567",
    });
  });

  it("erfindet aus einer Spanne KEINEN Betrag", () => {
    const k = zuKanonisch(ads);
    expect(k.financing.kaufpreis).toBeUndefined();
    expect(k.financing.eigenkapital).toBeUndefined();
    expect(k.financing.darlehenswunsch).toBeUndefined();
  });

  it("haelt die Spanne als lesbaren Vermerk fest", () => {
    const text = spannenVermerk(ads);
    expect(text).toContain("300.000");
    expect(text).toContain("500.000");
    expect(text).toContain("50.000");
  });

  it("uebernimmt exakte Betraege des Vergleichsfunnels", () => {
    const k = zuKanonisch({
      ...ads,
      art: "comparison",
      finanzierung: {
        ...ads.finanzierung,
        betragSpanne: null, eigenkapitalSpanne: null,
        angebotVorhanden: null, angebotZins: null, angebotAnbieter: null,
        plz: "76744", kaufpreis: 420000, eigenkapital: 80000, darlehenswunsch: 340000, haushaltsnetto: 4200,
      },
    });
    expect(k.financing.kaufpreis).toBe(420000);
    expect(k.financing.eigenkapital).toBe(80000);
    expect(k.property.plz).toBe("76744");
  });

  it("gibt fuer den Vergleichsfunnel keinen Spannenvermerk aus", () => {
    expect(spannenVermerk({ ...ads, art: "comparison", finanzierung: { ...ads.finanzierung, betragSpanne: null, eigenkapitalSpanne: null } })).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/baufivergleicher-mapping.test.ts`
Erwartet: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

```ts
import type { CanonicalCase } from "@/lib/domain/canonical";
import type { FinancingType } from "@/lib/domain/enums";
import type { Uebergabe } from "./vertrag";

/** Funnel-Schluessel -> Finanzierungsart von BaufiDesk. */
const ART: Record<string, FinancingType> = {
  purchase: "kauf",
  construction: "neubau",
  refinancing: "anschlussfinanzierung",
  restructuring: "umschuldung",
  modernization: "modernisierung",
  investment: "kapitalanlage",
};

const BETRAG_TEXT: Record<string, string> = {
  lt_200k: "unter 200.000 €",
  "200k_300k": "200.000 – 300.000 €",
  "300k_500k": "300.000 – 500.000 €",
  "500k_750k": "500.000 – 750.000 €",
  gt_750k: "über 750.000 €",
};

const EK_TEXT: Record<string, string> = {
  none: "kein Eigenkapital",
  lt_50k: "unter 50.000 €",
  "50k_100k": "50.000 – 100.000 €",
  gt_100k: "über 100.000 €",
};

/**
 * Spannen werden NICHT in Zahlen verwandelt.
 *
 * Ein Mittelwert saehe aus wie eine Angabe des Interessenten, ist aber
 * geraten. Die Machbarkeits-Ampel ist gegen echte Leads kalibriert; sie
 * darf lieber grau bleiben ("keine Aussage") als gruen aus einer erfundenen
 * Zahl. Die Spanne steht stattdessen im Klartext im Fall.
 */
export function spannenVermerk(u: Uebergabe): string | null {
  const betrag = u.finanzierung.betragSpanne;
  const ek = u.finanzierung.eigenkapitalSpanne;
  if (!betrag && !ek) return null;
  const zeilen = ["Angaben aus dem Anzeigen-Funnel (Spannen, keine exakten Beträge):"];
  if (betrag) zeilen.push(`• Finanzierungsbedarf: ${BETRAG_TEXT[betrag] ?? betrag}`);
  if (ek) zeilen.push(`• Eigenkapital: ${EK_TEXT[ek] ?? ek}`);
  if (u.finanzierung.angebotVorhanden) {
    const zins = u.finanzierung.angebotZins;
    zeilen.push(`• Angebot liegt vor${zins != null ? `, Sollzins ${zins} %` : ""}`);
  }
  zeilen.push("Exakte Zahlen im Erstgespräch nachtragen – bis dahin rechnet die Ampel nicht.");
  return zeilen.join("\n");
}

const oderUndefined = <T>(w: T | null): T | undefined => (w == null ? undefined : w);

export function zuKanonisch(u: Uebergabe): CanonicalCase {
  return {
    applicants: [
      {
        position: 1,
        vorname: u.kontakt.vorname,
        nachname: u.kontakt.nachname,
        email: u.kontakt.email,
        telefon: u.kontakt.telefon,
      },
    ],
    employment: [],
    income: [],
    liabilities: [],
    assets: [],
    property: { plz: oderUndefined(u.finanzierung.plz) },
    financing: {
      finanzierungsart: ART[u.finanzierung.finanzierungsart],
      kaufpreis: oderUndefined(u.finanzierung.kaufpreis),
      eigenkapital: oderUndefined(u.finanzierung.eigenkapital),
      darlehenswunsch: oderUndefined(u.finanzierung.darlehenswunsch),
    },
    platformIds: {},
  };
}
```

**Hinweis für den Umsetzer:** `CanonicalCase` in `src/lib/domain/canonical.ts` lesen und die Feldnamen genau übernehmen; falls `platformIds` oder ein Abschnitt dort anders heißt oder Pflicht ist, dem echten Typ folgen statt diesem Auszug. Die Werte von `FinancingType` in `src/lib/domain/enums.ts` gegenprüfen und `ART` daran anpassen — die Tabelle oben ist die Absicht, nicht die Wahrheit.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/baufivergleicher-mapping.test.ts`
Erwartet: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/baufivergleicher/mapping.ts tests/baufivergleicher-mapping.test.ts
git commit -m "feat(leads): Uebergabe auf das kanonische Fallmodell abbilden"
```

---

### Task 5: Die Aufnahme-Route (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Create: `src/lib/leads/baufivergleicher/aufnahme.ts`
- Create: `src/app/api/leads/baufivergleicher/route.ts`
- Modify: `src/lib/security/public-paths.ts`
- Test: `tests/baufivergleicher-aufnahme.test.ts`, `tests/public-paths.test.ts`

**Interfaces:**
- Consumes: `uebergabeSchema`, `zuKanonisch`, `spannenVermerk`, `signaturStimmt`
- Produces: `nimmUebergabeAn(rohRumpf: string, kopfzeilen: { authorization: string | null; signatur: string | null }): Promise<{ status: number; body: object }>`

- [ ] **Step 1: Test schreiben — Wachdienst und Organisationsbindung**

Die Datenbankwege werden nicht mitgetestet; getestet wird der Wachdienst, weil er die Angriffsfläche ist.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const anlegen = vi.hoisted(() => vi.fn());
vi.mock("@/lib/leads/baufivergleicher/fallanlage", () => ({ legeFallAn: anlegen }));

import { nimmUebergabeAn } from "@/lib/leads/baufivergleicher/aufnahme";
import { signiere } from "@/lib/security/uebergabe-signatur";

const GEHEIM = "geheim-fuer-test";
const RUMPF = JSON.stringify({ quelle: "baufivergleicher" });

function kopf(rumpf = RUMPF, geheimnis = GEHEIM) {
  return { authorization: `Bearer ${GEHEIM}`, signatur: signiere(rumpf, geheimnis) };
}

describe("Aufnahme der Lead-Uebergabe – Wachdienst", () => {
  beforeEach(() => {
    anlegen.mockReset();
    process.env.BAUFIVERGLEICHER_INGEST_SECRET = GEHEIM;
    process.env.BAUFIVERGLEICHER_ORGANIZATION_ID = "org-1";
  });

  it("antwortet 503, wenn die Organisationsbindung FEHLT", async () => {
    delete process.env.BAUFIVERGLEICHER_ORGANIZATION_ID;
    const r = await nimmUebergabeAn(RUMPF, kopf());
    expect(r.status).toBe(503);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 503, wenn das Geheimnis nicht gesetzt ist", async () => {
    delete process.env.BAUFIVERGLEICHER_INGEST_SECRET;
    const r = await nimmUebergabeAn(RUMPF, kopf());
    expect(r.status).toBe(503);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 401 bei falschem Bearer", async () => {
    const r = await nimmUebergabeAn(RUMPF, { authorization: "Bearer falsch", signatur: signiere(RUMPF, GEHEIM) });
    expect(r.status).toBe(401);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 401 bei falscher Signatur", async () => {
    const r = await nimmUebergabeAn(RUMPF, { authorization: `Bearer ${GEHEIM}`, signatur: signiere("anderer rumpf", GEHEIM) });
    expect(r.status).toBe(401);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 422 bei unplausiblem Rumpf", async () => {
    const rumpf = JSON.stringify({ quelle: "baufivergleicher", art: "quatsch" });
    const r = await nimmUebergabeAn(rumpf, kopf(rumpf));
    expect(r.status).toBe(422);
    expect(anlegen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/baufivergleicher-aufnahme.test.ts`
Erwartet: FAIL — Module nicht gefunden

- [ ] **Step 3: `fallanlage.ts` schreiben (der Datenbankteil, getrennt gehalten)**

Getrennte Datei, damit der Wachdienst ohne Datenbank testbar bleibt.

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createCaseFromCanonical } from "@/lib/platforms/case-writer";
import { zuKanonisch, spannenVermerk } from "./mapping";
import type { Uebergabe } from "./vertrag";

export interface Anlageergebnis {
  caseId: string;
  caseNumber: string;
  dublette: boolean;
}

/**
 * Legt aus einer geprueften Uebergabe einen Fall an.
 *
 * Verschickt NICHTS. Der Erstkontakt entsteht wie ueberall als Entwurf und
 * wartet auf den Klick des Vermittlers.
 */
export async function legeFallAn(u: Uebergabe, organizationId: string): Promise<Anlageergebnis> {
  const vorhanden = await prisma.case.findFirst({
    where: { organizationId, externeQuelle: u.quelle, externeId: u.externeId },
    select: { id: true, caseNumber: true },
  });
  if (vorhanden) return { caseId: vorhanden.id, caseNumber: vorhanden.caseNumber, dublette: true };

  // Ohne Betreuer taucht der Fall in keiner persoenlichen Liste auf – wie im
  // FinLink-Lauf der erste aktive Nutzer der Organisation.
  const betreuer = await prisma.user.findFirst({
    where: { organizationId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const ergebnis = await createCaseFromCanonical(
    { organizationId, userId: betreuer?.id ?? "" },
    zuKanonisch(u)
  );

  const vermerk = spannenVermerk(u);
  await prisma.case.update({
    where: { id: ergebnis.caseId },
    data: {
      quelle: "baufivergleicher",
      quelleDetail: u.herkunft.quelleText ?? null,
      externeQuelle: u.quelle,
      externeId: u.externeId,
      ...(vermerk ? { notes: vermerk } : {}),
    },
  });

  await audit({
    organizationId,
    userId: null,
    action: "case.created",
    entityType: "case",
    entityId: ergebnis.caseId,
    metadata: { quelle: "baufivergleicher", art: u.art, externeId: u.externeId },
  });

  return { caseId: ergebnis.caseId, caseNumber: ergebnis.caseNumber, dublette: false };
}
```

**Hinweis für den Umsetzer:** `action: "case.created"` muss in `AUDIT_ACTIONS` (`src/lib/domain/enums.ts`) existieren. Wenn nicht, den dort vorhandenen Namen für „Fall angelegt" verwenden, **nicht** einen neuen erfinden. Ebenso prüfen, ob `Case.notes` das richtige Feld ist (Schreibblock) — Vermerke am Fall sind `CaseNote`; für einen maschinell erzeugten Hinweis ist `CaseNote` die sauberere Wahl, falls sie ohne Nutzer-ID angelegt werden kann.

- [ ] **Step 4: `aufnahme.ts` schreiben**

```ts
import { uebergabeSchema } from "./vertrag";
import { signaturStimmt } from "@/lib/security/uebergabe-signatur";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";
import { legeFallAn } from "./fallanlage";

/**
 * Wachdienst vor der Fallanlage.
 *
 * Die Organisationsbindung ist fail-closed: Ohne
 * BAUFIVERGLEICHER_ORGANIZATION_ID wird nichts angelegt. Ein globaler
 * Fremdzugang, der fuer JEDE Organisation gilt, war der Sicherheitsbefund
 * vom 08.09.2026 (FinLink) – der Fehler wird hier nicht wiederholt.
 */
export async function nimmUebergabeAn(
  rohRumpf: string,
  kopfzeilen: { authorization: string | null; signatur: string | null }
): Promise<{ status: number; body: object }> {
  const geheimnis = process.env.BAUFIVERGLEICHER_INGEST_SECRET;
  const organizationId = process.env.BAUFIVERGLEICHER_ORGANIZATION_ID;
  if (!geheimnis || !organizationId) {
    return { status: 503, body: { ok: false, grund: "nicht_konfiguriert" } };
  }

  if (!timingSafeEqualStrings(kopfzeilen.authorization ?? "", `Bearer ${geheimnis}`)) {
    return { status: 401, body: { ok: false } };
  }
  if (!signaturStimmt(rohRumpf, kopfzeilen.signatur, geheimnis)) {
    return { status: 401, body: { ok: false } };
  }

  let roh: unknown;
  try {
    roh = JSON.parse(rohRumpf);
  } catch {
    return { status: 422, body: { ok: false, grund: "kein_json" } };
  }

  const geprueft = uebergabeSchema.safeParse(roh);
  if (!geprueft.success) {
    return { status: 422, body: { ok: false, grund: "rumpf_unplausibel" } };
  }

  const ergebnis = await legeFallAn(geprueft.data, organizationId);
  return {
    status: 200,
    body: { ok: true, caseId: ergebnis.caseId, caseNumber: ergebnis.caseNumber, dublette: ergebnis.dublette },
  };
}
```

- [ ] **Step 5: Route schreiben**

```ts
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { nimmUebergabeAn } from "@/lib/leads/baufivergleicher/aufnahme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Leads aus baufivergleicher.de. Eigenes Geheimnis im Header, deshalb vor dem
 * Site-Gate – ein fremdes System hat kein Gate-Cookie (wie /api/eingang).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unbekannt";
  if (!(await checkRateLimit(`leads-uebergabe:${ip}`))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  // ROHER Rumpf: Die Signatur gilt fuer genau diese Bytes. Ein reserialisiertes
  // JSON.stringify(await req.json()) haette eine andere Signatur.
  const rohRumpf = await req.text();
  const ergebnis = await nimmUebergabeAn(rohRumpf, {
    authorization: req.headers.get("authorization"),
    signatur: req.headers.get("x-signature"),
  });
  return NextResponse.json(ergebnis.body, { status: ergebnis.status });
}
```

**Hinweis für den Umsetzer:** Signatur von `checkRateLimit` in `src/lib/auth/rate-limit.ts` nachsehen und den Aufruf daran anpassen (Argumente, Rückgabe, ob `await` nötig ist).

- [ ] **Step 6: Gate-Ausnahme ergänzen**

In `src/lib/security/public-paths.ts` in `PUBLIC_PREFIXES` nach `"/api/eingang"` einfügen:

```ts
  "/api/leads",
```

Und im Kommentarblock darüber, nach dem Absatz zu `/api/eingang`:

```
 *  - `/api/leads/*`    Lead-Uebergabe aus baufivergleicher.de. Traegt Bearer und
 *                      HMAC-Signatur im Header und ist fest an eine Organisation
 *                      gebunden. Ein fremder Server hat kein Gate-Cookie.
```

In `tests/public-paths.test.ts` den Geräte-Eingang-Test ergänzen:

```ts
  it("laesst die Lead-Uebergabe durch – sie traegt Bearer und Signatur im Header", () => {
    expect(isPublicPath("/api/leads/baufivergleicher")).toBe(true);
    expect(isPublicPath("/api/leadsx")).toBe(false);
  });
```

- [ ] **Step 7: Alle Tests laufen lassen**

Run: `npx vitest run tests/baufivergleicher-aufnahme.test.ts tests/public-paths.test.ts`
Erwartet: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/leads/baufivergleicher/ src/app/api/leads/ src/lib/security/public-paths.ts tests/
git commit -m "feat(leads): Aufnahme-Route fuer baufivergleicher-Uebergaben"
```

---

### Task 6: Der Test, der „keine Mail" festnagelt (BaufiDesk)

**Repo:** Unterlagenpilot

**Files:**
- Test: `tests/baufivergleicher-keine-mail.test.ts`

**Interfaces:**
- Consumes: `legeFallAn` aus Task 5

- [ ] **Step 1: Test schreiben**

Ein Kommentar verhindert nichts. Dieser Test schlägt fehl, sobald jemand in den Weg einen Versand einbaut.

```ts
import { describe, expect, it, vi } from "vitest";

const gesendet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/resend", () => ({
  sendEmail: gesendet,
  isEmailConfigured: () => true,
}));

describe("Lead-Uebergabe verschickt nichts", () => {
  it("der Aufnahmeweg importiert keinen Mailversand", async () => {
    const module = await import("@/lib/leads/baufivergleicher/fallanlage");
    expect(module).toBeDefined();
    expect(gesendet).not.toHaveBeenCalled();
  });

  it("weder fallanlage.ts noch aufnahme.ts nennen sendEmail im Quelltext", async () => {
    const { readFileSync } = await import("node:fs");
    for (const datei of [
      "src/lib/leads/baufivergleicher/fallanlage.ts",
      "src/lib/leads/baufivergleicher/aufnahme.ts",
    ]) {
      expect(readFileSync(datei, "utf8")).not.toContain("sendEmail");
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/baufivergleicher-keine-mail.test.ts`
Erwartet: PASS (2 Tests)

- [ ] **Step 3: Commit**

```bash
git add tests/baufivergleicher-keine-mail.test.ts
git commit -m "test(leads): die Uebergabe darf keine Mail ausloesen"
```

---

### Task 7: Neue Benachrichtigungsart `baufidesk` (baufivergleicher)

**Repo:** baufivergleicher

**Files:**
- Create: `supabase/migrations/20260920_0003_baufidesk_handover.sql`
- Modify: `lib/lead-store/core.ts` (Typ `NotificationKind`)
- Modify: `lib/lead-store/repository.ts` (neue Funktion `markDelivered`)

**Interfaces:**
- Produces: Enum-Wert `baufidesk`, `markDelivered(id: string): Promise<void>`

- [ ] **Step 1: Migration schreiben**

`ALTER TYPE … ADD VALUE` kann in älteren Postgres-Versionen nicht in einer Transaktion mit einer Nutzung desselben Werts stehen — deshalb allein in dieser Datei.

```sql
-- Uebergabe an BaufiDesk als eigene Benachrichtigungsart. Sie nutzt dieselbe
-- Warteschlange wie die Mails (Wiederholung, Backoff, Alarm), verschickt aber
-- keine Mail, sondern stellt einen signierten POST zu.
alter type lead_store.notification_kind add value if not exists 'baufidesk';
```

- [ ] **Step 2: Migration gegen TEST anwenden, dann gegen PROD**

```bash
cd ~/Coding/baufivergleicher
node scripts/lead-store-setup.mjs test
node scripts/lead-store-setup.mjs prod
```

**Hinweis für den Umsetzer:** Erst `node scripts/lead-store-setup.mjs --help` bzw. den Quelltext des Skripts lesen; wenn es keine einzelne Migration nachziehen kann, die eine Anweisung von Hand über denselben Verbindungsweg ausführen, den das Skript benutzt.

- [ ] **Step 3: Typ ergänzen**

In `lib/lead-store/core.ts`:

```ts
export type NotificationKind = "lead" | "confirmation" | "upload" | "alert" | "baufidesk";
```

- [ ] **Step 4: `markDelivered` ergänzen**

In `lib/lead-store/repository.ts` neben `markAccepted`:

```ts
/**
 * Endgueltig zugestellt – ohne Umweg ueber 'accepted'. Fuer Wege ohne
 * Zustellbericht (die BaufiDesk-Uebergabe: HTTP 2xx IST die Bestaetigung).
 * Bleibt damit aus acceptedForPolling heraus, das nur Zeilen mit
 * resend_email_id abfragt.
 */
export async function markDelivered(id: string): Promise<void> {
  await db()`
    update lead_store.notifications
       set status = 'delivered', delivered_at = now(), last_error = null,
           locked_until = null, updated_at = now()
     where id = ${id}`;
}
```

- [ ] **Step 5: Prüfen**

Run: `npm run check`
Erwartet: keine Fehler

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ lib/lead-store/core.ts lib/lead-store/repository.ts
git commit -m "feat(lead-store): Benachrichtigungsart baufidesk"
```

---

### Task 8: Rumpf bauen und signiert zustellen (baufivergleicher)

**Repo:** baufivergleicher

**Files:**
- Create: `lib/lead-store/baufidesk.ts`
- Test: `lib/lead-store/baufidesk.test.ts`

**Interfaces:**
- Consumes: `LeadRow` aus `./repository`, `joinLead` aus `./core`
- Produces: `baueUebergabe(row: LeadRow): Uebergabe`, `signiere(rumpf: string, geheimnis: string): string`, `stelleZu(row: LeadRow): Promise<{ ok: true } | { ok: false; retryable: boolean; code: string }>`

- [ ] **Step 1: Test schreiben**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { baueUebergabe, signiere } from "./baufidesk.ts";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  public_id: "offer_11111111-1111-4111-8111-111111111111",
  kind: "offer_review",
  created_at: "2026-09-20T14:03:11.000Z",
  first_name: "Anna",
  last_name: "Beispiel",
  email: "a@b.de",
  phone: "0170 1234567",
  details: {
    financingType: "purchase",
    amountRange: "300k_500k",
    equityRange: "50k_100k",
    hasOffer: true,
    offerRate: 3.79,
    offerProvider: "sparkasse",
  },
  attribution: { source: "landingpage-ads", gclid: "abc", entryPath: "/baufinanzierungsangebot-vergleichen" },
  consent_text_version: "angebot-2026-09-v2",
  consented_at: "2026-09-20T14:03:09.000Z",
  marketing_consent: false,
} as never;

describe("Uebergabe an BaufiDesk", () => {
  it("laesst kein Feld weg, auch kein leeres", () => {
    const u = baueUebergabe(row);
    for (const feld of ["plz", "kaufpreis", "eigenkapital", "darlehenswunsch", "haushaltsnetto"]) {
      assert.ok(feld in u.finanzierung, `${feld} fehlt`);
      assert.equal(u.finanzierung[feld as keyof typeof u.finanzierung], null);
    }
    for (const feld of ["kampagne", "gbraid", "wbraid"]) {
      assert.ok(feld in u.herkunft, `${feld} fehlt`);
    }
  });

  it("uebernimmt Kontakt, externe ID und Einwilligung", () => {
    const u = baueUebergabe(row);
    assert.equal(u.externeId, row.public_id);
    assert.equal(u.art, "offer_review");
    assert.equal(u.kontakt.vorname, "Anna");
    assert.equal(u.einwilligung.fassung, "angebot-2026-09-v2");
  });

  it("ist bei zweimaligem Bauen byte-gleich", () => {
    assert.equal(JSON.stringify(baueUebergabe(row)), JSON.stringify(baueUebergabe(row)));
  });

  it("signiert im vereinbarten Format", () => {
    const sig = signiere('{"a":1}', "geheim");
    assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- --test-name-pattern="Uebergabe an BaufiDesk"`
Erwartet: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

```ts
import "server-only";
import { createHmac } from "node:crypto";
import type { LeadRow } from "./repository";

const oderNull = <T>(w: T | undefined | null): T | null => (w == null ? null : w);

/**
 * Baut den Rumpf AUS DER GESPEICHERTEN ZEILE, nicht aus dem Request-Zustand.
 * Nur so ist jede Wiederholung byte-gleich.
 */
export function baueUebergabe(row: LeadRow) {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const a = (row.attribution ?? {}) as Record<string, unknown>;
  const zahl = (w: unknown) => (typeof w === "number" ? w : null);
  const text = (w: unknown) => (typeof w === "string" && w !== "" ? w : null);

  return {
    quelle: "baufivergleicher" as const,
    externeId: row.public_id,
    art: row.kind,
    eingegangenAm: new Date(row.created_at).toISOString(),
    kontakt: {
      vorname: row.first_name ?? "",
      nachname: row.last_name ?? "",
      email: row.email ?? "",
      telefon: row.phone ?? "",
    },
    finanzierung: {
      finanzierungsart: String(d.financingType ?? ""),
      betragSpanne: text(d.amountRange),
      eigenkapitalSpanne: text(d.equityRange),
      angebotVorhanden: typeof d.hasOffer === "boolean" ? d.hasOffer : null,
      angebotZins: zahl(d.offerRate),
      angebotAnbieter: text(d.offerProvider),
      plz: text(d.postalCode),
      kaufpreis: zahl(d.purchasePrice),
      eigenkapital: zahl(d.equity),
      darlehenswunsch: zahl(d.loanAmount),
      haushaltsnetto: zahl(d.householdIncome),
    },
    einwilligung: {
      fassung: row.consent_text_version,
      erteiltAm: new Date(row.consented_at).toISOString(),
      werbung: Boolean(row.marketing_consent),
    },
    herkunft: {
      quelleText: text(a.source),
      kampagne: text(a.campaign),
      gclid: text(a.gclid),
      gbraid: text(a.gbraid),
      wbraid: text(a.wbraid),
      einstiegspfad: text(a.entryPath),
    },
  };
}

export function signiere(rumpf: string, geheimnis: string): string {
  return `sha256=${createHmac("sha256", geheimnis).update(rumpf, "utf8").digest("hex")}`;
}

export type Zustellergebnis = { ok: true } | { ok: false; retryable: boolean; code: string };

export async function stelleZu(row: LeadRow): Promise<Zustellergebnis> {
  const url = process.env.BAUFIDESK_INGEST_URL;
  const geheimnis = process.env.BAUFIVERGLEICHER_INGEST_SECRET;
  if (!url || !geheimnis) return { ok: false, retryable: true, code: "config_missing_baufidesk" };

  const rumpf = JSON.stringify(baueUebergabe(row));
  const steuer = AbortSignal.timeout(10_000);
  try {
    const antwort = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${geheimnis}`,
        "x-signature": signiere(rumpf, geheimnis),
      },
      body: rumpf,
      signal: steuer,
    });
    if (antwort.ok) return { ok: true };
    // 401/403/422 sind durch Wiederholen nicht zu heilen – sofort eskalieren.
    const heilbar = antwort.status >= 500 || antwort.status === 429;
    return { ok: false, retryable: heilbar, code: `http_${antwort.status}` };
  } catch (err) {
    const code = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network";
    return { ok: false, retryable: true, code };
  }
}
```

**Hinweis für den Umsetzer:** `LeadRow` in `lib/lead-store/repository.ts` lesen; die Spaltennamen oben (`details`, `attribution`, `public_id` …) gegen den echten Typ prüfen. Prüfen, ob `details` bereits geparstes JSON ist oder ein String — der `postgres`-Treiber liefert `jsonb` in der Regel als Objekt.

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- --test-name-pattern="Uebergabe an BaufiDesk"`
Erwartet: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lead-store/baufidesk.ts lib/lead-store/baufidesk.test.ts
git commit -m "feat(lead-store): Rumpf und signierte Zustellung an BaufiDesk"
```

---

### Task 9: Übergabe in die Warteschlange einhängen (baufivergleicher)

**Repo:** baufivergleicher

**Files:**
- Modify: `lib/lead-store/notifications.ts` (`processOne`)
- Modify: `app/(ads)/baufinanzierungsangebot-vergleichen/actions.ts:69`
- Modify: `app/vergleich/actions.ts` (gleiche Stelle)

**Interfaces:**
- Consumes: `stelleZu` aus Task 8, `markDelivered` aus Task 7

- [ ] **Step 1: Verzweigung in `processOne`**

Ganz oben in `processOne`, direkt nach `if (!row) return markCancelled(n.id, "lead_missing");`:

```ts
  // Die Uebergabe an BaufiDesk ist keine Mail. Sie nutzt nur dieselbe
  // Warteschlange: Wiederholung, Backoff und Alarm sind identisch.
  if (n.kind === "baufidesk") {
    const ergebnis = await stelleZu(row);
    if (ergebnis.ok) {
      await markDelivered(n.id);
      await addEvent(n.lead_id, "baufidesk_uebergeben", { notification: n.id, attempt: n.attempts });
      return;
    }
    const status = statusAfterSendError(n.attempts, ergebnis.retryable);
    await markSendError(n.id, status, ergebnis.code, backoffMs(n.attempts));
    await addEvent(n.lead_id, "baufidesk_fehlgeschlagen", { notification: n.id, code: ergebnis.code });
    if (status === "retry_required") await escalate(n);
    return;
  }
```

Importe oben in der Datei ergänzen: `stelleZu` aus `./baufidesk`, `markDelivered` aus `./repository`.

- [ ] **Step 2: Übergabe bei jedem neuen Lead anlegen**

In `app/(ads)/baufinanzierungsangebot-vergleichen/actions.ts` Zeile 69 und an der entsprechenden Stelle in `app/vergleich/actions.ts`:

```ts
      notifications: ["lead", "confirmation", "baufidesk"],
```

- [ ] **Step 3: Prüfen**

Run: `npm run check && npm test`
Erwartet: keine Fehler, alle Tests grün

- [ ] **Step 4: Commit**

```bash
git add lib/lead-store/notifications.ts "app/(ads)/baufinanzierungsangebot-vergleichen/actions.ts" app/vergleich/actions.ts
git commit -m "feat(lead-store): jeder Lead wird an BaufiDesk uebergeben"
```

---

### Task 10: Geheimnis erzeugen, Variablen setzen, beide Seiten deployen

**Repo:** beide

- [ ] **Step 1: Geheimnis einmal erzeugen**

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))' > /tmp/ingest-secret.txt
wc -c /tmp/ingest-secret.txt
```

Der Wert wird **nicht** in den Chat ausgegeben.

- [ ] **Step 2: Organisations-ID von BaufiDesk ermitteln**

```bash
cd ~/Coding/Unterlagenpilot
echo "SELECT id, name FROM organizations ORDER BY \"createdAt\" LIMIT 5;" > /tmp/orgs.sql
scripts/supabase-sql.sh /tmp/orgs.sql
```

Die Organisation von Jürgen (`juergen.ertel@gmx.de`) wählen.

- [ ] **Step 3: Variablen in BaufiDesk setzen**

```bash
cd ~/Coding/Unterlagenpilot
cat /tmp/ingest-secret.txt | tr -d '\n' | vercel env add BAUFIVERGLEICHER_INGEST_SECRET production
echo "<org-id>" | vercel env add BAUFIVERGLEICHER_ORGANIZATION_ID production
```

Beide zusätzlich in `src/lib/env.ts` als optionale Felder ergänzen, falls dort alle Variablen geführt werden.

- [ ] **Step 4: Variablen in baufivergleicher setzen**

```bash
cd ~/Coding/baufivergleicher
cat /tmp/ingest-secret.txt | tr -d '\n' | vercel env add BAUFIVERGLEICHER_INGEST_SECRET production
echo "https://baufidesk.de/api/leads/baufivergleicher" | vercel env add BAUFIDESK_INGEST_URL production
echo "true" | vercel env add LEAD_STORE_ENABLED production
```

- [ ] **Step 5: Beide Seiten deployen — BaufiDesk zuerst**

Die Reihenfolge ist nicht beliebig: Steht die Route noch nicht, laufen die ersten Übergaben in die Wiederholung.

```bash
cd ~/Coding/Unterlagenpilot && git push origin main
cd ~/Coding/baufivergleicher && git push origin main
```

Beide Deployments abwarten, bis `vercel ls --prod` `Ready` zeigt.

- [ ] **Step 6: Geheimnis vom Laufwerk löschen**

```bash
rm -f /tmp/ingest-secret.txt /tmp/orgs.sql
```

---

### Task 11: Nachweis am echten Weg

**Repo:** beide

- [ ] **Step 1: Wachdienst von außen prüfen (ohne gültiges Geheimnis)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://baufidesk.de/api/leads/baufivergleicher \
  -H 'content-type: application/json' -H 'authorization: Bearer falsch' -d '{}'
```

Erwartet: `401`. Ein `200` oder eine Gate-Umleitung ist ein Abbruchgrund.

- [ ] **Step 2: Testlead über das echte Formular absenden**

`https://baufivergleicher.de/baufinanzierungsangebot-vergleichen` im Browser ausfüllen, mit einem erkennbaren Namen (z. B. „Testlauf Übergabe") und einer erreichbaren Adresse.

- [ ] **Step 3: Zustellung in baufivergleicher prüfen**

Über `/intern` die Anfrage öffnen: Die Benachrichtigung `baufidesk` muss auf `delivered` stehen.

- [ ] **Step 4: Fall in BaufiDesk per SQL nachweisen**

```bash
cd ~/Coding/Unterlagenpilot
cat > /tmp/nachweis.sql <<'SQL'
SELECT c."caseNumber", c.quelle, c."externeId", a.vorname, a.nachname, a.telefon
  FROM cases c JOIN applicants a ON a."caseId" = c.id
 WHERE c.quelle = 'baufivergleicher' ORDER BY c."createdAt" DESC LIMIT 5;
SQL
scripts/supabase-sql.sh /tmp/nachweis.sql
```

Erwartet: eine Zeile mit dem Testnamen und der Telefonnummer.

- [ ] **Step 5: Beweisen, dass KEINE Mail hinausging**

```bash
cat > /tmp/keine-mail.sql <<'SQL'
SELECT action, "entityType", "createdAt" FROM audit_logs
 WHERE "createdAt" > now() - interval '30 minutes' ORDER BY "createdAt" DESC LIMIT 20;
SQL
scripts/supabase-sql.sh /tmp/keine-mail.sql
```

Erwartet: kein `message.sent` zu diesem Fall.

- [ ] **Step 6: Dublettenschutz prüfen**

In `/intern` bei der Übergabe „Erneut senden" auslösen. Danach Step 4 wiederholen: Es darf **kein** zweiter Fall entstanden sein.

- [ ] **Step 7: Testdaten wieder entfernen**

In `/intern` von baufivergleicher „Endgültig löschen" für den Testlead, und den Fall in BaufiDesk löschen. Danach Step 4 wiederholen: keine Zeile mehr.

```bash
rm -f /tmp/nachweis.sql /tmp/keine-mail.sql
```

- [ ] **Step 8: Abschlussbericht an Jürgen**

Was live ist, was nachgewiesen wurde (mit den Zahlen aus den Abfragen), und was bewusst offen blieb (Angebots-Upload).
