import { cn } from "@/lib/utils";

/**
 * Die Pruefleiste – das Instrument, an dem der Reifegrad einer Akte abgelesen
 * wird.
 *
 * Warum kein Fortschrittsbalken: Ein Balken kennt nur "wie weit", eine Akte
 * aber vier verschiedene Zustaende, die unterschiedliches Handeln verlangen.
 * Eine abgelehnte Unterlage ist nicht "weniger fertig" als eine offene – sie
 * ist ein Rueckruf. Deshalb ein Band aus einzelnen Faechern, eines je
 * verlangter Unterlage, jedes mit einer eigenen Marke.
 *
 * Dasselbe Instrument erscheint in drei Groessen: winzig in der Fallliste,
 * mittel auf der Fallseite, gross auf der Kundenseite. Wer es einmal gelesen
 * hat, liest es ueberall.
 */
export type PruefZustand = "offen" | "eingegangen" | "teilweise" | "angenommen" | "abgelehnt";

export interface PruefSegment {
  zustand: PruefZustand;
  /** Fuer die Beschriftung beim Ueberfahren – nicht dekorativ, sondern die Unterlage. */
  name?: string;
}

/*
 * Fuenf Zustaende, fuenf klar unterscheidbare Marken – bewusst nicht fuenf
 * Abstufungen derselben Farbe. Wer die Leiste aus zwei Metern Entfernung
 * ansieht, soll "da ist Rot drin" erkennen, ohne zu zaehlen.
 */
const FLAECHE: Record<PruefZustand, string> = {
  // Leeres Fach: die Rasterlinie selbst, kein Inhalt.
  offen: "bg-border",
  // Liegt vor, noch nicht gewertet: Schraffur in Markentuerkis.
  eingegangen: "fach-schraffur",
  // Teilweise: Ocker – etwas fehlt noch, aber es ist kein Rueckruf.
  teilweise: "bg-warning",
  // Angenommen: volle Tinte. Das ist der Haken.
  angenommen: "bg-success",
  // Abgelehnt: gedaempftes Rot. Verlangt eine Handlung, keine Geduld.
  abgelehnt: "bg-destructive",
};

const HOEHE = {
  xs: "h-1",
  md: "h-2",
  lg: "h-3",
} as const;

const LUECKE = {
  xs: "gap-px",
  md: "gap-0.5",
  lg: "gap-1",
} as const;

/**
 * Ab dieser Zahl an Faechern wird die Leiste zusammengefasst: einzelne Faecher
 * waeren dann duenner als ein Haar und damit nicht mehr lesbar. Stattdessen
 * ein Band aus zusammenhaengenden Abschnitten je Zustand.
 */
const MAX_EINZELFAECHER = 28;

export function Pruefleiste({
  segmente,
  groesse = "md",
  className,
}: {
  segmente: PruefSegment[];
  groesse?: keyof typeof HOEHE;
  className?: string;
}) {
  if (segmente.length === 0) {
    return (
      <div
        role="img"
        aria-label="Noch keine Unterlagen verlangt"
        className={cn("w-full rounded-full bg-muted", HOEHE[groesse], className)}
      />
    );
  }

  const gezaehlt = zaehle(segmente);
  const beschriftung = beschreibe(gezaehlt, segmente.length);

  // Viele Faecher: zu Abschnitten zusammenfassen, Reihenfolge nach Dringlichkeit.
  if (segmente.length > MAX_EINZELFAECHER) {
    const reihenfolge: PruefZustand[] = [
      "angenommen",
      "teilweise",
      "eingegangen",
      "abgelehnt",
      "offen",
    ];
    return (
      <div
        role="img"
        aria-label={beschriftung}
        className={cn("flex w-full overflow-hidden rounded-full", HOEHE[groesse], className)}
      >
        {reihenfolge
          .filter((z) => gezaehlt[z] > 0)
          .map((z) => (
            <div
              key={z}
              className={FLAECHE[z]}
              style={{ width: `${(gezaehlt[z] / segmente.length) * 100}%` }}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={beschriftung}
      className={cn("flex w-full", LUECKE[groesse], HOEHE[groesse], className)}
    >
      {segmente.map((s, i) => (
        <div
          key={i}
          title={s.name}
          className={cn("flex-1 rounded-[2px]", FLAECHE[s.zustand])}
        />
      ))}
    </div>
  );
}

/**
 * Legende – nur dort einsetzen, wo jemand die Leiste zum ersten Mal sieht
 * (Kundenseite). Im taeglichen Gebrauch waere sie Ballast.
 */
export function PruefleisteLegende({ className }: { className?: string }) {
  const eintraege: Array<{ zustand: PruefZustand; text: string }> = [
    { zustand: "angenommen", text: "Angenommen" },
    { zustand: "eingegangen", text: "Eingegangen" },
    { zustand: "abgelehnt", text: "Bitte erneut" },
    { zustand: "offen", text: "Noch offen" },
  ];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {eintraege.map((e) => (
        <li key={e.zustand} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("h-2.5 w-4 rounded-[2px]", FLAECHE[e.zustand])} aria-hidden />
          {e.text}
        </li>
      ))}
    </ul>
  );
}

function zaehle(segmente: PruefSegment[]): Record<PruefZustand, number> {
  const leer: Record<PruefZustand, number> = {
    offen: 0,
    eingegangen: 0,
    teilweise: 0,
    angenommen: 0,
    abgelehnt: 0,
  };
  for (const s of segmente) leer[s.zustand] += 1;
  return leer;
}

/** Was ein Screenreader vorliest – dieselbe Aussage wie das Bild, in Worten. */
function beschreibe(g: Record<PruefZustand, number>, gesamt: number): string {
  const teile = [`${g.angenommen} von ${gesamt} Unterlagen angenommen`];
  if (g.abgelehnt > 0) teile.push(`${g.abgelehnt} abgelehnt`);
  if (g.eingegangen + g.teilweise > 0) teile.push(`${g.eingegangen + g.teilweise} in Prüfung`);
  if (g.offen > 0) teile.push(`${g.offen} noch offen`);
  return teile.join(", ");
}
