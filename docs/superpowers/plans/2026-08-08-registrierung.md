# Registrierung neuer Vermittler — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interessenten können sich selbst registrieren; Organisation und Zugang entstehen erst nach manueller Freigabe durch den Plattformbetreiber.

**Architecture:** Ein `SignupRequest` hält den Antrag, bis der Betreiber ihn freigibt — erst dann entstehen `Organization`, `User` (`org_admin`) und `Subscription` in einer Transaktion. Alle Magic Links (Bestätigung, Passwort-Reset, Einladung) laufen über ein einziges `AuthToken`-Modell mit Zweckbindung und genau einer Einlösefunktion. Die Logik liegt in schlanken Modulen unter `src/lib/auth/`; Seiten und Server Actions enthalten nur Validierung, Rate-Limit und Weiterleitung.

**Tech Stack:** Next.js App Router (Server Actions), Prisma + PostgreSQL (Supabase), Zod, Vitest (+ PGlite für Datenbank-Durchstiche), Resend für Mailversand, scrypt/HMAC aus `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-08-08-registrierung-design.md`

## Global Constraints

- Sprache im gesamten Code, in Kommentaren, Commit-Messages und Oberfläche: **Deutsch**. Bezeichner in bestehenden Modulen sind teils englisch — neue fachliche Funktionen deutsch benennen (`erstelleToken`, `verbraucheToken`, `gibFrei`), technische Helfer dürfen englisch bleiben.
- **Niemals Klartext-Token in der Datenbank.** Gespeichert wird ausschließlich `hashToken(token)` aus `src/lib/security/upload-token.ts`.
- **Keine Passwörter und keine Klartext-E-Mail-Adressen in Logs.** Missbrauchs-Logs nur mit IP und Ereignisname.
- **Keine Konto-Enumeration:** Registrierung, Passwort-vergessen und Bestätigung antworten identisch, unabhängig davon, ob die Adresse existiert.
- **`audit()` verlangt zwingend eine `organizationId`** — vor der Freigabe gibt es keine, dort also nur `console.warn`/`console.info` ohne personenbezogene Daten.
- Passwort-Mindestlänge: **12 Zeichen**. Keine erzwungenen Sonderzeichen.
- Token-Gültigkeiten: E-Mail-Bestätigung **48 h**, Passwort-Reset **1 h**, Einladung **7 Tage**.
- Nach jeder Task: `npm run typecheck` und `npm test` müssen grün sein.
- Datenbankänderungen laufen über `npm run db:push` (Prisma `db push`), nicht über Migrationsdateien — so macht es das Projekt durchgehend.
- Arbeitsbranch: `feature/registrierung` (existiert bereits, enthält die Spec).

---

### Task 1: Datenmodell und Enums

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain/enums.ts:521` (Liste `AUDIT_ACTIONS`)
- Test: `tests/signup-schema.test.ts` (neu)

**Interfaces:**
- Consumes: nichts (erste Task)
- Produces: Prisma-Modelle `SignupRequest`, `AuthToken`; Enums `SignupStatus`, `AuthTokenZweck`; Felder `User.platformAdmin: boolean`, `User.invitedAt: Date | null`; TypeScript-Konstanten `SIGNUP_STATUSES`, `AUTH_TOKEN_ZWECKE` und die Typen `SignupStatus`, `AuthTokenZweck` aus `@/lib/domain/enums`.

- [ ] **Step 1: Prisma-Enums und Modelle ergänzen**

In `prisma/schema.prisma` bei den übrigen Enums (nach `enum PlanTier`) einfügen:

```prisma
enum SignupStatus {
  neu
  bestaetigt
  freigegeben
  abgelehnt
}

enum AuthTokenZweck {
  email_bestaetigung
  passwort_reset
  einladung
}
```

Am Ende der Datei, in einem neuen Abschnitt:

```prisma
// ============================ REGISTRIERUNG / ZUGANG ============================

/**
 * Ein Registrierungsantrag. Organisation und Nutzer entstehen bewusst ERST bei
 * der Freigabe – so enthält `organizations` ausschliesslich echte Kunden und
 * keine abgebrochenen Anmeldungen, die jede Auswertung verfaelschen wuerden.
 */
model SignupRequest {
  id              String       @id @default(cuid())
  email           String       @unique
  passwordHash    String
  name            String
  firmenname      String
  telefon         String?
  wunschtarif     PlanTier?
  status          SignupStatus @default(neu)

  emailBestaetigtAm DateTime?

  agbVersion      String
  agbAkzeptiertAm DateTime
  agbIp           String?

  entschiedenAm   DateTime?
  entschiedenVon  String?
  ablehnungsgrund String?

  // Gesetzt bei der Freigabe – die Spur vom Antrag zum Kunden.
  organizationId  String?      @unique
  // Instanzunabhaengige Sperre gegen Mailfluten (In-Memory-Limit greift auf
  // Vercel nur pro Instanz).
  letzteMailAm    DateTime?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  tokens          AuthToken[]

  @@index([status])
  @@map("signup_requests")
}

/**
 * Magic Link fuer Zugangszwecke. Anders als bei UploadLink/SelfDisclosureLink
 * steckt die Trennung im Feld `zweck`, nicht in der Tabelle – sie ist deshalb
 * nur so verlaesslich, wie jede Pruefung den Zweck mitfiltert. Genau dafuer gibt
 * es exakt eine Einloesefunktion: verbraucheToken(token, zweck).
 */
model AuthToken {
  id              String         @id @default(cuid())
  tokenHash       String         @unique
  zweck           AuthTokenZweck
  userId          String?
  user            User?          @relation(fields: [userId], references: [id], onDelete: Cascade)
  signupRequestId String?
  signupRequest   SignupRequest? @relation(fields: [signupRequestId], references: [id], onDelete: Cascade)
  expiresAt       DateTime
  usedAt          DateTime?
  createdAt       DateTime       @default(now())

  @@index([userId])
  @@index([signupRequestId])
  @@index([expiresAt])
  @@map("auth_tokens")
}
```

- [ ] **Step 2: `User` erweitern**

In `model User` (ab `prisma/schema.prisma:311`) nach `active Boolean @default(true)` einfügen:

```prisma
  // Plattform-Ebene: darf Registrierungsantraege freigeben. Bewusst KEIN Wert im
  // UserRole-Enum – die Rollen beschreiben die Stellung innerhalb einer
  // Organisation, nicht ueber ihnen.
  platformAdmin  Boolean  @default(false)
  invitedAt      DateTime?
```

und bei den Relationen:

```prisma
  authTokens    AuthToken[]
```

- [ ] **Step 3: Prisma-Client erzeugen und Schema prüfen**

Run: `npx prisma format && npm run db:generate`
Expected: Kein Fehler; `prisma/schema.prisma` bleibt formatiert.

- [ ] **Step 4: Audit-Aktionen ergänzen**

In `src/lib/domain/enums.ts` die Liste `AUDIT_ACTIONS` nach `"auth.logout",` erweitern:

```ts
  "signup.approved",
  "signup.rejected",
  "user.invited",
  "user.invite_accepted",
  "user.password_reset",
```

Im selben File, bei den übrigen Konstanten:

```ts
/** Zustaende eines Registrierungsantrags. */
export const SIGNUP_STATUSES = ["neu", "bestaetigt", "freigegeben", "abgelehnt"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

/** Zweck eines AuthToken. Die Zweckbindung verhindert, dass z. B. ein
 *  Einladungslink als Passwort-Reset eingeloest wird. */
export const AUTH_TOKEN_ZWECKE = ["email_bestaetigung", "passwort_reset", "einladung"] as const;
export type AuthTokenZweck = (typeof AUTH_TOKEN_ZWECKE)[number];
```

- [ ] **Step 5: Test schreiben, der Schema und Enums gegeneinander prüft**

`tests/signup-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SIGNUP_STATUSES, AUTH_TOKEN_ZWECKE, AUDIT_ACTIONS } from "@/lib/domain/enums";

const schema = readFileSync("prisma/schema.prisma", "utf-8");

describe("Registrierungs-Schema", () => {
  it("kennt beide neuen Modelle", () => {
    expect(schema).toContain("model SignupRequest {");
    expect(schema).toContain("model AuthToken {");
  });

  it("haelt die TS-Konstanten deckungsgleich zu den Prisma-Enums", () => {
    for (const status of SIGNUP_STATUSES) {
      expect(schema).toMatch(new RegExp(`enum SignupStatus \\{[^}]*\\b${status}\\b`, "s"));
    }
    for (const zweck of AUTH_TOKEN_ZWECKE) {
      expect(schema).toMatch(new RegExp(`enum AuthTokenZweck \\{[^}]*\\b${zweck}\\b`, "s"));
    }
  });

  it("speichert nur den Token-Hash, nie das Klartext-Token", () => {
    const modell = schema.slice(schema.indexOf("model AuthToken {"));
    expect(modell).toContain("tokenHash");
    expect(modell.slice(0, modell.indexOf("}"))).not.toMatch(/^\s*token\s+String/m);
  });

  it("kennt die neuen Audit-Aktionen", () => {
    expect(AUDIT_ACTIONS).toContain("signup.approved");
    expect(AUDIT_ACTIONS).toContain("user.invited");
  });

  it("gibt keinem Antrag von sich aus Zugang (Default ist neu)", () => {
    const modell = schema.slice(schema.indexOf("model SignupRequest {"));
    expect(modell).toMatch(/status\s+SignupStatus\s+@default\(neu\)/);
  });
});
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run tests/signup-schema.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: Kein Fehler.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/enums.ts tests/signup-schema.test.ts
git commit -m "feat(registrierung): Datenmodell fuer Antrag und Zugangs-Token"
```

**Hinweis:** `npm run db:push` gegen die Produktionsdatenbank läuft erst in Task 10 (Abnahme), nicht hier — die PGlite-Tests erzeugen ihr Schema selbst aus `schema.prisma`.

---

### Task 2: Token-Modul mit Zweckbindung

**Files:**
- Create: `src/lib/auth/tokens.ts`
- Test: `tests/auth-token.test.ts` (neu)

**Interfaces:**
- Consumes: `hashToken`, `randomToken` aus `@/lib/security/upload-token`; `prisma` aus `@/lib/db`.
- Produces:
  - `erstelleToken(input: { zweck: AuthTokenZweck; userId?: string; signupRequestId?: string; gueltigSekunden: number }): Promise<{ token: string; id: string; expiresAt: Date }>` — Klartext-Token gibt es nur hier, einmalig.
  - `verbraucheToken(token: string, zweck: AuthTokenZweck): Promise<TokenTreffer | null>` mit `interface TokenTreffer { id: string; userId: string | null; signupRequestId: string | null }`. Null heißt immer: kein Zugang (ungültig, falscher Zweck, abgelaufen oder bereits benutzt).
  - `TOKEN_GUELTIGKEIT: Record<AuthTokenZweck, number>` (Sekunden).

- [ ] **Step 1: Failing test schreiben**

`tests/auth-token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

// Minimale In-Memory-Ablage statt echter Datenbank: dieses Modul soll ohne
// Postgres pruefbar sein. Der Durchstich gegen das echte Schema folgt in
// tests/signup-db.test.ts.
const zeilen = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/db", () => ({
  prisma: {
    authToken: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `t${zeilen.size + 1}`, usedAt: null, ...data };
        zeilen.set(row.tokenHash as string, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        zeilen.get(where.tokenHash) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        for (const row of zeilen.values()) {
          if (row.id === where.id && row.usedAt === null) {
            Object.assign(row, data);
            return { count: 1 };
          }
        }
        return { count: 0 };
      }),
    },
  },
}));

beforeEach(() => zeilen.clear());

