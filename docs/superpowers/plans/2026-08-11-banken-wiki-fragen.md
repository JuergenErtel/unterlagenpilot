# Banken-Wiki: Fragen stellen — Umsetzungsplan

> **Für agentische Bearbeiter:** Umsetzung Aufgabe für Aufgabe, Schritte als Checkboxen.

**Ziel:** Im Banken-Wiki eine Frage in Alltagssprache stellen („Welche Banken
akzeptieren einen Dolmetscher beim Notartermin?") und eine belegte, nach
Urteil gruppierte Bankliste zurückbekommen.

**Architektur:** Vier Stufen — Deuten (KI, klein) → Sammeln (Code, entdoppelt)
→ Lesen (KI, gebündelt, mit Belegprüfung) → Zusammenführen (Code). Die
Freitexte werden **je verschiedenem Text** bewertet, nicht je Bank; Zeilen mit
Status `KEINE_ANGABE` erreichen die KI nie.

**Technik:** Next.js App Router, Prisma, Zod, vorhandene `AIService`-Schicht mit
Mock-Provider, `TONE`-Farbsystem, vitest.

Spec: `docs/superpowers/specs/2026-08-11-banken-wiki-fragen-design.md`

## Globale Vorgaben

- Fachsprache im Code ist Deutsch (bestehende Konvention in `src/lib/banken/`).
- `KEINE_ANGABE` ist nie ein Nein und geht nie an die KI.
- KI-Ausgaben werden ausschließlich als Text gerendert, nie als HTML.
- Deckel: höchstens 300 Texte je Frage, Bündel zu 20, höchstens 4 gleichzeitig.
- Jede Kürzung wird in der Antwort ausgewiesen.
- Zitate werden gegen den Quelltext geprüft; ungeprüfte Zitate werden verworfen.

## Dateien

| Datei | Verantwortung |
|---|---|
| `src/lib/banken/fragen/schema.ts` | Zod-Schemas + Typen für Deutung und Urteile |
| `src/lib/banken/fragen/deuten.ts` | Katalogprüfung, Banknamen-Auflösung |
| `src/lib/banken/fragen/sammeln.ts` | Entdopplung, Stichwortnähe, Deckel (rein) |
| `src/lib/banken/fragen/lesen.ts` | Bündelung, Belegprüfung |
| `src/lib/banken/fragen/antwort.ts` | Urteile → Gruppen (rein) |
| `src/lib/banken/fragen/index.ts` | Orchestrierung `beantworteFrage` (DB + KI) |
| `src/lib/ai/service.ts` | zwei neue Methoden |
| `src/lib/ai/mock-provider.ts` | zwei neue Zweige |
| `src/lib/actions/banken-fragen.ts` | Server-Action |
| `src/app/(app)/banken/fragen/page.tsx` | Seite |
| `src/components/banken/frage-antwort.tsx` | Client-Komponente mit Fortschritt |
| `src/app/(app)/banken/page.tsx` | Einstiegskarte |
| `tests/banken-fragen.test.ts` | Tests |

---

### Aufgabe 1: Schemas und Katalogprüfung

**Dateien:** Create `src/lib/banken/fragen/schema.ts`, `src/lib/banken/fragen/deuten.ts`; Test `tests/banken-fragen.test.ts`

**Produziert:**
- `URTEILE = ["ja","bedingt","nein","keine_aussage"]`, `type Urteil`
- `deutungSchema` → `{ kriterien: string[]; bank: string|null; stichwoerter: string[]; verstanden: string }`
- `urteileSchema` → `{ urteile: Array<{ id: number; urteil: Urteil; beleg: string }> }`
- `pruefeKriterien(namen: string[]): string[]` — behält nur Namen aus dem Katalog
- `alleKriterien(): string[]`

- [ ] Test: erfundener Kriteriumsname wird verworfen, echter bleibt, Reihenfolge stabil, höchstens 3.
- [ ] Test läuft rot.
- [ ] Umsetzen gegen `kategorien.json` (`ZUORDNUNG`-Schlüssel als Katalog).
- [ ] Test läuft grün. Commit.

### Aufgabe 2: Entdopplung, Stichwortnähe, Deckel

**Dateien:** Create `src/lib/banken/fragen/sammeln.ts`

**Konsumiert:** nichts. **Produziert:**
```ts
interface Zeile { bankId: string; name: string; kriterium: string; status: string; inhalt: string }
interface Textblock { id: number; text: string; banken: Zeile[] }
interface Sammlung { bloecke: Textblock[]; ohneAussage: Zeile[]; gesamtBloecke: number }
function buendele(zeilen: Zeile[], stichwoerter: string[], deckel?: number): Sammlung
```

- [ ] Test: `KEINE_ANGABE`-Zeilen landen in `ohneAussage` und in keinem Block.
- [ ] Test: 3 Zeilen mit identischem Text ergeben 1 Block mit 3 Banken.
- [ ] Test: Blöcke mit Stichworttreffer stehen vorn.
- [ ] Test: bei Deckel 2 und 5 Blöcken bleiben 2, `gesamtBloecke` bleibt 5.
- [ ] Rot → umsetzen → grün. Commit.

### Aufgabe 3: Belegprüfung und Bündelung

**Dateien:** Create `src/lib/banken/fragen/lesen.ts`

**Produziert:**
```ts
function pruefeBeleg(beleg: string, quelle: string): string | null
function inBuendel<T>(items: T[], groesse: number): T[][]
```
`pruefeBeleg` vergleicht normalisiert (Kleinschreibung, Whitespace); kein
Treffer → `null`.

- [ ] Test: wörtliches Zitat mit abweichender Groß-/Kleinschreibung wird angenommen.
- [ ] Test: erfundenes Zitat liefert `null`.
- [ ] Test: `inBuendel([1..5], 2)` → `[[1,2],[3,4],[5]]`.
- [ ] Rot → umsetzen → grün. Commit.

### Aufgabe 4: KI-Methoden und Mock

**Dateien:** Modify `src/lib/ai/service.ts`, `src/lib/ai/mock-provider.ts`

**Produziert:**
- `aiService.deuteBankenFrage(frage: string, katalog: string[]): Promise<Deutung>`
- `aiService.bewerteBankTexte(frage: string, texte: Array<{id:number;text:string}>): Promise<UrteileResult>`

Mock deterministisch: Deutung über Tokenüberschneidung mit dem Katalog;
Urteile per Heuristik („keine aussage" → `keine_aussage`, „nicht"/„kein" →
`nein`, „nur"/„sofern"/„wenn" → `bedingt`, sonst `ja`), Beleg = erster Satz.

- [ ] Test: Mock-Deutung findet „Sprache" zur Dolmetscher-Frage.
- [ ] Test: Mock-Urteil liefert je Text genau einen Eintrag mit gültiger `id`.
- [ ] Rot → umsetzen → grün. Commit.

### Aufgabe 5: Gruppierung

**Dateien:** Create `src/lib/banken/fragen/antwort.ts`

**Produziert:**
```ts
interface BankUrteil { bankId: string; name: string; kriterium: string; beleg: string|null }
interface Gruppe { urteil: Urteil; banken: BankUrteil[] }
function baueGruppen(bloecke: Textblock[], urteile: Map<number,{urteil:Urteil;beleg:string|null}>, ohneAussage: Zeile[]): Gruppe[]
```
Reihenfolge `ja, bedingt, nein, keine_aussage`; Banken je Gruppe nach Namen.
Erscheint eine Bank mehrfach, gewinnt das restriktivste Urteil
(`nein > bedingt > ja > keine_aussage`) samt zugehörigem Beleg.

- [ ] Test: Rückmapping vollständig — Bankanzahl über alle Gruppen = Zeilenanzahl.
- [ ] Test: Bank mit „ja" und „nein" erscheint nur in „nein", mit dem Nein-Beleg.
- [ ] Test: `ohneAussage` landet ausschließlich in `keine_aussage`.
- [ ] Rot → umsetzen → grün. Commit.

### Aufgabe 6: Orchestrierung

**Dateien:** Create `src/lib/banken/fragen/index.ts`

**Produziert:** `beantworteFrage(frage: string): Promise<FrageAntwort>` mit
`{ frage, verstanden, kriterien, bankHinweis, standAm, gruppen, gelesen, gesamt, hinweise }`.

Ablauf: Deutung → `pruefeKriterien` → Banknamen über `passtZurSuche` auflösen →
Zeilen laden (Kriterien + Stichwort-Auffangnetz `contains` über `inhalt`) →
`buendele` → `inBuendel` zu 20, höchstens 4 gleichzeitig →
`bewerteBankTexte` → `pruefeBeleg` → `baueGruppen`.
Kein Kriterium und kein Stichworttreffer → leere Gruppen plus Hinweis.

- [ ] Test (Mock-Provider, ohne DB): Zeilen werden injiziert, Antwort enthält
      Gruppen, `gelesen`/`gesamt` stimmen, Hinweis bei Kürzung.
- [ ] Rot → umsetzen → grün. Commit.

### Aufgabe 7: Server-Action, Seite, Einstieg

**Dateien:** Create `src/lib/actions/banken-fragen.ts`,
`src/app/(app)/banken/fragen/page.tsx`, `src/components/banken/frage-antwort.tsx`;
Modify `src/app/(app)/banken/page.tsx`

- [ ] Action mit `requireContext()`, Fragenlänge 3–300 Zeichen, sonst Hinweis.
- [ ] Seite liest `?frage=`, rendert Formular und die Client-Komponente.
- [ ] Client-Komponente ruft die Action über `useTransition`, zeigt Fortschritt
      und danach die Gruppen mit `TONE`-Farben; „keine Aussage" eingeklappt mit
      dem Satz „Das ist kein Nein."
- [ ] Karte „Frag das Wiki" über der Namenssuche auf `/banken`.
- [ ] `npm run lint && npm run typecheck && npm test`. Commit.

### Aufgabe 8: Abnahme gegen echte Daten

- [ ] Mit `AI_PROVIDER=mock` lokal die Dolmetscher-Frage stellen, Gruppen prüfen.
- [ ] Nach Deploy in Produktion (echte KI) dieselbe Frage stellen und die
      Belegzitate stichprobenhaft gegen die Bankseiten prüfen.
