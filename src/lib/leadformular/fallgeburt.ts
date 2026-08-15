import { prisma } from "@/lib/db";
import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";
import { planUebernahme } from "@/lib/self-disclosure/takeover";
import { schreibeVorschlaege } from "@/lib/self-disclosure/schreiben";
import { anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import { EINWILLIGUNG_FASSUNG } from "@/lib/self-disclosure/pflichtangaben";
import type { Antworten } from "@/lib/self-disclosure/types";

/**
 * Aus einem abgesendeten Formular-Bogen wird ein Fall.
 *
 * Der Fall wird GEFÜLLT geboren, nicht leer mit Freigabe-Eingang: Die
 * manuelle Freigabe schützt einen vorhandenen Datenstand vor Überschreiben —
 * hier gibt es keinen. Ein leerer Fall plus Eingang hieße, dass Ampel,
 * Machbarkeit und Checkliste auf einen Klick warten, der nichts abwägen kann.
 *
 * Alles in EINER Transaktion: Ein halb geborener Fall — Nummer vergeben,
 * Antragsteller fehlt — wäre schlimmer als gar keiner. Deshalb liegt auch die
 * Nummernvergabe außen herum (`mitFallnummer`), damit eine Kollision die
 * ganze Transaktion wiederholt statt einen Torso zu hinterlassen.
 */
export async function gebaereFall(
  bogenId: string,
  antworten: Antworten,
  formular: { id: string; organizationId: string; brokerId: string },
  jetzt: Date
): Promise<string> {
  const personen = anzahlAntragsteller(antworten);

  return mitFallnummer(formular.organizationId, jetzt.getFullYear(), (fallnummer) =>
    prisma.$transaction(async (tx) => {
      const fall = await tx.case.create({
        data: {
          organizationId: formular.organizationId,
          brokerId: formular.brokerId,
          caseNumber: fallnummer,
          status: "neu",
          leadPhase: "neu",
          quelle: "webformular",
          financingRequest: { create: {} },
          sources: { create: { type: "kundenformular" } },
          applicants: {
            create: Array.from({ length: personen }, (_, i) => ({ position: i + 1 })),
          },
        },
        select: { id: true, applicants: { select: { id: true, position: true } } },
      });

      // Leerer Fall: Jeder gegebene Wert ist ein Vorschlag, also landet alles
      // drin. Derselbe Kern, den auch die Freigabe des Vermittlers benutzt.
      const plan = planUebernahme(antworten, {
        applicants: fall.applicants.map((a) => ({ id: a.id, position: a.position })),
        property: null,
        financingRequest: null,
        caseFelder: { financingType: null },
      });
      const vorhandene = new Map<number, string>(fall.applicants.map((a) => [a.position, a.id]));
      await schreibeVorschlaege(tx, fall.id, plan.vorschlaege, vorhandene);

      await tx.selfDisclosure.update({
        where: { id: bogenId },
        data: {
          caseId: fall.id,
          takenOverAt: jetzt,
          einwilligungAm: jetzt,
          einwilligungFassung: EINWILLIGUNG_FASSUNG,
        },
      });

      return fall.id;
    })
  );
}
