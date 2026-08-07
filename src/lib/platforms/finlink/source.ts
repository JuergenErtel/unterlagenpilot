import type { LeadSource } from "@/lib/domain/enums";

/**
 * Leitet die Quelle aus den FinLink-Rohwerten ab. Reine Logik.
 *
 * Am 07.08.2026 an 200 echten Leads geprüft: `source_type` ist der
 * verlässlichere Wert (ImmoscoutLead 126, EuropaceCase 26), `source` trägt den
 * Leadshop (35) und einen Europace-Freitext. Bei 48 von 200 fehlt beides —
 * "unbekannt" ist deshalb ein regulärer Wert, kein Fehlerfall.
 */
export interface QuellenRohwerte {
  sourceType?: string | null;
  source?: string | null;
}

export function leiteQuelleAb(roh: QuellenRohwerte): {
  quelle: LeadSource;
  detail: string | null;
} {
  const typ = roh.sourceType?.trim() || null;
  const src = roh.source?.trim() || null;
  // Rohwert immer behalten – auch bei "unbekannt". Ohne ihn müsste man bei
  // einem neuen Quellentyp raten, was passiert ist.
  const detail = typ ?? src;

  if (typ === "ImmoscoutLead") return { quelle: "immoscout24", detail };
  if (typ === "EuropaceCase") return { quelle: "europace", detail };
  if (src?.startsWith("Imported via Europace")) return { quelle: "europace", detail };
  if (src === "Leadshop") return { quelle: "baufi24", detail };

  return { quelle: "unbekannt", detail };
}
