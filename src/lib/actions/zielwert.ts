import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Gemeinsamer Schreibkern für Zielfelder. Sowohl die Selbstauskunft
 * (`self-disclosure.ts`, `uebernehmen`) als auch die geführte Maske für das
 * Erstgespräch schreiben in dieselben Zielfelder – dieser Kern verhindert,
 * dass zwei Schreibwege auseinanderlaufen.
 */

const DATUMSFELDER = ["geburtsdatum", "eintrittsdatum", "befristetBis", "gruendungsdatum"];
const WAHRHEITSFELDER = ["inProbezeit", "befristet", "sondertilgungGewuenscht"];
// inProbezeit UND befristet sind in der DB NOT NULL (Standard false). Eine
// geloeschte Angabe kann hier keine echte Luecke ausdruecken – sie faellt auf
// den Schema-Standard zurueck, statt einen Laufzeitfehler auszuloesen.
// sondertilgungGewuenscht ist dagegen nullable: null bedeutet dort laut
// Schema-Kommentar "nicht gefragt" und ist erlaubt.
const NICHT_NULLBARE_WAHRHEITSFELDER = ["inProbezeit", "befristet"];
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
// Ganzzahlige Spalten (Prisma-Typ Int?). Ein Bruchwert wuerde beim Schreiben
// zur Laufzeit knallen ("Wert stimmt nicht mit Feldtyp ueberein") statt beim
// Speichern sauber abgewiesen zu werden – deshalb wird hier gerundet, nicht
// einfach durchgereicht.
const GANZZAHLFELDER = ["anzahlKinder", "baujahr", "stellplaetze", "zinsbindungJahre"];

/**
 * Wandelt den Textwert in den Typ, den das Zielfeld erwartet.
 *
 * `format` legt fest, wie eine Zahl im Text geschrieben ist – das ist NICHT
 * aus dem Text selbst entscheidbar: "33.333" sieht als deutsche
 * Tausendertrennung (33333) genauso aus wie als bereits geparste Zahl mit
 * drei Nachkommastellen (33,333). Die beiden Aufrufer haben strukturell
 * unterschiedliche Quellen:
 *  - "de" (Default): Der Vermittler tippt im Erstgespräch direkt deutsches
 *    Format ("895.000" = 895000, Punkt als Tausendertrenner, Komma als
 *    Dezimaltrennzeichen). Alle Punkte werden entfernt, das Komma wird zum
 *    Dezimalpunkt.
 *  - "maschinell": Die Selbstauskunft hat den Wert schon einmal geparst
 *    (siehe `schema.ts#parseBetrag`) und liest ihn nur über `String(zahl)`
 *    zurück (`takeover.ts#alsText`) – z. B. "33.333" für 33,333 % Beteiligung
 *    oder "129.5" für 129,5 m², IMMER mit "." als echtem Dezimalpunkt, NIE
 *    mit Tausendertrennung. Hier wird direkt `Number()` aufgerufen, ohne
 *    Punkte zu entfernen.
 * `konvertiere()` in `self-disclosure.ts` ruft ausschließlich mit
 * "maschinell" – nur so bleibt `uebernehmen` beweisbar unverändert, nicht nur
 * heuristisch plausibel.
 */
export function wandleWert(feld: string, roh: string, format: "de" | "maschinell" = "de"): unknown {
  const wert = roh.trim();
  if (wert === "") {
    // Eine geloeschte Angabe ist eine Angabe: null schreiben, nicht
    // ignorieren – außer bei einer NOT-NULL-Spalte, die keinen null-Zustand
    // kennt (siehe NICHT_NULLBARE_WAHRHEITSFELDER oben).
    return NICHT_NULLBARE_WAHRHEITSFELDER.includes(feld) ? false : null;
  }
  if (DATUMSFELDER.includes(feld)) return new Date(wert);
  if (WAHRHEITSFELDER.includes(feld)) return /^(ja|true|1)$/i.test(wert);
  if (ZAHLENFELDER.includes(feld)) {
    const n =
      format === "maschinell" ? Number(wert) : Number(wert.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return GANZZAHLFELDER.includes(feld) ? Math.round(n) : n;
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
 *
 * SICHERHEIT – VORBEDINGUNG DES AUFRUFERS:
 * Dieser Kern prüft selbst WEDER Berechtigung NOCH Sperrstatus. `uebernehmen`
 * ruft vorher `requireCaseAccess(caseId)` und blockt gesperrte Fälle
 * (`LOCKED_CASE_STATUSES`) – dasselbe MUSS der Aufrufer von `schreibeZielwert`
 * vor jedem Aufruf selbst sicherstellen (die Server Action aus Aufgabe 6).
 * Ohne das ist der Schreibpfad ein IDOR: Ein autorisierter Nutzer könnte über
 * eine fremde `caseId` in einen Fall schreiben, auf den er keinen Zugriff
 * hat, oder in einen bereits exportierten/gesperrten Fall.
 *
 * SICHERHEIT – `ziel` NIE aus einer Anfrage übernehmen:
 * `ziel.feld` wird direkt als dynamischer Spaltenname verwendet
 * (`data: { [ziel.feld]: ... }`). Zusammen mit `entitaet: "case"` heißt das:
 * Wer `ziel` beeinflussen kann, kann z. B. `case.organizationId` oder
 * `case.status` schreiben. `ziel` MUSS deshalb serverseitig immer aus dem
 * festen Fragenkatalog (`self-disclosure/catalog.ts` bzw. dessen Pendant für
 * das Erstgespräch) stammen – niemals aus Formulardaten, Query-Parametern
 * oder einem sonst vom Client beeinflussbaren Wert.
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
