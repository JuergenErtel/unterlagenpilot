import { cn } from "@/lib/utils";

/**
 * Der Trichter - das Zeichen des Unterlagensortierers.
 *
 * Selbst gezeichnet statt geliehen: Lucide kennt in der hier verwendeten
 * Fassung (0.468) kein `Funnel`. `Filter` hat zwar dieselbe Silhouette, wird
 * in einer Oberflaeche aber als "Liste filtern" gelesen - und das ist das
 * Gegenteil dessen, was hier passiert. Fuer ein Produktzeichen ist das zu
 * ungefaehr.
 *
 * Bewusst mit Strichen statt Flaeche und mit denselben Masszahlen wie die
 * Lucide-Symbole (24er Raster, Strichstaerke 2, runde Enden): Es steht in der
 * Navigation direkt neben ihnen und darf dort nicht als Fremdkoerper wirken.
 *
 * Die drei Punkte unter der Tuelle sind die sortierten Seiten, die
 * herauskommen - ohne sie sieht der Trichter aus wie ein Filter.
 */
export function TrichterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // h-4 w-4 als Vorgabe, damit der Aufrufer sie wie bei Lucide
      // ueberschreiben kann, ohne sie jedes Mal setzen zu muessen.
      className={cn("h-4 w-4", className)}
      aria-hidden
    >
      {/* Der Trichter: breite Öffnung oben, Tülle unten. */}
      <path d="M3 4h18l-7 8v6l-4 2v-8Z" />
      {/* Was unten herauskommt - die geordneten Seiten. */}
      <path d="M9 21h6" />
    </svg>
  );
}
