# Vorbereiteter Erstkontakt und kundensichtbarer Unterlagenstatus — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer Lead wird vom System vollständig vorbereitet — Selbstauskunfts-Link und Unterlagenanforderung liegen als Entwurf bereit —, der Vermittler gibt mit einem Klick frei; und der Kunde sieht auf der Upload-Seite jederzeit, was fehlt, was angenommen wurde und warum etwas abgelehnt wurde.

**Architecture:** Der Wettbewerber Hypofy verschickt „ab Minute 1" automatisch an den Kunden. BaufiDesk dreht das um: Dieselbe Vorarbeit passiert automatisch, der **Versand** aber erst nach menschlicher Freigabe. Das entspricht dem Grundsatz „Vorschlag statt Automatik" und ist die einzige Bauweise, die sich gegen echte Kundendaten gefahrlos entwickeln lässt. Abgesichert wird das durch eine Versandsperre direkt in `sendEmail`: Jeder Aufruf muss deklarieren, ob er an Interne oder an Kunden geht, und Kundenversand ist ohne ausdrückliche Freischaltung gesperrt.

**Tech Stack:** Next.js App Router (Server Actions, Server Components), Prisma/PostgreSQL, Zod, Vitest (+ PGlite für Datenbank-Durchstiche), Resend.

## Global Constraints

- **HARTE REGEL: In BaufiDesk sind alle Kunden echt. Beim Bauen und Testen darf nichts an sie hinausgehen.** Keine Funktion gegen Produktionsdaten „ausprobieren", die eine Mail oder einen Magic Link an einen Antragsteller auslöst. Tests laufen gegen PGlite im Speicher oder mit gemocktem `sendEmail`.
- **Neue Automatisierungen schreiben nie selbst an Kunden.** Sie erzeugen Entwürfe; der Versand bleibt an einem menschlichen Klick.
- Sprache in Code, Kommentaren, Commit-Messages und Oberfläche: **Deutsch**.
- Kein `prisma db push` und keine Produktionszugriffe aus einer Task heraus. Schemaänderungen nur in `prisma/schema.prisma` plus `npm run db:generate`; das Ausrollen erfolgt am Ende gesammelt über `scripts/supabase-sql.sh`.
- Nach jeder Task müssen grün sein: `npm run typecheck`, `npm test` (Stand jetzt: 674 Tests) **und** der Build:
  `DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" AUTH_SECRET="dummy-secret-fuer-build-1234567890" UPLOAD_TOKEN_SECRET="dummy-secret-fuer-build-1234567890" npx next build`
- Arbeitsbranch: `feature/erstkontakt` (von `main` abzweigen).

---

### Task 1: Versandsperre — kein Kundenkontakt ohne ausdrückliche Freischaltung

**Files:**
- Modify: `src/lib/email/resend.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/actions/messages.ts:75`, `src/lib/actions/upload.ts:335`, `src/lib/actions/freigabe-actions.ts:54`, `src/lib/actions/invite-actions.ts:68,110`, `src/lib/actions/passwort-actions.ts:44`, `src/lib/actions/registrierung.ts:90,96`, `src/lib/actions/registrierung-benachrichtigung.ts:32`, `src/app/api/cron/reminders/route.ts:122`
- Test: `tests/versandsperre.test.ts` (neu)

**Interfaces:**
- Produces:
  - `type Empfaengerklasse = "intern" | "kunde"` in `src/lib/email/resend.ts`
  - `SendEmailInput` erhält das **Pflichtfeld** `empfaenger: Empfaengerklasse`
  - `kundenversandErlaubt(to: string): boolean`
  - Env: `KUNDENVERSAND: "an" | "aus"` (Vorgabe `"aus"`), `KUNDENVERSAND_NUR_AN?: string`

**Warum Pflichtfeld statt Vorgabewert:** Ein Feld mit Vorgabe „intern" würde jeden künftigen Versandweg stillschweigend als unkritisch einstufen. Als Pflichtfeld zwingt der Typprüfer jede neue Aufrufstelle zu einer bewussten Entscheidung — genau die Stelle, an der der Fehler sonst passiert.

- [ ] **Step 1: Failing test schreiben**

`tests/versandsperre.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let env: Record<string, unknown> = {};
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) });
  env = {
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "BaufiDesk <noreply@baufidesk.de>",
    KUNDENVERSAND: "aus",
    KUNDENVERSAND_NUR_AN: undefined,
  };
});

const kundenmail = {
  to: "kunde@example.de",
  subject: "Ihre Unterlagen",
  text: "Bitte laden Sie hoch.",
  empfaenger: "kunde" as const,
};

describe("Versandsperre", () => {
  it("laesst interne Mails immer durch", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ ...kundenmail, to: "juergen@baufidesk.de", empfaenger: "intern" })
    ).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blockt Kundenmails, solange KUNDENVERSAND nicht auf 'an' steht", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(/gesperrt/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("laesst Kundenmails durch, wenn KUNDENVERSAND auf 'an' steht", async () => {
    env.KUNDENVERSAND = "an";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).resolves.toMatchObject({ id: "m1" });
  });

  it("laesst mit Testliste NUR die aufgefuehrten Adressen durch", async () => {
    env.KUNDENVERSAND = "an";
    env.KUNDENVERSAND_NUR_AN = "test@baufidesk.de, juergen.ertel@gmx.de";
    const { sendEmail } = await import("@/lib/email/resend");

    await expect(sendEmail(kundenmail)).rejects.toThrow(/gesperrt/i);
    await expect(
      sendEmail({ ...kundenmail, to: "Test@baufidesk.de" })
    ).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blockt auch bei Testliste, wenn KUNDENVERSAND aus ist", async () => {
    env.KUNDENVERSAND = "aus";
    env.KUNDENVERSAND_NUR_AN = "test@baufidesk.de";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ ...kundenmail, to: "test@baufidesk.de" })
    ).rejects.toThrow(/gesperrt/i);
  });

  it("nennt im Fehler weder Betreff noch Inhalt", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(sendEmail(kundenmail)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("Bitte laden Sie hoch"),
      })
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/versandsperre.test.ts`
Expected: FAIL — `empfaenger` existiert noch nicht, keine Sperre.

- [ ] **Step 3: Env erweitern**

In `src/lib/env.ts` nach `EMAIL_FROM`:

