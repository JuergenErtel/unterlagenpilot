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

/**
 * Die Marke traegt Farbe - aber nur auf hellem Grund.
 *
 * Auf dem aktiven Reiter (Tinte) waere Ocker auf Dunkelblau unleserlich,
 * deshalb schaltet `[[data-state=active]_&]` dort auf die Vordergrundfarbe der
 * Flaeche um. Die Farbe sagt "was ansteht"; auf dem aktiven Reiter sagt das
 * ohnehin schon der Inhalt darunter.
 */
const MARKE_FARBE: Record<ReiterMarke["ton"], string> = {
  aktion: "text-ai [[data-state=active]_&]:text-primary-foreground/80",
  warnung: "text-[hsl(var(--warning))] [[data-state=active]_&]:text-primary-foreground/80",
  ruhe: "text-muted-foreground [[data-state=active]_&]:text-primary-foreground/70",
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
      {/* Drei echte Schaltflaechen statt der grauen Pille, die die
          Reiterkomponente von Haus aus mitbringt.
          
          Juergen: "man uebersieht die total." Zu Recht - kleine Schrift auf
          hellgrauem Grund, in einer Seite voller hellgrauer Flaechen. Die
          Umschaltung ist aber das Bedienelement, um das sich die halbe
          Fallakte dreht.
          
          Der aktive Reiter traegt deshalb Tinte, nicht eine Schattierung von
          Grau: Auf einen Blick sichtbar, welcher der drei gerade gilt. Die
          beiden anderen liegen zurueckgenommen in der Ablage-Flaeche. */}
      <TabsList className="grid h-auto w-full grid-cols-3 gap-2 bg-transparent p-0">
        {reiter.map((r) => (
          <TabsTrigger
            key={r.wert}
            value={r.wert}
            className={cn(
              "flex h-auto flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-3",
              "border-border/80 bg-[hsl(var(--surface-sunken))] text-muted-foreground",
              "transition-colors hover:border-foreground/25 hover:text-foreground",
              "data-[state=active]:border-primary data-[state=active]:bg-primary",
              "data-[state=active]:text-primary-foreground data-[state=active]:shadow-md",
              "sm:flex-row sm:gap-2.5 sm:px-4 sm:py-3.5"
            )}
          >
            <span className="flex items-center gap-2">
              {r.icon}
              <span className="text-[0.9375rem] font-semibold">{r.titel}</span>
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
