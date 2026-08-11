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

  return abruf.anforderungen
    // Ausgeblendetes hat der Vermittler in Europace weggeklickt; was bereits
    // vorliegt, braucht keine offene Position.
    .filter((a) => !a.ausgeblendet && !a.liegtVor)
    .map((a) => ({
      key: `europace.${bank}.${a.code ? slug(a.code) : slug(a.bezeichnung)}`,
      name: a.bezeichnung,
      customerDescription: a.bezeichnung,
      internalDescription: a.bezugName
        ? `Anforderung von ${abruf.bankName} (Europace) · ${a.bezugName}`
        : `Anforderung von ${abruf.bankName} (Europace).`,
      documentType: a.documentType,
      level: "zwingend" as const,
      scope: "bankbezogen" as const,
      platforms: ["europace" as const],
      bankSpecific: true,
      acceptedFileTypes: ["pdf", "jpg", "png"],
      requiredCount: 1,
    }));
}
