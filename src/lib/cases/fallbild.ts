import type { Tone } from "@/lib/ui/tone";
import type { CockpitData } from "./cockpit";
import type { NextStep } from "./next-step";

/**
 * Das Fallbild: der Kunde in der Mitte, der Weg zur Einreichung als Bogen
 * darum, die nebenlaeufigen Fachbereiche als Felder in der Mitte.
 *
 * Reine Umformung dessen, was das Cockpit und die Prioritaetsleiter ohnehin
 * schon berechnet haben – hier wird NICHTS neu gerechnet und nichts geraten.
 */

/**
 * Auf den Bogen kommt nur, was wirklich nacheinander passieren MUSS.
 *
 * Das ist der Kern der ganzen Ansicht: Ein Ring, auf dem auch Nebenlaeufiges
 * liegt, behauptet eine Reihenfolge, die es nicht gibt – im ersten Entwurf
 * stand die Machbarkeit bei 70 %, waehrend die Pruefung erst bei 40 % war, und
 * im Kreis gelesen hiess das "uebersprungen".
 */
export const TOR_IDS = ["erstkontakt", "kundendaten", "unterlagen", "pruefung", "einreichung"] as const;
export type TorId = (typeof TOR_IDS)[number];

/** Diese vier laufen nebenher und beanspruchen keine Reihenfolge. */
export const FELD_IDS = ["objekt", "einkommen", "machbarkeit", "nachrichten"] as const;
export type FeldId = (typeof FELD_IDS)[number];

export interface Ziel {
  label: string;
  href: string;
}

export interface Tor {
  id: TorId;
  name: string;
  /** Kurze Zustandszeile unter dem Namen. */
  zustand: string;
  /** Fuellung des Segments, 0–100. */
  anteil: number;
  ton: Tone;
  /**
   * Gesetzt heisst: dieses Tor wartet auf ein anderes. Der Text nennt den Grund.
   *
   * Gesperrt ist ein MERKMAL, kein Zustand: Ein Tor kann gesperrt sein und
   * trotzdem Fortschritt haben (die Einreichung ist zu 60 % vorbereitet, aber
   * durch einen kritischen Hinweis blockiert). Die Zeichnung strichelt deshalb
   * nur bei `anteil === 0` – vorhandenen Fortschritt zu verstecken waere
   * derselbe Fehler in die andere Richtung.
   */
  gesperrt?: string;
  detail: string;
  ziel: Ziel;
}

export interface Feld {
  id: FeldId;
  name: string;
  wert: string;
  zeile: string;
  ton: Tone;
  detail: string;
  ziel: Ziel;
}

export interface Fallbild {
  fall: { nummer: string; name: string; vorhaben: string; betrag: string };
  tore: Tor[];
  felder: Feld[];
  naechstes: {
    /** Wo die tuerkise Marke sitzt. `null` = kein zuordenbares Element. */
    markiert: TorId | FeldId | null;
    titel: string;
    grund: string;
    ton: Tone;
    ziel?: Ziel;
    /**
     * Verdrängte, aber sofort erledigbare Schritte – reine Durchreichung von
     * `NextStep["wartet"]` (siehe Dateikopf: hier wird nichts gerechnet).
     *
     * Muss mit: Ab der `lg`-Breite zeigt die Fallseite NUR das Fallbild. Ohne
     * dieses Feld blieben auf jedem gewöhnlichen Desktop sowohl der
     * Abbruchvorschlag als auch der Altbestand ("N Dokumente prüfen &
     * freigeben", "Erstgespräch führen") unsichtbar – dieselbe Falle, wegen
     * der es "Wartet außerdem" überhaupt gibt.
     */
    wartet?: Ziel[];
    /**
     * Der rohe Schlüssel der Prioritätsleiter – reine Durchreichung von
     * `NextStep["key"]`, ohne etwas Neues zu berechnen (siehe Dateikopf).
     * `FallbildAnsicht` braucht ihn, um bei "Kunden anrufen" dieselbe
     * `KontaktKnopfreihe` einzuhängen wie `NextStepCard` – ohne den
     * Schlüssel gäbe es dafür keine typsichere Unterscheidung von den
     * übrigen Schritten, die alle nur Titel/Grund/Ziel kennen.
     */
    schluessel: NextStep["key"];
  };
}

