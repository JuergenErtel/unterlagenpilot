"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CalendarClock, MoreHorizontal, PhoneCall, RotateCcw } from "lucide-react";
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
  /**
   * Machbarkeits-Ampel. null = bewusst keine Anzeige (verloren/abgeschlossen);
   * die Farbe "grau" meint dagegen eine Datenluecke.
   *
   * Bewusst als schlichtes Objekt statt als Import des Ampel-Typs: Diese Datei
   * ist eine Client-Komponente und soll keine Server-Module ziehen.
   */
  ampel: { farbe: string; text: string; grund: string } | null;
  erstgespraechOffen: boolean;
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

/** Ampelfarben aus dem vorhandenen Ton-System, keine neuen Werte. */
const AMPEL_PUNKT: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-destructive",
  grau: "bg-muted-foreground/40",
};

/**
 * Farbe je Phase – eine Reise von Tinte über Markentürkis zu Grün.
 *
 * Bewusst EIN Verlauf statt sieben bunter Töne: Gelb und Rot bleiben für die
 * Machbarkeits-Ampel reserviert, die auf denselben Karten sitzt. Zwei
 * Farbsprachen nebeneinander würden beide unlesbar machen. Grün trägt nur die
 * letzte Spalte – dort bedeutet es dasselbe wie überall in der App: fertig.
 *
 * Die Klassen stehen ausgeschrieben, weil Tailwind zusammengesetzte
 * Klassennamen nicht findet.
 */
const PHASEN_FARBE: Record<string, { kante: string; flaeche: string; zahl: string }> = {
  neu: { kante: "bg-muted-foreground/30", flaeche: "bg-muted/40", zahl: "text-muted-foreground" },
  anfrage_erstellt: { kante: "bg-primary/30", flaeche: "bg-primary/[0.04]", zahl: "text-muted-foreground" },
  selbstauskunft_laeuft: { kante: "bg-primary/50", flaeche: "bg-primary/[0.07]", zahl: "text-muted-foreground" },
  finanzierungsvorschlag: { kante: "bg-ai/40", flaeche: "bg-ai/[0.06]", zahl: "text-ai" },
  kreditpruefung_eingereicht: { kante: "bg-ai/70", flaeche: "bg-ai/[0.10]", zahl: "text-ai" },
  zusage: { kante: "bg-success/50", flaeche: "bg-success/[0.07]", zahl: "text-success" },
  abgeschlossen: { kante: "bg-success/80", flaeche: "bg-success/[0.12]", zahl: "text-success" },
  verloren: { kante: "bg-destructive/40", flaeche: "bg-destructive/[0.05]", zahl: "text-muted-foreground" },
};

const PHASE_STANDARD = { kante: "bg-muted-foreground/30", flaeche: "bg-muted/40", zahl: "text-muted-foreground" };

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
        {[...spalten, ...(zeigeVerlorene ? [verloren] : [])].map((s) => {
          const farbe = PHASEN_FARBE[s.phase] ?? PHASE_STANDARD;
          return (
          <section
            key={s.phase}
            onDragOver={(e) => {
              if (s.phase !== "verloren") e.preventDefault();
            }}
            onDrop={() => {
              if (gezogen && s.phase !== "verloren") verschieben(gezogen, s.phase);
              setGezogen(null);
            }}
            className={`w-64 shrink-0 overflow-hidden rounded-lg p-2 pt-0 max-md:w-full ${farbe.flaeche}`}
          >
            {/* Farbkante als Registerreiter der Spalte – die Farbe steht oben
                und stört die Karten darunter nicht. */}
            <div className={`-mx-2 mb-2 h-1 ${farbe.kante}`} aria-hidden />
            <header className="px-1 pb-2">
              <p className="text-sm font-semibold">{s.titel}</p>
              <p className="text-xs text-muted-foreground">
                <span className={`font-medium ${farbe.zahl}`}>
                  {s.anzahl} {s.anzahl === 1 ? "Fall" : "Fälle"}
                </span>
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

                  {/*
                    Erste Aufgabe nach dem Leadeingang (14.08.2026): Der frische
                    Lead gehoert ans Telefon. Der Hinweis ist deshalb ein
                    Knopf mit Ziel, kein blosses Abzeichen – er ist die Handlung,
                    nicht ihre Beschreibung. Er sitzt ueber der Ampel, weil er
                    zuerst dran ist; die Markenfarbe grenzt ihn von der
                    Ampelsprache (gruen/gelb/rot) ab, die daneben weiterlaeuft.
                  */}
                  {k.erstgespraechOffen && (
                    <Link
                      href={`/cases/${k.caseId}/erstgespraech`}
                      className="mt-1.5 flex items-center gap-1.5 rounded border border-primary/40 bg-primary/[0.06] px-2 py-1 text-xs font-medium text-primary hover:bg-primary/[0.12]"
                    >
                      <PhoneCall className="h-3 w-3 shrink-0" />
                      Erstgespräch führen
                    </Link>
                  )}

                  {k.ampel && (
                    <p
                      className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                      title={k.ampel.grund}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                          AMPEL_PUNKT[k.ampel.farbe] ?? "bg-muted-foreground/40"
                        }`}
                      />
                      {k.ampel.text}
                    </p>
                  )}

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
          );
        })}
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
