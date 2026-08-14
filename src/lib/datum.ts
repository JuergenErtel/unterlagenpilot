/**
 * Datumsanzeige für die Oberfläche – mit fest verdrahteter Zeitzone.
 *
 * Warum das eine eigene Stelle ist: Der Server läuft auf Vercel in UTC, der
 * Browser in Europe/Berlin. Formatiert eine **Client**-Komponente ein Datum
 * ohne `timeZone`, rendern Server und Browser für alles zwischen 0 und 2 Uhr
 * nachts verschiedene Texte – React meldet dann einen Hydration-Mismatch und
 * baut den ganzen Teilbaum neu auf. Genau so entstand BAUFIDESK-D auf
 * /cases/import (39 von 500 echten Leads waren betroffen).
 *
 * Der Pin stand danach an zwei Stellen abgeschrieben herum
 * (finlink-lead-list.tsx, upload-link-manager.tsx) und fehlte an zwei weiteren.
 * Wer in einer Client-Komponente ein Datum zeigt, nimmt deshalb DIESE Funktion.
 */

const FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

/**
 * Formatiert ein Datum als `TT.MM.JJJJ` in Berliner Zeit.
 *
 * Unbrauchbare Eingaben werden zum Gedankenstrich: „Invalid Date" in der
 * Oberfläche ist schlimmer als eine ehrliche Leerstelle – und es wäre erneut
 * ein Text, über den Server und Client streiten könnten.
 */
export function datumDe(wert: string | Date | null | undefined): string {
  if (wert == null) return "—";
  const datum = wert instanceof Date ? wert : new Date(wert);
  if (Number.isNaN(datum.getTime())) return "—";
  return FORMAT.format(datum);
}