export interface FallbildEingabe {
  cockpit: CockpitData;
  schritt: NextStep;
  erstkontakt: { empfaenger: string | null; vorbereitet: boolean; versendet: boolean };
  objekt: {
    objektart: string | null;
    ort: string | null;
    /** Wohnflaeche aus den Objektdaten (Exposé), in m². */
    wohnflaeche: number | null;
    /** Eine freigegebene Wohnflaechenberechnung liegt vor. */
    berechnungFreigegeben: boolean;
  };
  finanzierung: { kaufpreis: number | null };
  /** Beim Kunden angeforderte, noch offene Unterlagen. */
  offeneAnfragen: number;
}

const KEIN_WERT = "noch nicht berechnet";

const eur = (n: number | null | undefined) =>
  n == null
    ? null
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Haelt einen Prozentwert im erlaubten Bereich – auch bei krummen Eingaben. */
const anteil = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

/**
 * Welcher Schritt der Prioritaetsleiter auf welches Element zeigt.
 *
 * Bewusst unvollstaendig: Was sich keinem Tor und keinem Feld zuordnen laesst
 * (etwa `fristen`), bekommt KEINE Marke. Lieber keine Marke als eine, die auf
 * das Falsche zeigt – das Band nennt den Schritt ohnehin.
 */
const MARKE: Partial<Record<NextStep["key"], TorId | FeldId>> = {
  ki_laeuft: "pruefung",
  ki_fehler: "pruefung",
  dokumente_freigeben: "pruefung",
  kritische_hinweise: "pruefung",
  erstkontakt_email_fehlt: "erstkontakt",
  erstkontakt_vorbereiten: "erstkontakt",
  erstkontakt_entwurf: "erstkontakt",
  kundendaten: "kundendaten",
  selbstauskunft_eingegangen: "kundendaten",
  selbstauskunft_wartet: "unterlagen",
  unterlagen_luecken: "unterlagen",
  unterlagen_anfordern: "unterlagen",
  machbarkeit: "machbarkeit",
  einreichung: "einreichung",
};

export function baueFallbild(e: FallbildEingabe): Fallbild {
  const { cockpit: c } = e;
  const id = c.caseId;

  return {
    fall: {
      nummer: c.caseNumber,
      name: c.applicantNames || "Ohne Namen",
      vorhaben: [e.objekt.objektart, e.objekt.ort].filter(Boolean).join(" · ") || "Vorhaben offen",
      betrag: eur(e.finanzierung.kaufpreis) ?? "Kaufpreis offen",
    },
    tore: [
      baueErstkontakt(id, e),
      baueKundendaten(id, c),
      baueUnterlagen(id, c),
      bauePruefung(id, c),
      baueEinreichung(id, c),
    ],
    felder: [
      baueObjekt(id, e),
      baueEinkommen(id, c),
      baueMachbarkeit(id, c),
      baueNachrichten(id, e),
    ],
    naechstes: {
      markiert: MARKE[e.schritt.key] ?? null,
      titel: e.schritt.title,
      grund: e.schritt.reason,
      ton: e.schritt.tone,
      ziel: e.schritt.cta ? { label: e.schritt.cta.label, href: e.schritt.cta.href } : undefined,
      wartet: e.schritt.wartet?.map((w) => ({ label: w.label, href: w.href })),
      schluessel: e.schritt.key,
    },
  };
}

/* ── Die fuenf Tore ───────────────────────────────────────────── */