describe("AuthToken", () => {
  it("speichert nie das Klartext-Token", async () => {
    const { erstelleToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "passwort_reset",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    for (const row of zeilen.values()) {
      expect(row.tokenHash).not.toBe(token);
    }
  });

  it("loest ein gueltiges Token genau einmal ein", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "passwort_reset",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toMatchObject({ userId: "u1" });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toBeNull();
  });

  it("weist ein Einladungstoken als Passwort-Reset ab", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "einladung",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toBeNull();
    // und bleibt fuer den richtigen Zweck weiterhin gueltig
    await expect(verbraucheToken(token, "einladung")).resolves.toMatchObject({ userId: "u1" });
  });

  it("weist abgelaufene Token ab", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "email_bestaetigung",
      signupRequestId: "s1",
      gueltigSekunden: -1,
    });
    await expect(verbraucheToken(token, "email_bestaetigung")).resolves.toBeNull();
  });

  it("weist erfundene Token ab", async () => {
    const { verbraucheToken } = await import("@/lib/auth/tokens");
    await expect(verbraucheToken("frei-erfunden", "einladung")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/auth-token.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/tokens'`

- [ ] **Step 3: Modul schreiben**

`src/lib/auth/tokens.ts`:

```ts
import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/security/upload-token";
import type { AuthTokenZweck } from "@/lib/domain/enums";

/**
 * Magic-Link-Token fuer Zugangszwecke (Bestaetigung, Passwort-Reset, Einladung).
 *
 * Alle drei Zwecke teilen sich eine Tabelle – die Trennung steckt im Feld
 * `zweck`. Damit sie so verlaesslich ist wie eine eigene Tabelle, gibt es genau
 * EINE Einloesefunktion, die den Zweck immer mitfiltert. Es darf keinen zweiten
 * Weg geben, ein AuthToken einzuloesen.
 *
 * Das Klartext-Token existiert nur im Rueckgabewert von `erstelleToken` –
 * gespeichert wird ausschliesslich sein Hash.
 */
export const TOKEN_GUELTIGKEIT: Record<AuthTokenZweck, number> = {
  email_bestaetigung: 48 * 3600,
  passwort_reset: 3600,
  einladung: 7 * 24 * 3600,
};

export interface ErstellterToken {
  id: string;
  /** Klartext – nur hier verfuegbar, niemals erneut abrufbar. */
  token: string;
  expiresAt: Date;
}

export async function erstelleToken(input: {
  zweck: AuthTokenZweck;
  userId?: string;
  signupRequestId?: string;
  gueltigSekunden: number;
}): Promise<ErstellterToken> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + input.gueltigSekunden * 1000);
  const row = await prisma.authToken.create({
    data: {
      tokenHash: hashToken(token),
      zweck: input.zweck,
      userId: input.userId ?? null,
      signupRequestId: input.signupRequestId ?? null,
      expiresAt,
    },
  });
  return { id: row.id, token, expiresAt };
}

export interface TokenTreffer {
  id: string;
  userId: string | null;
  signupRequestId: string | null;
}

/**
 * Prueft Zweck, Ablauf und Einmaligkeit und markiert das Token als verbraucht.
 * Null heisst immer dasselbe: kein Zugang. Der Aufrufer erfaehrt bewusst nicht,
 * woran es lag.
 */
export async function verbraucheToken(
  token: string,
  zweck: AuthTokenZweck
): Promise<TokenTreffer | null> {
  if (!token) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return null;
  // Zweckbindung: ein Einladungslink darf niemals als Passwort-Reset gelten.
  if (row.zweck !== zweck) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  // Bedingtes Update: parallele Einloesungen desselben Links duerfen nicht
  // beide durchgehen (TOCTOU) – nur wer die Zeile tatsaechlich umschreibt, gewinnt.
  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;

  return { id: row.id, userId: row.userId, signupRequestId: row.signupRequestId };
}

/** Entwertet alle offenen Token eines Zwecks (z. B. nach erfolgreichem Reset). */
export async function entwerteOffeneToken(
  zweck: AuthTokenZweck,
  ziel: { userId?: string; signupRequestId?: string }
): Promise<void> {
  await prisma.authToken.updateMany({
    where: {
      zweck,
      usedAt: null,
      ...(ziel.userId ? { userId: ziel.userId } : {}),
      ...(ziel.signupRequestId ? { signupRequestId: ziel.signupRequestId } : {}),
    },
    data: { usedAt: new Date() },
  });
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/auth-token.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/tokens.ts tests/auth-token.test.ts
git commit -m "feat(registrierung): Zugangs-Token mit Zweckbindung und Einmaligkeit"
```

---

### Task 3: Antrag anlegen und bestätigen

**Files:**
- Create: `src/lib/auth/passwort-regeln.ts`
- Create: `src/lib/auth/signup.ts`
- Test: `tests/signup.test.ts` (neu)

**Interfaces:**
- Consumes: `erstelleToken`, `verbraucheToken`, `TOKEN_GUELTIGKEIT` aus `@/lib/auth/tokens`; `hashPassword` aus `@/lib/auth/session`.
- Produces:
  - `pruefePasswort(passwort: string): { ok: true } | { ok: false; grund: string }`
  - `SIGNUP_EINGABE` (Zod-Schema) und `type SignupEingabe`
  - `erstelleAntrag(eingabe: SignupEingabe, meta: { ip: string | null }): Promise<{ status: "neu_angelegt"; requestId: string; token: string } | { status: "bereits_vergeben" }>`
  - `bestaetigeEmail(token: string): Promise<{ ok: true; email: string; firmenname: string } | { ok: false; grund: "ungueltig" | "abgelehnt" }>`
  - `AGB_VERSION: string`

- [ ] **Step 1: Failing test schreiben**

`tests/signup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

const db = { users: [] as Array<{ email: string }>, requests: [] as Array<Record<string, unknown>> };

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        db.users.find((u) => u.email === where.email) ?? null
      ),
    },
    signupRequest: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        db.requests.find((r) => r.email === where.email || r.id === where.id) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `r${db.requests.length + 1}`, ...data };
        db.requests.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.requests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

vi.mock("@/lib/auth/tokens", () => ({
  TOKEN_GUELTIGKEIT: { email_bestaetigung: 172800, passwort_reset: 3600, einladung: 604800 },
  erstelleToken: vi.fn(async () => ({ id: "t1", token: "klartext-token", expiresAt: new Date() })),
  verbraucheToken: vi.fn(async (token: string) =>
    token === "klartext-token" ? { id: "t1", userId: null, signupRequestId: "r1" } : null
  ),
  entwerteOffeneToken: vi.fn(async () => {}),
}));

const gueltig = {
  name: "Anna Beispiel",
  firmenname: "Beispiel Finanz GmbH",
  email: "anna@beispiel.de",
  passwort: "einLangesGeheimwort2026",
  agb: true,
  wunschtarif: "pro" as const,
};

beforeEach(() => {
  db.users = [];
  db.requests = [];
});

describe("Passwortregeln", () => {
  it("verlangt mindestens 12 Zeichen", async () => {
    const { pruefePasswort } = await import("@/lib/auth/passwort-regeln");
    expect(pruefePasswort("kurz123").ok).toBe(false);
    expect(pruefePasswort("einLangesGeheimwort2026").ok).toBe(true);
  });

  it("weist offensichtliche Passwoerter ab", async () => {
    const { pruefePasswort } = await import("@/lib/auth/passwort-regeln");
    expect(pruefePasswort("passwort1234").ok).toBe(false);
    expect(pruefePasswort("123456789012").ok).toBe(false);
  });
});

describe("Antrag anlegen", () => {
  it("verlangt das AGB-Haekchen", async () => {
    const { SIGNUP_EINGABE } = await import("@/lib/auth/signup");
    expect(SIGNUP_EINGABE.safeParse({ ...gueltig, agb: false }).success).toBe(false);
  });

  it("normalisiert die Adresse und legt den Antrag an", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    const res = await erstelleAntrag({ ...gueltig, email: "  Anna@Beispiel.DE " }, { ip: "1.2.3.4" });
    expect(res.status).toBe("neu_angelegt");
    expect(db.requests[0].email).toBe("anna@beispiel.de");
  });

  it("speichert das Passwort nur als Hash", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    expect(db.requests[0].passwordHash).not.toContain("einLangesGeheimwort2026");
    expect(String(db.requests[0].passwordHash).startsWith("scrypt$")).toBe(true);
  });

  it("haelt den AGB-Nachweis fest", async () => {
    const { erstelleAntrag, AGB_VERSION } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: "1.2.3.4" });
    expect(db.requests[0].agbVersion).toBe(AGB_VERSION);
    expect(db.requests[0].agbAkzeptiertAm).toBeInstanceOf(Date);
    expect(db.requests[0].agbIp).toBe("1.2.3.4");
  });

  it("verraet nicht, dass eine Adresse schon vergeben ist", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    db.users.push({ email: "anna@beispiel.de" });
    const res = await erstelleAntrag(gueltig, { ip: null });
    // Eigener Rueckgabewert fuer die Mailwahl – die Server Action macht daraus
    // nach aussen dieselbe Antwort wie bei Erfolg.
    expect(res.status).toBe("bereits_vergeben");
    expect(db.requests).toHaveLength(0);
  });

  it("bremst schnelle Wiederholungen auf dieselbe Adresse", async () => {
    const { erstelleAntrag } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    // Zweiter Anlauf unmittelbar danach: der Antrag steht schon auf "neu",
    // die letzte Mail ist Sekunden alt.
    const zweiter = await erstelleAntrag(gueltig, { ip: null });
    expect(zweiter.status).toBe("zu_haeufig");
    expect(db.requests).toHaveLength(1);
  });
});

describe("E-Mail bestaetigen", () => {
  it("setzt den Antrag auf bestaetigt", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    const res = await bestaetigeEmail("klartext-token");
    expect(res).toMatchObject({ ok: true, firmenname: "Beispiel Finanz GmbH" });
    expect(db.requests[0].status).toBe("bestaetigt");
    expect(db.requests[0].emailBestaetigtAm).toBeInstanceOf(Date);
  });

  it("weist ein falsches Token ab", async () => {
    const { bestaetigeEmail } = await import("@/lib/auth/signup");
    await expect(bestaetigeEmail("falsch")).resolves.toMatchObject({ ok: false, grund: "ungueltig" });
  });

  it("bestaetigt einen abgelehnten Antrag nicht nachtraeglich", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    await erstelleAntrag(gueltig, { ip: null });
    db.requests[0].status = "abgelehnt";
    await expect(bestaetigeEmail("klartext-token")).resolves.toMatchObject({ ok: false, grund: "abgelehnt" });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/signup.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/passwort-regeln'`

- [ ] **Step 3: Passwortregeln schreiben**

`src/lib/auth/passwort-regeln.ts`:

```ts
/**
 * Passwortregeln fuer selbst gesetzte Passwoerter.
 *
 * Bewusst nur Laenge plus eine kurze Sperrliste: erzwungene Sonderzeichen
 * erzeugen erfahrungsgemaess "Sommer2026!" und sonst nichts. Laenge schuetzt
 * messbar besser als Zeichenklassen.
 */
const MIN_LAENGE = 12;

const GESPERRT = [
  "passwort",
  "password",
  "baufidesk",
  "qwertz",
  "qwerty",
  "123456",
  "111111",
  "iloveyou",
  "willkommen",
  "sommer",
  "winter",
];

export function pruefePasswort(passwort: string): { ok: true } | { ok: false; grund: string } {
  if (passwort.length < MIN_LAENGE) {
    return { ok: false, grund: `Das Passwort muss mindestens ${MIN_LAENGE} Zeichen lang sein.` };
  }
  const klein = passwort.toLowerCase();
  if (GESPERRT.some((wort) => klein.includes(wort))) {
    return { ok: false, grund: "Bitte wählen Sie ein weniger naheliegendes Passwort." };
  }
  // Reine Wiederholungen ("abcabcabcabc") oder eine einzige Ziffernfolge.
  if (/^(\d)+$/.test(passwort) || /^(.{1,3})\1+$/.test(passwort)) {
    return { ok: false, grund: "Bitte wählen Sie ein weniger naheliegendes Passwort." };
  }
  return { ok: true };
}

export const PASSWORT_HINWEIS = `Mindestens ${MIN_LAENGE} Zeichen. Eine gut merkbare Wortfolge ist sicherer als ein kurzes Kryptogramm.`;
```

- [ ] **Step 4: Antragsmodul schreiben**

`src/lib/auth/signup.ts`:

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/session";
import { erstelleToken, verbraucheToken, TOKEN_GUELTIGKEIT } from "@/lib/auth/tokens";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { PLAN_TIERS } from "@/lib/domain/enums";

/**
 * Registrierungsantraege. Organisation und Nutzer entstehen bewusst erst bei der
 * Freigabe (siehe gibFrei in freigabe.ts) – hier wird nur der Antrag gefuehrt.
 *
 * Kein audit() in diesem Modul: das Audit-Log verlangt zwingend eine
 * organizationId, die es vor der Freigabe nicht gibt.
 */

/** Fassung der AGB/Datenschutzerklaerung, der zugestimmt wurde. Bei jeder
 *  inhaltlichen Aenderung hochzaehlen – der Nachweis haengt daran. */
export const AGB_VERSION = "2026-08";

export const SIGNUP_EINGABE = z.object({
  name: z.string().trim().min(2, "Bitte Ihren Namen angeben."),
  firmenname: z.string().trim().min(2, "Bitte den Firmennamen angeben."),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  telefon: z.string().trim().max(40).optional().or(z.literal("")),
  passwort: z.string().superRefine((wert, ctx) => {
    const pruefung = pruefePasswort(wert);
    if (!pruefung.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: pruefung.grund });
  }),
  wunschtarif: z.enum(PLAN_TIERS).optional(),
  agb: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätigen Sie AGB und Datenschutzerklärung." }),
  }),
});

export type SignupEingabe = z.infer<typeof SIGNUP_EINGABE>;

export type AntragErgebnis =
  | { status: "neu_angelegt"; requestId: string; token: string }
  | { status: "bereits_vergeben" }
  | { status: "zu_haeufig" };

/** Mindestabstand zwischen zwei Mails an dieselbe Adresse. Diese Sperre steht in
 *  der Datenbank, weil das In-Memory-Rate-Limit auf Vercel nur pro Instanz
 *  greift und ein zweiter Serverprozess sonst munter weiter verschickt. */
const MAIL_ABSTAND_MS = 5 * 60 * 1000;

/**
 * Legt einen Antrag an – oder meldet, dass die Adresse belegt ist.
 *
 * Der Unterschied ist NUR fuer die Wahl der Mail gedacht. Nach aussen muss die
 * aufrufende Server Action in beiden Faellen dieselbe Antwort geben, sonst wird
 * das Formular zum Kontopruefer.
 */
