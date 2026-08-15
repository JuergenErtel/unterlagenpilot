# Öffentliches Anfrageformular – Umsetzungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Ein Dauerlink je Organisation (`baufidesk.de/anfrage/<slug>`), den Interessenten selbst ausfüllen. Der Fall entsteht erst beim Absenden — gefüllt mit allem, was der Kunde beantwortet hat. Dazu ein Knopf, der diesen Link schnell an eine E-Mail-Adresse verschickt.

**Architektur:** Der Dauerlink ist ein Bogen-Automat, kein Bogen: Beim Absenden des ersten Schritts entsteht die persönliche `SelfDisclosureLink`-Zeile mit eigenem Token, danach läuft alles auf der bestehenden Kundenstrecke `/selbstauskunft/<token>/…`. Dadurch bleibt `SelfDisclosure.linkId` eindeutig, es braucht keine Sitzungsverwaltung, und ein bloßer Seitenaufruf hinterlässt nichts. `caseId` wird an Link und Bogen nullbar; beim Absenden wird der Fall in einer Transaktion geboren und mit `planUebernahme` gefüllt.

**Tech-Stack:** Next.js 15 App Router, Prisma/PostgreSQL (Supabase), Vitest, Server Actions, Resend.

**Spec:** `docs/superpowers/specs/2026-08-15-anfrageformular-design.md`

## Globale Vorgaben

- **Nichts verschickt automatisch.** Jede Mail verlässt das Haus nur auf Klick. Gilt ausnahmslos für jede Aufgabe.
- **Der Fall entsteht erst beim Absenden.** Weder das Erzeugen des Links noch der Mailversand noch das Ausfüllen einzelner Schritte legt einen Fall an. Wer das ändert, hebt den Zweck dieses Plans auf.
- **Der Katalog bekommt keine Pflichtfelder.** `src/lib/self-disclosure/types.ts` trägt den Grundsatz „Es gibt KEINE Pflichtfelder"; er bleibt gültig. Die Pflicht sitzt ausschließlich in der Prüfung beim Absenden des Formular-Wegs.
- **Deutsch** in Bezeichnern, Kommentaren und Oberflächentexten, wie im ganzen Projekt.
- **Neue Enum-Werte** müssen in `prisma/schema.prisma` **und** `src/lib/domain/enums.ts` stehen; beide werden von Hand synchron gehalten.
- **Zeit wird übergeben, nicht gemessen**, wo eine Funktion prüfbar sein soll.
- Tests laufen mit `npx vitest run <datei>`, Typprüfung mit `npx tsc --noEmit`.
- Datenbanktests (`*-db.test.ts`) laufen nur mit `RUN_DB_IT=1` gegen die lokale PGlite-Datenbank (siehe Notiz `lokale-db-ohne-docker`); vorher `npx prisma db push` gegen die lokale Datenbank, nie gegen PROD.

---

### Task 1: Schema, Enum-Werte und Produktivdatenbank

**Dateien:**
- Ändern: `prisma/schema.prisma` (neues Modell `Leadformular`, `SelfDisclosureLink`, `SelfDisclosure`, Enums `LeadSource` und `MessageTemplateType`, Rückbeziehung in `Organization`)
- Ändern: `src/lib/domain/enums.ts` (`LEAD_SOURCES`, `MESSAGE_TEMPLATE_TYPES`, `MESSAGE_TEMPLATE_TYPE_LABELS`, `AUDIT_ACTIONS`)
- Erstellen: `sql/2026-08-15-anfrageformular.sql`

**Schnittstellen:**
- Liefert: Modell `Leadformular` (Felder `id`, `organizationId`, `brokerId`, `slug`, `aktiv`, `createdAt`); `SelfDisclosureLink.caseId: String?` + `formularId: String?`; `SelfDisclosure.caseId: String?` + `einwilligungAm: DateTime?` + `einwilligungFassung: String?`; Enum-Wert `LeadSource.webformular`; Enum-Wert `MessageTemplateType.selbstauskunft_einladung`; Audit-Aktion `"anfrage.eingeladen"`.

- [ ] **Schritt 1: Modell und Änderungen ins Prisma-Schema schreiben**

In `prisma/schema.prisma` neben den anderen Selbstauskunfts-Modellen (ab Zeile 1324) ergänzen:

```prisma
/// Öffentliches Anfrageformular einer Organisation: ein Dauerlink, der Bögen
/// ERZEUGT statt selbst einer zu sein. Nur so kann ein Link von mehreren
/// benutzt werden, ohne dass der zweite Interessent die Antworten des ersten
/// sieht – jeder bekommt beim ersten abgesendeten Schritt sein eigenes Token.
model Leadformular {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /// Wem die Fälle aus diesem Formular gehören.
  brokerId       String
  /// Teil der öffentlichen URL: /anfrage/<slug>
  slug           String       @unique
  aktiv          Boolean      @default(true)
  createdAt      DateTime     @default(now())

  links SelfDisclosureLink[]

  @@index([organizationId])
  @@map("leadformulare")
}
```

`SelfDisclosureLink` wird zu:

```prisma
model SelfDisclosureLink {
  id         String        @id @default(cuid())
  /// Gesetzt beim persönlichen Link aus einer Fallakte. Null beim
  /// Formular-Link: dort entsteht der Fall erst beim Absenden.
  caseId     String?
  case       Case?         @relation(fields: [caseId], references: [id], onDelete: Cascade)
  /// Gesetzt beim Formular-Link. Genau eines von caseId/formularId ist gesetzt.
  formularId String?
  formular   Leadformular? @relation(fields: [formularId], references: [id], onDelete: Cascade)
  tokenHash  String        @unique
  expiresAt  DateTime
  active     Boolean       @default(true)
  createdAt  DateTime      @default(now())

  disclosure SelfDisclosure?

  @@index([caseId])
  @@index([formularId])
  @@map("self_disclosure_links")
}
```

In `SelfDisclosure` die drei Zeilen ändern bzw. ergänzen:

```prisma
  /// Null, solange der Bogen aus einem Anfrageformular stammt und noch
  /// niemand abgesendet hat. Beim Absenden entsteht der Fall und wird
  /// nachgetragen.
  caseId              String?
  case                Case?              @relation(fields: [caseId], references: [id], onDelete: Cascade)
  /// Datenschutz-Einwilligung des Formular-Wegs. Ohne Zeitpunkt und Fassung
  /// ist eine Einwilligung nicht nachweisbar.
  einwilligungAm      DateTime?
  einwilligungFassung String?
```

In `enum LeadSource` den Wert `webformular` ergänzen, in `enum MessageTemplateType` den Wert `selbstauskunft_einladung`. In `model Organization` die Rückbeziehung `leadformulare Leadformular[]` ergänzen.

- [ ] **Schritt 2: enums.ts nachziehen**

In `src/lib/domain/enums.ts`:

- `LEAD_SOURCES` um `"webformular"` erweitern und im zugehörigen Label-Objekt ergänzen: `webformular: "Anfrageformular"`. (Die genauen Namen der Konstanten stehen dort; die Reihenfolge muss der des Schemas entsprechen.)
- `MESSAGE_TEMPLATE_TYPES` um `"selbstauskunft_einladung"` erweitern und in `MESSAGE_TEMPLATE_TYPE_LABELS` ergänzen: `selbstauskunft_einladung: "Einladung zum Anfrageformular"`.
- `AUDIT_ACTIONS` um `"anfrage.eingeladen"` erweitern. **Kein Schemaeingriff nötig:** `AuditLog.action` ist in der Datenbank eine Textspalte, kein Enum.

- [ ] **Schritt 3: Prisma-Client erzeugen und Typprüfung**

```bash
npx prisma generate
npx tsc --noEmit
```

Erwartet: `prisma generate` fehlerfrei. `tsc` meldet jetzt Fehler an den Stellen, die `caseId` als gesetzt annehmen (`self-disclosure-link.ts`, `actions/self-disclosure.ts`, die Kundenseiten). Das ist richtig so — sie werden in Aufgabe 2 und 6 behoben. Die Fehlerliste zur Kontrolle notieren.

- [ ] **Schritt 4: SQL für die Produktivdatenbank schreiben**

Erstelle `sql/2026-08-15-anfrageformular.sql`:

```sql
-- Anfrageformular: Dauerlink je Organisation, Fall entsteht erst beim Absenden.
-- Alles additiv: Bestandslinks und -boegen behalten ihren caseId.

CREATE TABLE IF NOT EXISTS "leadformulare" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brokerId"       TEXT NOT NULL,
  "slug"           TEXT NOT NULL UNIQUE,
  "aktiv"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "leadformulare_organizationId_idx" ON "leadformulare"("organizationId");

ALTER TABLE "self_disclosure_links" ALTER COLUMN "caseId" DROP NOT NULL;
ALTER TABLE "self_disclosure_links" ADD COLUMN IF NOT EXISTS "formularId" TEXT;
CREATE INDEX IF NOT EXISTS "self_disclosure_links_formularId_idx" ON "self_disclosure_links"("formularId");

DO $$ BEGIN
  ALTER TABLE "self_disclosure_links"
    ADD CONSTRAINT "self_disclosure_links_formularId_fkey"
    FOREIGN KEY ("formularId") REFERENCES "leadformulare"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "self_disclosures" ALTER COLUMN "caseId" DROP NOT NULL;
ALTER TABLE "self_disclosures" ADD COLUMN IF NOT EXISTS "einwilligungAm" TIMESTAMP(3);
ALTER TABLE "self_disclosures" ADD COLUMN IF NOT EXISTS "einwilligungFassung" TEXT;

ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'webformular';
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'selbstauskunft_einladung';
```

**Achtung:** Die Tabellennamen sind die `@@map`-Namen, nicht die Modellnamen. Vor dem Ausführen mit `grep -n "@@map" prisma/schema.prisma` prüfen, dass `organizations` und `self_disclosures` genau so heißen.

**Achtung:** `ALTER TYPE … ADD VALUE` und die Verwendung des neuen Werts dürfen nicht in derselben Transaktion stehen. Dieses Skript verwendet die Werte nicht. Schlägt es dennoch mit „unsafe use of new value" fehl, die beiden `ALTER TYPE`-Zeilen einzeln nachfahren.

- [ ] **Schritt 5: Gegen die Produktivdatenbank fahren**

```bash
scripts/supabase-sql.sh sql/2026-08-15-anfrageformular.sql --dry-run
scripts/supabase-sql.sh sql/2026-08-15-anfrageformular.sql
```

Erwartet: „Erfolgreich." Niemals `prisma migrate diff` in voller Breite anwenden — das Schema der Produktion trägt Abweichungen.

- [ ] **Schritt 6: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/enums.ts sql/2026-08-15-anfrageformular.sql
git commit -m "feat(anfrage): Schema fuer das oeffentliche Anfrageformular

Leadformular als Traeger des Dauerlinks; caseId an Link und Bogen wird
nullbar, weil der Fall erst beim Absenden entsteht. Dazu die Einwilligung
am Bogen: ohne Zeitpunkt und Fassung ist sie nicht nachweisbar.

Alles additiv – jeder bestehende Link und Bogen behaelt seinen caseId."
```

---

### Task 2: Token und Auflösung ohne Fall

**Dateien:**
- Ändern: `src/lib/security/upload-token.ts:9-13` (`UploadTokenPayload.caseId` optional)
- Ändern: `src/lib/security/self-disclosure-link.ts` (Anlegen, Auflösen, Widerrufen)
- Ändern: `tests/selbstauskunft-link.test.ts`

**Schnittstellen:**
- Liefert:
  - `interface SelfDisclosureAccess { linkId: string; caseId: string | null; organizationId: string }`
  - `createSelfDisclosureLink(caseId: string, expiresAt: Date, options: { organizationId: string; actorUserId?: string | null }): Promise<CreatedSelfDisclosureLink>` — unverändert in der Signatur.
  - `createAnfrageLink(formularId: string, expiresAt: Date, options: { organizationId: string }): Promise<CreatedSelfDisclosureLink>` — neu.
- Nutzt: `Leadformular` aus Aufgabe 1.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `tests/selbstauskunft-link.test.ts` den Prisma-Mock um `leadformular` erweitern und am Ende ergänzen. Der Mock-Block oben wird zu:

```ts
const linkCreate = vi.fn();
const linkUpdate = vi.fn();
const linkFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosureLink: {
      create: (...a: unknown[]) => linkCreate(...a),
      update: (...a: unknown[]) => linkUpdate(...a),
      findUnique: (...a: unknown[]) => linkFindUnique(...a),
    },
  },
}));
```

Neue Fälle am Dateiende:

```ts
import { createAnfrageLink } from "@/lib/security/self-disclosure-link";

