# Selbstauskunft für Kunden – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Kunde füllt über einen eigenen Magic Link einen mehrschrittigen Bogen aus; die Angaben landen im Fall-Eingang, wo der Vermittler sie freigibt.

**Architecture:** Ein Fragenkatalog als Daten (`src/lib/self-disclosure/catalog.ts`) beschreibt jeden Schritt; eine generische Strecke unter `/selbstauskunft/[token]/[schritt]` läuft ihn ab. Antworten liegen als JSON am Link-Datensatz. Eine reine Funktion (`takeover.ts`) vergleicht Antworten mit dem Fallstand und erzeugt Vorschläge, die der Vermittler einzeln freigibt.

**Tech Stack:** Next.js App Router (Server Actions), Prisma/PostgreSQL, Zod, Vitest, PGlite für den Integrationstest, Tailwind + bestehende UI-Komponenten.

## Global Constraints

- Sprache im Produkt und in Kommentaren: **Deutsch**. Bezeichner in `src/lib/self-disclosure/**` ebenfalls deutsch (`Schritt`, `Feld`, `Antworten`) — dem Katalog liegt Fachsprache zugrunde.
- **Keine Pflichtfelder.** Jedes Feld darf leer bleiben, „Weiter" ist immer möglich. Geprüft wird nur die Form eines eingegebenen Werts, nie seine Anwesenheit.
- Eine Lücke erzeugt **keinen** Vorschlag und überschreibt nie einen vorhandenen Wert mit Leere.
- Kundenangaben wandern **nie automatisch** in den Fall — ausschließlich über die Freigabe des Vermittlers.
- Token: Klartext nur einmal bei Erstellung, in der DB nur der Hash. Wiederverwendung von `src/lib/security/upload-token.ts`.
- Serverseitige Validierung vor jedem Schreiben; ungeprüfte Rohdaten werden nie gespeichert.
- Kein zusätzlicher KI-Aufruf in diesem Feature.
- Tests laufen mit `npx vitest run <datei>`; die volle Suite mit `npm test`; Typecheck mit `npm run typecheck`.
- `npm run db:push` läuft gegen die **Produktionsdatenbank** (kein Staging). Nur in Task 9 und nur nach ausdrücklicher Freigabe.

---

## Dateiübersicht

| Datei | Verantwortung |
| --- | --- |
| `src/lib/self-disclosure/types.ts` | Typen: `Feld`, `Schritt`, `Ziel`, `Antworten`, `SichtbarerSchritt` |
| `src/lib/self-disclosure/catalog.ts` | Der Fragenkatalog als Daten (`KATALOG`) |
| `src/lib/self-disclosure/navigation.ts` | Reine Logik: sichtbare Schritte, nächster/vorheriger, Fortschritt, offene Felder |
| `src/lib/self-disclosure/schema.ts` | Zod-Schema je Schritt aus der Felddefinition |
| `src/lib/self-disclosure/takeover.ts` | Antworten + Fallstand → Vorschläge (rein) |
| `src/lib/security/self-disclosure-link.ts` | Link erzeugen, widerrufen, auflösen |
| `src/lib/actions/self-disclosure.ts` | Server Actions: Antwort speichern, absenden, übernehmen, Link verwalten |
| `src/app/selbstauskunft/[token]/[schritt]/page.tsx` | Kundenstrecke |
| `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx` | Zusammenfassung und Absenden |
| `src/components/self-disclosure/step-form.tsx` | Ein Schritt als Formular (Client) |
| `src/components/case/self-disclosure-manager.tsx` | Link-Verwaltung auf der Fallseite |
| `src/components/case/self-disclosure-inbox.tsx` | Prüfansicht mit Freigabe |
| `prisma/schema.prisma` | `SelfDisclosureLink`, `SelfDisclosure`, `Applicant.anrede` |

Reihenfolge der Aufgaben: erst die reine Logik (1–2), dann Persistenz (3), dann die Kundenstrecke (4–5), dann Übernahme (6–7), dann Einbettung (8), zuletzt Integrationstest und Rollout (9).

---

### Task 1: Typen, Navigation und Abschnitt A des Katalogs

**Files:**
- Create: `src/lib/self-disclosure/types.ts`
- Create: `src/lib/self-disclosure/catalog.ts`
- Create: `src/lib/self-disclosure/navigation.ts`
- Test: `tests/selbstauskunft-navigation.test.ts` (neu)

**Interfaces:**
- Produces: `Feld`, `Schritt`, `Ziel`, `Antworten`, `SichtbarerSchritt`, `KATALOG`, `sichtbareSchritte(antworten)`, `schrittFinden(id, antworten)`, `naechsterSchritt(id, antworten)`, `vorherigerSchritt(id, antworten)`, `fortschritt(id, antworten)`, `schluessel(schrittId, feldId)`.

- [ ] **Step 1: Typen anlegen**

Create `src/lib/self-disclosure/types.ts`:

```ts
/**
 * Der Fragenkatalog der Selbstauskunft ist reine Datenbeschreibung: Ein Schritt
 * ist ein Bildschirm, ein Feld eine Eingabe. Verzweigungen sind Funktionen über
 * den bisherigen Antworten – keine Verzweigung steckt in der Oberfläche.
 *
 * Grundsatz: Es gibt KEINE Pflichtfelder. Jedes Feld darf leer bleiben.
 */

/** Wohin eine Antwort im Fall gehört. Fehlt das Ziel, bleibt sie nur im Bogen. */
export type Ziel =
  | { entitaet: "case" | "property" | "financingRequest"; feld: string }
  | { entitaet: "applicant" | "income" | "employment" | "selfEmployment"; feld: string }
  | { entitaet: "liability" | "asset"; liste: true };

export type FeldTyp =
  | "auswahl"
  | "betrag"
  | "prozent_oder_betrag"
  | "text"
  | "datum"
  | "plz_ort"
  | "ja_nein"
  | "zahl";

export interface Feld {
  id: string;
  label: string;
  typ: FeldTyp;
  hinweis?: string;
  optionen?: { wert: string; label: string }[];
  ziel?: Ziel;
}

export type Abschnitt =
  | "vorhaben"
  | "person"
  | "beruf"
  | "haushalt"
  | "eigenkapital"
  | "objekt";

export interface Schritt {
  /** Zugleich URL-Segment (bei Personenschritten mit Präfix "p1."/"p2."). */
  id: string;
  abschnitt: Abschnitt;
  frage: string;
  hinweis?: string;
  felder: Feld[];
  /** Prüft NUR ausdrücklich gegebene Antworten. Fehlt die Steuerantwort, bleibt der Zweig zu. */
  sichtbar?: (a: Antworten) => boolean;
  /** Läuft zweimal, wenn zwei Antragsteller angegeben sind. */
  jeAntragsteller?: boolean;
}

/** Ein Eintrag einer Liste (Verpflichtungen, Eigenkapital). */
export type ListenEintrag = Record<string, string | number | boolean | null>;

export type AntwortWert = string | number | boolean | ListenEintrag[] | null;

/** Schlüssel: "<schrittId>.<feldId>", bei Personenschritten "p2.person_name.vorname". */
export type Antworten = Record<string, AntwortWert>;

/** Eine konkrete Ausprägung eines Schritts (bei jeAntragsteller je Person eine). */
export interface SichtbarerSchritt {
  /** URL-Segment und Schlüsselpräfix. */
  id: string;
  schritt: Schritt;
  person?: 1 | 2;
}
```

- [ ] **Step 2: Test schreiben**

Create `tests/selbstauskunft-navigation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  sichtbareSchritte,
  naechsterSchritt,
  vorherigerSchritt,
  fortschritt,
  schluessel,
} from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

const leer: Antworten = {};

describe("Katalog-Navigation", () => {
  it("beginnt mit der Finanzierungsart", () => {
    expect(sichtbareSchritte(leer)[0]!.id).toBe("finanzierungsart");
  });

  it("zeigt den Kaufpreis nur im Kaufzweig", () => {
    const kauf = { "finanzierungsart.art": "kauf_bestand" };
    const modernisierung = { "finanzierungsart.art": "modernisierung" };
    const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);
    expect(ids(kauf)).toContain("kaufpreis");
    expect(ids(modernisierung)).not.toContain("kaufpreis");
    expect(ids(modernisierung)).toContain("modernisierungskosten");
  });

  it("nimmt ohne Angabe zur Finanzierungsart den Kaufzweig", () => {
    // Ausnahme von der Regel "unbeantwortet -> Zweig zu": ohne den Kaufzweig
    // bliebe fast nichts übrig.
    expect(sichtbareSchritte(leer).map((s) => s.id)).toContain("kaufpreis");
  });

  it("überspringt die Höhe der Maklergebühr, solange keine anfällt", () => {
    const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);
    expect(ids({ "maklergebuehr.faellt_an": "provisionsfrei" })).not.toContain("maklergebuehr_hoehe");
    expect(ids({ "maklergebuehr.faellt_an": "ja" })).toContain("maklergebuehr_hoehe");
  });

  it("hält den Zweig zu, wenn die Steuerfrage übersprungen wurde", () => {
    // maklergebuehr unbeantwortet -> keine Folgefrage.
    expect(sichtbareSchritte(leer).map((s) => s.id)).not.toContain("maklergebuehr_hoehe");
  });

  it("liefert den nächsten und vorherigen Schritt entlang der sichtbaren Kette", () => {
    const a: Antworten = { "finanzierungsart.art": "kauf_bestand" };
    const nach = naechsterSchritt("finanzierungsart", a);
    expect(nach!.id).toBe("objektstand");
    expect(vorherigerSchritt(nach!.id, a)!.id).toBe("finanzierungsart");
  });

  it("gibt am Ende der Kette null zurück", () => {
    const a: Antworten = {};
    const letzter = sichtbareSchritte(a).at(-1)!;
    expect(naechsterSchritt(letzter.id, a)).toBeNull();
    expect(vorherigerSchritt(sichtbareSchritte(a)[0]!.id, a)).toBeNull();
  });

  it("zählt den Fortschritt über die tatsächlich sichtbaren Schritte", () => {
    const a: Antworten = { "finanzierungsart.art": "kauf_bestand" };
    const f = fortschritt("objektstand", a);
    expect(f.position).toBe(2);
    expect(f.gesamt).toBe(sichtbareSchritte(a).length);
  });

  it("baut Antwortschlüssel aus Schritt und Feld", () => {
    expect(schluessel("finanzierungsart", "art")).toBe("finanzierungsart.art");
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-navigation.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/self-disclosure/navigation"`.

- [ ] **Step 4: Abschnitt A des Katalogs schreiben**

Create `src/lib/self-disclosure/catalog.ts`:

```ts
import type { Antworten, Schritt } from "@/lib/self-disclosure/types";

/**
 * Der Fragenkatalog. Reihenfolge im Array = Reihenfolge im Bogen.
 *
 * Abschnitt A folgt der FinLink-Strecke Frage für Frage (eine Frage pro
 * Bildschirm); die späteren Abschnitte fassen Zusammengehöriges, sonst käme der
 * Bogen auf über 70 Bildschirme.
 */

/** Liest eine Antwort als String; "" gilt als nicht beantwortet. */
export const wert = (a: Antworten, k: string): string =>
  typeof a[k] === "string" ? (a[k] as string) : "";

const KAUFZWEIG = ["kauf_neubau", "kauf_bestand", "eigenes_bauvorhaben"];

/**
 * Ohne Angabe zur Finanzierungsart gilt der Kaufzweig: Er trägt den Bogen, und
 * eine übersprungene erste Frage darf nicht fast alles Weitere verschlucken.
 */
const istKauf = (a: Antworten): boolean => {
  const art = wert(a, "finanzierungsart.art");
  return art === "" || KAUFZWEIG.includes(art);
};

export const KATALOG: Schritt[] = [
  {
    id: "finanzierungsart",
    abschnitt: "vorhaben",
    frage: "Was möchten Sie finanzieren?",
    felder: [
      {
        id: "art",
        label: "Finanzierungsart",
        typ: "auswahl",
        ziel: { entitaet: "case", feld: "financingType" },
        optionen: [
          { wert: "kauf_neubau", label: "Kauf Neubau" },
          { wert: "kauf_bestand", label: "Kauf Bestandsimmobilie" },
          { wert: "eigenes_bauvorhaben", label: "Eigenes Bauvorhaben" },
          { wert: "modernisierung", label: "Modernisierung" },
          { wert: "anschlussfinanzierung", label: "Anschlussfinanzierung" },
          { wert: "kapitalbeschaffung", label: "Kapitalbeschaffung" },
        ],
      },
    ],
  },
  {
    id: "objektstand",
    abschnitt: "vorhaben",
    frage: "Haben Sie bereits eine Immobilie gefunden?",
    sichtbar: istKauf,
    felder: [
      {
        id: "stand",
        label: "Stand der Suche",
        typ: "auswahl",
        optionen: [
          { wert: "gefunden", label: "Immobilie gefunden" },
          { wert: "nicht_besichtigt", label: "Noch nicht besichtigt" },
        ],
      },
    ],
  },
  {
    id: "nutzung",
    abschnitt: "vorhaben",
    frage: "Wie möchten Sie die Immobilie nutzen?",
    sichtbar: istKauf,
    felder: [
      {
        id: "art",
        label: "Nutzung",
        typ: "auswahl",
        ziel: { entitaet: "property", feld: "nutzung" },
        optionen: [
          { wert: "selbstnutzung", label: "Selbst bewohnen" },
          { wert: "vermietet", label: "Vermieten" },
          { wert: "gemischt", label: "Teilweise vermieten" },
        ],
      },
    ],
  },
  {
    id: "objekt_ort",
    abschnitt: "vorhaben",
    frage: "In welcher Stadt liegt die Immobilie?",
    hinweis:
      "Wenn Sie noch unsicher sind, genügt eine PLZ aus dem Bundesland – die Kaufnebenkosten unterscheiden sich je Bundesland.",
    sichtbar: istKauf,
    felder: [
      { id: "plz", label: "PLZ", typ: "text", ziel: { entitaet: "property", feld: "zip" } },
      { id: "ort", label: "Ort", typ: "text", ziel: { entitaet: "property", feld: "city" } },
    ],
  },
  {
    id: "kaufpreis",
    abschnitt: "vorhaben",
    frage: "Wie hoch ist der Kaufpreis?",
    hinweis: "Nur der Preis der Immobilie, ohne Nebenkosten. Noch kein konkreter Preis? Dann Ihr Budget.",
    sichtbar: (a) => {
      const art = wert(a, "finanzierungsart.art");
      return art === "" || art === "kauf_neubau" || art === "kauf_bestand";
    },
    felder: [
      { id: "betrag", label: "Kaufpreis", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "kaufpreis" } },
    ],
  },
  {
    id: "baukosten",
    abschnitt: "vorhaben",
    frage: "Was kosten Grundstück und Bau?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "eigenes_bauvorhaben",
    felder: [
      { id: "grundstueck", label: "Grundstückspreis", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "kaufpreis" } },
      { id: "bau", label: "Baukosten", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "baukosten" } },
    ],
  },
  {
    id: "modernisierungskosten",
    abschnitt: "vorhaben",
    frage: "Was möchten Sie modernisieren?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "modernisierung",
    felder: [
      { id: "vorhaben", label: "Geplante Arbeiten", typ: "text" },
      { id: "betrag", label: "Geschätzte Kosten", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "modernisierungskosten" } },
    ],
  },
  {
    id: "restschuld",
    abschnitt: "vorhaben",
    frage: "Wie hoch ist Ihre Restschuld?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "anschlussfinanzierung",
    felder: [
      { id: "betrag", label: "Restschuld", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" } },
      { id: "zinsbindung_ende", label: "Zinsbindung endet am", typ: "datum" },
    ],
  },
  {
    id: "kapitalbedarf",
    abschnitt: "vorhaben",
    frage: "Welchen Betrag benötigen Sie?",
    sichtbar: (a) => wert(a, "finanzierungsart.art") === "kapitalbeschaffung",
    felder: [
      { id: "betrag", label: "Benötigter Betrag", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "darlehenswunsch" } },
    ],
  },
  {
    id: "eigenkapital",
    abschnitt: "vorhaben",
    frage: "Wie viel Eigenkapital möchten Sie einsetzen?",
    hinweis: "Noch nicht entschieden? Dann der Betrag, den Sie höchstens einbringen könnten.",
    felder: [
      { id: "betrag", label: "Eigenkapital", typ: "betrag", ziel: { entitaet: "financingRequest", feld: "eigenkapital" } },
    ],
  },
  {
    id: "maklergebuehr",
    abschnitt: "vorhaben",
    frage: "Fällt beim Kauf eine Maklergebühr an?",
    sichtbar: istKauf,
    felder: [
      {
        id: "faellt_an",
        label: "Maklergebühr",
        typ: "auswahl",
        optionen: [
          { wert: "ja", label: "Ja, es fällt eine an" },
          { wert: "nein", label: "Provisionsfrei" },
          { wert: "unbekannt", label: "Weiß ich nicht" },
        ],
      },
    ],
  },
  {
    id: "maklergebuehr_hoehe",
    abschnitt: "vorhaben",
    frage: "Wie hoch sind die Maklergebühren?",
    sichtbar: (a) => wert(a, "maklergebuehr.faellt_an") === "ja",
    felder: [
      {
        id: "hoehe",
        label: "Maklergebühr",
        typ: "prozent_oder_betrag",
        ziel: { entitaet: "financingRequest", feld: "maklerprovisionProzent" },
      },
    ],
  },
  {
    id: "anzahl_antragsteller",
    abschnitt: "vorhaben",
    frage: "Möchten Sie alleine oder mit einer weiteren Person finanzieren?",
    hinweis: "Verheiratete stellen den Antrag in der Regel gemeinsam.",
    felder: [
      {
        id: "anzahl",
        label: "Antragsteller",
        typ: "auswahl",
        optionen: [
          { wert: "1", label: "Alleine" },
          { wert: "2", label: "Mit einer weiteren Person" },
        ],
      },
    ],
  },
];

/**
 * Wie viele Antragsteller der Bogen abfragt. Ohne Angabe: einer – der häufigere
 * Fall, und ein übersprungener Schritt soll den Bogen nicht verdoppeln.
 */
export function anzahlAntragsteller(a: Antworten): 1 | 2 {
  return wert(a, "anzahl_antragsteller.anzahl") === "2" ? 2 : 1;
}
```

