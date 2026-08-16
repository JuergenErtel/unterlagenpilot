"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { speichereAntwort, type SchrittState } from "@/lib/actions/self-disclosure";
import { SchrittFelder, istEinzelneAuswahl } from "@/components/self-disclosure/schritt-felder";
import type { Feld } from "@/lib/self-disclosure/types";

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

/**
 * Welche Person(en) SchrittFelder bekommt.
 *
 * Exportiert, damit ein Test bewacht, dass diese Liste zu dem Präfix passt,
 * den `defaults` (Schrittseite) und `schrittSchema` (Server-Aktion) für
 * denselben Schritt erwarten: `schritt.personen` fehlt bei Schritten ohne
 * Personenbezug (EIN Aufruf ohne Präfix); bei `personenSpalten` UND nur einem
 * Antragsteller ist es `[1]` – auch dann EIN Aufruf, aber MIT Präfix "p1.".
 * Nur bei zwei Spalten wird wirklich zweimal gerendert. Wer hier eine Spalte
 * ohne Person rendert, obwohl der Schritt personenSpalten trägt, erzeugt
 * Formularnamen ohne Präfix – die Antwort verschwindet dann lautlos hinter
 * `schrittSchema.strip()` (siehe schema.ts).
 */
export function spaltenPersonen(personen?: (1 | 2)[]): Array<1 | 2 | undefined> {
  return (personen?.length ?? 0) > 1 ? personen! : [personen?.[0]];
}

/**
 * Eine Spalte des Schritts: die Person und die Felder, die GENAU SIE sieht.
 *
 * Die Feldliste haengt seit dem Katalogschnitt an der Spalte, nicht mehr am
 * Schritt: Auf "Was machen Sie beruflich?" bekommt der angestellte Partner die
 * Arbeitgeber-, die selbstaendige Partnerin die Firmenfragen. Eine gemeinsame
 * Liste fuer beide Spalten fragte eine von beiden nach dem Falschen – und ihre
 * Antworten landeten als falsche `employment`-Werte im Fall.
 */
export interface Spalte {
  person?: 1 | 2;
  felder: Feld[];
}

export function StepForm({
  token,
  schrittId,
  frage,
  hinweis,
  spalten,
  defaults,
  vornamen,
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

      {mehrspaltig ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {spalten.map((spalte) => (
            <div key={spalte.person} className="space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground">
                {spaltenUeberschrift(spalte.person as 1 | 2, vornamen?.[spalte.person as 1 | 2])}
              </h2>
              <SchrittFelder
                schrittId={schrittId}
                person={spalte.person}
                mehrspaltig
                felder={spalte.felder}
                defaults={defaults}
                fieldErrors={state.fieldErrors}
              />
            </div>
          ))}
        </div>
      ) : (
        <SchrittFelder
          schrittId={schrittId}
          person={spalten[0]?.person}
          felder={spalten[0]?.felder ?? []}
          defaults={defaults}
          fieldErrors={state.fieldErrors}
        />
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {!einzelneAuswahl && <WeiterButton etwasEingetragen={eingetragen} />}
    </form>
  );
}
