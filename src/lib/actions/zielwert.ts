import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Gemeinsamer Schreibkern für Zielfelder. Sowohl die Selbstauskunft
 * (`self-disclosure.ts`, `uebernehmen`) als auch die geführte Maske für das
 * Erstgespräch schreiben in dieselben Zielfelder – dieser Kern verhindert,
 * dass zwei Schreibwege auseinanderlaufen.
 */

const DATUMSFELDER = ["geburtsdatum", "eintrittsdatum", "befristetBis", "gruendungsdatum"];
const WAHRHEITSFELDER = ["inProbezeit", "sondertilgungGewuenscht"];
const ZAHLENFELDER = [
  "anzahlKinder",
  "wohnflaeche",
  "grundstuecksflaeche",
  "baujahr",
  "anzahlZimmer",
  "stellplaetze",
  "kaufpreis",
  "baukosten",
  "modernisierungskosten",
  "eigenkapital",
  "darlehenswunsch",
  "maklerprovisionProzent",
  "hausgeldMonatlich",
  "mieteinnahmenMonatlich",
  "nettoMonatlich",
  "bruttoMonatlich",
  "sonstigeEinnahmen",
  "mieteinnahmen",
  "einmalzahlungenJaehrlich",
  "beteiligungProzent",
  "zinsbindungJahre",
  "wunschrateMonatlich",
];

/**
 * Wandelt den Textwert in den Typ, den das Zielfeld erwartet.
 *
 * Zahlen kommen aus zwei Quellen mit unterschiedlicher Schreibweise: Im
 * Erstgespräch tippt der Vermittler deutsches Format ("895.000" = 895000,
 * Punkt als Tausendertrenner, Komma als Dezimaltrennzeichen). In der
 * Selbstauskunft ist der Wert dagegen schon einmal geparst (siehe
 * `schema.ts#parseBetrag`) und liegt als reine Zahl vor, die beim Rücklesen
 * aus der Datenbank via `String()` mit "." als ECHTEM Dezimaltrennzeichen
 * ausgegeben wird (z. B. "129.5" für 129,5 m²). Ein Punkt wird deshalb nur
 * dann als Tausendertrenner entfernt, wenn ihm genau drei Ziffern folgen –
 * die deutsche Dreiergruppierung. Ein einzelner Nachkommaanteil (ein bis
 * zwei Ziffern) bleibt unangetastet. Das erfüllt beide Aufrufer, ohne einen
 * von ihnen zu verfälschen.
 */
export function wandleWert(feld: string, roh: string): unknown {
  const wert = roh.trim();
  // Eine geloeschte Angabe ist eine Angabe: null schreiben, nicht ignorieren.
  if (wert === "") return null;
  if (DATUMSFELDER.includes(feld)) return new Date(wert);
  if (WAHRHEITSFELDER.includes(feld)) return /^(ja|true|1)$/i.test(wert);
  if (ZAHLENFELDER.includes(feld)) {
    const normiert = wert.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(normiert);
    return Number.isFinite(n) ? n : null;
  }
  return wert;
}

/** Ermittelt den Antragsteller einer Position, legt ihn bei Bedarf an. */
async function ermittleApplicantId(
  tx: Prisma.TransactionClient,
  caseId: string,
  position: 1 | 2
): Promise<string> {
  const vorhanden = await tx.applicant.findFirst({ where: { caseId, position } });
  if (vorhanden) return vorhanden.id;
  const angelegt = await tx.applicant.create({ data: { caseId, position } });
  return angelegt.id;
}

/**
 * Schreibt einen einzelnen Zielwert in den Fall. Antragsteller werden – wie
 * bei `uebernehmen` – über `position` gefunden und bei Bedarf angelegt;
 * `income`/`employment`/`selfEmployment` hängen an genau einem Datensatz je
 * Antragsteller (gefunden oder neu angelegt, nie doppelt).
 *
 * Anders als `uebernehmen` überschreibt dieser Kern eine Lücke NICHT
 * stillschweigend: `wert === ""` wird zu `null` und geschrieben. Bei
 * `uebernehmen` kommt das nie vor, weil `planUebernahme` eine Lücke des
 * Kunden schon vorher verwirft, bevor überhaupt ein Vorschlag entsteht – der
 * gepflegte Wert bleibt also unangetastet. Im Erstgespräch dagegen tippt der
 * Vermittler direkt in dieses Feld; wenn er es leert, meint er das so, und
 * eine gelöschte Angabe muss den Fall auch wieder leeren.
 */
export async function schreibeZielwert(
  caseId: string,
  ziel: { entitaet: string; feld: string; person?: 1 | 2 },
  wert: string
): Promise<void> {
  const konvertiert = wandleWert(ziel.feld, wert);
  const person = ziel.person ?? 1;

  await prisma.$transaction(async (tx) => {
    switch (ziel.entitaet) {
      case "applicant": {
        const id = await ermittleApplicantId(tx, caseId, person);
        await tx.applicant.update({ where: { id }, data: { [ziel.feld]: konvertiert } });
        break;
      }
      case "income": {
        const applicantId = await ermittleApplicantId(tx, caseId, person);
        const satz = await tx.incomeRecord.findFirst({ where: { applicantId } });
        if (satz) {
          await tx.incomeRecord.update({ where: { id: satz.id }, data: { [ziel.feld]: konvertiert } });
        } else {
          await tx.incomeRecord.create({ data: { applicantId, [ziel.feld]: konvertiert } });
        }
        break;
      }
      case "employment": {
        const applicantId = await ermittleApplicantId(tx, caseId, person);
        const satz = await tx.employmentRecord.findFirst({ where: { applicantId } });
        if (satz) {
          await tx.employmentRecord.update({ where: { id: satz.id }, data: { [ziel.feld]: konvertiert } });
        } else {
          await tx.employmentRecord.create({ data: { applicantId, [ziel.feld]: konvertiert } });
        }
        break;
      }
      case "selfEmployment": {
        const applicantId = await ermittleApplicantId(tx, caseId, person);
        await tx.selfEmploymentRecord.upsert({
          where: { applicantId },
          create: { applicantId, [ziel.feld]: konvertiert },
          update: { [ziel.feld]: konvertiert },
        });
        break;
      }
      case "property": {
        await tx.property.upsert({
          where: { caseId },
          create: { caseId, [ziel.feld]: konvertiert },
          update: { [ziel.feld]: konvertiert },
        });
        break;
      }
      case "financingRequest": {
        await tx.financingRequest.upsert({
          where: { caseId },
          create: { caseId, [ziel.feld]: konvertiert },
          update: { [ziel.feld]: konvertiert },
        });
        break;
      }
      case "case": {
        await tx.case.update({ where: { id: caseId }, data: { [ziel.feld]: konvertiert } });
        break;
      }
      default:
        break;
    }
  });
}
