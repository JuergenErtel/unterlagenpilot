"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  einladungErneutSendenAction,
  einladungZurueckziehenAction,
  type EinladungState,
} from "@/lib/actions/invite-actions";

export interface OffeneEinladung {
  id: string;
  name: string;
  email: string;
  /** ISO-Zeichenkette – Date-Objekte ueberleben die Server-Client-Grenze nicht sauber. */
  eingeladenAm: string;
}

/**
 * Noch nicht angenommene Einladungen mit den beiden einzigen Auswegen:
 * erneut senden und zurueckziehen. Ohne sie verbrennt jede misslungene
 * Einladung dauerhaft einen Tarifplatz – deaktivieren laesst sich ein Nutzer
 * nirgends, und erneut einladen scheitert an der vergebenen Adresse.
 */
export function OffeneEinladungen({ einladungen }: { einladungen: OffeneEinladung[] }) {
  if (einladungen.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine offenen Einladungen.</p>;
  }
  return (
    <ul className="space-y-3">
      {einladungen.map((e) => (
        <EinladungZeile key={e.id} einladung={e} />
      ))}
    </ul>
  );
}

function EinladungZeile({ einladung }: { einladung: OffeneEinladung }) {
  const [erneut, erneutAction, erneutLaeuft] = useActionState<EinladungState, FormData>(
    einladungErneutSendenAction,
    {}
  );
  const [widerruf, widerrufAction, widerrufLaeuft] = useActionState<EinladungState, FormData>(
    einladungZurueckziehenAction,
    {}
  );
  const meldung = erneut.error ?? widerruf.error ?? (erneut.ok ? "Neue Einladung verschickt." : null);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-sm">
      <span className="font-medium">{einladung.name}</span>
      <span className="text-muted-foreground">{einladung.email}</span>
      <span className="text-xs text-muted-foreground">
        eingeladen am {new Date(einladung.eingeladenAm).toLocaleDateString("de-DE")}
      </span>
      <div className="ml-auto flex gap-2">
        <form action={erneutAction}>
          <input type="hidden" name="userId" value={einladung.id} />
          <Button type="submit" variant="outline" size="sm" disabled={erneutLaeuft}>
            {erneutLaeuft ? "Wird gesendet …" : "Erneut senden"}
          </Button>
        </form>
        <form action={widerrufAction}>
          <input type="hidden" name="userId" value={einladung.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={widerrufLaeuft}>
            {widerrufLaeuft ? "Wird entfernt …" : "Zurückziehen"}
          </Button>
        </form>
      </div>
      {meldung ? (
        <p
          className={
            erneut.error || widerruf.error
              ? "w-full text-xs text-destructive"
              : "w-full text-xs text-muted-foreground"
          }
          role={erneut.error || widerruf.error ? "alert" : "status"}
        >
          {meldung}
        </p>
      ) : null}
    </li>
  );
}
