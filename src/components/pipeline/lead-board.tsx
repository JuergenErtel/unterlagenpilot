"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CalendarClock, MoreHorizontal, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";
import { setzePhase, setzeVerloren, hebeVerlustAuf } from "@/lib/actions/lead-phase";
import { LossDialog } from "@/components/pipeline/loss-dialog";

export interface BoardKarteView {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  volumen: number | null;
  leadPhase: string;
  liegezeit: number;
  wiedervorlage: string | null;
  verlorenGrund: string | null;
  vorschlag: string | null;
  /** Anzeigename der Quelle, z. B. "ImmoScout24". */
  quelle: string;
}

export interface BoardSpalteView {
  phase: string;
  titel: string;
  anzahl: number;
  summe: number;
  karten: BoardKarteView[];
  weitere: number;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/**
 * Das Kanban der Vertriebsphasen. Karten lassen sich ziehen; weil das auf dem
 * Handy und ohne Zeigegerät unzuverlässig ist, hat jede Karte zusätzlich ein
 * Menü mit denselben Zielen.
 */
export function LeadBoard({
  spalten,
  verloren,
}: {
  spalten: BoardSpalteView[];
  verloren: BoardSpalteView;
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeVerlorene, setZeigeVerlorene] = useState(false);
  const [verlustFuer, setVerlustFuer] = useState<string | null>(null);
  const [gezogen, setGezogen] = useState<string | null>(null);

  const verschieben = (caseId: string, phase: string) =>
    startTransition(() => void setzePhase(caseId, phase));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={zeigeVerlorene}
            onChange={(e) => setZeigeVerlorene(e.target.checked)}
          />
          Verlorene anzeigen ({verloren.anzahl})
        </label>
        {pending && <span className="text-xs text-muted-foreground">wird gespeichert …</span>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 max-md:flex-col max-md:overflow-visible">
        {[...spalten, ...(zeigeVerlorene ? [verloren] : [])].map((s) => (
          <section
            key={s.phase}
            onDragOver={(e) => {
              if (s.phase !== "verloren") e.preventDefault();
            }}
            onDrop={() => {
              if (gezogen && s.phase !== "verloren") verschieben(gezogen, s.phase);
              setGezogen(null);
            }}
            className="w-64 shrink-0 rounded-lg bg-muted/40 p-2 max-md:w-full"
          >
            <header className="px-1 pb-2">
              <p className="text-sm font-semibold">{s.titel}</p>
              <p className="text-xs text-muted-foreground">
                {s.anzahl} {s.anzahl === 1 ? "Fall" : "Fälle"}
                {s.summe > 0 && ` · ${eur(s.summe)}`}
              </p>
            </header>

            <div className="space-y-2">
              {s.karten.map((k) => (
                <article
                  key={k.caseId}
                  draggable={s.phase !== "verloren"}
                  onDragStart={() => setGezogen(k.caseId)}
                  className="rounded-md border bg-background p-2.5 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/cases/${k.caseId}`} className="font-medium hover:underline">
                      {k.kundenName}
                    </Link>
                    <details className="relative">
                      <summary className="cursor-pointer list-none text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-56 space-y-0.5 rounded-md border bg-background p-1 shadow-md">
                        {s.phase === "verloren" ? (
                          <button
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              // Rückfrage, weil Grund und Datum dabei verloren gehen.
                              if (!confirm("Verlust aufheben? Grund und Datum gehen dabei verloren.")) return;
                              startTransition(() => void hebeVerlustAuf(k.caseId));
                            }}
                          >
                            <RotateCcw className="h-3 w-3" /> Verlust aufheben
                          </button>
                        ) : (
                          <>
                            {LEAD_PHASES.filter((p) => p !== k.leadPhase).map((p: LeadPhase) => (
                              <button
                                key={p}
                                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                                onClick={() => verschieben(k.caseId, p)}
                              >
                                → {LEAD_PHASE_LABELS[p]}
                              </button>
                            ))}
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-xs text-destructive hover:bg-muted"
                              onClick={() => setVerlustFuer(k.caseId)}
                            >
                              Als verloren markieren
                            </button>
                          </>
                        )}
                      </div>
                    </details>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {k.volumen != null ? eur(k.volumen) : "—"} · seit {k.liegezeit}{" "}
                    {k.liegezeit === 1 ? "Tag" : "Tagen"}
                  </p>
                  <p className="text-xs text-muted-foreground">{k.quelle}</p>

                  {k.wiedervorlage && (
                    <Badge variant="neutral" className="mt-1 gap-1">
                      <CalendarClock className="h-3 w-3" /> WV {k.wiedervorlage}
                    </Badge>
                  )}
                  {k.verlorenGrund && (
                    <p className="mt-1 text-xs text-muted-foreground">{k.verlorenGrund}</p>
                  )}

                  {k.vorschlag && (
                    <button
                      onClick={() => verschieben(k.caseId, k.vorschlag!)}
                      className="mt-2 flex w-full items-center justify-between rounded border border-dashed px-2 py-1 text-xs hover:bg-muted"
                    >
                      <span>→ {LEAD_PHASE_LABELS[k.vorschlag as LeadPhase]}?</span>
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </article>
              ))}

              {s.weitere > 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {s.weitere} weitere – in der Fallliste sichtbar
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <LossDialog
        offen={verlustFuer !== null}
        onAbbrechen={() => setVerlustFuer(null)}
        onBestaetigen={(grund, notiz) => {
          const id = verlustFuer!;
          setVerlustFuer(null);
          startTransition(() => void setzeVerloren(id, grund, notiz));
        }}
      />
    </div>
  );
}
