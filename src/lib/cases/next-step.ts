import type { Tone } from "@/lib/ui/tone";

/**
 * Der EINE nächste Schritt eines Falls – Herzstück der geführten Fallreise.
 * Wird prominent auf der Fallseite, im Review-Abschluss und (Etappe 2) im
 * Dashboard angezeigt. Die Prioritätsleiter ist bewusst total: es gibt immer
 * einen Schritt.
 */
export interface NextStep {
  key:
    | "ki_laeuft"
    | "ki_fehler"
    | "selbstauskunft_eingegangen"
    | "dokumente_freigeben"
    | "kundendaten"
    | "kritische_hinweise"
    | "unterlagen_anfordern"
    | "selbstauskunft_wartet"
    | "fristen"
    | "einreichung";
  title: string;
  reason: string;
  tone: Tone;
  /** Primäraktion als Link. Fehlt bei ki_laeuft (Fortschritt) und ki_fehler (Server-Action-Form). */
  cta?: { label: string; href: string };
  secondary?: Array<{ label: string; href: string }>;
}

/**
 * Struktureller Ausschnitt aus CockpitData – so kann auch das Dashboard den
 * Schritt je Fall berechnen, ohne das komplette (teure) Cockpit zu laden.
 */
export interface NextStepInput {
  caseId: string;
  status: string;
  counts: {
    pruefbereit: number;
    docsMissing: number;
    criticals: number;
    docsFehler: number;
    docsLaufend: number;
  };
  missingCustomerFields: string[];
  /** Stand der Selbstauskunft; fehlt bei Fällen ohne Link. */
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    /** Tage seit Erstellung des Links; null, wenn kein Link existiert. */
    erstelltVorTagen: number | null;
  };
}

export function computeNextStep(c: NextStepInput): NextStep {
  const id = c.caseId;

  if (c.status === "ki_pruefung_laeuft" || c.counts.docsLaufend > 0) {
    return {
      key: "ki_laeuft",
      title: "KI-Auswertung läuft",
      reason:
        "Die Dokumente werden gerade gelesen und ausgewertet – bei vielen Dokumenten kann das einige Minuten dauern, weil der KI-Anbieter die Anfragen pro Minute begrenzt.",
      tone: "ai",
    };
  }

  if (c.counts.docsFehler > 0) {
    return {
      key: "ki_fehler",
      title: `${c.counts.docsFehler} Dokument${c.counts.docsFehler === 1 ? "" : "e"} ohne KI-Ergebnis`,
      reason: "Bei der letzten Auswertung ist etwas schiefgelaufen. Ein erneuter Lauf behebt das in der Regel.",
      tone: "review",
    };
  }

  // Vor der Dokumentfreigabe: Aus der Selbstauskunft entstehen die Stammdaten,
  // auf denen Haushaltsrechnung und Einreichung aufbauen.
  if (c.selbstauskunft?.eingegangen) {
    return {
      key: "selbstauskunft_eingegangen",
      title: "Selbstauskunft prüfen & übernehmen",
      reason:
        "Der Kunde hat seine Angaben geschickt. Nach deiner Freigabe stehen sie in der Fallakte.",
      tone: "review",
      cta: { label: "Angaben ansehen", href: `/cases/${id}#selbstauskunft-eingang` },
    };
  }

  if (c.counts.pruefbereit > 0) {
    return {
      key: "dokumente_freigeben",
      title: `${c.counts.pruefbereit} Dokument${c.counts.pruefbereit === 1 ? "" : "e"} prüfen & freigeben`,
      reason: "Die KI hat die Daten erkannt. Nach deiner Freigabe wandern sie in die Fallakte.",
      tone: "ai",
      cta: { label: "Jetzt prüfen", href: `/review?case=${id}` },
    };
  }

  if (c.missingCustomerFields.length > 0) {
    return {
      key: "kundendaten",
      title: "Kundendaten vervollständigen",
      reason: `${c.missingCustomerFields.length} Pflichtangabe${c.missingCustomerFields.length === 1 ? "" : "n"} fehl${c.missingCustomerFields.length === 1 ? "t" : "en"}: ${c.missingCustomerFields.join(", ")}.`,
      tone: "blocker",
      cta: { label: "Kundendaten ergänzen", href: `/cases/${id}/edit` },
    };
  }

  if (c.counts.criticals > 0) {
    return {
      key: "kritische_hinweise",
      title: `${c.counts.criticals} kritische${c.counts.criticals === 1 ? "r" : ""} Hinweis${c.counts.criticals === 1 ? "" : "e"} klären`,
      reason: "Die Plausibilitätsprüfung hat Widersprüche gefunden, die vor der Einreichung geklärt werden müssen.",
      tone: "blocker",
      cta: { label: "Hinweise ansehen", href: `/cases/${id}?tab=plausibilitaet` },
    };
  }

  if (c.counts.docsMissing > 0) {
    return {
      key: "unterlagen_anfordern",
      title: `${c.counts.docsMissing} Unterlage${c.counts.docsMissing === 1 ? "" : "n"} anfordern`,
      reason: "Für eine vollständige Akte fehlen noch Unterlagen – fordere sie beim Kunden an oder lade sie selbst hoch.",
      tone: "review",
      cta: { label: "Beim Kunden anfordern", href: `/cases/${id}/messages` },
      secondary: [
        { label: "Selbst hochladen", href: `/cases/${id}?tab=dokumente#broker-upload` },
        { label: "Upload-Link erstellen", href: `/cases/${id}#upload-link` },
      ],
    };
  }

  // Weiter unten: nachfassen, wenn der Link liegen bleibt. Wer schon begonnen
  // hat, wird nicht behelligt – er ist ja dran.
  if (
    c.selbstauskunft &&
    !c.selbstauskunft.begonnen &&
    c.selbstauskunft.erstelltVorTagen !== null &&
    c.selbstauskunft.erstelltVorTagen >= 3
  ) {
    return {
      key: "selbstauskunft_wartet",
      title: "Selbstauskunft nachfassen",
      reason: `Der Link liegt seit ${c.selbstauskunft.erstelltVorTagen} Tagen beim Kunden, ohne dass er begonnen hat.`,
      tone: "review",
      cta: { label: "Kunden erinnern", href: `/cases/${id}/messages` },
    };
  }

  if (c.status === "eingereicht" || c.status === "bank_nachforderung") {
    return {
      key: "fristen",
      title: "Fristen & Nachforderungen im Blick behalten",
      reason: "Der Fall ist eingereicht – verfolge Rückmeldungen und Fristen der Bank.",
      tone: "neutral",
      cta: { label: "Verwaltung öffnen", href: `/cases/${id}/verwaltung` },
    };
  }

  return {
    key: "einreichung",
    title: "Einreichung vorbereiten",
    reason: "Akte vollständig, keine offenen Prüfungen – der Fall ist bereit für die Übergabe.",
    tone: "ready",
    cta: { label: "Einreichungsassistent öffnen", href: `/cases/${id}/export` },
  };
}