describe("Formular-Link ohne Fall", () => {
  beforeEach(() => {
    [linkCreate, linkUpdate, linkFindUnique].forEach((m) => m.mockReset());
  });

  it("legt einen Link ohne caseId, aber mit formularId an", async () => {
    linkCreate.mockResolvedValue({ id: "link-1" });
    linkUpdate.mockResolvedValue({});
    const erstellt = await createAnfrageLink("form-1", new Date(Date.now() + 86_400_000), {
      organizationId: "org-A",
    });
    expect(linkCreate.mock.calls[0][0].data.formularId).toBe("form-1");
    expect(linkCreate.mock.calls[0][0].data.caseId).toBeUndefined();
    expect(erstellt.url).toContain("/selbstauskunft/");
  });

  it("loest das Token auf und liefert caseId null", async () => {
    linkCreate.mockResolvedValue({ id: "link-1" });
    linkUpdate.mockResolvedValue({});
    const erstellt = await createAnfrageLink("form-1", new Date(Date.now() + 86_400_000), {
      organizationId: "org-A",
    });

    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(erstellt.token),
      active: true,
      expiresAt: new Date(Date.now() + 86_400_000),
      caseId: null,
      case: null,
      formularId: "form-1",
      formular: { organizationId: "org-A" },
    });

    const access = await resolveSelfDisclosureToken(erstellt.token);
    // Der wunde Punkt: Ein Link OHNE Fall traegt im Token kein caseId. Ein
    // naiver Vergleich (null !== undefined) wuerde jeden Formular-Bogen
    // aussperren – und zwar erst in der Produktion, weil im Test frueher
    // immer ein caseId dabei war.
    expect(access).toEqual({ linkId: "link-1", caseId: null, organizationId: "org-A" });
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-link.test.ts`
Erwartet: FEHLSCHLAG, `createAnfrageLink` ist kein Export.

- [ ] **Schritt 3: Token-Nutzlast öffnen**

In `src/lib/security/upload-token.ts`:

```ts
export interface UploadTokenPayload {
  /**
   * Fehlt beim Anfrageformular: Dort gibt es beim Erzeugen des Links noch
   * keinen Fall. Der Upload-Link verlangt ihn weiterhin – sein Auflöser
   * vergleicht gegen `link.caseId` und weist ein Token ohne Fall damit ab.
   */
  caseId?: string;
  linkId: string;
  exp: number; // Unix-Sekunden
}
```

- [ ] **Schritt 4: Anlegen und Auflösen umbauen**

In `src/lib/security/self-disclosure-link.ts` das Anlegen auf einen gemeinsamen Kern ziehen und zwei Eingänge anbieten:

```ts
async function linkAnlegen(
  ziel: { caseId: string } | { formularId: string },
  expiresAt: Date
): Promise<{ linkId: string; token: string }> {
  // Zeile zuerst anlegen, damit die linkId ins signierte Token wandern kann.
  const link = await prisma.selfDisclosureLink.create({
    data: { ...ziel, tokenHash: `pending-${crypto.randomUUID()}`, expiresAt, active: true },
  });
  const token = createUploadToken({
    ...("caseId" in ziel ? { caseId: ziel.caseId } : {}),
    linkId: link.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  await prisma.selfDisclosureLink.update({
    where: { id: link.id },
    data: { tokenHash: hashToken(token) },
  });
  return { linkId: link.id, token };
}

export async function createSelfDisclosureLink(
  caseId: string,
  expiresAt: Date,
  options: { organizationId: string; actorUserId?: string | null }
): Promise<CreatedSelfDisclosureLink> {
  const { linkId, token } = await linkAnlegen({ caseId }, expiresAt);
  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId, zweck: "selbstauskunft", expiresAt: expiresAt.toISOString() },
  });
  return { linkId, token, url: buildSelfDisclosureUrl(token), expiresAt };
}

/**
 * Link eines Anfrageformulars – ohne Fall. Er entsteht in dem Moment, in dem
 * ein Besucher den ersten Schritt absendet, und gehoert damit genau ihm.
 */
export async function createAnfrageLink(
  formularId: string,
  expiresAt: Date,
  options: { organizationId: string }
): Promise<CreatedSelfDisclosureLink> {
  const { linkId, token } = await linkAnlegen({ formularId }, expiresAt);
  await audit({
    organizationId: options.organizationId,
    userId: null,
    action: "upload_link.created",
    entityType: "leadformular",
    entityId: formularId,
    metadata: { linkId, zweck: "anfrage", expiresAt: expiresAt.toISOString() },
  });
  return { linkId, token, url: buildSelfDisclosureUrl(token), expiresAt };
}
```

Die Auflösung:

```ts
export interface SelfDisclosureAccess {
  linkId: string;
  /** null, solange der Bogen aus einem Anfrageformular stammt. */
  caseId: string | null;
  organizationId: string;
}

export async function resolveSelfDisclosureToken(
  token: string
): Promise<SelfDisclosureAccess | null> {
  const payload = verifyUploadToken(token);
  if (!payload) return null;
  const link = await prisma.selfDisclosureLink.findUnique({
    where: { id: payload.linkId },
    select: {
      id: true,
      tokenHash: true,
      active: true,
      expiresAt: true,
      caseId: true,
      case: { select: { organizationId: true } },
      formularId: true,
      formular: { select: { organizationId: true } },
    },
  });
  if (!link || !link.active) return null;
  if (link.expiresAt < new Date()) return null;
  // Beide Seiten auf null normalisieren: Beim Formular-Link ist link.caseId
  // null und payload.caseId undefined – ein roher !==-Vergleich wuerde jeden
  // Formular-Bogen aussperren.
  if ((link.caseId ?? null) !== (payload.caseId ?? null)) return null;
  if (link.tokenHash !== hashToken(token)) return null;

  const organizationId = link.case?.organizationId ?? link.formular?.organizationId ?? null;
  // Weder Fall noch Formular: verwaister Link, kein Zugang.
  if (!organizationId) return null;

  return { linkId: link.id, caseId: link.caseId, organizationId };
}
```

`deactivateSelfDisclosureLink` liest heute `link.case.organizationId` und schreibt `entityId: link.caseId`. Beide Stellen auf den optionalen Fall umstellen: Formular-Links werden über diesen Weg nicht widerrufen, ein `if (!link?.caseId || link.case?.organizationId !== ctx.organizationId) return;` genügt.

- [ ] **Schritt 5: Tests laufen lassen**

```bash
npx vitest run tests/selbstauskunft-link.test.ts
npx tsc --noEmit
```

Erwartet: alle Fälle grün. `tsc` meldet weiterhin Fehler in den Kundenseiten und Aktionen (Aufgabe 6) — dort noch nichts anfassen.

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/security/upload-token.ts src/lib/security/self-disclosure-link.ts tests/selbstauskunft-link.test.ts
git commit -m "feat(anfrage): Selbstauskunfts-Links auch ohne Fall

Ein Formular-Link traegt kein caseId – weder in der Zeile noch im Token. Die
Aufloesung normalisiert deshalb beide Seiten auf null, sonst sperrte der
Vergleich (null !== undefined) jeden Formular-Bogen aus.

Die Organisation kommt jetzt vom Fall ODER vom Formular; ein Link ohne
beides ist verwaist und bekommt keinen Zugang."
```

---

### Task 3: Fallnummernvergabe als gemeinsames Modul

**Dateien:**
- Erstellen: `src/lib/cases/fallnummer-vergabe.ts`
- Ändern: `src/lib/actions/cases.ts:70-125` (`createCase` benutzt das Modul)
- Erstellen: `tests/fallnummer-vergabe.test.ts`

**Schnittstellen:**
- Liefert: `mitFallnummer<T>(organizationId: string, jahr: number, versuch: (fallnummer: string) => Promise<T>, maxVersuche?: number): Promise<T>`
- Nutzt: `caseNumberPrefix`, `formatCaseNumber`, `highestSequence` aus `@/lib/cases/case-number`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/fallnummer-vergabe.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { case: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";

/** Prisma-Unique-Verletzung, wie sie bei paralleler Anlage entsteht. */
const p2002 = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => findMany.mockReset());

describe("mitFallnummer", () => {
  it("vergibt die erste Nummer des Jahres, wenn es keine gibt", async () => {
    findMany.mockResolvedValue([]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-0001");
  });

  it("zaehlt von der hoechsten bestehenden Nummer hoch", async () => {
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-0007" }, { caseNumber: "UP-2026-0003" }]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-0008");
  });

  it("zaehlt numerisch, nicht alphabetisch", async () => {
    // Der Grund, warum es diese Funktion gibt: "…-9999" ist als String
    // groesser als "…-10000". Wer das der Datenbank ueberlaesst, vergibt ab
    // dem zehntausendsten Fall dauerhaft dieselbe belegte Nummer.
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-9999" }, { caseNumber: "UP-2026-10000" }]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-10001");
  });

  it("versucht es nach einer Nummernkollision erneut", async () => {
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-0001" }]);
    let aufrufe = 0;
    const ergebnis = await mitFallnummer("org-A", 2026, async (n) => {
      aufrufe++;
      if (aufrufe === 1) throw p2002;
      return n;
    });
    expect(aufrufe).toBe(2);
    expect(ergebnis).toBe("UP-2026-0002");
  });

  it("gibt einen fremden Fehler unveraendert weiter", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      mitFallnummer("org-A", 2026, async () => {
        throw new Error("Datenbank weg");
      })
    ).rejects.toThrow("Datenbank weg");
  });

  it("gibt nach zu vielen Kollisionen auf, statt endlos zu kreisen", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      mitFallnummer("org-A", 2026, async () => {
        throw p2002;
      })
    ).rejects.toThrow(/Fallnummer/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/fallnummer-vergabe.test.ts`
Erwartet: FEHLSCHLAG, „Cannot find module '@/lib/cases/fallnummer-vergabe'".

- [ ] **Schritt 3: Das Modul schreiben**

Erstelle `src/lib/cases/fallnummer-vergabe.ts`:

```ts
import { prisma } from "@/lib/db";
import { caseNumberPrefix, formatCaseNumber, highestSequence } from "@/lib/cases/case-number";

/** true, wenn der Fehler eine Prisma-Unique-Constraint-Verletzung (P2002) ist. */
function istNummernkollision(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Vergibt die nächste freie Fallnummer und führt damit die Anlage aus.
 *
 * Warum als Rahmen und nicht als „gib mir eine Nummer": Zwei gleichzeitige
 * Anlagen berechnen dieselbe Nummer, und erst das Schreiben merkt es
 * (`@@unique([organizationId, caseNumber])`). Der Wiederholversuch muss
 * deshalb die Anlage selbst umfassen — und weil die Fallgeburt aus dem
 * Anfrageformular in einer Transaktion läuft, muss der ganze Rumpf
 * wiederholbar sein.
 *
 * Es gab diese Logik einmal privat in `createCase`. Zwei Fassungen davon
 * laufen auseinander, und die Race-Behandlung ist nichts, was man zweimal
 * richtig schreibt.
 */
export async function mitFallnummer<T>(
  organizationId: string,
  jahr: number,
  versuch: (fallnummer: string) => Promise<T>,
  maxVersuche = 5
): Promise<T> {
  let letzter: unknown = null;
  for (let n = 0; n < maxVersuche; n++) {
    const rows = await prisma.case.findMany({
      where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(jahr) } },
      select: { caseNumber: true },
    });
    const fallnummer = formatCaseNumber(jahr, highestSequence(rows.map((r) => r.caseNumber)) + 1);
    try {
      return await versuch(fallnummer);
    } catch (e) {
      if (!istNummernkollision(e)) throw e;
      letzter = e;
    }
  }
  throw new Error(`Fallnummer konnte nicht vergeben werden (${maxVersuche} Versuche).`, {
    cause: letzter,
  });
}
```

- [ ] **Schritt 4: `createCase` darauf umstellen**

In `src/lib/actions/cases.ts` die private `nextCaseNumber` und die Wiederholschleife entfernen und stattdessen:

```ts
  const created = await mitFallnummer(ctx.organizationId, year, (caseNumber) =>
    prisma.case.create({ data: buildData(caseNumber), select: { id: true, caseNumber: true } })
  );