```ts
  // Versandsperre gegen versehentlichen Kundenkontakt. In BaufiDesk sind alle
  // Kunden echt – eine Testmail an einen Antragsteller ist nicht zurueckholbar.
  // Vorgabe "aus": lokal und in Vorschau-Deployments geht nichts an Kunden
  // hinaus, ohne dass es jemand ausdruecklich einschaltet.
  KUNDENVERSAND: z.enum(["an", "aus"]).default("aus"),
  // Kommagetrennte Liste. Ist sie gesetzt, erreichen Kundenmails AUSSCHLIESSLICH
  // diese Adressen – zum gefahrlosen Durchspielen des ganzen Weges.
  KUNDENVERSAND_NUR_AN: z.string().optional(),
```

- [ ] **Step 4: Sperre in `sendEmail` einbauen**

`src/lib/email/resend.ts` — `SendEmailInput` und `sendEmail` ersetzen:

```ts
/**
 * Wer bekommt die Mail? "kunde" heisst: ein Antragsteller oder eine andere
 * externe Person aus einem Fall. "intern" heisst: Vermittler, Kollegen,
 * Registrierungs-Interessenten, Betreiber.
 *
 * Bewusst ein PFLICHTFELD ohne Vorgabewert: Ein Vorgabewert "intern" wuerde
 * jeden kuenftigen Versandweg stillschweigend als unkritisch einstufen.
 */
export type Empfaengerklasse = "intern" | "kunde";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  empfaenger: Empfaengerklasse;
}

/** Darf an diese Adresse eine Kundenmail hinausgehen? */
export function kundenversandErlaubt(to: string): boolean {
  const env = getEnv();
  if (env.KUNDENVERSAND !== "an") return false;
  const liste = env.KUNDENVERSAND_NUR_AN?.split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (liste && liste.length > 0) return liste.includes(to.trim().toLowerCase());
  return true;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY / EMAIL_FROM fehlen).");
  }

  // Sperre VOR dem Netzwerkaufruf. Lieber ein lauter Fehler als eine Mail an
  // einen echten Antragsteller. Der Fehler nennt bewusst weder Betreff noch
  // Inhalt noch die Adresse.
  if (input.empfaenger === "kunde" && !kundenversandErlaubt(input.to)) {
    throw new Error(
      "Kundenversand gesperrt. Ohne KUNDENVERSAND=an (und ggf. Eintrag in KUNDENVERSAND_NUR_AN) geht nichts an Kunden hinaus."
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}${body ? `: ${body.slice(0, 400)}` : ""}`);
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
```

- [ ] **Step 5: Alle Aufrufstellen einstufen**

Der Typprüfer zeigt jede Stelle an. Einstufung:

| Datei | Empfänger |
|---|---|
| `src/lib/actions/messages.ts:75` | `"kunde"` — **einziger** heutiger Weg an Antragsteller |
| `src/lib/actions/upload.ts:335` | `"intern"` (geht an `brokerEmail`) |
| `src/app/api/cron/reminders/route.ts:122` | `"intern"` (Wiedervorlage an den Vermittler) |
| `src/lib/actions/freigabe-actions.ts:54` | `"intern"` (Willkommensmail an den neuen Vermittler) |
| `src/lib/actions/invite-actions.ts:68,110` | `"intern"` (Kollege) |
| `src/lib/actions/passwort-actions.ts:44` | `"intern"` |
| `src/lib/actions/registrierung.ts:90,96` | `"intern"` |
| `src/lib/actions/registrierung-benachrichtigung.ts:32` | `"intern"` (Betreiber) |

Run: `npm run typecheck`
Expected: Kein Fehler mehr, nachdem alle zehn Stellen ergänzt sind.

- [ ] **Step 6: Fehlermeldung in `sendeNachricht` verständlich machen**

In `src/lib/actions/messages.ts` den `catch`-Zweig um den gesperrten Fall erweitern, damit der Vermittler nicht „konnte nicht versendet werden" liest, obwohl die Sperre greift:

```ts
  } catch (e) {
    console.error(`[messages] E-Mail-Versand für ${messageId} fehlgeschlagen:`, e);
    await prisma.generatedMessage.updateMany({ where: { id: messageId }, data: { sent: false } });
    const gesperrt = e instanceof Error && e.message.includes("Kundenversand gesperrt");
    return {
      ok: false,
      error: gesperrt
        ? "Der Versand an Kunden ist in dieser Umgebung gesperrt. Bitte den Text kopieren und manuell senden."
        : "Die E-Mail konnte nicht versendet werden. Bitte später erneut versuchen.",
    };
  }
```

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run tests/versandsperre.test.ts tests/send-message-email.test.ts tests/email.test.ts`
Expected: PASS. Schlagen die beiden bestehenden Mail-Tests fehl, fehlt dort das neue Pflichtfeld — ergänzen, **nicht** die Sperre aufweichen.

- [ ] **Step 8: Gesamtlauf**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 9: Commit**

```bash
git add src/lib/email/resend.ts src/lib/env.ts src/lib/actions src/app/api/cron/reminders/route.ts tests/versandsperre.test.ts
git commit -m "feat(sicherheit): Kundenversand nur mit ausdruecklicher Freischaltung"
```

**Wichtig für die Abnahme:** In Produktion muss `KUNDENVERSAND=an` gesetzt werden, sonst kann der Vermittler keine Nachforderung mehr verschicken. Das passiert gesammelt in Task 6 — nicht aus dieser Task heraus.

---

### Task 2: Erstkontakt vorbereiten — Entwurf statt Automatik

**Files:**
- Create: `src/lib/cases/erstkontakt.ts`
- Modify: `prisma/schema.prisma` (Feld `Case.erstkontaktVorbereitetAm`)
- Modify: `src/lib/platforms/finlink/sync.ts` (Aufruf nach dem Anlegen eines Falls)
- Test: `tests/erstkontakt.test.ts` (neu), `tests/erstkontakt-db.test.ts` (neu, PGlite)

