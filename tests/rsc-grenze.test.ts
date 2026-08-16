import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Die Grenze zwischen Server- und Client-Komponenten – die einzige Zusage
 * dieses Projekts, die WEDER die Typpruefung NOCH ein gewoehnlicher Test sieht.
 *
 * Der Fall, der diesen Test erzwungen hat: Die Schrittseite der
 * Kundenstrecke (`src/app/selbstauskunft/[token]/[schritt]/page.tsx`, eine
 * Server-Komponente) importierte `spaltenPersonen` aus `step-form.tsx` und rief
 * es auf. Jene Datei traegt "use client". Next ersetzt jedes Client-Modul im
 * Server-Graph durch einen Proxy: Jeder benannte Export wird zu einer
 * Client-Referenz, die beim AUFRUF wirft ("Attempted to call
 * spaltenPersonen() from the server").
 *
 * Warum es monatelang niemandem auffiel:
 *  - `tsc` kennt die Grenze nicht. Fuer die Typpruefung ist das ein ganz
 *    normaler Funktionsexport mit passender Signatur.
 *  - Ein Test importiert das Modul direkt, ohne Flight-Loader – dort ist es
 *    einfach eine Funktion und tut, was sie soll.
 *  - Der Fehler tritt AUSSCHLIESSLICH beim echten Request auf. Also bei jedem
 *    Kunden, und bei keinem von uns.
 *
 * Deshalb wird die Grenze hier statisch geprueft, am Importgraphen selbst:
 * Keine Datei ohne "use client" darf einen WERT aus einem Modul mit
 * "use client" importieren. Komponenten (grosser Anfangsbuchstabe) sind
 * ausgenommen – die durchzureichen und zu rendern ist genau der vorgesehene
 * Weg. `import type` ebenso: Typen werden beim Uebersetzen geloescht und
 * ueberqueren die Grenze nie.
 *
 * Wer hier einen Fund bekommt, verschiebt den Wert in ein framework-freies
 * Modul (Vorbild: `src/lib/self-disclosure/spalten.ts`) – nicht die Pruefung.
 */

const WURZEL = resolve(__dirname, "..");
const SRC = join(WURZEL, "src");

function alleQuelldateien(verzeichnis: string): string[] {
  const out: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) out.push(...alleQuelldateien(pfad));
    else if (/\.tsx?$/.test(pfad) && !pfad.endsWith(".d.ts")) out.push(pfad);
  }
  return out;
}

/**
 * Traegt die Datei die Direktive? Nur der Dateikopf zaehlt – davor duerfen
 * bloss Kommentare stehen, genau wie es der Uebersetzer verlangt.
 */
function istClientModul(datei: string): boolean {
  const kopf = readFileSync(datei, "utf8").slice(0, 500);
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(kopf);
}

/** "@/lib/x" oder "./x" auf eine echte Datei abbilden; sonst null (Paket). */
function aufloesen(spezifizierer: string, importierendeDatei: string): string | null {
  const basis = spezifizierer.startsWith("@/")
    ? join(SRC, spezifizierer.slice(2))
    : spezifizierer.startsWith(".")
      ? resolve(dirname(importierendeDatei), spezifizierer)
      : null;
  if (!basis) return null;
  for (const endung of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(basis + endung)) return basis + endung;
  }
  return existsSync(basis) && statSync(basis).isFile() ? basis : null;
}

interface Bezug {
  von: string;
  aus: string;
  name: string;
  /** Grosser Anfangsbuchstabe = Komponente; die darf ueber die Grenze. */
  komponente: boolean;
}

/** Alle Wert-Bezuege aus Nicht-Client-Dateien in Client-Module. */
function bezuegeUeberDieGrenze(): Bezug[] {
  const dateien = alleQuelldateien(SRC);
  const clientModul = new Map(dateien.map((d) => [d, istClientModul(d)]));
  const funde: Bezug[] = [];

  for (const datei of dateien) {
    if (clientModul.get(datei)) continue; // Client -> Client ist immer erlaubt.
    const quelle = readFileSync(datei, "utf8");
    // `(?!type\s)` schliesst `import type { ... }` komplett aus.
    const importe = /import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
    let treffer: RegExpExecArray | null;
    while ((treffer = importe.exec(quelle))) {
      const ziel = aufloesen(treffer[2]!, datei);
      if (!ziel || !clientModul.get(ziel)) continue;

      const klausel = treffer[1]!;
      const benannt = [...klausel.matchAll(/\{([\s\S]*?)\}/g)].flatMap((g) =>
        g[1]!.split(",").map((s) => s.trim())
      );
      // Ein Vorgabe-Import steht vor der geschweiften Klammer.
      const vorgabe = klausel.split("{")[0]!.replace(/,\s*$/, "").trim();
      const namen = [...(vorgabe && !vorgabe.startsWith("*") ? [vorgabe] : []), ...benannt];

      for (const roh of namen) {
        // Einzelne `type`-Spezifizierer innerhalb der Klammern.
        if (roh === "" || roh === "type" || roh.startsWith("type ")) continue;
        const name = roh.split(/\s+as\s+/)[0]!.trim();
        funde.push({
          von: datei.replace(WURZEL + "/", ""),
          aus: treffer[2]!,
          name,
          komponente: /^[A-Z]/.test(name),
        });
      }
    }
  }
  return funde;
}

const bezuege = bezuegeUeberDieGrenze();

describe("RSC-Grenze", () => {
  it("findet ueberhaupt Client-Module – sonst prueft der Fall unten nichts", () => {
    // Ohne diese Zusage waere der eigentliche Fall leer erfuellt, sobald die
    // Erkennung der Direktive einmal kaputtgeht (Formatierung, Umbau).
    const clientModule = alleQuelldateien(SRC).filter(istClientModul);
    expect(clientModule.length).toBeGreaterThan(10);
  });

  it("sieht Server-Dateien, die Client-Komponenten einbetten", () => {
    // Ebenso: Wenn die Import-Erkennung nichts mehr findet, ist auch der Fall
    // unten still gruen. Komponenten ueber die Grenze zu reichen ist der
    // Normalfall – es MUSS also welche geben.
    expect(bezuege.filter((b) => b.komponente).length).toBeGreaterThan(10);
  });

  it("keine Server-Datei importiert einen WERT aus einem \"use client\"-Modul", () => {
    const werte = bezuege.filter((b) => !b.komponente);
    expect(
      werte.map((b) => `${b.von}: "${b.name}" aus ${b.aus}`),
      "Aufruf ueber die RSC-Grenze – wirft erst beim echten Request. Wert in ein " +
        "framework-freies Modul verschieben (Vorbild: src/lib/self-disclosure/spalten.ts)."
    ).toEqual([]);
  });
});