```

Den Import `import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";` ergänzen. `isUniqueViolation`, `formatCaseNumber`, `highestSequence` und `caseNumberPrefix` sind danach in dieser Datei womöglich unbenutzt — dann die Importe entfernen, sonst bricht der Linter.

- [ ] **Schritt 5: Tests und Typprüfung**

```bash
npx vitest run tests/fallnummer-vergabe.test.ts tests/case-number.test.ts tests/cases-actions.test.ts
npx tsc --noEmit
```

Erwartet: alle grün; insbesondere die bestehenden Fallanlage-Tests, die den Umbau absichern.

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/cases/fallnummer-vergabe.ts src/lib/actions/cases.ts tests/fallnummer-vergabe.test.ts
git commit -m "refactor(faelle): Fallnummernvergabe als gemeinsamer Rahmen

Die Vergabe samt Wiederholversuch bei Kollision lag privat in createCase.
Die Fallgeburt aus dem Anfrageformular braucht sie ebenfalls – und zwar um
eine ganze Transaktion herum, weil ein halb angelegter Fall schlimmer waere
als keiner. Zwei Fassungen derselben Race-Behandlung laufen auseinander."
```

---

### Task 4: Der Formular-Dienst

**Dateien:**
- Erstellen: `src/lib/leadformular/service.ts`
- Erstellen: `tests/leadformular-service.test.ts`

**Schnittstellen:**
- Liefert:
  - `ERSTER_SCHRITT: string` sowie die Typen `AnfrageStart` und `FormularStand`. **Sie liegen bewusst hier und nicht in den Aktionsdateien:** Eine Datei mit `"use server"` darf ausschließlich async Funktionen ausführen — eine Konstante oder ein Typ dort bricht den Bau.
  - `slugNormalisieren(roh: string): string`
  - `anfrageUrl(slug: string): string`
  - `formularZuSlug(slug: string): Promise<{ id: string; organizationId: string; brokerId: string } | null>` — liefert nur **aktive** Formulare.
  - `formularDerOrganisation(organizationId: string): Promise<{ id: string; slug: string; aktiv: boolean } | null>`
- Nutzt: Modell `Leadformular` aus Aufgabe 1.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/leadformular-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://baufidesk.de" }) }));

const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadformular: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
  },
}));

import {
  slugNormalisieren,
  anfrageUrl,
  formularZuSlug,
} from "@/lib/leadformular/service";

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
});

describe("slugNormalisieren", () => {
  it("macht aus einem Namen einen URL-tauglichen Slug", () => {
    expect(slugNormalisieren("Jürgen Ertel")).toBe("juergen-ertel");
  });

  it("wirft Sonderzeichen raus und fasst Trenner zusammen", () => {
    expect(slugNormalisieren("  Baufi__Desk!! 2026  ")).toBe("baufi-desk-2026");
  });

  it("liefert leer, wenn nichts Brauchbares uebrig bleibt", () => {
    // Lieber leer als ein Slug aus Bindestrichen: der Aufrufer soll dann
    // nachfragen, statt eine unsinnige oeffentliche Adresse zu vergeben.
    expect(slugNormalisieren("???")).toBe("");
  });
});

describe("anfrageUrl", () => {
  it("baut die oeffentliche Adresse", () => {
    expect(anfrageUrl("ertel")).toBe("https://baufidesk.de/anfrage/ertel");
  });
});

describe("formularZuSlug", () => {
  it("liefert das aktive Formular", async () => {
    findUnique.mockResolvedValue({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
      aktiv: true,
    });
    await expect(formularZuSlug("ertel")).resolves.toEqual({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
    });
  });

  it("liefert null fuer ein abgeschaltetes Formular", async () => {
    findUnique.mockResolvedValue({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
      aktiv: false,
    });
    await expect(formularZuSlug("ertel")).resolves.toBeNull();
  });

  it("liefert null fuer einen unbekannten Slug", async () => {
    findUnique.mockResolvedValue(null);
    await expect(formularZuSlug("gibtsnicht")).resolves.toBeNull();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/leadformular-service.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Den Dienst schreiben**

Erstelle `src/lib/leadformular/service.ts`:

```ts
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Der Schritt, mit dem das öffentliche Formular beginnt.
 *
 * Steht hier und nicht in der Aktionsdatei: Dateien mit "use server" dürfen
 * ausschließlich async Funktionen exportieren – eine Konstante dort bricht
 * den Bau.
 */
export const ERSTER_SCHRITT = "finanzierungsart";

/** Rückmeldung des ersten abgesendeten Schritts. */
export interface AnfrageStart {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Bestätigung ohne Wirkung – siehe Honigtöpfchen. */
  danke?: boolean;
}

/** Alles, was die Verwaltungskarte anzeigt. */
export interface FormularStand {
  slug: string | null;
  aktiv: boolean;
  /** Öffentliche Adresse; null, solange kein Formular eingerichtet ist. */
  url: string | null;
  einladungen: Array<{ email: string; am: string }>;
}

/**
 * Das öffentliche Anfrageformular einer Organisation.
 *
 * Der Slug steht in einer Adresse, die auf Visitenkarten und Websites landet:
 * Er wird deshalb streng normalisiert und nie aus Rohtext übernommen.
 */
export function slugNormalisieren(roh: string): string {
  return roh
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function anfrageUrl(slug: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/anfrage/${slug}`;
}

/**
 * Auflösung für die öffentliche Seite. Ein abgeschaltetes Formular verhält
 * sich wie ein unbekanntes: Wer den Slug errät, soll nicht erfahren, dass es
 * ihn gibt.
 */
export async function formularZuSlug(
  slug: string
): Promise<{ id: string; organizationId: string; brokerId: string } | null> {
  const f = await prisma.leadformular.findUnique({
    where: { slug },
    select: { id: true, organizationId: true, brokerId: true, aktiv: true },
  });
  if (!f || !f.aktiv) return null;
  return { id: f.id, organizationId: f.organizationId, brokerId: f.brokerId };
}

/** Das Formular der Organisation – die Oberfläche verwaltet genau eines. */
export async function formularDerOrganisation(
  organizationId: string
): Promise<{ id: string; slug: string; aktiv: boolean } | null> {
  return prisma.leadformular.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, aktiv: true },
  });
}
```

- [ ] **Schritt 4: Tests und Typprüfung**

```bash
npx vitest run tests/leadformular-service.test.ts
npx tsc --noEmit
```

Erwartet: 7 Fälle grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/leadformular/service.ts tests/leadformular-service.test.ts
git commit -m "feat(anfrage): Formular-Dienst mit strenger Slug-Bildung

Der Slug landet in einer Adresse auf Visitenkarten – er wird normalisiert,
nie aus Rohtext uebernommen. Ein abgeschaltetes Formular verhaelt sich wie
ein unbekanntes: Wer den Slug erraet, soll nicht erfahren, dass es ihn gibt."
```

---

### Task 5: Öffentlicher Einstieg `/anfrage/<slug>`

**Dateien:**
- Erstellen: `src/lib/actions/anfrage.ts`
- Erstellen: `src/app/anfrage/[slug]/page.tsx`
- Erstellen: `src/components/anfrage/einstieg-formular.tsx`
- Ändern: `src/middleware.ts:22-34` (`PUBLIC_PREFIXES`)
- Erstellen: `tests/anfrage-start.test.ts`

**Schnittstellen:**
- Nutzt: `formularZuSlug`, `ERSTER_SCHRITT`, Typ `AnfrageStart` (alle Aufgabe 4), `createAnfrageLink` (Aufgabe 2), `schrittFinden`/`naechsterSchritt`/`schluessel` und `schrittSchema` wie in `speichereAntwort`.
- Liefert: `starteAnfrage(slug: string, formData: FormData): Promise<AnfrageStart | undefined>` — die **einzige** Ausfuhr dieser Datei. `"use server"` erlaubt nur async Funktionen; Konstanten und Typen liegen deshalb im Formular-Dienst.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

Erstelle `tests/anfrage-start.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-real-ip", "1.2.3.4"]]) }));

const redirect = vi.fn((ziel: string) => {
  throw Object.assign(new Error("REDIRECT"), { ziel });
});
vi.mock("next/navigation", () => ({ redirect: (z: string) => redirect(z) }));

const formularZuSlug = vi.fn();
vi.mock("@/lib/leadformular/service", () => ({
  formularZuSlug: (...a: unknown[]) => formularZuSlug(...a),
}));

const createAnfrageLink = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  createAnfrageLink: (...a: unknown[]) => createAnfrageLink(...a),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

const disclosureCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { selfDisclosure: { create: (...a: unknown[]) => disclosureCreate(...a) } },
}));

import { starteAnfrage } from "@/lib/actions/anfrage";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

/** Fängt den redirect() ab, den Server Actions per Ausnahme auslösen. */
async function starten(slug: string, werte: Record<string, string>) {
  try {
    return { ergebnis: await starteAnfrage(slug, form(werte)), ziel: null as string | null };
  } catch (e) {
    if ((e as Error).message === "REDIRECT") {
      return { ergebnis: undefined, ziel: (e as { ziel: string }).ziel };
    }
    throw e;
  }
}

beforeEach(() => {
  [formularZuSlug, createAnfrageLink, checkRateLimit, disclosureCreate, redirect].forEach((m) =>
    m.mockReset()
  );
  formularZuSlug.mockResolvedValue({ id: "form-1", organizationId: "org-A", brokerId: "user-1" });
  checkRateLimit.mockResolvedValue({ ok: true, remaining: 4 });
  createAnfrageLink.mockResolvedValue({ linkId: "link-1", token: "TOK", url: "u", expiresAt: new Date() });
  disclosureCreate.mockResolvedValue({ id: "bogen-1" });
});

