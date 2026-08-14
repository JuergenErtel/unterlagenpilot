import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Gemeinsamer Schreibkern für Zielfelder. Sowohl die Selbstauskunft
 * (`self-disclosure.ts`, `uebernehmen`) als auch die geführte Maske für das
 * Erstgespräch schreiben in dieselben Zielfelder – dieser Kern verhindert,
 * dass zwei Schreibwege auseinanderlaufen.
 */

const DATUMSFELDER = ["geburtsdatum", "eintrittsdatum", "befristetBis", "gruendungsdatum"];
const WAHRHEITSFELDER = ["inProbezeit", "befristet"];
// inProbezeit UND befristet sind in der DB NOT NULL (Standard false). Eine
// geloeschte Angabe kann hier keine echte Luecke ausdruecken – sie faellt auf
// den Schema-Standard zurueck, statt einen Laufzeitfehler auszuloesen. Damit
// sind derzeit ALLE Wahrheitsfelder nicht nullbar; die Unterscheidung bleibt
// stehen, weil ein nullbares Boolean jederzeit wieder dazukommen kann.
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
  "sondertilgungProzentJaehrlich",
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
/**
 * Signal fuer "Text war kein lesbarer Wert" – bewusst NICHT `null`.
 * Gilt fuer Zahlen ("ca. 300") ebenso wie fuer Datumsangaben ("morgen",
 * "31.02.1980"), siehe `wandleDatum` unten.
 *
 * Vorher lieferte `wandleWert` fuer "ca. 300" oder "3.000-3.500" `null`
 * zurueck, `schreibeZielwert` schrieb das ungeprueft in die DB, und ein
 * vorher gepflegter Wert war ersatzlos weg – die Maske meldete trotzdem
 * gruen "gespeichert". Das war der einzige Pfad im Feature, der bestehende
 * Daten zerstoerte (Fund B3, Schlusspruefung 12.08.2026). Ein eigenes,
 * eindeutig unterscheidbares Signal statt `null` laesst `schreibeZielwert`
 * den Schreibvorgang auslassen, statt zu loeschen – ein ausdruecklich
 * geleertes Feld (leerer Text) bleibt weiterhin `null` und loescht wie gewollt.
 */
export const UNLESBARER_WERT = Symbol("unlesbarer-wert");

/**
 * Datum streng lesen – niemals `new Date(text)` raten lassen.
 *
 * `new Date("12.05.1980")` wirft in Node keinen Fehler, sondern liefert den
 * 5. DEZEMBER: der Text wird als US-Format Monat.Tag.Jahr gelesen. Ein deutsch
 * getipptes Geburtsdatum landete damit still um sieben Monate verschoben in der
 * Datenbank und von dort im Europace-Antrag. Unlesbares wie "morgen" oder ein
 * nicht existierender Tag ("31.02.") ergab `Invalid Date` und stuerzte erst in
 * Prisma ab – der Vermittler sah nur "bitte noch einmal versuchen".
 *
 * Erlaubt sind deshalb genau zwei Schreibweisen: ISO (so liefert es
 * `<input type="date">`, so gibt `formatiereWert` es zurueck) und das deutsche
 * Tag.Monat.Jahr. Gebaut wird in UTC, damit der Rundlauf ueber
 * `toISOString().slice(0, 10)` nicht auf den Vortag kippt.
 */
function wandleDatum(wert: string): Date | typeof UNLESBARER_WERT {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(wert);
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wert);
  const [jahr, monat, tag] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : deutsch
      ? [Number(deutsch[3]), Number(deutsch[2]), Number(deutsch[1])]
      : [NaN, NaN, NaN];
  if (!Number.isFinite(jahr)) return UNLESBARER_WERT;

  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  // Fangt den 31.02.: Date.UTC rollt ueber statt zu scheitern, das Ergebnis
  // waere der 2. oder 3. Maerz gewesen.
  const echt =
    datum.getUTCFullYear() === jahr &&
    datum.getUTCMonth() === monat - 1 &&
    datum.getUTCDate() === tag;
  return echt ? datum : UNLESBARER_WERT;
}

export function wandleWert(
  feld: string,
  roh: string,
  format: "de" | "maschinell" = "de"
): unknown {
  const wert = roh.trim();
  if (wert === "") {
    // Eine geloeschte Angabe ist eine Angabe: null schreiben, nicht
    // ignorieren – außer bei einer NOT-NULL-Spalte, die keinen null-Zustand
    // kennt (siehe NICHT_NULLBARE_WAHRHEITSFELDER oben).
    return NICHT_NULLBARE_WAHRHEITSFELDER.includes(feld) ? false : null;
  }
  if (DATUMSFELDER.includes(feld)) return wandleDatum(wert);
  if (WAHRHEITSFELDER.includes(feld)) return /^(ja|true|1)$/i.test(wert);
  if (ZAHLENFELDER.includes(feld)) {
    const n =
      format === "maschinell" ? Number(wert) : Number(wert.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return UNLESBARER_WERT;
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
export interface SchreibeZielwertErgebnis {
  gespeichert: boolean;
  /** Nur gesetzt, wenn NICHT gespeichert wurde, weil der Text keine lesbare Zahl ergab. */
  unlesbar?: boolean;
}

export async function schreibeZielwert(
  caseId: string,
  ziel: { entitaet: string; feld: string; person?: 1 | 2 },
  wert: string
): Promise<SchreibeZielwertErgebnis> {
  const konvertiert = wandleWert(ziel.feld, wert);
  // Unlesbare Zahl: NICHTS schreiben. Der vorher gepflegte Wert bleibt in der
  // DB stehen, statt durch ein stillschweigendes NaN->null geloescht zu
  // werden – die Zusicherung verbietet Blockieren, nicht Melden (siehe
  // UNLESBARER_WERT oben).
  if (konvertiert === UNLESBARER_WERT) {
    return { gespeichert: false, unlesbar: true };
  }
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
  return { gespeichert: true };
}
