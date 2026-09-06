import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vertragstest: Kein Dokument- oder Aktenzugriff ohne den zentralen
 * Zugriffsschutz.
 *
 * Die Regel, die er erzwingt: In Server Actions und Route Handlern gibt es
 * keine Ad-hoc-Pruefung "gehoert zur Organisation" mehr. Wer ein Dokument
 * oder eine Akte laedt, tut das ueber requireDocumentAccess /
 * requireAkteAccess / requireCaseAccess / akteSichtbarWhere (Vertrieb und
 * Backoffice), ladeAkteFuerRoute / ladeDokumentFuerRoute (Routen),
 * requirePortalAuftrag / ladePortalAuftragFuerRoute (Portal) oder ueber ein
 * Upload-Token (Kunde). Statisch pruefbar ist: DASS ein Guard importiert wird,
 * dass die verbotenen Muster fehlen - und seit 06.09.2026 zusaetzlich, dass in
 * jeder exportierten Funktion der erste Guard-Aufruf textlich vor dem ersten
 * Datenbankzugriff steht (Ausnahmen namentlich in REIHENFOLGE_AUSNAHMEN).
 * Was hier nicht geht: beweisen, dass der Guard fuer DIESE Akte gefragt wurde.
 * Dafuer stehen die DB-Tests (tests/backoffice-dokument-zugriff-db.test.ts).
 */

const WURZEL = process.cwd();

