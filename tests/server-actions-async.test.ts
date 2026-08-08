import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Waechter fuer eine Fehlerklasse, die weder `npm run typecheck` noch die
 * uebrigen Tests melden: In einer Datei mit "use server" laesst Next.js
 * ausschliesslich async-Funktionen als Export zu. Ein synchroner Export bricht
 * erst `next build` – auf Vercel deployt dann gar nichts mehr.
 *
 * Typ-Exporte (interface/type) sind erlaubt, sie verschwinden beim Kompilieren.
 */
const WURZEL = join(process.cwd(), "src");

function alleQuelldateien(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleQuelldateien(pfad));
    else if (/\.tsx?$/.test(eintrag)) treffer.push(pfad);
  }
  return treffer;
}

/** Dateien, deren erste Anweisung "use server" ist (Modul-Direktive). */
function istServerActionModul(inhalt: string): boolean {
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']\s*;?/.test(inhalt);
}

describe("Server-Action-Module", () => {
  const dateien = alleQuelldateien(WURZEL).filter((p) =>
    istServerActionModul(readFileSync(p, "utf-8"))
  );

  it("findet ueberhaupt Server-Action-Module (sonst prueft der Test nichts)", () => {
    expect(dateien.length).toBeGreaterThan(0);
  });

  it("exportiert dort ausschliesslich async-Funktionen", () => {
    const verstoesse: string[] = [];
    for (const pfad of dateien) {
      const zeilen = readFileSync(pfad, "utf-8").split("\n");
      zeilen.forEach((zeile, i) => {
        const ort = `${pfad.replace(process.cwd() + "/", "")}:${i + 1}`;
        // export function foo()  → muss async sein
        if (/^\s*export\s+function\s/.test(zeile)) verstoesse.push(`${ort} ${zeile.trim()}`);
        // export const foo = ... → nur als async-Funktion zulaessig
        const konstante = zeile.match(/^\s*export\s+const\s+\w+\s*(?::[^=]+)?=\s*(.*)$/);
        if (konstante && !/^async\b/.test(konstante[1]!.trim())) {
          verstoesse.push(`${ort} ${zeile.trim()}`);
        }
      });
    }
    expect(verstoesse).toEqual([]);
  });
});
