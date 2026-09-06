import { Pruefleiste, type PruefSegment } from "@/components/ui/pruefleiste";

/**
 * Die Beispielakte auf der Landingpage – das Instrument, mit dem in der App
 * gearbeitet wird, nicht ein Werbebild davon.
 *
 * Bewusst ohne Kundennamen und ohne echte Fallnummer: Es soll kein
 * Mensch vorgetaeuscht werden. Die Unterlagen allein erzaehlen, was BaufiDesk
 * tut – und die tuerkisen Marken zeigen, was davon die Maschine beigetragen
 * hat (Tuerkis heisst in dieser App immer "von der KI", nie "gut").
 */
type Zeile = {
  name: string;
  zustand: PruefSegment["zustand"];
  /** Was die KI aus der Unterlage gelesen oder abgeleitet hat. */
  ki?: string;
  /** Warum die Unterlage in diesem Zustand ist – die menschliche Zeile. */
  hinweis?: string;
};

const AKTE: Zeile[] = [
  { name: "Personalausweis", zustand: "angenommen", ki: "Name, Anschrift, gültig bis 2031" },
  { name: "Gehaltsabrechnungen (3)", zustand: "angenommen", ki: "Netto 3.412 €, unbefristet" },
  { name: "Kaufvertragsentwurf", zustand: "angenommen", ki: "Kaufpreis 485.000 €" },
  { name: "Grundbuchauszug", zustand: "angenommen" },
  { name: "Kontoauszüge", zustand: "eingegangen", hinweis: "wird gelesen" },
  { name: "Selbstauskunft", zustand: "abgelehnt", hinweis: "Unterschrift fehlt" },
  { name: "Wohnflächenberechnung", zustand: "offen", hinweis: "aus dem Grundriss berechenbar" },
  { name: "Teilungserklärung", zustand: "offen", ki: "im Kaufvertrag erwähnt, fehlt noch" },
];

const MARKE: Record<PruefSegment["zustand"], { punkt: string; text: string }> = {
  angenommen: { punkt: "bg-success", text: "Angenommen" },
  eingegangen: { punkt: "fach-schraffur", text: "In Prüfung" },
  teilweise: { punkt: "bg-warning", text: "Teilweise" },
  abgelehnt: { punkt: "bg-destructive", text: "Bitte erneut" },
  offen: { punkt: "bg-border", text: "Offen" },
};

export function Beispielakte() {
  const angenommen = AKTE.filter((z) => z.zustand === "angenommen").length;

  return (
    <div className="rounded-lg bg-card p-5 text-card-foreground shadow-[0_24px_60px_-24px_rgb(0_0_0/0.75)] sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="eyebrow">Stand der Unterlagen</p>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">Eigentumswohnung, Kauf, zwei Antragsteller</p>
        </div>
        <p className="display tabular text-2xl leading-none">
          {angenommen}
          <span className="text-sm text-muted-foreground">/{AKTE.length}</span>
        </p>
      </div>

      <Pruefleiste
        segmente={AKTE.map((z) => ({ zustand: z.zustand, name: z.name }))}
        groesse="lg"
        className="mt-4"
      />

      <ul className="mt-4 divide-y">
        {AKTE.map((z) => (
          <li key={z.name} className="flex items-start justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[0.8438rem] font-medium">{z.name}</p>
              {z.ki ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ai">
                  <span
                    aria-hidden
                    className="inline-block rounded-[3px] bg-ai px-1 font-display text-[0.5625rem] font-semibold uppercase leading-4 tracking-wider text-ai-foreground"
                  >
                    KI
                  </span>
                  {z.ki}
                </p>
              ) : z.hinweis ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{z.hinweis}</p>
              ) : null}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-[2px] ${MARKE[z.zustand].punkt}`} aria-hidden />
              {MARKE[z.zustand].text}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-md border border-primary/15 bg-[hsl(var(--surface-sunken))] p-3.5">
        <p className="eyebrow">Nächster Schritt</p>
        <p className="mt-1 text-[0.8438rem] leading-snug">
          Nachforderung an die Kunden: Selbstauskunft unterschreiben, Teilungserklärung nachreichen.
          Der Text ist vorbereitet.
        </p>
        <p className="mt-2.5 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
          Nachforderung freigeben
        </p>
      </div>
    </div>
  );
}
