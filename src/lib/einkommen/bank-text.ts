export interface SelfEmployedBankTextInput {
  applicantName: string;
  selfEmployment: { firma?: string | null; rechtsform?: string | null; gruendungsjahr?: number | null };
  /** Nur Jahre mit Gewinn-Wert, aufsteigend sortiert. */
  gewinnByYear: Array<{ jahr: number; betrag: number }>;
  trend: "steigend" | "fallend" | "stabil" | "unbekannt";
  documents: Array<{ label: string }>;
  ansatzJahr: number | null;
}

export interface SelfEmployedBankText {
  heading: string;
  paragraphs: string[];
}

const EUR = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const TREND_WORD: Record<SelfEmployedBankTextInput["trend"], string> = {
  steigend: "steigend",
  fallend: "fallend",
  stabil: "stabil",
  unbekannt: "nicht eindeutig",
};

/** Deterministischer, neutraler Bank-Begleittext für Selbständige. */
export function buildSelfEmployedBankText(input: SelfEmployedBankTextInput): SelfEmployedBankText {
  const heading = "Einkommenssituation (selbstständige Tätigkeit)";
  const paragraphs: string[] = [];
  const se = input.selfEmployment;
  const name = input.applicantName.trim() || "Der/die Antragsteller:in";

  let taetigkeit = `${name} ist selbstständig tätig`;
  const firma = se.firma?.trim();
  const rechtsform = se.rechtsform?.trim();
  if (rechtsform && firma) taetigkeit += ` als ${rechtsform} „${firma}“`;
  else if (firma) taetigkeit += ` (${firma})`;
  else if (rechtsform) taetigkeit += ` (${rechtsform})`;
  if (se.gruendungsjahr) taetigkeit += ` (seit ${se.gruendungsjahr})`;
  paragraphs.push(`${taetigkeit}.`);

  if (input.documents.length > 0) {
    paragraphs.push(`Ausgewertete Unterlagen: ${input.documents.map((d) => d.label).join(", ")}.`);
  }

  if (input.gewinnByYear.length > 0) {
    const list = input.gewinnByYear.map((g) => `${g.jahr}: ${EUR(g.betrag)}`).join(" · ");
    let p = `Gewinnentwicklung: ${list}.`;
    if (input.gewinnByYear.length >= 2) {
      const avg = input.gewinnByYear.reduce((a, g) => a + g.betrag, 0) / input.gewinnByYear.length;
      p += ` Durchschnitt der letzten ${input.gewinnByYear.length} Jahre: ${EUR(avg)}. Tendenz: ${TREND_WORD[input.trend]}.`;
    }
    paragraphs.push(p);
  }

  if (input.ansatzJahr != null) {
    paragraphs.push(
      `Angesetztes nachhaltiges Jahreseinkommen: ${EUR(input.ansatzJahr)} (≈ ${EUR(input.ansatzJahr / 12)}/Monat).`
    );
  }

  paragraphs.push(
    "Alle Angaben sind den vorgelegten Unterlagen entnommen und stellen keine Bonitäts- oder Einkommensbestätigung dar; die abschließende Beurteilung trifft die Bank."
  );

  return { heading, paragraphs };
}
