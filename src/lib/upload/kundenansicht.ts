import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

/**
 * Uebersetzt den internen Unterlagenstand in das, was ein Kunde sehen soll.
 *
 * Bewusst eigene Begriffe: Der Kunde liest „eingegangen", nicht „reviewStatus
 * offen". Und er sieht nur Positionen, die ihn etwas angehen.
 */
export interface KundenPosition {
  key: string;
  name: string;
  beschreibung: string;
  beispiel?: string;
  zustand: "offen" | "eingegangen" | "angenommen" | "abgelehnt";
  /** Nur bei Ablehnung, und nur wenn der Vermittler einen Grund hinterlegt hat. */
  grund?: string;
}

export interface KundenFortschritt {
  positionen: KundenPosition[];
  erledigt: number;
  gesamt: number;
  prozent: number;
}

export interface KundenDokument {
  documentType: string | null;
  reviewStatus: string;
  reviewNote: string | null;
}

export function baueKundenfortschritt(input: {
  positionen: ResolvedChecklistItem[];
  dokumente: KundenDokument[];
}): KundenFortschritt {
  const sichtbar = input.positionen.filter((p) => p.customerVisible);

  const positionen: KundenPosition[] = sichtbar.map((p) => {
    const passende = input.dokumente.filter((d) => d.documentType && d.documentType === p.documentType);

    // Reihenfolge der Zustaende: eine Annahme schlaegt alles, danach die
    // Ablehnung (der Kunde muss handeln), dann der blosse Eingang.
    const angenommen = passende.find((d) => d.reviewStatus === "akzeptiert");
    const abgelehnt = passende.find((d) => d.reviewStatus === "abgelehnt");
    const eingegangen = passende.length > 0;

    if (angenommen) {
      return basis(p, "angenommen");
    }
    if (abgelehnt) {
      return { ...basis(p, "abgelehnt"), grund: abgelehnt.reviewNote ?? undefined };
    }
    if (eingegangen) {
      return basis(p, "eingegangen");
    }
    return basis(p, "offen");
  });

  const gesamt = positionen.length;
  const erledigt = positionen.filter((p) => p.zustand === "angenommen").length;
  const prozent = gesamt === 0 ? 100 : Math.round((erledigt / gesamt) * 100);

  return { positionen, erledigt, gesamt, prozent };
}

function basis(p: ResolvedChecklistItem, zustand: KundenPosition["zustand"]): KundenPosition {
  return {
    key: p.key,
    name: p.name,
    beschreibung: p.customerDescription,
    beispiel: p.example,
    zustand,
  };
}
