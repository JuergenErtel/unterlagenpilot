import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Einer der drei Bereiche der Fallakte: Dokumente, Beratung, Einreichung.
 *
 * Die Fallakte hatte vier Reiter UND eine Spalte mit vierzehn Werkzeugen.
 * Beides zusammen hiess: Wer etwas sucht, muss erst wissen, ob es ein Reiter
 * oder ein Werkzeug ist. Jetzt gibt es drei Fragen - womit arbeite ich gerade?
 * - und alles Uebrige liegt darunter.
 *
 * Natives `<details>` statt einer Klappmechanik in JavaScript: Es funktioniert
 * ohne Skript, die Tastatur kann es von Haus aus, und der Browser findet
 * damit auch Text in zugeklappten Bereichen (Strg+F). Dasselbe Muster, das
 * die Werkzeugliste vorher schon benutzt hat.
 *
 * Die Zahl rechts ist kein Schmuck: Sie ist der einzige Grund, einen
 * zugeklappten Bereich zu oeffnen. Ohne sie muesste der Berater alle drei
 * aufklappen, um zu sehen, wo etwas liegt - und waere wieder beim Suchen.
 */
export function FallBereich({
  id,
  titel,
  icon: Icon,
  beschreibung,
  marke,
  offen = false,
  children,
}: {
  /** Ankerziel, damit Links von aussen den Bereich ansteuern koennen. */
  id: string;
  titel: string;
  icon: LucideIcon;
  /** Eine Zeile, was hier drin liegt - sie steht auch im zugeklappten Zustand. */
  beschreibung: string;
  /** Was gerade zu tun ist ("3 fehlen"). Leer, wenn nichts ansteht. */
  marke?: { text: string; ton: "aktion" | "warnung" | "ruhe" } | null;
  offen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={offen} className="group flaeche-blatt scroll-mt-24 rounded-lg">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight">{titel}</span>
          <span className="t-hilfe mt-0.5 block text-xs">{beschreibung}</span>
        </span>
        {marke && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              marke.ton === "aktion" && "bg-ai/12 text-ai",
              marke.ton === "warnung" && "bg-warning/15 text-[hsl(var(--warning))]",
              marke.ton === "ruhe" && "text-muted-foreground"
            )}
          >
            {marke.text}
          </span>
        )}
        {/* Dreht sich beim Aufklappen - die einzige Bewegung auf der Seite,
            und sie beantwortet eine Handlung des Nutzers. */}
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
      </summary>

      <div className="space-y-4 border-t px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

/**
 * Eine Reihe Werkzeuge innerhalb eines Bereichs.
 *
 * Eigene Ueberschrift, damit die Knoepfe nicht ununterscheidbar an den Inhalt
 * anschliessen: Was man ansieht und was man ausloest, sind zwei verschiedene
 * Dinge.
 */
export function Werkzeugreihe({
  titel = "Werkzeuge",
  children,
}: {
  titel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="eyebrow mb-2">{titel}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}