**Interfaces:**
- Consumes: `buildChecklistForCase(input, documents, extraItems): ResolvedChecklistItem[]` aus `@/lib/checklists/engine` (Positionen tragen `name`, `customerDescription`, `example`, `status`, `customerVisible` — beachte: `name`, NICHT `title`); `buildEmail(missing: Array<{title: string}>, ctx: { kundeName?, uploadLink? }): { channel, subject, body }` aus `@/lib/messages/generators`; `createSelfDisclosureLink(caseId, expiresAt, { organizationId, actorUserId })` aus `@/lib/security/self-disclosure-link`; `createSecureUploadLink(caseId, expiresAt, { organizationId, actorUserId })` aus `@/lib/security/upload-link`.
- Produces: `bereiteErstkontaktVor(caseId: string, opts?: { actorUserId?: string | null }): Promise<ErstkontaktErgebnis>` mit
  `type ErstkontaktErgebnis = { status: "vorbereitet"; messageId: string; uploadUrl: string; selbstauskunftUrl: string } | { status: "schon_vorbereitet" } | { status: "kein_empfaenger" }`

**Der Kern dieser Task:** Die Funktion erzeugt Links und eine fertige Nachricht — und **verschickt nichts**. `sendEmail` wird hier nicht importiert. Das ist keine Bequemlichkeit, sondern die Zusicherung, dass ein Cron-Lauf gegen echte Fälle niemals einen Kunden erreicht.

- [ ] **Step 1: Schemafeld ergänzen**

In `prisma/schema.prisma` im `model Case` bei den übrigen Zeitstempeln:

```prisma
  // Wann der Erstkontakt vorbereitet wurde (Links + Nachrichtenentwurf).
  // Verhindert, dass ein zweiter Lauf einen zweiten Entwurf erzeugt.
  erstkontaktVorbereitetAm DateTime?
```

Run: `npx prisma format && npm run db:generate`
Expected: Kein Fehler. **Kein `db push`.**

- [ ] **Step 2: Failing test schreiben**

`tests/erstkontakt.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const faelle: Record<string, any> = {};
vi.mock("@/lib/db", () => ({
  prisma: {
    case: {
      findUnique: vi.fn(async ({ where }: any) => faelle[where.id] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(faelle[where.id], data);
        return faelle[where.id];
      }),
    },
    document: { findMany: vi.fn(async () => []) },
    generatedMessage: {
      create: vi.fn(async ({ data }: any) => ({ id: "msg1", ...data })),
    },
  },
}));

vi.mock("@/lib/security/self-disclosure-link", () => ({
  createSelfDisclosureLink: vi.fn(async () => ({
    linkId: "sd1",
    token: "tok-sd",
    url: "https://baufidesk.de/selbstauskunft/tok-sd",
    expiresAt: new Date(),
  })),
}));
vi.mock("@/lib/security/upload-link", () => ({
  createSecureUploadLink: vi.fn(async () => ({
    linkId: "up1",
    token: "tok-up",
    url: "https://baufidesk.de/upload/tok-up",
    expiresAt: new Date(),
  })),
}));

// Wird NICHT gemockt, sondern beobachtet: diese Task darf nichts versenden.
const sendSpy = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: sendSpy,
  isEmailConfigured: () => true,
}));

function fall(extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    organizationId: "o1",
    financingType: "kauf",
    primaryEmploymentType: "angestellter",
    kapitalanlage: false,
    erstkontaktVorbereitetAm: null,
    applicants: [{ id: "a1", vorname: "Anna", nachname: "Beispiel", email: "anna@example.de" }],
    ...extra,
  };
}

beforeEach(() => {
  for (const k of Object.keys(faelle)) delete faelle[k];
  faelle.c1 = fall();
  sendSpy.mockReset();
});

describe("Erstkontakt vorbereiten", () => {
  it("verschickt NICHTS", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("legt einen unversendeten Nachrichtenentwurf an", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    const res = await bereiteErstkontaktVor("c1");
    expect(res).toMatchObject({ status: "vorbereitet", messageId: "msg1" });

    const { prisma } = await import("@/lib/db");
    const arg = (prisma.generatedMessage.create as any).mock.calls[0][0].data;
    expect(arg.sent).toBe(false);
    expect(arg.channel).toBe("email");
  });

  it("nennt im Entwurf beide Links", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("https://baufidesk.de/upload/tok-up");
    expect(body).toContain("https://baufidesk.de/selbstauskunft/tok-sd");
  });

  it("spricht den Antragsteller mit Namen an", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    const { prisma } = await import("@/lib/db");
    const body = (prisma.generatedMessage.create as any).mock.calls[0][0].data.body as string;
    expect(body).toContain("Anna");
  });

  it("bereitet keinen zweiten Entwurf vor", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await bereiteErstkontaktVor("c1");
    await expect(bereiteErstkontaktVor("c1")).resolves.toEqual({ status: "schon_vorbereitet" });
    const { prisma } = await import("@/lib/db");
    expect((prisma.generatedMessage.create as any).mock.calls).toHaveLength(1);
  });

  it("bereitet nichts vor, wenn keine E-Mail-Adresse hinterlegt ist", async () => {
    faelle.c1 = fall({ applicants: [{ id: "a1", vorname: "Anna", email: null }] });
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await expect(bereiteErstkontaktVor("c1")).resolves.toEqual({ status: "kein_empfaenger" });
    const { prisma } = await import("@/lib/db");
    expect((prisma.generatedMessage.create as any).mock.calls).toHaveLength(0);
  });

  it("meldet einen unbekannten Fall statt zu werfen", async () => {
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await expect(bereiteErstkontaktVor("gibtsnicht")).resolves.toEqual({ status: "kein_empfaenger" });
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/erstkontakt.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cases/erstkontakt'`

- [ ] **Step 4: Modul schreiben**

`src/lib/cases/erstkontakt.ts`:

```ts
import { prisma } from "@/lib/db";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { buildEmail } from "@/lib/messages/generators";
import { createSelfDisclosureLink } from "@/lib/security/self-disclosure-link";
import { createSecureUploadLink } from "@/lib/security/upload-link";
import type { EmploymentType, FinancingType } from "@/lib/domain/enums";

/**
 * Bereitet den Erstkontakt zu einem neuen Fall vor: Upload-Link,
 * Selbstauskunfts-Link und eine fertig formulierte Nachricht — als ENTWURF.
 *
 * Der Wettbewerb verschickt an dieser Stelle automatisch „ab Minute 1". Wir
 * nicht: In BaufiDesk sind alle Kunden echt, und ein automatischer Versand aus
 * einem Cron-Lauf heraus waere nicht zurueckholbar. Deshalb entsteht hier nur
 * die Vorarbeit; den Versand loest ein Mensch mit einem Klick aus.
 *
 * Aus demselben Grund importiert dieses Modul `sendEmail` NICHT. Wer das
 * aendert, hebt die Zusicherung auf.
 */
export type ErstkontaktErgebnis =
  | { status: "vorbereitet"; messageId: string; uploadUrl: string; selbstauskunftUrl: string }
  | { status: "schon_vorbereitet" }
  | { status: "kein_empfaenger" };

/** Gueltigkeit der beiden Links beim Erstkontakt. */
const GUELTIG_TAGE = 21;

export async function bereiteErstkontaktVor(
  caseId: string,
  opts: { actorUserId?: string | null } = {}
): Promise<ErstkontaktErgebnis> {
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    include: { applicants: true },
  });
  if (!fall) return { status: "kein_empfaenger" };
  if (fall.erstkontaktVorbereitetAm) return { status: "schon_vorbereitet" };

  const empfaenger = fall.applicants.find(
    (a) => typeof a.email === "string" && a.email.includes("@")
  );
  if (!empfaenger) return { status: "kein_empfaenger" };

  // Ohne Dokumente liefert die Checkliste genau das, was zu Beginn fehlt.
  const positionen = buildChecklistForCase(
    {
      financingType: (fall.financingType as FinancingType) ?? undefined,
      employmentType: (fall.primaryEmploymentType as EmploymentType) ?? undefined,
      kapitalanlage: fall.kapitalanlage ?? undefined,
      applicantCount: fall.applicants.length,
      applicantIds: fall.applicants.map((a) => a.id),
    },
    []
  );
  const fehlende = positionen
    .filter((p) => p.customerVisible && p.status === "offen")
    .map((p) => ({ title: p.name }));

  const ablauf = new Date(Date.now() + GUELTIG_TAGE * 86_400_000);
  const upload = await createSecureUploadLink(fall.id, ablauf, {
    organizationId: fall.organizationId,
    actorUserId: opts.actorUserId ?? null,
  });
  const selbstauskunft = await createSelfDisclosureLink(fall.id, ablauf, {
    organizationId: fall.organizationId,
    actorUserId: opts.actorUserId ?? null,
  });

  const name = [empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(" ").trim();
  const mail = buildEmail(fehlende, { kundeName: name || undefined, uploadLink: upload.url });

  // Selbstauskunft ergaenzen: der Generator kennt nur den Upload-Link.
  const body =
    mail.body +
    `\n\nDamit ich gleich mit den richtigen Zahlen rechnen kann, füllen Sie bitte außerdem` +
    ` einmal kurz Ihre Angaben aus – das dauert wenige Minuten:\n${selbstauskunft.url}`;

  const entwurf = await prisma.generatedMessage.create({
    data: {
      caseId: fall.id,
      channel: "email",
      templateType: "erstnachforderung",
      subject: mail.subject ?? null,
      body,
      // Ausdruecklich unversendet. Der Versand ist ein menschlicher Klick.
      sent: false,
    },
  });

  await prisma.case.update({
    where: { id: fall.id },
    data: { erstkontaktVorbereitetAm: new Date() },
  });

  return {
    status: "vorbereitet",
    messageId: entwurf.id,
    uploadUrl: upload.url,
    selbstauskunftUrl: selbstauskunft.url,
  };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/erstkontakt.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 6: An den Lead-Eingang hängen**

In `src/lib/platforms/finlink/sync.ts` direkt nach dem Anlegen eines Falls `bereiteErstkontaktVor(fall.id)` aufrufen. Fehler dabei dürfen den Lead-Import **nicht** abbrechen:

```ts
  // Erstkontakt vorbereiten (Links + Nachrichtenentwurf, KEIN Versand).
  // Scheitert das, ist der Lead trotzdem angelegt – der Vermittler kann den
  // Erstkontakt jederzeit von Hand anstossen.
  try {
    await bereiteErstkontaktVor(angelegt.id);
  } catch (e) {
    console.error(`[finlink] Erstkontakt für ${angelegt.id} nicht vorbereitet:`, e);
  }
```

- [ ] **Step 7: Datenbank-Durchstich schreiben**

`tests/erstkontakt-db.test.ts` — nach dem Muster von `tests/selbstauskunft-db.test.ts` (PGlite, Schema per `prisma migrate diff` aus `prisma/schema.prisma`, `describe.runIf(RUN)` mit `RUN_DB_IT=1`). Geprüft wird gegen das echte Schema:

1. Ein Fall mit einem Antragsteller mit E-Mail-Adresse: `bereiteErstkontaktVor` legt genau **eine** `generated_messages`-Zeile mit `sent = false` an, dazu je eine Zeile in `upload_links` und `self_disclosure_links`.
2. Der zweite Aufruf liefert `schon_vorbereitet` und legt **nichts** zusätzlich an.
3. `erstkontaktVorbereitetAm` ist gesetzt.
4. Ein Fall ohne E-Mail-Adresse erzeugt **keine** Links und **keine** Nachricht.

- [ ] **Step 8: Läufe**

Run: `RUN_DB_IT=1 npx vitest run tests/erstkontakt-db.test.ts && npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma src/lib/cases/erstkontakt.ts src/lib/platforms/finlink/sync.ts tests/erstkontakt.test.ts tests/erstkontakt-db.test.ts
git commit -m "feat(erstkontakt): Links und Nachrichtenentwurf beim Lead-Eingang vorbereiten"
```

---

### Task 3: Erstkontakt freigeben — der eine Klick

**Files:**
- Create: `src/components/case/erstkontakt-karte.tsx`
- Create: `src/lib/actions/erstkontakt-actions.ts`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Karte oberhalb der Fallinhalte einhängen)
- Test: `tests/erstkontakt-action.test.ts` (neu)

**Interfaces:**
- Consumes: `bereiteErstkontaktVor(caseId, opts?)` aus `@/lib/cases/erstkontakt`; `sendeNachricht(messageId)` aus `@/lib/actions/messages`; `requireCaseAccess(caseId)` aus `@/lib/auth/context`.
- Produces:
  - `erstkontaktVorbereitenAction(formData: FormData): Promise<void>` — für Fälle, bei denen noch nichts vorbereitet wurde (etwa von Hand angelegte).
  - `interface ErstkontaktStand { vorbereitetAm: Date | null; messageId: string | null; versendetAm: Date | null; empfaenger: string | null }`
  - `ladeErstkontaktStand(caseId: string): Promise<ErstkontaktStand>`

**Bewusst kein neuer Versandweg:** Freigegeben wird über die **vorhandene** `sendeNachricht`. Die hat bereits die atomare Versand-Reservierung gegen Doppelklicks und läuft ab Task 1 durch die Versandsperre. Ein zweiter Versandpfad wäre eine zweite Stelle, an der die Sperre vergessen werden kann.

- [ ] **Step 1: Failing test schreiben**

`tests/erstkontakt-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const ctx = { organizationId: "o1", userId: "u1" };
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx,
    caseRow: { id: caseId, organizationId: "o1" },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const vorbereiten = vi.fn();
