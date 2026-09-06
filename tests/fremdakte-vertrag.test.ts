import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vertragstest: Fremdakten (Cross-Org-Uebergabe) duerfen nur dort geoeffnet
 * werden, wo Unterlagenarbeit stattfindet. Jede Datei, die
 * `fremdakteErlaubt: true` setzt, steht hier mit Begruendung. Eine neue
 * Vertriebsseite mit dem Opt-in laesst den Test rot werden - und eine
 * Vertriebsseite, die statt eigeneAkteWhere das breitere akteSichtbarWhere
 * nimmt, ebenfalls.
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

const ERLAUBT: Record<string, string> = {
  "src/lib/actions/upload.ts": "Vermittler-Upload in die Akte",
  "src/lib/actions/buendelung.ts": "Einzelseiten buendeln",
  "src/lib/actions/einkommen.ts": "Einkommensauswertung Selbstaendige (Dokumentauswertung)",
  "src/lib/actions/wohnflaeche.ts": "Wohnflaeche aus Grundrissen",
  "src/lib/actions/lageplan.ts": "Lageplan zur Akte",
  "src/lib/actions/cases.ts": "KI-Pruefung starten, Upload-Links verwalten",
  "src/lib/auth/akte-zugriff.ts": "Dokumentguard: Dokumente sind Unterlagenarbeit",
  "src/app/(app)/cases/[id]/einkommen-selbststaendig/page.tsx": "Seite Einkommensauswertung",
  "src/app/(app)/cases/[id]/lageplan/page.tsx": "Seite Lageplan",
  "src/app/(app)/cases/[id]/wohnflaeche/page.tsx": "Seite Wohnflaeche",
};

const VERTRIEB_MUSS_EIGENE = [
  "src/app/(app)/cases/[id]/edit/page.tsx",
  "src/app/(app)/cases/[id]/messages/page.tsx",
  "src/lib/actions/machbarkeit.ts",
  "src/lib/actions/finlink.ts",
];

const VERTRIEB_OHNE_OPTIN = [
  "src/app/(app)/cases/[id]/erstgespraech/page.tsx",
  "src/app/(app)/cases/[id]/verwaltung/page.tsx",
  "src/app/(app)/cases/[id]/machbarkeit/page.tsx",
  "src/app/(app)/cases/[id]/haushalt/page.tsx",
  "src/app/(app)/cases/[id]/summary/page.tsx",
  "src/app/(app)/cases/[id]/export/page.tsx",
  "src/app/(app)/cases/[id]/ehyp-workflow/page.tsx",
  "src/lib/actions/erstgespraech.ts",
  "src/lib/actions/case-management.ts",
  "src/lib/actions/lead-phase.ts",
  "src/lib/actions/case-lifecycle.ts",
  "src/lib/actions/kreditpruefung.ts",
];

describe("Vertrag: Fremdakte nur in der Unterlagenarbeit", () => {
  const dateien = dateienUnter(join(WURZEL, "src"), (p) => /\.(ts|tsx)$/.test(p));
  const mitOptIn = dateien.filter((p) => /fremdakteErlaubt:\s*true/.test(readFileSync(p, "utf-8")));

  it("findet Opt-ins (Selbsttest)", () => {
    expect(mitOptIn.length).toBeGreaterThan(5);
  });

  for (const p of mitOptIn) {
    const rel = p.slice(WURZEL.length + 1);
    it(`${rel} steht in der Allowlist`, () => {
      expect(ERLAUBT[rel], `${rel} setzt fremdakteErlaubt, ist aber nicht als Unterlagenarbeit begruendet`).toBeTruthy();
    });
  }

  for (const rel of Object.keys(ERLAUBT)) {
    it(`${rel} (Allowlist) existiert und setzt das Opt-in`, () => {
      const s = readFileSync(join(WURZEL, rel), "utf-8");
      expect(/fremdakteErlaubt:\s*true/.test(s)).toBe(true);
    });
  }

  for (const rel of VERTRIEB_MUSS_EIGENE) {
    it(`${rel} laedt nur eigene Akten (eigeneAkteWhere)`, () => {
      const s = readFileSync(join(WURZEL, rel), "utf-8");
      expect(s).toMatch(/\beigeneAkteWhere\b/);
      expect(s).not.toMatch(/\bakteSichtbarWhere\b/);
    });
  }

  it("Vertriebsseiten der Fallakte setzen kein Opt-in", () => {
    for (const rel of VERTRIEB_OHNE_OPTIN) {
      expect(/fremdakteErlaubt:\s*true/.test(readFileSync(join(WURZEL, rel), "utf-8")), rel).toBe(false);
    }
  });
});
