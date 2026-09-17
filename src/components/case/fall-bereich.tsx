/**
 * Bausteine innerhalb eines Fall-Bereichs (siehe fall-reiter.tsx).
 */

/**
 * Eine Reihe Werkzeuge innerhalb eines Bereichs.
 *
 * Eigene Ueberschrift, damit die Knoepfe nicht ununterscheidbar an den Inhalt
 * anschliessen: Was man ansieht und was man ausloest, sind zwei verschiedene
 * Dinge. Zweispaltig ab sm - untereinander ergaeben sieben Werkzeuge wieder
 * die Knopfleiste, die dieser Umbau abgeschafft hat.
 */
export function Werkzeugreihe({
  titel = "Werkzeuge",
  children,
}: {
  titel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="eyebrow mb-2">{titel}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}