vi.mock("@/lib/cases/erstkontakt", () => ({ bereiteErstkontaktVor: vorbereiten }));

const db = { fall: null as any, nachrichten: [] as any[] };
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findUnique: vi.fn(async () => db.fall) },
    generatedMessage: {
      findFirst: vi.fn(async () => db.nachrichten[0] ?? null),
    },
  },
}));

beforeEach(() => {
  vorbereiten.mockReset();
  db.fall = {
    id: "c1",
    erstkontaktVorbereitetAm: null,
    applicants: [{ email: "anna@example.de" }],
  };
  db.nachrichten = [];
});

function form(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

describe("Erstkontakt-Stand", () => {
  it("meldet 'noch nicht vorbereitet' fuer einen frischen Fall", async () => {
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    await expect(ladeErstkontaktStand("c1")).resolves.toMatchObject({
      vorbereitetAm: null,
      messageId: null,
      versendetAm: null,
      empfaenger: "anna@example.de",
    });
  });

  it("meldet den Entwurf, sobald einer da ist", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.nachrichten = [{ id: "msg1", sent: false, createdAt: new Date("2026-08-08") }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.messageId).toBe("msg1");
    expect(stand.versendetAm).toBeNull();
  });

  it("meldet den Versand, sobald die Nachricht raus ist", async () => {
    db.fall.erstkontaktVorbereitetAm = new Date("2026-08-08");
    db.nachrichten = [{ id: "msg1", sent: true, createdAt: new Date("2026-08-08") }];
    const { ladeErstkontaktStand } = await import("@/lib/actions/erstkontakt-actions");
    const stand = await ladeErstkontaktStand("c1");
    expect(stand.versendetAm).not.toBeNull();
  });
});

