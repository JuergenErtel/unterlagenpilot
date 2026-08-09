/**
 * Schluessel der Checklistenposition, die aus einem freigegebenen Befund
 * entsteht. Das Praefix haelt die Herkunft erkennbar – sonst ist spaeter nicht
 * mehr unterscheidbar, was aus einem Template und was aus dem Detektiv stammt.
 *
 * Bewusst eine eigene Datei: `src/lib/actions/detektiv.ts` traegt "use server"
 * und darf ausschliesslich async Funktionen exportieren.
 */
export function checklistKeyFor(findingId: string): string {
  return `detektiv.${findingId}`;
}
