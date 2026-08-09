/**
 * Art eines im Dokument gefundenen Verweises.
 *  - selbst:          Eigenauskunft ("Ich bin der 2. Nachtrag, UR 789/2011").
 *                     Ohne sie ist kein Abgleich moeglich.
 *  - bezugsurkunde:   im Bestandsverzeichnis in Bezug genommene Urkunde
 *  - nachtrag:        Nachtrag zu einer Bezugsurkunde
 *  - anlage:          im Text erwaehnte Anlage (Aufteilungsplan, Bescheinigung)
 *  - last:            Eintragung in Abteilung II
 *  - grundpfandrecht: Eintragung in Abteilung III
 */
export type ReferenceKind =
  | "selbst"
  | "bezugsurkunde"
  | "nachtrag"
  | "anlage"
  | "last"
  | "grundpfandrecht";

/** Ein von der KI gelesener Verweis. Reine Faktenebene, noch keine Bewertung. */
export interface DocReference {
  kind: ReferenceKind;
  /** z. B. "2. Nachtrag zur Teilungserklärung" oder "Erbbaurecht" */
  label: string;
  /** ISO-Datum yyyy-mm-dd, sofern im Text genannt */
  urkundeDatum: string | null;
  /** z. B. "789/2011" */
  urkundenNummer: string | null;
  notar: string | null;
  abteilung: "BV" | "II" | "III" | null;
  laufendeNummer: string | null;
  sourcePage: number;
  /** woertliches Zitat – Grundlage der Nachpruefbarkeit im UI */
  sourceQuote: string;
  confidence: number;
}

/** Eigenauskunft eines bereits in der Akte liegenden Dokuments. */
export interface SelbstAuskunft {
  documentId: string;
  documentType: string | null;
  label: string;
  urkundeDatum: string | null;
  urkundenNummer: string | null;
}

export interface SeitenText {
  pageNumber: number;
  text: string | null;
}

export type FindingCode =
  | "referenz_fehlt"
  | "folgeunterlage_noetig"
  | "anlage_fehlt"
  | "seiten_unvollstaendig"
  | "dokument_veraltet"
  | "serienluecke";

/**
 * neue_position:        Freigabe legt eine NEUE Checklistenposition an.
 * dokument_nachfordern: Freigabe setzt die BESTEHENDE Position auf
 *                       "unvollstaendig" – verhindert Dubletten.
 */
export type Resolution = "neue_position" | "dokument_nachfordern";
