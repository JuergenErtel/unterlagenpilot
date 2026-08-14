# Vom Lead zum Abschluss – Umsetzungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Die Prioritätsleiter begleitet ab sofort auch die Strecke zwischen Leadeingang und Erstgespräch — Kontaktversuche werden festgehalten, der nächste Anruf wird fällig gestellt, und nach drei erfolglosen Tagen schlägt BaufiDesk den Abbruch vor.

**Architektur:** Eine Zeitachse über der vorhandenen Leiter, kein zweiter Führungsmechanismus. Kontaktversuche sind `CaseNote`-Zeilen mit einem Ergebnis; alles Weitere (Fälligkeit, Versuchszahl, Abbruch) wird daraus abgeleitet. Die Ableitung ist eine reine Funktion ohne Uhr — der Aufrufer übergibt `jetzt`. Dadurch braucht es keinen Scheduler und keinen gespeicherten Zustand, der auseinanderlaufen kann.

**Tech-Stack:** Next.js 15 App Router, Prisma/PostgreSQL (Supabase), Vitest, Server Actions.

**Spec:** `docs/superpowers/specs/2026-08-14-vom-lead-zum-abschluss-design.md`

## Globale Vorgaben

- **Nichts verschickt automatisch.** Keine Mail, keine Nachricht verlässt das Haus ohne Klick. Das gilt ausnahmslos für jede Aufgabe in diesem Plan.
- **Deutsch** in Bezeichnern, Kommentaren und Oberflächentexten, wie im ganzen Projekt.
- **Vorgabewerte:** `KONTAKT_ABSTAND_STUNDEN` = 12, `KONTAKT_FRIST_TAGE` = 3.
- **Zeit wird nie gemessen, sondern übergeben.** Jede zeitabhängige Funktion nimmt `jetzt: Date` als Parameter — Tests dürfen nie gegen die echte Uhr laufen.
- **Neue Enum-Werte** müssen in `prisma/schema.prisma` **und** `src/lib/domain/enums.ts` stehen; die beiden werden von Hand synchron gehalten (siehe Kommentar am Kopf des Schemas).
- Tests laufen mit `npx vitest run <datei>`, Typprüfung mit `npx tsc --noEmit`.

---

### Aufgabe 1: Schema um Kontaktergebnis erweitern

**Dateien:**
- Ändern: `prisma/schema.prisma` (Enum `CaseNoteKind`, Model `CaseNote`)
- Ändern: `src/lib/domain/enums.ts:133-134` (`CASE_NOTE_KINDS`, `CASE_NOTE_KIND_LABELS`)
- Erstellen: `sql/2026-08-14-kontaktversuche.sql`

**Schnittstellen:**
- Liefert: Enum-Wert `whatsapp` in `CaseNoteKind`; neuer Prisma-Enum `KontaktErgebnis` mit `erreicht | nicht_erreicht`; Spalte `CaseNote.ergebnis` (nullable).

- [ ] **Schritt 1: Enum und Spalte im Prisma-Schema ergänzen**

In `prisma/schema.prisma`, beim Enum `CaseNoteKind` den Wert ergänzen und den neuen Enum sowie das Feld anlegen:

```prisma
enum CaseNoteKind {
  notiz
  telefon
  email
  whatsapp
  wiedervorlage
}

/// Ergebnis eines Kontaktversuchs. Nur gesetzt, wenn der Vermerk ein
/// Kontaktversuch ist – ein freier Vermerk laesst das Feld leer.
enum KontaktErgebnis {
  erreicht
  nicht_erreicht
}
```

Im Model `CaseNote` unter `kind`:

```prisma
  ergebnis  KontaktErgebnis?
```

- [ ] **Schritt 2: Beschriftungen in enums.ts nachziehen**

In `src/lib/domain/enums.ts`, `CASE_NOTE_KINDS` um `"whatsapp"` erweitern (Reihenfolge wie im Schema) und in `CASE_NOTE_KIND_LABELS` ergänzen:

```ts
  whatsapp: "WhatsApp",
```

Zusätzlich im selben Stil ergänzen:

```ts
/** Ergebnis eines Kontaktversuchs; leer bei freien Vermerken. */
export const KONTAKT_ERGEBNISSE = ["erreicht", "nicht_erreicht"] as const;
export type KontaktErgebnis = (typeof KONTAKT_ERGEBNISSE)[number];

export const KONTAKT_ERGEBNIS_LABELS: Record<KontaktErgebnis, string> = {
  erreicht: "Erreicht",
  nicht_erreicht: "Nicht erreicht",
};
```

- [ ] **Schritt 3: Prisma-Client neu erzeugen und Typprüfung**

```bash
npx prisma generate
npx tsc --noEmit
```

Erwartet: fehlerfrei.

- [ ] **Schritt 4: SQL für die Produktivdatenbank schreiben**

Erstelle `sql/2026-08-14-kontaktversuche.sql`:

```sql
-- Kontaktversuche: WhatsApp als Vermerk-Art, Ergebnis am Vermerk.
-- Beides additiv – Bestandsvermerke bleiben unveraendert gueltig.
ALTER TYPE "CaseNoteKind" ADD VALUE IF NOT EXISTS 'whatsapp';

DO $$ BEGIN
  CREATE TYPE "KontaktErgebnis" AS ENUM ('erreicht', 'nicht_erreicht');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE case_notes ADD COLUMN IF NOT EXISTS "ergebnis" "KontaktErgebnis";
```

**Achtung:** `ALTER TYPE ... ADD VALUE` und die Verwendung des neuen Werts dürfen nicht in derselben Transaktion stehen. Dieses Skript verwendet den Wert nicht — es legt ihn nur an. Schlägt es dennoch mit „unsafe use of new value" fehl, die drei Anweisungen einzeln ausführen.

- [ ] **Schritt 5: Gegen die Produktivdatenbank fahren**

Erst trocken, dann echt:

```bash
scripts/supabase-sql.sh sql/2026-08-14-kontaktversuche.sql --dry-run
scripts/supabase-sql.sh sql/2026-08-14-kontaktversuche.sql
```

Erwartet: „Erfolgreich." Niemals `prisma migrate diff` in voller Breite anwenden — das Schema der Produktion trägt Abweichungen.

- [ ] **Schritt 6: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/enums.ts sql/2026-08-14-kontaktversuche.sql
git commit -m "feat(kontakt): Vermerke koennen ein Kontaktergebnis tragen

WhatsApp als Vermerk-Art und ein optionales Ergebnis (erreicht /
nicht_erreicht) am CaseNote. Beides additiv: Bestandsvermerke bleiben
unveraendert gueltig, ein freier Vermerk laesst das Ergebnis leer.

Damit ist ein Kontaktversuch ein Vermerk mit Ergebnis – und erscheint ohne
Zusatzarbeit in der vorhandenen Vermerk-Liste der Verwaltungsseite."
```

---

### Aufgabe 2: Kontaktstand ableiten (reine Funktion)

**Dateien:**
- Erstellen: `src/lib/cases/kontakt.ts`
- Ändern: `src/lib/env.ts` (zwei neue Variablen)
- Erstellen: `tests/kontakt-stand.test.ts`

**Schnittstellen:**
- Nutzt: `KontaktErgebnis` aus Aufgabe 1.
- Liefert: `kontaktStand(versuche, leadEingangAm, jetzt, einstellungen): KontaktStand` und `kontaktEinstellungen(): KontaktEinstellungen`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/kontakt-stand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { kontaktStand, type Kontaktversuch } from "@/lib/cases/kontakt";

const EINSTELLUNGEN = { abstandStunden: 12, fristTage: 3 };
const LEAD = new Date("2026-08-10T09:00:00Z");

/** Kontaktversuch zu einem Zeitpunkt relativ zum Leadeingang (in Stunden). */
function versuch(stundenNachLead: number, ergebnis: Kontaktversuch["ergebnis"]): Kontaktversuch {
  return { ergebnis, createdAt: new Date(LEAD.getTime() + stundenNachLead * 3600_000) };
}
const jetzt = (stundenNachLead: number) => new Date(LEAD.getTime() + stundenNachLead * 3600_000);

describe("kontaktStand", () => {
  it("ist sofort faellig, wenn noch nie versucht wurde", () => {
    const s = kontaktStand([], LEAD, jetzt(1), EINSTELLUNGEN);
    expect(s.faellig).toBe(true);
    expect(s.versuche).toBe(0);
    expect(s.jeErreicht).toBe(false);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("haelt nach einem Fehlversuch den Abstand ein", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(2), EINSTELLUNGEN);
    expect(s.faellig).toBe(false);
    expect(s.versuche).toBe(1);
  });

  it("wird nach Ablauf des Abstands wieder faellig", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(14), EINSTELLUNGEN);
    expect(s.faellig).toBe(true);
    expect(s.versuche).toBe(1);
  });

  it("zaehlt nur die erfolglosen Versuche", () => {
    const s = kontaktStand(
      [versuch(1, "nicht_erreicht"), versuch(13, "nicht_erreicht"), versuch(25, "nicht_erreicht")],
      LEAD,
      jetzt(40),
      EINSTELLUNGEN
    );
    expect(s.versuche).toBe(3);
  });

  it("beendet die Strecke, sobald einmal erreicht wurde", () => {
    const s = kontaktStand(
      [versuch(1, "nicht_erreicht"), versuch(13, "erreicht")],
      LEAD,
      jetzt(40),
      EINSTELLUNGEN
    );
    expect(s.jeErreicht).toBe(true);
    expect(s.faellig).toBe(false);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("schlaegt nach drei Tagen ohne Kontakt den Abbruch vor", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(73), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(true);
  });

  it("schlaegt keinen Abbruch vor, wenn erreicht wurde – auch nach der Frist", () => {
    // "erreicht" gewinnt immer, sonst gaebe die Leiter einen laengst
    // laufenden Fall zum Abschuss frei.
    const s = kontaktStand([versuch(2, "erreicht")], LEAD, jetzt(200), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("schlaegt vor Ablauf der Frist keinen Abbruch vor", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(71), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/kontakt-stand.test.ts`
Erwartet: FEHLSCHLAG, „Cannot find module '@/lib/cases/kontakt'".

- [ ] **Schritt 3: Die Ableitung schreiben**

Erstelle `src/lib/cases/kontakt.ts`:

```ts
import { getEnv } from "@/lib/env";

/**
 * Der Stand der telefonischen Kontaktaufnahme – abgeleitet, nie gespeichert.
 *
 * Kontaktversuche sind Vermerke (`CaseNote`) mit einem Ergebnis. Alles, was
 * die Leiter darüber wissen muss, ist eine Rechnung auf dieser Liste. Damit
 * kann kein Zustand auseinanderlaufen, und es braucht keinen Cron: Fälligkeit
 * entsteht durch Zeitablauf, nicht durch ein Ereignis, das jemand verpassen
 * könnte.
 *
 * `jetzt` wird übergeben und nie gemessen – sonst wären die Grenzfälle
 * (Abstand gerade abgelaufen, Frist gerade erreicht) nicht prüfbar.
 */
export interface Kontaktversuch {
  ergebnis: "erreicht" | "nicht_erreicht";
  createdAt: Date;
}

export interface KontaktEinstellungen {
  /** Abstand zwischen zwei Anrufversuchen. */
  abstandStunden: number;
  /** Frist ab Leadeingang, nach der ohne Kontakt der Abbruch vorgeschlagen wird. */
  fristTage: number;
}

export interface KontaktStand {
  /** Wurde der Kunde je erreicht? Beendet die Strecke. */
  jeErreicht: boolean;
  /** Anzahl der erfolglosen Versuche. */
  versuche: number;
  letzterVersuchAm: Date | null;
  /** Ab wann der nächste Versuch fällig ist; null heißt: sofort. */
  naechsterAb: Date | null;
  /** Ist jetzt ein Versuch fällig? */
  faellig: boolean;
  /** Ist die Frist ohne Kontakt verstrichen? */
  abbruchFaellig: boolean;
}

export function kontaktEinstellungen(): KontaktEinstellungen {
  const env = getEnv();
  return { abstandStunden: env.KONTAKT_ABSTAND_STUNDEN, fristTage: env.KONTAKT_FRIST_TAGE };
}

export function kontaktStand(
  versuche: Kontaktversuch[],
  leadEingangAm: Date,
  jetzt: Date,
  einstellungen: KontaktEinstellungen
): KontaktStand {
  const jeErreicht = versuche.some((v) => v.ergebnis === "erreicht");
  const erfolglos = versuche.filter((v) => v.ergebnis === "nicht_erreicht");

  const letzterVersuchAm = versuche.reduce<Date | null>(
    (spaetester, v) => (!spaetester || v.createdAt > spaetester ? v.createdAt : spaetester),
    null
  );
  const naechsterAb = letzterVersuchAm
    ? new Date(letzterVersuchAm.getTime() + einstellungen.abstandStunden * 3600_000)
    : null;

  const fristEndeAm = new Date(leadEingangAm.getTime() + einstellungen.fristTage * 86_400_000);

  return {
    jeErreicht,
    versuche: erfolglos.length,
    letzterVersuchAm,
    naechsterAb,
    faellig: !jeErreicht && (naechsterAb === null || jetzt >= naechsterAb),
    // "erreicht" gewinnt immer: Ein Fall, der laeuft, darf nie zum Abschuss
    // freigegeben werden, nur weil der Leadeingang lange her ist.
    abbruchFaellig: !jeErreicht && jetzt >= fristEndeAm,
  };
}
```

- [ ] **Schritt 4: Die beiden Umgebungsvariablen ergänzen**

In `src/lib/env.ts`, im Zod-Schema neben `REMINDER_AFTER_DAYS`:

```ts
  KONTAKT_ABSTAND_STUNDEN: z.coerce.number().int().min(1).default(12),
  KONTAKT_FRIST_TAGE: z.coerce.number().int().min(1).default(3),
```

Und in `.env.example` mit erklärendem Kommentar:

```
# Geführte Kontaktaufnahme: Abstand zwischen zwei Anrufversuchen (Stunden)
# und Frist ab Leadeingang, nach der ohne Kontakt der Abbruch vorgeschlagen wird.
KONTAKT_ABSTAND_STUNDEN=12
KONTAKT_FRIST_TAGE=3
```

- [ ] **Schritt 5: Tests und Typprüfung**

```bash
npx vitest run tests/kontakt-stand.test.ts
npx tsc --noEmit
```

Erwartet: 8 Tests grün, Typprüfung fehlerfrei.

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/cases/kontakt.ts src/lib/env.ts .env.example tests/kontakt-stand.test.ts
git commit -m "feat(kontakt): Kontaktstand als reine Ableitung aus den Vermerken

Faelligkeit, Versuchszahl und Abbruchreife werden aus den Kontaktvermerken
gerechnet statt gespeichert. Damit kann kein Zustand auseinanderlaufen, und
es braucht keinen Cron – Faelligkeit entsteht durch Zeitablauf, nicht durch
ein Ereignis, das jemand verpassen koennte.

jetzt wird uebergeben, nie gemessen: sonst waeren die Grenzfaelle (Abstand
gerade abgelaufen, Frist gerade erreicht) nicht pruefbar."
```

---

### Aufgabe 3: Drei neue Sprossen in der Prioritätsleiter

**Dateien:**
- Ändern: `src/lib/cases/next-step.ts` (Schlüssel-Union, `NextStepInput`, neue Funktion, zwei Einhängepunkte)
- Ändern: `tests/next-step.test.ts`

**Schnittstellen:**
- Nutzt: `KontaktStand` aus Aufgabe 2.
- Liefert: `NextStep.key` kennt zusätzlich `"kontakt_aufnehmen" | "kontakt_aufgeben" | "wiedervorlage_faellig"`; `NextStepInput` kennt `kontakt?: { stand: KontaktStand; telefon: string | null }` und `wiedervorlageFaellig?: boolean`.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `tests/next-step.test.ts` den Hilfstyp `TestInput` um die neuen Felder erweitern:

```ts
type TestInput = CockpitData &
  Pick<
    NextStepInput,
    "erstkontakt" | "erstgespraech" | "kontakt" | "wiedervorlageFaellig" | "verloren"
  >;
```

Den Typ-Import ergänzen:

```ts
import type { KontaktStand } from "@/lib/cases/kontakt";
```

Und die Fabrik `cockpit()` um die drei Felder erweitern (durchreichen wie die übrigen). Danach am Ende der Datei:

```ts
/** Kontaktstand-Attrappe – nur die Felder, die die Leiter liest. */
function stand(over: Partial<KontaktStand> = {}): KontaktStand {
  return {
    jeErreicht: false,
    versuche: 0,
    letzterVersuchAm: null,
    naechsterAb: null,
    faellig: true,
    abbruchFaellig: false,
    ...over,
  };
}

