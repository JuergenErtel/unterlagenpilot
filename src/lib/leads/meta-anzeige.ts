/**
 * Leads aus AdPilot-Kampagnen (Meta-Anzeigen auf baufivergleicher.de).
 *
 * Sie werden in Fallakte und Dashboard neongruen markiert, damit Juergen den
 * Rueckfluss seiner eigenen Kampagnen auf einen Blick sieht. Erkannt werden sie
 * am lesbaren `quelleDetail`, das `herkunftDetail` bei der Uebergabe schreibt –
 * eine eigene Spalte waere fuer eine Markierung zu viel.
 */
export const META_ANZEIGE_TEXT = "Meta-Anzeige";

export function istMetaAnzeige(quelle: string, quelleDetail: string | null | undefined): boolean {
  return quelle === "baufivergleicher" && (quelleDetail?.startsWith(META_ANZEIGE_TEXT) ?? false);
}
