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
    | "erstkontakt_email_fehlt"
    | "erstkontakt_vorbereiten"
    | "erstkontakt_entwurf"
    | "erstgespraech"
    | "selbstauskunft_eingegangen"
    | "dokumente_freigeben"
    | "kundendaten"
    | "kritische_hinweise"
    | "machbarkeit"
    | "unterlagen_luecken"
    | "unterlagen_anfordern"
    | "selbstauskunft_wartet"
    | "fristen"
    | "erledigt"
    | "einreichung";
  title: string;
  reason: string;
  tone: Tone;
  /**
   * Primäraktion als Link. Fehlt bei ki_laeuft (Fortschritt), ki_fehler und
   * erstkontakt_vorbereiten (beide Server-Action-Form statt Link).
   */
  cta?: { label: string; href: string };
  secondary?: Array<{ label: string; href: string }>;
  /**
   * Schritte, die bereit wären, aber von einem höher stehenden verdrängt
   * wurden. Die Leiter bleibt bewusst "ein Hauptschritt" – ohne diesen Hinweis
   * verschwand die Dokumentfreigabe jedoch spurlos, sobald irgendetwas darüber
   * rankte, und mit ihr der einzige Weg, die erkannten Daten in die Akte zu
   * bekommen (Fall UP-2026-0007). Nur Wegweiser, nie die Hauptaktion.
   */
  wartet?: Array<{ label: string; href: string }>;
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
    /** Offene Lücken des Unterlagen-Detektivs, vom Vermittler noch nicht gesichtet. */
    offeneBefunde: number;
    /**
     * Der Solver hatte genug Daten und sagt "nicht darstellbar". Bei dünner
     * Datenlage bleibt das false – sonst warnt die Leiter vor Fällen, über die
     * sie nichts weiß.
     */
    machbarkeitBlockiert: boolean;
  };
  missingCustomerFields: string[];
  /** Stand der Selbstauskunft; fehlt bei Fällen ohne Link. */
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    /** Tage seit Erstellung des Links; null, wenn kein Link existiert. */
    erstelltVorTagen: number | null;
  };
  /**
   * Stand des Erstkontakts. Fehlt dieser Block (z. B. weil ein Aufrufer ihn
   * nicht lädt), verhält sich die Leiter wie zuvor – ohne Erstkontakt-Stufen.
   * Ist er gesetzt und noch nicht `versendet`, sticht er alles unterhalb der
   * KI-Stufen: Der Erstkontakt ist der Weg, auf dem fehlende Kundendaten und
   * Unterlagen überhaupt erst angefordert werden – ihn zurückzuhalten, bis
   * z. B. das Geburtsdatum von Hand nachgetragen wurde, wäre ein Henne-Ei-
   * Problem. Sobald `versendet: true`, taucht keine Erstkontakt-Stufe mehr auf.
   */
  erstkontakt?: {
    /** Erste gültige E-Mail-Adresse unter den Antragstellern, falls vorhanden. */
    empfaenger: string | null;
    /** true, sobald ein Entwurf existiert (Upload- + Selbstauskunfts-Link, Nachricht). */
    vorbereitet: boolean;
    versendet: boolean;
  };
  /** Stand des Erstgespraechs; fehlt bei Aufrufern, die ihn nicht laden. */
  erstgespraech?: { offeneAngaben: number };
}

export function computeNextStep(c: NextStepInput): NextStep {
  const schritt = ermittleSchritt(c);
  const wartet = ermittleWartende(c, schritt);
  return wartet.length > 0 ? { ...schritt, wartet } : schritt;
}

/**
 * Verdrängte, aber sofort erledigbare Schritte. Bewusst kurz gehalten: Der
 * Hinweis soll die eine Hauptaufgabe nicht zerreden.
 */
function ermittleWartende(c: NextStepInput, schritt: NextStep): Array<{ label: string; href: string }> {
  const wartet: Array<{ label: string; href: string }> = [];
  // Während des KI-Laufs ist "freigabebereit" nur ein Zwischenstand – die
  // Dokumente tauchen gleich wieder auf, ein Hinweis wäre irreführend. Bei
  // einem erledigten Fall ist ohnehin nichts mehr zu tun; dort wäre eine
  // offene Freigabe ein Hinweis auf Arbeit, die niemand mehr braucht.
  const stumm = schritt.key === "ki_laeuft" || schritt.key === "erledigt";
  if (!stumm && schritt.key !== "dokumente_freigeben" && c.counts.pruefbereit > 0) {
    wartet.push({
      label: `${c.counts.pruefbereit} Dokument${c.counts.pruefbereit === 1 ? "" : "e"} prüfen & freigeben`,
      href: `/review?case=${c.caseId}`,
    });
  }
  // Das Erstgespraech braucht weder einen versendeten Erstkontakt noch eine
  // fertige KI-Pruefung als Voraussetzung – es laesst sich jederzeit parallel
  // fuehren. Verdraengt ein hoeherer Schritt (Erstkontakt, KI-Lauf/-Fehler)
  // die Stufe "erstgespraech" von vorn, bleibt sie trotzdem sofort erledigbar
  // und soll nicht spurlos verschwinden (derselbe Grund wie bei der
  // Dokumentfreigabe oben, siehe Fall UP-2026-0007).
  if (!stumm && schritt.key !== "erstgespraech" && c.erstgespraech && c.erstgespraech.offeneAngaben > 0) {
    wartet.push({
      label: "Erstgespräch führen",
      href: `/cases/${c.caseId}/erstgespraech`,
    });
  }
  return wartet;
}

