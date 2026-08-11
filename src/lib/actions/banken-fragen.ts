"use server";

import { requireContext } from "@/lib/auth/context";
import { beantworteFrage, type FrageAntwort } from "@/lib/banken/fragen";

export type FrageErgebnis = { antwort: FrageAntwort } | { fehler: string };

/**
 * Beantwortet eine Frage an das Banken-Wiki.
 *
 * Bewusst eine Action mit Rueckgabewert statt eines Seitenaufbaus: Der Lauf
 * dauert je nach Frage einige Sekunden bis gut eine halbe Minute, und ein
 * stiller Seitenaufbau ueber diese Zeit war in diesem Projekt schon einmal
 * die Ursache fuer scheinbar haengende Oberflaechen. Die Client-Komponente
 * kann so einen Fortschritt zeigen.
 *
 * Kein Fallbezug, keine Mandantendaten: Das Wiki ist organisationsuebergreifend,
 * geprueft wird nur, dass ueberhaupt jemand angemeldet ist.
 */
export async function frageStellen(frage: string): Promise<FrageErgebnis> {
  await requireContext();
  try {
    return { antwort: await beantworteFrage(frage) };
  } catch (err) {
    console.error(
      "[banken-fragen] Frage fehlgeschlagen:",
      err instanceof Error ? err.message : "unbekannter Fehler"
    );
    return {
      fehler:
        "Die Frage konnte nicht ausgewertet werden. Bitte in einem Moment noch einmal versuchen.",
    };
  }
}
