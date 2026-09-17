import { TrichterIcon } from "@/components/ui/trichter-icon";

/**
 * Der Sortierer auf der Landingpage – die Arbeit selbst, nicht ein Werbebild
 * davon. Dieselbe Haltung wie bei der Beispielakte: Es wird gezeigt, was auf
 * dem Bildschirm passiert, nicht behauptet, was die Software könne.
 *
 * Eine Szene, ein Rahmen: links der Stapel, wie ihn der Kunde schickt – quer
 * fotografiert, kryptisch benannt, in beliebiger Reihenfolge. Rechts, was
 * zurückkommt.
 *
 * Die Boldness steckt bewusst an EINER Stelle: in der offenen Rückfrage unten
 * rechts. Dass eine Maschine Dokumente sortiert, behauptet jeder; dass sie
 * zugibt, wenn sie unsicher ist, und vorher fragt, ist der Unterschied – und
 * genau das, was ein Vermittler wissen will, bevor er ihr seine Kundenpost
 * anvertraut. Ohne diese Zeile wäre das Bild austauschbar.
 *
 * Türkis heisst in diesem Haus immer "von der Maschine", nie "gut" – deshalb
 * tragen nur die erkannten Seitenzahlen und die Rückfrage diese Farbe.
 */

/** Wie der Stapel hereinkommt: Dateinamen, die nichts verraten. */
const HEREIN = ["IMG_4471", "IMG_4472", "IMG_4473", "IMG_4474", "IMG_4489", "Scan_02"];

/** Was herauskommt. `seiten` ist das, was die Maschine zusammengelegt hat. */
const HERAUS: Array<{ name: string; seiten: number }> = [
  { name: "Kaufvertragsentwurf", seiten: 4 },
  { name: "Gehaltsabrechnungen", seiten: 3 },
  { name: "Personalausweis", seiten: 2 },
  { name: "Grundriss", seiten: 1 },
];

export function SortiererBeispiel() {
  const hereinGesamt = 27;
  const seitenGesamt = HERAUS.reduce((s, d) => s + d.seiten, 0);

  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-[0_24px_60px_-32px_rgb(0_0_0/0.45)]">
      <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <p className="eyebrow">Ein Stapel, wie er ankommt</p>
        <p className="tabular text-[0.8125rem] text-muted-foreground">
          {hereinGesamt} Dateien → {HERAUS.length} Dokumente
        </p>
      </div>

      <div className="grid md:grid-cols-[1fr_auto_1.15fr]">
        {/* ---------------------------- hinein ---------------------------- */}
        <div className="px-5 py-5 sm:px-6">
          <p className="text-[0.8125rem] font-medium">Hineingeworfen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fotos vom Handy, quer und durcheinander. Kein Kunde angelegt, nichts benannt.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {HEREIN.map((name, i) => (
              <div
                key={name}
                // Leichte, ungleiche Neigung: Ein sauber ausgerichtetes Raster
                // waere schon sortiert - und damit eine Luege ueber den Zustand,
                // in dem solche Stapel wirklich ankommen.
                style={{ transform: `rotate(${[-2.5, 1.5, -1, 2, -1.5, 0.5][i]}deg)` }}
                className="flex h-[4.5rem] w-[3.25rem] flex-col justify-end rounded-[3px] border bg-[hsl(var(--surface-sunken))] p-1"
              >
                <span className="truncate font-mono text-[0.5rem] leading-tight text-muted-foreground">
                  {name}
                </span>
              </div>
            ))}
            <div className="flex h-[4.5rem] w-[3.25rem] items-center justify-center rounded-[3px] border border-dashed text-[0.6875rem] text-muted-foreground">
              +{hereinGesamt - HEREIN.length}
            </div>
          </div>
        </div>

        {/* --------------------------- der Trichter -------------------------- */}
        <div className="flex items-center justify-center border-y px-5 py-4 md:border-x md:border-y-0 md:px-6">
          <TrichterIcon className="h-7 w-7 text-ai md:h-9 md:w-9" />
        </div>

        {/* ---------------------------- heraus ---------------------------- */}
        <div className="px-5 py-5 sm:px-6">
          <p className="text-[0.8125rem] font-medium">Zurückbekommen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Benannte PDFs, auf A4 gerade gerückt. {seitenGesamt} Seiten, zu {HERAUS.length}{" "}
            Dokumenten zusammengelegt.
          </p>

          <ul className="mt-4 divide-y">
            {HERAUS.map((d) => (
              <li key={d.name} className="flex items-baseline justify-between gap-3 py-2">
                <span className="truncate text-[0.8438rem]">{d.name}.pdf</span>
                <span className="tabular shrink-0 text-xs text-ai">
                  {d.seiten} {d.seiten === 1 ? "Seite" : "Seiten"}
                </span>
              </li>
            ))}
          </ul>

          {/* Die eine Stelle, an der dieses Bild nicht austauschbar ist. */}
          <div className="mt-4 rounded-md border border-ai/30 bg-ai/[0.06] p-3">
            <p className="text-[0.8125rem] font-medium">Eine Seite bleibt unklar</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              „IMG_4489 könnte die fünfte Seite des Kaufvertrags sein – oder ein eigenes
              Dokument. Was davon?“
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-hidden>
              <span className="rounded border bg-card px-2 py-1 text-[0.6875rem]">
                Zum Kaufvertrag
              </span>
              <span className="rounded border bg-card px-2 py-1 text-[0.6875rem]">
                Eigenes Dokument
              </span>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Zugeordnet wird erst nach Ihrer Antwort.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
