"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GespraechsFeld } from "@/components/erstgespraech/feld";
import type { MaskenAbschnitt } from "@/lib/erstgespraech/maske";

/**
 * Ein Abschnitt des Gespraechs.
 *
 * Eingeklappt, sobald alle angebotsrelevanten Angaben darin stehen – das ist
 * kein Abschluss, sondern eine Wegbeschreibung: Der Vermittler soll auf einen
 * Blick sehen, wo noch etwas zu holen ist. Aufklappen geht immer, auch bei
 * "vollständig". Kein Sperrverhalten: Die Zahl der offenen Angaben steht dran,
 * mehr tut sie nicht.
 *
 * Der Auf-/Zu-Zustand liegt bewusst IM Browser und wird nur beim ersten
 * Rendern aus dem Fall abgeleitet. Jedes gespeicherte Feld laesst die Seite neu
 * rechnen – waere "offen" eine Servereigenschaft, klappte der Abschnitt dem
 * Vermittler mitten im Tippen vor der Nase zu, sobald die letzte Angabe darin
 * steht.
 */
export function GespraechsAbschnitt({
  caseId,
  abschnitt,
  gesperrt = false,
}: {
  caseId: string;
  abschnitt: MaskenAbschnitt;
  gesperrt?: boolean;
}) {
  const offen = abschnitt.relevant - abschnitt.gefuellt;
  const vollstaendig = abschnitt.relevant > 0 && offen === 0;
  const [aufgeklappt, setAufgeklappt] = useState(!vollstaendig);

  return (
    <Card>
      <details
        open={aufgeklappt}
        onToggle={(e) => setAufgeklappt(e.currentTarget.open)}
        className="group"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <h2 className="display text-[0.95rem] leading-none">{abschnitt.titel}</h2>
          <div className="flex items-center gap-3">
            {vollstaendig ? (
              <Badge variant="success">vollständig</Badge>
            ) : offen > 0 ? (
              <span className="text-xs text-muted-foreground">
                {offen} {offen === 1 ? "Angabe" : "Angaben"} offen
              </span>
            ) : null}
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          </div>
        </summary>
        <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2">
          {abschnitt.felder.map((feld) => (
            <GespraechsFeld key={feld.schluessel} caseId={caseId} feld={feld} gesperrt={gesperrt} />
          ))}
        </div>
      </details>
    </Card>
  );
}