function baueErstkontakt(id: string, e: FallbildEingabe): Tor {
  const k = e.erstkontakt;
  if (k.versendet) {
    return {
      id: "erstkontakt", name: "Erstkontakt", zustand: "versendet", anteil: 100, ton: "ready",
      detail: "Die Erstnachricht ist beim Kunden. Upload- und Selbstauskunfts-Link sind darin enthalten.",
      ziel: { label: "Nachrichten öffnen", href: `/cases/${id}/messages` },
    };
  }
  if (k.vorbereitet) {
    return {
      id: "erstkontakt", name: "Erstkontakt", zustand: "Entwurf liegt bereit", anteil: 60, ton: "review",
      detail: "Ein Entwurf für die Erstnachricht ist erzeugt, aber noch nicht versendet.",
      ziel: { label: "Entwurf ansehen", href: `/cases/${id}/messages` },
    };
  }
  if (!k.empfaenger) {
    return {
      id: "erstkontakt", name: "Erstkontakt", zustand: "keine E-Mail-Adresse", anteil: 0, ton: "blocker",
      detail: "Für keinen Antragsteller ist eine E-Mail-Adresse hinterlegt — ohne die kann der Erstkontakt nicht raus.",
      ziel: { label: "Kundendaten ergänzen", href: `/cases/${id}/edit` },
    };
  }
  return {
    id: "erstkontakt", name: "Erstkontakt", zustand: "noch nicht vorbereitet", anteil: 0, ton: "neutral",
    detail: `Die Erstnachricht an ${k.empfaenger} ist noch nicht erzeugt. Sie enthält Upload- und Selbstauskunfts-Link.`,
    ziel: { label: "Nachrichten öffnen", href: `/cases/${id}/messages` },
  };
}

function baueKundendaten(id: string, c: CockpitData): Tor {
  const fehlend = c.missingCustomerFields;
  const vollstaendig = fehlend.length === 0;
  return {
    id: "kundendaten",
    name: "Kundendaten",
    zustand: vollstaendig ? "vollständig" : `${fehlend.length} Pflichtfeld${fehlend.length === 1 ? "" : "er"} fehlt`,
    // Kein geschaetzter Fortschritt: entweder die Pflichtfelder stehen oder nicht.
    anteil: vollstaendig ? 100 : 40,
    ton: vollstaendig ? "ready" : "blocker",
    detail: vollstaendig
      ? "Alle Pflichtangaben zu den Antragstellern liegen vor."
      : `Es fehlen: ${fehlend.join(", ")}. Ohne diese Angaben ist keine Einreichung möglich.`,
    ziel: { label: "Kundendaten öffnen", href: `/cases/${id}/edit` },
  };
}

function baueUnterlagen(id: string, c: CockpitData): Tor {
  const da = c.counts.docsPresent;
  const fehlt = c.counts.docsMissing;
  const gesamt = da + fehlt;
  const sofort = c.missingGroups.find((g) => g.key === "sofort")?.items.length ?? 0;
  return {
    id: "unterlagen",
    name: "Unterlagen",
    zustand: gesamt === 0 ? "noch keine angefordert" : `${da} von ${gesamt}`,
    anteil: gesamt === 0 ? 0 : anteil((da / gesamt) * 100),
    ton: fehlt === 0 && da > 0 ? "ready" : "review",
    detail:
      fehlt === 0
        ? da > 0
          ? "Alle erwarteten Unterlagen liegen vor."
          : "Für diesen Fall ist noch keine Unterlage eingegangen."
        : `${fehlt} Unterlage${fehlt === 1 ? "" : "n"} fehlt noch${sofort > 0 ? `, davon ${sofort} sofort erforderlich` : ""}.`,
    ziel: { label: "Was fehlt noch?", href: `/cases/${id}?tab=fehlt` },
  };
}

