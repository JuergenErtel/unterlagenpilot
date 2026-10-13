# SMS nach „Nicht erreicht“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach einem erfolglosen Anruf bietet die Fallseite eine fertig formulierte SMS an, die Jürgen per Klick in der Nachrichten-App seines iPhones/Macs öffnet; „Anrufen“ funktioniert auch am Mac (über das iPhone).

**Architecture:** Reine Funktionen für Link (`smsLink` in `telefon.ts`), Textbausteine und Sichtbarkeit (`src/lib/kontakt/sms-nachfass.ts`), eine bearbeitbare Vorlage `nicht_erreicht:sms` im bestehenden Vorlagensystem, ein Server-Loader für den fertigen Text und eine eigene Karte `SmsNachfassKarte` auf der Fallseite – unabhängig von der Prioritätsleiter, weil deren Kontaktschritt nach „Nicht erreicht“ verschwindet. Der Vermerk „SMS geschrieben“ ist ein `CaseNote` mit `kind = sms` und **ohne** `ergebnis`, damit er nicht als Anrufversuch zählt.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma/Postgres (Supabase, Schema `unterlagenpilot`), Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-10-13-sms-nach-nicht-erreicht-design.md`

## Global Constraints

- BaufiDesk verschickt nichts selbst: nur `sms:`-Link + Kopierknopf, nie ein SMS-Gateway, nie `sendEmail`.
- Im Zweifel KEIN Link: zweifelhafte Nummer → `smsLink` liefert `null` → keine Karte.
- SMS-Vermerk: `kind = "sms"`, `body = "SMS geschrieben."`, **kein** `ergebnis`, kein Versuchszähler.
- Standardtext (exakt): `{{smsAnrede}} vielen Dank für Ihre Finanzierungsanfrage{{objektOrt}}. Ich habe Sie eben leider telefonisch nicht erreicht. Wann kann ich Sie am besten erreichen? Viele Grüße, {{beraterName}}{{beraterWebsite}}`
- `{{smsAnrede}}`: „Guten Tag Frau Müller,“ / „Guten Tag Max Müller,“ / „Guten Tag,“.
- `{{objektOrt}}`: „ für eine Immobilie in Leipzig“ / „ für eine Immobilie in 04109“ / „“.
- `{{beraterName}}`: `ctx.userName`, Rückfall Organisationsname.
- `{{beraterWebsite}}`: „ (baufivergleicher.de)“ aus `Organization.website` ohne Schema, `www.`, abschließenden `/`; leer → „“.
- Kartenfenster: 12 Stunden nach dem letzten `nicht_erreicht`-Anruf.
- DDL zuerst gegen PROD (`scripts/supabase-sql.sh`), keine Semikolons in SQL-Kommentaren, nie `prisma migrate diff` anwenden.
- Commit-Messages enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code-Kommentare deutsch, im Stil der Umgebung (Begründung „warum“, nicht „was“).

## Review Focus

1. Nummer im Freitext mit `+49`/`0049`/`00170…`/Klammern → derselbe Empfänger wie `waLink`; Durchwahl/Müll → keine Karte. (Task 2)
2. Fall ohne Antragstellername, ohne Ort/PLZ, Organisation ohne Website → kein „in .“, keine leere Klammer, kein doppeltes Leerzeichen. (Task 3/4)
3. Vom Nutzer umformulierte Vorlage, die einen Platzhalter weglässt oder doppelt Leerzeichen erzeugt → Text bleibt sauber (Mehrfach-Leerzeichen zusammengezogen, getrimmt). (Task 4)
4. Nach „SMS geschrieben“ darf `kontaktStand` den Versuch nicht hochzählen und die Karte muss verschwinden; ein späteres „Erreicht“ oder ein neuer Anruf ersetzt das Angebot korrekt. (Task 3/5)
5. Umlaute, `&`, `?` und `#` im Text (z. B. Ort „Bad Tölz“, Name „Müller & Söhne“) werden im `sms:`-Link kodiert und brechen den Link nicht. (Task 2)

---

### Task 1: Neue Enum-Werte (`sms`, `nicht_erreicht`) in DB, Prisma und Domain

**Files:**
- Create: `scripts/sql/2026-10-13-sms-nachfass-enums.sql`
- Modify: `prisma/schema.prisma` (enums `CaseNoteKind` ~Z. 72, `MessageChannel` ~Z. 243, `MessageTemplateType` ~Z. 250)
- Modify: `src/lib/domain/enums.ts` (`CASE_NOTE_KINDS` Z. 135, `CASE_NOTE_KIND_LABELS` Z. 138, `MESSAGE_CHANNELS` Z. 476, `MESSAGE_TEMPLATE_TYPES` Z. 480, `MESSAGE_TEMPLATE_TYPE_LABELS` Z. 500)
- Modify: `src/app/(app)/cases/[id]/verwaltung/page.tsx:47` (`NOTE_ICON`)

**Interfaces:**
- Produces: `CaseNoteKind` enthält `"sms"`, `MessageChannel` enthält `"sms"`, `MessageTemplateType` enthält `"nicht_erreicht"` – in Prisma-Client und `enums.ts`.

- [ ] **Step 1: SQL-Datei schreiben**