describe("Erstkontakt vorbereiten (Action)", () => {
  it("prueft den Fallzugriff, bevor sie etwas tut", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
  });

  it("reicht die handelnde Person weiter", async () => {
    vorbereiten.mockResolvedValue({ status: "vorbereitet", messageId: "msg1" });
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({ caseId: "c1" }));
    expect(vorbereiten).toHaveBeenCalledWith("c1", { actorUserId: "u1" });
  });

  it("tut ohne caseId nichts", async () => {
    const { erstkontaktVorbereitenAction } = await import("@/lib/actions/erstkontakt-actions");
    await erstkontaktVorbereitenAction(form({}));
    expect(vorbereiten).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/erstkontakt-action.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/erstkontakt-actions'`

- [ ] **Step 3: Server Actions schreiben**

`src/lib/actions/erstkontakt-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { bereiteErstkontaktVor } from "@/lib/cases/erstkontakt";

/**
 * Oberflaechenseite des Erstkontakts. Bereitet vor und liest den Stand –
 * versendet aber NICHT selbst. Der Versand laeuft ueber die vorhandene
 * `sendeNachricht`, damit es genau einen Weg an Kunden gibt, der die
 * Versandsperre und die Doppelklick-Sicherung traegt.
 */
export interface ErstkontaktStand {
  vorbereitetAm: Date | null;
  messageId: string | null;
  versendetAm: Date | null;
  empfaenger: string | null;
}

export async function ladeErstkontaktStand(caseId: string): Promise<ErstkontaktStand> {
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    include: { applicants: { select: { email: true } } },
  });
  if (!fall) {
    return { vorbereitetAm: null, messageId: null, versendetAm: null, empfaenger: null };
  }

  const entwurf = await prisma.generatedMessage.findFirst({
    where: { caseId, channel: "email", templateType: "erstnachforderung" },
    orderBy: { createdAt: "asc" },
    select: { id: true, sent: true, createdAt: true },
  });

  const empfaenger =
    fall.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null;

  return {
    vorbereitetAm: fall.erstkontaktVorbereitetAm ?? null,
    messageId: entwurf?.id ?? null,
    versendetAm: entwurf?.sent ? entwurf.createdAt : null,
    empfaenger,
  };
}

export async function erstkontaktVorbereitenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;
  const { ctx } = await requireCaseAccess(caseId);
  await bereiteErstkontaktVor(caseId, { actorUserId: ctx.userId });
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/erstkontakt-action.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Karte schreiben**

`src/components/case/erstkontakt-karte.tsx` — Server-Komponente, drei Zustände:

1. **Noch nichts vorbereitet:** Knopf „Erstkontakt vorbereiten" (Formular auf `erstkontaktVorbereitenAction`), darunter ein Satz, was dabei passiert: „Erzeugt Upload-Link, Selbstauskunfts-Link und eine fertige Nachricht — **verschickt noch nichts**."
2. **Entwurf liegt bereit:** Empfängeradresse groß und deutlich anzeigen, dazu Knopf „Prüfen und senden", der auf `/cases/[id]/messages` verlinkt (dort steht der Text und der vorhandene Sende-Knopf). **Kein Sende-Knopf direkt auf der Karte** — der Vermittler soll den Text gelesen haben, bevor er an einen echten Kunden geht.
3. **Versendet:** Zeitpunkt und Empfänger, kein Knopf.

Ist `empfaenger` null, statt des Knopfes der Hinweis: „Für diesen Fall ist noch keine E-Mail-Adresse hinterlegt. Bitte in den Kundendaten ergänzen." — mit Link auf die Fallbearbeitung.

- [ ] **Step 6: Karte einhängen**

In `src/app/(app)/cases/[id]/page.tsx` die Karte oberhalb der übrigen Fallinhalte rendern, aber nur, solange der Erstkontakt noch nicht versendet ist — ein abgeschlossener Erstkontakt soll die Fallseite nicht dauerhaft verstellen.

- [ ] **Step 7: Läufe**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/erstkontakt-actions.ts src/components/case/erstkontakt-karte.tsx "src/app/(app)/cases/[id]/page.tsx" tests/erstkontakt-action.test.ts
git commit -m "feat(erstkontakt): Karte auf der Fallseite mit Freigabe in einem Klick"
```

---

### Task 4: Der Kunde sieht, wo er steht

**Files:**
- Create: `src/lib/upload/kundenansicht.ts`
- Modify: `src/app/upload/[token]/page.tsx`
- Modify: `prisma/schema.prisma` (Feld `Document.reviewNote`), `src/lib/actions/cases.ts:482` (`setDocumentReview` um den Grund erweitern), Review-Center-Oberfläche
- Test: `tests/kundenansicht.test.ts` (neu)

**Interfaces:**
- Consumes: `buildChecklistForCase` aus `@/lib/checklists/engine`.
- Produces:
  - `interface KundenPosition { key: string; name: string; beschreibung: string; beispiel?: string; zustand: "offen" | "eingegangen" | "angenommen" | "abgelehnt"; grund?: string }`
  - `interface KundenFortschritt { positionen: KundenPosition[]; erledigt: number; gesamt: number; prozent: number }`
  - `baueKundenfortschritt(input: { positionen: ResolvedChecklistItem[]; dokumente: Array<{ documentType: string | null; reviewStatus: string; reviewNote: string | null }> }): KundenFortschritt`

**Warum eine eigene Datei:** Die Upload-Seite ist mit 264 Zeilen schon dicht. Die Zustandsableitung gehört in reine Logik, die ohne React prüfbar ist — die Seite rendert nur noch.

- [ ] **Step 1: Failing test schreiben**

`tests/kundenansicht.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { baueKundenfortschritt } from "@/lib/upload/kundenansicht";

function pos(key: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    name: `Position ${key}`,
    customerDescription: `Bitte laden Sie ${key} hoch.`,
    example: `Beispiel ${key}`,
    documentType: key,
    status: "offen",
    customerVisible: true,
    level: "zwingend",
    scope: "fall",
    platforms: [],
    matchedDocuments: 0,
    effectiveRequiredCount: 1,
  } as never;
}

describe("Kundensicht auf den Unterlagenstand", () => {
  it("zeigt offene Positionen mit Beschreibung und Beispiel", () => {
    const f = baueKundenfortschritt({ positionen: [pos("personalausweis")], dokumente: [] });
    expect(f.positionen[0]).toMatchObject({
      zustand: "offen",
      beschreibung: "Bitte laden Sie personalausweis hoch.",
      beispiel: "Beispiel personalausweis",
    });
    expect(f.prozent).toBe(0);
  });

  it("zeigt ein hochgeladenes, noch ungeprueftes Dokument als eingegangen", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("personalausweis")],
      dokumente: [{ documentType: "personalausweis", reviewStatus: "offen", reviewNote: null }],
    });
    expect(f.positionen[0].zustand).toBe("eingegangen");
  });

  it("zaehlt nur angenommene Unterlagen als erledigt", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("a"), pos("b")],
      dokumente: [
        { documentType: "a", reviewStatus: "akzeptiert", reviewNote: null },
        { documentType: "b", reviewStatus: "offen", reviewNote: null },
      ],
    });
    expect(f.erledigt).toBe(1);
    expect(f.gesamt).toBe(2);
    expect(f.prozent).toBe(50);
  });

  it("nennt bei einer Ablehnung den Grund", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        {
          documentType: "gehaltsabrechnung",
          reviewStatus: "abgelehnt",
          reviewNote: "Seite 2 fehlt.",
        },
      ],
    });
    expect(f.positionen[0]).toMatchObject({ zustand: "abgelehnt", grund: "Seite 2 fehlt." });
  });

  it("bleibt ohne Ablehnungsgrund verstaendlich", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        { documentType: "gehaltsabrechnung", reviewStatus: "abgelehnt", reviewNote: null },
      ],
    });
    expect(f.positionen[0].zustand).toBe("abgelehnt");
    expect(f.positionen[0].grund).toBeUndefined();
  });

  it("blendet Positionen aus, die den Kunden nichts angehen", () => {
    const intern = { ...pos("intern_pruefung"), customerVisible: false } as never;
    const f = baueKundenfortschritt({ positionen: [pos("a"), intern], dokumente: [] });
    expect(f.positionen).toHaveLength(1);
    expect(f.gesamt).toBe(1);
  });

  it("meldet 100 Prozent, wenn nichts verlangt wird", () => {
    const f = baueKundenfortschritt({ positionen: [], dokumente: [] });
    expect(f.prozent).toBe(100);
    expect(f.gesamt).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/kundenansicht.test.ts`
Expected: FAIL — `Cannot find module '@/lib/upload/kundenansicht'`

- [ ] **Step 3: Modul schreiben**

`src/lib/upload/kundenansicht.ts`:

```ts
import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

/**
 * Uebersetzt den internen Unterlagenstand in das, was ein Kunde sehen soll.
 *
 * Bewusst eigene Begriffe: Der Kunde liest „eingegangen", nicht „reviewStatus
 * offen". Und er sieht nur Positionen, die ihn etwas angehen.
 */
export interface KundenPosition {
  key: string;
  name: string;
  beschreibung: string;
  beispiel?: string;
  zustand: "offen" | "eingegangen" | "angenommen" | "abgelehnt";
  /** Nur bei Ablehnung, und nur wenn der Vermittler einen Grund hinterlegt hat. */
  grund?: string;
}

export interface KundenFortschritt {
  positionen: KundenPosition[];
  erledigt: number;
  gesamt: number;
  prozent: number;
}

export interface KundenDokument {
  documentType: string | null;
  reviewStatus: string;
  reviewNote: string | null;
}

export function baueKundenfortschritt(input: {
  positionen: ResolvedChecklistItem[];
  dokumente: KundenDokument[];
}): KundenFortschritt {
  const sichtbar = input.positionen.filter((p) => p.customerVisible);

  const positionen: KundenPosition[] = sichtbar.map((p) => {
    const passende = input.dokumente.filter((d) => d.documentType && d.documentType === p.documentType);

    // Reihenfolge der Zustaende: eine Annahme schlaegt alles, danach die
    // Ablehnung (der Kunde muss handeln), dann der blosse Eingang.
    const angenommen = passende.find((d) => d.reviewStatus === "akzeptiert");
    const abgelehnt = passende.find((d) => d.reviewStatus === "abgelehnt");
    const eingegangen = passende.length > 0;

    if (angenommen) {
      return basis(p, "angenommen");
    }
    if (abgelehnt) {
      return { ...basis(p, "abgelehnt"), grund: abgelehnt.reviewNote ?? undefined };
    }
    if (eingegangen) {
      return basis(p, "eingegangen");
    }
    return basis(p, "offen");
  });

  const gesamt = positionen.length;
  const erledigt = positionen.filter((p) => p.zustand === "angenommen").length;
  const prozent = gesamt === 0 ? 100 : Math.round((erledigt / gesamt) * 100);

  return { positionen, erledigt, gesamt, prozent };
}

function basis(p: ResolvedChecklistItem, zustand: KundenPosition["zustand"]): KundenPosition {
  return {
    key: p.key,
    name: p.name,
    beschreibung: p.customerDescription,
    beispiel: p.example,
    zustand,
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/kundenansicht.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 5: Den Ablehnungsgrund überhaupt erfassbar machen**

`reviewNote` existiert **nicht**, und `setDocumentReview(documentId, reviewStatus)` nimmt keinen Grund entgegen. Ohne diesen Schritt zeigte die Kundensicht ein Feld an, das niemand füllen kann.

1. In `prisma/schema.prisma` im `model Document` neben `reviewStatus`:

```prisma
  // Grund einer Ablehnung. Wird dem Kunden auf der Upload-Seite angezeigt –
  // deshalb kundentauglich formulieren, keine internen Kuerzel.
  reviewNote           String?
```

Run: `npx prisma format && npm run db:generate` — **kein `db push`**, die Änderung geht in die Sammelmigration von Task 6.

2. `setDocumentReview` in `src/lib/actions/cases.ts:482` um einen optionalen Grund erweitern:

```ts
export async function setDocumentReview(
  documentId: string,
  reviewStatus: "akzeptiert" | "abgelehnt" | "duplikat" | "ersetzt",
  grund?: string
): Promise<void> {
```

und im `update` mitschreiben — beim Ablehnen den Text, sonst ausdrücklich leeren, damit ein alter Grund nicht an einem später angenommenen Dokument kleben bleibt:

```ts
  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      reviewStatus,
      reviewNote: reviewStatus === "abgelehnt" ? grund?.trim().slice(0, 500) || null : null,
    },
    select: { caseId: true, documentType: true },
  });