export async function erstelleAntrag(
  eingabe: SignupEingabe,
  meta: { ip: string | null }
): Promise<AntragErgebnis> {
  const email = eingabe.email.trim().toLowerCase();

  const [nutzer, vorhanden] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.signupRequest.findUnique({ where: { email } }),
  ]);
  // Ein abgelehnter oder abgelaufener Antrag darf einen neuen Anlauf nicht
  // dauerhaft blockieren – der alte wird dann ueberschrieben.
  const blockiert =
    nutzer ||
    (vorhanden && (vorhanden.status === "neu" || vorhanden.status === "bestaetigt" || vorhanden.status === "freigegeben"));
  if (blockiert) {
    // Wiederholte Versuche auf dieselbe Adresse duerfen keine Mailflut ausloesen.
    if (vorhanden?.letzteMailAm && Date.now() - vorhanden.letzteMailAm.getTime() < MAIL_ABSTAND_MS) {
      return { status: "zu_haeufig" };
    }
    if (vorhanden) {
      await prisma.signupRequest.update({
        where: { id: vorhanden.id },
        data: { letzteMailAm: new Date() },
      });
    }
    return { status: "bereits_vergeben" };
  }

  const daten = {
    email,
    passwordHash: hashPassword(eingabe.passwort),
    name: eingabe.name.trim(),
    firmenname: eingabe.firmenname.trim(),
    telefon: eingabe.telefon?.trim() || null,
    wunschtarif: eingabe.wunschtarif ?? null,
    status: "neu" as const,
    agbVersion: AGB_VERSION,
    agbAkzeptiertAm: new Date(),
    agbIp: meta.ip,
    letzteMailAm: new Date(),
  };

  const antrag = vorhanden
    ? await prisma.signupRequest.update({ where: { id: vorhanden.id }, data: daten })
    : await prisma.signupRequest.create({ data: daten });

  const { token } = await erstelleToken({
    zweck: "email_bestaetigung",
    signupRequestId: antrag.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.email_bestaetigung,
  });

  return { status: "neu_angelegt", requestId: antrag.id, token };
}

export type BestaetigungErgebnis =
  | { ok: true; email: string; firmenname: string }
  | { ok: false; grund: "ungueltig" | "abgelehnt" };

export async function bestaetigeEmail(token: string): Promise<BestaetigungErgebnis> {
  const treffer = await verbraucheToken(token, "email_bestaetigung");
  if (!treffer?.signupRequestId) return { ok: false, grund: "ungueltig" };

  const antrag = await prisma.signupRequest.findUnique({ where: { id: treffer.signupRequestId } });
  if (!antrag) return { ok: false, grund: "ungueltig" };
  if (antrag.status === "abgelehnt") return { ok: false, grund: "abgelehnt" };
  // Schon bestaetigt oder bereits freigegeben: nicht zurueckdrehen.
  if (antrag.status !== "neu") {
    return { ok: true, email: antrag.email, firmenname: antrag.firmenname };
  }

  await prisma.signupRequest.update({
    where: { id: antrag.id },
    data: { status: "bestaetigt", emailBestaetigtAm: new Date() },
  });

  return { ok: true, email: antrag.email, firmenname: antrag.firmenname };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/signup.test.ts`
Expected: PASS (10 Tests)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: Kein Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/passwort-regeln.ts src/lib/auth/signup.ts tests/signup.test.ts
git commit -m "feat(registrierung): Antrag anlegen und E-Mail bestaetigen"
```

---

### Task 4: Mailtexte

**Files:**
- Create: `src/lib/email/auth-mails.ts`
- Test: `tests/auth-mails.test.ts` (neu)

**Interfaces:**
- Consumes: nichts (reine Funktionen, kein Netzwerk, keine Datenbank — wie `src/lib/email/notifications.ts`).
- Produces: sechs Funktionen, jede liefert `{ subject: string; text: string }`:
  - `mailBestaetigung(input: { name: string; url: string })`
  - `mailAdresseVergeben(input: { loginUrl: string; resetUrl: string })`
  - `mailAntragWartet(input: { firmenname: string; name: string; email: string; wunschtarif: string | null; adminUrl: string })`
  - `mailWillkommen(input: { name: string; organisation: string; tarif: string; testEndeAm: Date | null; loginUrl: string })`
  - `mailPasswortReset(input: { url: string })`
  - `mailEinladung(input: { einladenderName: string; organisation: string; url: string })`

- [ ] **Step 1: Failing test schreiben**

`tests/auth-mails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mailBestaetigung,
  mailAdresseVergeben,
  mailAntragWartet,
  mailWillkommen,
  mailPasswortReset,
  mailEinladung,
} from "@/lib/email/auth-mails";

describe("Zugangs-Mails", () => {
  it("nennt in der Bestaetigungsmail den Link und die Frist", () => {
    const mail = mailBestaetigung({ name: "Anna", url: "https://baufidesk.de/registrieren/bestaetigen/abc" });
    expect(mail.subject).toContain("BaufiDesk");
    expect(mail.text).toContain("https://baufidesk.de/registrieren/bestaetigen/abc");
    expect(mail.text).toContain("48 Stunden");
  });

  it("sagt in der Bestaetigungsmail ehrlich, dass von Hand geprueft wird", () => {
    const mail = mailBestaetigung({ name: "Anna", url: "https://x/y" });
    expect(mail.text.toLowerCase()).toContain("geprüft");
  });

  it("verraet in der Vergeben-Mail kein Konto-Detail", () => {
    const mail = mailAdresseVergeben({ loginUrl: "https://x/login", resetUrl: "https://x/passwort-vergessen" });
    expect(mail.text).toContain("https://x/login");
    expect(mail.text).not.toMatch(/name|firma/i);
  });

  it("fasst dem Betreiber den wartenden Antrag zusammen", () => {
    const mail = mailAntragWartet({
      firmenname: "Beispiel Finanz",
      name: "Anna Beispiel",
      email: "anna@beispiel.de",
      wunschtarif: "Pro",
      adminUrl: "https://x/admin/anmeldungen",
    });
    expect(mail.text).toContain("Beispiel Finanz");
    expect(mail.text).toContain("Pro");
    expect(mail.text).toContain("https://x/admin/anmeldungen");
  });

  it("nennt in der Willkommensmail Tarif und Testende", () => {
    const mail = mailWillkommen({
      name: "Anna",
      organisation: "Beispiel Finanz",
      tarif: "Pro",
      testEndeAm: new Date("2026-09-07T00:00:00Z"),
      loginUrl: "https://x/login",
    });
    expect(mail.text).toContain("Pro");
    expect(mail.text).toContain("07.09.2026");
  });

  it("kommt in der Willkommensmail auch ohne Testende aus", () => {
    const mail = mailWillkommen({
      name: "Anna",
      organisation: "Beispiel Finanz",
      tarif: "Pro",
      testEndeAm: null,
      loginUrl: "https://x/login",
    });
    expect(mail.text).not.toContain("null");
    expect(mail.text).not.toContain("Invalid");
  });

  it("nennt beim Passwort-Reset die kurze Frist", () => {
    const mail = mailPasswortReset({ url: "https://x/passwort-neu/abc" });
    expect(mail.text).toContain("1 Stunde");
    expect(mail.text.toLowerCase()).toContain("ignorieren");
  });

  it("nennt in der Einladung, wer einlaedt", () => {
    const mail = mailEinladung({
      einladenderName: "Jürgen Ertel",
      organisation: "Beispiel Finanz",
      url: "https://x/einladung/abc",
    });
    expect(mail.text).toContain("Jürgen Ertel");
    expect(mail.text).toContain("7 Tage");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/auth-mails.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email/auth-mails'`

- [ ] **Step 3: Mailtexte schreiben**

`src/lib/email/auth-mails.ts`:

```ts
/**
 * Reine Textbausteine fuer die Zugangs-Mails (ohne Netzwerk/DB, damit sie
 * isoliert pruefbar sind – gleiches Muster wie notifications.ts). Der Versand
 * laeuft ueber resend.ts.
 */

function datum(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const GRUSS = "Viele Grüße\nIhr BaufiDesk-Team";

export function mailBestaetigung(input: { name: string; url: string }): { subject: string; text: string } {
  return {
    subject: "BaufiDesk – bitte bestätigen Sie Ihre E-Mail-Adresse",
    text:
      `Hallo ${input.name},\n\n` +
      `vielen Dank für Ihr Interesse an BaufiDesk. Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 48 Stunden gültig.\n\n` +
      `Danach wird Ihre Anmeldung von uns von Hand geprüft und freigeschaltet – Sie bekommen ` +
      `dazu eine weitere E-Mail. Wenn Sie sich nicht angemeldet haben, ignorieren Sie diese Nachricht einfach.\n\n` +
      GRUSS,
  };
}

export function mailAdresseVergeben(input: { loginUrl: string; resetUrl: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: "BaufiDesk – Zugang bereits vorhanden",
    text:
      `Hallo,\n\n` +
      `für diese E-Mail-Adresse besteht bereits ein Zugang zu BaufiDesk. Eine neue Anmeldung ist ` +
      `deshalb nicht nötig.\n\n` +
      `Anmelden: ${input.loginUrl}\n` +
      `Passwort vergessen: ${input.resetUrl}\n\n` +
      `Wenn Sie das nicht waren, können Sie diese Nachricht ignorieren.\n\n` +
      GRUSS,
  };
}

export function mailAntragWartet(input: {
  firmenname: string;
  name: string;
  email: string;
  wunschtarif: string | null;
  adminUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Neue Anmeldung: ${input.firmenname}`,
    text:
      `Eine bestätigte Anmeldung wartet auf Freigabe.\n\n` +
      `Firma:       ${input.firmenname}\n` +
      `Name:        ${input.name}\n` +
      `E-Mail:      ${input.email}\n` +
      `Wunschtarif: ${input.wunschtarif ?? "keine Angabe"}\n\n` +
      `Prüfen und freigeben: ${input.adminUrl}`,
  };
}

export function mailWillkommen(input: {
  name: string;
  organisation: string;
  tarif: string;
  testEndeAm: Date | null;
  loginUrl: string;
}): { subject: string; text: string } {
  const frist = input.testEndeAm
    ? `Ihr Testzeitraum läuft bis zum ${datum(input.testEndeAm)}.\n\n`
    : "";
  return {
    subject: "BaufiDesk – Ihr Zugang ist freigeschaltet",
    text:
      `Hallo ${input.name},\n\n` +
      `Ihr Zugang für ${input.organisation} ist freigeschaltet. Sie können sich ab sofort mit Ihrer ` +
      `E-Mail-Adresse und dem bei der Anmeldung gewählten Passwort anmelden:\n\n` +
      `${input.loginUrl}\n\n` +
      `Tarif: ${input.tarif}\n` +
      frist +
      `Bei Fragen antworten Sie einfach auf diese E-Mail.\n\n` +
      GRUSS,
  };
}

export function mailPasswortReset(input: { url: string }): { subject: string; text: string } {
  return {
    subject: "BaufiDesk – neues Passwort setzen",
    text:
      `Hallo,\n\n` +
      `über diesen Link setzen Sie ein neues Passwort:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 1 Stunde gültig und lässt sich nur einmal verwenden. Wenn Sie kein neues ` +
      `Passwort angefordert haben, können Sie diese Nachricht ignorieren – Ihr bisheriges Passwort ` +
      `bleibt dann unverändert gültig.\n\n` +
      GRUSS,
  };
}

