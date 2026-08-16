import type { Antworten, Feld, Schritt } from "@/lib/self-disclosure/types";

/**
 * Die Felder eines Schritts, die bei diesen Antworten tatsächlich zu sehen
 * sind – in Katalogreihenfolge.
 *
 * Eigenes Modul und nicht Teil von `navigation.ts`: Die Navigation beantwortet
 * „welche Seite", diese Datei „welche Frage auf der Seite". Beide werden von
 * verschiedenen Stellen gebraucht (Darstellung, Fortschritt, Übernahme,
 * Erstgesprächs-Maske).
 */
export function sichtbareFelder(schritt: Schritt, antworten: Antworten, person?: 1 | 2): Feld[] {
  return schritt.felder.filter((f) => (f.sichtbar ? f.sichtbar(antworten, person) : true));
}