function bauePruefung(id: string, c: CockpitData): Tor {
  const { pruefbereit, criticals, warnings, docsFehler, docsPresent, docsLaufend } = c.counts;

  const zustand =
    docsLaufend > 0
      ? "KI-Auswertung läuft"
      : criticals > 0
        ? `${criticals} kritische${criticals === 1 ? "r" : ""} Hinweis${criticals === 1 ? "" : "e"}`
        : pruefbereit > 0
          ? `${pruefbereit} warte${pruefbereit === 1 ? "t" : "n"} auf Freigabe`
          : docsFehler > 0
            ? `${docsFehler} ohne KI-Ergebnis`
            : docsPresent > 0
              ? "geprüft"
              : "noch nichts zu prüfen";

  const ton: Tone =
    criticals > 0 ? "blocker" : docsLaufend > 0 || pruefbereit > 0 ? "ai" : docsFehler > 0 ? "review" : docsPresent > 0 ? "ready" : "neutral";

  const offen = pruefbereit + docsFehler;
  return {
    id: "pruefung",
    name: "Prüfung",
    zustand,
    anteil: docsPresent === 0 ? 0 : anteil(((docsPresent - offen) / docsPresent) * 100),
    ton,
    // Kein Dokument da heisst nicht "nicht geschafft", sondern "noch nicht dran".
    gesperrt: docsPresent === 0 ? "wartet auf die ersten Unterlagen" : undefined,
    detail:
      docsPresent === 0
        ? "Sobald die erste Unterlage eingeht, wertet die KI sie aus und legt sie hier zur Freigabe vor."
        : [
            criticals > 0 ? `${criticals} kritische Hinweise blockieren die Einreichung.` : null,
            warnings > 0 ? `${warnings} Hinweis${warnings === 1 ? "" : "e"} insgesamt.` : null,
            pruefbereit > 0 ? `${pruefbereit} Dokument${pruefbereit === 1 ? "" : "e"} wartet auf deine Freigabe.` : null,
          ]
            .filter(Boolean)
            .join(" ") || "Alle vorliegenden Dokumente sind geprüft und freigegeben.",
    ziel: { label: "Review-Center öffnen", href: `/review?case=${id}` },
  };
}

function baueEinreichung(id: string, c: CockpitData): Tor {
  const beste = c.platformReadiness.reduce((a, b) => (b.percent > a.percent ? b : a), c.platformReadiness[0] ?? { percent: 0, missingFields: 0 });
  const sofort = c.missingGroups.find((g) => g.key === "sofort")?.items.length ?? 0;

  // Reihenfolge der Gruende ist die Reihenfolge, in der man sie abarbeitet.
  const grund =
    c.counts.criticals > 0
      ? "wartet auf die Prüfung"
      : c.missingCustomerFields.length > 0
        ? "wartet auf die Kundendaten"
        : sofort > 0
          ? "wartet auf Pflichtunterlagen"
          : undefined;

  return {
    id: "einreichung",
    name: "Einreichung",
    zustand: grund ?? (beste.percent >= 90 ? "bereit" : `${beste.percent} % vorbereitet`),
    anteil: anteil(beste.percent),
    ton: grund ? "neutral" : beste.percent >= 90 ? "ready" : "review",
    gesperrt: grund,
    detail: grund
      ? `Gesperrt, solange etwas davor offen ist: ${grund.replace("wartet auf ", "")}. Danach fehlen noch ${beste.missingFields} Pflichtfeld${beste.missingFields === 1 ? "" : "er"}.`
      : `${beste.missingFields} Pflichtfeld${beste.missingFields === 1 ? "" : "er"} fehlen noch für die Einreichung.`,
    ziel: { label: "Einreichung vorbereiten", href: `/cases/${id}/export` },
  };
}

/* ── Die vier nebenlaeufigen Felder ───────────────────────────── */

function baueObjekt(id: string, e: FallbildEingabe): Feld {
  const { wohnflaeche, berechnungFreigegeben } = e.objekt;
  return {
    id: "objekt",
    name: "Objekt",
    wert: wohnflaeche != null ? `${wohnflaeche.toLocaleString("de-DE")} m²` : "keine Fläche",
    zeile: berechnungFreigegeben ? "Wohnfläche geprüft" : wohnflaeche != null ? "Wohnfläche ungeprüft" : "aus dem Grundriss",
    ton: berechnungFreigegeben ? "ready" : "review",
    detail: berechnungFreigegeben
      ? "Die Wohnfläche ist nach WoFlV aus dem Grundriss berechnet und freigegeben."
      : wohnflaeche != null
        ? `Die ${wohnflaeche.toLocaleString("de-DE")} m² stammen aus den Objektangaben. Aus dem Grundriss ist noch nichts berechnet — Banken rechnen selbst nach.`
        : "Für dieses Objekt ist keine Wohnfläche hinterlegt und keine berechnet.",
    ziel: { label: "Wohnfläche berechnen", href: `/cases/${id}/wohnflaeche` },
  };
}

