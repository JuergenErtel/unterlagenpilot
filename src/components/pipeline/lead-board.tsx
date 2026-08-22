"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CalendarClock, Landmark, MoreHorizontal, PhoneCall, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";
import { setzePhase, setzeVerloren, hebeVerlustAuf } from "@/lib/actions/lead-phase";
import { KreditpruefungFormular } from "@/components/case/kreditpruefung-formular";
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
  /**
   * Bank und Zahl der fehlenden Konditionen – nur ab der Phase
   * "Kreditpruefung eingereicht", sonst null. Schlichtes Objekt aus demselben
   * Grund wie die Ampel: Diese Datei ist eine Client-Komponente.
   */
  einreichung: { bank: string | null; fehlt: number } | null;
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
 * Die Ampel sitzt als Farbkante an der linken Karten­kante – eine Marke, die
 * man beim Überfliegen der Spalte liest, ohne Text. Der erklärende Satz
 * erscheint nur noch, wenn er etwas MELDET (gelb/rot/Datenlücke): "trägt" auf
 * jeder grünen Karte war die Wiederholung, die alle Karten gleich aussehen ließ.
 */
const AMPEL_KANTE: Record<string, string> = {
  gruen: "border-l-success",
  gelb: "border-l-warning",
  rot: "border-l-destructive",
  grau: "border-l-muted-foreground/40",
};

const AMPEL_TEXT: Record<string, string> = {
  gelb: "text-warning",
  rot: "text-destructive",
  grau: "text-muted-foreground",
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
  selbstauskunft_laeuft: { kante: "bg-primary/50", flaeche: "bg-primary/[0.07]", zahl: "text-muted-foreground" },
  finanzierungsvorschlag: { kante: "bg-ai/40", flaeche: "bg-ai/[0.06]", zahl: "text-ai" },
  kreditpruefung_eingereicht: { kante: "bg-ai/70", flaeche: "bg-ai/[0.10]", zahl: "text-ai" },
  zusage: { kante: "bg-success/50", flaeche: "bg-success/[0.07]", zahl: "text-success" },
  abgeschlossen: { kante: "bg-success/80", flaeche: "bg-success/[0.12]", zahl: "text-success" },
  verloren: { kante: "bg-destructive/40", flaeche: "bg-destructive/[0.05]", zahl: "text-muted-foreground" },
};

const PHASE_STANDARD = { kante: "bg-muted-foreground/30", flaeche: "bg-muted/40", zahl: "text-muted-foreground" };

/**
 * Ein Satz je Phase – als Mauszeiger-Hinweis am Spaltenkopf. Besonders die
 * leeren, schmalen Schienen wirkten sonst wie Deko: Der Hinweis sagt, was in
 * dieser Phase passiert, ohne der Spalte Breite zu kosten.
 */
const PHASEN_HINWEIS: Record<string, string> = {
  neu: "Frisch eingegangene Leads – der erste Anruf entscheidet.",
  selbstauskunft_laeuft: "Der Ball liegt beim Kunden: Anfrage ist raus, er füllt Selbstauskunft und Unterlagen.",
  finanzierungsvorschlag: "Angebot ist beim Kunden – Entscheidung steht aus.",
  kreditpruefung_eingereicht: "Der Fall liegt bei der Bank zur Prüfung.",
  zusage: "Die Bank hat zugesagt – Vertrag und Auszahlung folgen.",
  abgeschlossen: "Finanzierung notariell abgeschlossen – Courtage verdient.",
  verloren: "Nicht zustande gekommen – mit Grund, damit auswertbar bleibt, wo verloren wird.",
};

/** "seit 0 Tagen" ist Maschinensprache – auf der Karte steht "heute". */
function liegezeitText(tage: number): string {
  if (tage === 0) return "heute";
  return tage === 1 ? "seit 1 Tag" : `seit ${tage} Tagen`;
}

/**
 * Das Kanban der Vertriebsphasen. Karten lassen sich ziehen; weil das auf dem
 * Handy und ohne Zeigegerät unzuverlässig ist, hat jede Karte zusätzlich ein
 * Menü mit denselben Zielen.
 *
 * Aufbau seit dem 20.08.2026 nach dem Brett-Modell: Ab md nimmt das Board die
 * restliche Bildschirmhöhe ein, die Spaltenköpfe (Phase, Fallzahl, Summe)
 * stehen fest, und die KARTEN scrollen in ihrer Spalte. Vorher scrollte die
 * ganze Seite – nach zwei Karten war nicht mehr zu sehen, in welcher Phase man
 * gerade liest, und das Mausrad blieb über dem Board hängen. Leere Phasen
 * kollabieren zu schmalen Schienen: Sie bleiben Abwurfziele (beim Ziehen
 * weiten sie sich), verbrauchen aber keine Spaltenbreite mehr, während sich
 * daneben die Karten stapeln. Auf dem Handy bleibt alles untereinander und die
 * Seite scrollt normal.
 */
