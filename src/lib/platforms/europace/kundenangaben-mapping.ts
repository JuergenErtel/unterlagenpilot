import type {
  CanonicalApplicant,
  CanonicalCase,
  CanonicalEmployment,
} from "@/lib/domain/canonical";
import type { EmploymentType, FinancingType, MaritalStatus, PropertyType } from "@/lib/domain/enums";
import type {
  Datenkontext,
  EuropaceAnschrift,
  EuropaceBeschaeftigung,
  EuropaceFinanzierungsbedarf,
  EuropaceFinanzierungsobjekt,
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
  freiberufler: "FREIBERUFLER",
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
        // NICHT einfach e.inProbezeit durchreichen: die Spalte ist in der DB
        // `Boolean @default(false)` (nicht nullable), es gibt also keinen
        // Zustand "unbekannt" zu lesen -- ein unberuehrtes Beschaeftigungs-
        // verhaeltnis und ein explizit verneintes ("nein, keine Probezeit
        // mehr") sehen fuer BaufiDesk identisch aus: false. `true` dagegen
        // entsteht ausschliesslich durch eine explizite Antwort (Selbst-
        // auskunft, "Noch in der Probezeit" = ja) und ist deshalb belastbar.
        // Also wie sonst im Mapping ueblich: was nicht sicher bekannt ist,
        // wird weggelassen statt als Tatsache behauptet -- hier eben nur fuer
        // den unsicheren Fall false.
        probezeit: e.inProbezeit === true ? true : undefined,
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

/**
 * Alle Antragsteller bilden einen Haushalt; Europace erlaubt hoechstens zwei
 * Kunden. Eigenkapital ist eine Haushaltsgroesse, keine Eigenschaft eines
 * Antragstellers – deshalb landet es hier statt bei `kunde()`, und ein
 * Eigenkapital ohne Antragsteller erzeugt trotzdem einen Haushalt.
 */
function haushalte(c: CanonicalCase): EuropaceHaushalt[] | undefined {
  const eigenkapital = c.financing.eigenkapital;
  if (c.applicants.length === 0 && eigenkapital == null) return undefined;

  const kunden = [...c.applicants]
    .sort((a, b) => a.position - b.position)
    .slice(0, 2)
    .map((a) => kunde(c, a));

  const finanzielleSituation =
    eigenkapital != null
      ? { vermoegen: { summeBankUndSparguthaben: { guthaben: eigenkapital } } }
      : undefined;

  return [wegLassenWennLeer({ kunden: kunden.length ? kunden : undefined, finanzielleSituation })!];
}

/**
 * BaufiDesk kennt Objektarten, fuer die Europace keinen eigenen Typ hat
 * (Grundstueck ist dort BAUGRUNDSTUECK, Gewerbe hat gar kein Gegenstueck).
 * Ohne Entsprechung faellt es auf IMMOBILIE_OHNE_TYP zurueck – das ist ein
 * vorgesehener Wert des Schemas, keine Notluege.
 */
const OBJEKTART: Record<PropertyType, string> = {
  einfamilienhaus: "EINFAMILIENHAUS",
  doppelhaushaelfte: "DOPPELHAUSHAELFTE",
  reihenhaus: "REIHENHAUS",
  eigentumswohnung: "EIGENTUMSWOHNUNG",
  mehrfamilienhaus: "MEHRFAMILIENHAUS",
  grundstueck: "BAUGRUNDSTUECK",
  gewerbe: "IMMOBILIE_OHNE_TYP",
  sonstiges: "IMMOBILIE_OHNE_TYP",
};

/**
 * EIGENTUMSWOHNUNG deklariert im Schema zwar `grundstuecksgroesse` (gegen
 * kundenangaben-openapi.json geprueft) -- das Feld bleibt hier trotzdem
 * bewusst leer: das Gesamtgrundstueck der Wohnanlage ist fachlich nicht die
 * Flaeche der einzelnen Eigentumswohnung, und BaufiDesk erfasst beides nicht
 * getrennt. Eine gesetzte `grundstuecksflaeche` hier zu senden waere geraten,
 * nicht abgeleitet.
 *
 * IMMOBILIE_OHNE_TYP (Auffangwert fuer Gewerbe und Sonstiges) steht bewusst
 * NICHT in dieser Menge: dort gibt es keine fachliche Begruendung, eine
 * erfasste Grundstuecksflaeche wegzuwerfen -- und das Schema erlaubt
 * `grundstuecksgroesse` dort ebenfalls.
 */
const OHNE_GRUNDSTUECK = new Set(["EIGENTUMSWOHNUNG"]);

/**
 * Diese Typen kennen im Schema kein `gebaeude`-Feld. Gegen
 * kundenangaben-openapi.json geprueft: Von den acht Immobilientyp-Varianten
 * (Baugrundstueck, Doppelhaushaelfte, Eigentumswohnung, Einfamilienhaus,
 * ImmobilieOhneTyp, Mehrfamilienhaus, Reihenhaus, Zweifamilienhaus) ist
 * Baugrundstueck die einzige ohne `gebaeude` (nur `grundstuecksart` und
 * `grundstuecksgroesse`) – ein Grundstueck hat eben kein Gebaeude. Ohne diese
 * Sperre haette z.B. `objektart: "grundstueck"` mit gesetztem `baujahr` ein
 * schemawidriges `gebaeude` an BAUGRUNDSTUECK gehaengt.
 */
const OHNE_GEBAEUDE = new Set(["BAUGRUNDSTUECK"]);

function finanzierungsobjekt(c: CanonicalCase): EuropaceFinanzierungsobjekt | undefined {
  const p = c.property;
  if (!p) return undefined;

  const typ = p.objektart ? OBJEKTART[p.objektart] : "IMMOBILIE_OHNE_TYP";
  const gebaeude = OHNE_GEBAEUDE.has(typ)
    ? undefined
    : wegLassenWennLeer({
        baujahr: p.baujahr,
        nutzung: p.wohnflaeche ? { wohnen: { gesamtflaeche: p.wohnflaeche } } : undefined,
      });

  const immobilie = wegLassenWennLeer({
    adresse: anschriftAufteilen(p.strasse, p.plz, p.ort),
    typ: {
      "@type": typ,
      ...(gebaeude ? { gebaeude } : {}),
      ...(OHNE_GRUNDSTUECK.has(typ) || !p.grundstuecksflaeche
        ? {}
        : { grundstuecksgroesse: p.grundstuecksflaeche }),
    },
  });

  return immobilie ? { immobilie } : undefined;
}

/**
 * "umschuldung" hat in Europace keinen eigenen Zweck – fachlich ist es dort
 * eine Anschlussfinanzierung. Fehlt die Finanzierungsart, bleibt der Zweck leer,
 * statt KAUF zu unterstellen.
 */
const FINANZIERUNGSZWECK: Record<FinancingType, string> = {
  kauf: "KAUF",
  neubau: "NEUBAU",
  anschlussfinanzierung: "ANSCHLUSSFINANZIERUNG",
  umschuldung: "ANSCHLUSSFINANZIERUNG",
  modernisierung: "MODERNISIERUNG_UMBAU_ANBAU",
  kapitalbeschaffung: "KAPITALBESCHAFFUNG",
};

/** Nur der Kauf kennt im Schema einen Kaufpreis. */
const MIT_KAUFPREIS = new Set(["KAUF", "KAUF_NEUBAU_VOM_BAUTRAEGER"]);

/**
 * Nebenkosten sind ein eigenes Tor, getrennt vom Kaufpreis: Neubau kennt im
 * Schema `nebenkosten`, aber keinen `kaufpreis` (gegen
 * kundenangaben-openapi.json geprueft: Kauf, KaufNeubauVomBautraeger und
 * Neubau deklarieren `nebenkosten`; Anschlussfinanzierung,
 * ModernisierungUmbauAnbau und Kapitalbeschaffung keins von beidem). Ein
 * gemeinsames Tor haette bei "neubau" die erfasste Maklerprovision stumm
 * verworfen.
 */
const MIT_NEBENKOSTEN = new Set(["KAUF", "KAUF_NEUBAU_VOM_BAUTRAEGER", "NEUBAU"]);

function finanzierungsbedarf(c: CanonicalCase): EuropaceFinanzierungsbedarf | undefined {
  const f = c.financing;
  const typ = f.finanzierungsart ? FINANZIERUNGSZWECK[f.finanzierungsart] : undefined;

  // financing.nebenkosten (Gesamtbetrag) wird bewusst NICHT gemappt: Europaces
  // Nebenkosten-Objekt kennt nur die Einzelposten Grunderwerbsteuer,
  // Maklergebuehr und Notargebuehr – eine Aufteilung des Gesamtbetrags auf
  // diese drei waere geraten, nicht abgeleitet.
  const nebenkosten = wegLassenWennLeer({
    maklergebuehr:
      f.maklerprovisionProzent != null
        ? { einheit: "PROZENT" as const, wert: f.maklerprovisionProzent }
        : undefined,
  });

  const zweck =
    typ === undefined
      ? undefined
      : {
          "@type": typ,
          ...(MIT_KAUFPREIS.has(typ) && f.kaufpreis != null ? { kaufpreis: f.kaufpreis } : {}),
          ...(MIT_NEBENKOSTEN.has(typ) && nebenkosten ? { nebenkosten } : {}),
        };

  /*
   * Die drei Konditionswuensche aus dem Erstgespraech.
   *
   * Die Wunschrate geht als Tilgungswunsch "RATE" mit: Europace leitet die
   * Tilgung dann aus der Rate ab, und die Angebote kommen auf die Wunschrate
   * gerechnet zurueck (Entscheidung des Vermittlers vom 13.08.2026).
   *
   * Eine Sondertilgung von 0 wird GESENDET – das ist die Antwort "keine",
   * nicht "nicht gefragt". Eine Wunschrate von 0 dagegen nicht: Eine Rate von
   * null Euro ist keine Aussage, die jemand ernst meinen kann.
   */
  const details = wegLassenWennLeer({
    zinsbindungInJahren: f.zinsbindungJahre ?? undefined,
    sondertilgungJaehrlich: f.sondertilgungProzentJaehrlich ?? undefined,
    tilgungswunsch:
      f.wunschrateMonatlich != null && f.wunschrateMonatlich > 0
        ? { "@type": "RATE", rate: f.wunschrateMonatlich }
        : undefined,
  });

  // Auch ohne Darlehenswunsch einen Baustein anlegen, sobald ein Wunsch
  // erfasst ist: Der Darlehenswunsch faellt am Anfang des Gespraechs, die
  // Konditionen am Ende – sonst gingen die Konditionen still verloren.
  const bausteine =
    f.darlehenswunsch != null || details
      ? [
          wegLassenWennLeer({
            "@type": "ANNUITAETENDARLEHEN",
            darlehensbetrag: f.darlehenswunsch ?? undefined,
            annuitaetendetails: details,
          })!,
        ]
      : undefined;

  return wegLassenWennLeer({
    finanzierungszweck: zweck,
    finanzierungsbausteine: bausteine,
  });
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
      finanzierungsobjekt: finanzierungsobjekt(c),
      finanzierungsbedarf: finanzierungsbedarf(c),
    },
  };
}