```sql
-- SMS nach Nicht erreicht: drei neue Enum-Werte. Nur additiv.
-- Anwenden: scripts/supabase-sql.sh scripts/sql/2026-10-13-sms-nachfass-enums.sql
ALTER TYPE "unterlagenpilot"."CaseNoteKind" ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE "unterlagenpilot"."MessageChannel" ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE "unterlagenpilot"."MessageTemplateType" ADD VALUE IF NOT EXISTS 'nicht_erreicht';
```

(`ADD VALUE` in einer Transaktion ist ab Postgres 12 erlaubt, solange der Wert in derselben Transaktion nicht benutzt wird – das Skript fasst die Datei in eine Transaktion.)

- [ ] **Step 2: Trockenlauf**

Run: `scripts/supabase-sql.sh scripts/sql/2026-10-13-sms-nachfass-enums.sql --dry-run`
Expected: genau 3 Anweisungen, jede vollständig (nicht am Semikolon im Kommentar zerrissen).

- [ ] **Step 3: Gegen PROD ausführen und prüfen**

Run: `scripts/supabase-sql.sh scripts/sql/2026-10-13-sms-nachfass-enums.sql`
Danach eine Lese-Datei im Scratchpad mit
`SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE e.enumlabel IN ('sms','nicht_erreicht')`
ausführen. Expected: 3 Zeilen (CaseNoteKind/sms, MessageChannel/sms, MessageTemplateType/nicht_erreicht).

- [ ] **Step 4: Prisma-Schema spiegeln**

In `prisma/schema.prisma`:

```prisma
enum CaseNoteKind {
  notiz
  telefon
  email
  whatsapp
  sms
  wiedervorlage
}
```

`MessageChannel`: nach `whatsapp` die Zeile `sms` einfügen. `MessageTemplateType`: am Ende `nicht_erreicht` anfügen.
Run: `npx prisma generate`

- [ ] **Step 5: `enums.ts` spiegeln**

```ts
export const CASE_NOTE_KINDS = ["notiz", "telefon", "email", "whatsapp", "sms", "wiedervorlage"] as const;
```

In `CASE_NOTE_KIND_LABELS` nach `whatsapp: "WhatsApp",` → `sms: "SMS",`.
`MESSAGE_CHANNELS = ["email", "whatsapp", "sms", "pdf", "intern"] as const;`
`MESSAGE_TEMPLATE_TYPES`: `"nicht_erreicht",` am Ende anfügen.
`MESSAGE_TEMPLATE_TYPE_LABELS`: `nicht_erreicht: "Nicht erreicht (Rückrufbitte)",`.

- [ ] **Step 6: Icon in der Vermerkliste**

In `src/app/(app)/cases/[id]/verwaltung/page.tsx` `MessageSquare` aus `lucide-react` mit importieren und in `NOTE_ICON` ergänzen: `sms: MessageSquare,`.

- [ ] **Step 7: Typprüfung und Tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: keine Typfehler (jede `Record<…>`-Map über diese Enums ist vollständig), alle Tests grün. Meldet `tsc` weitere exhaustive Maps oder `z.enum`-Listen über `MessageChannel`, dort `sms` ergänzen (`src/lib/domain/ai-schemas.ts:173` ist eine KI-Ausgabe-Liste – dort NICHT ergänzen, die KI erzeugt keine SMS).

- [ ] **Step 8: Commit**