```

3. Im Review-Center beim Ablehnen ein Textfeld „Grund für den Kunden (freiwillig)" anbieten und an `setDocumentReview` durchreichen. Platzhaltertext: „z. B. Seite 2 fehlt — bitte alle Seiten hochladen."

4. Test in `tests/kundenansicht.test.ts` ergänzen:

```ts
  it("haengt keinen alten Ablehnungsgrund an eine spaetere Annahme", () => {
    const f = baueKundenfortschritt({
      positionen: [pos("gehaltsabrechnung")],
      dokumente: [
        { documentType: "gehaltsabrechnung", reviewStatus: "abgelehnt", reviewNote: "Seite 2 fehlt." },
        { documentType: "gehaltsabrechnung", reviewStatus: "akzeptiert", reviewNote: null },
      ],
    });
    expect(f.positionen[0].zustand).toBe("angenommen");
    expect(f.positionen[0].grund).toBeUndefined();
  });
```

- [ ] **Step 6: Upload-Seite ergänzen**

In `src/app/upload/[token]/page.tsx`:
- `documents` um `reviewNote` erweitern (falls nicht geladen) und die Checkliste über `buildChecklistForCase` bestimmen.
- `baueKundenfortschritt` aufrufen.
- Oberhalb der Liste einen Fortschrittsbalken mit „**{erledigt} von {gesamt} Unterlagen angenommen**" und der Prozentzahl.
- Je Position eine Zeile mit Zustandspunkt und Beschriftung:
  - `offen` → grau, „Noch offen"
  - `eingegangen` → blau, „Bei uns eingegangen, wird geprüft"
  - `angenommen` → grün, „Angenommen"
  - `abgelehnt` → rot, „Bitte erneut hochladen" — und darunter der Grund, wenn vorhanden.

- [ ] **Step 7: Läufe**

Run: `npm run typecheck && npm test`
Expected: Alles grün.

- [ ] **Step 8: Commit**

```bash
git add src/lib/upload/kundenansicht.ts "src/app/upload/[token]/page.tsx" tests/kundenansicht.test.ts prisma/schema.prisma
git commit -m "feat(kundensicht): Fortschritt und Status je Unterlage auf der Upload-Seite"
```

---

### Task 5: Hinweise je Unterlage — weniger Rückfragen

**Files:**
- Modify: `src/app/upload/[token]/page.tsx`
- Modify: `src/lib/checklists/templates.ts` (nur dort, wo `customerDescription` zu dünn oder `example` leer ist)
- Test: `tests/kundenhinweise.test.ts` (neu)

**Erfreulicher Befund:** Die Felder gibt es schon. `ChecklistItemDef` trägt `customerDescription` und `example`; Task 4 reicht beide bereits durch. Diese Task ist deshalb **keine** Datenmodell-Arbeit, sondern Textpflege plus Anzeige.

- [ ] **Step 1: Prüfen, welche Positionen dünn sind**

Run: `npx tsx -e "import('./src/lib/checklists/templates.ts').then(m=>{const alle=Object.values(m.CHECKLIST_TEMPLATES).flatMap((t:any)=>t.items); for(const i of alle) if(!i.example || i.customerDescription.length<40) console.log(i.key,'|',i.customerDescription.length,'|',i.example??'KEIN BEISPIEL')})"`
Expected: Eine Liste der Positionen ohne Beispiel oder mit sehr kurzer Beschreibung.

- [ ] **Step 2: Failing test schreiben**

`tests/kundenhinweise.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHECKLIST_TEMPLATES } from "@/lib/checklists/templates";

const alle = Object.values(CHECKLIST_TEMPLATES).flatMap((t) => t.items);