function baueEinkommen(id: string, c: CockpitData): Feld {
  const m = c.machbarkeit;
  if (!m) {
    return {
      id: "einkommen", name: "Einkommen & Haushalt", wert: KEIN_WERT, zeile: "Daten reichen nicht",
      ton: "neutral",
      detail: "Für die Haushaltsrechnung fehlen noch Angaben — sie wird berechnet, sobald Einkommen und Vorhaben stehen.",
      ziel: { label: "Haushaltsrechnung öffnen", href: `/cases/${id}/haushalt` },
    };
  }
  const positiv = m.ueberschuss >= 0;
  return {
    id: "einkommen",
    name: "Einkommen & Haushalt",
    wert: `${positiv ? "+" : ""}${Math.round(m.ueberschuss).toLocaleString("de-DE")} €`,
    zeile: positiv ? "Überschuss im Monat" : "Fehlbetrag im Monat",
    ton: positiv ? "ready" : "blocker",
    detail: positiv
      ? `Nach Rate und Lebenshaltung bleiben ${Math.round(m.ueberschuss).toLocaleString("de-DE")} € im Monat übrig.`
      : `Die Haushaltsrechnung geht um ${Math.abs(Math.round(m.ueberschuss)).toLocaleString("de-DE")} € im Monat nicht auf — so nimmt das keine Bank.`,
    ziel: { label: "Haushaltsrechnung öffnen", href: `/cases/${id}/haushalt` },
  };
}

function baueMachbarkeit(id: string, c: CockpitData): Feld {
  const m = c.machbarkeit;
  if (!m) {
    return {
      id: "machbarkeit", name: "Machbarkeit", wert: KEIN_WERT, zeile: "Daten reichen nicht",
      ton: "neutral",
      // Ausdruecklich: nicht berechenbar heisst NICHT "nicht machbar".
      detail: "Für ein Urteil fehlen noch Angaben. Das heißt nicht, dass der Fall nicht machbar ist — nur, dass wir es noch nicht sagen können.",
      ziel: { label: "Machbarkeit öffnen", href: `/cases/${id}/machbarkeit` },
    };
  }
  return {
    id: "machbarkeit",
    name: "Machbarkeit",
    wert: `${Math.round(m.auslauf)} %`,
    zeile: m.machbar ? "Beleihungsauslauf" : "Auslauf · nicht darstellbar",
    ton: m.machbar ? (m.auslauf > 90 ? "review" : "ready") : "blocker",
    detail: m.machbar
      ? `Beleihungsauslauf ${Math.round(m.auslauf)} %. Der Solver zeigt, welche Stellschraube den Fall günstiger macht.`
      : `Beleihungsauslauf ${Math.round(m.auslauf)} % — so ist der Fall nicht darstellbar. Der Solver zeigt die kleinste Änderung, die ihn rettet.`,
    ziel: { label: "Solver öffnen", href: `/cases/${id}/machbarkeit` },
  };
}

function baueNachrichten(id: string, e: FallbildEingabe): Feld {
  const offen = e.offeneAnfragen;
  return {
    id: "nachrichten",
    name: "Nachrichten",
    wert: String(offen),
    zeile: offen === 1 ? "Anfrage offen" : "Anfragen offen",
    ton: offen > 0 ? "review" : "neutral",
    detail:
      offen > 0
        ? `${offen} beim Kunden angeforderte Unterlage${offen === 1 ? "" : "n"} ${offen === 1 ? "ist" : "sind"} noch nicht eingegangen.`
        : "Beim Kunden ist gerade nichts offen angefordert.",
    ziel: { label: "Nachrichten öffnen", href: `/cases/${id}/messages` },
  };
}
