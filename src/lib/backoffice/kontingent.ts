import type { BackofficeAbrechnungsmodell } from "@/lib/domain/enums";

/**
 * Kontingentrechnung als reine Funktion ueber die Ereignisse einer Periode.
 *
 * Verbrauch entsteht bei GENAU EINEM Ereignis: der Uebergabe. Nicht bei der
 * Anlage (ein abgelehnter Auftrag darf nichts kosten), nicht beim Abschluss
 * (der kommt Wochen spaeter und haengt an der Abnahme). Korrekturen sind
 * eigene Ereignisse mit Begruendung - nichts wird ueberschrieben.
 */

export interface KontingentEreignisRoh {
  art: "verbrauch" | "zusatzfall" | "korrektur";
  menge: number;
  periode: string;
}

export interface KontingentStand {
  periode: string;
  modell: BackofficeAbrechnungsmodell;
  /** Enthaltene Faelle laut Vereinbarung, null = kein Kontingent. */
  enthalten: number | null;
  /** Aus der Vorperiode uebernommen (begrenzt durch carryOverMax). */
  uebertrag: number;
  /** Verbrauchte Faelle in der Periode (Verbrauch minus Korrekturen). */
  verbraucht: number;
  /** Zusatzfaelle in der Periode. */
  zusatzfaelle: number;
  /** Noch frei, null ohne Kontingent. */
  frei: number | null;
  /** Ueber das Kontingent hinaus verbraucht (was als Zusatzfall abgerechnet wird). */
  ueberzogen: number;
}

export function vorperiode(periode: string): string {
  const [j, m] = periode.split("-").map((x) => parseInt(x, 10));
  if (!j || !m) return periode;
  const d = new Date(Date.UTC(j, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function summe(ereignisse: KontingentEreignisRoh[], periode: string, arten: KontingentEreignisRoh["art"][]): number {
  return ereignisse
    .filter((e) => e.periode === periode && arten.includes(e.art))
    .reduce((acc, e) => acc + e.menge, 0);
}

export function berechneKontingent(input: {
  periode: string;
  modell: BackofficeAbrechnungsmodell;
  kontingentMonatlich: number | null;
  carryOverMax: number;
  ereignisse: KontingentEreignisRoh[];
}): KontingentStand {
  const { periode } = input;
  const enthalten = input.modell === "abo" ? input.kontingentMonatlich : null;

  // Uebertrag: was in der Vorperiode ungenutzt blieb, gedeckelt. Nur eine
  // Periode zurueck - ein Uebertrag, der sich ueber Monate aufstaut, waere ein
  // Sparkonto und kein Kontingent.
  let uebertrag = 0;
  if (enthalten != null && input.carryOverMax > 0) {
    const vor = vorperiode(periode);
    const vorVerbrauch = summe(input.ereignisse, vor, ["verbrauch", "korrektur"]);
    uebertrag = Math.min(input.carryOverMax, Math.max(0, enthalten - vorVerbrauch));
  }

  const verbraucht = Math.max(0, summe(input.ereignisse, periode, ["verbrauch", "korrektur"]));
  const zusatzfaelle = summe(input.ereignisse, periode, ["zusatzfall"]);

  if (enthalten == null) {
    return { periode, modell: input.modell, enthalten: null, uebertrag: 0, verbraucht, zusatzfaelle, frei: null, ueberzogen: 0 };
  }
  const budget = enthalten + uebertrag;
  return {
    periode,
    modell: input.modell,
    enthalten,
    uebertrag,
    verbraucht,
    zusatzfaelle,
    frei: Math.max(0, budget - verbraucht),
    ueberzogen: Math.max(0, verbraucht - budget),
  };
}

/** Idempotenzschluessel des Verbrauchs eines Auftrags - einer je Auftrag. */
export function verbrauchsSchluessel(auftragId: string): string {
  return `verbrauch:${auftragId}`;
}
