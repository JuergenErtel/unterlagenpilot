"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { speichereAntwort, type SchrittState } from "@/lib/actions/self-disclosure";
import { SchrittFelder, istEinzelneAuswahl } from "@/components/self-disclosure/schritt-felder";
// `Spalte`, `spaltenPersonen` und `personenSchluessel` liegen in `spalten.ts`,
// nicht hier: Diese Datei traegt "use client", und die Schrittseite (eine
// Server-Komponente) ruft `spaltenPersonen` auf. Next ersetzt jedes
// Client-Modul im Server-Graph durch einen Proxy – der Aufruf warf bei jedem
// echten Request ("Attempted to call spaltenPersonen() from the server").
import { zeigeSpaltenUeberschrift, type Spalte } from "@/lib/self-disclosure/spalten";

/**
 * Der Knopf sagt, was passiert: Leerlassen ist erlaubt, soll aber sichtbar
 * sein. Deshalb „Überspringen" statt „Weiter", solange nichts eingetragen ist.
 */
function WeiterButton({ etwasEingetragen }: { etwasEingetragen: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : etwasEingetragen ? "Weiter" : "Überspringen"}
    </Button>
  );
}

/**
 * Überschrift einer Spalte: der Vorname, sobald er bekannt ist – sonst „Sie"
 * für die erste, „Mitantragsteller/in" für die zweite Spalte.
 */
function spaltenUeberschrift(person: 1 | 2, vorname?: string): string {
  if (vorname) return vorname;
  return person === 1 ? "Sie" : "Mitantragsteller/in";
}

export function StepForm({
  token,
  schrittId,
  frage,
  hinweis,
  spalten,
  defaults,
  vornamen,
  zweiAntragsteller,
}: {
  token: string;
  schrittId: string;
  frage: string;
  hinweis?: string;
  /** Aus `spaltenPersonen` gebaut – eine Spalte, oder zwei nebeneinander. */
  spalten: Spalte[];
  defaults: Record<string, string>;
  /** Bereits bekannte Vornamen je Person, für die Spaltenüberschrift. */
  vornamen?: Partial<Record<1 | 2, string>>;
  /**
   * Hat der Haushalt zwei Antragsteller? Entscheidet zusammen mit der
   * Spaltenzahl über die Überschrift – eine EINZELNE Spalte kann dem zweiten
   * Antragsteller gehören (siehe `zeigeSpaltenUeberschrift`).
   */
  zweiAntragsteller?: boolean;
}) {
  const [state, action] = useActionState<SchrittState, FormData>(
    async (_prev, fd) => (await speichereAntwort(token, schrittId, fd)) ?? {},
    {}
  );
  const [eingetragen, setEingetragen] = useState(
    Object.values(defaults).some((v) => v !== "")
  );

  const mehrspaltig = spalten.length > 1;
  // Eine einzelne Auswahl bekommt die großen Kacheln von FinLink und schickt
  // direkt ab – ein Klick, ein Schritt weiter. Bei zwei Spalten nicht (siehe
  // schritt-felder.tsx).
  const einzelneAuswahl = istEinzelneAuswahl(spalten[0]?.felder ?? [], mehrspaltig);

  return (
    <form
      action={action}
      className="space-y-6"
      onChange={(e) => {
        const werte = Array.from(new FormData(e.currentTarget).values());
        setEingetragen(werte.some((v) => String(v).trim() !== ""));
      }}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{frage}</h1>
        {hinweis && <p className="text-sm text-muted-foreground">{hinweis}</p>}
      </div>

      <div className={mehrspaltig ? "grid gap-6 sm:grid-cols-2" : undefined}>
        {spalten.map((spalte) => (
          <div key={spalte.person ?? "ohne"} className="space-y-4">
            {/* Auch ueber einer EINZELNEN Spalte, wenn sie einer Person eines
                Paares gehoert: Sonst traegt die Rentnerin ihre Angaben in die
                stumme Spalte ihres angestellten Partners ein. */}
            {zeigeSpaltenUeberschrift(spalten.length, spalte.person, !!zweiAntragsteller) && (
              <h2 className="text-sm font-medium text-muted-foreground">
                {spaltenUeberschrift(spalte.person as 1 | 2, vornamen?.[spalte.person as 1 | 2])}
              </h2>
            )}
            <SchrittFelder
              schrittId={schrittId}
              person={spalte.person}
              mehrspaltig={mehrspaltig}
              felder={spalte.felder}
              defaults={defaults}
              fieldErrors={state.fieldErrors}
            />
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {!einzelneAuswahl && <WeiterButton etwasEingetragen={eingetragen} />}
    </form>
  );
}