export function mailEinladung(input: {
  einladenderName: string;
  organisation: string;
  url: string;
}): { subject: string; text: string } {
  return {
    subject: `Einladung zu BaufiDesk – ${input.organisation}`,
    text:
      `Hallo,\n\n` +
      `${input.einladenderName} hat Sie zu BaufiDesk eingeladen (${input.organisation}). ` +
      `Über diesen Link vergeben Sie Ihr Passwort und schließen die Einrichtung ab:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 7 Tage gültig.\n\n` +
      GRUSS,
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/auth-mails.test.ts`
Expected: PASS (8 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/auth-mails.ts tests/auth-mails.test.ts
git commit -m "feat(registrierung): Textbausteine fuer die Zugangs-Mails"
```

---

### Task 5: Registrierungsstrecke (Server Action, Seiten, Middleware)

> **Nachtrag nach der Abschlusspruefung (2026-08-08):** Die unten gezeigten Codebloecke enthalten `export function istRegistrierungMoeglich(): boolean` in der `"use server"`-Datei `src/lib/actions/registrierung.ts`. Das bricht den Next.js-Build ("Server Actions must be async functions") — typecheck und Tests melden nichts. Die Funktion ist ersatzlos entfallen: `src/app/registrieren/page.tsx` ruft `isEmailConfigured()` aus `@/lib/email/resend` direkt auf, `registriere` prueft dasselbe weiterhin selbst. Massgeblich ist der Code, nicht dieser Block.
>
> Ebenfalls ueberholt: `src/app/registrieren/bestaetigen/[token]/page.tsx` verbraucht das Token nicht mehr beim Rendern (Link-Scanner in Firmen-Mailservern entwerteten es sonst vor dem ersten menschlichen Klick), sondern schlaegt es nur lesend nach (`liesBestaetigung`) und zeigt einen Bestaetigen-Knopf.

**Files:**
- Create: `src/lib/actions/registrierung.ts`
- Create: `src/app/registrieren/page.tsx`
- Create: `src/app/registrieren/danke/page.tsx`
- Create: `src/app/registrieren/bestaetigen/[token]/page.tsx`
- Create: `src/components/auth/registrierung-form.tsx`
- Create: `src/app/agb/page.tsx`
- Create: `src/app/datenschutz/page.tsx`
- Modify: `src/middleware.ts:19-26` (Liste `PUBLIC_PREFIXES`)
- Modify: `src/app/login/page.tsx` (Links auf Registrierung und Passwort-vergessen)
- Test: `tests/registrierung-action.test.ts` (neu)

**Interfaces:**
- Consumes: `erstelleAntrag`, `bestaetigeEmail`, `SIGNUP_EINGABE` aus `@/lib/auth/signup`; `mailBestaetigung`, `mailAdresseVergeben`, `mailAntragWartet` aus `@/lib/email/auth-mails`; `sendEmail`, `isEmailConfigured` aus `@/lib/email/resend`; `checkRateLimit` aus `@/lib/auth/rate-limit`.
- Produces: `registriere(_prev: RegistrierungState, formData: FormData): Promise<RegistrierungState>` mit `interface RegistrierungState { error?: string; feldFehler?: Record<string, string> }`; `istRegistrierungMoeglich(): boolean`.

- [ ] **Step 1: Failing test schreiben**

`tests/registrierung-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gesendet: Array<{ to: string; subject: string }> = [];

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    APP_BASE_URL: "https://baufidesk.de",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "BaufiDesk <noreply@baufidesk.de>",
    PLATFORM_ADMIN_EMAIL: "juergen.ertel@gmx.de",
  }),
}));
vi.mock("@/lib/email/resend", () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async (input: { to: string; subject: string }) => {
    gesendet.push(input);
    return { id: "m1" };
  }),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true, remaining: 9, retryAfterSec: 0 })),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-real-ip", "1.2.3.4"]]),
}));

const erstelleAntrag = vi.fn();
vi.mock("@/lib/auth/signup", async (orig) => {
  const echt = await (orig() as Promise<Record<string, unknown>>);
  return { ...echt, erstelleAntrag };
});

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

const eingabe = {
  name: "Anna Beispiel",
  firmenname: "Beispiel Finanz GmbH",
  email: "anna@beispiel.de",
  passwort: "einSicheresLangesWort2026",
  wunschtarif: "pro",
  agb: "on",
};

beforeEach(() => {
  gesendet.length = 0;
  erstelleAntrag.mockReset();
});

describe("Registrierungs-Action", () => {
  it("verschickt Bestaetigungs- und Betreibermail bei einem neuen Antrag", async () => {
    erstelleAntrag.mockResolvedValue({ status: "neu_angelegt", requestId: "r1", token: "tok" });
    const { registriere } = await import("@/lib/actions/registrierung");
    await expect(registriere({}, form(eingabe))).resolves.toMatchObject({ ok: true });
    expect(gesendet.map((m) => m.to)).toContain("anna@beispiel.de");
    expect(gesendet).toHaveLength(1); // Betreibermail erst nach der Bestaetigung
  });

  it("antwortet bei vergebener Adresse genauso wie bei Erfolg", async () => {
    erstelleAntrag.mockResolvedValue({ status: "bereits_vergeben" });
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form(eingabe));
    expect(antwort).toMatchObject({ ok: true });
    // aber eine ANDERE Mail
    expect(gesendet[0]?.subject).toContain("bereits");
  });

  it("meldet Feldfehler ohne Mailversand", async () => {
    const { registriere } = await import("@/lib/actions/registrierung");
    const antwort = await registriere({}, form({ ...eingabe, passwort: "kurz" }));
    expect(antwort.feldFehler?.passwort).toBeTruthy();
    expect(gesendet).toHaveLength(0);
    expect(erstelleAntrag).not.toHaveBeenCalled();
  });

  it("verlangt das AGB-Haekchen", async () => {
    const { registriere } = await import("@/lib/actions/registrierung");
    const ohneHaken = { ...eingabe };
    delete (ohneHaken as Record<string, string>).agb;
    const antwort = await registriere({}, form(ohneHaken));
    expect(antwort.feldFehler?.agb).toBeTruthy();
    expect(erstelleAntrag).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/registrierung-action.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/registrierung'`

- [ ] **Step 3: Env um die Betreiberadresse ergänzen**

In `src/lib/env.ts` im Schema nach `EMAIL_FROM`:

```ts
  // Empfaenger der Benachrichtigung "neue Anmeldung wartet". Ohne den Wert
  // unterbleibt nur diese Mail – die Antraege stehen trotzdem in /admin/anmeldungen.
  PLATFORM_ADMIN_EMAIL: z.string().optional(),
```

- [ ] **Step 4: Server Action schreiben**

`src/lib/actions/registrierung.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailAdresseVergeben, mailBestaetigung } from "@/lib/email/auth-mails";
import { SIGNUP_EINGABE, erstelleAntrag } from "@/lib/auth/signup";

/**
 * Server Action der Registrierung. Enthaelt bewusst nur Validierung,
 * Rate-Limit, Mailwahl und Weiterleitung – die Fachlogik steht in
 * lib/auth/signup.ts.
 *
 * Wichtig: Die Antwort ist bei "Adresse frei" und "Adresse vergeben"
 * IDENTISCH. Unterschiedlich ist nur, welche Mail rausgeht. Sonst wird das
 * Formular zum Kontopruefer.
 */
export interface RegistrierungState {
  ok?: boolean;
  error?: string;
  feldFehler?: Record<string, string>;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function basis(): string {
  return getEnv().APP_BASE_URL.replace(/\/$/, "");
}

export function istRegistrierungMoeglich(): boolean {
  // Ohne Mailversand kaeme die Bestaetigungsmail nie an – dann lieber gar kein
  // Formular als Antraege, die niemand einloesen kann.
  return isEmailConfigured();
}

export async function registriere(
  _prev: RegistrierungState,
  formData: FormData
): Promise<RegistrierungState> {
  if (!istRegistrierungMoeglich()) {
    return { error: "Die Registrierung ist derzeit nicht verfügbar. Bitte melden Sie sich per E-Mail." };
  }

  const geparst = SIGNUP_EINGABE.safeParse({
    name: formData.get("name") ?? "",
    firmenname: formData.get("firmenname") ?? "",
    email: formData.get("email") ?? "",
    telefon: formData.get("telefon") ?? "",
    passwort: formData.get("passwort") ?? "",
    wunschtarif: formData.get("wunschtarif") || undefined,
    agb: formData.get("agb") === "on",
  });

  if (!geparst.success) {
    const feldFehler: Record<string, string> = {};
    for (const issue of geparst.error.issues) {
      const feld = String(issue.path[0] ?? "");
      if (feld && !feldFehler[feld]) feldFehler[feld] = issue.message;
    }
    return { feldFehler };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`signup:${ip}`, 5, 3600);
  if (!limit.ok) {
    return { error: `Zu viele Versuche. Bitte in ${Math.ceil(limit.retryAfterSec / 60)} Minuten erneut versuchen.` };
  }

  const ergebnis = await erstelleAntrag(geparst.data, { ip });

  // Zu schnell hintereinander: nach aussen dieselbe Antwort, aber keine Mail.
  if (ergebnis.status === "zu_haeufig") return { ok: true };

  try {
    if (ergebnis.status === "neu_angelegt") {
      const mail = mailBestaetigung({
        name: geparst.data.name,
        url: `${basis()}/registrieren/bestaetigen/${ergebnis.token}`,
      });
      await sendEmail({ to: geparst.data.email, subject: mail.subject, text: mail.text });
    } else {
      const mail = mailAdresseVergeben({
        loginUrl: `${basis()}/login`,
        resetUrl: `${basis()}/passwort-vergessen`,
      });
      await sendEmail({ to: geparst.data.email, subject: mail.subject, text: mail.text });
    }
  } catch (e) {
    // Ohne Adresse/Namen loggen – nur, dass der Versand scheiterte.
    console.error("[registrierung] Mailversand fehlgeschlagen:", e);
    return { error: "Die Bestätigungsmail konnte nicht versendet werden. Bitte später erneut versuchen." };
  }

  return { ok: true };
}

/** Getrennte Action fuer die Weiterleitung – redirect() wirft und darf deshalb
 *  nicht im try/catch des Mailversands stehen. */
export async function registriereUndWeiter(
  prev: RegistrierungState,
  formData: FormData
): Promise<RegistrierungState> {
  const res = await registriere(prev, formData);
  if (res.ok) redirect("/registrieren/danke");
  return res;
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/registrierung-action.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 6: Formular-Komponente schreiben**

`src/components/auth/registrierung-form.tsx` — Aufbau streng nach dem Vorbild `src/components/auth/login-form.tsx` (`useActionState`, `Label`/`Input`/`Button` aus `@/components/ui/*`):

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registriereUndWeiter, type RegistrierungState } from "@/lib/actions/registrierung";
import { PASSWORT_HINWEIS } from "@/lib/auth/passwort-regeln";

const TARIFE = [
  { wert: "starter", label: "Starter – 29 €/Monat" },
  { wert: "pro", label: "Pro – 79 €/Monat" },
  { wert: "team", label: "Team – 199 €/Monat" },
];

export function RegistrierungForm() {
  const [state, formAction, pending] = useActionState<RegistrierungState, FormData>(
    registriereUndWeiter,
    {}
  );
  const fehler = state.feldFehler ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Ihr Name</Label>
        <Input id="name" name="name" autoComplete="name" required />
        {fehler.name ? <p className="text-sm text-destructive">{fehler.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="firmenname">Firma</Label>
        <Input id="firmenname" name="firmenname" autoComplete="organization" required />
        {fehler.firmenname ? <p className="text-sm text-destructive">{fehler.firmenname}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {fehler.email ? <p className="text-sm text-destructive">{fehler.email}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefon">Telefon (freiwillig)</Label>
        <Input id="telefon" name="telefon" type="tel" autoComplete="tel" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="passwort">Passwort</Label>
        <Input id="passwort" name="passwort" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">{PASSWORT_HINWEIS}</p>
        {fehler.passwort ? <p className="text-sm text-destructive">{fehler.passwort}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wunschtarif">Wunschtarif (unverbindlich)</Label>
        <select
          id="wunschtarif"
          name="wunschtarif"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue="pro"
        >
          {TARIFE.map((t) => (
            <option key={t.wert} value={t.wert}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-2">
        <input id="agb" name="agb" type="checkbox" className="mt-1" />
        <Label htmlFor="agb" className="text-sm font-normal leading-snug">
          Ich habe die <Link href="/agb" className="underline">AGB</Link> und die{" "}
          <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link> gelesen und
          stimme ihnen zu.
        </Label>
      </div>
      {fehler.agb ? <p className="text-sm text-destructive">{fehler.agb}</p> : null}
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird gesendet …" : "Registrieren"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Die drei Seiten schreiben**

`src/app/registrieren/page.tsx` — Aufbau wie `src/app/login/page.tsx` (`Logo`, `Card`, `export const dynamic = "force-dynamic"`), Inhalt:

```tsx
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { RegistrierungForm } from "@/components/auth/registrierung-form";
import { istRegistrierungMoeglich } from "@/lib/actions/registrierung";

export const dynamic = "force-dynamic";

export default function RegistrierenPage() {
  const moeglich = istRegistrierungMoeglich();

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Zugang anfragen</CardTitle>
            <CardDescription>
              Jede Anmeldung wird von uns von Hand geprüft. Nach der Freigabe erhalten Sie eine
              E-Mail und können sofort loslegen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {moeglich ? (
              <RegistrierungForm />
            ) : (
              <p className="text-sm text-muted-foreground">
                Die Registrierung ist gerade nicht verfügbar. Bitte schreiben Sie uns an
                info@baufidesk.de.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-center text-xs text-muted-foreground">
              Sie haben schon einen Zugang? <Link href="/login" className="underline">Anmelden</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
```

`src/app/registrieren/danke/page.tsx` — gleiche Hülle, Text: „Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie darin Ihre Adresse — der Link ist 48 Stunden gültig. Danach prüfen wir Ihre Anmeldung von Hand und melden uns per E-Mail." Kein Hinweis darauf, ob die Adresse bekannt war.

`src/app/registrieren/bestaetigen/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { bestaetigeEmail } from "@/lib/auth/signup";
import { benachrichtigeBetreiber } from "@/lib/actions/registrierung-benachrichtigung";

export const dynamic = "force-dynamic";

export default async function BestaetigenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ergebnis = await bestaetigeEmail(token);
  if (ergebnis.ok) await benachrichtigeBetreiber(ergebnis.email, ergebnis.firmenname);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><Logo className="h-11 w-auto" /></div>
        <Card>
          <CardHeader>
            <CardTitle>{ergebnis.ok ? "Adresse bestätigt" : "Link nicht gültig"}</CardTitle>
            <CardDescription>
              {ergebnis.ok
                ? "Vielen Dank. Wir prüfen Ihre Anmeldung jetzt von Hand und melden uns per E-Mail – in der Regel innerhalb eines Werktags."
                : "Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte registrieren Sie sich erneut."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={ergebnis.ok ? "/login" : "/registrieren"} className="text-sm underline">
              {ergebnis.ok ? "Zur Anmeldung" : "Zur Registrierung"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

`src/lib/actions/registrierung-benachrichtigung.ts`:

```ts
"use server";

import { getEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailAntragWartet } from "@/lib/email/auth-mails";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { prisma } from "@/lib/db";

/** Meldet dem Betreiber, dass eine bestaetigte Anmeldung wartet. Scheitert der
 *  Versand, bleibt der Antrag trotzdem in /admin/anmeldungen sichtbar. */
export async function benachrichtigeBetreiber(email: string, firmenname: string): Promise<void> {
  const env = getEnv();
  if (!env.PLATFORM_ADMIN_EMAIL || !isEmailConfigured()) return;

  const antrag = await prisma.signupRequest.findUnique({ where: { email } });
  const tarif = antrag?.wunschtarif ? PLAN_DEFINITIONS[antrag.wunschtarif].name : null;

  const mail = mailAntragWartet({
    firmenname,
    name: antrag?.name ?? "",
    email,
    wunschtarif: tarif,
    adminUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/admin/anmeldungen`,
  });
  try {
    await sendEmail({ to: env.PLATFORM_ADMIN_EMAIL, subject: mail.subject, text: mail.text });
  } catch (e) {
    console.error("[registrierung] Betreiber-Benachrichtigung fehlgeschlagen:", e);
  }
}
```

- [ ] **Step 8: Rechtsseiten als erkennbare Platzhalter anlegen**

`src/app/agb/page.tsx` und `src/app/datenschutz/page.tsx` — je eine schlichte Textseite. Ganz oben, unübersehbar:

```tsx
<div className="rounded-md border border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
  <strong>Platzhalter – noch kein rechtsgültiger Text.</strong> Dieser Inhalt muss vor der
  Veröffentlichung durch die geprüfte Fassung ersetzt werden.
</div>
```

Darunter eine Gliederung mit den zu füllenden Abschnitten (Geltungsbereich, Vertragsgegenstand, Laufzeit und Kündigung, Preise, Haftung / bzw. Verantwortlicher, Zwecke, Auftragsverarbeiter, Speicherdauer, Betroffenenrechte). Kein erfundener Rechtstext.

- [ ] **Step 9: Middleware-Ausnahmen ergänzen**

In `src/middleware.ts` die Liste `PUBLIC_PREFIXES` erweitern und den Kommentarblock darüber ergänzen:

```ts
const PUBLIC_PREFIXES = [
  "/upload",
  "/selbstauskunft",
  "/api/cron",
  "/monitoring",
  "/gate",
  "/api/gate",
  // Magic-Link-Strecken: tragen ihr eigenes Geheimnis im Pfad. Ohne diese
  // Ausnahme scheitert jeder, der die Mail auf einem anderen Geraet oeffnet,
  // am Gate. Das Formular /registrieren bleibt bewusst HINTER dem Gate.
  "/registrieren/bestaetigen",
  "/passwort-neu",
  "/einladung",
];
```

- [ ] **Step 10: Login-Seite verlinken**

In `src/app/login/page.tsx` im `CardFooter` unter den bestehenden Text setzen:

```tsx
<p className="text-center text-xs text-muted-foreground">
  <Link href="/passwort-vergessen" className="underline">Passwort vergessen?</Link>
  {" · "}
  <Link href="/registrieren" className="underline">Zugang anfragen</Link>
</p>
```

(`import Link from "next/link";` ergänzen.)

- [ ] **Step 11: Vollständigen Testlauf und Typecheck**

Run: `npm run typecheck && npm test`
Expected: Kein Typfehler, alle Tests grün.

- [ ] **Step 12: Commit**

```bash
git add src/lib/actions/registrierung.ts src/lib/actions/registrierung-benachrichtigung.ts \
  src/components/auth/registrierung-form.tsx src/app/registrieren src/app/agb src/app/datenschutz \
  src/middleware.ts src/app/login/page.tsx src/lib/env.ts tests/registrierung-action.test.ts
git commit -m "feat(registrierung): Formular, Bestaetigungsstrecke und Rechtsseiten-Platzhalter"
```

---

### Task 6: Freigabe und Ablehnung

> **Nachtrag nach der Pruefung (2026-08-08):** Der unten gezeigte Codeblock hatte einen Fehler — der `try/catch` umschloss auch `audit()`, wodurch eine bereits committete Freigabe als `adresse_vergeben` gemeldet werden konnte. Der umgesetzte Code zieht den `catch` eng um die Transaktion, ruft `audit()` danach mit eigenem, verschluckendem `catch` auf und unterscheidet die Ursachen ueber einen zusaetzlichen Grund `"fehlgeschlagen"` (Prisma `P2002` auf `email` bleibt `adresse_vergeben`). Massgeblich ist `src/lib/auth/freigabe.ts`, nicht dieser Block.

**Files:**
- Create: `src/lib/auth/freigabe.ts`
- Test: `tests/signup-db.test.ts` (neu, PGlite)

**Interfaces:**
- Consumes: `prisma`, `audit`, `PLAN_DEFINITIONS`.
- Produces:
  - `slugAusFirmenname(firmenname: string): string`
  - `gibFrei(requestId: string, entscheidung: { tier: PlanTier; testEndeAm: Date | null; adminUserId: string }): Promise<{ ok: true; organizationId: string; userId: string } | { ok: false; grund: "nicht_gefunden" | "falscher_status" | "adresse_vergeben" }>`
  - `lehneAb(requestId: string, grund: string, adminUserId: string): Promise<boolean>`

- [ ] **Step 1: Failing test schreiben**

`tests/signup-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
    AUTH_SECRET: "test-auth-secret-1234567890",
    SESSION_TTL_HOURS: 12,
    SESSION_COOKIE_NAME: "up_session",
    AUTH_MODE: "session",
  }),
}));

/**
 * Der ganze Weg gegen das echte Schema: Antrag → Bestaetigung → Freigabe →
 * Anmeldung. Standardmaessig uebersprungen (PGlite ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts
 */
describe.runIf(RUN)("Registrierung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let adminUserId: string;

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
    prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) as never });
    g.prisma = prisma;

    // Tarife anlegen (die Freigabe braucht eine Plan-Zeile).
    for (const tier of ["starter", "pro", "team"] as const) {
      await prisma.plan.create({ data: { tier, name: tier, features: [] } });
    }
    // Betreiberkonto in einer eigenen Organisation.
    const betreiberOrg = await prisma.organization.create({
      data: { name: "Coding Brothers", slug: "coding-brothers" },
    });
    const admin = await prisma.user.create({
      data: {
        organizationId: betreiberOrg.id,
        email: "betreiber@baufidesk.de",
        name: "Betreiber",
        role: "org_admin",
        platformAdmin: true,
      },
    });
    adminUserId = admin.id;
  }, 180_000);

  it("legt bei der Freigabe Organisation, Nutzer und Abo in einem Rutsch an", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");

    const angelegt = await erstelleAntrag(
      {
        name: "Anna Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "anna@beispiel.de",
        passwort: "einLangesGeheimwort2026",
        wunschtarif: "pro",
        agb: true,
      },
      { ip: "1.2.3.4" }
    );
    expect(angelegt.status).toBe("neu_angelegt");
    if (angelegt.status !== "neu_angelegt") throw new Error("unerwartet");

    // Vor der Bestaetigung existiert KEINE Organisation.
    expect(await prisma.organization.count()).toBe(1); // nur die Betreiber-Org

    await expect(bestaetigeEmail(angelegt.token)).resolves.toMatchObject({ ok: true });

    const res = await gibFrei(angelegt.requestId, {
      tier: "pro",
      testEndeAm: new Date("2026-09-30"),
      adminUserId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh");
    const nutzer = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(nutzer.role).toBe("org_admin");
    expect(nutzer.platformAdmin).toBe(false);
    const abo = await prisma.subscription.findUnique({ where: { organizationId: res.organizationId } });
    expect(abo.status).toBe("trialing");
    const antrag = await prisma.signupRequest.findUnique({ where: { id: angelegt.requestId } });
    expect(antrag.status).toBe("freigegeben");
    expect(antrag.organizationId).toBe(res.organizationId);
  }, 60_000);

  it("uebernimmt das bei der Anmeldung gesetzte Passwort", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "einLangesGeheimwort2026")
    ).resolves.toMatchObject({ role: "org_admin" });
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "falsch")
    ).resolves.toBeNull();
  }, 60_000);

  it("haengt bei gleichem Firmennamen einen Zaehler an den Slug", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const zweiter = await erstelleAntrag(
      {
        name: "Bernd Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "bernd@beispiel.de",
        passwort: "einAnderesLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (zweiter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(zweiter.token);
    const res = await gibFrei(zweiter.requestId, { tier: "starter", testEndeAm: null, adminUserId });
    if (!res.ok) throw new Error("unerwartet");
    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh-2");
  }, 60_000);

  it("hinterlaesst keine halbe Organisation, wenn die Adresse inzwischen vergeben ist", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const dritter = await erstelleAntrag(
      {
        name: "Clara Beispiel",
        firmenname: "Clara Finanz",
        email: "clara@beispiel.de",
        passwort: "nochEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (dritter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(dritter.token);

    // Jemand legt die Adresse zwischenzeitlich als Nutzer an.
    const fremd = await prisma.organization.create({ data: { name: "Fremd", slug: "fremd" } });
    await prisma.user.create({
      data: { organizationId: fremd.id, email: "clara@beispiel.de", name: "Clara", role: "vermittler" },
    });

    const vorher = await prisma.organization.count();
    const res = await gibFrei(dritter.requestId, { tier: "pro", testEndeAm: null, adminUserId });
    expect(res).toMatchObject({ ok: false, grund: "adresse_vergeben" });
    expect(await prisma.organization.count()).toBe(vorher);
    const antrag = await prisma.signupRequest.findUnique({ where: { id: dritter.requestId } });
    expect(antrag.status).toBe("bestaetigt"); // bleibt offen, nichts verloren
  }, 60_000);

  it("trennt die Faelle der neuen Organisation von fremden", async () => {
    const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "beispiel-finanz" } } });
    const [a, b] = orgs;
    await prisma.case.create({ data: { organizationId: a.id, caseNumber: "UP-2026-8001", status: "neu" } });
    await prisma.case.create({ data: { organizationId: b.id, caseNumber: "UP-2026-8002", status: "neu" } });
    const nurA = await prisma.case.findMany({ where: { organizationId: a.id } });
    expect(nurA).toHaveLength(1);
    expect(nurA[0].caseNumber).toBe("UP-2026-8001");
  }, 60_000);

  it("gibt einen abgelehnten Antrag nicht frei", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei, lehneAb } = await import("@/lib/auth/freigabe");
    const vierter = await erstelleAntrag(
      {
        name: "Dora Beispiel",
        firmenname: "Dora Finanz",
        email: "dora@beispiel.de",
        passwort: "wiederEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (vierter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(vierter.token);
    await expect(lehneAb(vierter.requestId, "Kein Vermittler", adminUserId)).resolves.toBe(true);
    await expect(
      gibFrei(vierter.requestId, { tier: "pro", testEndeAm: null, adminUserId })
    ).resolves.toMatchObject({ ok: false, grund: "falscher_status" });
  }, 60_000);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/freigabe'`

- [ ] **Step 3: Freigabemodul schreiben**

`src/lib/auth/freigabe.ts`:

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import type { PlanTier } from "@/lib/domain/enums";

/**
 * Freigabe und Ablehnung von Registrierungsantraegen.
 *
 * Die Freigabe ist der einzige Ort, an dem eine neue Organisation entsteht.
 * Sie laeuft in EINER Transaktion – bricht ein Schritt ab, entsteht nichts:
 * ein halber Kunde (Organisation ohne Nutzer, Nutzer ohne Abo) waere im
 * restlichen Code ein Zustand, den keine Abfrage kennt.
 */
export function slugAusFirmenname(firmenname: string): string {
  const basis = firmenname
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return basis || "organisation";
}

async function freierSlug(firmenname: string): Promise<string> {
  const basis = slugAusFirmenname(firmenname);
  for (let n = 1; n < 100; n++) {
    const kandidat = n === 1 ? basis : `${basis}-${n}`;
    const belegt = await prisma.organization.findUnique({ where: { slug: kandidat } });
    if (!belegt) return kandidat;
  }
  // Praktisch unerreichbar – lieber ein haesslicher Slug als eine Endlosschleife.
  return `${basis}-${Date.now()}`;
}

export type FreigabeErgebnis =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; grund: "nicht_gefunden" | "falscher_status" | "adresse_vergeben" };

export async function gibFrei(
  requestId: string,
  entscheidung: { tier: PlanTier; testEndeAm: Date | null; adminUserId: string }
): Promise<FreigabeErgebnis> {
  const antrag = await prisma.signupRequest.findUnique({ where: { id: requestId } });
  if (!antrag) return { ok: false, grund: "nicht_gefunden" };
  if (antrag.status !== "bestaetigt") return { ok: false, grund: "falscher_status" };

  const vergeben = await prisma.user.findUnique({ where: { email: antrag.email } });
  if (vergeben) return { ok: false, grund: "adresse_vergeben" };

  const plan = await prisma.plan.findUnique({ where: { tier: entscheidung.tier } });
  if (!plan) return { ok: false, grund: "nicht_gefunden" };

  const slug = await freierSlug(antrag.firmenname);

  try {
    const { organizationId, userId } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: antrag.firmenname,
          slug,
          retentionDays: 0,
          subscription: {
            create: {
              planId: plan.id,
              status: "trialing",
              currentPeriodEnd: entscheidung.testEndeAm,
            },
          },
        },
      });
      const nutzer = await tx.user.create({
        data: {
          organizationId: org.id,
          email: antrag.email,
          name: antrag.name,
          role: "org_admin",
          passwordHash: antrag.passwordHash,
          platformAdmin: false,
        },
      });
      await tx.signupRequest.update({
        where: { id: antrag.id },
        data: {
          status: "freigegeben",
          organizationId: org.id,
          entschiedenAm: new Date(),
          entschiedenVon: entscheidung.adminUserId,
        },
      });
      return { organizationId: org.id, userId: nutzer.id };
    });

    await audit({
      organizationId,
      userId: entscheidung.adminUserId,
      action: "signup.approved",
      entityType: "organization",
      entityId: organizationId,
      metadata: { tier: entscheidung.tier, plan: PLAN_DEFINITIONS[entscheidung.tier].name },
    });

    return { ok: true, organizationId, userId };
  } catch (e) {
    // Haeufigster Fall: die Adresse wurde zwischen Pruefung und Transaktion
    // vergeben (Unique-Index). Der Antrag bleibt offen und kann erneut
    // freigegeben werden, sobald die Ursache geklaert ist.
    console.error("[freigabe] Transaktion fehlgeschlagen:", e);
    return { ok: false, grund: "adresse_vergeben" };
  }
}

