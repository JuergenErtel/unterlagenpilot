import type { FinLinkLeadRoh } from "@/lib/platforms/finlink/dto";

/**
 * Welche Leads sind seit der letzten Marke dazugekommen? Reine Logik.
 *
 * Ohne Marke wird nichts genommen: Der erste Lauf setzt den Stichtag, statt
 * hunderte Bestandsleads einzuspielen.
 *
 * Sortiert aufsteigend, damit die Marke lückenlos vorrücken kann – bricht ein
 * Lauf nach der Hälfte ab, steht sie auf dem letzten wirklich verarbeiteten
 * Lead und der nächste Lauf setzt genau dort an.
 */
export function waehleNeueLeads(
  leads: FinLinkLeadRoh[],
  syncedUntil: Date | null,
  max: number
): FinLinkLeadRoh[] {
  if (!syncedUntil) return [];

  const mitZeit = leads
    .map((l) => ({ lead: l, zeit: l.createdAt ? new Date(l.createdAt) : null }))
    .filter(
      (x): x is { lead: FinLinkLeadRoh; zeit: Date } =>
        x.zeit !== null && !Number.isNaN(x.zeit.getTime())
    );

  return mitZeit
    .filter((x) => x.zeit.getTime() > syncedUntil.getTime())
    .sort((a, b) => a.zeit.getTime() - b.zeit.getTime())
    .slice(0, max)
    .map((x) => x.lead);
}
