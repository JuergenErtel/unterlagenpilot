import type {
  CanonicalApplicant,
  CanonicalCase,
  CanonicalEmployment,
} from "@/lib/domain/canonical";
import type { EmploymentType, MaritalStatus } from "@/lib/domain/enums";
import type {
  Datenkontext,
  EuropaceAnschrift,
  EuropaceBeschaeftigung,
  EuropaceHaushalt,
  EuropaceKunde,
  EuropaceKundenangabenRequest,
} from "./types";

/**
 * Mappt einen kanonischen Fall auf den Europace-Kundenangaben-Request.
 *
 * Reine Funktion ohne I/O – die einzige Absicherung gegen falsche Feldnamen
 * ist der Vertragstest gegen das eingecheckte OpenAPI-Schema.
 *
 * Grundregel: Was BaufiDesk nicht kennt, wird weggelassen statt geraten.
 * Europace verlangt formal nur den Datenkontext, Teilbefuellung ist erlaubt.
 */

/** Leere Objekte wuerden als "gesetzt, aber leer" beim Kunden landen. */
function wegLassenWennLeer<T extends object>(o: T): T | undefined {
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
}

const FAMILIENSTAND: Record<MaritalStatus, string> = {
  ledig: "LEDIG",
  verheiratet: "VERHEIRATET",
  geschieden: "GESCHIEDEN",
  verwitwet: "VERWITWET",
  eingetragene_partnerschaft: "LEBENSPARTNERSCHAFT",
  getrennt_lebend: "GETRENNT_LEBEND",
};

/**
 * Europace kennt keine Entsprechung fuer "geschaeftsfuehrer" und
 * "gesellschafter" – beide sind dort Selbststaendige. "sonstiges" hat gar kein
 * Gegenstueck; dann bleibt die Beschaeftigung leer, statt einen falschen Typ zu
 * behaupten.
 */
const BESCHAEFTIGUNGSTYP: Record<EmploymentType, string | null> = {
  angestellter: "ANGESTELLTER",
  beamter: "BEAMTER",
  selbststaendiger: "SELBSTSTAENDIGER",
  geschaeftsfuehrer: "SELBSTSTAENDIGER",
  gesellschafter: "SELBSTSTAENDIGER",
  rentner: "RENTNER",
  sonstiges: null,
};

/** Nur ANGESTELLTER und BEAMTER kennen ein Beschaeftigungsverhaeltnis. */
const MIT_ARBEITGEBER = new Set(["ANGESTELLTER", "BEAMTER"]);

/**
 * Nur ANGESTELLTER, BEAMTER und SELBSTSTAENDIGER kennen im Schema ein
 * `beruf`-Feld. RENTNER (Schema: `allOf: [Beschaeftigung]`, keine weiteren
 * Properties) kennt keins – sonst haette der Vertragstest es akzeptiert, ohne
 * dass es je bei Europace ankommt.
 */
const MIT_BERUF = new Set(["ANGESTELLTER", "BEAMTER", "SELBSTSTAENDIGER"]);

/**
 * Trennt "Hauptstr. 5" in Strasse und Hausnummer. Europace fuehrt beide
 * getrennt, BaufiDesk speichert eine Zeile. Ohne erkennbare Hausnummer wandert
 * alles in `strasse` – lieber unvollstaendig als falsch zerschnitten.
 */
export function anschriftAufteilen(
  strasse: string | undefined,
  plz: string | undefined,
  ort: string | undefined
): EuropaceAnschrift | undefined {
  let strasseTeil = strasse;
  let hausnummer: string | undefined;
  if (strasse) {
    const treffer = strasse.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?(?:[-/]\s*\d+\s*[a-zA-Z]?)?)$/);
    if (treffer) {
      // Beide Gruppen sind im Regex nicht optional – bei einem Treffer immer gesetzt.
      strasseTeil = treffer[1]!.trim();
      hausnummer = treffer[2]!.replace(/\s+/g, "");
    }
  }
  return wegLassenWennLeer({ strasse: strasseTeil, hausnummer, plz, ort });
}

/** "030 1234567" -> { vorwahl: "030", nummer: "1234567" } */
function telefonAufteilen(telefon: string | undefined) {
  if (!telefon) return undefined;
  const treffer = telefon.trim().match(/^(\+?[\d()/-]+)[\s/-]+(.+)$/);
  if (!treffer) return { nummer: telefon.trim() };
  // Beide Gruppen sind im Regex nicht optional – bei einem Treffer immer gesetzt.
  return { vorwahl: treffer[1]!.trim(), nummer: treffer[2]!.replace(/\s+/g, "") };
}

function beschaeftigung(e: CanonicalEmployment | undefined): EuropaceBeschaeftigung | undefined {
  if (!e?.beschaeftigungsart) return undefined;
  const typ = BESCHAEFTIGUNGSTYP[e.beschaeftigungsart];
  if (!typ) return undefined;

  const verhaeltnis = MIT_ARBEITGEBER.has(typ)
    ? wegLassenWennLeer({
        arbeitgeber: e.arbeitgeber ? { name: e.arbeitgeber } : undefined,
        beschaeftigtSeit: e.eintrittsdatum,
        probezeit: e.inProbezeit,
      })
    : undefined;

  return {
    "@type": typ,
    ...(e.beruf && MIT_BERUF.has(typ) ? { beruf: e.beruf } : {}),
    ...(verhaeltnis ? { beschaeftigungsverhaeltnis: verhaeltnis } : {}),
  };
}

function kunde(c: CanonicalCase, a: CanonicalApplicant): EuropaceKunde {
  const e = c.employment.find((x) => x.applicantPosition === a.position);
  const i = c.income.find((x) => x.applicantPosition === a.position);

  return {
    // Gilt laut Schema nur innerhalb dieses Aufrufs und wird nicht gespeichert.
    referenzId: `antragsteller-${a.position}`,
    personendaten: wegLassenWennLeer({
      person: wegLassenWennLeer({ vorname: a.vorname, nachname: a.nachname }),
      geburtsdatum: a.geburtsdatum,
      geburtsort: a.geburtsort,
      staatsangehoerigkeit: a.staatsangehoerigkeit,
      familienstand: a.familienstand ? { "@type": FAMILIENSTAND[a.familienstand] } : undefined,
    }),
    kontakt: wegLassenWennLeer({
      email: a.email,
      telefonnummer: telefonAufteilen(a.telefon),
    }),
    wohnsituation: wegLassenWennLeer({
      anschrift: anschriftAufteilen(a.strasse, a.plz, a.ort),
    }),
    finanzielles: wegLassenWennLeer({
      einkommenNetto: i?.nettoMonatlich,
      beschaeftigung: beschaeftigung(e),
    }),
  };
}

/** Alle Antragsteller bilden einen Haushalt; Europace erlaubt hoechstens zwei Kunden. */
function haushalte(c: CanonicalCase): EuropaceHaushalt[] | undefined {
  if (c.applicants.length === 0) return undefined;
  const kunden = [...c.applicants]
    .sort((a, b) => a.position - b.position)
    .slice(0, 2)
    .map((a) => kunde(c, a));
  return [{ kunden }];
}

export function canonicalToKundenangaben(
  c: CanonicalCase,
  opts: { datenkontext: Datenkontext }
): EuropaceKundenangabenRequest {
  return {
    importMetadaten: {
      datenkontext: opts.datenkontext,
      externeVorgangsId: c.caseNumber,
      importquelle: "BaufiDesk",
    },
    kundenangaben: {
      haushalte: haushalte(c),
    },
  };
}