function dateienUnter(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...dateienUnter(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const ERLAUBTE_GUARDS = [
  "requireDocumentAccess",
  "requireAkteAccess",
  "requireCaseAccess",
  "akteSichtbarWhere",
  "eigeneAkteWhere",
  "ladeAkteFuerRoute",
  "ladeDokumentFuerRoute",
  "requirePortalAuftrag",
  "ladePortalAuftragFuerRoute",
  "requireBackofficeAuftrag",
  "resolveUploadToken",
  "requireUploadTokenAccess",
];

/** Muster, die in Actions/Routen nicht mehr vorkommen duerfen. */
const VERBOTEN: Array<{ muster: RegExp; grund: string }> = [
  { muster: /case\.organizationId\s*!==\s*ctx\.organizationId/, grund: "Ad-hoc-Organisationsvergleich statt zentralem Guard" },
  { muster: /caseRow\.organizationId\s*!==\s*ctx\.organizationId/, grund: "Ad-hoc-Organisationsvergleich statt zentralem Guard" },
  { muster: /prisma\.document\.findUnique\(/, grund: "findUnique am Dokument ohne Sichtbarkeitsfilter (findFirst + akteSichtbarWhere oder requireDocumentAccess)" },
  { muster: /case:\s*\{\s*organizationId(?!,\s*\.\.\.nurVertrieb)/, grund: "Handfilter nur auf die Organisation - Aktenart fehlt (akteSichtbarWhere)" },
];

/**
 * Service-Module, die absichtlich nur die Organisation pruefen, weil ihr
 * einziger Aufrufer der Guard-gesicherte Action-Einstieg ist. Wer hier etwas
 * ergaenzt, muss den Aufrufer nennen.
 */
const SERVICE_AUSNAHMEN: Record<string, string> = {
  "src/lib/aufteilung/service.ts": "teileAuf: aufteilenAction prueft vorher requireDocumentAccess(schreibend)",
  "src/lib/buendelung/service.ts": "fuegeZusammen/macheRueckgaengig: Actions pruefen requireCaseAccess(caseId, schreibend), Dokumente werden gegen dieselbe caseId gefiltert",
  "src/lib/security/upload-link.ts": "listUploadLinks/deactivateUploadLink: Aufrufer pruefen requireCaseAccess und binden an caseId",
  "src/lib/saas/plans.ts": "Tarifzaehler (Dokumente je Fall, KI-Laeufe je Monat): Ressourcenverbrauch der Organisation, bewusst inklusive Backoffice-Akten",
};

/**
 * Schneidet exportierte async-Funktionen in Ruempfe: {name, rumpf}. Klammer-
 * zaehlung ab der ersten "{" nach dem Funktionskopf; Strings mit
 * unbalancierten Klammern gibt es in den Actions nicht - kippt das einmal,
 * meldet der Selbsttest unten die Datei.
 */
function funktionsRuempfe(src: string): Array<{ name: string; rumpf: string }> {
  const out: Array<{ name: string; rumpf: string }> = [];
  const re = /export async function (\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = src.indexOf("{", re.lastIndex);
    if (start < 0) continue;
    let tiefe = 0;
    let i = start;
    for (; i < src.length; i++) {
      if (src[i] === "{") tiefe++;
      else if (src[i] === "}") {
        tiefe--;
        if (tiefe === 0) break;
      }
    }
    out.push({ name: m[1]!, rumpf: src.slice(start, i + 1) });
  }
  return out;
}

/** Aufrufe, die als Zugriffsschutz gelten - die Akten-Guards, die Bereichs-Guards, die Token-Guards. */
const GUARD_NAMEN = [
  ...ERLAUBTE_GUARDS,
  "requireBackoffice",
  "requireBackofficeManager",
  "requirePortal",
  "requirePlatformAdmin",
  "resolveSelfDisclosureToken",
];
const DB_ZUGRIFF = /\b(prisma|tx)\./;

function guardRegex(namen: string[]): RegExp {
  return new RegExp(`\\b(${namen.join("|")})\\s*\\(`);
}

/**
 * Private Hilfsfunktionen einer Datei, die selbst einen Guard rufen
 * (ladeFall, ladeBefund, pruefeFall ...): Ein Aufruf von ihnen zaehlt in
 * dieser Datei wie der Guard selbst.
 */
function guardHelfer(src: string): string[] {
  const out: string[] = [];
  const re = /(?<!export )(?:async )?function (\w+)\s*\(/g;
  const basis = guardRegex(GUARD_NAMEN);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = src.indexOf("{", re.lastIndex);
    if (start < 0) continue;
    let tiefe = 0;
    let i = start;
    for (; i < src.length; i++) {
      if (src[i] === "{") tiefe++;
      else if (src[i] === "}") {
        tiefe--;
        if (tiefe === 0) break;
      }
    }
    if (basis.test(src.slice(start, i + 1))) out.push(m[1]!);
  }
  return out;
}

/**
 * Funktionen, die vor dem Guard (oder ohne) in die Datenbank duerfen - jede
 * mit Grund. Schluessel: "<Pfad relativ>#<Funktion>". Gemeinsam ist ihnen:
 * Es gibt (noch) keine Akte, die ein Guard schuetzen koennte.
 */
const REIHENFOLGE_AUSNAHMEN: Record<string, string> = {
  "src/lib/actions/cases.ts#createCase": "legt eine neue Akte der eigenen Organisation an - es gibt noch nichts zu schuetzen",
  "src/lib/actions/finlink.ts#importFromFinLink": "der Connector legt die Akte selbst an; das Nachlesen betrifft nur die eben erzeugte ID (Fallnummer)",
  "src/lib/actions/machbarkeit.ts#speichereAnnahmen": "organisationsweite Zinsannahmen, keine Akte",
  "src/lib/actions/review.ts#reviewExtractedField": "liest vor dem Guard nur die documentId des Feldes, um requireDocumentAccess zu fragen; kein Inhalt",
};

describe("Vertrag: Dokument- und Aktenzugriff nur ueber den zentralen Guard", () => {
  const actions = dateienUnter(join(WURZEL, "src/lib/actions"), (p) => p.endsWith(".ts"));
  const routen = dateienUnter(join(WURZEL, "src/app/api"), (p) => p.endsWith("route.ts"));
  const kandidaten = [...actions, ...routen].filter((p) => {
    const s = readFileSync(p, "utf-8");
    return /prisma\.document\.|documentId|prisma\.case\.find/.test(s) && !p.includes("/cron/");
  });

  it("findet die dokumentbezogenen Actions und Routen (Selbsttest des Vertrags)", () => {
    expect(kandidaten.length).toBeGreaterThan(8);
  });

  for (const datei of kandidaten) {
    const rel = datei.slice(WURZEL.length + 1);
    it(`${rel}: importiert einen zentralen Guard`, () => {
      const s = readFileSync(datei, "utf-8");
      const hat = ERLAUBTE_GUARDS.some((g) => new RegExp(`\\b${g}\\b`).test(s));
      expect(hat, `${rel} laedt Dokumente/Akten, importiert aber keinen der Guards: ${ERLAUBTE_GUARDS.join(", ")}`).toBe(true);
    });
    it(`${rel}: enthaelt keine Ad-hoc-Autorisierung`, () => {
      const s = readFileSync(datei, "utf-8");
      for (const v of VERBOTEN) {
        expect(v.muster.test(s), `${rel}: ${v.grund}`).toBe(false);
      }
    });
  }

  it("Service-Module mit reinem Organisationsfilter sind benannt und begruendet", () => {
    const services = dateienUnter(join(WURZEL, "src/lib"), (p) => p.endsWith(".ts") && !p.includes("/actions/"));
    const treffer = services.filter((p) => /case:\s*\{\s*organizationId\s*\}/.test(readFileSync(p, "utf-8")));
    for (const p of treffer) {
      const rel = p.slice(WURZEL.length + 1);
      expect(SERVICE_AUSNAHMEN[rel], `${rel} filtert nur auf die Organisation und steht nicht in SERVICE_AUSNAHMEN`).toBeTruthy();
    }
  });

  it("der zentrale Guard antwortet mit notFound und protokolliert Fehlversuche ohne Inhalt", () => {
    const s = readFileSync(join(WURZEL, "src/lib/auth/akte-zugriff.ts"), "utf-8");
    expect(s).toContain("notFound()");
    expect(s).toContain('action: "access.denied"');
    expect(s).not.toMatch(/metadata:\s*\{[^}]*(storageKey|originalName|generatedName)/);
  });
  describe("Reihenfolge: Guard vor dem ersten Datenbankzugriff", () => {
    for (const datei of kandidaten) {
      const rel = datei.slice(WURZEL.length + 1);
      const quelle = readFileSync(datei, "utf-8");
      const ruempfe = funktionsRuempfe(quelle);
      const guardInDatei = guardRegex([...GUARD_NAMEN, ...guardHelfer(quelle)]);
      for (const { name, rumpf } of ruempfe) {
        const db = rumpf.search(DB_ZUGRIFF);
        if (db < 0) continue;
        it(`${rel}#${name}`, () => {
          if (REIHENFOLGE_AUSNAHMEN[`${rel}#${name}`]) return;
          const guard = rumpf.search(guardInDatei);
          // Der Guard darf im SELBEN Statement stehen wie der erste Zugriff
          // (findFirst({ where: { ...akteSichtbarWhere(ctx) } })).
          const statementEnde = rumpf.indexOf(";", db);
          const grenze = statementEnde < 0 ? rumpf.length : statementEnde;
          expect(guard >= 0 && guard < grenze, `${rel}#${name}: erster Datenbankzugriff vor dem Guard (oder ohne Guard)`).toBe(true);
        });
      }
    }

    it("Selbsttest: findet Funktionsruempfe und Guard-Helfer", () => {
      const s = readFileSync(join(WURZEL, "src/lib/actions/upload.ts"), "utf-8");
      expect(funktionsRuempfe(s).length).toBeGreaterThan(3);
      expect(guardHelfer(readFileSync(join(WURZEL, "src/lib/actions/detektiv.ts"), "utf-8"))).toContain("ladeBefund");
    });

    it("jede Ausnahme zeigt auf eine existierende Funktion", () => {
      for (const key of Object.keys(REIHENFOLGE_AUSNAHMEN)) {
        const [rel, fn] = key.split("#");
        const quelle = readFileSync(join(WURZEL, rel!), "utf-8");
        expect(funktionsRuempfe(quelle).some((r) => r.name === fn), key).toBe(true);
      }
    });
  });
});