```bash
git add scripts/sql/2026-10-13-sms-nachfass-enums.sql prisma/schema.prisma src/lib/domain/enums.ts "src/app/(app)/cases/[id]/verwaltung/page.tsx"
git commit -m "feat(kontakt): Enum-Werte fuer SMS-Vermerk und Nicht-erreicht-Vorlage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `smsLink` in `telefon.ts`

**Files:**
- Modify: `src/lib/kontakt/telefon.ts` (nach `waLink`)
- Test: `tests/telefon-links.test.ts`

**Interfaces:**
- Consumes: `waLink(nummer: string | null): string | null` (vorhanden).
- Produces: `smsLink(nummer: string | null, text: string): string | null`

- [ ] **Step 1: Failing Tests anhängen** (in `tests/telefon-links.test.ts`, Import um `smsLink` erweitern)

```ts
describe("smsLink", () => {
  it("nimmt die internationale Form mit Pluszeichen", () => {
    expect(smsLink("0170 1234567", "Hallo")).toBe("sms:+491701234567&body=Hallo");
  });

  it("deutet Schreibweisen wie waLink", () => {
    for (const n of ["+49 170 1234567", "0049 170 1234567", "(0170) 123-4567", "00170 1234567"]) {
      expect(smsLink(n, "x")).toBe("sms:+491701234567&body=x");
    }
  });

  it("liefert ohne brauchbare Nummer keinen Link", () => {
    expect(smsLink(null, "x")).toBeNull();
    expect(smsLink("", "x")).toBeNull();
    expect(smsLink("123", "x")).toBeNull();
    expect(smsLink("030 12345678-100", "x")).toBeNull();
  });

  it("kodiert Umlaute und Sonderzeichen im Text", () => {
    const link = smsLink("0170 1234567", "Bad Tölz & Söhne? #1")!;
    const body = link.split("&body=")[1]!;
    expect(body).not.toMatch(/[ &?#]/);
    expect(decodeURIComponent(body)).toBe("Bad Tölz & Söhne? #1");
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/telefon-links.test.ts`
Expected: FAIL – `smsLink` ist nicht exportiert.

- [ ] **Step 3: Implementieren** (am Ende von `telefon.ts`)

```ts
/**
 * `sms:`-Link mit vorbefülltem Text.
 *
 * Die Nummer kommt aus `waLink`: EINE Deutung der Ziffern für alle
 * Schreibkanäle – die Fallakte darf eine SMS nicht an jemand anderen
 * vorschlagen als den WhatsApp-Knopf daneben. Das Pluszeichen ist Pflicht,
 * ohne es liest die Nachrichten-App "49170…" als Inlandsnummer.
 *
 * `&body=` statt `?body=`: die Form, die iOS und die Nachrichten-App am Mac
 * verstehen. Ob der Mac den Text übernimmt, hängt an der macOS-Version –
 * deshalb steht in der Karte immer ein Kopierknopf daneben.
 */
export function smsLink(nummer: string | null, text: string): string | null {
  const wa = waLink(nummer);
  if (!wa) return null;
  const international = wa.slice("https://wa.me/".length);
  return `sms:+${international}&body=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 4: Tests grün**

Run: `npx vitest run tests/telefon-links.test.ts`
Expected: PASS (alle, auch die alten).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kontakt/telefon.ts tests/telefon-links.test.ts
git commit -m "feat(kontakt): sms-Link mit vorbefuelltem Text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Textbausteine und Sichtbarkeit (`sms-nachfass.ts`)

**Files:**
- Create: `src/lib/kontakt/sms-nachfass.ts`
- Test: `tests/sms-nachfass.test.ts`

**Interfaces:**
- Produces:
  - `SMS_NACHFASS_FENSTER_STUNDEN = 12`
  - `websiteKurz(url: string | null | undefined): string` → `"baufivergleicher.de"` oder `""`
  - `smsNachfassVars(e: SmsNachfassEingabe): Record<"smsAnrede" | "objektOrt" | "beraterName" | "beraterWebsite", string>`
  - `interface SmsNachfassEingabe { anrede?: string | null; vorname?: string | null; nachname?: string | null; ort?: string | null; plz?: string | null; beraterName: string; website?: string | null }`
  - `interface KontaktVermerk { kind: string; ergebnis: "erreicht" | "nicht_erreicht" | null; createdAt: Date }`
  - `smsAngebotOffen(vermerke: KontaktVermerk[], jetzt: Date): boolean`

- [ ] **Step 1: Failing Tests**

```ts
import { describe, expect, it } from "vitest";
import { smsAngebotOffen, smsNachfassVars, websiteKurz } from "@/lib/kontakt/sms-nachfass";

const basis = { beraterName: "Jürgen Ertel" };

describe("smsNachfassVars", () => {
  it("nutzt Anrede und Nachnamen", () => {
    const v = smsNachfassVars({ ...basis, anrede: "frau", vorname: "Anna", nachname: "Müller" });
    expect(v.smsAnrede).toBe("Guten Tag Frau Müller,");
  });

  it("nimmt ohne Anrede den vollen Namen", () => {
    expect(smsNachfassVars({ ...basis, vorname: "Max", nachname: "Müller" }).smsAnrede).toBe("Guten Tag Max Müller,");
    expect(smsNachfassVars({ ...basis, anrede: "herr", vorname: "Max" }).smsAnrede).toBe("Guten Tag Max,");
  });

  it("grüßt ohne Namen neutral", () => {
    expect(smsNachfassVars({ ...basis, vorname: "  ", nachname: null }).smsAnrede).toBe("Guten Tag,");
  });

  it("nennt den Ort, sonst die PLZ, sonst nichts", () => {
    expect(smsNachfassVars({ ...basis, ort: "Leipzig", plz: "04109" }).objektOrt).toBe(" für eine Immobilie in Leipzig");
    expect(smsNachfassVars({ ...basis, ort: " ", plz: "04109" }).objektOrt).toBe(" für eine Immobilie in 04109");
    expect(smsNachfassVars({ ...basis }).objektOrt).toBe("");
  });

  it("setzt die Website in Klammern oder lässt sie weg", () => {
    expect(smsNachfassVars({ ...basis, website: "https://www.baufivergleicher.de/" }).beraterWebsite).toBe(" (baufivergleicher.de)");
    expect(smsNachfassVars({ ...basis, website: null }).beraterWebsite).toBe("");
    expect(smsNachfassVars({ ...basis }).beraterName).toBe("Jürgen Ertel");
  });
});

describe("websiteKurz", () => {
  it("entfernt Schema, www und Schrägstrich", () => {
    expect(websiteKurz("https://www.baufivergleicher.de/")).toBe("baufivergleicher.de");
    expect(websiteKurz("http://baufivergleicher.de")).toBe("baufivergleicher.de");
    expect(websiteKurz("www.baufivergleicher.de")).toBe("baufivergleicher.de");
    expect(websiteKurz("  ")).toBe("");
    expect(websiteKurz(undefined)).toBe("");
  });
});

describe("smsAngebotOffen", () => {
  const jetzt = new Date("2026-10-13T12:00:00Z");
  const vor = (stunden: number) => new Date(jetzt.getTime() - stunden * 3600_000);

  it("ist offen direkt nach einem erfolglosen Anruf", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(0.1) }], jetzt)).toBe(true);
  });

  it("schließt nach 12 Stunden", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(12) }], jetzt)).toBe(true);
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(12.01) }], jetzt)).toBe(false);
  });

  it("schließt, sobald danach eine SMS vermerkt ist", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
          { kind: "sms", ergebnis: null, createdAt: vor(0.5) },
        ],
        jetzt
      )
    ).toBe(false);
  });

  it("ist zu, wenn der letzte Vermerk erreicht oder WhatsApp war", () => {
    expect(smsAngebotOffen([{ kind: "telefon", ergebnis: "erreicht", createdAt: vor(0.1) }], jetzt)).toBe(false);
    expect(
      smsAngebotOffen(
        [
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
          { kind: "whatsapp", ergebnis: "nicht_erreicht", createdAt: vor(0.5) },
        ],
        jetzt
      )
    ).toBe(false);
  });

  it("öffnet wieder beim nächsten erfolglosen Anruf nach einer SMS", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "sms", ergebnis: null, createdAt: vor(30) },
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
        ],
        jetzt
      )
    ).toBe(true);
  });

  it("ignoriert Notizen und andere Vermerke und hängt nicht an der Reihenfolge der Eingabe", () => {
    expect(
      smsAngebotOffen(
        [
          { kind: "notiz", ergebnis: null, createdAt: vor(0.1) },
          { kind: "telefon", ergebnis: "nicht_erreicht", createdAt: vor(1) },
        ],
        jetzt
      )
    ).toBe(true);
    expect(smsAngebotOffen([], jetzt)).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/sms-nachfass.test.ts`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
/**
 * Die SMS nach einem erfolglosen Anruf: Textbausteine und wann die Fallseite
 * sie anbietet. Reine Funktionen, keine DB, keine Uhr (`jetzt` kommt herein –
 * dieselbe Regel wie in `kontakt.ts`).
 *
 * BaufiDesk verschickt die SMS nicht. Es baut nur den Text, den Jürgen in
 * der Nachrichten-App seines iPhones abschickt.
 */

/** Der Text sagt "eben nicht erreicht" – nach einem halben Tag stimmt das nicht mehr. */
export const SMS_NACHFASS_FENSTER_STUNDEN = 12;

/** Kanäle, die als Kontaktvermerk zählen. Notizen und Wiedervorlagen nicht. */
const KONTAKT_KINDS = new Set(["telefon", "whatsapp", "sms"]);

export interface SmsNachfassEingabe {
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  ort?: string | null;
  plz?: string | null;
  beraterName: string;
  website?: string | null;
}

export interface KontaktVermerk {
  kind: string;
  ergebnis: "erreicht" | "nicht_erreicht" | null;
  createdAt: Date;
}

function sauber(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** "https://www.baufivergleicher.de/" → "baufivergleicher.de". */
export function websiteKurz(url: string | null | undefined): string {
  return sauber(url)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/**
 * Jeder Baustein bringt sein eigenes führendes Leerzeichen mit oder ist leer.
 * So entsteht ohne Ort kein "Immobilie in ." und ohne Website keine leere
 * Klammer – die Vorlage selbst muss davon nichts wissen.
 */
export function smsNachfassVars(e: SmsNachfassEingabe) {
  const vorname = sauber(e.vorname);
  const nachname = sauber(e.nachname);
  const anredeWort = e.anrede === "frau" ? "Frau" : e.anrede === "herr" ? "Herr" : "";

  let smsAnrede = "Guten Tag,";
  if (anredeWort && nachname) smsAnrede = `Guten Tag ${anredeWort} ${nachname},`;
  else if (vorname || nachname) smsAnrede = `Guten Tag ${[vorname, nachname].filter(Boolean).join(" ")},`;

  const ort = sauber(e.ort) || sauber(e.plz);
  const web = websiteKurz(e.website);

  return {
    smsAnrede,
    objektOrt: ort ? ` für eine Immobilie in ${ort}` : "",
    beraterName: sauber(e.beraterName),
    beraterWebsite: web ? ` (${web})` : "",
  };
}

/**
 * Bietet die Fallseite gerade die SMS an? Ja, wenn der jüngste
 * Kontaktvermerk ein erfolgloser ANRUF ist und höchstens zwölf Stunden alt.
 *
 * Eine SMS danach ist selbst der jüngste Vermerk und schließt das Angebot
 * damit von allein – es braucht keinen eigenen Zustand.
 */
export function smsAngebotOffen(vermerke: KontaktVermerk[], jetzt: Date): boolean {
  const juengster = vermerke
    .filter((v) => KONTAKT_KINDS.has(v.kind))
    .reduce<KontaktVermerk | null>((j, v) => (!j || v.createdAt > j.createdAt ? v : j), null);
  if (!juengster) return false;
  if (juengster.kind !== "telefon" || juengster.ergebnis !== "nicht_erreicht") return false;
  return jetzt.getTime() - juengster.createdAt.getTime() <= SMS_NACHFASS_FENSTER_STUNDEN * 3600_000;
}
```

- [ ] **Step 4: Tests grün**

Run: `npx vitest run tests/sms-nachfass.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/kontakt/sms-nachfass.ts tests/sms-nachfass.test.ts
git commit -m "feat(kontakt): Textbausteine und Sichtbarkeit der SMS nach Nicht erreicht

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Vorlage `nicht_erreicht:sms` und Text-Loader

**Files:**
- Modify: `src/lib/messages/render.ts` (`PLACEHOLDERS` Z. 10, `DEFAULT_TEMPLATES` Z. 64, `EDITABLE_TEMPLATES` Z. 176)
- Create: `src/lib/kontakt/sms-nachfass-text.ts`
- Test: `tests/sms-nachfass.test.ts` (erweitern)

**Interfaces:**
- Consumes: `smsNachfassVars`, `SmsNachfassEingabe` (Task 3); `renderTemplate`, `templateKey`, `DEFAULT_TEMPLATES` (vorhanden); Enum-Werte aus Task 1.
- Produces:
  - `renderSmsNachfass(body: string, e: SmsNachfassEingabe): string` (in `sms-nachfass.ts`, rein)
  - `ladeSmsNachfassText(a: { organizationId: string; userName: string; applicant: { anrede: string | null; vorname: string | null; nachname: string | null } | null; property: { city: string | null; zip: string | null } | null }): Promise<string>` (in `sms-nachfass-text.ts`, Server)

- [ ] **Step 1: Failing Tests** (an `tests/sms-nachfass.test.ts` anhängen; Import um `renderSmsNachfass` und `DEFAULT_TEMPLATES`/`templateKey` aus `@/lib/messages/render` erweitern)

```ts
describe("renderSmsNachfass", () => {
  const vorlage = DEFAULT_TEMPLATES[templateKey("nicht_erreicht", "sms")]!.body;

  it("ergibt den abgestimmten Text", () => {
    expect(
      renderSmsNachfass(vorlage, {
        anrede: "frau",
        nachname: "Müller",
        ort: "Leipzig",
        beraterName: "Jürgen Ertel",
        website: "https://www.baufivergleicher.de",
      })
    ).toBe(
      "Guten Tag Frau Müller, vielen Dank für Ihre Finanzierungsanfrage für eine Immobilie in Leipzig. " +
        "Ich habe Sie eben leider telefonisch nicht erreicht. Wann kann ich Sie am besten erreichen? " +
        "Viele Grüße, Jürgen Ertel (baufivergleicher.de)"
    );
  });

  it("bleibt ohne Name, Ort und Website ein ganzer Satz", () => {
    const text = renderSmsNachfass(vorlage, { beraterName: "Jürgen Ertel" });
    expect(text).toBe(
      "Guten Tag, vielen Dank für Ihre Finanzierungsanfrage. Ich habe Sie eben leider telefonisch nicht erreicht. " +
        "Wann kann ich Sie am besten erreichen? Viele Grüße, Jürgen Ertel"
    );
  });

  it("räumt doppelte Leerzeichen einer umformulierten Vorlage auf", () => {
    expect(renderSmsNachfass("  {{smsAnrede}}  hallo {{objektOrt}}  ", { beraterName: "X" })).toBe("Guten Tag, hallo");
  });

  it("ist in der Vorlagenverwaltung bearbeitbar", () => {
    expect(EDITABLE_TEMPLATES.some((t) => t.type === "nicht_erreicht" && t.channel === "sms")).toBe(true);
  });
});
```

(`EDITABLE_TEMPLATES` ebenfalls aus `@/lib/messages/render` importieren.)

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/sms-nachfass.test.ts`
Expected: FAIL – Vorlage und `renderSmsNachfass` fehlen.

- [ ] **Step 3: Vorlage in `render.ts`**

In `PLACEHOLDERS` anhängen:

```ts
  { token: "{{smsAnrede}}", description: "SMS: „Guten Tag Frau Müller,“ (ohne Namen „Guten Tag,“)" },
  { token: "{{objektOrt}}", description: "SMS: „ für eine Immobilie in Leipzig“ (leer ohne Ort)" },
  { token: "{{beraterName}}", description: "SMS: Ihr Name" },
  { token: "{{beraterWebsite}}", description: "SMS: „ (ihre-domain.de)“ aus den Organisationsdaten (leer ohne Website)" },
```

In `DEFAULT_TEMPLATES` anhängen (kein `subject`, eine Zeile – SMS kennt keinen Absatz):

```ts
  [templateKey("nicht_erreicht", "sms")]: {
    body: "{{smsAnrede}} vielen Dank für Ihre Finanzierungsanfrage{{objektOrt}}. Ich habe Sie eben leider telefonisch nicht erreicht. Wann kann ich Sie am besten erreichen? Viele Grüße, {{beraterName}}{{beraterWebsite}}",
  },
```

In `EDITABLE_TEMPLATES` nach der WhatsApp-Zeile:

```ts
  { type: "nicht_erreicht", channel: "sms", label: "Nicht erreicht – Rückrufbitte (SMS)" },
```

Prüfen, dass `src/app/(app)/settings/vorlagen/page.tsx` und `src/lib/actions/templates.ts` die Zeile ohne Betreff korrekt anzeigen/speichern (die WhatsApp-Vorlage hat ebenfalls keinen Betreff – gleiches Verhalten erwartet). Falls der Editor einen Betreff erzwingt: an der Stelle denselben Zweig wie für `whatsapp` nehmen (`channel !== "email"`).

- [ ] **Step 4: `renderSmsNachfass` in `sms-nachfass.ts`**

```ts
import { renderTemplate } from "@/lib/messages/render";

/**
 * Füllt die (ggf. vom Vermittler umformulierte) Vorlage. Mehrfach-Leerzeichen
 * werden zusammengezogen: Ein weggelassener Baustein darf in einer SMS keine
 * Lücke hinterlassen, die wie ein Tippfehler aussieht.
 */
export function renderSmsNachfass(body: string, e: SmsNachfassEingabe): string {
  return renderTemplate(body, smsNachfassVars(e)).replace(/[ \t]{2,}/g, " ").trim();
}
```

(Unbekannte Platzhalter ersetzt `renderTemplate` durch „“ – gewollt.)

- [ ] **Step 5: Tests grün**

Run: `npx vitest run tests/sms-nachfass.test.ts`
Expected: PASS

- [ ] **Step 6: Server-Loader `src/lib/kontakt/sms-nachfass-text.ts`**

```ts
import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES, templateKey } from "@/lib/messages/render";
import { getBrokerInfo } from "@/lib/organization/broker-info";
import { renderSmsNachfass } from "@/lib/kontakt/sms-nachfass";

/**
 * Der fertige SMS-Text für die Fallseite: Vorlage der Organisation vor
 * Standardvorlage (wie beim Erstkontakt), Name des eingeloggten Beraters,
 * Website aus den Organisationsdaten. Die Website steht bewusst nicht fest im
 * Text – beim zweiten Vermittler stünde sonst Jürgens Domain in der SMS.
 */
export async function ladeSmsNachfassText(a: {
  organizationId: string;
  userName: string;
  applicant: { anrede: string | null; vorname: string | null; nachname: string | null } | null;
  property: { city: string | null; zip: string | null } | null;
}): Promise<string> {
  const [broker, override] = await Promise.all([
    getBrokerInfo(a.organizationId),
    prisma.messageTemplate.findFirst({
      where: { organizationId: a.organizationId, type: "nicht_erreicht", channel: "sms" },
      select: { body: true },
    }),
  ]);
  const body = override?.body ?? DEFAULT_TEMPLATES[templateKey("nicht_erreicht", "sms")]!.body;
  return renderSmsNachfass(body, {
    anrede: a.applicant?.anrede,
    vorname: a.applicant?.vorname,
    nachname: a.applicant?.nachname,
    ort: a.property?.city,
    plz: a.property?.zip,
    beraterName: a.userName || broker.name,
    website: broker.website,
  });
}
```

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/lib/messages/render.ts src/lib/kontakt/sms-nachfass.ts src/lib/kontakt/sms-nachfass-text.ts tests/sms-nachfass.test.ts
git commit -m "feat(kontakt): bearbeitbare Vorlage fuer die SMS nach Nicht erreicht

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Vermerk „SMS geschrieben“ in `kontaktVersuchErfassen`

**Files:**
- Modify: `src/lib/actions/case-management.ts:130-189`
- Test: `tests/kontakt-erfassen.test.ts`

**Interfaces:**
- Consumes: `CaseNoteKind` mit `"sms"` (Task 1).
- Produces: `kontaktVersuchErfassen(caseId, formData)` akzeptiert `kanal = "sms"` ohne `ergebnis`.

- [ ] **Step 1: Failing Tests** (in den bestehenden `describe` anhängen)

```ts
  it("vermerkt eine SMS ohne Ergebnis und ohne Versuchszaehler", async () => {
    noteCount.mockResolvedValue(3);
    await kontaktVersuchErfassen("case-A", form({ kanal: "sms" }));
    expect(noteCreate).toHaveBeenCalledTimes(1);
    const daten = noteCreate.mock.calls[0]![0].data;
    expect(daten.kind).toBe("sms");
    expect(daten.ergebnis).toBeUndefined();
    expect(daten.body).toBe("SMS geschrieben.");
    expect(noteCount).not.toHaveBeenCalled();
  });

  it("ignoriert ein mitgeschicktes Ergebnis bei der SMS", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "sms", ergebnis: "nicht_erreicht" }));
    expect(noteCreate.mock.calls[0]![0].data.ergebnis).toBeUndefined();
  });
```

- [ ] **Step 2: Test laufen lassen**

Run: `npx vitest run tests/kontakt-erfassen.test.ts`
Expected: FAIL – `sms` wird beim Kanal-Check verworfen, `noteCreate` nicht aufgerufen.

- [ ] **Step 3: Implementieren**

`KONTAKT_KANAELE` (Z. 130) erweitern:

```ts
const KONTAKT_KANAELE = ["telefon", "whatsapp", "sms"] as const;
```

In `kontaktVersuchErfassen` direkt nach dem Kanal-Check (vor dem Ergebnis-Check) einen eigenen Zweig:

```ts
  if (!(KONTAKT_KANAELE as readonly string[]).includes(kanalRoh ?? "")) return;

  // Die SMS gehoert zum Anruf davor, sie ist kein eigener Versuch: Mit
  // `ergebnis` zaehlte `kontaktStand` sie mit – nach einem einzigen Anruf
  // stuende "2. Versuch" da, und der Abstand bis zum naechsten Anruf liefe
  // ab der SMS neu.
  if (kanalRoh === "sms") {
    await prisma.caseNote.create({
      data: { caseId, authorId: ctx.userId, kind: "sms", body: "SMS geschrieben." },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "case.updated",
      entityType: "case",
      entityId: caseId,
    });
    revalidateCase(caseId);
    revalidatePath("/dashboard");
    return;
  }

  if (!(KONTAKT_ERGEBNISSE as readonly string[]).includes(ergebnisRoh ?? "")) return;
```

Den bestehenden Ergebnis-Check an seiner alten Stelle entfernen (er steht jetzt hinter dem SMS-Zweig). Der Typ `kanal` danach bleibt `"telefon" | "whatsapp"` – falls TypeScript `"sms"` im späteren Ternary sieht, `kanal` als `Exclude<(typeof KONTAKT_KANAELE)[number], "sms">` casten.

- [ ] **Step 4: Tests grün, Typen ok**

Run: `npx vitest run tests/kontakt-erfassen.test.ts tests/kontakt-stand.test.ts && npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/case-management.ts tests/kontakt-erfassen.test.ts
git commit -m "feat(kontakt): Vermerk SMS geschrieben zaehlt nicht als Anrufversuch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `SmsNachfassKarte` auf der Fallseite + „Anrufen“ auch am Mac

**Files:**
- Create: `src/components/case/sms-nachfass-karte.tsx`
- Modify: `src/app/(app)/cases/[id]/page.tsx` (Ladeblock ~Z. 205-250, Rendering ~Z. 650-658)
- Modify: `src/components/case/kontakt-knopfreihe.tsx:44-67` (Kommentar + `md:hidden` entfernen)

**Interfaces:**
- Consumes: `smsLink` (Task 2), `smsAngebotOffen`, `KontaktVermerk` (Task 3), `ladeSmsNachfassText` (Task 4), `kontaktVersuchErfassen` mit `kanal=sms` (Task 5), `CopyButton` (`@/components/ui/copy-button`, Props `value`, `label`).
- Produces: `<SmsNachfassKarte caseId={string} link={string} text={string} />`

- [ ] **Step 1: Komponente**

```tsx
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { kontaktVersuchErfassen } from "@/lib/actions/case-management";

/**
 * Nach einem erfolglosen Anruf: die fertige SMS zum Hinterherschicken.
 *
 * Eine eigene Karte, nicht Teil der `KontaktKnopfreihe`: Die Reihe hängt am
 * Leiterschritt "Kunden anrufen", und der verschwindet nach "Nicht erreicht"
 * bis zum nächsten fälligen Versuch – ein SMS-Knopf darin wäre direkt nach
 * dem Klick weg gewesen.
 *
 * BaufiDesk verschickt nichts: "SMS schicken" öffnet die Nachrichten-App mit
 * Nummer und Text, abgeschickt wird dort. Ob der Mac den Text übernimmt,
 * hängt an der macOS-Version – dafür steht "Text kopieren" daneben.
 */
export function SmsNachfassKarte({ caseId, link, text }: { caseId: string; link: string; text: string }) {
  return (
    <div className="flaeche-ablage space-y-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Nicht erreicht – SMS hinterherschicken?
      </div>
      <p className="whitespace-pre-line rounded-md border bg-card px-3 py-2 text-sm">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={link}>
            <MessageSquare className="h-4 w-4" /> SMS schicken
          </a>
        </Button>
        <CopyButton value={text} label="Text kopieren" />
        <form action={kontaktVersuchErfassen.bind(null, caseId)}>
          <input type="hidden" name="kanal" value="sms" />
          <Button type="submit" variant="outline">
            SMS geschrieben
          </Button>
        </form>
      </div>
    </div>
  );
}
```

(Vor dem Schreiben `src/components/ui/copy-button.tsx` öffnen und die Props-Namen bestätigen; `flaeche-ablage` ist die vorhandene Flächenklasse, siehe `page.tsx` direkt unter der `Kennzahlzeile`.)

- [ ] **Step 2: Daten in `page.tsx` laden**

Im zweiten `Promise.all`-Block (der mit `wohnflaecheFreigegeben, offeneAnfragen, …`, ~Z. 255) eine weitere Abfrage ergänzen – NICHT die bestehende `caseNotes`-Abfrage aufweiten, denn deren `ergebnis!`-Mapping für `kontaktStand` verlangt `ergebnis ≠ null`:

```ts
      // Fuer das SMS-Angebot nach "Nicht erreicht": die juengsten
      // Kontaktvermerke INKLUSIVE der SMS (die kein `ergebnis` tragen und in
      // `caseRow.caseNotes` deshalb fehlen).
      prisma.caseNote.findMany({
        where: { caseId: id, kind: { in: ["telefon", "whatsapp", "sms"] } },
        select: { kind: true, ergebnis: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
```

und im Destructuring als `kontaktVermerke` aufnehmen.

Nach der Zeile `const telefon = caseRow.applicants[0]?.phone ?? caseRow.customer?.phone ?? null;` (~Z. 564) – bzw. falls `telefon` dort in einem inneren Block steht, auf Höhe des `kontaktStandFall` (~Z. 440) neu bilden – ergänzen:

```ts
  // SMS nach "Nicht erreicht": nur, solange das Angebot offen ist UND es eine
  // brauchbare Nummer gibt – im Zweifel lieber keine Karte (telefon.ts).
  const smsTelefon = caseRow.applicants[0]?.phone ?? caseRow.customer?.phone ?? null;
  const smsNachfass =
    smsAngebotOffen(kontaktVermerke, jetzt) && smsLink(smsTelefon, "")
      ? await (async () => {
          const text = await ladeSmsNachfassText({
            organizationId: ctx.organizationId,
            userName: ctx.userName,
            applicant: caseRow.applicants[0] ?? null,
            property: caseRow.property ?? null,
          });
          return { text, link: smsLink(smsTelefon, text)! };
        })()
      : null;
```

Imports ergänzen: `smsLink` aus `@/lib/kontakt/telefon`, `smsAngebotOffen` aus `@/lib/kontakt/sms-nachfass`, `ladeSmsNachfassText` aus `@/lib/kontakt/sms-nachfass-text`, `SmsNachfassKarte` aus `@/components/case/sms-nachfass-karte`.

Prüfen, dass `ctx` an dieser Stelle `userName` trägt (`requireContext()` liefert `userName`, siehe `src/lib/auth/context.ts:23`).

- [ ] **Step 3: Karte rendern** (direkt vor `<div className="hidden lg:block">`, ~Z. 650 – EINE Stelle für beide Breiten)

```tsx
            {smsNachfass && <SmsNachfassKarte caseId={id} link={smsNachfass.link} text={smsNachfass.text} />}
```

- [ ] **Step 4: „Anrufen“ auf allen Breiten** (`kontakt-knopfreihe.tsx`)

`className="md:hidden"` am Anrufen-Button entfernen und `title` ergänzen:

```tsx
      {anrufLink && (
        <Button asChild variant="default">
          <a href={anrufLink} title="Am Mac über „Anrufe über iPhone“">
            <Phone className="h-4 w-4" /> Anrufen
          </a>
        </Button>
      )}
```

Den Kommentarblock darüber anpassen: Der Wähl-Link steht jetzt überall, weil Jürgen am Mac über „Anrufe über iPhone“ wählt (13.10.2026); Nummer + Kopierknopf bleiben, weil der Knopf ohne diese Einrichtung am Mac nichts tut (Grund vom 15.08. gilt weiter).

- [ ] **Step 5: Typen und Tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: keine Fehler, alles grün.

- [ ] **Step 6: Im Browser ansehen** (lokal, siehe Memory „Lokale DB ohne Docker“: PGlite auf 5433, `.env` zeigt sonst auf PROD)

`npm run dev`, einen Testfall mit Telefonnummer öffnen, „Nicht erreicht“ klicken. Erwartet: Karte erscheint mit korrektem Text; „SMS geschrieben“ → Karte weg, Vermerkliste unter `/cases/<id>/verwaltung` zeigt „SMS geschrieben.“ mit SMS-Symbol; der Titel des nächsten Anrufschritts zählt nicht hoch. Kein horizontaler Überlauf bei langem Text (Memory „Unsichtbare Aktionen durch Überlauf“): schmalen Viewport (390 px) prüfen.

- [ ] **Step 7: Commit**

```bash
git add src/components/case/sms-nachfass-karte.tsx "src/app/(app)/cases/[id]/page.tsx" src/components/case/kontakt-knopfreihe.tsx
git commit -m "feat(kontakt): SMS-Karte nach Nicht erreicht, Anrufen auch am Mac

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Website prüfen, deployen, live gegenprüfen

**Files:** keine Codeänderung (ggf. eine SQL-Datei im Scratchpad).

- [ ] **Step 1: Website der Organisation prüfen**

Lese-SQL im Scratchpad: `SELECT id, name, website FROM "unterlagenpilot"."organizations"` über `scripts/supabase-sql.sh`. Steht bei Jürgens Organisation nicht `baufivergleicher.de` (in irgendeiner Schreibweise), Jürgen fragen, ob es dort eingetragen werden soll (die Website erscheint auch in der Mail-Signatur `buildSignature` – deshalb nicht stumm setzen).

- [ ] **Step 2: Gesamte Suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: grün.

- [ ] **Step 3: Deploy** (Memory „Immer deployen, nicht fragen“)

```bash
git push origin main
```

- [ ] **Step 4: Live gegenprüfen** (Memory „‚Live'-Behauptungen prüfen“)

- `git merge-base --is-ancestor HEAD origin/main` → Exit 0.
- Vercel-Deployment für den Commit auf `READY` (`vercel ls` / `vercel inspect`).
- Auf baufidesk.de in einem echten Fall mit Jürgens eigener Nummer: „Nicht erreicht“ → Karte → „SMS schicken“ am iPhone (Text vorbefüllt?) und am Mac (Text vorbefüllt oder nur Nummer?). Ergebnis im Bericht nennen. Danach den Testvermerk in der Verwaltung stehen lassen oder mit Jürgen klären.

- [ ] **Step 5: Memory**

Neue Memory-Datei `sms-nach-nicht-erreicht.md` (Projekt): Karte statt Knopfreihe und warum, SMS-Vermerk ohne `ergebnis`, Ergebnis des Mac-Tests; Zeile in `MEMORY.md`.
