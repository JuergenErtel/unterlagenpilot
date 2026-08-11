import type { EuropaceAntrag, EuropaceFinanzierungsvorschlag } from "./types";

export interface AnbieterAuswahl {
  quelle: "antrag" | "vorschlag";
  /** antragsNummer oder finanzierungsvorschlagsId */
  bezugsId: string;
  bankId: string | null;
  bankName: string;
  /** Nur bei Vorschlaegen: macht mehrere Angebote unterscheidbar. */
  hinweis?: string;
}

const zahl = (n: number, nachkomma = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });

/**
 * Was Europace zu einem Vorgang anbietet, als eine Liste.
 *
 * Antraege stehen vorn: Sie tragen die verbindliche Anforderungsliste der Bank,
 * waehrend ein Vorschlag nur zeigt, was der Produktanbieter im Angebot erwartet.
 *
 * Eintraege ohne Kennung fallen weg – ohne sie liesse sich gar nichts abrufen.
 */
export function auswahlAus(
  antraege: EuropaceAntrag[],
  vorschlaege: EuropaceFinanzierungsvorschlag[]
): AnbieterAuswahl[] {
  const aus: AnbieterAuswahl[] = [];

  for (const a of antraege) {
    if (!a.antragsNummer) continue;
    aus.push({
      quelle: "antrag",
      bezugsId: a.antragsNummer,
      bankId: a.produktAnbieter?.id ?? null,
      bankName: a.produktAnbieter?.bezeichnung ?? "Bank unbekannt",
    });
  }

  for (const v of vorschlaege) {
    if (!v.id) continue;
    // Der Vorschlag selbst nennt keine Bank; sie haengt am ersten Darlehen.
    const anbieter = v.darlehen?.[0]?.produktAnbieter;
    const teile: string[] = [];
    if (typeof v.sollZins === "number") teile.push(`${zahl(v.sollZins, 2)} %`);
    if (typeof v.rateMonatlich === "number") teile.push(`${zahl(v.rateMonatlich)} €/Monat`);
    aus.push({
      quelle: "vorschlag",
      bezugsId: v.id,
      bankId: anbieter?.id ?? null,
      bankName: anbieter?.bezeichnung ?? "Bank unbekannt",
      ...(teile.length > 0 ? { hinweis: teile.join(" · ") } : {}),
    });
  }

  return aus;
}