describe("Kontaktaufnahme in der Leiter", () => {
  it("steht vor dem Erstgespraech, solange niemand erreicht wurde", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("kontakt_aufnehmen");
  });

  it("nennt den Versuchsstand im Text", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 2 }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.title).toContain("3. Versuch");
  });

  it("tritt zurueck, sobald der Kunde erreicht wurde", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ jeErreicht: true, faellig: false }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("erstgespraech");
  });

  it("schweigt, solange der Abstand laeuft", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 1, faellig: false }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("erstgespraech");
  });

  it("bietet nach Fristablauf den Abbruch an", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ versuche: 4, abbruchFaellig: true }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("kontakt_aufgeben");
    expect(schritt.tone).toBe("blocker");
  });

  it("weist auf die fehlende Telefonnummer hin, statt stumm zu verschwinden", () => {
    // Ein Lead ohne Nummer ist ein Problem, keine Erledigung.
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: null },
      })
    );
    expect(schritt.key).toBe("kontakt_aufnehmen");
    expect(schritt.reason).toContain("Telefonnummer");
  });

  it("erscheint nicht bei abgegebenen Faellen", () => {
    const schritt = computeNextStep(
      cockpit({
        status: "uebertragen",
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
  });

  it("erscheint nicht mehr, wenn der Fall verloren ist", () => {
    // "Verloren" ist KEIN Status, sondern verlorenAm am Fall – die
    // LOCKED_CASE_STATUSES fangen es deshalb nicht ab.
    const schritt = computeNextStep(
      cockpit({
        verloren: true,
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: false, versendet: false },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand({ abbruchFaellig: true }), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).not.toBe("kontakt_aufnehmen");
    expect(schritt.key).not.toBe("kontakt_aufgeben");
  });

  it("wird von der Dokumentfreigabe verdraengt", () => {
    const schritt = computeNextStep(
      cockpit({
        counts: { pruefbereit: 3 },
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        erstgespraech: { offeneAngaben: 12 },
        kontakt: { stand: stand(), telefon: "0170 1234567" },
      })
    );
    expect(schritt.key).toBe("dokumente_freigeben");
  });
});

describe("Wiedervorlage in der Leiter", () => {
  it("mahnt eine faellige Wiedervorlage an", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        wiedervorlageFaellig: true,
      })
    );
    expect(schritt.key).toBe("wiedervorlage_faellig");
  });

  it("schweigt ohne faellige Wiedervorlage", () => {
    const schritt = computeNextStep(
      cockpit({
        erstkontakt: { empfaenger: "kunde@example.de", vorbereitet: true, versendet: true },
        wiedervorlageFaellig: false,
      })
    );
    expect(schritt.key).not.toBe("wiedervorlage_faellig");
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/next-step.test.ts`
Erwartet: FEHLSCHLAG — die neuen Schlüssel sind unbekannt, die Leiter liefert `erstgespraech`.

- [ ] **Schritt 3: Schnittstelle und Sprossen umsetzen**

In `src/lib/cases/next-step.ts` die Schlüssel-Union um drei Werte ergänzen:

```ts
    | "kontakt_aufnehmen"
    | "kontakt_aufgeben"
    | "wiedervorlage_faellig"
```

`NextStepInput` erweitern:

```ts
  /**
   * Stand der telefonischen Kontaktaufnahme. Fehlt der Block, verhaelt sich
   * die Leiter wie zuvor – ohne Kontaktstufen. Der Stand kommt fertig
   * gerechnet herein (`kontaktStand`), damit diese Datei ohne Uhr auskommt.
   */
  kontakt?: {
    stand: KontaktStand;
    /** Erste Nummer unter Antragsteller 1 bzw. Kunde; null, wenn keine da ist. */
    telefon: string | null;
  };
  /** Ob eine gesetzte Wiedervorlage heute faellig ist – vom Aufrufer gerechnet. */
  wiedervorlageFaellig?: boolean;
  /**
   * Fall als verloren markiert. Bewusst ein eigenes Feld: "verloren" ist KEIN
   * CaseStatus, sondern `verlorenAm` am Fall – `LOCKED_CASE_STATUSES` fangen
   * es also nicht ab.
   */
  verloren?: boolean;
```

Import ergänzen:

```ts
import type { KontaktStand } from "@/lib/cases/kontakt";
```

Neue Funktion, direkt über `erstgespraechSchritt`:

```ts
/**
 * Der frische Lead gehoert ans Telefon – und zwar VOR das Erstgespraech: Ohne
 * Kontakt gibt es kein Gespraech, das man fuehren koennte.
 *
 * An dieselben Waechter gebunden wie `erstgespraechSchritt`: Bei abgegebenen
 * Faellen und bei einer Bank-Nachforderung ist die Strecke vorbei.
 *
 * Ist der Abstand noch nicht abgelaufen, gibt die Funktion null zurueck – die
 * Leiter zeigt dann den naechsten Schritt darunter. Anrufen kann man trotzdem
 * jederzeit; die Sprosse mahnt nur, wenn es faellig ist.
 */
function kontaktSchritt(c: NextStepInput): NextStep | null {
  if (!c.kontakt) return null;
  if (c.verloren) return null;
  if (LOCKED_CASE_STATUSES.has(c.status as CaseStatus)) return null;
  if (c.status === "bank_nachforderung") return null;

  const { stand, telefon } = c.kontakt;
  if (stand.jeErreicht) return null;

  const ohneNummer = telefon
    ? ""
    : " Für diesen Fall ist keine Telefonnummer hinterlegt – ohne sie hilft nur der schriftliche Weg.";

  if (stand.abbruchFaellig) {
    return {
      key: "kontakt_aufgeben",
      title: "Seit drei Tagen nicht erreichbar – aufgeben?",
      reason: `${stand.versuche} Versuch${stand.versuche === 1 ? "" : "e"} ohne Kontakt. Du kannst den Fall als verloren markieren (Grund „Kunde nicht erreichbar") oder es weiter probieren.${ohneNummer}`,
      tone: "blocker",
    };
  }

  if (!stand.faellig) return null;

  const naechster = stand.versuche + 1;
  return {
    key: "kontakt_aufnehmen",
    title: naechster === 1 ? "Kunden anrufen" : `Kunden anrufen – ${naechster}. Versuch`,
    hervorgehoben: true,
    reason:
      naechster === 1
        ? `Der Lead ist frisch. Im Baufi-Vertrieb entscheidet die Geschwindigkeit des ersten Anrufs.${ohneNummer}`
        : `${stand.versuche} Versuch${stand.versuche === 1 ? "" : "e"} bisher ohne Kontakt.${ohneNummer}`,
    tone: "review",
  };
}
```

Einhängen: an **beiden** Stellen, an denen `erstgespraechSchritt(c)` aufgerufen wird, unmittelbar davor:

```ts
    const vorDemGespraech = kontaktSchritt(c);
    if (vorDemGespraech) return vorDemGespraech;
    const vorDerMail = erstgespraechSchritt(c);
    if (vorDerMail) return vorDerMail;
```

und analog beim zweiten Aufruf (`nachDerFreigabe`). Direkt nach dem zweiten Block die Wiedervorlage:

```ts
  // Eine faellige Wiedervorlage ist ein Versprechen mit Datum – sie steht
  // deshalb ueber der fachlichen Arbeit, aber unter Gespraech und Kontakt.
  if (c.wiedervorlageFaellig) {
    return {
      key: "wiedervorlage_faellig",
      title: "Wiedervorlage ist fällig",
      reason: "Du hattest dir diesen Fall für heute vorgemerkt.",
      tone: "review",
      cta: { label: "Fall öffnen", href: `/cases/${id}` },
    };
  }
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npx vitest run tests/next-step.test.ts
npx tsc --noEmit
```

Erwartet: alle grün, auch die bestehenden Leiter-Tests (die neuen Felder sind optional).

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/cases/next-step.ts tests/next-step.test.ts
git commit -m "feat(fallreise): Kontaktaufnahme und Wiedervorlage als Sprossen der Leiter

Die Leiter sprang bisher vom Leadeingang direkt zum Erstgespraech, als waere
der Kunde immer am Apparat. Neu davor: die Kontaktaufnahme, solange niemand
erreicht wurde – mit Versuchsstand im Titel und, nach Fristablauf, dem
Abbruchvorschlag. Beides unter denselben Waechtern wie das Erstgespraech.

Dazu die faellige Wiedervorlage: Das Feld gab es, aber die Leiter hat nie
'heute nachhaken' gesagt.

Der Kontaktstand kommt fertig gerechnet herein, damit next-step.ts ohne Uhr
auskommt. Eine fehlende Telefonnummer laesst die Sprosse stehen statt sie
verschwinden zu lassen – ein Lead ohne Nummer ist ein Problem, keine
Erledigung."
```

---

### Aufgabe 4: Kontaktversuch erfassen (Server Action)

**Dateien:**
- Ändern: `src/lib/actions/case-management.ts`
- Erstellen: `tests/kontakt-erfassen.test.ts`

**Schnittstellen:**
- Nutzt: `KontaktErgebnis` aus Aufgabe 1.
- Liefert: `kontaktVersuchErfassen(caseId: string, formData: FormData): Promise<void>` — liest `kanal` (`telefon | whatsapp`), `ergebnis` (`erreicht | nicht_erreicht`) und optional `wiedervorlage` (ISO-Datum).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/kontakt-erfassen.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn(async () => ({ ctx }));
vi.mock("@/lib/auth/guards", () => ({ requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a) }));

const noteCount = vi.fn();
const noteCreate = vi.fn();
const caseUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    caseNote: { count: (...a: unknown[]) => noteCount(...a), create: (...a: unknown[]) => noteCreate(...a) },
    case: { update: (...a: unknown[]) => caseUpdate(...a) },
  },
}));