describe("starteAnfrage", () => {
  it("legt Link und Bogen an und schickt auf den naechsten Schritt", async () => {
    const { ziel } = await starten("ertel", { art: "kauf_bestand" });
    expect(createAnfrageLink).toHaveBeenCalledTimes(1);
    expect(disclosureCreate.mock.calls[0][0].data.linkId).toBe("link-1");
    expect(disclosureCreate.mock.calls[0][0].data.caseId).toBeUndefined();
    expect(disclosureCreate.mock.calls[0][0].data.answers).toEqual({
      "finanzierungsart.art": "kauf_bestand",
    });
    expect(ziel).toBe("/selbstauskunft/TOK/objektstand");
  });

  it("legt nichts an, wenn das Honigtoepfchen gefuellt ist", async () => {
    // Und meldet trotzdem Erfolg: Wer "erkannt" zurueckgibt, verraet seine
    // Erkennung an den naechsten Versuch.
    const { ergebnis } = await starten("ertel", { art: "kauf_bestand", website: "http://spam" });
    expect(ergebnis).toEqual({ danke: true });
    expect(createAnfrageLink).not.toHaveBeenCalled();
    expect(disclosureCreate).not.toHaveBeenCalled();
  });

  it("legt nichts an, wenn die IP-Grenze erreicht ist", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfterSec: 3600 });
    const { ergebnis } = await starten("ertel", { art: "kauf_bestand" });
    expect(ergebnis?.error).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("legt nichts an, wenn das Formular unbekannt oder abgeschaltet ist", async () => {
    formularZuSlug.mockResolvedValue(null);
    const { ergebnis } = await starten("gibtsnicht", { art: "kauf_bestand" });
    expect(ergebnis?.error).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("weist einen ungueltigen Wert ab, statt ihn zu speichern", async () => {
    const { ergebnis } = await starten("ertel", { art: "brieftaube" });
    expect(ergebnis?.fieldErrors).toBeTruthy();
    expect(createAnfrageLink).not.toHaveBeenCalled();
  });

  it("laesst den ersten Schritt leer und geht trotzdem weiter", async () => {
    // Der Katalog kennt keine Pflichtfelder – auch nicht im ersten Schritt.
    const { ziel } = await starten("ertel", {});
    expect(disclosureCreate.mock.calls[0][0].data.answers).toEqual({});
    expect(ziel).toContain("/selbstauskunft/TOK/");
  });

  it("gibt zwei Besuchern getrennte Boegen", async () => {
    // Der Kern des Entwurfs: Der Dauerlink ERZEUGT Boegen, statt einer zu
    // sein. Bekaemen beide denselben Link, laese der zweite Interessent die
    // Antworten des ersten.
    createAnfrageLink
      .mockResolvedValueOnce({ linkId: "link-A", token: "TOK-A", url: "u", expiresAt: new Date() })
      .mockResolvedValueOnce({ linkId: "link-B", token: "TOK-B", url: "u", expiresAt: new Date() });

    const erster = await starten("ertel", { art: "kauf_bestand" });
    const zweiter = await starten("ertel", { art: "kauf_bestand" });

    expect(disclosureCreate.mock.calls[0][0].data.linkId).toBe("link-A");
    expect(disclosureCreate.mock.calls[1][0].data.linkId).toBe("link-B");
    expect(erster.ziel).not.toBe(zweiter.ziel);
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/anfrage-start.test.ts`
Erwartet: FEHLSCHLAG, `starteAnfrage` ist kein Export.

- [ ] **Schritt 3: Die Aktion schreiben**

Erstelle `src/lib/actions/anfrage.ts`. **Vorher** `src/lib/actions/self-disclosure.ts:36-88` lesen: Die Prüfung des Schritts (`schrittSchema(...).safeParse`) wird hier bewusst genauso gemacht, damit der erste Schritt nach denselben Regeln geprüft wird wie jeder folgende.

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { ERSTER_SCHRITT, formularZuSlug, type AnfrageStart } from "@/lib/leadformular/service";
import { createAnfrageLink } from "@/lib/security/self-disclosure-link";
import { schrittFinden, naechsterSchritt, schluessel } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import type { Antworten } from "@/lib/self-disclosure/types";

/** Gültigkeit eines Formular-Links: lang genug, um in Ruhe auszufüllen. */
const GUELTIG_TAGE = 30;
/** Neue Bögen je IP und Stunde. */
const MAX_JE_STUNDE = 5;

async function clientIp(): Promise<string> {
  const h = await headers();
  // x-real-ip wird von Vercel gesetzt (nicht client-spoofbar); x-forwarded-for als Fallback.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Der erste abgesendete Schritt eines öffentlichen Anfrageformulars.
 *
 * Hier – und nur hier – entsteht der persönliche Link eines Besuchers. Ein
 * bloßer Seitenaufruf legt nichts an: Sonst hinterließe jeder Scanner, der
 * die Domain abklopft, eine Zeile. Ein Fall entsteht auch hier noch nicht;
 * der kommt erst beim Absenden des ganzen Bogens.
 */
export async function starteAnfrage(
  slug: string,
  formData: FormData
): Promise<AnfrageStart | undefined> {
  // Honigtöpfchen: ein für Menschen unsichtbares Feld. Ist es gefüllt, war es
  // kein Mensch. Freundlich bestätigen und nichts tun – eine Fehlermeldung
  // verriete die Erkennung.
  if (String(formData.get("website") ?? "").trim() !== "") return { danke: true };

  const formular = await formularZuSlug(slug);
  if (!formular) return { error: "Dieses Formular ist derzeit nicht verfügbar." };

  const grenze = await checkRateLimit(`anfrage:${slug}:${await clientIp()}`, MAX_JE_STUNDE, 3600);
  if (!grenze.ok) {
    return { error: "Zu viele Anfragen. Bitte versuchen Sie es später noch einmal." };
  }

  const schritt = schrittFinden(ERSTER_SCHRITT, {});
  if (!schritt) throw new Error(`Erster Schritt "${ERSTER_SCHRITT}" fehlt im Katalog.`);

  const geprueft = schrittSchema(schritt.schritt).safeParse(Object.fromEntries(formData.entries()));
  if (!geprueft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of geprueft.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };
  }

  const antworten: Antworten = {};
  for (const [feldId, value] of Object.entries(geprueft.data)) {
    if (value === null || value === undefined || value === "") continue;
    antworten[schluessel(schritt.id, feldId)] = value as Antworten[string];
  }

  const link = await createAnfrageLink(
    formular.id,
    new Date(Date.now() + GUELTIG_TAGE * 86_400_000),
    { organizationId: formular.organizationId }
  );

  const weiter = naechsterSchritt(schritt.id, antworten);
  const currentStep = weiter?.id ?? "zusammenfassung";
  await prisma.selfDisclosure.create({
    data: { linkId: link.linkId, answers: antworten as object, currentStep },
  });

  redirect(`/selbstauskunft/${link.token}/${currentStep}`);
}
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npx vitest run tests/anfrage-start.test.ts
```

Erwartet: 7 Fälle grün.

- [ ] **Schritt 5: Die öffentliche Seite bauen**

Erstelle `src/components/anfrage/einstieg-formular.tsx` — eine Client-Komponente im Zuschnitt von `src/components/self-disclosure/step-form.tsx` (vorher lesen und dessen Feld-Darstellung übernehmen, kein neues Gestaltungsmittel erfinden):

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { starteAnfrage } from "@/lib/actions/anfrage";
import type { AnfrageStart } from "@/lib/leadformular/service";
import type { Feld } from "@/lib/self-disclosure/types";

function WeiterButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : "Los geht's"}
    </Button>
  );
}

export function EinstiegFormular({ slug, frage, felder }: { slug: string; frage: string; felder: Feld[] }) {
  const [state, action] = useActionState<AnfrageStart, FormData>(
    async (_prev, fd) => (await starteAnfrage(slug, fd)) ?? {},
    {}
  );

  if (state.danke) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <h2 className="text-lg font-semibold">Vielen Dank!</h2>
        <p className="mt-2 text-sm text-muted-foreground">Ihre Anfrage ist eingegangen.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <h1 className="text-2xl font-semibold">{frage}</h1>
      {/* Honigtoepfchen: fuer Menschen unsichtbar, fuer einfache Bots
          verlockend. Kein display:none – manche Bots ueberspringen das. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {/* Felder wie in StepForm rendern */}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <WeiterButton />
    </form>
  );
}
```

Erstelle `src/app/anfrage/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ERSTER_SCHRITT, formularZuSlug } from "@/lib/leadformular/service";
import { schrittFinden } from "@/lib/self-disclosure/navigation";
import { EinstiegFormular } from "@/components/anfrage/einstieg-formular";

export const dynamic = "force-dynamic";

export default async function AnfrageEinstieg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Unbekannt und abgeschaltet sehen gleich aus: Wer den Slug erraet, soll
  // nicht erfahren, dass es ihn gibt.
  const formular = await formularZuSlug(slug);
  if (!formular) notFound();

  const schritt = schrittFinden(ERSTER_SCHRITT, {});
  if (!schritt) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-6">
      <Logo />
      <EinstiegFormular slug={slug} frage={schritt.schritt.frage} felder={schritt.schritt.felder} />
      <p className="mt-auto text-xs text-muted-foreground">
        Ihre Angaben werden verschlüsselt übertragen und ausschließlich zur Bearbeitung Ihrer
        Anfrage verwendet. Mehr dazu in der{" "}
        <a href="/datenschutz" className="underline">Datenschutzerklärung</a>.
      </p>
    </main>
  );
}
```

- [ ] **Schritt 6: Die Route am Site-Gate vorbeiführen**

In `src/middleware.ts` in `PUBLIC_PREFIXES` ergänzen und die Kommentarliste darüber mitziehen:

```ts
  "/anfrage",
```

```
 *  - `/anfrage/*`     Oeffentliches Anfrageformular (Externe kennen das Gate-Passwort nicht)
```

**Ohne diesen Schritt ist das Formular für jeden Außenstehenden unerreichbar** — er landet auf der Passwortseite. Das ist der eine Fehler, der beim Testen von innen nicht auffällt, weil der Entwickler das Gate-Cookie längst hat.

- [ ] **Schritt 7: In der laufenden Anwendung ansehen**

Lokale Datenbank und Entwicklungsserver starten (Notiz `lokale-db-ohne-docker`), von Hand ein `Leadformular` anlegen (`npx prisma studio` oder ein kurzes Skript), dann `/anfrage/<slug>` **in einem privaten Fenster** öffnen. Prüfen: Seite kommt ohne Gate, erster Schritt lässt sich absenden, danach steht man auf `/selbstauskunft/<token>/objektstand`, und der Fortschrittsbalken zählt.

Zusätzlich messen, dass ein bloßer **Aufruf** nichts anlegt — das ist die tragende Zusage gegen den Scanner-Verkehr auf der Domain:

```bash
# Vor und nach fünfmaligem Neuladen von /anfrage/<slug> derselbe Wert:
npx prisma studio   # Tabelle self_disclosure_links zählen
```

Erwartet: unverändert. Steigt die Zahl beim Laden, legt die Seite selbst an — dann ist die Aktion an der falschen Stelle verdrahtet.

- [ ] **Schritt 8: Typprüfung und Commit**

```bash
npx tsc --noEmit
npx vitest run tests/anfrage-start.test.ts
git add src/lib/actions/anfrage.ts src/app/anfrage src/components/anfrage src/middleware.ts tests/anfrage-start.test.ts
git commit -m "feat(anfrage): oeffentlicher Einstieg unter /anfrage/<slug>

Der persoenliche Link entsteht erst beim Absenden des ersten Schritts – ein
blosser Aufruf hinterlaesst nichts, sonst legte jeder Scanner eine Zeile an.
Honigtoepfchen und IP-Grenze bremsen den Rest; das Honigtoepfchen bestaetigt
freundlich, statt seine Erkennung zu verraten.