function ermittleSchritt(c: NextStepInput): NextStep {
  const id = c.caseId;

  // Erledigte Faelle zuerst: Die Fallseite berechnet den Schritt fuer JEDEN
  // Fall, auch fuer abgeschlossene – anders als das Dashboard, das terminale
  // Status herausfiltert. Ohne diese Stufe fiel ein archivierter Fall bis ans
  // Ende der Leiter durch und wurde dort aufgefordert, seine Einreichung
  // vorzubereiten. Bewusst ohne Handlungsaufforderung: Hier ist nichts zu tun.
  if (c.status === "abgeschlossen" || c.status === "archiviert") {
    return {
      key: "erledigt",
      title: c.status === "archiviert" ? "Fall archiviert" : "Fall abgeschlossen",
      reason:
        c.status === "archiviert"
          ? "Der Fall liegt im Archiv. Er wird nicht mehr bearbeitet."
          : "Die Finanzierung steht. Für diesen Fall ist nichts mehr zu tun.",
      tone: "ready",
    };
  }

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

  // Erstkontakt vor allem Fachlichen: Er ist der Weg, auf dem der Kunde
  // überhaupt erst um die fehlenden Kundendaten und Unterlagen gebeten wird
  // (der Entwurf enthält bereits die Checkliste). Solange er nicht versendet
  // ist, wäre jede andere Anweisung ("Kundendaten ergänzen", "Unterlagen
  // anfordern") vorschnell – der eigentliche erste Schritt fehlt noch.
  if (c.erstkontakt && !c.erstkontakt.versendet) {
    if (!c.erstkontakt.empfaenger) {
      return {
        key: "erstkontakt_email_fehlt",
        title: "E-Mail-Adresse für den Erstkontakt fehlt",
        reason:
          "Für diesen Fall ist noch keine E-Mail-Adresse hinterlegt – ohne sie kann weder der Erstkontakt noch eine spätere Nachforderung raus.",
        tone: "blocker",
        cta: { label: "Kundendaten ergänzen", href: `/cases/${id}/edit` },
      };
    }
    if (!c.erstkontakt.vorbereitet) {
      return {
        key: "erstkontakt_vorbereiten",
        title: "Erstkontakt vorbereiten",
        reason: `Upload-Link, Selbstauskunfts-Link und eine fertige Nachricht an ${c.erstkontakt.empfaenger} sind noch nicht erzeugt – verschickt wird dabei noch nichts.`,
        tone: "review",
      };
    }
    return {
      key: "erstkontakt_entwurf",
      title: "Erstkontakt prüfen & senden",
      reason: `Der Entwurf ist fertig formuliert und wartet auf deine Prüfung, bevor er an ${c.erstkontakt.empfaenger} geht.`,
      tone: "review",
      cta: { label: "Prüfen und senden", href: `/cases/${id}/messages` },
    };
  }

  // Nach dem Erstkontakt, vor der Dokumentfreigabe: Ohne die Angaben aus dem
  // Gespraech laesst sich kein Angebot rechnen – Unterlagen zu pruefen ist
  // dann verfrueht.
  if (c.erstgespraech && c.erstgespraech.offeneAngaben > 0) {
    return {
      key: "erstgespraech",
      title: "Erstgespräch führen",
      reason: `${c.erstgespraech.offeneAngaben} Angaben fehlen noch für ein Angebot. Die Maske führt dich durch die Fragen.`,
      tone: "review",
      cta: { label: "Erstgespräch öffnen", href: `/cases/${id}/erstgespraech` },
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

  // Vor allem Unterlagen-Kram: einen Fall, der so nicht darstellbar ist, klärt
  // man, bevor man weiter Unterlagen einsammelt und den Kunden beschäftigt.
  if (c.counts.machbarkeitBlockiert) {
    return {
      key: "machbarkeit",
      title: "Fall ist so nicht darstellbar",
      reason:
        "Beleihungsauslauf oder Haushalt tragen die Finanzierung in dieser Form nicht. Die Machbarkeitsrechnung zeigt, welche Stellschraube das ändern würde.",
      tone: "blocker",
      cta: { label: "Machbarkeit ansehen", href: `/cases/${id}/machbarkeit` },
    };
  }

  // Erst die gefundenen Lücken sichten, dann nachfordern. Andernfalls geht eine
  // Nachforderung raus, der die Hälfte fehlt, und der Kunde wird zweimal
  // angeschrieben – genau der Fehler, den der Detektiv verhindern soll.
  if (c.counts.offeneBefunde > 0) {
    return {
      key: "unterlagen_luecken",
      title: `${c.counts.offeneBefunde} Lücke${c.counts.offeneBefunde === 1 ? "" : "n"} in den Unterlagen gefunden`,
      reason:
        "Die vorliegenden Objektunterlagen nennen Urkunden, die noch nicht in der Akte sind. Sichten und übernehmen, bevor die Nachforderung rausgeht.",
      tone: "review",
      cta: { label: "Lücken ansehen", href: `/cases/${id}?tab=fehlt` },
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

  // "uebertragen" ist der Status, der "eingereicht" meint – seine Beschriftung
  // lautet woertlich "Bei Bank eingereicht". Hier stand frueher der Wert
  // "eingereicht", den CASE_STATUSES nie kannte: Der Zweig war toter Code, und
  // ein an die Bank uebergebener Fall wurde aufgefordert, seine Einreichung
  // vorzubereiten. "exportiert" zaehlt bewusst NICHT dazu – ein erzeugtes
  // Paket ist noch nicht bei der Bank, dort ist der Einreichungsassistent
  // weiterhin der richtige naechste Schritt.
  if (c.status === "uebertragen" || c.status === "bank_nachforderung") {
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