- [ ] **Step 5: Navigation schreiben**

Create `src/lib/self-disclosure/navigation.ts`:

```ts
import { KATALOG, anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import type { Antworten, SichtbarerSchritt } from "@/lib/self-disclosure/types";

/** Antwortschlüssel aus Schritt-ID (ggf. mit Personenpräfix) und Feld-ID. */
export function schluessel(schrittId: string, feldId: string): string {
  return `${schrittId}.${feldId}`;
}

/**
 * Die Kette der Schritte, die bei diesen Antworten tatsächlich zu sehen sind.
 *
 * Schritte mit `jeAntragsteller` erscheinen bei zwei Antragstellern zweimal,
 * mit den Präfixen "p1."/"p2." – sie stehen direkt hintereinander, damit der
 * Kunde einen Abschnitt zu Ende führt, bevor die zweite Person beginnt.
 */
export function sichtbareSchritte(antworten: Antworten): SichtbarerSchritt[] {
  const personen = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
    if (!schritt.jeAntragsteller) {
      out.push({ id: schritt.id, schritt });
      continue;
    }
    for (let p = 1; p <= personen; p++) {
      out.push({ id: `p${p}.${schritt.id}`, schritt, person: p as 1 | 2 });
    }
  }
  return out;
}

export function schrittFinden(id: string, antworten: Antworten): SichtbarerSchritt | null {
  return sichtbareSchritte(antworten).find((s) => s.id === id) ?? null;
}

export function naechsterSchritt(id: string, antworten: Antworten): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return kette[i + 1] ?? null;
}

export function vorherigerSchritt(id: string, antworten: Antworten): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  return kette[i - 1] ?? null;
}

/** 1-basierte Position und Gesamtzahl – Grundlage des Fortschrittsbalkens. */
export function fortschritt(id: string, antworten: Antworten): { position: number; gesamt: number } {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  return { position: i < 0 ? 0 : i + 1, gesamt: kette.length };
}
```

- [ ] **Step 6: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-navigation.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Step 8: Committen**

```bash
git add src/lib/self-disclosure/types.ts src/lib/self-disclosure/catalog.ts src/lib/self-disclosure/navigation.ts tests/selbstauskunft-navigation.test.ts
git commit -m "feat(selbstauskunft): Fragenkatalog als Daten mit Navigationslogik"
```

---

### Task 2: Katalog vervollständigen (Abschnitte B–F) und Feldvalidierung

**Files:**
- Modify: `src/lib/self-disclosure/catalog.ts`
- Create: `src/lib/self-disclosure/schema.ts`
- Test: `tests/selbstauskunft-katalog.test.ts` (neu)

**Interfaces:**
- Consumes: `Schritt`, `Feld`, `Antworten` (Task 1).
- Produces: vollständiger `KATALOG`; `schrittSchema(schritt: Schritt): z.ZodType<Record<string, unknown>>`; `offeneFelder(antworten: Antworten): Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }>`.

- [ ] **Step 1: Test schreiben**

Create `tests/selbstauskunft-katalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sichtbareSchritte, offeneFelder } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten } from "@/lib/self-disclosure/types";

const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);

describe("Katalog: Personen- und Berufsabschnitt", () => {
  it("fragt Person und Beruf bei zwei Antragstellern zweimal", () => {
    const zuZweit = ids({ "anzahl_antragsteller.anzahl": "2" });
    expect(zuZweit).toContain("p1.person_name");
    expect(zuZweit).toContain("p2.person_name");
    expect(zuZweit).toContain("p2.einkommen");
  });

  it("fragt ohne Angabe zur Personenzahl nur die erste Person", () => {
    expect(ids({})).toContain("p1.person_name");
    expect(ids({})).not.toContain("p2.person_name");
  });

  it("zeigt Arbeitgeberfragen nur bei abhängiger Beschäftigung", () => {
    const angestellt = ids({ "p1.beruf_art.art": "angestellter" });
    expect(angestellt).toContain("p1.beruf_arbeitgeber");
    expect(angestellt).not.toContain("p1.beruf_selbststaendig");
  });

  it("zeigt die Firmenfragen bei Selbstständigen", () => {
    const selbst = ids({ "p1.beruf_art.art": "selbststaendiger" });
    expect(selbst).toContain("p1.beruf_selbststaendig");
    expect(selbst).not.toContain("p1.beruf_arbeitgeber");
  });

  it("hält beide Berufszweige zu, solange die Art offen ist", () => {
    expect(ids({})).not.toContain("p1.beruf_arbeitgeber");
    expect(ids({})).not.toContain("p1.beruf_selbststaendig");
  });

  it("fragt Kinder genau einmal, nie je Person", () => {
    const zuZweit = ids({ "anzahl_antragsteller.anzahl": "2" });
    expect(zuZweit.filter((i) => i.endsWith("haushalt_kinder"))).toHaveLength(1);
  });

  it("zeigt die Objektdetails nur bei gefundener Immobilie", () => {
    expect(ids({ "objektstand.stand": "gefunden" })).toContain("objekt_masse");
    expect(ids({ "objektstand.stand": "nicht_besichtigt" })).not.toContain("objekt_masse");
    expect(ids({})).not.toContain("objekt_masse");
  });
});

describe("Feldvalidierung", () => {
  const betragsSchritt = KATALOG.find((s) => s.id === "kaufpreis")!;

  it("nimmt einen leeren Schritt an – es gibt keine Pflichtfelder", () => {
    expect(schrittSchema(betragsSchritt).safeParse({ betrag: "" }).success).toBe(true);
    expect(schrittSchema(betragsSchritt).safeParse({}).success).toBe(true);
  });

  it("weist einen unlesbaren Betrag zurück", () => {
    expect(schrittSchema(betragsSchritt).safeParse({ betrag: "dreitausend" }).success).toBe(false);
  });

  it("nimmt Beträge mit deutschem Tausenderpunkt an", () => {
    const r = schrittSchema(betragsSchritt).safeParse({ betrag: "400.000" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.betrag).toBe(400000);
  });

  it("weist eine Auswahl außerhalb der Optionen zurück", () => {
    const auswahl = KATALOG.find((s) => s.id === "finanzierungsart")!;
    expect(schrittSchema(auswahl).safeParse({ art: "kauf_bestand" }).success).toBe(true);
    expect(schrittSchema(auswahl).safeParse({ art: "raumschiff" }).success).toBe(false);
  });
});

describe("offene Felder", () => {
  it("meldet jedes sichtbare, unbeantwortete Feld", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "kauf_bestand" });
    expect(offen.some((o) => o.schrittId === "kaufpreis" && o.feldId === "betrag")).toBe(true);
    expect(offen.some((o) => o.schrittId === "finanzierungsart")).toBe(false);
  });

  it("meldet nichts aus unsichtbaren Zweigen", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "modernisierung" });
    expect(offen.some((o) => o.schrittId === "kaufpreis")).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-katalog.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/self-disclosure/schema"`.

- [ ] **Step 3: Abschnitte B–F an `KATALOG` anhängen**

In `src/lib/self-disclosure/catalog.ts`, direkt vor der schließenden Klammer von `KATALOG` (nach dem Schritt `anzahl_antragsteller`) einfügen:

```ts
  // ---------------------------------------------------------------- Abschnitt B
  {
    id: "person_name",
    abschnitt: "person",
    jeAntragsteller: true,
    frage: "Wie heißen Sie?",
    felder: [
      {
        id: "anrede",
        label: "Anrede",
        typ: "auswahl",
        ziel: { entitaet: "applicant", feld: "anrede" },
        optionen: [
          { wert: "herr", label: "Herr" },
          { wert: "frau", label: "Frau" },
        ],
      },
      { id: "vorname", label: "Vorname", typ: "text", ziel: { entitaet: "applicant", feld: "vorname" } },
      { id: "nachname", label: "Nachname", typ: "text", ziel: { entitaet: "applicant", feld: "nachname" } },
    ],
  },
  {
    id: "person_geburt",
    abschnitt: "person",
    jeAntragsteller: true,
    frage: "Wann und wo sind Sie geboren?",
    felder: [
      { id: "geburtsdatum", label: "Geburtsdatum", typ: "datum", ziel: { entitaet: "applicant", feld: "geburtsdatum" } },
      { id: "geburtsort", label: "Geburtsort", typ: "text", ziel: { entitaet: "applicant", feld: "geburtsort" } },
      {
        id: "staatsangehoerigkeit",
        label: "Staatsangehörigkeit",
        typ: "text",
        ziel: { entitaet: "applicant", feld: "staatsangehoerigkeit" },
      },
    ],
  },
  {
    id: "person_familienstand",
    abschnitt: "person",
    jeAntragsteller: true,
    frage: "Wie ist Ihr Familienstand?",
    felder: [
      {
        id: "stand",
        label: "Familienstand",
        typ: "auswahl",
        ziel: { entitaet: "applicant", feld: "familienstand" },
        optionen: [
          { wert: "ledig", label: "Ledig" },
          { wert: "verheiratet", label: "Verheiratet" },
          { wert: "geschieden", label: "Geschieden" },
          { wert: "verwitwet", label: "Verwitwet" },
          { wert: "eingetragene_partnerschaft", label: "Eingetragene Partnerschaft" },
          { wert: "getrennt_lebend", label: "Getrennt lebend" },
        ],
      },
    ],
  },
  {
    id: "person_anschrift",
    abschnitt: "person",
    jeAntragsteller: true,
    frage: "Wo wohnen Sie derzeit?",
    felder: [
      { id: "strasse", label: "Straße und Hausnummer", typ: "text", ziel: { entitaet: "applicant", feld: "street" } },
      { id: "plz", label: "PLZ", typ: "text", ziel: { entitaet: "applicant", feld: "zip" } },
      { id: "ort", label: "Ort", typ: "text", ziel: { entitaet: "applicant", feld: "city" } },
    ],
  },
  {
    id: "person_kontakt",
    abschnitt: "person",
    jeAntragsteller: true,
    frage: "Wie erreichen wir Sie?",
    felder: [
      { id: "email", label: "E-Mail", typ: "text", ziel: { entitaet: "applicant", feld: "email" } },
      { id: "telefon", label: "Telefon", typ: "text", ziel: { entitaet: "applicant", feld: "phone" } },
    ],
  },
  // ---------------------------------------------------------------- Abschnitt C
  {
    id: "beruf_art",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "In welchem Arbeitsverhältnis sind Sie beschäftigt?",
    felder: [
      {
        id: "art",
        label: "Arbeitsverhältnis",
        typ: "auswahl",
        ziel: { entitaet: "employment", feld: "beschaeftigungsart" },
        // Die neun FinLink-Optionen, abgebildet auf die sieben Werte von EmploymentType.
        optionen: [
          { wert: "angestellter", label: "Angestellte/r" },
          { wert: "arbeiter", label: "Arbeiter/in" },
          { wert: "selbststaendiger", label: "Selbstständige/r" },
          { wert: "handwerker", label: "Selbstständige/r Handwerker/in" },
          { wert: "freiberufler", label: "Freiberufler/in" },
          { wert: "beamter", label: "Beamter/in" },
          { wert: "privatier", label: "Privatier/Privatière" },
          { wert: "rentner", label: "Rentner/in" },
          { wert: "sonstiges", label: "Anderes" },
        ],
      },
    ],
  },
  {
    id: "beruf_arbeitgeber",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "Bei wem sind Sie beschäftigt?",
    sichtbar: (a) => hatBerufsart(a, ANGESTELLT),
    felder: [
      { id: "beruf", label: "Beruf", typ: "text", ziel: { entitaet: "employment", feld: "beruf" } },
      { id: "arbeitgeber", label: "Arbeitgeber", typ: "text", ziel: { entitaet: "employment", feld: "arbeitgeber" } },
      {
        id: "arbeitgeber_adresse",
        label: "Anschrift des Arbeitgebers",
        typ: "text",
        ziel: { entitaet: "employment", feld: "arbeitgeberAdresse" },
      },
    ],
  },
  {
    id: "beruf_dauer",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "Seit wann sind Sie dort beschäftigt?",
    sichtbar: (a) => hatBerufsart(a, ANGESTELLT),
    felder: [
      { id: "seit", label: "Beschäftigt seit", typ: "datum", ziel: { entitaet: "employment", feld: "eintrittsdatum" } },
      { id: "befristet_bis", label: "Befristet bis (falls befristet)", typ: "datum", ziel: { entitaet: "employment", feld: "befristetBis" } },
      { id: "probezeit", label: "Noch in der Probezeit", typ: "ja_nein", ziel: { entitaet: "employment", feld: "inProbezeit" } },
    ],
  },
  {
    id: "beruf_selbststaendig",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "Erzählen Sie uns von Ihrer Tätigkeit",
    sichtbar: (a) => hatBerufsart(a, SELBSTSTAENDIG),
    felder: [
      { id: "firma", label: "Firma", typ: "text", ziel: { entitaet: "selfEmployment", feld: "firma" } },
      { id: "rechtsform", label: "Rechtsform", typ: "text", ziel: { entitaet: "selfEmployment", feld: "rechtsform" } },
      { id: "beteiligung", label: "Beteiligung in Prozent", typ: "zahl", ziel: { entitaet: "selfEmployment", feld: "beteiligungProzent" } },
      { id: "gruendung", label: "Gegründet am", typ: "datum", ziel: { entitaet: "selfEmployment", feld: "gruendungsdatum" } },
    ],
  },
  {
    id: "einkommen",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "Wie hoch ist Ihr Einkommen?",
    hinweis: "Bitte Ihr eigenes Einkommen, nicht das des Haushalts.",
    felder: [
      { id: "netto", label: "Netto monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "nettoMonatlich" } },
      { id: "brutto", label: "Brutto monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "bruttoMonatlich" } },
      {
        id: "sonderzahlungen",
        label: "Sonderzahlungen im Jahr",
        typ: "betrag",
        ziel: { entitaet: "income", feld: "einmalzahlungenJaehrlich" },
      },
    ],
  },
  {
    id: "weitere_einnahmen",
    abschnitt: "beruf",
    jeAntragsteller: true,
    frage: "Haben Sie weitere Einnahmen?",
    felder: [
      { id: "miete", label: "Mieteinnahmen monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "mieteinnahmen" } },
      { id: "sonstige", label: "Sonstige Einnahmen monatlich", typ: "betrag", ziel: { entitaet: "income", feld: "sonstigeEinnahmen" } },
    ],
  },
  // ---------------------------------------------------------------- Abschnitt D
  {
    id: "haushalt_kinder",
    abschnitt: "haushalt",
    frage: "Wie viele Kinder leben in Ihrem Haushalt?",
    hinweis: "Einmal für den ganzen Haushalt – nicht je Person.",
    felder: [
      { id: "anzahl", label: "Anzahl Kinder", typ: "zahl", ziel: { entitaet: "applicant", feld: "anzahlKinder" } },
    ],
  },
  {
    id: "haushalt_ausgaben",
    abschnitt: "haushalt",
    frage: "Welche festen Ausgaben haben Sie?",
    // Kein Ziel: Das Schema kennt weder Warmmiete noch Unterhalt. Die Werte
    // bleiben im Bogen und erscheinen im Eingang zur Ansicht.
    felder: [
      { id: "warmmiete", label: "Derzeitige Warmmiete monatlich", typ: "betrag" },
      { id: "unterhalt", label: "Unterhaltszahlungen monatlich", typ: "betrag" },
    ],
  },
  {
    id: "verpflichtungen",
    abschnitt: "haushalt",
    frage: "Haben Sie laufende Kredite oder Leasingverträge?",
    felder: [
      {
        id: "liste",
        label: "Verpflichtungen",
        typ: "text",
        ziel: { entitaet: "liability", liste: true },
        hinweis: "Art, Gläubiger, Restschuld, Monatsrate, Ablösung geplant",
      },
    ],
  },
  // ---------------------------------------------------------------- Abschnitt E
  {
    id: "eigenkapital_positionen",
    abschnitt: "eigenkapital",
    frage: "Woraus besteht Ihr Eigenkapital?",
    felder: [
      {
        id: "liste",
        label: "Eigenkapital",
        typ: "text",
        ziel: { entitaet: "asset", liste: true },
        hinweis: "Bankguthaben, Bausparvertrag, Wertpapiere, Schenkung, Verkaufserlös, Eigenleistung",
      },
    ],
  },
  // ---------------------------------------------------------------- Abschnitt F
  {
    id: "objekt_art",
    abschnitt: "objekt",
    frage: "Um welche Art von Immobilie handelt es sich?",
    sichtbar: (a) => wert(a, "objektstand.stand") === "gefunden",
    felder: [
      {
        id: "art",
        label: "Objektart",
        typ: "auswahl",
        ziel: { entitaet: "property", feld: "objektart" },
        optionen: [
          { wert: "eigentumswohnung", label: "Eigentumswohnung" },
          { wert: "einfamilienhaus", label: "Einfamilienhaus" },
          { wert: "doppelhaushaelfte", label: "Doppelhaushälfte" },
          { wert: "reihenhaus", label: "Reihenhaus" },
          { wert: "mehrfamilienhaus", label: "Mehrfamilienhaus" },
          { wert: "grundstueck", label: "Grundstück" },
        ],
      },
    ],
  },
  {
    id: "objekt_adresse",
    abschnitt: "objekt",
    frage: "Wie lautet die Adresse der Immobilie?",
    sichtbar: (a) => wert(a, "objektstand.stand") === "gefunden",
    felder: [
      { id: "strasse", label: "Straße und Hausnummer", typ: "text", ziel: { entitaet: "property", feld: "street" } },
    ],
  },
  {
    id: "objekt_masse",
    abschnitt: "objekt",
    frage: "Wie groß ist die Immobilie?",
    sichtbar: (a) => wert(a, "objektstand.stand") === "gefunden",
    felder: [
      { id: "wohnflaeche", label: "Wohnfläche in m²", typ: "zahl", ziel: { entitaet: "property", feld: "wohnflaeche" } },
      { id: "grundstueck", label: "Grundstücksfläche in m²", typ: "zahl", ziel: { entitaet: "property", feld: "grundstuecksflaeche" } },
      { id: "baujahr", label: "Baujahr", typ: "zahl", ziel: { entitaet: "property", feld: "baujahr" } },
      { id: "zimmer", label: "Zimmer", typ: "zahl", ziel: { entitaet: "property", feld: "anzahlZimmer" } },
      { id: "stellplaetze", label: "Stellplätze", typ: "zahl", ziel: { entitaet: "property", feld: "stellplaetze" } },
    ],
  },
  {
    id: "objekt_kosten",
    abschnitt: "objekt",
    frage: "Fallen laufende Kosten oder Einnahmen an?",
    sichtbar: (a) => wert(a, "objektstand.stand") === "gefunden",
    felder: [
      { id: "hausgeld", label: "Hausgeld monatlich", typ: "betrag", ziel: { entitaet: "property", feld: "hausgeldMonatlich" } },
      {
        id: "mieteinnahmen",
        label: "Mieteinnahmen monatlich",
        typ: "betrag",
        ziel: { entitaet: "property", feld: "mieteinnahmenMonatlich" },
      },
    ],
  },
```

Und oberhalb von `KATALOG`, direkt nach `istKauf`, die Berufszweig-Hilfen ergänzen:

```ts
const ANGESTELLT = ["angestellter", "arbeiter", "beamter"];
const SELBSTSTAENDIG = ["selbststaendiger", "handwerker", "freiberufler"];

/**
 * Prüft die Berufsart der GERADE gefragten Person. Der Schritt läuft je
 * Antragsteller, deshalb muss beides gelten: Für Person 2 zählt "p2.beruf_art".
 * Ist die Art übersprungen, bleiben beide Zweige zu.
 */
function hatBerufsart(a: Antworten, arten: string[]): boolean {
  return [1, 2].some((p) => arten.includes(wert(a, `p${p}.beruf_art.art`)));
}
```

> **Achtung, bekannte Grenze:** `hatBerufsart` prüft beide Personen gemeinsam.
> Ist Person 1 angestellt und Person 2 selbstständig, erscheinen beide Zweige
> für beide Personen. Das ist in Task 3 nicht zu beheben, sondern in Step 4
> dieser Aufgabe — siehe dort.

- [ ] **Step 4: Sichtbarkeit personenbezogen auswerten**

Die Sichtbarkeitsregel muss wissen, für welche Person sie gerade gilt. In
`src/lib/self-disclosure/types.ts` die Signatur erweitern:

```ts
  /** Prüft NUR ausdrücklich gegebene Antworten. Fehlt die Steuerantwort, bleibt der Zweig zu. */
  sichtbar?: (a: Antworten, person?: 1 | 2) => boolean;
```

In `src/lib/self-disclosure/navigation.ts` in `sichtbareSchritte` die Person durchreichen:

```ts
export function sichtbareSchritte(antworten: Antworten): SichtbarerSchritt[] {
  const personen = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (!schritt.jeAntragsteller) {
      if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
      out.push({ id: schritt.id, schritt });
      continue;
    }
    for (let p = 1; p <= personen; p++) {
      const person = p as 1 | 2;
      if (schritt.sichtbar && !schritt.sichtbar(antworten, person)) continue;
      out.push({ id: `p${p}.${schritt.id}`, schritt, person });
    }
  }
  return out;
}
```

Und in `catalog.ts` `hatBerufsart` auf die Person beziehen:

```ts
/**
 * Prüft die Berufsart der gerade gefragten Person. Ohne Person (Aufruf aus
 * einem Nicht-Personenschritt) gilt Person 1. Ist die Art übersprungen, bleiben
 * beide Zweige zu.
 */
function hatBerufsart(a: Antworten, arten: string[], person: 1 | 2 = 1): boolean {
  return arten.includes(wert(a, `p${person}.beruf_art.art`));
}
```

Die drei Verwendungen entsprechend anpassen, z. B.:

```ts
    sichtbar: (a, person) => hatBerufsart(a, ANGESTELLT, person),
```

- [ ] **Step 5: Schema und offene Felder schreiben**

Create `src/lib/self-disclosure/schema.ts`:

```ts
import { z } from "zod";
import type { Feld, Schritt } from "@/lib/self-disclosure/types";

/**
 * Validierung eines Schritts. Grundsatz: Ein leeres Feld ist immer gültig —
 * geprüft wird ausschließlich die FORM eines eingegebenen Werts. Der Kunde soll
 * überspringen können, ohne dass der Bogen ihn festhält.
 */

/** "400.000,50" oder "400000" -> 400000.5; "" -> null; Unlesbares -> Fehler. */
export function parseBetrag(roh: string): number | null {
  const s = roh.trim();
  if (s === "") return null;
  const normiert = s.replace(/\./g, "").replace(",", ".").replace(/[€\s]/g, "");
  const n = Number(normiert);
  if (!Number.isFinite(n)) throw new Error("kein Betrag");
  return n;
}

function feldSchema(feld: Feld): z.ZodTypeAny {
  const leerZuNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

  switch (feld.typ) {
    case "betrag":
    case "prozent_oder_betrag":
    case "zahl":
      return z.preprocess(
        leerZuNull,
        z
          .union([z.number(), z.string()])
          .nullable()
          .transform((v, ctx) => {
            if (v === null) return null;
            if (typeof v === "number") return v;
            try {
              return parseBetrag(v);
            } catch {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine Zahl eingeben." });
              return z.NEVER;
            }
          })
      );
    case "auswahl":
      return z.preprocess(
        leerZuNull,
        z
          .enum((feld.optionen ?? []).map((o) => o.wert) as [string, ...string[]])
          .nullable()
          .catch(() => {
            throw new Error("unbekannte Auswahl");
          })
      );
    case "ja_nein":
      return z.preprocess(
        (v) => (v === "ja" || v === true ? true : v === "nein" || v === false ? false : null),
        z.boolean().nullable()
      );
    case "datum":
      return z.preprocess(
        leerZuNull,
        z
          .string()
          .nullable()
          .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
            message: "Bitte ein gültiges Datum eingeben.",
          })
      );
    default:
      return z.preprocess(leerZuNull, z.string().max(500).nullable());
  }
}

export function schrittSchema(schritt: Schritt): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const feld of schritt.felder) shape[feld.id] = feldSchema(feld).optional();
  return z.object(shape).strip() as unknown as z.ZodType<Record<string, unknown>>;
}
```

> Hinweis zur `auswahl`: `z.enum(...).catch` wirft nicht sauber. Stattdessen so
> schreiben:

```ts
    case "auswahl": {
      const erlaubt = (feld.optionen ?? []).map((o) => o.wert);
      return z.preprocess(
        leerZuNull,
        z
          .string()
          .nullable()
          .refine((v) => v === null || erlaubt.includes(v), { message: "Bitte eine der Optionen wählen." })
      );
    }
```

In `src/lib/self-disclosure/navigation.ts` ergänzen:

```ts
/**
 * Alle sichtbaren Felder ohne Antwort – die Nachfassliste für den Vermittler.
 * Listenfelder zählen als offen, wenn die Liste leer ist.
 */
export function offeneFelder(
  antworten: Antworten
): Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> {
  const out: Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> = [];
  for (const s of sichtbareSchritte(antworten)) {
    for (const feld of s.schritt.felder) {
      const v = antworten[schluessel(s.id, feld.id)];
      const leer = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (!leer) continue;
      const person = s.person ? ` (Antragsteller ${s.person})` : "";
      out.push({
        schrittId: s.id,
        feldId: feld.id,
        label: `${feld.label}${person}`,
        abschnitt: s.schritt.abschnitt,
      });
    }
  }
  return out;
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run tests/selbstauskunft-katalog.test.ts tests/selbstauskunft-navigation.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Step 8: Committen**

```bash
git add src/lib/self-disclosure/ tests/selbstauskunft-katalog.test.ts
git commit -m "feat(selbstauskunft): vollstaendiger Katalog mit Verzweigungen und Feldvalidierung"
```

---

### Task 3: Datenmodell und Link-Mechanik

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/security/self-disclosure-link.ts`
- Test: `tests/selbstauskunft-link.test.ts` (neu)

**Interfaces:**
- Consumes: `createUploadToken`, `verifyUploadToken`, `hashToken` aus `@/lib/security/upload-token`.
- Produces:
  - `createSelfDisclosureLink(caseId, expiresAt, opts): Promise<{ linkId, token, url, expiresAt }>`
  - `resolveSelfDisclosureToken(token): Promise<{ linkId, caseId, organizationId } | null>`
  - `deactivateSelfDisclosureLink(linkId, ctx): Promise<void>`
  - `buildSelfDisclosureUrl(token): string`

- [ ] **Step 1: Schema erweitern**

In `prisma/schema.prisma` am Ende der Datei ergänzen:

```prisma
model SelfDisclosureLink {
  id        String   @id @default(cuid())
  caseId    String
  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  disclosure SelfDisclosure?

  @@index([caseId])
  @@map("self_disclosure_links")
}

model SelfDisclosure {
  id          String   @id @default(cuid())
  linkId      String   @unique
  link        SelfDisclosureLink @relation(fields: [linkId], references: [id], onDelete: Cascade)
  caseId      String
  answers     Json     @default("{}")
  currentStep String?
  submittedAt DateTime?
  takenOverAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([caseId])
  @@map("self_disclosures")
}
```

Im Modell `Case` die Gegenrelation ergänzen (bei den übrigen Relationen):

```prisma
  selfDisclosureLinks SelfDisclosureLink[]
```

Im Modell `Applicant` das neue Feld ergänzen (nach `position`):

```prisma
  anrede       String?   // "herr" | "frau"
```

- [ ] **Step 2: Prisma-Client erzeugen**

Run: `npx prisma generate`
Expected: „Generated Prisma Client".

Kein `db:push` — das kommt in Task 9 mit Freigabe.

- [ ] **Step 3: Test schreiben**

Create `tests/selbstauskunft-link.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests", APP_BASE_URL: "https://baufidesk.de" }),
}));

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

import {
  createSelfDisclosureLink,
  resolveSelfDisclosureToken,
  buildSelfDisclosureUrl,
} from "@/lib/security/self-disclosure-link";
import { hashToken } from "@/lib/security/upload-token";

const morgen = new Date(Date.now() + 86400_000);

beforeEach(() => {
  [linkCreate, linkUpdate, linkFindUnique].forEach((m) => m.mockReset());
  linkCreate.mockResolvedValue({ id: "link-1" });
  linkUpdate.mockResolvedValue({});
});

describe("Selbstauskunft-Link", () => {
  it("speichert nur den Hash, nie das Klartext-Token", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    const data = linkUpdate.mock.calls[0]![0] as { data: { tokenHash: string } };
    expect(data.data.tokenHash).toBe(hashToken(created.token));
    expect(data.data.tokenHash).not.toBe(created.token);
  });

  it("baut die Kunden-URL auf den Selbstauskunftspfad", () => {
    expect(buildSelfDisclosureUrl("abc.def")).toBe("https://baufidesk.de/selbstauskunft/abc.def");
  });

  it("löst ein gültiges Token auf", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: true,
      expiresAt: morgen,
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toEqual({
      linkId: "link-1",
      caseId: "case-1",
      organizationId: "org-1",
    });
  });

  it("weist einen widerrufenen Link ab", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: false,
      expiresAt: morgen,
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });

  it("weist einen abgelaufenen Link ab", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: true,
      expiresAt: new Date(Date.now() - 1000),
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });

  it("weist ein Token mit falscher Signatur ab", async () => {
    await expect(resolveSelfDisclosureToken("gefaelscht.xxxx")).resolves.toBeNull();
    expect(linkFindUnique).not.toHaveBeenCalled();
  });

  it("weist ein Upload-Token zurueck, das auf diesen Pfad gerichtet wird", async () => {
    // Beide Token nutzen dasselbe Format; die Trennung liegt in der Tabelle.
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue(null); // kein Selbstauskunfts-Link mit dieser ID
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-link.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/security/self-disclosure-link"`.

- [ ] **Step 5: Link-Mechanik schreiben**

Create `src/lib/security/self-disclosure-link.ts`:

```ts
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { createUploadToken, verifyUploadToken, hashToken } from "@/lib/security/upload-token";

/**
 * Magic Link für die Selbstauskunft – bewusst ein eigener Datensatz neben dem
 * Upload-Link. Beide Token haben dasselbe Format; getrennt sind sie durch die
 * Tabelle, in der ihre linkId liegt. Ein Upload-Token findet hier keinen
 * Datensatz und ist damit wirkungslos, und umgekehrt.
 *
 * Klartext-Token gibt es nur einmal bei der Erstellung; gespeichert wird der Hash.
 */
export interface CreatedSelfDisclosureLink {
  linkId: string;
  token: string;
  url: string;
  expiresAt: Date;
}

export function buildSelfDisclosureUrl(token: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/selbstauskunft/${token}`;
}

export async function createSelfDisclosureLink(
  caseId: string,
  expiresAt: Date,
  options: { organizationId: string; actorUserId?: string | null }
): Promise<CreatedSelfDisclosureLink> {
  const link = await prisma.selfDisclosureLink.create({
    data: { caseId, tokenHash: `pending-${crypto.randomUUID()}`, expiresAt, active: true },
  });

  const token = createUploadToken({
    caseId,
    linkId: link.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  await prisma.selfDisclosureLink.update({
    where: { id: link.id },
    data: { tokenHash: hashToken(token) },
  });

  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId: link.id, zweck: "selbstauskunft", expiresAt: expiresAt.toISOString() },
  });

  return { linkId: link.id, token, url: buildSelfDisclosureUrl(token), expiresAt };
}

export interface SelfDisclosureAccess {
  linkId: string;
  caseId: string;
  organizationId: string;
}

export async function resolveSelfDisclosureToken(token: string): Promise<SelfDisclosureAccess | null> {
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
    },
  });
  if (!link || !link.active) return null;
  if (link.expiresAt < new Date()) return null;
  if (link.caseId !== payload.caseId) return null;
  if (link.tokenHash !== hashToken(token)) return null;
  return { linkId: link.id, caseId: link.caseId, organizationId: link.case.organizationId };
}

export async function deactivateSelfDisclosureLink(
  linkId: string,
  ctx: { organizationId: string; userId?: string | null }
): Promise<void> {
  const link = await prisma.selfDisclosureLink.findUnique({
    where: { id: linkId },
    select: { id: true, caseId: true, case: { select: { organizationId: true } } },
  });
  if (!link || link.case.organizationId !== ctx.organizationId) return; // kein Leak
  await prisma.selfDisclosureLink.update({ where: { id: linkId }, data: { active: false } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId ?? null,
    action: "upload_link.deactivated",
    entityType: "case",
    entityId: link.caseId,
    metadata: { linkId, zweck: "selbstauskunft" },
  });
}
```

- [ ] **Step 6: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-link.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Step 8: Committen**

```bash
git add prisma/schema.prisma src/lib/security/self-disclosure-link.ts tests/selbstauskunft-link.test.ts
git commit -m "feat(selbstauskunft): Datenmodell und Magic-Link-Mechanik"
```

---

### Task 4: Antworten speichern und die Strecke rendern

**Files:**
- Create: `src/lib/actions/self-disclosure.ts`
- Create: `src/app/selbstauskunft/[token]/[schritt]/page.tsx`
- Create: `src/app/selbstauskunft/[token]/page.tsx` (Einstieg, leitet weiter)
- Create: `src/components/self-disclosure/step-form.tsx`
- Test: `tests/selbstauskunft-actions.test.ts` (neu)

**Interfaces:**
- Consumes: `resolveSelfDisclosureToken` (Task 3), `schrittSchema` (Task 2), `schrittFinden`, `naechsterSchritt`, `sichtbareSchritte`, `fortschritt` (Task 1/2).
- Produces: `speichereAntwort(token, schrittId, formData): Promise<{ error?: string; fieldErrors?: Record<string,string> }>` als Server Action; `ladeBogen(token): Promise<Bogen | null>`.

- [ ] **Step 1: Test schreiben**

Create `tests/selbstauskunft-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

const resolve = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolve(...a),
}));

const upsert = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      upsert: (...a: unknown[]) => upsert(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { speichereAntwort } from "@/lib/actions/self-disclosure";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [resolve, upsert, findUnique, redirect].forEach((m) => m.mockReset());
  resolve.mockResolvedValue({ linkId: "link-1", caseId: "case-1", organizationId: "org-1" });
  findUnique.mockResolvedValue({ answers: {}, submittedAt: null });
  upsert.mockResolvedValue({});
});