describe("Kundenhinweise je Unterlage", () => {
  it("erklaert jede kundensichtbare Position in ganzen Saetzen", () => {
    const duenn = alle
      .filter((i) => i.customerDescription.trim().length < 40)
      .map((i) => i.key);
    expect(duenn).toEqual([]);
  });

  it("nennt zu jeder kundensichtbaren Position ein Beispiel", () => {
    const ohne = alle.filter((i) => !i.example || i.example.trim().length === 0).map((i) => i.key);
    expect(ohne).toEqual([]);
  });

  it("verwendet keine Fachbegriffe ohne Erklaerung", () => {
    // Woerter, die ein Kunde nicht kennen muss. Kommen sie vor, muss im selben
    // Satz eine Erklaerung stehen – geprueft ueber die Mindestlaenge.
    const fachbegriffe = ["SCHUFA-Selbstauskunft", "Grundschuldbestellung", "Annuität"];
    for (const i of alle) {
      for (const wort of fachbegriffe) {
        if (i.customerDescription.includes(wort)) {
          expect(i.customerDescription.length).toBeGreaterThan(80);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Test laufen lassen**

Run: `npx vitest run tests/kundenhinweise.test.ts`
Expected: FAIL mit einer Liste der Positionen, die nachzubessern sind.

- [ ] **Step 4: Texte nachziehen**

Für jede vom Test genannte Position in `src/lib/checklists/templates.ts`:
- `customerDescription`: ein bis zwei ganze Sätze, die sagen **was** gebraucht wird und **worauf zu achten ist** (Aktualität, Vollständigkeit, alle Seiten).
- `example`: ein greifbares Beispiel, etwa „Die Abrechnung Ihres Arbeitgebers für den letzten Monat — alle Seiten, auch die Rückseite."

Ton: freundlich, direkt, ohne Behördendeutsch — wie in `src/lib/messages/generators.ts`.

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/kundenhinweise.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 6: Hinweise anzeigen**

Auf der Upload-Seite je Position `beschreibung` als Fließtext unter dem Namen und `beispiel` kleiner und gedämpft darunter. Bei bereits angenommenen Positionen beides einklappen — wer fertig ist, braucht die Anleitung nicht mehr.

- [ ] **Step 7: Läufe und Commit**

```bash
npm run typecheck && npm test
git add src/lib/checklists/templates.ts "src/app/upload/[token]/page.tsx" tests/kundenhinweise.test.ts
git commit -m "feat(kundensicht): verstaendliche Hinweise und Beispiele je Unterlage"
```

---

### Task 6: Abnahme und Ausrollen

**Files:**
- Keine Codeänderung; diese Task rollt aus und prüft nach.

- [ ] **Step 1: Vollständiger Lauf**

Run: `npm run typecheck && npm test && RUN_DB_IT=1 npx vitest run tests/erstkontakt-db.test.ts && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" AUTH_SECRET="dummy-secret-fuer-build-1234567890" UPLOAD_TOKEN_SECRET="dummy-secret-fuer-build-1234567890" npx next build`
Expected: Alles grün. **Erst dann weiter.**

- [ ] **Step 2: Schemaänderung erzeugen**

```bash
git show main:prisma/schema.prisma > /tmp/schema-vorher.prisma
npx prisma migrate diff --from-schema-datamodel /tmp/schema-vorher.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/erstkontakt.sql
grep -icE '(^|[^ ])(drop|truncate)[[:space:]]|[[:space:]]delete[[:space:]]+from[[:space:]]' /tmp/erstkontakt.sql
```
Expected: Nur `ALTER TABLE ... ADD COLUMN` für `erstkontaktVorbereitetAm` (und ggf. `reviewNote`). Die Zählung muss **0** ergeben; ist sie es nicht, abbrechen und zurückmelden.

- [ ] **Step 3: Schema ausrollen**

Run: `bash scripts/supabase-sql.sh /tmp/erstkontakt.sql --dry-run` — prüfen, dann ohne `--dry-run`.

- [ ] **Step 4: Versandsperre in Produktion scharf schalten**

```bash
printf 'an' | vercel env add KUNDENVERSAND production
```

**Ohne diesen Schritt kann der Vermittler keine Nachforderung mehr verschicken** — die Sperre aus Task 1 ist fail-closed. Danach gegenprüfen: `vercel env ls production | grep KUNDENVERSAND`.

`KUNDENVERSAND_NUR_AN` in Produktion **nicht** setzen. Diese Variable ist für Vorschau-Deployments und lokale Läufe gedacht.

- [ ] **Step 5: Merge und Deployment**

Erst mergen, wenn Schema und Variable stehen — sonst laufen Fallseiten in einen Fehler, weil `erstkontaktVorbereitetAm` fehlt.

- [ ] **Step 6: Abnahme, ohne einen echten Kunden zu berühren**

1. Auf dem **Demo-Fall** (Mustermann, `UP-2026-0001`) den Erstkontakt vorbereiten. Prüfen: Karte zeigt den Entwurf, es ist **nichts** versendet.
2. Den Entwurf unter `/cases/UP-2026-0001/messages` lesen — enthält er Upload- **und** Selbstauskunfts-Link?
3. Die Empfängeradresse des Demo-Falls vorher auf eine **eigene** Adresse ändern, dann senden. Ankunft prüfen.
4. Über den Upload-Link eine Datei hochladen und die Kundensicht prüfen: Fortschritt, Zustand „eingegangen", Hinweistexte.
5. Die Datei im Review-Center ablehnen mit Grund, dann die Kundensicht erneut aufrufen: erscheint „Bitte erneut hochladen" samt Grund?
6. **Auf keinem echten Fall etwas senden.**

- [ ] **Step 7: Abschluss**

```bash
git add -A && git commit -m "chore(erstkontakt): Abnahme abgeschlossen"
```

Danach über `superpowers:finishing-a-development-branch` entscheiden, wie der Branch nach `main` kommt.

---

## Reihenfolge

```
Task 1 (Versandsperre)  ← zuerst, schuetzt alles Weitere
  ├─ Task 2 (Erstkontakt vorbereiten) ─ Task 3 (Freigabe-Karte)
  └─ Task 4 (Kundensicht) ─ Task 5 (Hinweise je Unterlage)
Task 6 (Abnahme und Ausrollen)  ← zuletzt
```

Task 2/3 und Task 4/5 sind voneinander unabhängig und könnten parallel laufen; Task 1 muss vor allem anderen stehen.

## Was dieser Plan bewusst nicht enthält

Automatisches Abosystem (Stripe), Kennzahlen nach Volumen und Provision, Anschlussfinanzierung als Fallart, echte Europace-Anbindung, Tippgeberportal. Das sind eigene Vorhaben — siehe die Wettbewerbsanalyse zu Hypofy.
