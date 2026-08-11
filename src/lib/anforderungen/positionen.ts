import type { ChecklistItemDef } from "@/lib/checklists/templates";
import { slug } from "@/lib/rules/schluessel";
import type { AktiverAbruf } from "./speicher";

/**
 * Macht aus dem aktiven Abruf Checklisten-Positionen – die vierte Quelle neben
 * Vorlagen, gepflegten Bankanforderungen und den Funden des Detektivs.
 *
 * Bewusst NICHT kundensichtbar (`scope: "bankbezogen"`): Banktexte lauten
 * „Nachweis gem. Ziffer 3.2" und taugen nicht fuer den Kunden. Der Vermittler
 * gibt sie frei, nachdem er sie umformuliert hat.
 */
export function anforderungsPositionen(abruf: AktiverAbruf): ChecklistItemDef[] {
  const bank = abruf.bankId ?? slug(abruf.bankName);

  const offen = abruf.anforderungen.filter(
    // Ausgeblendetes hat der Vermittler in Europace weggeklickt; was bereits
    // vorliegt, braucht keine offene Position.
    (a) => !a.ausgeblendet && !a.liegtVor
  );

  // Europace schickt bei personenbezogenen Nachweisen (z. B. Gehaltsnachweis)
  // EINE Zeile je Antragsteller mit demselben Code – die Bank will das
  // Dokument von Antragsteller 1 UND von Antragsteller 2. Die Checklisten-
  // Engine dedupliziert Positionen aber ueber den Schluessel
  // (buildChecklistForCase, Map<string, ChecklistItemDef>, spaetere Zeile
  // gewinnt stillschweigend). Ohne diese Gruppierung wuerde die zweite Zeile
  // spurlos verschwinden und die Position schiene nach EINEM Upload erledigt,
  // waehrend die Bank noch auf die zweite Person wartet – stille
  // Unter-Anforderung, die Richtung, die bei diesem Produkt am teuersten ist.
  //
  // Absichtlich NICHT ueber den Antragsteller in den Schluessel: eine zweite
  // Position mit demselben Dokumenttyp wuerde `gleicheAb` (matcht nur auf
  // Dokumenttyp bzw. Namen) nie zuordnen und faelschlich als "verlangt die
  // Bank nicht" melden. Und bewusst NICHT ueber `perApplicant`: das
  // multipliziert mit der Antragstellerzahl des FALLS, nicht mit der Anzahl,
  // die die Bank tatsaechlich verlangt hat – bei einem Nachweis nur fuer eine
  // Person waere das eine Uebertreibung. Reihenfolge bleibt die des ersten
  // Auftretens, damit die Liste zwischen Laeufen nicht durcheinanderwuerfelt.
  const gruppen = new Map<string, typeof offen>();
  for (const a of offen) {
    const keyTeil = a.code ? slug(a.code) : slug(a.bezeichnung);
    const bestehende = gruppen.get(keyTeil);
    if (bestehende) bestehende.push(a);
    else gruppen.set(keyTeil, [a]);
  }

  return Array.from(gruppen.entries()).map(([keyTeil, gruppe]) => {
    const erste = gruppe[0]!;
    // Nur bei mehrfach verlangten Positionen lohnt es, alle Namen zu nennen –
    // sonst bleibt der bisherige einzeilige Text unveraendert.
    const namen = Array.from(
      new Set(gruppe.map((g) => g.bezugName).filter((n): n is string => n !== null))
    );
    const internalDescription =
      gruppe.length > 1 && namen.length > 0
        ? `Anforderung von ${abruf.bankName} (Europace) · ${namen.join(", ")}`
        : erste.bezugName
          ? `Anforderung von ${abruf.bankName} (Europace) · ${erste.bezugName}`
          : `Anforderung von ${abruf.bankName} (Europace).`;

    return {
      key: `europace.${bank}.${keyTeil}`,
      name: erste.bezeichnung,
      customerDescription: erste.bezeichnung,
      internalDescription,
      documentType: erste.documentType,
      level: "zwingend" as const,
      scope: "bankbezogen" as const,
      platforms: ["europace" as const],
      bankSpecific: true,
      acceptedFileTypes: ["pdf", "jpg", "png"],
      requiredCount: gruppe.length,
    };
  });
}