export function LeadBoard({
  spalten,
  verloren,
  quellen,
}: {
  spalten: BoardSpalteView[];
  verloren: BoardSpalteView;
  /** Zähler je Lead-Quelle, absteigend – wird als Chip-Zeile gezeigt. */
  quellen: Array<{ label: string; anzahl: number }>;
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeVerlorene, setZeigeVerlorene] = useState(false);
  const [verlustFuer, setVerlustFuer] = useState<string | null>(null);
  const [gezogen, setGezogen] = useState<string | null>(null);

  // Landet eine Karte in "Kreditpruefung eingereicht", fragt dasselbe Formular
  // wie in der Fallakte nach Bank und Konditionen. Der Zug selbst geht immer
  // durch – das Formular haelt ihn nicht auf.
  const [erfassenFuer, setErfassenFuer] = useState<string | null>(null);

  const verschieben = (caseId: string, phase: string) =>
    startTransition(async () => {
      await setzePhase(caseId, phase);
      if (phase === "kreditpruefung_eingereicht") setErfassenFuer(caseId);
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {quellen.map((q) => (
            <span key={q.label} className="rounded-full border px-2 py-0.5">
              {q.label === "Unbekannt" ? "Quelle unbekannt" : q.label}{" "}
              <span className="tabular font-medium text-foreground">{q.anzahl}</span>
            </span>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={zeigeVerlorene}
            onChange={(e) => setZeigeVerlorene(e.target.checked)}
          />
          Verlorene anzeigen ({verloren.anzahl})
        </label>
        {pending && <span className="text-xs text-muted-foreground">wird gespeichert …</span>}
      </div>

      {/* Der Schleier am rechten Rand sagt ohne Worte: Da drüben geht es
          weiter. Er liegt über den Spaltenflächen, lässt aber jeden Klick
          durch (pointer-events-none). Die Höhe ist ab md an den Bildschirm
          gebunden (Brett-Modell): Kopfzeile, Kennzahlen und Werkzeugzeile
          darüber sind zusammen ~19 rem hoch; das Minimum fängt kleine
          Fenster ab. */}
      <div className="relative md:h-[calc(100dvh-19.5rem)] md:min-h-[24rem]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-12 bg-gradient-to-l from-background to-transparent md:block"
        />
        {/* Die Scrollleiste ist bewusst IMMER sichtbar (statt macOS-Overlay):
            Mit der Maus ist sie der einzige Griff, um nach rechts zu kommen. */}
        <div className="flex h-full gap-3 overflow-x-auto pb-1 max-md:flex-col max-md:overflow-visible md:snap-x md:snap-proximity md:[scrollbar-width:thin] md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-border md:[&::-webkit-scrollbar-track]:bg-transparent md:[&::-webkit-scrollbar]:h-2">
          {[...spalten, ...(zeigeVerlorene ? [verloren] : [])].map((s) => {
            const farbe = PHASEN_FARBE[s.phase] ?? PHASE_STANDARD;
            const leer = s.karten.length === 0 && s.weitere === 0;
            const ziehbarHierher = gezogen !== null && s.phase !== "verloren";

            // Leere Phase: schmale Schiene mit stehendem Titel. Beim Ziehen
            // weitet sie sich zum Abwurfziel – vorher belegte "0 Fälle" die
            // Breite einer vollen Spalte.
            if (leer && !ziehbarHierher) {
              return (
                <section
                  key={s.phase}
                  onDragOver={(e) => {
                    if (s.phase !== "verloren") e.preventDefault();
                  }}
                  className={`flex shrink-0 flex-col overflow-hidden rounded-lg transition-all md:w-11 md:items-center max-md:w-full ${farbe.flaeche}`}
                >
                  <div className={`h-1 w-full ${farbe.kante}`} aria-hidden />
                  <p
                    title={PHASEN_HINWEIS[s.phase]}
                    className="p-2 text-xs font-medium text-muted-foreground max-md:flex max-md:items-baseline max-md:gap-2 md:mt-1 md:[writing-mode:vertical-rl]"
                  >
                    {s.titel}
                    <span className="max-md:text-muted-foreground/70 md:mt-1.5">0</span>
                  </p>
                </section>
              );
            }

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
                className={`flex w-[17rem] shrink-0 flex-col overflow-hidden rounded-lg transition-all md:snap-start max-md:w-full ${farbe.flaeche} ${
                  leer && ziehbarHierher ? "ring-2 ring-ring/40" : ""
                }`}
              >
                {/* Farbkante als Registerreiter der Spalte – die Farbe steht oben
                    und stört die Karten darunter nicht. */}
                <div className={`h-1 ${farbe.kante}`} aria-hidden />
                {/* Titel und Zahlen untereinander: In einer Zeile schnitt der
                    Platz "Kreditprüfung eingereicht" zu "…eingerei…" ab. */}
                <header className="px-3 pb-1.5 pt-2" title={PHASEN_HINWEIS[s.phase]}>
                  <p className="text-sm font-semibold leading-tight">{s.titel}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={`tabular font-semibold ${farbe.zahl}`}>{s.anzahl}</span>{" "}
                    {s.anzahl === 1 ? "Fall" : "Fälle"}
                    {s.summe > 0 && <span className="tabular"> · {eur(s.summe)}</span>}
                  </p>
                </header>

                {/* Bewusst KEIN overscroll-behavior: "contain" verschluckt die
                    horizontale Trackpad-Geste über einer Karte, bevor sie das
                    Board erreicht – genau die gemeldete Scroll-Sperre. */}
                <div className="min-h-0 flex-1 space-y-2 px-2 pb-2 md:overflow-y-auto">
                  {s.karten.map((k) => (
                    <article
                      key={k.caseId}
                      draggable={s.phase !== "verloren"}
                      onDragStart={() => setGezogen(k.caseId)}
                      onDragEnd={() => setGezogen(null)}
                      className={`rounded-lg border border-l-[3px] bg-background p-2.5 text-sm shadow-sm transition-[box-shadow,opacity] hover:shadow-md ${
                        (k.ampel && AMPEL_KANTE[k.ampel.farbe]) || "border-l-border"
                      } ${gezogen === k.caseId ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Der Name ist das Wichtigste auf der Karte – lieber
                            zwei Zeilen als "Jan Petersen & Svenja Peters…". */}
                        <Link href={`/cases/${k.caseId}`} className="line-clamp-2 min-w-0 break-words font-medium hover:underline">
                          {k.kundenName}
                        </Link>
                        <details className="relative shrink-0">
                          <summary className="cursor-pointer list-none text-muted-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-56 space-y-0.5 rounded-md border bg-background p-1 shadow-md">
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
                        <span className="tabular">{k.volumen != null ? eur(k.volumen) : "—"}</span> ·{" "}
                        {liegezeitText(k.liegezeit)}
                        {/* "· Unbekannt" las sich wie ein Datenfehler – eine
                            unbekannte Quelle sagt schlicht nichts und schweigt. */}
                        {k.quelle !== "Unbekannt" && <> · {k.quelle}</>}
                      </p>

                      {/*
                        Erste Aufgabe nach dem Leadeingang (14.08.2026): Der frische
                        Lead gehoert ans Telefon. Der Hinweis ist deshalb ein
                        Verweis mit Ziel, kein blosses Abzeichen – er ist die
                        Handlung, nicht ihre Beschreibung. Seit dem 20.08. eine
                        stille Textzeile statt eines Kastens: Der Kasten stand auf
                        JEDER frischen Karte und machte die Spalte zur Tapete.
                      */}
                      {k.erstgespraechOffen && (
                        <Link
                          href={`/cases/${k.caseId}/erstgespraech`}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                          Erstgespräch führen
                        </Link>
                      )}

                      {/* Ab der Einreichungsphase gehoert auf die Karte, WOHIN der
                          Fall raus ist. Fehlen die Konditionen, sagt die Karte das
                          und oeffnet dasselbe Formular wie die Fallakte – sonst
                          steht die Spalte voll mit "irgendwo eingereicht". */}
                      {k.einreichung && (
                        <button
                          onClick={() => setErfassenFuer(k.caseId)}
                          className={`mt-1.5 flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs ${
                            k.einreichung.fehlt > 0
                              ? "border-warning/50 bg-warning/[0.08] text-foreground hover:bg-warning/[0.14]"
                              : "border-transparent px-0 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Landmark className="h-3 w-3 shrink-0" />
                          {k.einreichung.bank ?? "Bank offen"}
                          {k.einreichung.fehlt > 0 && (
                            <span className="tabular ml-auto shrink-0">
                              {k.einreichung.fehlt} {k.einreichung.fehlt === 1 ? "Angabe" : "Angaben"} fehlen
                            </span>
                          )}
                        </button>
                      )}

                      {/* Nur Abweichendes wird gesagt: Grün spricht über die
                          Kante, gelb/rot/Datenlücke zusätzlich im Klartext. */}
                      {k.ampel && k.ampel.farbe !== "gruen" && (
                        <p
                          className={`mt-1 text-xs ${AMPEL_TEXT[k.ampel.farbe] ?? "text-muted-foreground"}`}
                          title={k.ampel.grund}
                        >
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
                          className="mt-2 flex w-full items-center justify-between rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
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
      </div>

      {erfassenFuer && (
        <KreditpruefungFormular
          caseId={erfassenFuer}
          offen
          onClose={() => setErfassenFuer(null)}
        />
      )}

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
