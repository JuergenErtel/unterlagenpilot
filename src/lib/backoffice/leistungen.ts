/**
 * Auftragsarten und Leistungsbausteine des Backoffice - als Daten, nicht als
 * Code. Eine neue Leistung ist ein Eintrag hier, keine Migration und kein
 * Sonderzweig: Der Auftrag speichert nur die Schluessel.
 *
 * `ergebnisse` nennt, welche Lieferungen ein Baustein hervorbringt. Das
 * Portal listet daraus, was der Auftraggeber nach der Uebergabe abrufen kann.
 */

export type ErgebnisArt = "checkliste" | "dokumente" | "bank_zusammenfassung" | "wohnflaeche" | "einreichung";

export const ERGEBNIS_LABELS: Record<ErgebnisArt, string> = {
  checkliste: "Unterlagen-Checkliste (PDF)",
  dokumente: "Geprüfte Unterlagen (ZIP)",
  bank_zusammenfassung: "Bankfähige Zusammenfassung (PDF)",
  wohnflaeche: "Wohnflächenberechnung (PDF)",
  einreichung: "Einreichungsdaten (Plattform-Export)",
};

export interface Leistungsbaustein {
  key: string;
  label: string;
  beschreibung: string;
  ergebnisse: readonly ErgebnisArt[];
}

export const LEISTUNGSBAUSTEINE: readonly Leistungsbaustein[] = [
  {
    key: "unterlagen_pruefen",
    label: "Unterlagen prüfen",
    beschreibung: "Klassifizieren, auf Lesbarkeit und Aktualität prüfen, Antragstellern zuordnen.",
    ergebnisse: ["checkliste", "dokumente"],
  },
  {
    key: "daten_erfassen",
    label: "Daten erfassen",
    beschreibung: "Antragsteller-, Einkommens- und Objektdaten aus den Unterlagen übernehmen.",
    ergebnisse: ["checkliste"],
  },
  {
    key: "plausibilitaet",
    label: "Plausibilität prüfen",
    beschreibung: "Widersprüche zwischen Angaben und Belegen finden und benennen.",
    ergebnisse: ["checkliste"],
  },
  {
    key: "nachforderung",
    label: "Fehlende Unterlagen nachfordern",
    beschreibung: "Nachforderungsliste erstellen und den Eingang verfolgen.",
    ergebnisse: ["checkliste"],
  },
  {
    key: "haushaltsrechnung",
    label: "Haushaltsrechnung",
    beschreibung: "Einnahmen, Ausgaben und Kapitaldienstfähigkeit aufbereiten.",
    ergebnisse: ["bank_zusammenfassung"],
  },
  {
    key: "selbststaendige",
    label: "Selbständigen-Analyse",
    beschreibung: "BWA, Jahresabschlüsse und Steuerbescheide zu einer bankfähigen Zusammenfassung verdichten.",
    ergebnisse: ["bank_zusammenfassung"],
  },
  {
    key: "objektunterlagen",
    label: "Objektunterlagen prüfen",
    beschreibung: "Grundbuch, Teilungserklärung, Lageplan und Baubeschreibung auf Vollständigkeit prüfen.",
    ergebnisse: ["checkliste", "dokumente"],
  },
  {
    key: "wohnflaeche",
    label: "Wohnflächenberechnung",
    beschreibung: "Wohnfläche nach WoFlV aus Grundrissen berechnen.",
    ergebnisse: ["wohnflaeche"],
  },
  {
    key: "bankanforderungen",
    label: "Bankanforderungen abgleichen",
    beschreibung: "Checkliste an die Anforderungen der Zielbank anpassen.",
    ergebnisse: ["checkliste"],
  },
  {
    key: "einreichung_vorbereiten",
    label: "Einreichung vorbereiten",
    beschreibung: "Plattformdaten (Europace, FinLink, eHyp home) einreichungsfertig aufbereiten.",
    ergebnisse: ["einreichung", "dokumente"],
  },
  {
    key: "individuell",
    label: "Individuelle Zusatzleistung",
    beschreibung: "Nach Absprache - Umfang in den Hinweisen beschreiben.",
    ergebnisse: [],
  },
];

