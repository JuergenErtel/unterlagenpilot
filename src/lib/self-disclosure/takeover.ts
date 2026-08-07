import { sichtbareSchritte, schluessel, offeneFelder } from "@/lib/self-disclosure/navigation";
import type { Antworten, Ziel } from "@/lib/self-disclosure/types";

/**
 * Vergleicht die Antworten des Kunden mit dem aktuellen Fallstand und macht
 * daraus Vorschläge. Reine Funktion, ohne Datenbank – die Vorschläge werden bei
 * jedem Aufruf frisch gerechnet und können deshalb nicht veralten.
 *
 * Zwei Grundsätze, die hier durchgesetzt werden:
 *  - Eine Lücke erzeugt NIE einen Vorschlag. Ein übersprungenes Feld darf einen
 *    gepflegten Wert nicht mit Leere überschreiben.
 *  - Ein abweichender Wert wird nur gezeigt, nie vorausgewählt (das entscheidet
 *    die Oberfläche anhand von `art`).
 */
export interface Fallstand {
  applicants: Array<{ position: number } & Record<string, unknown>>;
  property: Record<string, unknown> | null;
  financingRequest: Record<string, unknown> | null;
  caseFelder: Record<string, unknown>;
}

export interface Vorschlag {
  schluessel: string;
  label: string;
  abschnitt: string;
  kundenwert: string;
  fallwert: string | null;
  art: "luecke" | "abweichung";
  ziel: { entitaet: string; feld: string; person?: 1 | 2 };
}

export interface Uebernahmeplan {
  vorschlaege: Vorschlag[];
  /** Vom Kunden übersprungen – die Nachfassliste. */
  offen: Array<{ label: string; abschnitt: string }>;
  /** Angaben, für die es (noch) kein Zielfeld gibt, etwa Warmmiete. */
  ohneZiel: Array<{ label: string; wert: string }>;
}

const alsText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/** Der aktuell im Fall gespeicherte Wert für ein Ziel – oder null. */
function fallwertLesen(
  stand: Fallstand,
  ziel: Extract<Ziel, { feld: string }>,
  person: 1 | 2
): string | null {
  const leerZuNull = (v: unknown) => {
    const t = alsText(v);
    return t === "" ? null : t;
  };
  switch (ziel.entitaet) {
    case "case":
      return leerZuNull(stand.caseFelder[ziel.feld]);
    case "property":
      return leerZuNull(stand.property?.[ziel.feld]);
    case "financingRequest":
      return leerZuNull(stand.financingRequest?.[ziel.feld]);
    case "applicant": {
      const a = stand.applicants.find((x) => x.position === person);
      return leerZuNull(a?.[ziel.feld]);
    }
    default:
      // income/employment/selfEmployment hängen an eigenen Datensätzen, die
      // erst beim Übernehmen entstehen. Für den Vergleich zählen sie als leer.
      return null;
  }
}

export function planUebernahme(antworten: Antworten, stand: Fallstand): Uebernahmeplan {
  const vorschlaege: Vorschlag[] = [];
  const ohneZiel: Array<{ label: string; wert: string }> = [];

  for (const s of sichtbareSchritte(antworten)) {
    for (const feld of s.schritt.felder) {
      const k = schluessel(s.id, feld.id);
      const roh = antworten[k];
      const kundenwert = alsText(roh);
      if (kundenwert === "" || (Array.isArray(roh) && roh.length === 0)) continue; // Lücke: nie ein Vorschlag

      const personLabel = s.person ? ` (Antragsteller ${s.person})` : "";
      const label = `${feld.label}${personLabel}`;

      // Ohne Zielfeld oder als Liste: nur zur Kenntnis, nicht als Vorschlag.
      if (!feld.ziel || "liste" in feld.ziel) {
        ohneZiel.push({ label, wert: kundenwert });
        continue;
      }

      // Die Kinderzahl gilt dem Haushalt: sie geht an beide Antragsteller.
      const zielPersonen: Array<1 | 2> =
        s.schritt.id === "haushalt_kinder"
          ? (stand.applicants
              .map((a) => a.position)
              .filter((p): p is 1 | 2 => p === 1 || p === 2)
              .sort())
          : [s.person ?? 1];

      const mehrfach = zielPersonen.length > 1;
      for (const person of zielPersonen) {
        const fallwert = fallwertLesen(stand, feld.ziel, person);
        if (fallwert === kundenwert) continue;
        vorschlaege.push({
          schluessel: mehrfach ? `${k}#p${person}` : k,
          label: mehrfach ? `${feld.label} (Antragsteller ${person})` : label,
          abschnitt: s.schritt.abschnitt,
          kundenwert,
          fallwert,
          art: fallwert === null ? "luecke" : "abweichung",
          ziel: { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld, person },
        });
      }
    }
  }

  return {
    vorschlaege,
    offen: offeneFelder(antworten).map((o) => ({ label: o.label, abschnitt: o.abschnitt })),
    ohneZiel,
  };
}