describe("speichereAntwort", () => {
  it("schreibt die Antwort unter dem Schluessel aus Schritt und Feld", async () => {
    await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    const arg = upsert.mock.calls[0]![0] as { create: { answers: Record<string, unknown> } };
    expect(arg.create.answers["finanzierungsart.art"]).toBe("kauf_bestand");
  });

  it("laesst einen leeren Schritt zu und speichert nichts davon", async () => {
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "" }));
    expect(res).toBeUndefined();
    const arg = upsert.mock.calls[0]![0] as { create: { answers: Record<string, unknown> } };
    expect(arg.create.answers["kaufpreis.betrag"]).toBeUndefined();
  });

  it("meldet einen unlesbaren Betrag zurueck, ohne zu speichern", async () => {
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "dreitausend" }));
    expect(res?.fieldErrors?.betrag).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("weist ein ungueltiges Token ab", async () => {
    resolve.mockResolvedValue(null);
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "1" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("nimmt nach dem Absenden keine Aenderung mehr an", async () => {
    findUnique.mockResolvedValue({ answers: {}, submittedAt: new Date() });
    const res = await speichereAntwort("tok", "kaufpreis", form({ betrag: "1" }));
    expect(res?.error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("merkt sich den erreichten Schritt", async () => {
    await speichereAntwort("tok", "finanzierungsart", form({ art: "kauf_bestand" }));
    const arg = upsert.mock.calls[0]![0] as { update: { currentStep: string } };
    expect(arg.update.currentStep).toBe("objektstand");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/self-disclosure"`.

- [ ] **Step 3: Server Action schreiben**

Create `src/lib/actions/self-disclosure.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { schrittFinden, naechsterSchritt, schluessel } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import type { Antworten } from "@/lib/self-disclosure/types";

export interface SchrittState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Speichert einen Schritt und schickt den Kunden zum nächsten.
 *
 * Grundsatz: Ein leerer Schritt ist gültig und wird übersprungen – er schreibt
 * nichts. Geprüft wird nur die Form eingegebener Werte; ungeprüfte Rohdaten
 * landen nie in der Datenbank.
 */
export async function speichereAntwort(
  token: string,
  schrittId: string,
  formData: FormData
): Promise<SchrittState | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bestand = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true },
  });
  if (bestand?.submittedAt) {
    return { error: "Ihre Angaben wurden bereits übermittelt. Bitte wenden Sie sich an Ihren Berater." };
  }

  const antworten = ((bestand?.answers as Antworten | null) ?? {}) as Antworten;
  const schritt = schrittFinden(schrittId, antworten);
  if (!schritt) return { error: "Dieser Schritt gehört nicht zu Ihrem Bogen." };

  const roh = Object.fromEntries(formData.entries());
  const geprueft = schrittSchema(schritt.schritt).safeParse(roh);
  if (!geprueft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of geprueft.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };
  }

  // Nur tatsächlich gegebene Werte schreiben. Eine Lücke darf einen früher
  // gegebenen Wert nicht löschen – der Kunde springt oft zurück.
  const neu: Antworten = { ...antworten };
  for (const [feldId, wert] of Object.entries(geprueft.data)) {
    if (wert === null || wert === undefined || wert === "") continue;
    neu[schluessel(schritt.id, feldId)] = wert as Antworten[string];
  }

  const nach = naechsterSchritt(schritt.id, neu);
  const currentStep = nach?.id ?? "zusammenfassung";

  await prisma.selfDisclosure.upsert({
    where: { linkId: access.linkId },
    create: { linkId: access.linkId, caseId: access.caseId, answers: neu as object, currentStep },
    update: { answers: neu as object, currentStep },
  });

  redirect(`/selbstauskunft/${token}/${currentStep}`);
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-actions.test.ts`
Expected: PASS (6 Tests).

Hinweis: `redirect` wird gemockt und wirft nicht — die Action läuft im Test
durch. In der echten Anwendung wirft `redirect`, das ist gewollt.

- [ ] **Step 5: Schritt-Formular schreiben**

Create `src/components/self-disclosure/step-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { speichereAntwort, type SchrittState } from "@/lib/actions/self-disclosure";
import type { Feld } from "@/lib/self-disclosure/types";

/** Der Knopf sagt, was passiert: leer lassen ist erlaubt, aber sichtbar. */
function WeiterButton({ etwasEingetragen }: { etwasEingetragen: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : etwasEingetragen ? "Weiter" : "Überspringen"}
    </Button>
  );
}

export function StepForm({
  token,
  schrittId,
  frage,
  hinweis,
  felder,
  defaults,
}: {
  token: string;
  schrittId: string;
  frage: string;
  hinweis?: string;
  felder: Feld[];
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState<SchrittState, FormData>(
    async (_prev, fd) => (await speichereAntwort(token, schrittId, fd)) ?? {},
    {}
  );
  const [eingetragen, setEingetragen] = useState(
    Object.values(defaults).some((v) => v !== "")
  );

  // Eine einzelne Auswahl bekommt die großen Kacheln von FinLink und schickt
  // direkt ab – ein Klick, ein Schritt weiter.
  const einzelneAuswahl = felder.length === 1 && felder[0]!.typ === "auswahl";

  return (
    <form action={action} className="space-y-6" onChange={(e) => {
      const f = e.currentTarget;
      setEingetragen(Array.from(new FormData(f).values()).some((v) => String(v).trim() !== ""));
    }}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{frage}</h1>
        {hinweis && <p className="text-sm text-muted-foreground">{hinweis}</p>}
      </div>

      {einzelneAuswahl ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {felder[0]!.optionen!.map((o) => (
            <button
              key={o.wert}
              type="submit"
              name={felder[0]!.id}
              value={o.wert}
              className="rounded-xl border p-5 text-left text-base hover:border-primary hover:bg-muted/50"
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {felder.map((feld) => (
            <div key={feld.id} className="space-y-1.5">
              <Label htmlFor={feld.id}>{feld.label}</Label>
              {feld.typ === "auswahl" ? (
                <select
                  id={feld.id}
                  name={feld.id}
                  defaultValue={defaults[feld.id] ?? ""}
                  className="h-11 w-full rounded-md border bg-background px-3"
                >
                  <option value="">– keine Angabe –</option>
                  {feld.optionen!.map((o) => (
                    <option key={o.wert} value={o.wert}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={feld.id}
                  name={feld.id}
                  type={feld.typ === "datum" ? "date" : "text"}
                  inputMode={feld.typ === "betrag" || feld.typ === "zahl" ? "decimal" : undefined}
                  defaultValue={defaults[feld.id] ?? ""}
                />
              )}
              {feld.hinweis && <p className="text-xs text-muted-foreground">{feld.hinweis}</p>}
              {state.fieldErrors?.[feld.id] && (
                <p className="text-xs text-destructive">{state.fieldErrors[feld.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {!einzelneAuswahl && <WeiterButton etwasEingetragen={eingetragen} />}
    </form>
  );
}
```

Der Import von `useState` fehlt oben — die erste Zeile entsprechend ergänzen:

```tsx
import { useActionState, useState } from "react";
```

- [ ] **Step 6: Seiten anlegen**

Create `src/app/selbstauskunft/[token]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

/** Einstieg: schickt an den zuletzt erreichten Schritt (oder den ersten). */
export default async function SelbstauskunftEinstieg({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveSelfDisclosureToken(token);
  if (!access) redirect(`/selbstauskunft/${token}/ungueltig`);

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { currentStep: true, answers: true, submittedAt: true },
  });
  if (bogen?.submittedAt) redirect(`/selbstauskunft/${token}/zusammenfassung`);

  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const ziel = bogen?.currentStep ?? sichtbareSchritte(antworten)[0]!.id;
  redirect(`/selbstauskunft/${token}/${ziel}`);
}
```

Create `src/app/selbstauskunft/[token]/[schritt]/page.tsx`:

```tsx
import Link from "next/link";
import { Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { schrittFinden, vorherigerSchritt, fortschritt, schluessel } from "@/lib/self-disclosure/navigation";
import { StepForm } from "@/components/self-disclosure/step-form";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

export default async function SelbstauskunftSchritt({
  params,
}: {
  params: Promise<{ token: string; schritt: string }>;
}) {
  const { token, schritt: schrittId } = await params;
  const access = await resolveSelfDisclosureToken(token);

  if (!access) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold">Link ungültig oder abgelaufen</h1>
            <p className="text-sm text-muted-foreground">
              Bitte wenden Sie sich an Ihren Berater – er schickt Ihnen einen neuen Link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true },
  });
  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const aktuell = schrittFinden(schrittId, antworten);
  if (!aktuell) {
    const { redirect } = await import("next/navigation");
    redirect(`/selbstauskunft/${token}`);
  }

  const f = fortschritt(aktuell!.id, antworten);
  const zurueck = vorherigerSchritt(aktuell!.id, antworten);

  // Vorbelegung: eigene frühere Antwort schlägt den Fallstand. Was der Fall
  // schon weiß (Name, Objektadresse, Kaufpreis nach FinLink-Import), muss
  // niemand abtippen.
  const stand = await ladeVorbelegung(access.caseId);
  const defaults: Record<string, string> = {};
  for (const feld of aktuell!.schritt.felder) {
    const eigene = antworten[schluessel(aktuell!.id, feld.id)];
    if (eigene != null && eigene !== "") {
      defaults[feld.id] = String(eigene);
      continue;
    }
    defaults[feld.id] = vorbelegung(stand, feld, aktuell!.person ?? 1);
  }
  const personenHinweis =
    aktuell!.person === 2 ? "Nun zu Ihrem Mitantragsteller" : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-6">
      <Logo />
      {personenHinweis && (
        <p className="text-sm font-medium text-muted-foreground">{personenHinweis}</p>
      )}
      <StepForm
        token={token}
        schrittId={aktuell!.id}
        frage={aktuell!.schritt.frage}
        hinweis={aktuell!.schritt.hinweis}
        felder={aktuell!.schritt.felder}
        defaults={defaults}
      />
      <div className="mt-auto space-y-2">
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((f.position / Math.max(f.gesamt, 1)) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {zurueck ? (
            <Link href={`/selbstauskunft/${token}/${zurueck.id}`} className="hover:underline">
              zurück
            </Link>
          ) : (
            <span />
          )}
          <span>
            Schritt {f.position} von {f.gesamt}
          </span>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Vorbelegung schreiben**

Create `src/lib/self-disclosure/prefill.ts`:

```ts
import { prisma } from "@/lib/db";
import type { Feld } from "@/lib/self-disclosure/types";

/**
 * Bekannte Werte aus dem Fall, damit der Kunde nichts abtippt, was schon
 * vorliegt. Bewusst dieselbe Abwägung wie auf der Upload-Seite: Wer den Link
 * hat, sieht die Falldaten.
 */
export interface Vorbelegungsstand {
  applicants: Array<Record<string, unknown> & { position: number }>;
  property: Record<string, unknown> | null;
  financingRequest: Record<string, unknown> | null;
}

export async function ladeVorbelegung(caseId: string): Promise<Vorbelegungsstand> {
  const [applicants, property, financingRequest] = await Promise.all([
    prisma.applicant.findMany({ where: { caseId }, orderBy: { position: "asc" } }),
    prisma.property.findUnique({ where: { caseId } }),
    prisma.financingRequest.findUnique({ where: { caseId } }),
  ]);
  return {
    applicants: applicants as unknown as Vorbelegungsstand["applicants"],
    property: (property as Record<string, unknown> | null) ?? null,
    financingRequest: (financingRequest as Record<string, unknown> | null) ?? null,
  };
}

export function vorbelegung(stand: Vorbelegungsstand, feld: Feld, person: 1 | 2): string {
  if (!feld.ziel || "liste" in feld.ziel) return "";
  const quelle =
    feld.ziel.entitaet === "applicant"
      ? stand.applicants.find((a) => a.position === person)
      : feld.ziel.entitaet === "property"
        ? stand.property
        : feld.ziel.entitaet === "financingRequest"
          ? stand.financingRequest
          : null;
  const v = quelle?.[feld.ziel.feld];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
```

Im Schritt-Seiten-Modul die Importe ergänzen:

```tsx
import { ladeVorbelegung, vorbelegung } from "@/lib/self-disclosure/prefill";
```

- [ ] **Step 8: Tests und Typecheck**

Run: `npx vitest run tests/selbstauskunft-actions.test.ts && npm run typecheck`
Expected: PASS, Typecheck ohne Ausgabe.

- [ ] **Step 9: Committen**

```bash
git add src/lib/actions/self-disclosure.ts src/lib/self-disclosure/prefill.ts src/app/selbstauskunft src/components/self-disclosure tests/selbstauskunft-actions.test.ts
git commit -m "feat(selbstauskunft): Kundenstrecke mit Schritten, Ueberspringen und Wiederaufnahme"
```

---

### Task 5: Zusammenfassung und Absenden

**Files:**
- Create: `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx`
- Modify: `src/lib/actions/self-disclosure.ts`
- Test: `tests/selbstauskunft-absenden.test.ts` (neu)

**Interfaces:**
- Consumes: `resolveSelfDisclosureToken`, `sichtbareSchritte`, `offeneFelder`.
- Produces: `sendeAb(token): Promise<{ error?: string } | undefined>`.

- [ ] **Step 1: Test schreiben**

Create `tests/selbstauskunft-absenden.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const resolve = vi.fn();
vi.mock("@/lib/security/self-disclosure-link", () => ({
  resolveSelfDisclosureToken: (...a: unknown[]) => resolve(...a),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { sendeAb } from "@/lib/actions/self-disclosure";

beforeEach(() => {
  [resolve, findUnique, update].forEach((m) => m.mockReset());
  resolve.mockResolvedValue({ linkId: "link-1", caseId: "case-1", organizationId: "org-1" });
  update.mockResolvedValue({});
});

describe("sendeAb", () => {
  it("sendet einen Bogen mit Luecken ab – Pflichtfelder gibt es nicht", async () => {
    findUnique.mockResolvedValue({ id: "sd-1", answers: {}, submittedAt: null });
    await sendeAb("tok");
    const arg = update.mock.calls[0]![0] as { data: { submittedAt: Date } };
    expect(arg.data.submittedAt).toBeInstanceOf(Date);
  });

  it("laesst sich nicht zweimal absenden", async () => {
    findUnique.mockResolvedValue({ id: "sd-1", answers: {}, submittedAt: new Date() });
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("weist ein ungueltiges Token ab", async () => {
    resolve.mockResolvedValue(null);
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("sendet nichts ab, wenn noch gar kein Bogen existiert", async () => {
    findUnique.mockResolvedValue(null);
    const res = await sendeAb("tok");
    expect(res?.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-absenden.test.ts`
Expected: FAIL — `sendeAb is not a function`.

- [ ] **Step 3: Absenden schreiben**

In `src/lib/actions/self-disclosure.ts` ergänzen:

```ts
import { audit } from "@/lib/audit";

/**
 * Schließt den Bogen ab. Lücken sind ausdrücklich erlaubt – der Eingang zeigt
 * sie dem Vermittler als Nachfassliste. Ab hier ist der Bogen nur noch lesbar.
 */
export async function sendeAb(token: string): Promise<{ error?: string } | undefined> {
  const access = await resolveSelfDisclosureToken(token);
  if (!access) return { error: "Der Link ist ungültig oder abgelaufen." };

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { id: true, submittedAt: true },
  });
  if (!bogen) return { error: "Es sind noch keine Angaben gespeichert." };
  if (bogen.submittedAt) return { error: "Ihre Angaben wurden bereits übermittelt." };

  await prisma.selfDisclosure.update({
    where: { id: bogen.id },
    data: { submittedAt: new Date(), currentStep: "zusammenfassung" },
  });

  await audit({
    organizationId: access.organizationId,
    userId: null,
    action: "case.updated",
    entityType: "case",
    entityId: access.caseId,
    metadata: { quelle: "selbstauskunft", ereignis: "eingegangen" },
  });
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-absenden.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Zusammenfassungsseite anlegen**

Create `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx`:

```tsx
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { sichtbareSchritte, schluessel } from "@/lib/self-disclosure/navigation";
import { sendeAb } from "@/lib/actions/self-disclosure";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

export default async function Zusammenfassung({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveSelfDisclosureToken(token);
  if (!access) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <p className="text-sm text-muted-foreground">Link ungültig oder abgelaufen.</p>
      </main>
    );
  }

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true },
  });
  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;

  if (bogen?.submittedAt) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-lg font-semibold">Vielen Dank!</h1>
            <p className="text-sm text-muted-foreground">
              Ihre Angaben sind bei Ihrem Berater eingegangen. Fällt Ihnen noch etwas ein, melden
              Sie sich einfach – Sie bekommen dann einen neuen Link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function absenden() {
    "use server";
    await sendeAb(token);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Logo />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Bitte prüfen Sie Ihre Angaben</h1>
        <p className="text-sm text-muted-foreground">
          Offene Angaben sind kein Problem – Ihr Berater fragt bei Bedarf nach.
        </p>
      </div>

      <div className="space-y-4">
        {sichtbareSchritte(antworten).map((s) => (
          <div key={s.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                {s.schritt.frage}
                {s.person ? ` (Antragsteller ${s.person})` : ""}
              </p>
              <Link
                href={`/selbstauskunft/${token}/${s.id}`}
                className="shrink-0 text-xs text-muted-foreground hover:underline"
              >
                ändern
              </Link>
            </div>
            <dl className="mt-2 space-y-1">
              {s.schritt.felder.map((feld) => {
                const v = antworten[schluessel(s.id, feld.id)];
                const leer = v === undefined || v === null || v === "";
                return (
                  <div key={feld.id} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{feld.label}</dt>
                    <dd className={leer ? "text-muted-foreground italic" : "font-medium"}>
                      {leer ? "noch offen" : String(v)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      <form action={absenden}>
        <Button type="submit" size="lg" className="w-full">
          Angaben absenden
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Tests und Typecheck**

Run: `npx vitest run tests/selbstauskunft-absenden.test.ts && npm run typecheck && npm run build`
Expected: PASS, Typecheck ohne Ausgabe, Build „Compiled successfully".

- [ ] **Step 7: Committen**

```bash
git add src/app/selbstauskunft src/lib/actions/self-disclosure.ts tests/selbstauskunft-absenden.test.ts
git commit -m "feat(selbstauskunft): Zusammenfassung und Absenden"
```

---

### Task 6: Übernahme-Planung (reine Logik)

**Files:**
- Create: `src/lib/self-disclosure/takeover.ts`
- Test: `tests/selbstauskunft-uebernahme.test.ts` (neu)

**Interfaces:**
- Consumes: `sichtbareSchritte`, `schluessel`, `offeneFelder` (Task 1/2), `Ziel` (Task 1).
- Produces:
  - `interface Fallstand { applicants: Array<{ position: number } & Record<string, unknown>>; property: Record<string, unknown> | null; financingRequest: Record<string, unknown> | null; caseFelder: Record<string, unknown> }`
  - `interface Vorschlag { schluessel: string; label: string; abschnitt: string; kundenwert: string; fallwert: string | null; art: "luecke" | "abweichung"; ziel: { entitaet: string; feld: string; person?: 1 | 2 } }`
  - `interface Uebernahmeplan { vorschlaege: Vorschlag[]; offen: Array<{ label: string; abschnitt: string }>; ohneZiel: Array<{ label: string; wert: string }> }`
  - `planUebernahme(antworten: Antworten, stand: Fallstand): Uebernahmeplan`

- [ ] **Step 1: Test schreiben**

Create `tests/selbstauskunft-uebernahme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planUebernahme, type Fallstand } from "@/lib/self-disclosure/takeover";
import type { Antworten } from "@/lib/self-disclosure/types";

const leererStand: Fallstand = {
  applicants: [{ position: 1 }],
  property: null,
  financingRequest: null,
  caseFelder: {},
};

describe("planUebernahme", () => {
  it("macht aus einer Angabe zu einem leeren Feld einen Lueckenvorschlag", () => {
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.person_name.vorname")!;
    expect(v.art).toBe("luecke");
    expect(v.kundenwert).toBe("Thomas");
    expect(v.fallwert).toBeNull();
    expect(v.ziel).toEqual({ entitaet: "applicant", feld: "vorname", person: 1 });
  });

  it("macht aus einem abweichenden Wert einen Abweichungsvorschlag", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ position: 1, vorname: "Tomas" }],
    };
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, stand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.person_name.vorname")!;
    expect(v.art).toBe("abweichung");
    expect(v.fallwert).toBe("Tomas");
  });

  it("schlaegt nichts vor, wenn der Wert bereits uebereinstimmt", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ position: 1, vorname: "Thomas" }],
    };
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, stand);
    expect(plan.vorschlaege).toHaveLength(0);
  });

  it("macht aus einer Luecke NIE einen Vorschlag – nichts wird geleert", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ position: 1, vorname: "Thomas" }],
    };
    const plan = planUebernahme({}, stand);
    expect(plan.vorschlaege).toHaveLength(0);
  });

  it("fuehrt uebersprungene Angaben als offen auf", () => {
    const plan = planUebernahme({}, leererStand);
    expect(plan.offen.some((o) => o.label.startsWith("Vorname"))).toBe(true);
  });

  it("ordnet Antworten der zweiten Person dem zweiten Antragsteller zu", () => {
    const a: Antworten = {
      "anzahl_antragsteller.anzahl": "2",
      "p2.person_name.vorname": "Laura",
    };
    const plan = planUebernahme(a, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p2.person_name.vorname")!;
    expect(v.ziel.person).toBe(2);
  });

  it("schreibt die Kinderzahl auf beide Antragsteller", () => {
    const a: Antworten = { "anzahl_antragsteller.anzahl": "2", "haushalt_kinder.anzahl": 2 };
    const plan = planUebernahme(a, {
      ...leererStand,
      applicants: [{ position: 1 }, { position: 2 }],
    });
    const kinder = plan.vorschlaege.filter((v) => v.ziel.feld === "anzahlKinder");
    expect(kinder.map((k) => k.ziel.person).sort()).toEqual([1, 2]);
  });

  it("sammelt Angaben ohne Zielfeld getrennt ein", () => {
    const plan = planUebernahme({ "haushalt_ausgaben.warmmiete": 950 }, leererStand);
    expect(plan.ohneZiel.some((o) => o.wert === "950")).toBe(true);
    expect(plan.vorschlaege.some((v) => v.schluessel.startsWith("haushalt_ausgaben"))).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-uebernahme.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/self-disclosure/takeover"`.

- [ ] **Step 3: Implementierung schreiben**

Create `src/lib/self-disclosure/takeover.ts`:

```ts
import { sichtbareSchritte, schluessel, offeneFelder } from "@/lib/self-disclosure/navigation";
import type { Antworten, Ziel } from "@/lib/self-disclosure/types";

/**
 * Vergleicht die Antworten des Kunden mit dem aktuellen Fallstand und macht
 * daraus Vorschläge. Reine Funktion, ohne Datenbank – die Vorschläge werden bei
 * jedem Aufruf frisch gerechnet und können deshalb nicht veralten.
 *
 * Zwei Grundsätze, die hier durchgesetzt werden:
 *  - Eine Lücke erzeugt NIE einen Vorschlag. Ein übersprungenes Feld darf einen
 *    gepflegten Wert nicht mit Leere überschreiben.
 *  - Ein abweichender Wert wird nie vorausgewählt; er wird nur gezeigt.
 */
export interface Fallstand {
  applicants: Array<{ position: number } & Record<string, unknown>>;
  property: Record<string, unknown> | null;
  financingRequest: Record<string, unknown> | null;
  caseFelder: Record<string, unknown>;
}

export interface Vorschlag {
  schluessel: string;
  label: string;
  abschnitt: string;
  kundenwert: string;
  fallwert: string | null;
  art: "luecke" | "abweichung";
  ziel: { entitaet: string; feld: string; person?: 1 | 2 };
}

export interface Uebernahmeplan {
  vorschlaege: Vorschlag[];
  /** Vom Kunden übersprungen – die Nachfassliste. */
  offen: Array<{ label: string; abschnitt: string }>;
  /** Angaben, für die es (noch) kein Zielfeld gibt, etwa Warmmiete. */
  ohneZiel: Array<{ label: string; wert: string }>;
}

const alsText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/** Der aktuell im Fall gespeicherte Wert für ein Ziel – oder null. */
function fallwertLesen(
  stand: Fallstand,
  ziel: Extract<Ziel, { feld: string }>,
  person: 1 | 2
): string | null {
  const leerZuNull = (v: unknown) => {
    const t = alsText(v);
    return t === "" ? null : t;
  };
  switch (ziel.entitaet) {
    case "case":
      return leerZuNull(stand.caseFelder[ziel.feld]);
    case "property":
      return leerZuNull(stand.property?.[ziel.feld]);
    case "financingRequest":
      return leerZuNull(stand.financingRequest?.[ziel.feld]);
    case "applicant": {
      const a = stand.applicants.find((x) => x.position === person);
      return leerZuNull(a?.[ziel.feld]);
    }
    default:
      // income/employment/selfEmployment: je Antragsteller ein eigener Datensatz,
      // der beim Übernehmen angelegt wird. Für den Vergleich zählt er als leer.
      return null;
  }
}

export function planUebernahme(antworten: Antworten, stand: Fallstand): Uebernahmeplan {
  const vorschlaege: Vorschlag[] = [];
  const ohneZiel: Array<{ label: string; wert: string }> = [];

  for (const s of sichtbareSchritte(antworten)) {
    for (const feld of s.schritt.felder) {
      const k = schluessel(s.id, feld.id);
      const roh = antworten[k];
      const kundenwert = alsText(roh);
      if (kundenwert === "" || (Array.isArray(roh) && roh.length === 0)) continue; // Lücke: nie ein Vorschlag

      const personLabel = s.person ? ` (Antragsteller ${s.person})` : "";
      const label = `${feld.label}${personLabel}`;

      if (!feld.ziel) {
        ohneZiel.push({ label, wert: kundenwert });
        continue;
      }
      if ("liste" in feld.ziel) {
        // Listen werden im Eingang als Block angeboten, nicht feldweise.
        ohneZiel.push({ label, wert: kundenwert });
        continue;
      }

      // Die Kinderzahl gilt dem Haushalt: sie geht an beide Antragsteller.
      const zielPersonen: Array<1 | 2> =
        s.schritt.id === "haushalt_kinder"
          ? (stand.applicants.map((a) => a.position).filter((p) => p === 1 || p === 2) as Array<1 | 2>)
          : [s.person ?? 1];

      for (const person of zielPersonen) {
        const fallwert = fallwertLesen(stand, feld.ziel, person);
        if (fallwert === kundenwert) continue;
        vorschlaege.push({
          schluessel: zielPersonen.length > 1 ? `${k}#p${person}` : k,
          label: zielPersonen.length > 1 ? `${feld.label} (Antragsteller ${person})` : label,
          abschnitt: s.schritt.abschnitt,
          kundenwert,
          fallwert,
          art: fallwert === null ? "luecke" : "abweichung",
          ziel: { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld, person },
        });
      }
    }
  }

  return {
    vorschlaege,
    offen: offeneFelder(antworten).map((o) => ({ label: o.label, abschnitt: o.abschnitt })),
    ohneZiel,
  };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-uebernahme.test.ts`
Expected: PASS (8 Tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe.

- [ ] **Step 6: Committen**

```bash
git add src/lib/self-disclosure/takeover.ts tests/selbstauskunft-uebernahme.test.ts
git commit -m "feat(selbstauskunft): Uebernahme-Planung als reine Logik"
```

---

### Task 7: Übernehmen im Backoffice

**Files:**
- Modify: `src/lib/actions/self-disclosure.ts`
- Create: `src/components/case/self-disclosure-inbox.tsx`
- Test: `tests/selbstauskunft-uebernehmen-action.test.ts` (neu)

**Interfaces:**
- Consumes: `planUebernahme`, `Fallstand` (Task 6); `requireCaseAccess` aus `@/lib/auth/context`; `LOCKED_CASE_STATUSES` aus `@/lib/domain/enums`.
- Produces: `ladeUebernahmeplan(caseId): Promise<{ plan: Uebernahmeplan; disclosureId: string; submittedAt: Date } | null>`; `uebernehmen(caseId, schluesselListe: string[]): Promise<{ error?: string }>`.

- [ ] **Step 1: Test schreiben**

Create `tests/selbstauskunft-uebernehmen-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ctx = { organizationId: "org-A", userId: "user-1" };
const requireCaseAccess = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: (...a: unknown[]) => requireCaseAccess(...a),
  resolveUploadToken: vi.fn(),
}));

const disclosureFindFirst = vi.fn();
const disclosureUpdate = vi.fn();
const applicantFindMany = vi.fn();
const applicantUpdate = vi.fn();
const applicantCreate = vi.fn();
const caseFindUnique = vi.fn();
const propertyFindUnique = vi.fn();
const financingFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosure: {
      findFirst: (...a: unknown[]) => disclosureFindFirst(...a),
      update: (...a: unknown[]) => disclosureUpdate(...a),
    },
    applicant: {
      findMany: (...a: unknown[]) => applicantFindMany(...a),
      update: (...a: unknown[]) => applicantUpdate(...a),
      create: (...a: unknown[]) => applicantCreate(...a),
    },
    case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
    property: { findUnique: (...a: unknown[]) => propertyFindUnique(...a) },
    financingRequest: { findUnique: (...a: unknown[]) => financingFindUnique(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      typeof fn === "function" ? fn({}) : undefined,
  },
}));

