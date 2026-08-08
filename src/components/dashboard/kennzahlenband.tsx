import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Das Kennzahlenband – die Lage des Bestands auf einen Blick.
 *
 * Warum kein Kachelraster: Neun gleich grosse Kaesten mit je einer Zahl sehen
 * nach viel aus und sagen wenig; das Auge muss neun Mal neu ansetzen und
 * bekommt keine Ordnung geliefert. Hier stehen dieselben Zahlen als Spalten
 * eines Bogens: drei Abschnitte entlang des Wegs, den eine Akte nimmt –
 * Eingang, Pruefung, Einreichung. Wo etwas offen ist, steht die Zahl in Tinte;
 * eine Null bleibt blass und tritt zurueck.
 *
 * Die Reihenfolge ist die des Arbeitsablaufs, nicht die der Wichtigkeit. Das
 * ist die Aussage: der Bestand bewegt sich von links nach rechts.
 */
export interface Kennzahl {
  label: string;
  wert: number | string;
  href?: string;
  /** Wird gesetzt, wenn die Zahl eine Handlung verlangt statt nur zu berichten. */
  betont?: boolean;
  hinweis?: string;
}

export interface Abschnitt {
  titel: string;
  zeilen: Kennzahl[];
}

export function Kennzahlenband({ abschnitte }: { abschnitte: Abschnitt[] }) {
  return (
    <section className="rounded-lg border bg-card card-elevated">
      <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {abschnitte.map((a) => (
          <div key={a.titel} className="p-5">
            <p className="eyebrow">{a.titel}</p>
            <dl className="mt-3 divide-y">
              {a.zeilen.map((z) => (
                <Zeile key={z.label} zahl={z} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function Zeile({ zahl }: { zahl: Kennzahl }) {
  // Eine Null berichtet nur; alles darueber ist Arbeit und darf Tinte tragen.
  const leer = zahl.wert === 0 || zahl.wert === "0";

  const inhalt = (
    <>
      <dt className="min-w-0 text-[0.8125rem] text-muted-foreground group-hover:text-foreground">
        {zahl.label}
        {zahl.hinweis && (
          <span className="block text-xs text-muted-foreground/80">{zahl.hinweis}</span>
        )}
      </dt>
      <dd
        className={cn(
          "display tabular shrink-0 text-lg leading-none",
          leer ? "text-muted-foreground/45" : zahl.betont ? "text-warning" : "text-foreground"
        )}
      >
        {zahl.wert}
      </dd>
    </>
  );

  const klasse = "group flex items-baseline justify-between gap-4 py-2";

  return zahl.href ? (
    <Link href={zahl.href} className={cn(klasse, "-mx-2 rounded px-2 hover:bg-accent/60")}>
      {inhalt}
    </Link>
  ) : (
    <div className={klasse}>{inhalt}</div>
  );
}
