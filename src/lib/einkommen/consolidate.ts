export type Kennzahl =
  | "umsatz"
  | "gewinn"
  | "zuVersteuerndesEinkommen"
  | "afa"
  | "zinsaufwand"
  | "privatentnahmen"
  | "geschaeftsfuehrergehalt";

export const KENNZAHL_LABELS: Record<Kennzahl, string> = {
  umsatz: "Umsatz / Gesamtleistung",
  gewinn: "Gewinn / Jahresüberschuss",
  zuVersteuerndesEinkommen: "Zu versteuerndes Einkommen",
  afa: "Abschreibungen (AfA)",
  zinsaufwand: "Zinsaufwand",
  privatentnahmen: "Privatentnahmen",
  geschaeftsfuehrergehalt: "Geschäftsführergehalt",
};

// Reihenfolge der Zeilen in der Matrix/PDF.
export const KENNZAHL_ORDER: Kennzahl[] = [
  "umsatz",
  "gewinn",
  "zuVersteuerndesEinkommen",
  "geschaeftsfuehrergehalt",
  "afa",
  "zinsaufwand",
  "privatentnahmen",
];

export type Trend = "steigend" | "fallend" | "stabil" | "unbekannt";

export interface EinkommenDoc {
  dokumenttyp: string;
  jahr: number;
  kennzahlen: Partial<Record<Kennzahl, number>>;
  notiz: string;
  konfidenz: number;
}

export interface MatrixCell {
  value: number;
  conflict: boolean;
  alle: number[];
}

export interface MatrixRow {
  kennzahl: Kennzahl;
  cells: Record<number, MatrixCell>;
  trend: Trend;
}

export interface ConsolidatedMatrix {
  jahre: number[];
  rows: MatrixRow[];
}

export function trendFor(valuesInYearOrder: number[]): Trend {
  if (valuesInYearOrder.length < 2) return "unbekannt";
  const first = valuesInYearOrder[0]!;
  const last = valuesInYearOrder[valuesInYearOrder.length - 1]!;
  if (first === 0) return last === 0 ? "stabil" : last > 0 ? "steigend" : "fallend";
  const ratio = last / first;
  if (ratio > 1.05) return "steigend";
  if (ratio < 0.95) return "fallend";
  return "stabil";
}

export function consolidateEinkommen(docs: EinkommenDoc[]): ConsolidatedMatrix {
  const jahre = Array.from(new Set(docs.map((d) => d.jahr))).sort((a, b) => a - b);

  const rows: MatrixRow[] = [];
  for (const kennzahl of KENNZAHL_ORDER) {
    const cells: Record<number, MatrixCell> = {};
    for (const jahr of jahre) {
      const werte = docs
        .filter((d) => d.jahr === jahr)
        .map((d) => d.kennzahlen[kennzahl])
        .filter((v): v is number => typeof v === "number");
      if (werte.length === 0) continue;
      const distinct = Array.from(new Set(werte));
      cells[jahr] = { value: werte[0]!, conflict: distinct.length > 1, alle: distinct };
    }
    if (Object.keys(cells).length === 0) continue;
    const valuesInYearOrder = jahre.filter((j) => cells[j]).map((j) => cells[j]!.value);
    rows.push({ kennzahl, cells, trend: trendFor(valuesInYearOrder) });
  }

  return { jahre, rows };
}