import { kontaktVersuchErfassen } from "@/lib/actions/case-management";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [noteCount, noteCreate, caseUpdate].forEach((m) => m.mockReset());
  noteCount.mockResolvedValue(0);
  noteCreate.mockResolvedValue({ id: "n1" });
});

describe("kontaktVersuchErfassen", () => {
  it("legt einen Telefon-Vermerk mit Ergebnis an", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(noteCreate).toHaveBeenCalledTimes(1);
    const daten = noteCreate.mock.calls[0][0].data;
    expect(daten.kind).toBe("telefon");
    expect(daten.ergebnis).toBe("nicht_erreicht");
    expect(daten.caseId).toBe("case-A");
    expect(daten.authorId).toBe("user-1");
  });

  it("zaehlt den Versuch im Text hoch", async () => {
    noteCount.mockResolvedValue(2);
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(noteCreate.mock.calls[0][0].data.body).toContain("3. Versuch");
  });

  it("setzt bei 'erreicht' auf Wunsch eine Wiedervorlage", async () => {
    await kontaktVersuchErfassen(
      "case-A",
      form({ kanal: "telefon", ergebnis: "erreicht", wiedervorlage: "2026-08-20" })
    );
    expect(caseUpdate).toHaveBeenCalledTimes(1);
    expect(caseUpdate.mock.calls[0][0].data.wiedervorlage).toBeInstanceOf(Date);
  });

  it("setzt ohne Datum keine Wiedervorlage", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "erreicht" }));
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Kanal ab, statt ihn zu erfinden", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "brieftaube", ergebnis: "nicht_erreicht" }));
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("weist ein unbekanntes Ergebnis ab", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "vielleicht" }));
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("prueft den Fallzugriff", async () => {
    await kontaktVersuchErfassen("case-A", form({ kanal: "telefon", ergebnis: "nicht_erreicht" }));
    expect(requireCaseAccess).toHaveBeenCalledWith("case-A");
  });
});
```

**Hinweis:** Vor dem Schreiben in `src/lib/actions/case-management.ts` nachsehen, aus welchem Modul `requireCaseAccess` dort tatsächlich importiert wird, und den `vi.mock`-Pfad im Test daran angleichen.

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/kontakt-erfassen.test.ts`
Erwartet: FEHLSCHLAG, `kontaktVersuchErfassen` ist kein Export.

- [ ] **Schritt 3: Die Aktion schreiben**

In `src/lib/actions/case-management.ts`, im Stil von `addCaseNote`:

```ts
/** Kanäle, über die ein Kontaktversuch laufen kann. E-Mail zählt nicht mit –
 *  sie erreicht niemanden, sie wartet auf Antwort. */
const KONTAKT_KANAELE = ["telefon", "whatsapp"] as const;

/**
 * Hält einen Kontaktversuch fest – die Schreibseite der geführten
 * Kontaktaufnahme.
 *
 * Bewusst ein Vermerk und keine eigene Tabelle: `CaseNote` IST die
 * Kontakthistorie und wird auf der Verwaltungsseite bereits angezeigt. So
 * steht der Versuch ohne Zusatzarbeit dort, wo der Vermittler ihn sucht.
 *
 * Der Text wird erzeugt, nicht erfragt: Im Gespräch tippt niemand.
 */
export async function kontaktVersuchErfassen(caseId: string, formData: FormData): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  const kanalRoh = str(formData, "kanal");
  const ergebnisRoh = str(formData, "ergebnis");
  if (!(KONTAKT_KANAELE as readonly string[]).includes(kanalRoh ?? "")) return;
  if (!(KONTAKT_ERGEBNISSE as readonly string[]).includes(ergebnisRoh ?? "")) return;
  const kanal = kanalRoh as (typeof KONTAKT_KANAELE)[number];
  const ergebnis = ergebnisRoh as KontaktErgebnis;

  const bisher = await prisma.caseNote.count({
    where: { caseId, ergebnis: "nicht_erreicht" },
  });

  const body =
    ergebnis === "erreicht"
      ? kanal === "telefon"
        ? "Telefonisch erreicht."
        : "Antwort über WhatsApp erhalten."
      : kanal === "telefon"
        ? `Nicht erreicht (${bisher + 1}. Versuch).`
        : `WhatsApp geschrieben (${bisher + 1}. Versuch).`;

  await prisma.caseNote.create({
    data: { caseId, authorId: ctx.userId, kind: kanal, ergebnis, body },
  });

  const wiedervorlage = date(formData, "wiedervorlage");
  if (ergebnis === "erreicht" && wiedervorlage) {
    await prisma.case.update({ where: { id: caseId }, data: { wiedervorlage } });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
}
```

Importe ergänzen: `KONTAKT_ERGEBNISSE`, `type KontaktErgebnis` aus `@/lib/domain/enums`.

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npx vitest run tests/kontakt-erfassen.test.ts
npx tsc --noEmit
```

Erwartet: 7 Tests grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/actions/case-management.ts tests/kontakt-erfassen.test.ts
git commit -m "feat(kontakt): Kontaktversuch mit einem Klick festhalten

Ein Versuch ist ein Vermerk mit Ergebnis – keine eigene Tabelle. CaseNote IST
die Kontakthistorie und steht bereits auf der Verwaltungsseite; so landet der
Versuch ohne Zusatzarbeit dort, wo er gesucht wird.

Der Vermerktext wird erzeugt statt erfragt: im Gespraech tippt niemand.
Unbekannte Kanaele und Ergebnisse werden abgewiesen statt erfunden."
```

---

### Aufgabe 5: Telefonnummer für Wähl- und WhatsApp-Link aufbereiten

**Dateien:**
- Erstellen: `src/lib/kontakt/telefon.ts`
- Erstellen: `tests/telefon-links.test.ts`

**Schnittstellen:**
- Liefert: `waLink(nummer: string | null): string | null` und `telLink(nummer: string | null): string | null`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/telefon-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { waLink, telLink } from "@/lib/kontakt/telefon";