export async function lehneAb(
  requestId: string,
  grund: string,
  adminUserId: string
): Promise<boolean> {
  const { count } = await prisma.signupRequest.updateMany({
    where: { id: requestId, status: "bestaetigt" },
    data: {
      status: "abgelehnt",
      ablehnungsgrund: grund.slice(0, 500),
      entschiedenAm: new Date(),
      entschiedenVon: adminUserId,
    },
  });
  // Bewusst keine Mail an den Antragsteller: eine kommentarlose Absage vom
  // Automaten ist schlechter als eine persoenliche Nachricht.
  return count === 1;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Gesamten Testlauf und Typecheck**

Run: `npm run typecheck && npm test`
Expected: Alles grün (der PGlite-Test wird ohne `RUN_DB_IT` übersprungen).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/freigabe.ts tests/signup-db.test.ts
git commit -m "feat(registrierung): Freigabe legt Organisation, Nutzer und Abo transaktional an"
```

---

### Task 7: Freigabe-Oberfläche für den Betreiber

**Files:**
- Create: `src/app/admin/anmeldungen/page.tsx`
- Create: `src/components/admin/anmeldung-karte.tsx`
- Create: `src/lib/actions/freigabe-actions.ts`
- Create: `scripts/set-platform-admin.ts`
- Create: `src/lib/auth/platform-admin.ts`
- Test: `tests/freigabe-authz.test.ts` (neu)

**Interfaces:**
- Consumes: `gibFrei`, `lehneAb` aus `@/lib/auth/freigabe`; `getCurrentContext` aus `@/lib/auth/context`.
- Produces:
  - `requirePlatformAdmin(): Promise<{ userId: string; organizationId: string }>` in `src/lib/auth/platform-admin.ts` — ruft `notFound()`, wenn der angemeldete Nutzer kein `platformAdmin` ist. Bewusst ein eigenes Modul: `context.ts` wird bei jedem Seitenaufruf geladen und ist bereits groß.
  - `freigebenAction(formData: FormData): Promise<void>` und `ablehnenAction(formData: FormData): Promise<void>`.

- [ ] **Step 1: Failing test schreiben**

`tests/freigabe-authz.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

let aktuellerNutzer: { id: string; platformAdmin: boolean } | null = null;

vi.mock("@/lib/auth/context", async (orig) => {
  const echt = (await orig()) as Record<string, unknown>;
  return {
    ...echt,
    getCurrentContext: vi.fn(async () =>
      aktuellerNutzer ? { organizationId: "o1", userId: aktuellerNutzer.id, role: "org_admin", isDemo: false } : null
    ),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () =>
        aktuellerNutzer ? { id: aktuellerNutzer.id, platformAdmin: aktuellerNutzer.platformAdmin, active: true } : null
      ),
    },
  },
}));

