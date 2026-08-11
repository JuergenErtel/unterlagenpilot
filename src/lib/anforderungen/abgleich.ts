import type { DocumentType } from "@/lib/domain/enums";
import type { ResolvedChecklistItem } from "@/lib/checklists/engine";
import { faltenBasis } from "@/lib/text/falten";

export interface AbgleichAnforderung {
  id: string;
  bezeichnung: string;
  documentType: DocumentType | null;
  liegtVor: boolean;
  ausgeblendet: boolean;
}

export type AbgleichBefund =
  | { art: "deckt_sich"; anforderungId: string; positionKey: string }
  | { art: "neu"; anforderungId: string }
  | { art: "erledigt"; anforderungId: string }
  | { art: "bank_verlangt_nicht"; positionKey: string };

export interface AbgleichZahlen {
  neu: number;
  verlangtBankNicht: number;
  decktSich: number;
  erledigt: number;
}

/**
 * Basis-Normalisierung mit zusaetzlichem Strippen aller Sonderzeichen. Nutzt dieselbe
 * Faltung wie die Namensmatcher (faltenBasis), fuegt aber .replace(/[^a-z0-9]/g, "")
 * an – weil hier komplette Labels miteinander verglichen werden, nicht tokenisiert.
 */
function falte(s: string): string {
  return faltenBasis(s).replace(/[^a-z0-9]/g, "");
}

/**
 * Gleicht die Anforderungen der Bank gegen unsere Checkliste ab.
 *
 * Getroffen wird ueber den Dokumenttyp, ersatzweise ueber den gefalteten Namen.
 * Der Antragstellerbezug geht BEWUSST nicht ein: Eine Checklisten-Position ist
 * keine Zeile pro Person – `perApplicant` multipliziert nur die Sollzahl. Eine
 * Anforderung fuer Antragsteller 2 ist deshalb von derselben Position gedeckt
 * wie eine fuer Antragsteller 1. Folge: Verlangt die Bank etwas nur fuer eine
 * Person, waehrend wir es von allen einsammeln, gilt das als Treffer – wir
 * fordern dann mehr an als noetig, nie weniger.
 */
export function gleicheAb(
  anforderungen: AbgleichAnforderung[],
  positionen: ResolvedChecklistItem[]
): AbgleichBefund[] {
  const befunde: AbgleichBefund[] = [];
  const getroffenePositionen = new Set<string>();

  for (const a of anforderungen) {
    // Was der Vermittler in Europace ausgeblendet hat, kommt hier nicht zurueck.
    if (a.ausgeblendet) continue;

    const treffer = positionen.find((p) =>
      a.documentType
        ? p.documentType === a.documentType
        : falte(p.name) === falte(a.bezeichnung)
    );

    if (treffer) {
      getroffenePositionen.add(treffer.key);
      befunde.push({ art: "deckt_sich", anforderungId: a.id, positionKey: treffer.key });
      continue;
    }

    // liegtVor heisst: liegt der Bank bereits vor. Keine offene Position daraus.
    befunde.push(
      a.liegtVor ? { art: "erledigt", anforderungId: a.id } : { art: "neu", anforderungId: a.id }
    );
  }

  for (const p of positionen) {
    if (!getroffenePositionen.has(p.key)) {
      befunde.push({ art: "bank_verlangt_nicht", positionKey: p.key });
    }
  }

  return befunde;
}

export function zaehle(befunde: AbgleichBefund[]): AbgleichZahlen {
  return {
    decktSich: befunde.filter((b) => b.art === "deckt_sich").length,
    neu: befunde.filter((b) => b.art === "neu").length,
    erledigt: befunde.filter((b) => b.art === "erledigt").length,
    verlangtBankNicht: befunde.filter((b) => b.art === "bank_verlangt_nicht").length,
  };
}
