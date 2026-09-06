import type { DocumentType } from "@/lib/domain/enums";

/**
 * "Behalten, aber nachfordern" (Fall Schmidt, 06.09.2026).
 *
 * Eine Wohnflaechenberechnung war richtig erkannt und freigegeben – aber nicht
 * bankkonform. Mit der Freigabe verschwand die Position aus jeder
 * Nachforderung, weil ein freigegebenes Dokument sie erfuellt. Der Vermittler
 * braucht beides: die vorhandene Unterlage in der Akte behalten UND die
 * anerkannte Fassung beim Kunden anfordern. Der Zustand haengt am Dokument
 * (`nachforderungGrund`); die Checkliste zaehlt es nicht als Erfuellung, die
 * Position bleibt "unvollstaendig" und traegt den Grund in jede Nachforderung.
 */

/** Vorbelegter Grund je Dokumenttyp - der Vermittler kann ihn aendern. */
const VORLAGEN: Partial<Record<DocumentType, string>> = {
  wohnflaechenberechnung:
    "Die vorliegende Berechnung ist nicht bankkonform. Bitte eine Wohnflächenberechnung nach Wohnflächenverordnung (WoFlV) mit Raumaufstellung nachreichen.",
  grundriss: "Der vorliegende Grundriss ist nicht maßstäblich bzw. unvollständig. Bitte einen bemaßten Grundriss aller Geschosse nachreichen.",
  expose: "Das vorliegende Exposé ist nicht ausreichend. Bitte das vollständige Exposé mit Objektbeschreibung und Flächenangaben nachreichen.",
  kontoauszug: "Die vorliegenden Kontoauszüge reichen der Bank nicht. Bitte lückenlose Auszüge des geforderten Zeitraums nachreichen.",
};

const ALLGEMEIN =
  "Die vorliegende Unterlage wird von der Bank in dieser Form nicht anerkannt. Bitte eine bankkonforme Fassung nachreichen.";

export function nachforderungVorlage(documentType: DocumentType | string | null): string {
  return (documentType && VORLAGEN[documentType as DocumentType]) || ALLGEMEIN;
}

/** Hoechstlaenge des Grunds - er landet in Kundennachrichten und der Kundenansicht. */
export const NACHFORDERUNG_GRUND_MAX = 500;

/**
 * Titel einer offenen Position in Nachforderung, PDF und Fallseite. Traegt bei
 * einer behaltenen, aber nachgeforderten Unterlage den Grund mit - sonst
 * stuende "Wohnflaechenberechnung" in der Liste, obwohl der Kunde eine
 * geschickt hat, und er wuesste nicht, was anders sein soll.
 */
export function nachforderungTitel(m: { name: string; nachforderungGruende?: string[] }): string {
  const gruende = (m.nachforderungGruende ?? []).map((g) => g.trim()).filter(Boolean);
  if (gruende.length === 0) return m.name;
  return `${m.name} – vorhandene Fassung wird nicht anerkannt: ${gruende.join(" ")}`;
}