beforeEach(() => {
  notFound.mockClear();
});

describe("Plattform-Freigabe: Zugriff", () => {
  it("laesst einen platformAdmin durch", async () => {
    aktuellerNutzer = { id: "u1", platformAdmin: true };
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ userId: "u1" });
  });

  it("antwortet fuer einen gewoehnlichen org_admin mit 404, nicht mit 403", async () => {
    aktuellerNutzer = { id: "u2", platformAdmin: false };
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("antwortet ohne Anmeldung ebenfalls mit 404", async () => {
    aktuellerNutzer = null;
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/freigabe-authz.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/platform-admin'`

- [ ] **Step 3: Zugriffshelfer schreiben**

`src/lib/auth/platform-admin.ts` (eigenes Modul statt Erweiterung von `context.ts` — `context.ts` ist bereits groß und wird bei jedem Seitenaufruf geladen):

```ts
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";

/**
 * Zugang zur Plattform-Ebene (Freigabe von Registrierungsantraegen).
 *
 * Antwortet mit 404 statt 403: Wer nicht Betreiber ist, soll nicht einmal
 * erfahren, dass es diesen Bereich gibt. Die Pruefung gehoert in jede Server
 * Action – nicht nur ins Rendern der Seite.
 */
export interface PlatformAdminKontext {
  userId: string;
  organizationId: string;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminKontext> {
  const ctx = await getCurrentContext();
  // Demo-Kontext zaehlt ausdruecklich nicht – er haengt an keinem echten Login.
  if (!ctx || ctx.isDemo) notFound();

  const nutzer = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, platformAdmin: true, active: true },
  });
  if (!nutzer?.platformAdmin || !nutzer.active) notFound();

  return { userId: ctx.userId, organizationId: ctx.organizationId };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/freigabe-authz.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 5: Server Actions schreiben**

`src/lib/actions/freigabe-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { gibFrei, lehneAb } from "@/lib/auth/freigabe";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailWillkommen } from "@/lib/email/auth-mails";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { PLAN_TIERS, type PlanTier } from "@/lib/domain/enums";

export async function freigebenAction(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const requestId = String(formData.get("requestId") ?? "");
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  if (!requestId || !PLAN_TIERS.includes(tier)) return;

  const tageRoh = Number(formData.get("testTage") ?? 30);
  const tage = Number.isFinite(tageRoh) && tageRoh > 0 ? Math.min(tageRoh, 365) : 30;
  const testEndeAm = new Date(Date.now() + tage * 86_400_000);

  const ergebnis = await gibFrei(requestId, { tier, testEndeAm, adminUserId: admin.userId });
  if (!ergebnis.ok) {
    // Der Grund landet als Vermerk am Antrag, damit die Liste ihn anzeigen kann.
    await prisma.signupRequest.updateMany({
      where: { id: requestId },
      data: { ablehnungsgrund: `Freigabe fehlgeschlagen: ${ergebnis.grund}` },
    });
    revalidatePath("/admin/anmeldungen");
    return;
  }

  // NACH der Transaktion: scheitert der Versand, bleibt der Zugang gueltig.
  const antrag = await prisma.signupRequest.findUnique({ where: { id: requestId } });
  if (antrag && isEmailConfigured()) {
    const mail = mailWillkommen({
      name: antrag.name,
      organisation: antrag.firmenname,
      tarif: PLAN_DEFINITIONS[tier].name,
      testEndeAm,
      loginUrl: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/login`,
    });
    try {
      await sendEmail({ to: antrag.email, subject: mail.subject, text: mail.text });
    } catch (e) {
      console.error("[freigabe] Willkommensmail fehlgeschlagen:", e);
      await prisma.signupRequest.update({
        where: { id: requestId },
        data: { ablehnungsgrund: "Zugang aktiv, aber Willkommensmail nicht zustellbar." },
      });
    }
  }

  revalidatePath("/admin/anmeldungen");
}

export async function ablehnenAction(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const grund = String(formData.get("grund") ?? "").trim() || "ohne Angabe";
  if (!requestId) return;
  await lehneAb(requestId, grund, admin.userId);
  revalidatePath("/admin/anmeldungen");
}
```

- [ ] **Step 6: Seite und Karte schreiben**

`src/app/admin/anmeldungen/page.tsx`:

```tsx
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AnmeldungKarte } from "@/components/admin/anmeldung-karte";

export const dynamic = "force-dynamic";

export default async function AnmeldungenPage() {
  await requirePlatformAdmin();

  const [wartend, entschieden] = await Promise.all([
    prisma.signupRequest.findMany({ where: { status: "bestaetigt" }, orderBy: { createdAt: "asc" } }),
    prisma.signupRequest.findMany({
      where: { status: { in: ["freigegeben", "abgelehnt"] } },
      orderBy: { entschiedenAm: "desc" },
      take: 25,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Plattform"
        title="Anmeldungen"
        subtitle={`${wartend.length} ${wartend.length === 1 ? "Anmeldung wartet" : "Anmeldungen warten"} auf Freigabe.`}
      />

      {wartend.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Gerade wartet nichts. Bestätigte Anmeldungen erscheinen hier automatisch.
        </p>
      ) : (
        <div className="space-y-4">
          {wartend.map((a) => (
            <AnmeldungKarte key={a.id} antrag={{ ...a, createdAt: a.createdAt.toISOString() }} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Zuletzt entschieden</h2>
        <ul className="space-y-1 text-sm">
          {entschieden.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-24 text-muted-foreground">
                {a.status === "freigegeben" ? "freigegeben" : "abgelehnt"}
              </span>
              <span>{a.firmenname}</span>
              <span className="text-muted-foreground">{a.email}</span>
            </li>
          ))}
          {entschieden.length === 0 ? <li className="text-muted-foreground">Noch nichts.</li> : null}
        </ul>
      </div>
    </div>
  );
}
```

`src/components/admin/anmeldung-karte.tsx` — Server-Komponente mit zwei `<form action={…}>` (kein `"use client"` nötig): links die Antragsdaten (Firma, Name, E-Mail, Telefon, Wunschtarif, Eingang, `ablehnungsgrund` als Warnhinweis, falls gesetzt), rechts das Freigabeformular mit `<select name="tier">` (aus `PLAN_DEFINITIONS`, vorbelegt mit dem Wunschtarif), `<input name="testTage" type="number" defaultValue={30}>` und Knopf „Freigeben", darunter ein zweites Formular mit `<input name="grund">` und Knopf „Ablehnen". Beide Formulare enthalten `<input type="hidden" name="requestId" value={antrag.id} />`.

- [ ] **Step 7: Skript zum Setzen des Kennzeichens**

`scripts/set-platform-admin.ts`:

```ts
/**
 * Setzt (oder entfernt) das platformAdmin-Kennzeichen.
 *
 *   npx tsx scripts/set-platform-admin.ts juergen.ertel@gmx.de
 *   npx tsx scripts/set-platform-admin.ts juergen.ertel@gmx.de --aus
 *
 * Laeuft gegen die DATABASE_URL der jeweiligen Umgebung.
 */
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
const an = !process.argv.includes("--aus");

if (!email) {
  console.error("Aufruf: npx tsx scripts/set-platform-admin.ts <email> [--aus]");
  process.exit(1);
}

const prisma = new PrismaClient();

const { count } = await prisma.user.updateMany({
  where: { email },
  data: { platformAdmin: an },
});

if (count === 0) {
  console.error(`Kein Nutzer mit dieser Adresse gefunden.`);
  process.exit(2);
}
console.log(`platformAdmin=${an} gesetzt (${count} Nutzer).`);
await prisma.$disconnect();
```

- [ ] **Step 8: Typecheck und Testlauf**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/platform-admin.ts src/lib/actions/freigabe-actions.ts \
  src/app/admin src/components/admin scripts/set-platform-admin.ts tests/freigabe-authz.test.ts
git commit -m "feat(registrierung): Freigabe-Oberflaeche fuer den Plattformbetreiber"
```

---

### Task 8: Passwort vergessen

**Files:**
- Create: `src/lib/auth/passwort.ts`
- Create: `src/lib/actions/passwort-actions.ts`
- Create: `src/app/passwort-vergessen/page.tsx`
- Create: `src/app/passwort-neu/[token]/page.tsx`
- Create: `src/components/auth/passwort-vergessen-form.tsx`
- Create: `src/components/auth/passwort-neu-form.tsx`
- Test: `tests/passwort-reset.test.ts` (neu)

**Interfaces:**
- Consumes: `erstelleToken`, `verbraucheToken`, `entwerteOffeneToken`, `TOKEN_GUELTIGKEIT`; `hashPassword` aus `@/lib/auth/session`; `pruefePasswort`.
- Produces:
  - `fordereResetAn(email: string): Promise<{ token: string } | null>` — null heißt „keine Mail nötig"; der Aufrufer antwortet trotzdem immer gleich.
  - `setzeNeuesPasswort(token: string, passwort: string): Promise<{ ok: true; userId: string } | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string }>`

- [ ] **Step 1: Failing test schreiben**

`tests/passwort-reset.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

const nutzer: Array<{ id: string; email: string; active: boolean; passwordHash: string | null }> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        nutzer.find((u) => u.email === where.email || u.id === where.id) ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = nutzer.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
    },
  },
}));

const verbraucheToken = vi.fn();
vi.mock("@/lib/auth/tokens", () => ({
  TOKEN_GUELTIGKEIT: { email_bestaetigung: 172800, passwort_reset: 3600, einladung: 604800 },
  erstelleToken: vi.fn(async () => ({ id: "t1", token: "reset-token", expiresAt: new Date() })),
  verbraucheToken,
  entwerteOffeneToken: vi.fn(async () => {}),
}));

beforeEach(() => {
  nutzer.length = 0;
  nutzer.push({ id: "u1", email: "anna@beispiel.de", active: true, passwordHash: "scrypt$alt" });
  verbraucheToken.mockReset();
});

describe("Passwort zuruecksetzen", () => {
  it("liefert ein Token fuer eine bekannte Adresse", async () => {
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("anna@beispiel.de")).resolves.toMatchObject({ token: "reset-token" });
  });

  it("liefert null fuer unbekannte Adressen – ohne zu werfen", async () => {
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("niemand@beispiel.de")).resolves.toBeNull();
  });

  it("liefert null fuer deaktivierte Konten", async () => {
    nutzer[0].active = false;
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("anna@beispiel.de")).resolves.toBeNull();
  });

  it("setzt ein neues Passwort und ersetzt den alten Hash", async () => {
    verbraucheToken.mockResolvedValue({ id: "t1", userId: "u1", signupRequestId: null });
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    const res = await setzeNeuesPasswort("reset-token", "einGanzNeuesGeheimwort");
    expect(res).toMatchObject({ ok: true, userId: "u1" });
    expect(nutzer[0].passwordHash).not.toBe("scrypt$alt");
    expect(nutzer[0].passwordHash?.startsWith("scrypt$")).toBe(true);
  });

  it("weist schwache Passwoerter ab und ruehrt den Hash nicht an", async () => {
    verbraucheToken.mockResolvedValue({ id: "t1", userId: "u1", signupRequestId: null });
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    const res = await setzeNeuesPasswort("reset-token", "kurz");
    expect(res).toMatchObject({ ok: false, grund: "passwort_schwach" });
    expect(nutzer[0].passwordHash).toBe("scrypt$alt");
  });

  it("weist ein ungueltiges Token ab", async () => {
    verbraucheToken.mockResolvedValue(null);
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    await expect(setzeNeuesPasswort("falsch", "einGanzNeuesGeheimwort")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/passwort-reset.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/passwort'`

- [ ] **Step 3: Modul schreiben**

`src/lib/auth/passwort.ts`:

```ts
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/session";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { erstelleToken, verbraucheToken, entwerteOffeneToken, TOKEN_GUELTIGKEIT } from "@/lib/auth/tokens";

/**
 * Passwort zuruecksetzen.
 *
 * `fordereResetAn` gibt null zurueck, wenn keine Mail noetig ist (unbekannte
 * oder gesperrte Adresse). Der Aufrufer MUSS trotzdem immer dieselbe Antwort
 * anzeigen – sonst wird das Formular zum Kontopruefer.
 */
export async function fordereResetAn(email: string): Promise<{ token: string } | null> {
  const normalisiert = email.trim().toLowerCase();
  const nutzer = await prisma.user.findUnique({ where: { email: normalisiert } });
  if (!nutzer || !nutzer.active) return null;

  // Aeltere offene Reset-Links entwerten: es soll immer nur einer gelten.
  await entwerteOffeneToken("passwort_reset", { userId: nutzer.id });

  const { token } = await erstelleToken({
    zweck: "passwort_reset",
    userId: nutzer.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.passwort_reset,
  });
  return { token };
}

export type ResetErgebnis =
  | { ok: true; userId: string }
  | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string };

export async function setzeNeuesPasswort(token: string, passwort: string): Promise<ResetErgebnis> {
  // Passwortregeln VOR dem Einloesen pruefen waere angenehmer, verbraucht aber
  // sonst das Token bei jedem Tippfehler. Deshalb: erst pruefen, dann einloesen.
  const regel = pruefePasswort(passwort);
  if (!regel.ok) return { ok: false, grund: "passwort_schwach", text: regel.grund };

  const treffer = await verbraucheToken(token, "passwort_reset");
  if (!treffer?.userId) return { ok: false, grund: "ungueltig" };

  const nutzer = await prisma.user.findUnique({ where: { id: treffer.userId } });
  if (!nutzer || !nutzer.active) return { ok: false, grund: "ungueltig" };

  await prisma.user.update({
    where: { id: nutzer.id },
    data: { passwordHash: hashPassword(passwort) },
  });
  return { ok: true, userId: nutzer.id };
}
```

**Achtung beim Test „weist schwache Passwoerter ab":** Weil die Regelprüfung vor dem Einlösen steht, darf `verbraucheToken` in diesem Fall gar nicht aufgerufen werden — genau das prüft der Test über den unveränderten Hash.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/passwort-reset.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Server Actions schreiben**

`src/lib/actions/passwort-actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailPasswortReset } from "@/lib/email/auth-mails";
import { fordereResetAn, setzeNeuesPasswort } from "@/lib/auth/passwort";
import type { UserRole } from "@/lib/domain/enums";

export interface PasswortState {
  ok?: boolean;
  error?: string;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Fordert einen Reset-Link an. Die Antwort ist IMMER dieselbe – ob die Adresse
 *  existiert, darf das Formular nicht verraten. */
export async function resetAnfordern(
  _prev: PasswortState,
  formData: FormData
): Promise<PasswortState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  const limit = await checkRateLimit(`pwreset:${ip}`, 5, 3600);
  // Auch bei erreichtem Limit dieselbe Antwort: sonst wird das Limit selbst zum
  // Signal, dass jemand an dieser Adresse dran ist.
  if (!limit.ok || !email || !isEmailConfigured()) return { ok: true };

  const angefordert = await fordereResetAn(email);
  if (angefordert) {
    const mail = mailPasswortReset({
      url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/passwort-neu/${angefordert.token}`,
    });
    try {
      await sendEmail({ to: email, subject: mail.subject, text: mail.text });
    } catch (e) {
      console.error("[passwort] Reset-Mail fehlgeschlagen:", e);
    }
  }
  return { ok: true };
}

