import type { Prisma } from "@prisma/client";
import type { Vorschlag } from "@/lib/self-disclosure/takeover";
import { wandleWert, UNLESBARER_WERT } from "@/lib/actions/zielwert";
import { KATALOG_ZU_FINANZIERUNGSART } from "@/lib/self-disclosure/finanzierungsart";

/**
 * Die neun Auswahlmöglichkeiten des Bogens auf die sieben Werte von
 * `EmploymentType` abbilden. Der Kunde soll die vertraute Auswahl sehen, das
 * Schema bleibt unangetastet.
 */
const BESCHAEFTIGUNG: Record<string, string> = {
  angestellter: "angestellter",
  arbeiter: "angestellter",
  selbststaendiger: "selbststaendiger",
  handwerker: "selbststaendiger",
  freiberufler: "freiberufler",
  beamter: "beamter",
  privatier: "sonstiges",
  rentner: "rentner",
  sonstiges: "sonstiges",
};


/**
 * Wandelt den Textwert in den Typ, den das Zielfeld erwartet. Datum, Zahl und
 * Wahrheitswert kommen aus dem gemeinsamen Schreibkern (`zielwert.ts`), den
 * sich die Selbstauskunft mit der geführten Maske fürs Erstgespräch teilt.
 * Nur die Abbildung der Katalog-Auswahltexte auf die Schema-Enums
 * (`EmploymentType`, `FinancingType`) bleibt hier: Sie ist reine
 * Vokabel-Übersetzung des Selbstauskunft-Katalogs, keine allgemeine
 * Typumwandlung.
 *
 * Format IMMER "maschinell": Die Werte hier kommen nie aus getipptem Text,
 * sondern aus `Antworten`, wo Zahl-Felder schon einmal geparst (`parseBetrag`)
 * gespeichert und über `String()` zurückgelesen wurden (`takeover.ts#alsText`)
 * – nie mit deutscher Tausendertrennung. Mit "de" würde z. B. eine
 * Beteiligung von 33,333 % ("33.333") fälschlich zu 33333 % statt 33,333 %.
 */
function konvertiere(feld: string, wert: string): unknown {
  if (feld === "beschaeftigungsart") return BESCHAEFTIGUNG[wert] ?? "sonstiges";
  if (feld === "financingType") return KATALOG_ZU_FINANZIERUNGSART[wert] ?? null;
  const konvertiert = wandleWert(feld, wert, "maschinell");
  // Sollte laut obigem Vertrag nie eintreten (planUebernahme verwirft eine
  // Luecke des Kunden schon vor dem Vorschlag) – falls doch, lieber wie
  // frueher `null` schreiben als das Unlesbar-Signal selbst in die DB
  // durchzureichen (siehe zielwert.ts#UNLESBARER_WERT).
  return konvertiert === UNLESBARER_WERT ? null : konvertiert;
}

/**
 * Schreibt Übernahme-Vorschläge in einen Fall – der gemeinsame Kern von
 * „Vermittler gibt frei" und „Fall entsteht aus dem Anfrageformular".
 *
 * Bewusst ein eigenes Modul und keine Funktion in der Aktionsdatei: Dateien
 * mit "use server" dürfen ausschließlich async Funktionen exportieren, und
 * `konvertiere` gehört hier dazu.
 *
 * @param vorhandene Position → Antragsteller-ID der bereits bestehenden
 *   Antragsteller. Fehlende werden angelegt.
 */
export async function schreibeVorschlaege(
  tx: Prisma.TransactionClient,
  caseId: string,
  vorschlaege: Vorschlag[],
  vorhandene: Map<number, string>
): Promise<void> {
  // Antragsteller 2 entsteht erst hier – ein halb ausgefüllter Bogen soll den
  // Fall nicht verändern.
  const benoetigt = [...new Set(vorschlaege.map((v) => v.ziel.person ?? 1))].sort();
  for (const position of benoetigt) {
    if (vorhandene.has(position)) continue;
    const angelegt = await tx.applicant.create({ data: { caseId, position } });
    vorhandene.set(position, angelegt.id);
  }

  const proApplicant = new Map<string, Record<string, unknown>>();
  const proIncome = new Map<string, Record<string, unknown>>();
  const proEmployment = new Map<string, Record<string, unknown>>();
  const proSelfEmployment = new Map<string, Record<string, unknown>>();
  const proProperty: Record<string, unknown> = {};
  const proFinancing: Record<string, unknown> = {};
  // Die erste Frage des Bogens ("Was möchten Sie finanzieren?") zielt auf
  // "case" (financingType) – ohne eigenen Sammler verschwand sie bislang
  // stillschweigend im `default: break` unten, sowohl bei der Fallgeburt als
  // auch bei der Übernahme durch den Vermittler.
  const proCase: Record<string, unknown> = {};

  for (const v of vorschlaege) {
    const wert = konvertiere(v.ziel.feld, v.kundenwert);
    const applicantId = vorhandene.get(v.ziel.person ?? 1);
    const sammle = (m: Map<string, Record<string, unknown>>) => {
      if (!applicantId) return;
      const daten = m.get(applicantId) ?? {};
      daten[v.ziel.feld] = wert;
      m.set(applicantId, daten);
    };
    switch (v.ziel.entitaet) {
      case "applicant":
        sammle(proApplicant);
        break;
      case "income":
        sammle(proIncome);
        break;
      case "employment":
        sammle(proEmployment);
        break;
      case "selfEmployment":
        sammle(proSelfEmployment);
        break;
      case "property":
        proProperty[v.ziel.feld] = wert;
        break;
      case "financingRequest":
        proFinancing[v.ziel.feld] = wert;
        break;
      case "case":
        proCase[v.ziel.feld] = wert;
        break;
      default:
        break;
    }
  }

  for (const [id, daten] of proApplicant) {
    await tx.applicant.update({ where: { id }, data: daten });
  }
  for (const [applicantId, daten] of proIncome) {
    const satz = await tx.incomeRecord.findFirst({ where: { applicantId } });
    if (satz) await tx.incomeRecord.update({ where: { id: satz.id }, data: daten });
    else await tx.incomeRecord.create({ data: { applicantId, ...daten } });
  }
  for (const [applicantId, daten] of proEmployment) {
    const satz = await tx.employmentRecord.findFirst({ where: { applicantId } });
    if (satz) await tx.employmentRecord.update({ where: { id: satz.id }, data: daten });
    else await tx.employmentRecord.create({ data: { applicantId, ...daten } });
  }
  for (const [applicantId, daten] of proSelfEmployment) {
    await tx.selfEmploymentRecord.upsert({
      where: { applicantId },
      create: { applicantId, ...daten },
      update: daten,
    });
  }
  if (Object.keys(proProperty).length > 0) {
    await tx.property.upsert({
      where: { caseId },
      create: { caseId, ...proProperty },
      update: proProperty,
    });
  }
  if (Object.keys(proFinancing).length > 0) {
    await tx.financingRequest.upsert({
      where: { caseId },
      create: { caseId, ...proFinancing },
      update: proFinancing,
    });
  }
  if (Object.keys(proCase).length > 0) {
    await tx.case.update({ where: { id: caseId }, data: proCase });
  }
}
