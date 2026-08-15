# Selbstauskunft kürzen – Umsetzungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Der öffentliche Anfragebogen fragt auf sechs Seiten, der volle auf dreizehn — statt neununddreißig. Bei zwei Antragstellern stehen beide nebeneinander auf einem Bildschirm.

**Architektur:** Ein Katalog, zwei Umfänge. Am `Schritt` entscheidet `umfang: "kurz" | "voll"`, welcher Weg die Seite zeigt; `personenSpalten` ersetzt `jeAntragsteller` und erzeugt statt zweier Einträge in der Schrittkette einen mit zwei Spalten. Weil gebündelte Seiten Felder mit unterschiedlichen Bedingungen tragen, bekommt auch das **Feld** eine Sichtbarkeitsbedingung. Der Umfang wird aus dem Link abgeleitet, nicht gespeichert.

**Tech-Stack:** Next.js 15 App Router, Prisma/PostgreSQL, Vitest, Server Actions.

**Spec:** `docs/superpowers/specs/2026-08-15-selbstauskunft-kuerzen-design.md`

## Globale Vorgaben

- **Deutsch** in Bezeichnern, Kommentaren und Oberflächentexten. Kommentare erklären das **Warum**.
- **Der Katalog bekommt keine Pflichtfelder.** Der Grundsatz in `src/lib/self-disclosure/types.ts` bleibt: Jedes Feld darf leer bleiben. Die einzige Pflicht sitzt weiterhin beim Absenden des Formular-Wegs (`pflichtangaben.ts`).
- **`umfang` ist Pflichtangabe am Schritt**, nicht optional. Ein Vorgabewert würde jede neu ergänzte Frage stillschweigend in den kurzen Bogen schieben.
- **Diese Arbeit schneidet und bündelt, sie formuliert nicht um.** Fragetexte, Optionen und Zielfelder bleiben wörtlich, wie sie sind. Wer eine Frage inhaltlich verbessern will, tut das getrennt.
- **Wer liest, nimmt die volle Kette.** Übernahme (`planUebernahme`) und Erstgesprächs-Maske laufen immer im Umfang `"voll"`; nur die Kundenansicht kennt „kurz".
- **Zeit und Umfang werden übergeben, nie gemessen oder erraten.**
- Tests laufen mit `npx vitest run <datei>`, Typprüfung mit `npx tsc --noEmit`.
- Datenbanktests laufen nur mit `RUN_DB_IT=1`; PGlite läuft in-process, ein `prisma db push` ist **nicht** nötig.

---

### Task 1: Felder bekommen eine Sichtbarkeitsbedingung

**Warum zuerst:** Ohne sie lässt sich keine Seite bündeln. Auf der künftigen Seite „Objekt & Preis" stehen Kaufpreis, Baukosten, Restschuld und Kapitalbedarf nebeneinander, und je nach Vorhaben darf genau eines davon erscheinen. Heute steckt diese Bedingung am Schritt — nach dem Bündeln muss sie ans Feld.

**Dateien:**
- Ändern: `src/lib/self-disclosure/types.ts` (Interface `Feld`)
- Ändern: `src/lib/self-disclosure/navigation.ts` (`offeneFelder`)
- Erstellen: `src/lib/self-disclosure/felder.ts`
- Ändern: `tests/selbstauskunft-navigation.test.ts`

**Schnittstellen:**
- Liefert: `Feld.sichtbar?: (a: Antworten, person?: 1 | 2) => boolean` und `sichtbareFelder(schritt: Schritt, antworten: Antworten, person?: 1 | 2): Feld[]`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/selbstauskunft-feldsichtbarkeit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Schritt } from "@/lib/self-disclosure/types";

const SCHRITT: Schritt = {
  id: "probe",
  abschnitt: "vorhaben",
  umfang: "kurz",
  frage: "Testfrage",
  felder: [
    { id: "immer", label: "Immer da", typ: "text" },
    {
      id: "nur_kauf",
      label: "Nur beim Kauf",
      typ: "betrag",
      sichtbar: (a) => a["probe.art"] === "kauf",
    },
    {
      id: "nur_person2",
      label: "Nur fuer die zweite Person",
      typ: "text",
      sichtbar: (_a, person) => person === 2,
    },
  ],
};