export async function passwortSetzen(
  _prev: PasswortState,
  formData: FormData
): Promise<PasswortState> {
  const token = String(formData.get("token") ?? "");
  const passwort = String(formData.get("passwort") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");
  if (passwort !== wiederholung) return { error: "Die beiden Passwörter stimmen nicht überein." };

  const res = await setzeNeuesPasswort(token, passwort);
  if (!res.ok) {
    return {
      error:
        res.grund === "passwort_schwach"
          ? (res.text ?? "Bitte ein längeres Passwort wählen.")
          : "Dieser Link ist abgelaufen oder wurde bereits verwendet.",
    };
  }

  const nutzer = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
  await audit({
    organizationId: nutzer.organizationId,
    userId: nutzer.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: nutzer.id,
  });

  await setSessionCookie(
    createSessionToken({
      sub: nutzer.id,
      org: nutzer.organizationId,
      role: nutzer.role as UserRole,
      name: nutzer.name,
    })
  );
  redirect("/dashboard");
}
```

- [ ] **Step 6: Seiten und Formulare schreiben**

`/passwort-vergessen` und `/passwort-neu/[token]` in derselben Hülle wie `/login` (`Logo` + `Card`). Das Formular auf `/passwort-vergessen` zeigt nach dem Absenden **immer** denselben Satz: „Wenn für diese Adresse ein Zugang besteht, haben wir Ihnen eine E-Mail geschickt. Der Link ist eine Stunde gültig." Auf `/passwort-neu/[token]` zwei Passwortfelder (neu / Wiederholung) mit `PASSWORT_HINWEIS` als Hilfetext.

- [ ] **Step 7: Typecheck und Testlauf**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/passwort.ts src/lib/actions/passwort-actions.ts \
  src/app/passwort-vergessen src/app/passwort-neu src/components/auth/passwort-*.tsx \
  tests/passwort-reset.test.ts
git commit -m "feat(registrierung): Passwort vergessen mit einmalig gueltigem Link"
```

---

### Task 9: Kollegen einladen

> **Nachtrag nach der Pruefung (2026-08-08):** Der unten gezeigte `ladeEin`-Code prueft die Rolle zuerst; zwei der Tests in diesem Task bestehen nur mit der Reihenfolge **Limit → Adresse → Rolle**. Der umgesetzte Code verwendet diese Reihenfolge — fachlich auch die bessere, weil `limit_erreicht` der alltagsrelevante Fall ist, waehrend `rolle_nicht_erlaubt` ueber die Oberflaeche gar nicht ausloesbar ist. Die Rollenpruefung steht weiterhin vor `prisma.user.create` und ist durch einen eigenen Test abgedeckt. Massgeblich ist `src/lib/auth/invite.ts`.

**Files:**
- Create: `src/lib/auth/invite.ts`
- Create: `src/lib/actions/invite-actions.ts`
- Create: `src/app/einladung/[token]/page.tsx`
- Create: `src/components/organization/einladen-form.tsx`
- Modify: `src/app/(app)/organization/page.tsx` (Einladen-Bereich unter der Team-Tabelle)
- Test: `tests/invite-db.test.ts` (neu, PGlite)

**Interfaces:**
- Consumes: `checkLimit` aus `@/lib/saas/plans`; `getOrgPlan`; `PLAN_ROLES`; `erstelleToken`, `verbraucheToken`; `hashPassword`; `audit`.
- Produces:
  - `ladeEin(input: { organizationId: string; email: string; name: string; rolle: UserRole; einladenderUserId: string }): Promise<{ ok: true; token: string; userId: string } | { ok: false; grund: "limit_erreicht" | "adresse_vergeben" | "rolle_nicht_erlaubt" }>`
  - `loeseEinladungEin(token: string, passwort: string): Promise<{ ok: true; userId: string; organizationId: string; name: string; role: UserRole } | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string }>`

- [ ] **Step 1: Failing test schreiben**

`tests/invite-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

/**
 * Einladung gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/invite-db.test.ts
 */
describe.runIf(RUN)("Einladung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;
  let chefId: string;

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
    prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) as never });
    g.prisma = prisma;

    // Starter erlaubt genau 1 Nutzer, Pro erlaubt 3 – gute Limit-Probe.
    const starter = await prisma.plan.create({ data: { tier: "starter", name: "Starter", features: [] } });
    await prisma.plan.create({ data: { tier: "pro", name: "Pro", features: [] } });
    const org = await prisma.organization.create({
      data: {
        name: "Beispiel Finanz",
        slug: "beispiel-finanz",
        subscription: { create: { planId: starter.id, status: "trialing" } },
      },
    });
    orgId = org.id;
    const chef = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Chefin",
        role: "org_admin",
        passwordHash: "scrypt$16384$abc$def",
      },
    });
    chefId = chef.id;
  }, 180_000);

  it("blockt die Einladung, wenn der Tarif nur einen Nutzer erlaubt", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "neu@beispiel.de",
        name: "Neu",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "limit_erreicht" });
    expect(await prisma.user.count({ where: { organizationId: orgId } })).toBe(1);
  }, 60_000);

  it("legt nach Tarifwechsel ein passwortloses Konto samt Token an", async () => {
    const pro = await prisma.plan.findUnique({ where: { tier: "pro" } });
    await prisma.subscription.update({ where: { organizationId: orgId }, data: { planId: pro.id } });

    const { ladeEin } = await import("@/lib/auth/invite");
    const res = await ladeEin({
      organizationId: orgId,
      email: "neu@beispiel.de",
      name: "Neu",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const eingeladen = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(eingeladen.passwordHash).toBeNull();
    expect(eingeladen.invitedAt).toBeInstanceOf(Date);
    g.__inviteToken = res.token;
  }, 60_000);

  it("laesst ein passwortloses Konto sich NICHT anmelden", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "")).resolves.toBeNull();
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "irgendwas")).resolves.toBeNull();
  }, 60_000);

  it("setzt beim Einloesen das Passwort und macht das Konto nutzbar", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    const { getAuthProvider } = await import("@/lib/auth/provider");
    const res = await loeseEinladungEin(g.__inviteToken, "einLangesTeamGeheimwort");
    expect(res).toMatchObject({ ok: true, organizationId: orgId, role: "vermittler" });
    await expect(
      getAuthProvider().authenticate("neu@beispiel.de", "einLangesTeamGeheimwort")
    ).resolves.toMatchObject({ organizationId: orgId });
  }, 60_000);

  it("laesst denselben Einladungslink kein zweites Mal zu", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    await expect(loeseEinladungEin(g.__inviteToken, "nochEinLangesGeheimwort")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  }, 60_000);

  it("weist eine bereits vergebene Adresse ab", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Doppelt",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "adresse_vergeben" });
  }, 60_000);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `RUN_DB_IT=1 npx vitest run tests/invite-db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/invite'`

- [ ] **Step 3: Modul schreiben**

`src/lib/auth/invite.ts`:

```ts
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/session";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { erstelleToken, verbraucheToken, TOKEN_GUELTIGKEIT } from "@/lib/auth/tokens";
import { checkLimit, getOrgPlan, PLAN_ROLES } from "@/lib/saas/plans";
import type { UserRole } from "@/lib/domain/enums";

/**
 * Einladung weiterer Nutzer in eine BESTEHENDE Organisation.
 *
 * Anders als bei der Registrierung entsteht hier sofort ein User – nur eben
 * ohne passwordHash. Diesen Zustand faengt der Auth-Provider bereits ab:
 * passwortlose Konten koennen sich nie per Zugangsdaten anmelden.
 */
export type EinladungErgebnis =
  | { ok: true; token: string; userId: string }
  | { ok: false; grund: "limit_erreicht" | "adresse_vergeben" | "rolle_nicht_erlaubt" };

export async function ladeEin(input: {
  organizationId: string;
  email: string;
  name: string;
  rolle: UserRole;
  einladenderUserId: string;
}): Promise<EinladungErgebnis> {
  const email = input.email.trim().toLowerCase();

  const plan = await getOrgPlan(input.organizationId);
  if (!PLAN_ROLES[plan.tier].includes(input.rolle)) return { ok: false, grund: "rolle_nicht_erlaubt" };

  const limit = await checkLimit(input.organizationId, "usersPerOrg");
  if (!limit.allowed) return { ok: false, grund: "limit_erreicht" };

  const vergeben = await prisma.user.findUnique({ where: { email } });
  if (vergeben) return { ok: false, grund: "adresse_vergeben" };

  const nutzer = await prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email,
      name: input.name.trim(),
      role: input.rolle,
      passwordHash: null,
      invitedAt: new Date(),
    },
  });

  const { token } = await erstelleToken({
    zweck: "einladung",
    userId: nutzer.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.einladung,
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.einladenderUserId,
    action: "user.invited",
    entityType: "user",
    entityId: nutzer.id,
    metadata: { rolle: input.rolle },
  });

  return { ok: true, token, userId: nutzer.id };
}

export type EinloesungErgebnis =
  | { ok: true; userId: string; organizationId: string; name: string; role: UserRole }
  | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string };

export async function loeseEinladungEin(
  token: string,
  passwort: string
): Promise<EinloesungErgebnis> {
  const regel = pruefePasswort(passwort);
  if (!regel.ok) return { ok: false, grund: "passwort_schwach", text: regel.grund };

  const treffer = await verbraucheToken(token, "einladung");
  if (!treffer?.userId) return { ok: false, grund: "ungueltig" };

  const nutzer = await prisma.user.findUnique({ where: { id: treffer.userId } });
  if (!nutzer || !nutzer.active) return { ok: false, grund: "ungueltig" };

  await prisma.user.update({
    where: { id: nutzer.id },
    data: { passwordHash: hashPassword(passwort) },
  });

  await audit({
    organizationId: nutzer.organizationId,
    userId: nutzer.id,
    action: "user.invite_accepted",
    entityType: "user",
    entityId: nutzer.id,
  });

  return {
    ok: true,
    userId: nutzer.id,
    organizationId: nutzer.organizationId,
    name: nutzer.name,
    role: nutzer.role as UserRole,
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/invite-db.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Server Action schreiben**

`src/lib/actions/invite-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { requireRole } from "@/lib/auth/context";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailEinladung } from "@/lib/email/auth-mails";
import { ladeEin, loeseEinladungEin } from "@/lib/auth/invite";
import { checkLimit } from "@/lib/saas/plans";
import { USER_ROLES, type UserRole } from "@/lib/domain/enums";

