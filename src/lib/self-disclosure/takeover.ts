import { sichtbareSchritte, personenSchluessel, offeneFelder } from "@/lib/self-disclosure/navigation";
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

  // Bewusst ALLE Felder des Schritts, nicht `sichtbareFelder`: "Wer liest,
  // nimmt die volle Kette." Eine gegebene Antwort darf nicht verschwinden,
  // nur weil der Kunde die zugehörige Steuerantwort später geändert hat – sie
  // steht ja weiterhin in `answers` und der Vermittler muss sie sehen können.
  //
  // Umfang fest "voll": Der Bogen kann aus dem kurzen ODER dem vollen Weg
  // stammen, der Vermittler soll aber ALLES sehen, was der Kunde tatsächlich
  // beantwortet hat – ein "kurz" hier würde eine gegebene Antwort aus einem
  // Schritt verschweigen, der nur im vollen Katalog steht.
  for (const s of sichtbareSchritte(antworten, "voll")) {
    for (const spaltenPerson of s.personen ?? [undefined]) {
      for (const feld of s.schritt.felder) {
        const k = personenSchluessel(s.schritt.id, feld.id, spaltenPerson);
        const roh = antworten[k];
        const kundenwert = alsText(roh);
        if (kundenwert === "" || (Array.isArray(roh) && roh.length === 0)) continue; // Lücke: nie ein Vorschlag

        const personLabel = spaltenPerson ? ` (Antragsteller ${spaltenPerson})` : "";
        const label = `${feld.label}${personLabel}`;

        // Ohne Zielfeld oder als Liste: nur zur Kenntnis, nicht als Vorschlag.
        if (!feld.ziel || "liste" in feld.ziel) {
          ohneZiel.push({ label, wert: kundenwert });
          continue;
        }

        // Die Kinderzahl gilt dem Haushalt: sie geht an beide Antragsteller.
        // (Die Seite "haushalt" traegt nur haushaltsweite Angaben.)
        const zielPersonen: Array<1 | 2> =
          s.schritt.id === "haushalt"
            ? (stand.applicants
                .map((a) => a.position)
                .filter((p): p is 1 | 2 => p === 1 || p === 2)
                .sort())
            : [spaltenPerson ?? 1];

        const mehrfach = zielPersonen.length > 1;
        for (const zielPerson of zielPersonen) {
          const fallwert = fallwertLesen(stand, feld.ziel, zielPerson);
          if (fallwert === kundenwert) continue;
          vorschlaege.push({
            schluessel: mehrfach ? `${k}#p${zielPerson}` : k,
            label: mehrfach ? `${feld.label} (Antragsteller ${zielPerson})` : label,
            abschnitt: s.schritt.abschnitt,
            kundenwert,
            fallwert,
            art: fallwert === null ? "luecke" : "abweichung",
            ziel: { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld, person: zielPerson },
          });
        }
      }
    }
  }

  return {
    vorschlaege,
    // Ebenso "voll": die Nachfassliste soll jede offene Frage des Katalogs
    // zeigen, unabhängig davon, ob der Bogen ueber den kurzen oder den vollen
    // Weg entstand.
    offen: offeneFelder(antworten, "voll").map((o) => ({ label: o.label, abschnitt: o.abschnitt })),
    ohneZiel,
  };
}