describe("sichtbareFelder", () => {
  it("zeigt Felder ohne Bedingung immer", () => {
    expect(sichtbareFelder(SCHRITT, {}).map((f) => f.id)).toContain("immer");
  });

  it("haelt ein Feld zurueck, solange die Steuerantwort fehlt", () => {
    // Gleiche Regel wie bei den Schritten: Fehlt die Antwort, bleibt der
    // Zweig zu. Sonst zeigte der erste Bildschirm alles auf einmal.
    expect(sichtbareFelder(SCHRITT, {}).map((f) => f.id)).not.toContain("nur_kauf");
  });

  it("zeigt das Feld, sobald die Steuerantwort passt", () => {
    expect(sichtbareFelder(SCHRITT, { "probe.art": "kauf" }).map((f) => f.id)).toContain("nur_kauf");
  });

  it("reicht die Person an die Bedingung durch", () => {
    expect(sichtbareFelder(SCHRITT, {}, 1).map((f) => f.id)).not.toContain("nur_person2");
    expect(sichtbareFelder(SCHRITT, {}, 2).map((f) => f.id)).toContain("nur_person2");
  });

  it("behaelt die Reihenfolge des Katalogs bei", () => {
    const ids = sichtbareFelder(SCHRITT, { "probe.art": "kauf" }, 2).map((f) => f.id);
    expect(ids).toEqual(["immer", "nur_kauf", "nur_person2"]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-feldsichtbarkeit.test.ts`
Erwartet: FEHLSCHLAG, „Cannot find module '@/lib/self-disclosure/felder'".

Hinweis: Der Testschritt trägt bereits `umfang: "kurz"` — das Feld entsteht erst in Aufgabe 3. Bis dahin meldet `tsc` hier einen Fehler; das ist gewollt und beweist, dass der Test gegen die Zielgestalt geschrieben ist. Wer die Aufgabe einzeln übersetzen will, lässt `umfang` im Testschritt zunächst weg und trägt es in Aufgabe 3 nach.

- [ ] **Schritt 3: Das Feld am Modell ergänzen**

In `src/lib/self-disclosure/types.ts`, im Interface `Feld`:

```ts
  /**
   * Prüft NUR ausdrücklich gegebene Antworten – fehlt die Steuerantwort,
   * bleibt das Feld zu. Gleiche Regel wie bei `Schritt.sichtbar`.
   *
   * Gebraucht, seit Seiten mehrere Fragen bündeln: Auf „Objekt & Preis"
   * stehen Kaufpreis, Baukosten und Restschuld nebeneinander, aber je nach
   * Vorhaben gehört genau eines davon dorthin.
   */
  sichtbar?: (a: Antworten, person?: 1 | 2) => boolean;
```

- [ ] **Schritt 4: Die Auswahl schreiben**

Erstelle `src/lib/self-disclosure/felder.ts`:

```ts
import type { Antworten, Feld, Schritt } from "@/lib/self-disclosure/types";

/**
 * Die Felder eines Schritts, die bei diesen Antworten tatsächlich zu sehen
 * sind – in Katalogreihenfolge.
 *
 * Eigenes Modul und nicht Teil von `navigation.ts`: Die Navigation beantwortet
 * „welche Seite", diese Datei „welche Frage auf der Seite". Beide werden von
 * verschiedenen Stellen gebraucht (Darstellung, Fortschritt, Übernahme,
 * Erstgesprächs-Maske).
 */
export function sichtbareFelder(schritt: Schritt, antworten: Antworten, person?: 1 | 2): Feld[] {
  return schritt.felder.filter((f) => (f.sichtbar ? f.sichtbar(antworten, person) : true));
}
```

- [ ] **Schritt 5: `offeneFelder` darauf umstellen**

In `src/lib/self-disclosure/navigation.ts` zählt `offeneFelder` heute über `s.schritt.felder`. Stell es auf `sichtbareFelder(s.schritt, antworten, s.person)` um — sonst meldet die Nachfassliste Felder als offen, die dem Kunden nie gezeigt wurden.

- [ ] **Schritt 6: Tests und Typprüfung**

```bash
npx vitest run tests/selbstauskunft-feldsichtbarkeit.test.ts tests/selbstauskunft-navigation.test.ts
npx tsc --noEmit
```

Erwartet: 5 neue Fälle grün, die bestehenden Navigationstests unverändert grün.

- [ ] **Schritt 7: Commit**

```bash
git add src/lib/self-disclosure/types.ts src/lib/self-disclosure/felder.ts src/lib/self-disclosure/navigation.ts tests/selbstauskunft-feldsichtbarkeit.test.ts
git commit -m "feat(selbstauskunft): Felder koennen eine eigene Bedingung tragen

Vorarbeit fuers Buendeln: Sobald mehrere Fragen auf einer Seite stehen,
reicht eine Bedingung am Schritt nicht mehr – auf 'Objekt & Preis' gehoert je
nach Vorhaben genau eines von Kaufpreis, Baukosten und Restschuld dorthin.

Dieselbe Regel wie beim Schritt: Fehlt die Steuerantwort, bleibt das Feld zu."
```

---

### Task 2: Beide Antragsteller nebeneinander

**Dateien:**
- Ändern: `src/lib/self-disclosure/types.ts` (`Schritt.personenSpalten`, `SichtbarerSchritt.personen`)
- Ändern: `src/lib/self-disclosure/navigation.ts` (`sichtbareSchritte`, `schluessel`-Aufrufe, `offeneFelder`)
- Ändern: `src/lib/self-disclosure/catalog.ts` (11 Schritte: `jeAntragsteller` → `personenSpalten`)
- Ändern: `src/lib/self-disclosure/takeover.ts` (`planUebernahme` liest `personen`)
- Ändern: `src/components/self-disclosure/step-form.tsx`, `src/app/selbstauskunft/[token]/[schritt]/page.tsx`, `src/app/selbstauskunft/[token]/zusammenfassung/page.tsx`
- Ändern: `src/lib/erstgespraech/maske.ts` (`alleKandidaten`)
- Ändern: `tests/selbstauskunft-navigation.test.ts`

**Schnittstellen:**
- Liefert: `SichtbarerSchritt { id: string; schritt: Schritt; personen?: (1 | 2)[] }`; `personenSchluessel(schrittId: string, feldId: string, person?: 1 | 2): string`.
- Nutzt: `sichtbareFelder` (Aufgabe 1).

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `tests/selbstauskunft-navigation.test.ts` ergänzen:

```ts
describe("Personen-Spalten", () => {
  it("erzeugt EINEN Schritt mit zwei Spalten statt zweier Schritte", () => {
    // Der Kern dieser Aufgabe: Ein Paar sitzt gemeinsam am Rechner und
    // erwartet beide nebeneinander, nicht erst ihn und dann sie.
    const kette = sichtbareSchritte({ "anzahl_antragsteller.anzahl": "2" });
    const personenschritte = kette.filter((s) => s.schritt.personenSpalten);
    expect(personenschritte.length).toBeGreaterThan(0);
    for (const s of personenschritte) {
      expect(s.personen).toEqual([1, 2]);
      expect(s.id).not.toContain("p1.");
    }
  });

  it("zeigt bei einem Antragsteller nur eine Spalte", () => {
    const kette = sichtbareSchritte({});
    for (const s of kette.filter((x) => x.schritt.personenSpalten)) {
      expect(s.personen).toEqual([1]);
    }
  });

  it("baut den Schluessel weiterhin mit Personen-Praefix", () => {
    // Die Schluesselform bleibt: Uebernahme, Vorbelegung und Pflichtangaben
    // lesen sie so. Nur der Praefix wandert aus der Schritt-ID in den Bau.
    expect(personenSchluessel("person_name", "nachname", 1)).toBe("p1.person_name.nachname");
    expect(personenSchluessel("person_name", "nachname", 2)).toBe("p2.person_name.nachname");
    expect(personenSchluessel("kaufpreis", "betrag")).toBe("kaufpreis.betrag");
  });

  it("zaehlt die Kette kuerzer, weil Personenschritte nicht mehr doppeln", () => {
    const einer = sichtbareSchritte({}).length;
    const zwei = sichtbareSchritte({ "anzahl_antragsteller.anzahl": "2" }).length;
    expect(zwei).toBe(einer);
  });
});
```

Den Import ergänzen: `import { sichtbareSchritte, personenSchluessel } from "@/lib/self-disclosure/navigation";`

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-navigation.test.ts`
Erwartet: FEHLSCHLAG — `personenSchluessel` fehlt, und die Kette verdoppelt Personenschritte noch.

- [ ] **Schritt 3: Modell und Navigation umstellen**

In `types.ts`: `jeAntragsteller?: boolean` durch

```ts
  /**
   * Beide Antragsteller nebeneinander auf EINEM Bildschirm, je eine Spalte.
   *
   * Vorher hieß das `jeAntragsteller` und erzeugte ZWEI Einträge in der
   * Schrittkette ("p1.person_name", "p2.person_name") – der Kunde beantwortete
   * erst alles für sich, dann dasselbe für den Partner. Ein Paar, das
   * gemeinsam am Rechner sitzt, erwartet beide nebeneinander.
   */
  personenSpalten?: boolean;
```

ersetzen und `SichtbarerSchritt` auf

```ts
export interface SichtbarerSchritt {
  /** URL-Segment. Traegt KEINEN Personen-Praefix mehr. */
  id: string;
  schritt: Schritt;
  /** Spalten dieses Schritts; fehlt bei Schritten ohne Personenbezug. */
  personen?: (1 | 2)[];
}
```

In `navigation.ts`:

```ts
/**
 * Antwortschlüssel mit Personen-Präfix, wo einer nötig ist.
 *
 * Der Präfix steht seit den Spalten nicht mehr in der Schritt-ID: Ein Schritt
 * erscheint einmal und trägt beide Personen. Gebaut wird er deshalb hier.
 */
export function personenSchluessel(schrittId: string, feldId: string, person?: 1 | 2): string {
  return person ? `p${person}.${schrittId}.${feldId}` : `${schrittId}.${feldId}`;
}

export function sichtbareSchritte(antworten: Antworten): SichtbarerSchritt[] {
  const personen = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
    out.push(
      schritt.personenSpalten
        ? { id: schritt.id, schritt, personen: personen === 2 ? [1, 2] : [1] }
        : { id: schritt.id, schritt }
    );
  }
  return out;
}
```

**Achtung:** Die Bedingung eines Personenschritts wurde bisher je Person geprüft (`schritt.sichtbar(antworten, person)`). Mit Spalten gibt es nur noch eine Seite; ob eine **Person** eine Frage sieht, entscheidet ab jetzt die Feld-Bedingung aus Aufgabe 1. Beim Katalogschnitt (Aufgabe 4) werden die betroffenen Bedingungen entsprechend umgehängt — hier bleiben sie zunächst am Schritt und werden ohne Person aufgerufen.

`offeneFelder` iteriert künftig über `s.personen ?? [undefined]` und baut den Schlüssel mit `personenSchluessel`.

- [ ] **Schritt 4: Katalog mechanisch umstellen**

In `catalog.ts` alle elf `jeAntragsteller: true` durch `personenSpalten: true` ersetzen. Keine weitere Änderung — der Schnitt kommt in Aufgabe 4.

- [ ] **Schritt 5: Übernahme und Erstgesprächs-Maske nachziehen**

In `takeover.ts` liest `planUebernahme` heute `s.person`. Künftig:

```ts
  for (const s of sichtbareSchritte(antworten)) {
    for (const person of s.personen ?? [undefined]) {
      for (const feld of sichtbareFelder(s.schritt, antworten, person)) {
        const k = personenSchluessel(s.schritt.id, feld.id, person);
        // … unveraendert weiter
```

Das Personen-Etikett (`(Antragsteller 1)`) kommt jetzt aus `person` statt aus `s.person`.

In `maske.ts` baut `alleKandidaten` die Ausprägungen über `schritt.jeAntragsteller`; stell es auf `schritt.personenSpalten` um. Das Verhalten der Maske bleibt gleich — sie zeigt weiterhin beide Personen.

- [ ] **Schritt 6: Darstellung**

`src/components/self-disclosure/step-form.tsx` bekommt `personen?: (1 | 2)[]` und rendert `schritt-felder.tsx` einmal je Person, jede Spalte mit Überschrift. Die Überschrift lautet „Sie" für Person 1 und „Mitantragsteller/in" für Person 2; steht in den Antworten bereits ein Vorname, steht dort der Name. Auf schmalen Bildschirmen stehen die Spalten untereinander (`grid gap-6 sm:grid-cols-2`).

Die Feldnamen im Formular tragen den Präfix mit, damit die Server-Aktion beide Spalten auseinanderhält: `name={personenSchluessel(schrittId, feld.id, person)}`.

**Wichtig:** `speichereAntwort` (`src/lib/actions/self-disclosure.ts`) baut den Schlüssel heute aus `schritt.id` und der Feld-ID. Mit Spalten kommen die Namen bereits als vollständige Schlüssel aus dem Formular — die Aktion übernimmt sie, statt sie erneut zusammenzusetzen. Die Prüfung über `schrittSchema` muss entsprechend auf die Feld-IDs je Spalte gehen; sieh dir `src/lib/self-disclosure/schema.ts` an und zieh sie mit.

Die Zusammenfassungsseite zeigt je Spalte eine Zeile mit dem Personen-Etikett.

- [ ] **Schritt 7: Tests, Typprüfung, in der Anwendung ansehen**

```bash
npx vitest run
npx tsc --noEmit
```

Erwartet: alles grün. Danach lokal einen Bogen mit zwei Antragstellern öffnen und prüfen, dass beide Spalten erscheinen, beide gespeichert werden und die Zusammenfassung beide zeigt.

- [ ] **Schritt 8: Commit**

```bash
git add -A
git commit -m "feat(selbstauskunft): beide Antragsteller nebeneinander statt nacheinander

Ein Personenschritt erzeugt nicht mehr zwei Eintraege in der Kette, sondern
einen mit zwei Spalten. Der Personen-Praefix wandert damit aus der Schritt-ID
in den Schluesselbau; die Schluesselform selbst bleibt, damit Uebernahme,
Vorbelegung und Pflichtangaben unveraendert lesen.

Ein Paar sitzt gemeinsam am Rechner – es erwartet beide nebeneinander."
```

---

### Task 3: Der Umfang am Schritt

**Dateien:**
- Ändern: `src/lib/self-disclosure/types.ts` (`Schritt.umfang`)
- Ändern: `src/lib/self-disclosure/catalog.ts` (alle Schritte bekommen `umfang: "voll"`)
- Ändern: `src/lib/self-disclosure/navigation.ts` (`sichtbareSchritte(antworten, umfang)`)
- Ändern: alle Aufrufer (Kundenseiten, `takeover.ts`, `maske.ts`, `actions/anfrage.ts`, `actions/self-disclosure.ts`)
- Erstellen: `src/lib/self-disclosure/umfang.ts`
- Erstellen: `tests/selbstauskunft-umfang.test.ts`

**Schnittstellen:**
- Liefert: `type Umfang = "kurz" | "voll"`; `umfangDesBogens(link: { formularId: string | null }): Umfang`; `sichtbareSchritte(antworten: Antworten, umfang: Umfang): SichtbarerSchritt[]`.

**Nach dieser Aufgabe ist die kurze Kette LEER** — alle Schritte tragen zunächst `"voll"`. Das ist erwartet und wird von Aufgabe 4 gefüllt. **Zwischenstand nicht deployen.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/selbstauskunft-umfang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { umfangDesBogens } from "@/lib/self-disclosure/umfang";

describe("umfangDesBogens", () => {
  it("liefert kurz fuer einen Bogen aus dem Anfrageformular", () => {
    expect(umfangDesBogens({ formularId: "form-1" })).toBe("kurz");
  });

  it("liefert voll fuer einen Bogen am persoenlichen Link", () => {
    expect(umfangDesBogens({ formularId: null })).toBe("voll");
  });

  it("ist eine reine Ableitung – derselbe Link ergibt immer dasselbe", () => {
    // Der Umfang wird NICHT gespeichert. Gaebe es ihn zusaetzlich als Spalte,
    // waere das ein zweiter Ort, der mit der Wirklichkeit auseinanderlaufen
    // kann – dieselbe Ueberlegung wie beim Kontaktstand.
    const link = { formularId: "form-1" };
    expect(umfangDesBogens(link)).toBe(umfangDesBogens(link));
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-umfang.test.ts`
Erwartet: FEHLSCHLAG, Modul fehlt.

- [ ] **Schritt 3: Umfang einführen**

Erstelle `src/lib/self-disclosure/umfang.ts`:

```ts
/**
 * Wie viel des Katalogs ein Bogen zeigt.
 *
 * Abgeleitet, nicht gespeichert: Hängt der Bogen an einem Anfrageformular,
 * ist es der kurze Weg; hängt er an einem Fall, der volle. Eine gespeicherte
 * Angabe wäre ein zweiter Ort, der mit der Wirklichkeit auseinanderlaufen
 * kann.
 */
export type Umfang = "kurz" | "voll";

export function umfangDesBogens(link: { formularId: string | null }): Umfang {
  return link.formularId ? "kurz" : "voll";
}
```

In `types.ts` am `Schritt`:

```ts
  /**
   * "kurz" erscheint in BEIDEN Wegen, "voll" nur hinter dem persönlichen Link.
   *
   * Pflichtangabe ohne Vorgabewert: Ein Vorgabewert schöbe jede neu ergänzte
   * Frage stillschweigend in den kurzen Bogen – dorthin, wo jede zusätzliche
   * Frage am teuersten ist.
   */
  umfang: Umfang;
```

In `navigation.ts`:

```ts
export function sichtbareSchritte(antworten: Antworten, umfang: Umfang): SichtbarerSchritt[] {
  // …
  for (const schritt of KATALOG) {
    if (umfang === "kurz" && schritt.umfang === "voll") continue;
    // … unveraendert weiter
```

`schrittFinden`, `naechsterSchritt`, `vorherigerSchritt`, `fortschritt` und `offeneFelder` reichen den Umfang durch.

- [ ] **Schritt 4: Katalog und Aufrufer nachziehen**

Jeder der 34 Schritte in `catalog.ts` bekommt `umfang: "voll"`. Die Aufrufer:

- **Kundenseiten** (`src/app/selbstauskunft/[token]/…`): Umfang aus dem Link. Der Bogen wird ohnehin geladen; ergänze `link: { select: { formularId: true } }` in der Abfrage und rufe `umfangDesBogens`.
- **`speichereAntwort` und `sendeAb`** (`src/lib/actions/self-disclosure.ts`): ebenso.
- **`planUebernahme`** und **`maske.ts`**: fest `"voll"` — wer liest oder alles zeigt, nimmt die volle Kette. Schreib den Grund als Kommentar dazu.
- **`starteAnfrage`** (`src/lib/actions/anfrage.ts`): `"kurz"`.

- [ ] **Schritt 5: Tests und Typprüfung**

```bash
npx vitest run
npx tsc --noEmit
```

Erwartet: alles grün. Die kurze Kette ist leer — das prüft Aufgabe 4.

- [ ] **Schritt 6: Commit**

```bash
git add -A
git commit -m "feat(selbstauskunft): der Katalog kennt zwei Umfaenge

Am Schritt entscheidet umfang, welcher Weg ihn zeigt; abgeleitet wird er aus
dem Link, nicht gespeichert. Wer liest oder alles zeigt – Uebernahme und
Erstgespraechs-Maske – nimmt immer die volle Kette.

Alle bestehenden Schritte stehen zunaechst auf 'voll'; der Schnitt folgt."
```

---

### Task 4: Der Katalogschnitt

**Dateien:**
- Ändern: `src/lib/self-disclosure/catalog.ts` (vollständige Neugliederung)
- Erstellen: `tests/selbstauskunft-katalogschnitt.test.ts`

**Schnittstellen:**
- Liefert: 13 Seiten mit den unten festgelegten IDs.

**Regel für die ganze Aufgabe:** Fragetexte, Feld-IDs, Optionen, Hinweise und **Zielfelder bleiben wörtlich**, wie sie heute sind. Es wird nur neu gruppiert und der Umfang gesetzt. Wo eine Bedingung heute am Schritt hing und dessen Felder nun auf eine größere Seite wandern, wird sie zur Bedingung **am Feld** (Aufgabe 1).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erstelle `tests/selbstauskunft-katalogschnitt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";

const KURZ = ["vorhaben", "objekt_preis", "finanzierungswunsch", "haushalt", "personen", "verpflichtungen"];
const VOLL_ZUSAETZLICH = [
  "person_details",
  "beruf_details",
  "einnahmen",
  "haushalt_ausgaben",
  "eigenkapital_herkunft",
  "objekt_details",
  "konditionen",
];

describe("Katalogschnitt", () => {
  it("hat genau dreizehn Seiten", () => {
    expect(KATALOG.map((s) => s.id)).toEqual([...KURZ, ...VOLL_ZUSAETZLICH]);
  });

  it("die kurze Kette enthaelt keine volle Seite", () => {
    const kette = sichtbareSchritte({ "vorhaben.art": "kauf_bestand" }, "kurz");
    for (const s of kette) expect(s.schritt.umfang).toBe("kurz");
  });

  it("die volle Kette beginnt mit denselben Seiten wie die kurze", () => {
    const antworten = { "vorhaben.art": "kauf_bestand" };
    const kurz = sichtbareSchritte(antworten, "kurz").map((s) => s.id);
    const voll = sichtbareSchritte(antworten, "voll").map((s) => s.id);
    expect(voll.slice(0, kurz.length)).toEqual(kurz);
  });

  it("jede Seite traegt einen Umfang und eine nicht leere Feldliste", () => {
    for (const s of KATALOG) {
      expect(["kurz", "voll"]).toContain(s.umfang);
      expect(s.felder.length).toBeGreaterThan(0);
    }
  });

  it("Feld-IDs sind je Seite eindeutig", () => {
    // Zwei gleich benannte Felder auf einer Seite ergaeben denselben
    // Antwortschluessel – die zweite Antwort ueberschriebe die erste.
    for (const s of KATALOG) {
      const ids = s.felder.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("die Personenseiten tragen Spalten", () => {
    for (const id of ["personen", "person_details", "beruf_details", "einnahmen"]) {
      expect(KATALOG.find((s) => s.id === id)?.personenSpalten).toBe(true);
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, er muss scheitern**

Ausführen: `npx vitest run tests/selbstauskunft-katalogschnitt.test.ts`
Erwartet: FEHLSCHLAG — der Katalog hat noch 34 Seiten mit den alten IDs.

- [ ] **Schritt 3: Den Katalog neu gliedern**

Die **kurzen** Seiten (`umfang: "kurz"`), in dieser Reihenfolge:

| Neue Seite | Frage | Felder (Feld-ID ← Herkunft) | Bedingung |
|---|---|---|---|
| `vorhaben` | Was möchten Sie finanzieren? | `art` ← `finanzierungsart.art`; `stand` ← `objektstand.stand`; `nutzung` ← `nutzung.art` | `stand`/`nutzung` mit der heutigen Schritt-Bedingung als Feld-Bedingung |
| `objekt_preis` | Um welche Immobilie geht es? | `plz`, `ort` ← `objekt_ort`; `kaufpreis` ← `kaufpreis.betrag`; `grundstueck`, `bau` ← `baukosten`; `modernisierung` ← `modernisierungskosten.betrag`; `restschuld` ← `restschuld.betrag`; `kapitalbedarf` ← `kapitalbedarf.betrag`; `wohnflaeche` ← `objekt_masse.wohnflaeche`; `makler` ← `maklergebuehr.faellt_an`; `makler_hoehe` ← `maklergebuehr_hoehe.hoehe` | jedes Betragsfeld mit der Bedingung seines heutigen Schritts; `makler_hoehe` nur bei `makler = ja` |
| `finanzierungswunsch` | Wie soll die Finanzierung aussehen? | `eigenkapital` ← `eigenkapital.betrag`; `darlehen` ← `darlehen.betrag`; `wunschrate` ← `kondition.wunschrate` | `darlehen` mit der heutigen Schritt-Bedingung |
| `haushalt` | Wer finanziert, und wer lebt im Haushalt? | `anzahl` ← `anzahl_antragsteller.anzahl`; `kinder` ← `haushalt_kinder.anzahl` | — |
| `personen` (`personenSpalten: true`) | Wer sind Sie? | `vorname`, `nachname` ← `person_name`; `email`, `telefon` ← `person_kontakt`; `beruf_art` ← `beruf_art.art`; `netto` ← `einkommen.netto` | — |
| `verpflichtungen` | Haben Sie laufende Kredite oder Leasingverträge? | `liste` ← `verpflichtungen.liste` | — |

Die **vollen** Seiten (`umfang: "voll"`), dahinter:

| Neue Seite | Felder | Bedingung |
|---|---|---|
| `person_details` (Spalten) | `anrede` ← `person_name.anrede`; `geburtsdatum`, `geburtsort`, `staatsangehoerigkeit` ← `person_geburt`; `familienstand` ← `person_familienstand.stand`; `strasse`, `plz`, `ort` ← `person_anschrift` | — |
| `beruf_details` (Spalten) | `beruf`, `arbeitgeber`, `arbeitgeber_adresse` ← `beruf_arbeitgeber`; `seit`, `befristet`, `probezeit` ← `beruf_dauer`; `firma`, `rechtsform`, `beteiligung`, `gruendung` ← `beruf_selbststaendig` | die ersten sechs nur bei angestellter, die letzten vier nur bei selbständiger Beschäftigungsart — als **Feld**-Bedingung, mit der Person aus der Spalte |
| `einnahmen` (Spalten) | `brutto`, `sonderzahlungen` ← `einkommen`; `miete`, `sonstige` ← `weitere_einnahmen` | — |
| `haushalt_ausgaben` | `warmmiete`, `unterhalt` ← `haushalt_ausgaben` | — |
| `eigenkapital_herkunft` | `liste` ← `eigenkapital_positionen.liste` | — |
| `objekt_details` | `objektart` ← `objekt_art.art`; `strasse` ← `objekt_adresse.strasse`; `grundstueck`, `baujahr`, `zimmer`, `stellplaetze` ← `objekt_masse`; `hausgeld`, `mieteinnahmen` ← `objekt_kosten` | die heutigen Schritt-Bedingungen als Feld-Bedingungen |
| `konditionen` | `zinsbindung`, `sondertilgung` ← `kondition`; `zinsbindung_ende` ← `restschuld.zinsbindung_ende` | `zinsbindung_ende` nur bei Anschlussfinanzierung |

**Zwei Fallen, die diese Aufgabe stellt:**

1. Auf `objekt_preis` zeigen `restschuld`, `kapitalbedarf` und auf `finanzierungswunsch` `darlehen` **alle drei** auf `financingRequest.darlehenswunsch`. Ihre Bedingungen müssen sich gegenseitig ausschließen, sonst schreiben zwei Felder in dasselbe Zielfeld. Der Katalog-Vertragstest aus Aufgabe 6 prüft genau das.
2. `objekt_preis.grundstueck` (Kaufpreis-Anteil beim Neubau) und `objekt_details.grundstueck` (Grundstücksfläche in m²) heißen gleich, liegen aber auf verschiedenen Seiten und meinen Verschiedenes. Das ist zulässig — die Schlüssel unterscheiden sich durch die Seite —, aber beim Lesen leicht zu verwechseln. Schreib je einen Kommentar dazu.

- [ ] **Schritt 4: Tests und Typprüfung**

```bash
npx vitest run tests/selbstauskunft-katalogschnitt.test.ts
npx tsc --noEmit
```

Erwartet: 6 Fälle grün. Andere Tests scheitern jetzt — sie nennen alte Schritt-IDs. Das behebt Aufgabe 5; **notiere die Liste der scheiternden Dateien im Bericht.**

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/self-disclosure/catalog.ts tests/selbstauskunft-katalogschnitt.test.ts
git commit -m "feat(selbstauskunft): dreizehn Seiten statt vierunddreissig Schritten

Sechs kurze Seiten fuer den oeffentlichen Anfragebogen, sieben weitere fuer
den vollen. Fragen, Optionen und Zielfelder bleiben woertlich – es wird nur
neu gruppiert; Bedingungen, die am Schritt hingen, wandern ans Feld."
```

---

### Task 5: Die mitwandernden Schlüssel

**Dateien:**
- Ändern: `src/lib/self-disclosure/catalog.ts` (`anzahlAntragsteller`)
- Ändern: `src/lib/self-disclosure/pflichtangaben.ts`
- Ändern: `src/lib/self-disclosure/takeover.ts` (Sonderfall Kinderzahl)
- Ändern: `src/lib/leadformular/service.ts` (`ERSTER_SCHRITT`)
- Ändern: `src/lib/erstgespraech/maske.ts` (fest verdrahtete Schritt-IDs)
- Ändern: die in Aufgabe 4 notierten Testdateien

**Schnittstellen:**
- Nutzt: die Seiten-IDs aus Aufgabe 4.

- [ ] **Schritt 1: Die fehlschlagenden Zusicherungen anpassen**

In `tests/anfrage-pflichtangaben.test.ts` die wörtlichen Schlüssel auf die neuen Seiten ziehen:

```ts
    expect(KONTAKT_SCHLUESSEL.nachname).toBe("p1.personen.nachname");
    expect(KONTAKT_SCHLUESSEL.email).toBe("p1.personen.email");
    expect(KONTAKT_SCHLUESSEL.telefon).toBe("p1.personen.telefon");
```

Dieser Test ist die Versicherung dieser Aufgabe: Er wird rot, wenn eine Stelle vergessen wird.

- [ ] **Schritt 2: Tests laufen lassen, sie müssen scheitern**

Ausführen: `npx vitest run tests/anfrage-pflichtangaben.test.ts`
Erwartet: FEHLSCHLAG — die Schlüssel zeigen noch auf `p1.person_name` / `p1.person_kontakt`.

- [ ] **Schritt 3: Die fünf Stellen nachziehen**

```ts
// catalog.ts
export function anzahlAntragsteller(a: Antworten): 1 | 2 {
  return wert(a, "haushalt.anzahl") === "2" ? 2 : 1;
}

// pflichtangaben.ts
export const KONTAKT_SCHLUESSEL = {
  nachname: personenSchluessel("personen", "nachname", 1),
  email: personenSchluessel("personen", "email", 1),
  telefon: personenSchluessel("personen", "telefon", 1),
} as const;

// leadformular/service.ts
export const ERSTER_SCHRITT = "vorhaben";
```

In `takeover.ts` bezieht sich der Sonderfall „Kinderzahl gilt dem Haushalt und geht an beide Antragsteller" heute auf `s.schritt.id === "haushalt_kinder"`. Er gilt jetzt dem **Feld**: Seite `haushalt`, Feld `kinder`.

In `maske.ts` die vier fest verdrahteten Namen ersetzen: `anzahl_antragsteller.anzahl` → `haushalt.anzahl`; die Liste `["beruf_arbeitgeber", "beruf_dauer", "beruf_selbststaendig"]` entfällt, weil diese Bedingung jetzt am Feld hängt — die Maske fragt stattdessen `sichtbareFelder(schritt, antworten, person)`. Prüfe die Kommentare in `maske.ts:253` und `:338`, die alte Schrittnamen erklären, und zieh sie mit.

- [ ] **Schritt 4: Volle Testsuite und Typprüfung**

```bash
npx vitest run
npx tsc --noEmit
```

Erwartet: **alles grün** — auch die in Aufgabe 4 notierten Dateien. Bleibt etwas rot, gehört es hierher.

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "fix(selbstauskunft): die fest verdrahteten Schluessel folgen dem Schnitt

Fuenf Stellen kannten Schritt-IDs beim Namen: die Antragstellerzahl, die
Pflichtangaben, der Kinderzahl-Sonderfall der Uebernahme, der erste Schritt
des Anfrageformulars und die Erstgespraechs-Maske. Der Test mit den
woertlichen Schluesseln war die Versicherung."
```

---

### Task 6: Die Vertragstests

**Dateien:**
- Erstellen: `tests/selbstauskunft-ampel-vertrag.test.ts`
- Erstellen: `tests/selbstauskunft-katalog-vertrag.test.ts`

- [ ] **Schritt 1: Den Vertrag zur Machbarkeits-Ampel schreiben**

Erstelle `tests/selbstauskunft-ampel-vertrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";

/**
 * Der kurze Bogen existiert, um der Machbarkeits-Ampel zu genuegen. Nimmt ihm
 * jemand ein Feld weg, das der Solver rechnet, bleibt die Ampel still grau –
 * und niemand weiss warum. Dieser Test ist die Bremse davor.
 */
const AMPEL_BRAUCHT = [
  "financingRequest.kaufpreis",
  "financingRequest.eigenkapital",
  "financingRequest.darlehenswunsch",
  "financingRequest.wunschrateMonatlich",
  "financingRequest.maklerprovisionProzent",
  "property.zip",
  "property.wohnflaeche",
  "income.nettoMonatlich",
  "applicant.anzahlKinder",
];

function zieleDesKurzenBogens(): Set<string> {
  const out = new Set<string>();
  for (const s of KATALOG.filter((x) => x.umfang === "kurz")) {
    for (const f of s.felder) {
      if (f.ziel && "feld" in f.ziel) out.add(`${f.ziel.entitaet}.${f.ziel.feld}`);
    }
  }
  return out;
}

describe("Kurzer Bogen deckt die Machbarkeits-Ampel", () => {
  const ziele = zieleDesKurzenBogens();
  for (const gebraucht of AMPEL_BRAUCHT) {
    it(`fragt ${gebraucht}`, () => {
      expect(ziele.has(gebraucht)).toBe(true);
    });
  }

  it("fragt die Anzahl der Antragsteller", () => {
    const haushalt = KATALOG.find((s) => s.id === "haushalt");
    expect(haushalt?.felder.map((f) => f.id)).toContain("anzahl");
  });

  it("fragt die laufenden Verpflichtungen", () => {
    const seite = KATALOG.find((s) => s.id === "verpflichtungen");
    expect(seite?.umfang).toBe("kurz");
    expect(seite?.felder[0]?.ziel).toBeTruthy();
  });
});
```

- [ ] **Schritt 2: Den Katalog-Vertrag schreiben**

Erstelle `tests/selbstauskunft-katalog-vertrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";

describe("Katalog-Vertrag", () => {
  it("kein Zielfeld wird von zwei gleichzeitig sichtbaren Feldern beschrieben", () => {
    // Kaufpreis, Restschuld, Kapitalbedarf und Darlehenswunsch zeigen alle auf
    // financingRequest.darlehenswunsch bzw. .kaufpreis. Ihre Bedingungen
    // muessen sich ausschliessen – sonst schreiben zwei Antworten in dasselbe
    // Feld, und welche gewinnt, entscheidet die Reihenfolge im Katalog.
    for (const art of ["kauf_bestand", "neubau", "modernisierung", "anschlussfinanzierung", "kapitalbeschaffung"]) {
      const antworten = { "vorhaben.art": art };
      const gesehen = new Map<string, string>();
      for (const s of sichtbareSchritte(antworten, "voll")) {
        for (const f of s.schritt.felder) {
          if (f.sichtbar && !f.sichtbar(antworten)) continue;
          if (!f.ziel || !("feld" in f.ziel)) continue;
          const ziel = `${f.ziel.entitaet}.${f.ziel.feld}`;
          const schon = gesehen.get(ziel);
          expect(schon, `${ziel}: ${schon} und ${s.id}.${f.id} bei ${art}`).toBeUndefined();
          gesehen.set(ziel, `${s.id}.${f.id}`);
        }
      }
    }
  });

  it("jede Auswahl hat Optionen, jedes Listenfeld ein Listenziel", () => {
    for (const s of KATALOG) {
      for (const f of s.felder) {
        if (f.typ === "auswahl") expect(f.optionen?.length ?? 0).toBeGreaterThan(0);
        if (f.ziel && "liste" in f.ziel) expect(f.typ).toBe("text");
      }
    }
  });
});
```

- [ ] **Schritt 3: Beide laufen lassen**

```bash
npx vitest run tests/selbstauskunft-ampel-vertrag.test.ts tests/selbstauskunft-katalog-vertrag.test.ts
```

Erwartet: grün. **Scheitert der Ausschluss-Test, ist das ein echter Fund** — dann sind zwei Bedingungen im Katalogschnitt nicht trennscharf. Behebe den Katalog, nicht den Test.

- [ ] **Schritt 4: Commit**

```bash
git add tests/selbstauskunft-ampel-vertrag.test.ts tests/selbstauskunft-katalog-vertrag.test.ts
git commit -m "test(selbstauskunft): Vertraege gegen Ampel und Katalog

Der kurze Bogen existiert, um der Machbarkeits-Ampel zu genuegen – nimmt ihm
jemand ein gerechnetes Feld weg, bleibt die Ampel still grau. Dazu die Probe,
dass nie zwei gleichzeitig sichtbare Felder in dasselbe Zielfeld schreiben."
```

---

### Task 7: Abschluss

- [ ] Volle Testsuite grün (`npx vitest run`), Typprüfung fehlerfrei (`npx tsc --noEmit`), Datenbanktests grün (`RUN_DB_IT=1 npx vitest run tests/anfrage-fallgeburt-db.test.ts tests/selbstauskunft-db.test.ts`)
- [ ] In der laufenden Anwendung durchgespielt: öffentlicher Bogen mit **zwei** Antragstellern von Seite 1 bis zur Zusammenfassung — sechs Seiten, beide Spalten, Fortschritt zählt „von 6"
- [ ] Derselbe Weg mit **einem** Antragsteller — eine Spalte, keine leeren Felder
- [ ] Persönlicher Link aus einer Fallakte: dreizehn Seiten, die ersten sechs vorbelegt
- [ ] Erstgesprächs-Maske geöffnet: zeigt weiterhin alle Felder, beide Personen, Bedingungen der Beschäftigungsart greifen
- [ ] Nach `main` gepusht und Deployment abgewartet
- [ ] `docs/superpowers/specs/2026-08-15-selbstauskunft-kuerzen-design.md` als umgesetzt markieren