export interface EinladungState {
  ok?: boolean;
  error?: string;
}

export async function einladenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const ctx = await requireRole("org_admin");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rolle = String(formData.get("rolle") ?? "") as UserRole;
  if (!name || !email) return { error: "Bitte Name und E-Mail angeben." };
  if (!USER_ROLES.includes(rolle)) return { error: "Bitte eine Rolle wählen." };

  const res = await ladeEin({
    organizationId: ctx.organizationId,
    email,
    name,
    rolle,
    einladenderUserId: ctx.userId,
  });

  if (!res.ok) {
    if (res.grund === "limit_erreicht") {
      const limit = await checkLimit(ctx.organizationId, "usersPerOrg");
      return {
        error: `Ihr Tarif erlaubt maximal ${limit.limit} Nutzer. Für weitere Plätze bitte den Tarif wechseln.`,
      };
    }
    // Hier ist Enumeration kein Thema: der Einladende sieht ohnehin seine
    // eigene Organisation und braucht eine brauchbare Fehlermeldung.
    return {
      error:
        res.grund === "adresse_vergeben"
          ? "Diese E-Mail-Adresse wird bereits verwendet."
          : "Diese Rolle ist in Ihrem Tarif nicht verfügbar.",
    };
  }

  if (isEmailConfigured()) {
    const mail = mailEinladung({
      einladenderName: ctx.userName,
      organisation: ctx.organizationName,
      url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/einladung/${res.token}`,
    });
    try {
      await sendEmail({ to: email, subject: mail.subject, text: mail.text });
    } catch (e) {
      console.error("[einladung] Mailversand fehlgeschlagen:", e);
      return { error: "Konto angelegt, aber die Einladungsmail konnte nicht zugestellt werden." };
    }
  }

  revalidatePath("/organization");
  return { ok: true };
}

export async function einladungEinloesenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const token = String(formData.get("token") ?? "");
  const passwort = String(formData.get("passwort") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");
  if (passwort !== wiederholung) return { error: "Die beiden Passwörter stimmen nicht überein." };

  const res = await loeseEinladungEin(token, passwort);
  if (!res.ok) {
    return {
      error:
        res.grund === "passwort_schwach"
          ? (res.text ?? "Bitte ein längeres Passwort wählen.")
          : "Diese Einladung ist abgelaufen oder wurde bereits verwendet.",
    };
  }

  await setSessionCookie(
    createSessionToken({
      sub: res.userId,
      org: res.organizationId,
      role: res.role,
      name: res.name,
    })
  );
  redirect("/dashboard");
}
```

`ctx.userName` und `ctx.organizationName` stammen aus `AppContext` (`src/lib/auth/context.ts`) und sind dort bereits vorhanden.

- [ ] **Step 6: Oberfläche ergänzen**

`src/components/organization/einladen-form.tsx` (`"use client"`, `useActionState`): Felder Name, E-Mail, `<select name="rolle">` mit den Rollen aus `PLAN_ROLES[tier]` (als Prop übergeben), Knopf „Einladen".

In `src/app/(app)/organization/page.tsx` unter der Team-Tabelle eine neue `Card` „Kollegen einladen" einfügen. Sie wird nur für `ctx.role === "org_admin"` gerendert. Darüber die aktuelle Auslastung anzeigen:

```tsx
const [plan, limit] = await Promise.all([
  getOrgPlan(ctx.organizationId),
  checkLimit(ctx.organizationId, "usersPerOrg"),
]);
// …
<CardDescription>
  {limit.limit == null
    ? `Tarif ${plan.name}: unbegrenzt viele Nutzer.`
    : `Tarif ${plan.name}: ${limit.used} von ${limit.limit} Plätzen belegt.`}
</CardDescription>
```

`src/app/einladung/[token]/page.tsx`: Hülle wie `/login`, Überschrift „Einladung annehmen", darunter das Passwortformular. Das Token kommt als verstecktes Feld aus den Route-Parametern.

- [ ] **Step 7: Typecheck und Testlauf**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/invite.ts src/lib/actions/invite-actions.ts src/app/einladung \
  src/components/organization/einladen-form.tsx "src/app/(app)/organization/page.tsx" \
  tests/invite-db.test.ts
git commit -m "feat(registrierung): Kollegen einladen mit Tarif-Limit"
```

---

### Task 10: Zwei Altlasten schließen und abnehmen

**Files:**
- Modify: `src/lib/auth/context.ts:47-92` (`getCurrentContext`)
- Modify: `tests/security.test.ts` (Ergänzungen am Ende)
- Test: `tests/kontext-aktiv.test.ts` (neu)

**Interfaces:**
- Consumes: alles Vorherige.
- Produces: keine neuen Signaturen — `getCurrentContext()` behält Rückgabetyp `Promise<AppContext | null>`.

- [ ] **Step 1: Failing test schreiben**

`tests/kontext-aktiv.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const nutzer = {
  gefunden: true,
  active: true,
  organizationId: "o1",
  name: "Anna",
  role: "org_admin" as const,
};

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret-1234567890",
    AUTH_MODE: "session",
    SESSION_COOKIE_NAME: "up_session",
    SESSION_TTL_HOURS: 12,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: { findUnique: vi.fn(async () => ({ name: "Beispiel Finanz" })) },
    user: {
      findUnique: vi.fn(async () =>
        nutzer.gefunden
          ? { id: "u1", active: nutzer.active, organizationId: nutzer.organizationId, name: nutzer.name, role: nutzer.role }
          : null
      ),
      findFirst: vi.fn(async () => null),
    },
  },
}));

let cookieWert: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieWert ? { value: cookieWert } : undefined) }),
}));

beforeEach(() => {
  nutzer.gefunden = true;
  nutzer.active = true;
});

async function sessionCookieFuer(): Promise<string> {
  const { createSessionToken } = await import("@/lib/auth/session");
  return createSessionToken({ sub: "u1", org: "o1", role: "org_admin", name: "Anna" });
}

describe("Kontext aus der Session", () => {
  it("laesst einen aktiven Nutzer durch", async () => {
    cookieWert = await sessionCookieFuer();
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({ userId: "u1", organizationId: "o1" });
  });

  it("sperrt einen deaktivierten Nutzer trotz gueltigem Cookie aus", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.active = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("sperrt aus, wenn der Nutzer geloescht wurde", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.gefunden = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("nimmt Rolle und Organisation aus der DB, nicht aus dem Cookie", async () => {
    // Cookie behauptet o1/org_admin – die DB sagt o2/teammitglied. Die DB gewinnt,
    // sonst behielte ein herabgestufter Nutzer seine Rechte bis zum Ablauf.
    cookieWert = await sessionCookieFuer();
    nutzer.organizationId = "o2";
    nutzer.role = "teammitglied" as never;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({
      organizationId: "o2",
      role: "teammitglied",
    });
    nutzer.organizationId = "o1";
    nutzer.role = "org_admin";
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/kontext-aktiv.test.ts`
Expected: FAIL — der deaktivierte Nutzer kommt derzeit durch (Test 2 schlägt fehl).

- [ ] **Step 3: `getCurrentContext` nachziehen**

In `src/lib/auth/context.ts` den Session-Zweig ersetzen:

```ts
  // 1) Echte Session aus dem Cookie
  const session = verifySessionToken(await readSessionToken());
  if (session) {
    // Rolle, Organisation und Aktiv-Kennzeichen kommen aus der DATENBANK, nicht
    // aus dem Cookie: sonst behielte ein gesperrter oder herabgestufter Nutzer
    // seine Rechte bis zum Ablauf des Tokens (bis zu SESSION_TTL_HOURS).
    const nutzer = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, active: true, organizationId: true, name: true, role: true },
    });
    if (nutzer?.active) {
      const org = await prisma.organization.findUnique({
        where: { id: nutzer.organizationId },
        select: { name: true },
      });
      if (org) {
        return {
          organizationId: nutzer.organizationId,
          organizationName: org.name,
          userId: nutzer.id,
          userName: nutzer.name,
          role: nutzer.role as UserRole,
          isDemo: false,
        };
      }
    }
    // Ungueltig gewordene Session: nicht in den Demo-Zweig durchfallen lassen.
    return null;
  }
```

- [ ] **Step 4: Demo-Modus in Produktion sperren**

Im Demo-Zweig derselben Funktion:

```ts
  // 2) Demo-Fallback (nur ausserhalb der Produktion). Der Fallback nimmt den
  // ersten aktiven Nutzer ALLER Organisationen – mit mehreren Mandanten waere
  // das ein Fremdzugriff per Konfigurationsfehler. Deshalb hart gesperrt,
  // unabhaengig davon, was AUTH_MODE sagt.
  if (env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production") {
```

- [ ] **Step 5: `tests/security.test.ts` ergänzen**

Am Ende der Datei:

```ts
describe("Demo-Modus", () => {
  it("ist in Produktion nicht erreichbar", async () => {
    const quelle = readFileSync("src/lib/auth/context.ts", "utf-8");
    expect(quelle).toMatch(/AUTH_MODE === "demo" && process\.env\.NODE_ENV !== "production"/);
  });
});
```

(`import { readFileSync } from "node:fs";` oben ergänzen.)

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run tests/kontext-aktiv.test.ts tests/security.test.ts`
Expected: PASS

- [ ] **Step 7: Vollständiger Lauf inklusive Datenbank-Durchstiche**

Run: `npm run typecheck && npm test && RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts tests/invite-db.test.ts`
Expected: Alles grün. **Erst wenn dieser Lauf sauber ist, geht es weiter.**

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/context.ts tests/kontext-aktiv.test.ts tests/security.test.ts
git commit -m "fix(auth): Rolle und Aktiv-Status aus der DB statt aus dem Cookie; Demo-Modus in Prod gesperrt"
```

- [ ] **Step 9: Schema in die Produktionsdatenbank bringen**

Run: `npm run db:push`
Expected: `The database is already in sync` oder die Meldung, dass die zwei Tabellen und drei Spalten angelegt wurden. Keine Warnung über Datenverlust — alle neuen Felder sind optional oder haben Vorgabewerte. Erscheint eine solche Warnung: **abbrechen** und zurückmelden.

- [ ] **Step 10: Betreiberkonto kennzeichnen**

Run: `npx tsx scripts/set-platform-admin.ts juergen.ertel@gmx.de`
Expected: `platformAdmin=true gesetzt (1 Nutzer).`

Schlägt es mit „Kein Nutzer mit dieser Adresse gefunden" fehl, zuerst mit dem Betreiber klären, welche Adresse das Produktionskonto trägt — nicht raten.

- [ ] **Step 11: Umgebungsvariable setzen**

Run: `vercel env add PLATFORM_ADMIN_EMAIL production`
Wert: die Adresse, an die die Benachrichtigung „neue Anmeldung wartet" gehen soll.

Vorher prüfen, ob `RESEND_API_KEY` und `EMAIL_FROM` in Produktion gesetzt sind: `vercel env ls production`. Fehlt eines von beiden, blendet die App das Registrierungsformular bewusst aus — dann zuerst den Mailversand einrichten.

- [ ] **Step 12: Abnahme im Browser**

Diese Punkte von Hand prüfen (Vorschau-Deployment reicht):

1. `/registrieren` ist ohne Gate-Passwort **nicht** erreichbar (Weiterleitung auf `/gate`).
2. Mit Gate-Passwort: Formular ausfüllen → Danke-Seite → Bestätigungsmail kommt an.
3. Den Bestätigungslink in einem **anderen** Browser ohne Gate-Cookie öffnen → er funktioniert (Middleware-Ausnahme greift).
4. `/admin/anmeldungen` als gewöhnlicher Nutzer → 404. Als Betreiber → der Antrag steht da.
5. Freigeben → Willkommensmail kommt an, Anmeldung mit dem bei der Registrierung gesetzten Passwort funktioniert, das Dashboard zeigt die **neue, leere** Organisation (nicht die Seed-Daten).
6. In der neuen Organisation einen Kollegen einladen → Einladungsmail, Passwort setzen, Anmeldung.
7. Passwort vergessen für das neue Konto → Link kommt, neues Passwort funktioniert, das alte nicht mehr.

- [ ] **Step 13: Abschluss-Commit und Zusammenführen**

```bash
git add -A
git commit -m "chore(registrierung): Abnahme abgeschlossen"
```

Danach über die `superpowers:finishing-a-development-branch`-Skill entscheiden, wie `feature/registrierung` nach `main` kommt.

---

## Reihenfolge und Abhängigkeiten

```
Task 1 (Schema)
  └─ Task 2 (Token)
       ├─ Task 3 (Antrag)  ─┬─ Task 4 (Mails) ─┬─ Task 5 (Registrierungsstrecke)
       │                    │                  │
       │                    │                  └─ Task 6 (Freigabe) ─ Task 7 (Freigabe-UI)
       ├─ Task 8 (Passwort vergessen)   [braucht Task 4]
       └─ Task 9 (Einladung)            [braucht Task 4]
Task 10 (Altlasten + Abnahme)  [zuletzt, braucht alles]
```

Task 4 (Mailtexte) hat außer Task 1 keine Abhängigkeit und kann jederzeit vorgezogen werden. Die Tasks 5, 8 und 9 sind untereinander unabhängig.

## Was dieser Plan bewusst nicht enthält

Stripe-Anbindung, Tarifwechsel und Kündigung durch den Kunden, Zwei-Faktor-Anmeldung, Selbstlöschung einer Organisation. Ebenso das Entfernen des Site-Gates — das bleibt laut Absprache bis zur Veröffentlichung bestehen.