Die Route steht in PUBLIC_PREFIXES: ohne das laeuft jeder Externe ins Gate."
```

---

### Task 6: Die Kundenstrecke ohne Fall

**Dateien:**
- Ändern: `src/lib/actions/self-disclosure.ts:36-88` (`speichereAntwort`)
- Ändern: `src/app/selbstauskunft/[token]/[schritt]/page.tsx:61`
- Ändern: `src/app/selbstauskunft/[token]/page.tsx`
- Ändern: `src/lib/self-disclosure/prefill.ts:17`
- Ändern: `tests/selbstauskunft-actions.test.ts`

**Schnittstellen:**
- Nutzt: `SelfDisclosureAccess.caseId: string | null` (Aufgabe 2).
- Liefert: `ladeVorbelegung(caseId: string | null): Promise<Vorbelegungsstand>` — bei `null` ein leerer Stand.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `tests/selbstauskunft-actions.test.ts` ergänzen (die vorhandenen Mocks der Datei weiterverwenden; sie decken `resolveSelfDisclosureToken` und `prisma.selfDisclosure` bereits ab — vor dem Schreiben nachsehen, wie sie dort heißen):

```ts
it("speichert einen Schritt auch ohne Fall", async () => {
  // Formular-Bogen: Der Fall entsteht erst beim Absenden. Bis dahin darf
  // kein Schreibvorgang eine caseId verlangen.
  resolveToken.mockResolvedValue({ linkId: "link-1", caseId: null, organizationId: "org-A" });
  disclosureFindUnique.mockResolvedValue({ answers: {}, submittedAt: null });

  await speichereAntwort("TOK", "finanzierungsart", form({ art: "kauf_bestand" })).catch(() => {});

  const daten = disclosureUpsert.mock.calls[0][0];
  expect(daten.create.caseId ?? null).toBeNull();
  expect(daten.create.linkId).toBe("link-1");
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-actions.test.ts`
Erwartet: FEHLSCHLAG — `create` schreibt heute `caseId: access.caseId` als Pflichtwert und die Typprüfung des Aufrufs bricht.

- [ ] **Schritt 3: Die vier Stellen umstellen**

In `src/lib/actions/self-disclosure.ts`, im `upsert` von `speichereAntwort`:

```ts
  await prisma.selfDisclosure.upsert({
    where: { linkId: access.linkId },
    // caseId nur setzen, wenn es einen Fall gibt. Beim Anfrageformular
    // entsteht er erst beim Absenden.
    create: {
      linkId: access.linkId,
      ...(access.caseId ? { caseId: access.caseId } : {}),
      answers: neu as object,
      currentStep,
    },
    update: { answers: neu as object, currentStep },
  });
```

In `src/lib/self-disclosure/prefill.ts`:

```ts
/** Ohne Fall gibt es nichts vorzubelegen – der Bogen ist die erste Quelle. */
export async function ladeVorbelegung(caseId: string | null): Promise<Vorbelegungsstand> {
  if (!caseId) return { applicants: [], property: null, financingRequest: null };
  // … unverändert
}
```

In `src/app/selbstauskunft/[token]/[schritt]/page.tsx:61` bleibt der Aufruf `ladeVorbelegung(access.caseId)` unverändert — er übersetzt sich durch die neue Signatur von selbst.

In `src/app/selbstauskunft/[token]/page.tsx` und `zusammenfassung/page.tsx` prüfen, ob `access.caseId` irgendwo als `string` verwendet wird; heute nicht. Die Typprüfung entscheidet.

- [ ] **Schritt 4: Tests und Typprüfung**

```bash
npx vitest run tests/selbstauskunft-actions.test.ts tests/selbstauskunft-navigation.test.ts
npx tsc --noEmit
```

Erwartet: alles grün. **Ab hier muss `npx tsc --noEmit` wieder vollständig fehlerfrei sein** — die aus Aufgabe 1 notierte Fehlerliste ist damit abgearbeitet. Bleibt etwas übrig, gehört es hierher und nicht in eine spätere Aufgabe.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/actions/self-disclosure.ts src/lib/self-disclosure/prefill.ts src/app/selbstauskunft tests/selbstauskunft-actions.test.ts
git commit -m "feat(anfrage): die Kundenstrecke haelt den falllosen Bogen aus

Schritt speichern und Vorbelegung kommen ohne Fall aus. Die Vorbelegung ist
dann schlicht leer – kein Sonderfall, sondern der Normalzustand, solange der
Bogen die erste Datenquelle ist."
```

---

### Task 7: Pflichtangaben und Einwilligung auf der Abschlussseite

**Dateien:**
- Erstellen: `src/lib/self-disclosure/pflichtangaben.ts`
- Ändern: `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx`
- Erstellen: `tests/anfrage-pflichtangaben.test.ts`

**Schnittstellen:**
- Liefert:
  - `const KONTAKT_SCHLUESSEL = { nachname: "p1.person_name.nachname", email: "p1.person_kontakt.email", telefon: "p1.person_kontakt.telefon" }`
  - `fehlendeKontaktangaben(antworten: Antworten): Array<"nachname" | "email" | "telefon">`
  - `KONTAKT_LABELS: Record<"nachname" | "email" | "telefon", string>`
  - `EINWILLIGUNG_FASSUNG: string`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/anfrage-pflichtangaben.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  fehlendeKontaktangaben,
  KONTAKT_SCHLUESSEL,
} from "@/lib/self-disclosure/pflichtangaben";

const vollstaendig = {
  [KONTAKT_SCHLUESSEL.nachname]: "Mustermann",
  [KONTAKT_SCHLUESSEL.email]: "max@example.de",
  [KONTAKT_SCHLUESSEL.telefon]: "0170 1234567",
};

describe("fehlendeKontaktangaben", () => {
  it("meldet nichts, wenn alles da ist", () => {
    expect(fehlendeKontaktangaben(vollstaendig)).toEqual([]);
  });

  it("meldet alle drei bei einem leeren Bogen", () => {
    expect(fehlendeKontaktangaben({})).toEqual(["nachname", "email", "telefon"]);
  });

  it("zaehlt Leerzeichen nicht als Angabe", () => {
    expect(fehlendeKontaktangaben({ ...vollstaendig, [KONTAKT_SCHLUESSEL.nachname]: "   " })).toEqual([
      "nachname",
    ]);
  });

  it("verlangt ein @ in der Adresse", () => {
    // Ohne diese Pruefung entstuende ein Fall mit einer Adresse, an die nie
    // etwas ankommt – und niemand merkt es.
    expect(fehlendeKontaktangaben({ ...vollstaendig, [KONTAKT_SCHLUESSEL.email]: "keine-adresse" })).toEqual([
      "email",
    ]);
  });

  it("liest die Angaben des ERSTEN Antragstellers", () => {
    // Die Personenschritte tragen das Praefix p1./p2. – wer das vergisst,
    // prueft ein Feld, das es nie gibt, und laesst jeden Bogen durch.
    expect(KONTAKT_SCHLUESSEL.nachname).toBe("p1.person_name.nachname");
    expect(KONTAKT_SCHLUESSEL.email).toBe("p1.person_kontakt.email");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/anfrage-pflichtangaben.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Die Prüfung schreiben**

Erstelle `src/lib/self-disclosure/pflichtangaben.ts`:

```ts
import { schluessel } from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

/**
 * Was ein Anfrageformular mindestens braucht, damit daraus ein Fall werden
 * darf. Der KATALOG bleibt ohne Pflichtfelder (siehe types.ts) – die Pflicht
 * sitzt hier, am Absenden, und ausschließlich beim Formular-Weg: Ein Lead
 * ohne Rückweg ist keiner.
 *
 * Die Personenschritte tragen das Präfix "p1."/"p2." (siehe
 * `sichtbareSchritte`). Wer das vergisst, prüft Schlüssel, die es nie gibt,
 * und lässt damit jeden Bogen durch.
 */
export const KONTAKT_SCHLUESSEL = {
  nachname: schluessel("p1.person_name", "nachname"),
  email: schluessel("p1.person_kontakt", "email"),
  telefon: schluessel("p1.person_kontakt", "telefon"),
} as const;

export type Kontaktangabe = keyof typeof KONTAKT_SCHLUESSEL;

export const KONTAKT_LABELS: Record<Kontaktangabe, string> = {
  nachname: "Nachname",
  email: "E-Mail",
  telefon: "Telefon",
};

/** Fassung des Einwilligungstextes – wandert als Nachweis an den Bogen. */
export const EINWILLIGUNG_FASSUNG = "2026-08-15";

const text = (a: Antworten, k: string): string => String(a[k] ?? "").trim();

export function fehlendeKontaktangaben(antworten: Antworten): Kontaktangabe[] {
  const fehlt: Kontaktangabe[] = [];
  if (!text(antworten, KONTAKT_SCHLUESSEL.nachname)) fehlt.push("nachname");
  const email = text(antworten, KONTAKT_SCHLUESSEL.email);
  if (!email || !email.includes("@")) fehlt.push("email");
  if (!text(antworten, KONTAKT_SCHLUESSEL.telefon)) fehlt.push("telefon");
  return fehlt;
}
```

- [ ] **Schritt 4: Die Abschlussseite ergänzen**

In `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx`: Für Bögen **ohne Fall** (`access.caseId === null`) über dem Absenden-Knopf einen Block rendern, der genau die fehlenden Kontaktfelder als Eingaben zeigt und das Pflicht-Häkchen trägt. Die Felder tragen die Namen `nachname`, `email`, `telefon`; das Häkchen heißt `einwilligung`.

```tsx
{access.caseId === null && (
  <div className="space-y-3 rounded-lg border p-4">
    <h2 className="text-sm font-semibold">Wie erreichen wir Sie?</h2>
    {fehlend.length > 0 && (
      <p className="text-xs text-muted-foreground">
        Diese Angaben brauchen wir, um Ihnen antworten zu können.
      </p>
    )}
    {fehlend.map((k) => (
      <div key={k} className="space-y-1">
        <Label htmlFor={k}>{KONTAKT_LABELS[k]}</Label>
        <Input id={k} name={k} required />
      </div>
    ))}
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" name="einwilligung" value="ja" required className="mt-0.5 h-4 w-4" />
      <span>
        Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage
        gespeichert und verarbeitet werden (<a href="/datenschutz" className="underline">Datenschutzerklärung</a>).
      </span>
    </label>
  </div>
)}
```

Die Server-Action der Seite reicht das Formular weiter: `async function absenden(formData: FormData) { "use server"; await sendeAb(token, formData); }` — die neue Signatur entsteht in Aufgabe 9. Der `<form action={absenden}>` bleibt, der Knopf ebenso.

- [ ] **Schritt 5: Tests und Typprüfung**

```bash
npx vitest run tests/anfrage-pflichtangaben.test.ts
npx tsc --noEmit
```

Erwartet: 5 Fälle grün. `tsc` meldet die noch fehlende zweite Parameterstelle von `sendeAb` — die kommt in Aufgabe 9. Wer diese Aufgabe einzeln abschließen will, gibt `sendeAb` schon jetzt einen optionalen zweiten Parameter, der noch nicht ausgewertet wird.

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/self-disclosure/pflichtangaben.ts src/app/selbstauskunft/\[token\]/zusammenfassung/page.tsx tests/anfrage-pflichtangaben.test.ts
git commit -m "feat(anfrage): Kontaktdaten und Einwilligung am Ende des Bogens

Der Katalog bleibt ohne Pflichtfelder – die Pflicht sitzt am Absenden und
nur beim Formular-Weg. Gefragt wird nur, was noch leer ist, und geschrieben
wird in dieselben Antwortschluessel: eine Wahrheit, kein Duplikat.

Die Schluessel tragen das Praefix p1.: ohne das prueft man Felder, die es
nie gibt, und laesst jeden Bogen durch."
```

---

### Task 8: Den Schreibkern der Übernahme herauslösen

**Dateien:**
- Erstellen: `src/lib/self-disclosure/schreiben.ts`
- Ändern: `src/lib/actions/self-disclosure.ts` (`uebernehmen` benutzt den Kern; `konvertiere` wandert mit)

**Schnittstellen:**
- Liefert: `schreibeVorschlaege(tx: Prisma.TransactionClient, caseId: string, vorschlaege: Vorschlag[], vorhandene: Map<number, string>): Promise<void>` — legt fehlende Antragsteller an und schreibt alle Zielentitäten.
- Nutzt: `Vorschlag` aus `@/lib/self-disclosure/takeover`.

**Sicherheitsnetz:** Diese Aufgabe ändert **kein** Verhalten. Die vorhandenen Tests `tests/selbstauskunft-uebernehmen-action.test.ts` und `tests/selbstauskunft-uebernahme.test.ts` müssen vorher **und** nachher unverändert grün sein.

- [ ] **Schritt 1: Ausgangslage messen**

```bash
npx vitest run tests/selbstauskunft-uebernehmen-action.test.ts tests/selbstauskunft-uebernahme.test.ts
```

Erwartet: grün. Die Anzahl der Fälle notieren.

- [ ] **Schritt 2: Kern verschieben**

`src/lib/actions/self-disclosure.ts:233` bis zum Ende des `$transaction`-Rumpfes lesen. Den gesamten Rumpf (Antragsteller anlegen, die vier `pro…`-Sammlungen, die Schreibschleifen) **wortgleich** nach `src/lib/self-disclosure/schreiben.ts` verschieben, zusammen mit der privaten Funktion `konvertiere`:

```ts
import type { Prisma } from "@prisma/client";
import type { Vorschlag } from "@/lib/self-disclosure/takeover";

/**
 * Schreibt Übernahme-Vorschläge in einen Fall – der gemeinsame Kern von
 * „Vermittler gibt frei" und „Fall entsteht aus dem Anfrageformular".
 *
 * Bewusst ein eigenes Modul und keine Funktion in der Aktionsdatei: Dateien
 * mit "use server" dürfen ausschließlich async Funktionen exportieren, und
 * `konvertiere` gehört hier dazu.
 *
 * @param vorhandene Position → Antragsteller-ID der bereits bestehenden
 *   Antragsteller. Fehlende werden angelegt.
 */
export async function schreibeVorschlaege(
  tx: Prisma.TransactionClient,
  caseId: string,
  vorschlaege: Vorschlag[],
  vorhandene: Map<number, string>
): Promise<void> {
  // … der verschobene Rumpf, unverändert
}
```

In `uebernehmen` bleibt:

```ts
  await prisma.$transaction(async (tx) => {
    const vorhanden = new Map<number, string>(
      stand.applicants.map((a) => [a.position, a.id as string])
    );
    await schreibeVorschlaege(tx, caseId, gewaehlt, vorhanden);
    // … der bisherige Rest der Transaktion (takenOverAt, Audit o. Ä.)
  });
```

- [ ] **Schritt 3: Dieselben Tests erneut laufen lassen**

```bash
npx vitest run tests/selbstauskunft-uebernehmen-action.test.ts tests/selbstauskunft-uebernahme.test.ts
npx tsc --noEmit
```

Erwartet: **exakt dasselbe Ergebnis wie in Schritt 1.** Weicht etwas ab, wurde beim Verschieben etwas verändert — zurück und wortgleich verschieben.

- [ ] **Schritt 4: Commit**

```bash
git add src/lib/self-disclosure/schreiben.ts src/lib/actions/self-disclosure.ts
git commit -m "refactor(selbstauskunft): Schreibkern der Uebernahme herausgeloest

Reine Verschiebung, kein Verhalten geaendert – die bestehenden Tests sind
das Netz. Die Fallgeburt aus dem Anfrageformular schreibt dieselben
Vorschlaege in denselben Fall; zwei Fassungen davon liefen auseinander.

Eigenes Modul statt Funktion in der Aktionsdatei: 'use server' erlaubt nur
async Exporte, konvertiere ist keiner."
```

---

### Task 9: Die Fallgeburt beim Absenden

**Dateien:**
- Erstellen: `src/lib/leadformular/fallgeburt.ts`
- Ändern: `src/lib/actions/self-disclosure.ts` (`sendeAb`)
- Erstellen: `tests/anfrage-fallgeburt.test.ts`
- Erstellen: `tests/anfrage-fallgeburt-db.test.ts`

**Schnittstellen:**
- Nutzt: `mitFallnummer` (Aufgabe 3), `schreibeVorschlaege` (Aufgabe 8), `planUebernahme` (`@/lib/self-disclosure/takeover`), `fehlendeKontaktangaben` und `EINWILLIGUNG_FASSUNG` (Aufgabe 7).
- Liefert:
  - `gebaereFall(bogenId: string, antworten: Antworten, formular: { id: string; organizationId: string; brokerId: string }, jetzt: Date): Promise<string>` — liefert die neue `caseId`.
  - `sendeAb(token: string, formData?: FormData): Promise<{ error?: string; fieldErrors?: Record<string, string> } | undefined>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/anfrage-fallgeburt.test.ts` — hier wird nur die **Torwächter-Logik** von `sendeAb` geprüft (die Schreibvorgänge deckt der Datenbanktest im nächsten Schritt ab):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const resolveToken = vi.fn();
// ALLE drei Ausfuhren nachbilden: src/lib/actions/self-disclosure.ts
// importiert auch deactivateSelfDisclosureLink. Fehlt eine im Mock,
// scheitert schon der Import des Moduls – mit einer Meldung, die nach einem
// Testfehler aussieht, aber keiner ist.
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolveToken(...a),
  createSelfDisclosureLink: vi.fn(),
  deactivateSelfDisclosureLink: vi.fn(),
}));

const gebaereFall = vi.fn();
vi.mock("@/lib/leadformular/fallgeburt", () => ({
  gebaereFall: (...a: unknown[]) => gebaereFall(...a),
}));

const disclosureFindUnique = vi.fn();
const disclosureUpdateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      findUnique: (...a: unknown[]) => disclosureFindUnique(...a),
      updateMany: (...a: unknown[]) => disclosureUpdateMany(...a),
      update: vi.fn(),
    },
  },
}));

import { sendeAb } from "@/lib/actions/self-disclosure";
import { KONTAKT_SCHLUESSEL } from "@/lib/self-disclosure/pflichtangaben";

const vollstaendig = {
  [KONTAKT_SCHLUESSEL.nachname]: "Mustermann",
  [KONTAKT_SCHLUESSEL.email]: "max@example.de",
  [KONTAKT_SCHLUESSEL.telefon]: "0170 1234567",
};

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [resolveToken, gebaereFall, disclosureFindUnique, disclosureUpdateMany].forEach((m) => m.mockReset());
  resolveToken.mockResolvedValue({ linkId: "link-1", caseId: null, organizationId: "org-A" });
  disclosureFindUnique.mockResolvedValue({
    id: "bogen-1",
    submittedAt: null,
    answers: vollstaendig,
    link: { formular: { id: "form-1", organizationId: "org-A", brokerId: "user-1" } },
  });
  disclosureUpdateMany.mockResolvedValue({ count: 1 });
  gebaereFall.mockResolvedValue("case-neu");
});

describe("sendeAb beim Anfrageformular", () => {
  it("gebaert den Fall, wenn Kontaktdaten und Einwilligung da sind", async () => {
    const res = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(res?.error).toBeUndefined();
    expect(gebaereFall).toHaveBeenCalledTimes(1);
  });

  it("gebaert keinen Fall ohne Einwilligung", async () => {
    const res = await sendeAb("TOK", form({}));
    expect(res?.error).toBeTruthy();
    expect(gebaereFall).not.toHaveBeenCalled();
  });

  it("gebaert keinen Fall ohne Kontaktdaten", async () => {
    disclosureFindUnique.mockResolvedValue({
      id: "bogen-1",
      submittedAt: null,
      answers: {},
      link: { formular: { id: "form-1", organizationId: "org-A", brokerId: "user-1" } },
    });
    const res = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(res?.fieldErrors).toBeTruthy();
    expect(gebaereFall).not.toHaveBeenCalled();
  });

  it("gebaert bei zwei gleichzeitigen Klicks nur einmal", async () => {
    // Die Reservierung ueber submittedAt ist atomar: Der zweite Klick
    // bekommt count 0 und darf nichts mehr tun.
    disclosureUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await sendeAb("TOK", form({ einwilligung: "ja" }));
    const zweiter = await sendeAb("TOK", form({ einwilligung: "ja" }));
    expect(gebaereFall).toHaveBeenCalledTimes(1);
    expect(zweiter?.error).toBeTruthy();
  });

  it("laesst den fallgebundenen Bogen unveraendert durch", async () => {
    resolveToken.mockResolvedValue({ linkId: "link-1", caseId: "case-A", organizationId: "org-A" });
    disclosureFindUnique.mockResolvedValue({
      id: "bogen-1",
      submittedAt: null,
      answers: {},
      link: { formular: null },
    });
    const res = await sendeAb("TOK");
    expect(res?.error).toBeUndefined();
    expect(gebaereFall).not.toHaveBeenCalled();
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/anfrage-fallgeburt.test.ts`
Erwartet: FEHLSCHLAG — `sendeAb` kennt keinen zweiten Parameter und keine Fallgeburt.

- [ ] **Schritt 3: Die Fallgeburt schreiben**

Erstelle `src/lib/leadformular/fallgeburt.ts`:

```ts
import { prisma } from "@/lib/db";
import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";
import { planUebernahme } from "@/lib/self-disclosure/takeover";
import { schreibeVorschlaege } from "@/lib/self-disclosure/schreiben";
import { anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import { EINWILLIGUNG_FASSUNG } from "@/lib/self-disclosure/pflichtangaben";
import type { Antworten } from "@/lib/self-disclosure/types";

/**
 * Aus einem abgesendeten Formular-Bogen wird ein Fall.
 *
 * Der Fall wird GEFÜLLT geboren, nicht leer mit Freigabe-Eingang: Die
 * manuelle Freigabe schützt einen vorhandenen Datenstand vor Überschreiben —
 * hier gibt es keinen. Ein leerer Fall plus Eingang hieße, dass Ampel,
 * Machbarkeit und Checkliste auf einen Klick warten, der nichts abwägen kann.
 *
 * Alles in EINER Transaktion: Ein halb geborener Fall — Nummer vergeben,
 * Antragsteller fehlt — wäre schlimmer als gar keiner. Deshalb liegt auch die
 * Nummernvergabe außen herum (`mitFallnummer`), damit eine Kollision die
 * ganze Transaktion wiederholt statt einen Torso zu hinterlassen.
 */
export async function gebaereFall(
  bogenId: string,
  antworten: Antworten,
  formular: { id: string; organizationId: string; brokerId: string },
  jetzt: Date
): Promise<string> {
  const personen = anzahlAntragsteller(antworten);

  return mitFallnummer(formular.organizationId, jetzt.getFullYear(), (fallnummer) =>
    prisma.$transaction(async (tx) => {
      const fall = await tx.case.create({
        data: {
          organizationId: formular.organizationId,
          brokerId: formular.brokerId,
          caseNumber: fallnummer,
          status: "neu",
          leadPhase: "neu",
          quelle: "webformular",
          financingRequest: { create: {} },
          sources: { create: { type: "kundenformular" } },
          applicants: {
            create: Array.from({ length: personen }, (_, i) => ({ position: i + 1 })),
          },
        },
        select: { id: true, applicants: { select: { id: true, position: true } } },
      });

      // Leerer Fall: Jeder gegebene Wert ist ein Vorschlag, also landet alles
      // drin. Derselbe Kern, den auch die Freigabe des Vermittlers benutzt.
      const plan = planUebernahme(antworten, {
        applicants: fall.applicants.map((a) => ({ id: a.id, position: a.position })),
        property: null,
        financingRequest: null,
        caseFelder: { financingType: null },
      });
      const vorhandene = new Map<number, string>(fall.applicants.map((a) => [a.position, a.id]));
      await schreibeVorschlaege(tx, fall.id, plan.vorschlaege, vorhandene);

      await tx.selfDisclosure.update({
        where: { id: bogenId },
        data: {
          caseId: fall.id,
          takenOverAt: jetzt,
          einwilligungAm: jetzt,
          einwilligungFassung: EINWILLIGUNG_FASSUNG,
        },
      });

      return fall.id;
    })
  );
}
```

**Vor dem Schreiben prüfen:** ob `planUebernahme` den `Fallstand` genau in dieser Form erwartet (`src/lib/self-disclosure/takeover.ts`, Typ `Fallstand`) und ob `anzahlAntragsteller` aus `catalog.ts` exportiert ist — beides wird oben angenommen und ist an der Quelle zu bestätigen.

- [ ] **Schritt 4: `sendeAb` umbauen**

In `src/lib/actions/self-disclosure.ts`:

```ts
/**
 * Schließt den Bogen ab. Lücken sind ausdrücklich erlaubt – der Eingang zeigt
 * sie dem Vermittler als Nachfassliste. Ab hier ist der Bogen nur noch lesbar.
 *
 * Stammt der Bogen aus einem Anfrageformular, entsteht hier – und nur hier –
 * der Fall. `formData` trägt dann die nachgefragten Kontaktdaten und das
 * Einwilligungs-Häkchen; beim fallgebundenen Bogen bleibt sie leer.
 */
export async function sendeAb(
  token: string,
  formData?: FormData
): Promise<{ error?: string; fieldErrors?: Record<string, string> } | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: {
      id: true,
      submittedAt: true,
      answers: true,
      link: { select: { formular: { select: { id: true, organizationId: true, brokerId: true } } } },
    },
  });
  if (!bogen) return { error: "Es sind noch keine Angaben gespeichert." };
  if (bogen.submittedAt) return { error: "Ihre Angaben wurden bereits übermittelt." };

  const formular = bogen.link.formular;
  let antworten = (bogen.answers as Antworten) ?? {};

  if (formular) {
    if (String(formData?.get("einwilligung") ?? "") !== "ja") {
      return { error: "Bitte bestätigen Sie die Datenschutzhinweise." };
    }
    // Nachgereichte Kontaktdaten in DIESELBEN Antwortschlüssel schreiben –
    // nicht daneben. Sonst gäbe es zwei Wahrheiten über den Namen.
    const nachgereicht: Antworten = { ...antworten };
    for (const [feld, schluesselName] of Object.entries(KONTAKT_SCHLUESSEL)) {
      const wert = String(formData?.get(feld) ?? "").trim();
      if (wert) nachgereicht[schluesselName] = wert;
    }
    antworten = nachgereicht;

    const fehlt = fehlendeKontaktangaben(antworten);
    if (fehlt.length > 0) {
      return {
        error: "Bitte ergänzen Sie Ihre Kontaktdaten.",
        fieldErrors: Object.fromEntries(fehlt.map((f) => [f, "Bitte ausfüllen"])),
      };
    }
  }

  const jetzt = new Date();
  // Versand-Slot ATOMAR reservieren, bevor der Fall entsteht: Zwei Klicks
  // kurz hintereinander duerfen nicht zwei Faelle erzeugen.
  const reserviert = await prisma.selfDisclosure.updateMany({
    where: { id: bogen.id, submittedAt: null },
    data: { submittedAt: jetzt, currentStep: "zusammenfassung", answers: antworten as object },
  });
  if (reserviert.count !== 1) return { error: "Ihre Angaben wurden bereits übermittelt." };

  const caseId = formular
    ? await gebaereFall(bogen.id, antworten, formular, jetzt)
    : access.caseId;

  await audit({
    organizationId: access.organizationId,
    userId: null,
    action: formular ? "case.created" : "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { quelle: formular ? "anfrageformular" : "selbstauskunft", ereignis: "eingegangen" },
  });
}
```

Importe ergänzen: `gebaereFall`, `fehlendeKontaktangaben`, `KONTAKT_SCHLUESSEL`.

- [ ] **Schritt 5: Den Datenbanktest schreiben**

Erstelle `tests/anfrage-fallgeburt-db.test.ts` im Zuschnitt von `tests/selbstauskunft-db.test.ts` (Kopf, `RUN_DB_IT`-Schalter und `vi.hoisted`-Block von dort übernehmen). Er prüft gegen das echte Schema:

```ts
it("erzeugt genau einen Fall mit den Antworten darin", async () => {
  // Formular + Bogen anlegen, dann gebaereFall aufrufen.
  const fallId = await gebaereFall(bogen.id, antworten, formular, new Date());
  const fall = await prisma.case.findUnique({
    where: { id: fallId },
    include: { applicants: { orderBy: { position: "asc" } }, financingRequest: true },
  });
  expect(fall?.quelle).toBe("webformular");
  expect(fall?.caseNumber).toMatch(/^UP-\d{4}-\d{4,}$/);
  expect(fall?.applicants[0]?.nachname).toBe("Mustermann");
  expect(fall?.applicants[0]?.email).toBe("max@example.de");
  expect(fall?.applicants[0]?.phone).toBe("0170 1234567");
});

it("legt bei zwei Antragstellern auch den zweiten an", async () => {
  // antworten mit anzahl_antragsteller = 2 und p2.person_name.nachname
  expect(fall?.applicants).toHaveLength(2);
});

it("haengt den Bogen an den neuen Fall", async () => {
  const bogenDanach = await prisma.selfDisclosure.findUnique({ where: { id: bogen.id } });
  expect(bogenDanach?.caseId).toBe(fallId);
  expect(bogenDanach?.einwilligungFassung).toBeTruthy();
});
```

Ausführen:

```bash
npx prisma db push          # gegen die LOKALE Datenbank
RUN_DB_IT=1 npx vitest run tests/anfrage-fallgeburt-db.test.ts
```

- [ ] **Schritt 6: Alle Tests und Typprüfung**

```bash
npx vitest run
npx tsc --noEmit
```

Erwartet: alles grün, insbesondere die bestehenden Selbstauskunfts-Tests — `sendeAb` hat einen **optionalen** zweiten Parameter bekommen, alte Aufrufe bleiben gültig.

- [ ] **Schritt 7: Commit**

```bash
git add src/lib/leadformular/fallgeburt.ts src/lib/actions/self-disclosure.ts tests/anfrage-fallgeburt.test.ts tests/anfrage-fallgeburt-db.test.ts
git commit -m "feat(anfrage): der Fall entsteht beim Absenden des Bogens

Gefuellt geboren, nicht leer mit Freigabe-Eingang: Die manuelle Freigabe
schuetzt einen vorhandenen Datenstand vor Ueberschreiben – hier gibt es
keinen. Ein leerer Fall liesse Ampel, Machbarkeit und Checkliste auf einen
Klick warten, der nichts abwaegen kann.

Alles in einer Transaktion, die Nummernvergabe aussen herum: Ein halb
geborener Fall waere schlimmer als gar keiner. Der Absende-Slot wird vorher
atomar reserviert, sonst erzeugen zwei Klicks zwei Faelle."
```

---

### Task 10: Einladungsvorlage und Versand

**Dateien:**
- Ändern: `src/lib/messages/render.ts` (Platzhalter, `TemplateVarInput`, `DEFAULT_TEMPLATES`, Vorlagenliste)
- Erstellen: `src/lib/actions/anfrage-einladung.ts`
- Erstellen: `tests/anfrage-einladung.test.ts`

**Schnittstellen:**
- Nutzt: `formularDerOrganisation`, `anfrageUrl` (Aufgabe 4); `sendEmail`, `isEmailConfigured`; `buildSignature`, `getBrokerInfo`.
- Liefert: `versendeEinladung(formData: FormData): Promise<{ ok?: boolean; error?: string }>` — liest `email`, optional `name`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/anfrage-einladung.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({ requireContext: async () => ctx }));

const formularDerOrganisation = vi.fn();
vi.mock("@/lib/leadformular/service", () => ({
  formularDerOrganisation: (...a: unknown[]) => formularDerOrganisation(...a),
  anfrageUrl: (slug: string) => `https://baufidesk.de/anfrage/${slug}`,
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => true,
}));

vi.mock("@/lib/organization/broker-info", () => ({ getBrokerInfo: async () => ({}) }));
vi.mock("@/lib/db", () => ({ prisma: { messageTemplate: { findFirst: async () => null } } }));

import { versendeEinladung } from "@/lib/actions/anfrage-einladung";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [audit, formularDerOrganisation, sendEmail].forEach((m) => m.mockReset());
  formularDerOrganisation.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
  sendEmail.mockResolvedValue({ id: "mail-1" });
});

describe("versendeEinladung", () => {
  it("verschickt den Formular-Link an die Adresse", async () => {
    const res = await versendeEinladung(form({ email: "max@example.de", name: "Max" }));
    expect(res.ok).toBe(true);
    expect(sendEmail.mock.calls[0][0].to).toBe("max@example.de");
    expect(sendEmail.mock.calls[0][0].text).toContain("https://baufidesk.de/anfrage/ertel");
    expect(sendEmail.mock.calls[0][0].empfaenger).toBe("kunde");
  });

  it("schreibt die Einladung ins Pruefprotokoll", async () => {
    // Ohne Fall gaebe es sonst keine Spur: Wer fuenf Leute einlaedt und zwei
    // Antworten bekommt, wuesste nichts von den anderen drei.
    await versendeEinladung(form({ email: "max@example.de" }));
    expect(audit.mock.calls[0][0].action).toBe("anfrage.eingeladen");
    expect(audit.mock.calls[0][0].metadata.email).toBe("max@example.de");
  });

  it("weist eine unbrauchbare Adresse ab, bevor etwas passiert", async () => {
    const res = await versendeEinladung(form({ email: "keine-adresse" }));
    expect(res.error).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("verschickt nichts, wenn das Formular abgeschaltet ist", async () => {
    // Der Empfaenger liefe in ein 404 – das waere schlimmer als keine Mail.
    formularDerOrganisation.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: false });
    const res = await versendeEinladung(form({ email: "max@example.de" }));
    expect(res.error).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("meldet einen Versandfehler, statt Erfolg zu behaupten", async () => {
    sendEmail.mockRejectedValue(new Error("Resend weg"));
    const res = await versendeEinladung(form({ email: "max@example.de" }));
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeFalsy();
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/anfrage-einladung.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Vorlage und Platzhalter ergänzen**

In `src/lib/messages/render.ts`:

```ts
// in PLACEHOLDERS:
  { token: "{{anfrageLink}}", description: "Link zu Ihrem Anfrageformular" },

// in TemplateVarInput:
  anfrageLink?: string;

// in buildTemplateVars, im Rückgabeobjekt:
    anfrageLink: input.anfrageLink ?? "{{anfrageLink}}",

// in DEFAULT_TEMPLATES:
  [templateKey("selbstauskunft_einladung", "email")]: {
    subject: "Ihre Baufinanzierung – Ihre Angaben in wenigen Minuten",
    body: `{{anrede}}

vielen Dank für Ihr Interesse. Damit ich Ihnen ein passendes Angebot rechnen kann, brauche ich ein paar Angaben zu Ihrem Vorhaben.

Über diesen Link können Sie sie in Ruhe selbst eintragen – das dauert nur wenige Minuten, und Sie können jederzeit unterbrechen und später weitermachen:
{{anfrageLink}}

Bei Fragen melden Sie sich gerne jederzeit.

Viele Grüße
{{signatur}}`,
  },
```

Zusätzlich in der Liste der im Editor angebotenen Vorlagen (dort, wo heute `{ type: "erstnachforderung", channel: "email", label: … }` steht) ergänzen:

```ts
  { type: "selbstauskunft_einladung", channel: "email", label: "Einladung zum Anfrageformular (E-Mail)" },
```

- [ ] **Schritt 4: Die Versandaktion schreiben**

Erstelle `src/lib/actions/anfrage-einladung.ts`:

```ts
"use server";

import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { getBrokerInfo } from "@/lib/organization/broker-info";
import {
  buildSignature,
  buildTemplateVars,
  DEFAULT_TEMPLATES,
  renderTemplate,
  templateKey,
} from "@/lib/messages/render";
import { anfrageUrl, formularDerOrganisation } from "@/lib/leadformular/service";

/**
 * Verschickt den Link zum Anfrageformular an eine E-Mail-Adresse.
 *
 * Der schnelle Weg, wenn ein Interessent gerade am Telefon war. Es entsteht
 * dabei WEDER ein Fall NOCH ein Nachrichtenentwurf: Der Fall kommt erst,
 * wenn der Interessent den Bogen absendet. Wer das ändert, hebt den Zweck
 * des Anfrageformulars auf.
 *
 * `sendMessageByEmail` ist hier nicht benutzbar – es arbeitet auf
 * `GeneratedMessage`, und die hängt an einem Fall, den es noch nicht gibt.
 */
export async function versendeEinladung(
  formData: FormData
): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireContext();

  const email = String(formData.get("email") ?? "").trim();
  if (!email.includes("@") || email.length < 5) {
    return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  }
  const name = String(formData.get("name") ?? "").trim();

  const formular = await formularDerOrganisation(ctx.organizationId);
  if (!formular) return { error: "Es ist noch kein Anfrageformular eingerichtet." };
  if (!formular.aktiv) {
    // Der Empfaenger liefe in ein 404 – lieber gar keine Mail.
    return { error: "Das Anfrageformular ist abgeschaltet." };
  }
  if (!isEmailConfigured()) {
    return { error: "E-Mail-Versand ist nicht eingerichtet. Bitte den Link kopieren und selbst senden." };
  }

  const broker = await getBrokerInfo(ctx.organizationId);
  const vars = buildTemplateVars({
    kundeName: name || undefined,
    anfrageLink: anfrageUrl(formular.slug),
    signatur: buildSignature(broker),
  });
  const override = await prisma.messageTemplate.findFirst({
    where: {
      organizationId: ctx.organizationId,
      type: "selbstauskunft_einladung",
      channel: "email",
    },
    select: { subject: true, body: true },
  });
  const quelle = override ?? DEFAULT_TEMPLATES[templateKey("selbstauskunft_einladung", "email")];
  if (!quelle) return { error: "Vorlage für die Einladung fehlt." };

  try {
    await sendEmail({
      to: email,
      subject: quelle.subject ? renderTemplate(quelle.subject, vars) : "Ihre Baufinanzierung",
      text: renderTemplate(quelle.body, vars),
      empfaenger: "kunde",
    });
  } catch (e) {
    return { error: `Die Mail konnte nicht versendet werden: ${(e as Error).message}` };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "anfrage.eingeladen",
    entityType: "leadformular",
    entityId: formular.id,
    metadata: { email, name: name || null },
  });

  return { ok: true };
}
```

**Achtung:** `audit` kürzt lange Werte und schwärzt Schlüssel aus seiner Sperrliste (`src/lib/audit.ts`). `email` steht nicht darauf und bleibt lesbar — das ist hier gewollt und der Grund, warum die Karte die Adressen später anzeigen kann.

- [ ] **Schritt 5: Tests und Typprüfung**

```bash
npx vitest run tests/anfrage-einladung.test.ts tests/message-render.test.ts tests/messages.test.ts
npx tsc --noEmit
```

Erwartet: 5 neue Fälle grün; die bestehenden Vorlagentests ebenfalls (zählt einer davon die Vorlagen oder die Platzhalter, die erwartete Zahl dort mitziehen).

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/messages/render.ts src/lib/actions/anfrage-einladung.ts tests/anfrage-einladung.test.ts
git commit -m "feat(anfrage): Einladung mit dem Formular-Link verschicken

Der schnelle Weg fuer den Interessenten am Telefon. Es entsteht weder ein
Fall noch ein Entwurf – der Fall kommt erst, wenn der Bogen abgesendet wird.

Der Text ist eine bearbeitbare Vorlage, kein fest verdrahteter Satz. Jede
Einladung wandert ins Pruefprotokoll: ohne Fall gaebe es sonst keine Spur
von denen, die nicht ausfuellen."
```

---

### Task 11: Die Karte „Kunden selbst ausfüllen lassen"

**Dateien:**
- Erstellen: `src/components/anfrage/formular-karte.tsx`
- Erstellen: `src/lib/actions/anfrage-verwaltung.ts`
- Ändern: `src/app/(app)/cases/new/page.tsx`
- Ändern: `src/app/(app)/settings/page.tsx`
- Erstellen: `tests/anfrage-verwaltung.test.ts`

**Schnittstellen:**
- Nutzt: `formularDerOrganisation`, `anfrageUrl`, `slugNormalisieren`, Typ `FormularStand` (alle Aufgabe 4); `versendeEinladung` (Aufgabe 10).
- Liefert:
  - `ladeFormularStand(): Promise<FormularStand>`
  - `formularEinrichten(formData: FormData): Promise<{ error?: string }>` — liest `slug`.
  - `formularUmschalten(): Promise<void>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/anfrage-verwaltung.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireContext: async () => ({ organizationId: "org-A", userId: "user-1" }),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://baufidesk.de" }) }));

const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const auditFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadformular: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  },
}));

import { ladeFormularStand, formularEinrichten } from "@/lib/actions/anfrage-verwaltung";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [findFirst, create, update, auditFindMany].forEach((m) => m.mockReset());
  auditFindMany.mockResolvedValue([]);
});

describe("ladeFormularStand", () => {
  it("meldet 'noch keins', solange keins eingerichtet ist", async () => {
    findFirst.mockResolvedValue(null);
    await expect(ladeFormularStand()).resolves.toMatchObject({ slug: null, url: null });
  });

  it("liefert Adresse und die letzten Einladungen", async () => {
    findFirst.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
    auditFindMany.mockResolvedValue([
      { metadata: { email: "max@example.de" }, createdAt: new Date("2026-08-15T10:00:00Z") },
    ]);
    const stand = await ladeFormularStand();
    expect(stand.url).toBe("https://baufidesk.de/anfrage/ertel");
    expect(stand.einladungen[0]?.email).toBe("max@example.de");
  });
});

describe("formularEinrichten", () => {
  it("legt das Formular mit normalisiertem Slug an", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "form-1" });
    await formularEinrichten(form({ slug: "Jürgen Ertel" }));
    expect(create.mock.calls[0][0].data.slug).toBe("juergen-ertel");
    expect(create.mock.calls[0][0].data.organizationId).toBe("org-A");
  });

  it("weist einen unbrauchbaren Slug ab", async () => {
    findFirst.mockResolvedValue(null);
    const res = await formularEinrichten(form({ slug: "???" }));
    expect(res.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("meldet einen bereits vergebenen Slug verstaendlich", async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await formularEinrichten(form({ slug: "ertel" }));
    expect(res.error).toMatch(/vergeben/i);
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/anfrage-verwaltung.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Die Verwaltungsaktionen schreiben**

Erstelle `src/lib/actions/anfrage-verwaltung.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import {
  anfrageUrl,
  formularDerOrganisation,
  slugNormalisieren,
  type FormularStand,
} from "@/lib/leadformular/service";

/**
 * Alles, was die Karte anzeigt. Die Einladungen kommen aus dem
 * Prüfprotokoll: Ohne Fall gäbe es sonst keine Spur von denen, die den Link
 * bekommen, aber nie ausgefüllt haben.
 */
export async function ladeFormularStand(): Promise<FormularStand> {
  const ctx = await requireContext();
  const formular = await formularDerOrganisation(ctx.organizationId);

  const eintraege = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, action: "anfrage.eingeladen" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { metadata: true, createdAt: true },
  });
  const einladungen = eintraege.map((e) => ({
    email: String((e.metadata as { email?: string } | null)?.email ?? "—"),
    am: e.createdAt.toLocaleDateString("de-DE"),
  }));

  if (!formular) return { slug: null, aktiv: false, url: null, einladungen };
  return {
    slug: formular.slug,
    aktiv: formular.aktiv,
    url: anfrageUrl(formular.slug),
    einladungen,
  };
}

export async function formularEinrichten(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireContext();
  const slug = slugNormalisieren(String(formData.get("slug") ?? ""));
  if (!slug) return { error: "Bitte eine Adresse aus Buchstaben und Ziffern wählen." };

  const vorhanden = await formularDerOrganisation(ctx.organizationId);
  // Genau eines je Organisation: Die Oberfläche verwaltet nicht mehr, und ein
  // zweites Formular wäre ein zweiter öffentlicher Eingang, den niemand kennt.
  if (vorhanden) return { error: "Es gibt bereits ein Anfrageformular." };

  try {
    await prisma.leadformular.create({
      data: { organizationId: ctx.organizationId, brokerId: ctx.userId, slug, aktiv: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { error: "Diese Adresse ist bereits vergeben. Bitte eine andere wählen." };
    }
    throw e;
  }

  revalidatePath("/settings");
  revalidatePath("/cases/new");
  return {};
}

/** Schaltet das Formular an oder ab. Abgeschaltet antwortet der Slug mit 404. */
export async function formularUmschalten(): Promise<void> {
  const ctx = await requireContext();
  const formular = await formularDerOrganisation(ctx.organizationId);
  if (!formular) return;

  await prisma.leadformular.update({
    where: { id: formular.id },
    data: { aktiv: !formular.aktiv },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "leadformular",
    entityId: formular.id,
    metadata: { aktiv: !formular.aktiv },
  });

  revalidatePath("/settings");
  revalidatePath("/cases/new");
}
```

- [ ] **Schritt 4: Die Karte bauen**

Erstelle `src/components/anfrage/formular-karte.tsx` — eine Client-Komponente im Zuschnitt von `src/components/case/self-disclosure-manager.tsx` (vorher lesen; Kopierknopf und Badge von dort übernehmen, kein neues Gestaltungsmittel erfinden):

```tsx
"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { versendeEinladung } from "@/lib/actions/anfrage-einladung";
import { formularEinrichten, formularUmschalten } from "@/lib/actions/anfrage-verwaltung";
import type { FormularStand } from "@/lib/leadformular/service";

/**
 * Anfrageformular einrichten, Adresse kopieren, Einladung verschicken.
 *
 * Rückmeldungen werden IMMER angezeigt – auch die Fehler. Ein stiller
 * Fehlschlag ist hier besonders teuer: Der Vermittler glaubt sonst, der
 * Interessent habe seinen Link, und wartet auf eine Antwort, die nie kommt.
 */
export function FormularKarte({ stand }: { stand: FormularStand }) {
  const [meldung, setMeldung] = useState<{ ok?: boolean; text: string } | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Kunden selbst ausfüllen lassen</h3>
        {stand.slug && <Badge variant="outline">{stand.aktiv ? "aktiv" : "abgeschaltet"}</Badge>}
      </div>

      <p className="text-xs text-muted-foreground">
        Ein Link, den Interessenten selbst ausfüllen. Der Fall entsteht erst, wenn jemand
        abgesendet hat – mit allen Angaben darin.
      </p>

      {!stand.slug && (
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await formularEinrichten(fd);
              setMeldung(res.error ? { text: res.error } : { ok: true, text: "Formular eingerichtet." });
            })
          }
          className="flex items-end gap-2"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="slug" className="text-xs">Wunschadresse</Label>
            <Input id="slug" name="slug" placeholder="ertel" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>Einrichten</Button>
        </form>
      )}

      {stand.url && (
        <>
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <code className="flex-1 truncate text-xs">{stand.url}</code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
              onClick={() => {
                navigator.clipboard?.writeText(stand.url!);
                setKopiert(true);
                setTimeout(() => setKopiert(false), 1500);
              }}
            >
              {kopiert ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {kopiert ? "Kopiert" : "Kopieren"}
            </button>
          </div>

          <form
            action={(fd) =>
              startTransition(async () => {
                const res = await versendeEinladung(fd);
                setMeldung(
                  res.error ? { text: res.error } : { ok: true, text: "Einladung verschickt." }
                );
              })
            }
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="einladung-email" className="text-xs">Einladung an</Label>
              <Input id="einladung-email" name="email" type="email" placeholder="kunde@example.de" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Senden
            </Button>
          </form>

          <form action={() => startTransition(() => formularUmschalten())}>
            <Button type="submit" size="sm" variant="ghost" disabled={pending}>
              {stand.aktiv ? "Formular abschalten" : "Formular einschalten"}
            </Button>
          </form>

          <div className="space-y-1 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Zuletzt eingeladen</p>
            {stand.einladungen.length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch niemand eingeladen.</p>
            ) : (
              <ul className="space-y-0.5">
                {stand.einladungen.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3 text-xs">
                    <span className="truncate">{e.email}</span>
                    <span className="shrink-0 text-muted-foreground">{e.am}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {meldung && (
        <p className={meldung.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {meldung.text}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Schritt 5: Die Karte an beiden Orten einhängen**

In `src/app/(app)/cases/new/page.tsx` unter der Karte „Grunddaten":

```tsx
      <FormularKarte stand={await ladeFormularStand()} />
```

Der bestehende manuelle Weg bleibt **unverändert** — kein Feld, kein Pflichtfeld, keine Beschriftung daran anfassen. Den Untertitel der Seite ergänzen: „…oder lass den Kunden seine Angaben selbst eintragen."

In `src/app/(app)/settings/page.tsx` dieselbe Karte in die vorhandene Kachelspalte einhängen.

- [ ] **Schritt 6: In der laufenden Anwendung ansehen**

Entwicklungsserver starten, `/cases/new` öffnen: Formular einrichten, Adresse kopieren, im privaten Fenster öffnen, Bogen bis zum Ende ausfüllen, absenden. Prüfen: Ein Fall taucht in der Pipeline auf, trägt Name/E-Mail/Telefon, und die Prioritätsleiter sagt „Kunden anrufen". Dann in `/settings` dieselbe Karte prüfen und eine Einladung an die eigene Adresse schicken.

- [ ] **Schritt 7: Volle Testsuite, Typprüfung, Commit**

```bash
npx vitest run
npx tsc --noEmit
git add src/components/anfrage src/lib/actions/anfrage-verwaltung.ts "src/app/(app)/cases/new/page.tsx" "src/app/(app)/settings/page.tsx" tests/anfrage-verwaltung.test.ts
git commit -m "feat(anfrage): Karte zum Einrichten, Kopieren und Einladen

Eine Komponente, zwei Fundorte: bei der Fallanlage und in den Einstellungen –
gesucht wird sie an beiden Stellen. Der manuelle Weg daneben bleibt
unberuehrt.

Die Liste 'Zuletzt eingeladen' kommt aus dem Pruefprotokoll: ohne Fall gaebe
es sonst keine Spur von denen, die nicht ausfuellen."
```

---

### Task 12: Abschluss

- [ ] Volle Testsuite grün (`npx vitest run`), Datenbanktests grün (`RUN_DB_IT=1 npx vitest run tests/anfrage-fallgeburt-db.test.ts`), Typprüfung fehlerfrei (`npx tsc --noEmit`)
- [ ] Nach `main` gepusht und Deployment abgewartet
- [ ] **Von außen geprüft** (anderes Gerät oder privates Fenster, ohne Gate-Cookie): `https://baufidesk.de/anfrage/<slug>` lädt ohne Passwortabfrage, ein unbekannter Slug liefert 404
- [ ] Einmal vollständig durchgespielt: Bogen ausfüllen, absenden, Fall erscheint in der Pipeline mit Kontaktdaten
- [ ] Eine Einladung an die eigene Adresse verschickt und die Mail geprüft (Link klickbar, Signatur richtig)
- [ ] `docs/superpowers/specs/2026-08-15-anfrageformular-design.md` als umgesetzt markieren
- [ ] In `docs/GO-LIVE.md` vermerken, dass mit dem Anfrageformular eine **öffentlich schreibende** Route existiert — der Punkt zum zentralen Rate-Limit (Upstash) wiegt damit schwerer als vorher
