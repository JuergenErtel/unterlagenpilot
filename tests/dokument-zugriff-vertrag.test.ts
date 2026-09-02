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
 * Upload-Token (Kunde). Die Grenze: Statisch laesst sich nur pruefen, DASS ein
 * Guard importiert wird und dass die verbotenen Muster fehlen - nicht, dass
 * der Guard vor jedem Zugriff aufgerufen wird. Dafuer stehen die DB-Tests
 * (tests/backoffice-dokument-zugriff-db.test.ts).
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
});
