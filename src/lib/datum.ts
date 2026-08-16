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

/**
 * Der Kalendertag eines Zeitpunkts in Berliner Zeit, als `JJJJ-MM-TT`.
 *
 * `en-CA` liefert genau dieses Format – die Alternative wäre, aus den Teilen
 * einer `formatToParts`-Liste selbst eine Zeichenkette zu bauen.
 *
 * Gebraucht überall dort, wo „heute", „überfällig" oder „diese Woche"
 * entschieden wird. Die naheliegende Rechnung über `getTime()` und 86400000
 * ist dafür falsch: Der Server läuft in UTC, und eine Frist, die am 16.08. um
 * 01:00 Berliner Zeit gesetzt wurde, liegt in UTC noch am 15.08. Sie wäre
 * einen Tag zu früh überfällig – jede Nacht zwischen 0 und 2 Uhr, und im
 * Sommer eine Stunde länger.
 */
const TAG_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Berlin",
});

export function berlinerTag(wert: Date): string {
  return TAG_FORMAT.format(wert);
}

/**
 * Ganze Kalendertage zwischen zwei Zeitpunkten, in Berliner Zeit gezählt:
 * positiv, wenn `a` später liegt als `b`.
 *
 * Gerechnet wird über zwei künstliche UTC-Mitternachten der jeweiligen
 * Kalendertage. Dadurch fällt die Sommerzeit heraus – zwischen zwei echten
 * Berliner Mitternachten liegen im März 23 und im Oktober 25 Stunden, eine
 * Division durch 24 Stunden zählte dort einen Tag zu wenig bzw. zu viel.
 */
export function tageDifferenz(a: Date, b: Date): number {
  const alsUtc = (d: Date) => Date.parse(`${berlinerTag(d)}T00:00:00Z`);
  return Math.round((alsUtc(a) - alsUtc(b)) / 86_400_000);
}