describe("waLink", () => {
  it("macht aus einer deutschen Nummer mit fuehrender Null eine internationale", () => {
    expect(waLink("0170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("versteht die Schreibweise mit +49", () => {
    expect(waLink("+49 170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("versteht die Schreibweise mit 0049", () => {
    expect(waLink("0049 170 1234567")).toBe("https://wa.me/491701234567");
  });

  it("laesst Trennzeichen und Klammern unbeachtet", () => {
    expect(waLink("(0170) 123-4567")).toBe("https://wa.me/491701234567");
  });

  it("gibt null zurueck, wenn nichts Brauchbares dasteht", () => {
    // Lieber kein Link als ein Link auf eine falsche Nummer.
    expect(waLink(null)).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink("kenne ich nicht")).toBeNull();
    expect(waLink("123")).toBeNull();
  });
});

describe("telLink", () => {
  it("uebernimmt die Nummer unveraendert bis auf Leerzeichen", () => {
    expect(telLink("0170 1234567")).toBe("tel:01701234567");
  });

  it("gibt null zurueck ohne Nummer", () => {
    expect(telLink(null)).toBeNull();
    expect(telLink("  ")).toBeNull();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/telefon-links.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Die Aufbereitung schreiben**

Erstelle `src/lib/kontakt/telefon.ts`:

```ts
/**
 * Telefonnummern für Wähl- und WhatsApp-Links aufbereiten.
 *
 * Kundennummern stehen im Freitext: "0170 1234567", "+49 170 1234567",
 * "(0170) 123-4567". Für `tel:` ist das gleichgültig, `wa.me` verlangt dagegen
 * die internationale Form ohne Pluszeichen.
 *
 * Im Zweifel lieber KEIN Link: Ein Link auf eine falsch geratene Nummer
 * schreibt an einen Fremden.
 */

/** Kürzeste Nummer, die noch plausibel ist (Vorwahl + Anschluss). */
const MINDESTLAENGE = 7;

function ziffern(nummer: string): string {
  return nummer.replace(/\D/g, "");
}

/** `tel:`-Link; die Nummer bleibt wie eingegeben, nur ohne Trennzeichen. */
export function telLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  const roh = ziffern(nummer);
  return roh.length >= MINDESTLAENGE ? `tel:${roh}` : null;
}

/**
 * `wa.me`-Link in internationaler Form. Ohne erkennbares Land wird die
 * deutsche Vorwahl angenommen – das Produkt bedient deutsche Baufinanzierung.
 */
export function waLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  let roh = ziffern(nummer);
  if (roh.length < MINDESTLAENGE) return null;

  if (roh.startsWith("00")) roh = roh.slice(2);
  else if (roh.startsWith("0")) roh = `49${roh.slice(1)}`;

  return roh.length >= MINDESTLAENGE ? `https://wa.me/${roh}` : null;
}
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npx vitest run tests/telefon-links.test.ts
npx tsc --noEmit
```

Erwartet: 7 Tests grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/kontakt/telefon.ts tests/telefon-links.test.ts
git commit -m "feat(kontakt): Waehl- und WhatsApp-Links aus Freitext-Nummern

Kundennummern stehen im Freitext; wa.me verlangt die internationale Form.
Im Zweifel liefert die Aufbereitung KEINEN Link – einer auf eine falsch
geratene Nummer schriebe an einen Fremden."
```

---

### Aufgabe 6: Knöpfe auf der Fallkarte

**Dateien:**
- Ändern: `src/components/case/next-step-card.tsx`

**Schnittstellen:**
- Nutzt: `kontaktVersuchErfassen` (Aufgabe 4), `waLink`/`telLink` (Aufgabe 5), Schlüssel `kontakt_aufnehmen`/`kontakt_aufgeben`/`wiedervorlage_faellig` (Aufgabe 3).
- Liefert: nichts für spätere Aufgaben.

- [ ] **Schritt 1: Die Komponente lesen**

`src/components/case/next-step-card.tsx` ganz lesen und feststellen, wie sie heute `cta`, `secondary` und Server-Action-Formulare darstellt (die Schlüssel `ki_fehler` und `erstkontakt_vorbereiten` haben bereits Formulare statt Links). Die neuen Knöpfe folgen genau diesem Muster — kein neues Gestaltungsmittel erfinden.

- [ ] **Schritt 2: Kontaktknöpfe ergänzen**

Für die Schlüssel `kontakt_aufnehmen` und `kontakt_aufgeben` unter Titel und Begründung eine Knopfreihe rendern. Die Karte bekommt dafür zusätzlich die Telefonnummer als Prop (`telefon: string | null`), die die Fallseite aus dem Kontaktblock durchreicht:

```tsx
{(schritt.key === "kontakt_aufnehmen" || schritt.key === "kontakt_aufgeben") && (
  <div className="flex flex-wrap items-center gap-2">
    {telLink(telefon) && (
      <Button asChild variant="default">
        <a href={telLink(telefon)!}>
          <Phone className="h-4 w-4" /> Anrufen
        </a>
      </Button>
    )}
    <form action={kontaktVersuchErfassen.bind(null, caseId)}>
      <input type="hidden" name="kanal" value="telefon" />
      <input type="hidden" name="ergebnis" value="erreicht" />
      <Button type="submit" variant="outline">Erreicht</Button>
    </form>
    <form action={kontaktVersuchErfassen.bind(null, caseId)}>
      <input type="hidden" name="kanal" value="telefon" />
      <input type="hidden" name="ergebnis" value="nicht_erreicht" />
      <Button type="submit" variant="outline">Nicht erreicht</Button>
    </form>
    {waLink(telefon) && (
      <>
        <Button asChild variant="ghost">
          <a href={waLink(telefon)!} target="_blank" rel="noopener noreferrer">
            WhatsApp öffnen
          </a>
        </Button>
        <form action={kontaktVersuchErfassen.bind(null, caseId)}>
          <input type="hidden" name="kanal" value="whatsapp" />
          <input type="hidden" name="ergebnis" value="nicht_erreicht" />
          <Button type="submit" variant="ghost">WhatsApp geschrieben</Button>
        </form>
      </>
    )}
  </div>
)}
```

Beim Schlüssel `kontakt_aufgeben` zusätzlich ein Link auf die Verwaltungsseite mit dem Hinweis, dass der Fall dort als verloren markiert werden kann — **kein** eigener Verlust-Dialog in dieser Karte. Der bestehende `LossDialog` sitzt im Board; ein zweiter Weg wäre ein zweiter Ort mit derselben Aussage.

- [ ] **Schritt 3: Wiedervorlage nach „erreicht" anbieten**

Nach einem „Erreicht" ist die nächste Frage immer dieselbe: Wann wieder anfassen? Auf der Karte des Schrittes `erstgespraech` deshalb ein schmales Datumsfeld mit Speichern-Knopf, das über dieselbe Aktion läuft:

```tsx
<form action={kontaktVersuchErfassen.bind(null, caseId)} className="flex items-end gap-2">
  <input type="hidden" name="kanal" value="telefon" />
  <input type="hidden" name="ergebnis" value="erreicht" />
  <div className="space-y-1">
    <Label htmlFor="wv" className="text-xs">Wiedervorlage</Label>
    <Input id="wv" type="date" name="wiedervorlage" className="h-9 w-40" />
  </div>
  <Button type="submit" variant="outline" size="sm">Merken</Button>
</form>
```

- [ ] **Schritt 4: In der laufenden Anwendung ansehen**

Lokale Datenbank und Entwicklungsserver nach `memory/lokale-db-ohne-docker` starten, einen Fall ohne Kontaktvermerk öffnen und prüfen: Sprosse erscheint, Knöpfe lösen aus, der Vermerk steht danach auf der Verwaltungsseite, die Sprosse wechselt bei „Erreicht" zum Erstgespräch.

- [ ] **Schritt 5: Typprüfung, volle Testsuite, Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/case/next-step-card.tsx src/app
git commit -m "feat(kontakt): drei Knoepfe auf der Fallkarte statt Tippen

Erreicht / Nicht erreicht / WhatsApp geschrieben – dazu Waehl- und
wa.me-Link, wenn eine Nummer da ist. Geschrieben wird in WhatsApp vom
Vermittler; BaufiDesk verschickt nichts.

Kein eigener Verlust-Dialog in der Karte: den gibt es im Board bereits, ein
zweiter waere ein zweiter Ort mit derselben Aussage."
```

---

### Aufgabe 7: Fallseite und Dashboard speisen die neuen Eingaben

**Dateien:**
- Ändern: `src/app/(app)/cases/[id]/page.tsx`
- Ändern: `src/lib/cases/dashboard.ts`
- Ändern: `tests/dashboard.test.ts`

**Schnittstellen:**
- Nutzt: `kontaktStand`, `kontaktEinstellungen` (Aufgabe 2); `NextStepInput.kontakt` und `.wiedervorlageFaellig` (Aufgabe 3).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `tests/dashboard.test.ts` im Stil der vorhandenen Fälle ergänzen:

```ts
it("nennt fuer einen frischen Lead ohne Kontaktversuch das Anrufen", async () => {
  // Aufbau wie die bestehenden Faelle dieser Datei: caseFindMany liefert
  // einen Fall ohne Kontaktvermerke, mit erstkontakt nicht versendet.
  const todo = data.todos.find((t) => t.caseId === "c-frischer-lead");
  expect(todo?.nextStep).toBe("Kunden anrufen");
});

it("sortiert faellige Kontaktschritte nach oben", async () => {
  expect(data.todos[0]?.caseId).toBe("c-frischer-lead");
});
```

Die genaue Attrappen-Struktur aus den bestehenden Tests derselben Datei übernehmen — dort steht bereits, welche `include`-Zweige `caseFindMany` liefern muss.

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/dashboard.test.ts`
Erwartet: FEHLSCHLAG — das Dashboard kennt die Kontaktsprosse nicht.

- [ ] **Schritt 3: Kontaktvermerke und Wiedervorlage mitladen**

In beiden Abfragen (Fallseite und `dashboard.ts`) den Fall um die Kontaktvermerke, das Anlagedatum und die Wiedervorlage erweitern:

```ts
  createdAt: true,
  wiedervorlage: true,
  verlorenAm: true,
  caseNotes: {
    where: { ergebnis: { not: null } },
    select: { ergebnis: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  },
  applicants: { select: { phone: true }, orderBy: { position: "asc" }, take: 1 },
  customer: { select: { phone: true } },
```

Und den Stand rechnen, bevor `computeNextStep` gerufen wird:

```ts
  const jetzt = new Date();
  const einstellungen = kontaktEinstellungen();
  // ... je Fall:
  const stand = kontaktStand(
    c.caseNotes.map((n) => ({ ergebnis: n.ergebnis!, createdAt: n.createdAt })),
    c.createdAt,
    jetzt,
    einstellungen
  );
  const schritt = computeNextStep({
    ...bisherigeEingabe,
    kontakt: { stand, telefon: c.applicants[0]?.phone ?? c.customer?.phone ?? null },
    wiedervorlageFaellig: c.wiedervorlage != null && c.wiedervorlage <= jetzt,
    verloren: c.verlorenAm != null,
  });
```

**Wichtig:** `jetzt` **einmal** je Aufruf bilden, nicht je Fall — sonst liefern zwei Fälle desselben Aufrufs Werte aus verschiedenen Millisekunden, und Grenzfälle werden unerklärlich.

- [ ] **Schritt 4: Sortierung im Dashboard**

`dashboard.ts:253` sortiert heute allein nach Reifegrad aufsteigend und schneidet bei sechs ab:

```ts
  const todos: TodoCase[] = enriched
    .sort((a, b) => a.agg.readiness.score - b.agg.readiness.score)
    .slice(0, 6)
```

Daraus wird eine zweistufige Sortierung — Kontaktschritte zuerst, innerhalb der Gruppen weiter nach Reifegrad:

```ts
  /*
   * Faellige Kontaktschritte stehen oben: Ein frischer Lead hat naturgemaess
   * einen niedrigen Reifegrad, aber genau deshalb wuerde er in einer reinen
   * Reifegrad-Sortierung neben halbfertigen Faellen untergehen. Der Anruf ist
   * das Zeitkritische – alles andere kann auch morgen noch.
   */
  const KONTAKT_SCHRITTE = new Set(["kontakt_aufnehmen", "kontakt_aufgeben"]);
  const rang = (e: (typeof enriched)[number]) => (KONTAKT_SCHRITTE.has(e.step.key) ? 0 : 1);

  const todos: TodoCase[] = enriched
    .sort((a, b) => rang(a) - rang(b) || a.agg.readiness.score - b.agg.readiness.score)
    .slice(0, 6)
```

**Im Blick behalten:** Die Liste bleibt bei sechs Einträgen gedeckelt. Kommen an einem Tag mehr als sechs frische Leads herein, verdrängen die Anrufe alles andere. Das ist für den Moment richtig — falls es stört, ist der Deckel die Stellschraube, nicht die Sortierung.

- [ ] **Schritt 5: Volle Testsuite und Typprüfung**

```bash
npx vitest run
npx tsc --noEmit
```

Erwartet: alles grün.

- [ ] **Schritt 6: Commit**

```bash
git add src/app src/lib/cases/dashboard.ts tests/dashboard.test.ts
git commit -m "feat(kontakt): Fallseite und Dashboard kennen den Kontaktstand

Beide Aufrufer laden die Kontaktvermerke und rechnen den Stand, bevor sie die
Leiter fragen. jetzt wird EINMAL je Aufruf gebildet, nicht je Fall – sonst
liefern zwei Faelle desselben Aufrufs Werte aus verschiedenen Millisekunden
und Grenzfaelle werden unerklaerlich.

Faellige Kontaktschritte stehen im Dashboard oben: der frische Lead gehoert
ans Telefon, bevor irgendetwas anderes drankommt."
```

---

## Abschluss

- [ ] Volle Testsuite grün (`npx vitest run`), Typprüfung fehlerfrei (`npx tsc --noEmit`)
- [ ] Nach `main` gepusht und Deployment abgewartet
- [ ] Von außen geprüft, dass die neue Sprosse in der Produktion erscheint
- [ ] `docs/superpowers/specs/2026-08-14-vom-lead-zum-abschluss-design.md` als umgesetzt markieren