export interface Auftragsart {
  key: string;
  label: string;
  beschreibung: string;
  /** Vorbelegte Leistungsbausteine. */
  leistungen: readonly string[];
}

export const AUFTRAGSARTEN: readonly Auftragsart[] = [
  {
    key: "basis_pruefung",
    label: "Basis-Unterlagenprüfung",
    beschreibung: "Unterlagen sichten, prüfen und fehlende Positionen benennen.",
    leistungen: ["unterlagen_pruefen", "nachforderung"],
  },
  {
    key: "vollstaendige_aufbereitung",
    label: "Vollständige Fallaufbereitung",
    beschreibung: "Unterlagen, Daten, Plausibilität und Haushaltsrechnung bis zur Einreichungsreife.",
    leistungen: ["unterlagen_pruefen", "daten_erfassen", "plausibilitaet", "nachforderung", "haushaltsrechnung", "bankanforderungen"],
  },
  {
    key: "selbststaendigenfall",
    label: "Komplexer Selbständigenfall",
    beschreibung: "Vollständige Aufbereitung mit Selbständigen-Analyse.",
    leistungen: ["unterlagen_pruefen", "daten_erfassen", "plausibilitaet", "selbststaendige", "haushaltsrechnung"],
  },
  {
    key: "objektpruefung",
    label: "Objektunterlagenprüfung",
    beschreibung: "Nur die Objektseite: Grundbuch, Teilung, Pläne, Baubeschreibung.",
    leistungen: ["objektunterlagen"],
  },
  {
    key: "bank_zusammenfassung",
    label: "Bankfähige Zusammenfassung",
    beschreibung: "Haushaltsrechnung und Zusammenfassung für die Bankeinreichung.",
    leistungen: ["daten_erfassen", "haushaltsrechnung"],
  },
  {
    key: "wohnflaeche",
    label: "Wohnflächenberechnung",
    beschreibung: "Wohnfläche nach WoFlV aus den Grundrissen.",
    leistungen: ["wohnflaeche"],
  },
  {
    key: "nachforderung",
    label: "Unterlagennachforderung",
    beschreibung: "Nachforderungsliste erstellen und Eingang begleiten.",
    leistungen: ["nachforderung"],
  },
  {
    key: "einreichung",
    label: "Einreichungsvorbereitung",
    beschreibung: "Plattformdaten und Dokumentenpaket für die Einreichung.",
    leistungen: ["unterlagen_pruefen", "bankanforderungen", "einreichung_vorbereiten"],
  },
  {
    key: "individuell",
    label: "Individuelle Zusatzleistung",
    beschreibung: "Umfang nach Absprache.",
    leistungen: ["individuell"],
  },
];

export function auftragsart(key: string): Auftragsart | undefined {
  return AUFTRAGSARTEN.find((a) => a.key === key);
}

export function auftragsartLabel(key: string): string {
  return auftragsart(key)?.label ?? key;
}

export function leistungsbaustein(key: string): Leistungsbaustein | undefined {
  return LEISTUNGSBAUSTEINE.find((l) => l.key === key);
}

export function leistungsLabel(key: string): string {
  return leistungsbaustein(key)?.label ?? key;
}

/** Nur bekannte Schluessel, ohne Doppelte, in Katalogreihenfolge. */
export function bereinigeLeistungen(keys: readonly string[]): string[] {
  const set = new Set(keys);
  return LEISTUNGSBAUSTEINE.filter((l) => set.has(l.key)).map((l) => l.key);
}

/** Welche Ergebnisse ein Auftrag mit diesen Leistungen liefert. */
export function ergebnisseFuer(leistungen: readonly string[]): ErgebnisArt[] {
  const gesehen = new Set<ErgebnisArt>();
  for (const key of leistungen) {
    for (const e of leistungsbaustein(key)?.ergebnisse ?? []) gesehen.add(e);
  }
  // Feste Reihenfolge, damit die Liste im Portal stabil bleibt.
  return (Object.keys(ERGEBNIS_LABELS) as ErgebnisArt[]).filter((e) => gesehen.has(e));
}