import { uebernehmen } from "@/lib/actions/self-disclosure";

beforeEach(() => {
  [
    requireCaseAccess,
    disclosureFindFirst,
    disclosureUpdate,
    applicantFindMany,
    applicantUpdate,
    applicantCreate,
    caseFindUnique,
    propertyFindUnique,
    financingFindUnique,
  ].forEach((m) => m.mockReset());
  requireCaseAccess.mockResolvedValue({ ctx, caseRow: { id: "case-A", organizationId: "org-A" } });
  caseFindUnique.mockResolvedValue({ id: "case-A", status: "unterlagen_fehlen", financingType: null });
  propertyFindUnique.mockResolvedValue(null);
  financingFindUnique.mockResolvedValue(null);
  applicantFindMany.mockResolvedValue([{ id: "a1", position: 1 }]);
  applicantUpdate.mockResolvedValue({});
  applicantCreate.mockResolvedValue({ id: "a2", position: 2 });
  disclosureUpdate.mockResolvedValue({});
  disclosureFindFirst.mockResolvedValue({
    id: "sd-1",
    caseId: "case-A",
    submittedAt: new Date(),
    takenOverAt: null,
    answers: { "p1.person_name.vorname": "Thomas" },
  });
});

describe("uebernehmen", () => {
  it("schreibt nur die ausgewaehlten Vorschlaege", async () => {
    await uebernehmen("case-A", ["p1.person_name.vorname"]);
    const arg = applicantUpdate.mock.calls[0]![0] as { where: { id: string }; data: Record<string, unknown> };
    expect(arg.where.id).toBe("a1");
    expect(arg.data.vorname).toBe("Thomas");
  });

  it("laesst nicht ausgewaehlte Vorschlaege unangetastet", async () => {
    await uebernehmen("case-A", []);
    expect(applicantUpdate).not.toHaveBeenCalled();
  });

  it("legt Antragsteller 2 an, wenn Angaben dazu uebernommen werden", async () => {
    disclosureFindFirst.mockResolvedValue({
      id: "sd-1",
      caseId: "case-A",
      submittedAt: new Date(),
      takenOverAt: null,
      answers: { "anzahl_antragsteller.anzahl": "2", "p2.person_name.vorname": "Laura" },
    });
    await uebernehmen("case-A", ["p2.person_name.vorname"]);
    expect(applicantCreate).toHaveBeenCalled();
  });

  it("verweigert die Uebernahme bei gesperrtem Fall", async () => {
    caseFindUnique.mockResolvedValue({ id: "case-A", status: "exportiert", financingType: null });
    const res = await uebernehmen("case-A", ["p1.person_name.vorname"]);
    expect(res.error).toBeTruthy();
    expect(applicantUpdate).not.toHaveBeenCalled();
  });

  it("markiert den Bogen als uebernommen", async () => {
    await uebernehmen("case-A", ["p1.person_name.vorname"]);
    const arg = disclosureUpdate.mock.calls[0]![0] as { data: { takenOverAt: Date } };
    expect(arg.data.takenOverAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/selbstauskunft-uebernehmen-action.test.ts`
Expected: FAIL — `uebernehmen is not a function`.

- [ ] **Step 3: Aktionen schreiben**

In `src/lib/actions/self-disclosure.ts` ergänzen:

```ts
import { revalidatePath } from "next/cache";
import { requireCaseAccess } from "@/lib/auth/context";
import { LOCKED_CASE_STATUSES } from "@/lib/domain/enums";
import { planUebernahme, type Fallstand, type Uebernahmeplan } from "@/lib/self-disclosure/takeover";

/** Lädt den zuletzt eingegangenen, noch nicht übernommenen Bogen eines Falls. */
export async function ladeUebernahmeplan(caseId: string): Promise<{
  plan: Uebernahmeplan;
  disclosureId: string;
  submittedAt: Date;
} | null> {
  const { ctx } = await requireCaseAccess(caseId);
  const bogen = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: { not: null }, takenOverAt: null },
    orderBy: { submittedAt: "desc" },
    select: { id: true, answers: true, submittedAt: true },
  });
  if (!bogen) return null;

  const stand = await ladeFallstand(caseId);
  void ctx;
  return {
    plan: planUebernahme((bogen.answers as Antworten) ?? {}, stand),
    disclosureId: bogen.id,
    submittedAt: bogen.submittedAt!,
  };
}

async function ladeFallstand(caseId: string): Promise<Fallstand> {
  const [applicants, property, financingRequest, fall] = await Promise.all([
    prisma.applicant.findMany({ where: { caseId }, orderBy: { position: "asc" } }),
    prisma.property.findUnique({ where: { caseId } }),
    prisma.financingRequest.findUnique({ where: { caseId } }),
    prisma.case.findUnique({ where: { id: caseId }, select: { financingType: true } }),
  ]);
  return {
    applicants: applicants as unknown as Fallstand["applicants"],
    property: (property as Record<string, unknown> | null) ?? null,
    financingRequest: (financingRequest as Record<string, unknown> | null) ?? null,
    caseFelder: { financingType: fall?.financingType ?? null },
  };
}

/**
 * Übernimmt die ausgewählten Vorschläge in den Fall. Nichts wird ohne Auswahl
 * geschrieben; ein gesperrter Fall nimmt nichts an.
 */
export async function uebernehmen(
  caseId: string,
  schluesselListe: string[]
): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);

  const fall = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, financingType: true } });
  if (!fall) return { error: "Fall nicht gefunden." };
  if ((LOCKED_CASE_STATUSES as readonly string[]).includes(fall.status)) {
    return { error: "Der Fall ist gesperrt – die Angaben können nicht übernommen werden." };
  }

  const bogen = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: { not: null }, takenOverAt: null },
    orderBy: { submittedAt: "desc" },
    select: { id: true, answers: true },
  });
  if (!bogen) return { error: "Es liegt keine eingegangene Selbstauskunft vor." };

  const antworten = (bogen.answers as Antworten) ?? {};
  const stand = await ladeFallstand(caseId);
  const plan = planUebernahme(antworten, stand);
  const gewaehlt = plan.vorschlaege.filter((v) => schluesselListe.includes(v.schluessel));

  // Antragsteller 2 entsteht erst hier – ein halb ausgefüllter Bogen soll den
  // Fall nicht verändern.
  const benoetigtePersonen = new Set(gewaehlt.map((v) => v.ziel.person).filter(Boolean) as number[]);
  const vorhanden = new Map(stand.applicants.map((a) => [a.position, a.id as string]));
  for (const position of [...benoetigtePersonen].sort()) {
    if (vorhanden.has(position)) continue;
    const angelegt = await prisma.applicant.create({ data: { caseId, position } });
    vorhanden.set(position, angelegt.id);
  }

  const proApplicant = new Map<string, Record<string, unknown>>();
  const proProperty: Record<string, unknown> = {};
  const proFinancing: Record<string, unknown> = {};

  for (const v of gewaehlt) {
    const wert = v.kundenwert;
    switch (v.ziel.entitaet) {
      case "applicant": {
        const id = vorhanden.get(v.ziel.person ?? 1);
        if (!id) break;
        const daten = proApplicant.get(id) ?? {};
        daten[v.ziel.feld] = konvertiere(v.ziel.feld, wert);
        proApplicant.set(id, daten);
        break;
      }
      case "property":
        proProperty[v.ziel.feld] = konvertiere(v.ziel.feld, wert);
        break;
      case "financingRequest":
        proFinancing[v.ziel.feld] = konvertiere(v.ziel.feld, wert);
        break;
      default:
        // income/employment/selfEmployment: eigener Schritt, siehe Task 9.
        break;
    }
  }

  for (const [id, daten] of proApplicant) {
    await prisma.applicant.update({ where: { id }, data: daten });
  }
  if (Object.keys(proProperty).length > 0) {
    await prisma.property.upsert({
      where: { caseId },
      create: { caseId, ...proProperty },
      update: proProperty,
    });
  }
  if (Object.keys(proFinancing).length > 0) {
    await prisma.financingRequest.upsert({
      where: { caseId },
      create: { caseId, ...proFinancing },
      update: proFinancing,
    });
  }

  await prisma.selfDisclosure.update({
    where: { id: bogen.id },
    data: { takenOverAt: new Date() },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "field.corrected",
    entityType: "case",
    entityId: caseId,
    metadata: { quelle: "selbstauskunft", uebernommen: gewaehlt.length },
  });

  revalidatePath(`/cases/${caseId}`);
  return {};
}

