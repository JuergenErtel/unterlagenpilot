/**
 * Die fuenf Werte, die Europace liefert. Bewusst KEIN Datenbank-Enum: kaeme ein
 * sechster Wert, wuerde er den ganzen Import zum Absturz bringen – fuer ein
 * Nachschlagewerk der falsche Preis.
 */
export const BEKANNTE_STATUS = [
  "MACHBAR",
  "VORBEHALTLICH",
  "NICHT_MACHBAR",
  "INFORMATION",
  "KEINE_ANGABE",
] as const;

export type BankStatus = (typeof BEKANNTE_STATUS)[number];

export interface StatusAnzeige {
  label: string;
  ton: "ready" | "review" | "blocker" | "neutral";
  /**
   * Trifft die Bank hier eine Aussage ueber Machbarkeit? Nur dann darf die
   * Zeile wie ein Urteil gelesen werden.
   *
   * "Keine Angabe" und "Information" sind KEINE Urteile. Das ist der Kern des
   * ganzen Features: 46 % aller Felder tragen "Keine Angabe", und wer das wie
   * "nicht machbar" liest, schliesst reihenweise Banken aus, die den Fall
   * genommen haetten.
   */
  istUrteil: boolean;
}

export function statusAnzeige(status: string): StatusAnzeige {
  switch (status) {
    case "MACHBAR":
      return { label: "machbar", ton: "ready", istUrteil: true };
    case "VORBEHALTLICH":
      return { label: "machbar unter Vorbehalt", ton: "review", istUrteil: true };
    case "NICHT_MACHBAR":
      return { label: "nicht machbar", ton: "blocker", istUrteil: true };
    case "INFORMATION":
      return { label: "Information", ton: "neutral", istUrteil: false };
    case "KEINE_ANGABE":
      return { label: "Bank hat sich nicht geäußert", ton: "neutral", istUrteil: false };
    default:
      // Unbekannter Wert: neutral zeigen statt abstuerzen oder raten.
      return { label: status || "unbekannt", ton: "neutral", istUrteil: false };
  }
}
