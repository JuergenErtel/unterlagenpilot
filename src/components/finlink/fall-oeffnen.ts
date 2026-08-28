"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Wie lange auf die Router-Navigation gewartet wird, bevor der Browser hart
 * wechselt. Die Fallakte ist normalerweise in ein bis zwei Sekunden da; wer
 * nach sechs noch auf der Lead-Liste steht, wartet nicht auf eine langsame
 * Seite, sondern auf eine Navigation, die nicht mehr kommt.
 */
const FRIST_MS = 6000;

/**
 * Öffnet den frisch importierten Fall – mit Sicherungsnetz.
 *
 * Am 28.08.2026 war ein Fall angelegt (UP-2026-0030) und die Weiterleitung
 * ausgeliefert, aber der Browser übernahm sie nie: Die Lead-Liste blieb stehen,
 * der Knopf ausgegraut, der fertige Fall unsichtbar. Die Ursache liess sich
 * nicht nachstellen – deshalb verlässt sich der Weg zum Fall hier auf keinen
 * einzelnen Mechanismus mehr. Zuerst die schnelle Router-Navigation, und wenn
 * die binnen der Frist nichts bewirkt hat, ein harter Wechsel.
 *
 * Im Normalfall ist die Komponente längst ausgehängt, bevor der Zeitgeber
 * ablaufen kann – die Aufräumfunktion räumt ihn dann weg.
 */
export function useFallOeffnen(fallId: string | undefined): void {
  const router = useRouter();
  useEffect(() => {
    if (!fallId) return;
    const ziel = `/cases/${fallId}`;
    router.push(ziel);
    const zeitgeber = setTimeout(() => {
      // Nicht blind wechseln: Steht die Adresse schon auf dem Ziel, hat die
      // Navigation doch noch gegriffen und ein Reload wäre nur Ballast.
      if (window.location.pathname !== ziel) window.location.assign(ziel);
    }, FRIST_MS);
    return () => clearTimeout(zeitgeber);
  }, [fallId, router]);
}