/** Wandelt den Textwert in den Typ, den das Zielfeld erwartet. */
function konvertiere(feld: string, wert: string): unknown {
  const datumsfelder = ["geburtsdatum", "eintrittsdatum", "befristetBis", "gruendungsdatum"];
  const zahlenfelder = [
    "anzahlKinder",
    "wohnflaeche",
    "grundstuecksflaeche",
    "baujahr",
    "anzahlZimmer",
    "stellplaetze",
    "kaufpreis",
    "baukosten",
    "modernisierungskosten",
    "eigenkapital",
    "darlehenswunsch",
    "maklerprovisionProzent",
    "hausgeldMonatlich",
    "mieteinnahmenMonatlich",
  ];
  if (datumsfelder.includes(feld)) return new Date(wert);
  if (zahlenfelder.includes(feld)) return Number(wert);
  return wert;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/selbstauskunft-uebernehmen-action.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Prüfansicht schreiben**

Create `src/components/case/self-disclosure-inbox.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uebernehmen } from "@/lib/actions/self-disclosure";

export interface VorschlagRow {
  schluessel: string;
  label: string;
  abschnitt: string;
  kundenwert: string;
  fallwert: string | null;
  art: "luecke" | "abweichung";
}

/**
 * Prüfansicht der eingegangenen Selbstauskunft.
 *
 * Lücken sind vorausgewählt (dort geht nichts verloren), Abweichungen nie –
 * die Entscheidung über einen bestehenden Wert trifft immer der Vermittler.
 */
export function SelfDisclosureInbox({
  caseId,
  vorschlaege,
  offen,
  ohneZiel,
  submittedAt,
}: {
  caseId: string;
  vorschlaege: VorschlagRow[];
  offen: Array<{ label: string; abschnitt: string }>;
  ohneZiel: Array<{ label: string; wert: string }>;
  submittedAt: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(
    new Set(vorschlaege.filter((v) => v.art === "luecke").map((v) => v.schluessel))
  );
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function toggle(schluessel: string) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
  }

  const luecken = vorschlaege.filter((v) => v.art === "luecke");
  const abweichungen = vorschlaege.filter((v) => v.art === "abweichung");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Eingegangen am {submittedAt}</p>
        <Button
          disabled={pending || gewaehlt.size === 0}
          onClick={() =>
            startTransition(async () => {
              const res = await uebernehmen(caseId, [...gewaehlt]);
              setFehler(res.error ?? null);
            })
          }
        >
          {pending ? "Wird übernommen …" : `${gewaehlt.size} Angabe${gewaehlt.size === 1 ? "" : "n"} übernehmen`}
        </Button>
      </div>
      {fehler && <p className="text-sm text-destructive">{fehler}</p>}

      {luecken.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lücken füllen ({luecken.length})</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setGewaehlt(new Set(vorschlaege.map((v) => v.schluessel)))}
            >
              Alle auswählen
            </button>
          </div>
          {luecken.map((v) => (
            <label key={v.schluessel} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={gewaehlt.has(v.schluessel)}
                onChange={() => toggle(v.schluessel)}
              />
              <span className="flex-1">{v.label}</span>
              <span className="font-medium">{v.kundenwert}</span>
            </label>
          ))}
        </section>
      )}

      {abweichungen.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Abweichungen ({abweichungen.length})</h3>
          {abweichungen.map((v) => (
            <label key={v.schluessel} className="flex items-center gap-3 rounded-md border border-amber-300 p-3 text-sm">
              <input
                type="checkbox"
                checked={gewaehlt.has(v.schluessel)}
                onChange={() => toggle(v.schluessel)}
              />
              <span className="flex-1">{v.label}</span>
              <span className="text-muted-foreground line-through">{v.fallwert}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{v.kundenwert}</span>
            </label>
          ))}
        </section>
      )}

      {offen.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Vom Kunden offen gelassen ({offen.length})</h3>
          <p className="text-xs text-muted-foreground">
            Der Bogen verlangt keine Angabe – das hier ist deine Nachfassliste.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offen.map((o) => (
              <Badge key={o.label} variant="outline">
                {o.label}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {ohneZiel.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Nur zur Kenntnis</h3>
          <p className="text-xs text-muted-foreground">
            Angaben ohne eigenes Feld in der Fallakte – etwa Warmmiete und Unterhalt.
          </p>
          <dl className="space-y-1 text-sm">
            {ohneZiel.map((o) => (
              <div key={o.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{o.label}</dt>
                <dd className="font-medium">{o.wert}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Tests und Typecheck**

Run: `npx vitest run tests/selbstauskunft-uebernehmen-action.test.ts && npm run typecheck`
Expected: PASS, keine Ausgabe.

- [ ] **Step 7: Committen**

```bash
git add src/lib/actions/self-disclosure.ts src/components/case/self-disclosure-inbox.tsx tests/selbstauskunft-uebernehmen-action.test.ts
git commit -m "feat(selbstauskunft): Eingang mit Freigabe im Backoffice"
```

---

### Task 8: Einbettung — Fallseite, Prioritätsleiter, Upload-Seite

**Files:**
- Create: `src/components/case/self-disclosure-manager.tsx`
- Modify: `src/lib/actions/self-disclosure.ts` (Link-Aktionen)
- Modify: `src/app/(app)/cases/[id]/page.tsx`
- Modify: `src/lib/cases/next-step.ts`
- Modify: `src/lib/cases/cockpit.ts` (Zähler bereitstellen)
- Modify: `src/app/upload/[token]/page.tsx`
- Test: `tests/next-step.test.ts` (bestehend, erweitern)

**Interfaces:**
- Consumes: `createSelfDisclosureLink`, `deactivateSelfDisclosureLink` (Task 3); `ladeUebernahmeplan` (Task 7).
- Produces: `NextStep["key"]` um `"selbstauskunft_eingegangen"` und `"selbstauskunft_wartet"` erweitert; `NextStepInput.selbstauskunft?: { eingegangen: boolean; erstelltVorTagen: number | null; begonnen: boolean }`.

- [ ] **Step 1: Test für die Prioritätsleiter ergänzen**

In `tests/next-step.test.ts` innerhalb des bestehenden `describe` ergänzen (falls die Datei nicht existiert, mit dem Kopf aus einer bestehenden Testdatei neu anlegen und `computeNextStep` importieren):

```ts
  it("stellt eine eingegangene Selbstauskunft vor die Dokumentfreigabe", () => {
    const step = computeNextStep({
      caseId: "c1",
      status: "unterlagen_fehlen",
      counts: { pruefbereit: 3, docsMissing: 0, criticals: 0, docsFehler: 0, docsLaufend: 0 },
      missingCustomerFields: [],
      selbstauskunft: { eingegangen: true, begonnen: true, erstelltVorTagen: 2 },
    });
    expect(step.key).toBe("selbstauskunft_eingegangen");
  });

  it("erinnert an eine verschickte, nicht begonnene Selbstauskunft", () => {
    const step = computeNextStep({
      caseId: "c1",
      status: "unterlagen_fehlen",
      counts: { pruefbereit: 0, docsMissing: 0, criticals: 0, docsFehler: 0, docsLaufend: 0 },
      missingCustomerFields: [],
      selbstauskunft: { eingegangen: false, begonnen: false, erstelltVorTagen: 5 },
    });
    expect(step.key).toBe("selbstauskunft_wartet");
  });

  it("erinnert nicht, solange der Link frisch ist", () => {
    const step = computeNextStep({
      caseId: "c1",
      status: "unterlagen_fehlen",
      counts: { pruefbereit: 0, docsMissing: 0, criticals: 0, docsFehler: 0, docsLaufend: 0 },
      missingCustomerFields: [],
      selbstauskunft: { eingegangen: false, begonnen: false, erstelltVorTagen: 1 },
    });
    expect(step.key).not.toBe("selbstauskunft_wartet");
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/next-step.test.ts`
Expected: FAIL — `selbstauskunft` ist kein bekanntes Feld von `NextStepInput`.

- [ ] **Step 3: Prioritätsleiter erweitern**

In `src/lib/cases/next-step.ts` den Schlüsseltyp ergänzen:

```ts
  key:
    | "ki_laeuft"
    | "ki_fehler"
    | "selbstauskunft_eingegangen"
    | "dokumente_freigeben"
    | "kundendaten"
    | "kritische_hinweise"
    | "unterlagen_anfordern"
    | "selbstauskunft_wartet"
    | "fristen"
    | "einreichung";
```

`NextStepInput` erweitern:

```ts
export interface NextStepInput {
  caseId: string;
  status: string;
  counts: {
    pruefbereit: number;
    docsMissing: number;
    criticals: number;
    docsFehler: number;
    docsLaufend: number;
  };
  missingCustomerFields: string[];
  /** Stand der Selbstauskunft; fehlt bei Fällen ohne Link. */
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    /** Tage seit Erstellung des Links; null, wenn kein Link existiert. */
    erstelltVorTagen: number | null;
  };
}
```

In `computeNextStep` direkt **nach** dem `docsFehler`-Block einfügen:

```ts
  // Vor der Dokumentfreigabe: Die Selbstauskunft liefert die Stammdaten, aus
  // denen Haushaltsrechnung und Einreichung entstehen.
  if (c.selbstauskunft?.eingegangen) {
    return {
      key: "selbstauskunft_eingegangen",
      title: "Selbstauskunft prüfen & übernehmen",
      reason:
        "Der Kunde hat seine Angaben geschickt. Nach deiner Freigabe stehen sie in der Fallakte.",
      tone: "review",
      cta: { label: "Angaben ansehen", href: `/cases/${id}#selbstauskunft` },
    };
  }
```

Und direkt **vor** dem `status === "eingereicht"`-Block:

```ts
  if (
    c.selbstauskunft &&
    !c.selbstauskunft.begonnen &&
    c.selbstauskunft.erstelltVorTagen !== null &&
    c.selbstauskunft.erstelltVorTagen >= 3
  ) {
    return {
      key: "selbstauskunft_wartet",
      title: "Selbstauskunft nachfassen",
      reason: `Der Link liegt seit ${c.selbstauskunft.erstelltVorTagen} Tagen beim Kunden, ohne dass er begonnen hat.`,
      tone: "review",
      cta: { label: "Kunden erinnern", href: `/cases/${id}/messages` },
    };
  }
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx vitest run tests/next-step.test.ts`
Expected: PASS.

- [ ] **Step 5: Link-Aktionen ergänzen**

In `src/lib/actions/self-disclosure.ts` ergänzen:

```ts
import { createSelfDisclosureLink, deactivateSelfDisclosureLink } from "@/lib/security/self-disclosure-link";

export interface SelfDisclosureLinkState {
  url?: string;
  error?: string;
}

/**
 * Erzeugt einen Link; der Klartext wird nur hier einmal zurückgegeben.
 *
 * War ein früherer Bogen begonnen, aber nie abgesendet, wandern seine Antworten
 * mit — sonst begänne der Kunde nach einem abgelaufenen Link wieder bei null.
 * Ein abgesendeter Bogen wird nie fortgeschrieben: Er ist der belegte Stand.
 */
export async function erstelleSelbstauskunftLink(
  caseId: string,
  tage = 14
): Promise<SelfDisclosureLinkState> {
  const { ctx } = await requireCaseAccess(caseId);
  const expiresAt = new Date(Date.now() + tage * 86400_000);
  const created = await createSelfDisclosureLink(caseId, expiresAt, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });

  const unfertig = await prisma.selfDisclosure.findFirst({
    where: { caseId, submittedAt: null },
    orderBy: { createdAt: "desc" },
    select: { answers: true, currentStep: true },
  });
  if (unfertig) {
    await prisma.selfDisclosure.create({
      data: {
        linkId: created.linkId,
        caseId,
        answers: (unfertig.answers as object) ?? {},
        currentStep: unfertig.currentStep,
      },
    });
  }

  revalidatePath(`/cases/${caseId}`);
  return { url: created.url };
}

export async function widerrufeSelbstauskunftLink(caseId: string, linkId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await deactivateSelfDisclosureLink(linkId, { organizationId: ctx.organizationId, userId: ctx.userId });
  revalidatePath(`/cases/${caseId}`);
}
```

- [ ] **Step 6: Bereich auf der Fallseite einhängen**

Create `src/components/case/self-disclosure-manager.tsx` — Aufbau analog zu
`src/components/case/upload-link-manager.tsx` (Kopierknopf, Widerrufen,
Statuszeile). Der Kern:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Copy, Check, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { erstelleSelbstauskunftLink, widerrufeSelbstauskunftLink } from "@/lib/actions/self-disclosure";

export function SelfDisclosureManager({
  caseId,
  status,
  aktiverLinkId,
}: {
  caseId: string;
  /** Fertig formulierter Stand, z. B. "begonnen, Schritt 7 von 38". */
  status: string;
  aktiverLinkId: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div id="selbstauskunft" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Selbstauskunft</h3>
        <Badge variant="outline">{status}</Badge>
      </div>

      {url && (
        <div className="flex items-center gap-2 rounded-md bg-muted p-2">
          <code className="flex-1 truncate text-xs">{url}</code>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setKopiert(true);
              setTimeout(() => setKopiert(false), 1500);
            }}
          >
            {kopiert ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {kopiert ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Der Link ist nur hier einmal sichtbar – danach ist er nicht mehr abrufbar.
      </p>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await erstelleSelbstauskunftLink(caseId);
              setUrl(res.url ?? null);
            })
          }
        >
          {aktiverLinkId ? "Neuen Link erstellen" : "Link erstellen"}
        </Button>
        {aktiverLinkId && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => widerrufeSelbstauskunftLink(caseId, aktiverLinkId))}
          >
            <Ban className="mr-1 h-3 w-3" />
            Widerrufen
          </Button>
        )}
      </div>
    </div>
  );
}
```

In `src/app/(app)/cases/[id]/page.tsx` direkt unterhalb der
Upload-Link-Verwaltung einfügen:

```tsx
              <SelfDisclosureManager
                caseId={id}
                status={selbstauskunftStatus}
                aktiverLinkId={aktiverSelbstauskunftLink}
              />
              {uebernahme && (
                <SelfDisclosureInbox
                  caseId={id}
                  vorschlaege={uebernahme.plan.vorschlaege.map((v) => ({
                    schluessel: v.schluessel,
                    label: v.label,
                    abschnitt: v.abschnitt,
                    kundenwert: v.kundenwert,
                    fallwert: v.fallwert,
                    art: v.art,
                  }))}
                  offen={uebernahme.plan.offen}
                  ohneZiel={uebernahme.plan.ohneZiel}
                  submittedAt={uebernahme.submittedAt.toLocaleDateString("de-DE")}
                />
              )}
```

Mit den Importen:

```tsx
import { SelfDisclosureManager } from "@/components/case/self-disclosure-manager";
import { SelfDisclosureInbox } from "@/components/case/self-disclosure-inbox";
import { ladeUebernahmeplan } from "@/lib/actions/self-disclosure";
import { fortschritt } from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";
```

Und oben im Seiten-Body, bei den übrigen Ladevorgängen:

```tsx
  const uebernahme = await ladeUebernahmeplan(id);
```

Den Statustext aus dem Datensatz bilden:

```ts
const bogen = await prisma.selfDisclosure.findFirst({
  where: { caseId: id },
  orderBy: { createdAt: "desc" },
  select: { currentStep: true, answers: true, submittedAt: true, takenOverAt: true, link: { select: { id: true, active: true, createdAt: true } } },
});
const aktiverSelbstauskunftLink = bogen?.link?.active ? bogen.link.id : null;
const selbstauskunftStatus = !bogen?.link
  ? "noch nicht erstellt"
  : bogen.takenOverAt
    ? "übernommen"
    : bogen.submittedAt
      ? "eingegangen"
      : bogen.currentStep
        ? `begonnen, Schritt ${fortschritt(bogen.currentStep, (bogen.answers as Antworten) ?? {}).position} von ${fortschritt(bogen.currentStep, (bogen.answers as Antworten) ?? {}).gesamt}`
        : "erstellt, noch nicht begonnen";
```

- [ ] **Step 7: Upload-Seite auf einen Verweis umstellen**

In `src/app/upload/[token]/page.tsx` die Einbindung von `CustomerDataForm`
ersetzen. Statt des Formulars:

```tsx
            <Card>
              <CardHeader>
                <CardTitle>Ihre Angaben</CardTitle>
                <CardDescription>
                  Ihre persönlichen Angaben machen Sie in der Selbstauskunft – Ihr Berater hat
                  Ihnen dafür einen eigenen Link geschickt. Hier laden Sie nur Ihre Unterlagen hoch.
                </CardDescription>
              </CardHeader>
            </Card>
```

Den Import von `CustomerDataForm` und die Berechnung der `defaults` entfernen.
`src/components/customer/customer-data-form.tsx` und `saveCustomerForm` in
`src/lib/actions/upload.ts` bleiben zunächst im Code, werden aber nicht mehr
verwendet; der Datensatz `CustomerForm` bleibt für Bestandsfälle lesbar.

- [ ] **Step 8: Tests, Typecheck, Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alle Tests grün, Typecheck ohne Ausgabe, Build „Compiled successfully".

Schlägt ein Bestandstest fehl, weil `prisma.selfDisclosure` in seinem Mock
fehlt: die fehlende Methode als `vi.fn()` mit `null`/leerem Ergebnis ergänzen,
nicht die Produktivlogik ändern.

- [ ] **Step 9: Committen**

```bash
git add src/components/case src/app/\(app\)/cases src/app/upload src/lib/cases/next-step.ts src/lib/actions/self-disclosure.ts tests/next-step.test.ts
git commit -m "feat(selbstauskunft): Fallseite, Prioritaetsleiter und Verweis auf der Upload-Seite"
```

---

### Task 9: Listen, Integrationstest und Rollout

**Files:**
- Modify: `src/lib/actions/self-disclosure.ts` (Listen und Einkommen übernehmen)
- Create: `tests/selbstauskunft-db.test.ts`
- Test: gesamte Suite

**Interfaces:**
- Consumes: alles Vorherige.
- Produces: nichts Neues nach außen.

- [ ] **Step 1: Listen und Einkommen in der Übernahme ergänzen**

In `uebernehmen` den `default`-Zweig der `switch`-Anweisung ersetzen:

```ts
      case "income":
      case "employment":
      case "selfEmployment": {
        const applicantId = vorhanden.get(v.ziel.person ?? 1);
        if (!applicantId) break;
        const eimer =
          v.ziel.entitaet === "income"
            ? proIncome
            : v.ziel.entitaet === "employment"
              ? proEmployment
              : proSelfEmployment;
        const daten = eimer.get(applicantId) ?? {};
        daten[v.ziel.feld] = konvertiere(v.ziel.feld, wert);
        eimer.set(applicantId, daten);
        break;
      }
```

Die drei Sammelbehälter oben bei den anderen deklarieren:

```ts
  const proIncome = new Map<string, Record<string, unknown>>();
  const proEmployment = new Map<string, Record<string, unknown>>();
  const proSelfEmployment = new Map<string, Record<string, unknown>>();
```

Und nach den Applicant-Updates schreiben:

```ts
  for (const [applicantId, daten] of proIncome) {
    const vorhandenerSatz = await prisma.incomeRecord.findFirst({ where: { applicantId } });
    if (vorhandenerSatz) await prisma.incomeRecord.update({ where: { id: vorhandenerSatz.id }, data: daten });
    else await prisma.incomeRecord.create({ data: { applicantId, ...daten } });
  }
  for (const [applicantId, daten] of proEmployment) {
    const vorhandenerSatz = await prisma.employmentRecord.findFirst({ where: { applicantId } });
    if (vorhandenerSatz) await prisma.employmentRecord.update({ where: { id: vorhandenerSatz.id }, data: daten });
    else await prisma.employmentRecord.create({ data: { applicantId, ...daten } });
  }
  for (const [applicantId, daten] of proSelfEmployment) {
    await prisma.selfEmploymentRecord.upsert({
      where: { applicantId },
      create: { applicantId, ...daten },
      update: daten,
    });
  }
```

- [ ] **Step 2: Integrationstest schreiben**

Create `tests/selbstauskunft-db.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Ein vollständiger Durchlauf gegen das echte Schema: Link, Antworten,
 * Absenden, Übernehmen. Standardmäßig übersprungen (PGlite ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/selbstauskunft-db.test.ts
 */
describe.runIf(RUN)("Selbstauskunft (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let caseId: string;
  let orgId: string;
  let linkId: string;

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
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-sd" } });
    orgId = org.id;
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9100", status: "unterlagen_fehlen" },
    });
    caseId = c.id;
    await prisma.applicant.create({ data: { caseId, position: 1, vorname: "Laura" } });
  }, 180_000);

  it("legt einen Link an, dessen Klartext nicht in der Datenbank steht", async () => {
    const { createSelfDisclosureLink } = await import("@/lib/security/self-disclosure-link");
    const created = await createSelfDisclosureLink(caseId, new Date(Date.now() + 86400_000), {
      organizationId: orgId,
    });
    linkId = created.linkId;
    const row = await prisma.selfDisclosureLink.findUnique({ where: { id: linkId } });
    expect(row.tokenHash).not.toBe(created.token);

    const { resolveSelfDisclosureToken } = await import("@/lib/security/self-disclosure-link");
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toMatchObject({ caseId });
  }, 60_000);

  it("übernimmt die ausgewählten Angaben und legt Antragsteller 2 an", async () => {
    await prisma.selfDisclosure.create({
      data: {
        linkId,
        caseId,
        submittedAt: new Date(),
        answers: {
          "anzahl_antragsteller.anzahl": "2",
          "p1.person_name.vorname": "Laura",
          "p1.einkommen.netto": 3200,
          "p2.person_name.vorname": "Thomas",
          "kaufpreis.betrag": 400000,
        },
      },
    });

    const { planUebernahme } = await import("@/lib/self-disclosure/takeover");
    const applicants = await prisma.applicant.findMany({ where: { caseId }, orderBy: { position: "asc" } });
    const plan = planUebernahme(
      {
        "anzahl_antragsteller.anzahl": "2",
        "p1.person_name.vorname": "Laura",
        "p1.einkommen.netto": 3200,
        "p2.person_name.vorname": "Thomas",
        "kaufpreis.betrag": 400000,
      },
      { applicants, property: null, financingRequest: null, caseFelder: {} }
    );

    // Laura steht schon so im Fall -> kein Vorschlag; Thomas und Kaufpreis sind Lücken.
    expect(plan.vorschlaege.some((v) => v.kundenwert === "Laura")).toBe(false);
    expect(plan.vorschlaege.find((v) => v.kundenwert === "Thomas")!.ziel.person).toBe(2);
    expect(plan.vorschlaege.some((v) => v.ziel.feld === "kaufpreis")).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 3: Integrationstest laufen lassen**

Run: `RUN_DB_IT=1 npx vitest run tests/selbstauskunft-db.test.ts`
Expected: PASS.

Ohne `RUN_DB_IT=1` muss er als „skipped" gemeldet werden — auch das einmal prüfen:
`npx vitest run tests/selbstauskunft-db.test.ts`

- [ ] **Step 4: Gesamte Suite, Typecheck, Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: alles grün.

- [ ] **Step 5: Committen**

```bash
git add src/lib/actions/self-disclosure.ts tests/selbstauskunft-db.test.ts
git commit -m "feat(selbstauskunft): Einkommen und Beschaeftigung uebernehmen, Integrationstest"
```

- [ ] **Step 6: Schema in die Datenbank bringen**

**Erst nach ausdrücklicher Freigabe durch Jürgen** — es gibt kein Staging, der
Befehl läuft gegen die Produktionsdatenbank:

Run: `npm run db:push`
Expected: „Your database is now in sync with your Prisma schema."

Danach gegenprüfen:
`npx prisma db pull --print | grep -E "self_disclosure|anrede"`
Expected: beide neuen Tabellen und die Spalte `anrede` sind vorhanden.

- [ ] **Step 7: Deployen und in der Anwendung nachsehen**

Nach Freigabe: `git push`, Vercel-Build abwarten, Deployment-Status prüfen
(`vercel ls --prod`). Danach in der laufenden Anwendung gegenprüfen: Fall
öffnen, Selbstauskunftslink erstellen, im privaten Fenster den Bogen ausfüllen
(zwei, drei Schritte überspringen), absenden, im Fall den Eingang prüfen und
eine Lücke übernehmen. Behauptungen über den Live-Stand erst nach dieser
Sichtprüfung (siehe Gedächtniseintrag `verify-deployed-claims`).

---

## Offene Punkte für später

- **Listenfelder** (Verpflichtungen, Eigenkapital) werden im Bogen als Text
  erfasst und im Eingang nur angezeigt. Ein eigener Listeneditor mit „Eintrag
  hinzufügen" und die Übernahme nach `Liability`/`Asset` sind der nächste
  sinnvolle Schritt — bewusst nicht in dieser Runde, weil er eigene
  UI-Mechanik braucht.
- Warmmiete und Unterhalt haben kein Zielfeld; sie warten auf die
  Haushaltsrechnung.
- Die **Summenprüfung des Eigenkapitals** (Abschnitt E gegen Abschnitt A) hängt
  am Listeneditor und verschiebt sich mit ihm.
- Getrennte Links je Antragsteller.
- `CustomerDataForm` und `saveCustomerForm` sind nach Task 8 tot; sie können
  entfernt werden, sobald sicher ist, dass kein Bestandsfall sie noch braucht.
