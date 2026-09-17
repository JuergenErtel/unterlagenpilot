"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Die drei Bereiche der Fallakte, nebeneinander: Dokumente, Beratung,
 * Einreichung.
 *
 * Vorher hatte die Akte vier Reiter UND eine Seitenspalte mit vierzehn
 * Werkzeugen. Wer etwas suchte, musste erst wissen, ob es ein Reiter oder ein
 * Werkzeug ist. Jetzt gibt es eine Frage - womit arbeite ich gerade? - und
 * genau drei Antworten.
 *
 * Nebeneinander und nicht untereinander: Drei Bereiche muessen auf einen Blick
 * vergleichbar sein. Untereinander liest man sie nacheinander und sieht die
 * Marken ("3 fehlen") nicht im Verhaeltnis zueinander.
 */
export interface ReiterMarke {
  text: string;
  ton: "aktion" | "warnung" | "ruhe";
}

export interface ReiterDefinition {
  wert: string;
  titel: string;
  /**
   * Das FERTIGE Symbol, nicht die Komponente.
   *
   * Teuer gelernt am 17.09.2026: Diese Datei ist eine Client-Komponente, die
   * Fallakte ist eine Server-Komponente. Eine Komponente ist eine Funktion,
   * und Funktionen lassen sich ueber diese Grenze nicht uebergeben - die
   * Fallakte antwortete mit "Etwas ist schiefgelaufen", ohne dass Typpruefung
   * oder Build etwas gemerkt haetten. Ein fertig gerendertes Element geht.
   */
  icon: React.ReactNode;
  /** Was hier ansteht. Null, wenn nichts - dann bleibt die Zeile leer. */
  marke: ReiterMarke | null;
}

const MARKE_FARBE: Record<ReiterMarke["ton"], string> = {
  aktion: "text-ai",
  warnung: "text-[hsl(var(--warning))]",
  ruhe: "text-muted-foreground",
};

export function FallReiter({
  reiter,
  tabParam,
  children,
}: {
  reiter: ReiterDefinition[];
  /** Aus `?tab=` - so bleiben die alten Adressen der Roadmap gueltig. */
  tabParam?: string;
  children: React.ReactNode;
}) {
  const [wert, setWert] = useState(tabParam ?? reiter[0]?.wert ?? "");

  useEffect(() => {
    if (tabParam && tabParam !== wert) setWert(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // Sprung zum Anker NACH dem Wechsel: Das Ziel (z. B. das Upload-Formular)
  // ist erst im DOM, wenn sein Bereich aktiv ist - ein nativer Ankersprung
  // liefe vorher ins Leere. Kommt vom Unterlagen-Arbeitsplatz und von der
  // Roadmap, also von den Stellen, an denen jemand gezielt hierher geschickt
  // wird.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wert]);

  return (
    <Tabs value={wert} onValueChange={setWert}>
      {/* Gleich breite Flaechen: Die drei sind gleichrangig, und eine breitere
          Flaeche laese den Bereich wichtiger aussehen als die anderen. */}
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
        {reiter.map((r) => (
            <TabsTrigger
              key={r.wert}
              value={r.wert}
              className="flex h-auto flex-col items-center gap-0.5 px-2 py-2.5 sm:flex-row sm:items-center sm:justify-center sm:gap-2 sm:px-4 sm:py-3"
            >
              <span className="flex items-center gap-2">
                {r.icon}
                <span className="text-sm font-semibold">{r.titel}</span>
              </span>
              {r.marke && (
                <span className={cn("text-xs font-medium", MARKE_FARBE[r.marke.ton])}>
                  {r.marke.text}
                </span>
              )}
            </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
