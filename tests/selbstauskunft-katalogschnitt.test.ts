import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte, fortschritt } from "@/lib/self-disclosure/navigation";
import { planUebernahme } from "@/lib/self-disclosure/takeover";

const KURZ = ["vorhaben", "objekt_preis", "finanzierungswunsch", "haushalt", "personen", "verpflichtungen"];
const VOLL_ZUSAETZLICH = [
  "person_details",
  "beruf_details",
  "einnahmen",
  "haushalt_ausgaben",
  "eigenkapital_herkunft",
  "objekt_details",
  "konditionen",
];

/**
 * Die 63 Felder des Katalogs als Fixtur: Seite, Feld-ID, Zielspalte.
 *
 * Der Grund, warum diese Liste hier ausgeschrieben steht statt aus dem Katalog
 * gerechnet zu werden: "Kein Feld darf verlorengehen" ist die haerteste Zusage
 * dieses Plans, und sie war bis hierher UNGEPRUEFT. Die Faelle unten pruefen
 * nur, dass jede Seite ueberhaupt Felder hat und dass die IDs je Seite
 * eindeutig sind – ein gestrichenes "objekt_details.stellplaetze" oder
 * "objekt_preis.ort" bliebe gruen, und `tsc` sieht es auch nicht. Eine aus dem
 * Katalog abgeleitete Erwartung koennte das gar nicht: Sie waere immer wahr.
 *
 * Wer hier etwas verschiebt, verschiebt es sichtbar – und wer eine Zeile
 * loeschen will, muss es hinschreiben.
 */
const FELDER: Array<[seite: string, feld: string, ziel: string | null]> = [
  ["vorhaben", "art", "case.financingType"],
  ["vorhaben", "stand", null],
  ["vorhaben", "nutzung", "property.nutzung"],
  // Die Ja/Nein-Frage steht auf Seite 1, ihre Hoehe auf Seite 2: Standen beide
  // auf "objekt_preis", war das Prozentfeld im Ablauf unerreichbar (der Server
  // rechnet die Feldliste vor dem Absenden und springt danach weiter).
  ["vorhaben", "makler", null],
  ["objekt_preis", "plz", "property.zip"],
  ["objekt_preis", "ort", "property.city"],
  ["objekt_preis", "kaufpreis", "financingRequest.kaufpreis"],
  ["objekt_preis", "grundstueck", "financingRequest.kaufpreis"],
  ["objekt_preis", "bau", "financingRequest.baukosten"],
  ["objekt_preis", "vorhaben", null],
  ["objekt_preis", "modernisierung", "financingRequest.modernisierungskosten"],
  ["objekt_preis", "restschuld", "financingRequest.darlehenswunsch"],
  ["objekt_preis", "kapitalbedarf", "financingRequest.darlehenswunsch"],
  ["objekt_preis", "wohnflaeche", "property.wohnflaeche"],
  ["objekt_preis", "makler_hoehe", "financingRequest.maklerprovisionProzent"],
  ["finanzierungswunsch", "eigenkapital", "financingRequest.eigenkapital"],
  ["finanzierungswunsch", "darlehen", "financingRequest.darlehenswunsch"],
  ["finanzierungswunsch", "wunschrate", "financingRequest.wunschrateMonatlich"],
  ["haushalt", "anzahl", null],
  ["haushalt", "kinder", "applicant.anzahlKinder"],
  ["personen", "vorname", "applicant.vorname"],
  ["personen", "nachname", "applicant.nachname"],
  ["personen", "email", "applicant.email"],
  ["personen", "telefon", "applicant.phone"],
  ["personen", "beruf_art", "employment.beschaeftigungsart"],
  ["personen", "netto", "income.nettoMonatlich"],
  ["verpflichtungen", "liste", "liability[]"],
  ["person_details", "anrede", "applicant.anrede"],
  ["person_details", "geburtsdatum", "applicant.geburtsdatum"],
  ["person_details", "geburtsort", "applicant.geburtsort"],
  ["person_details", "staatsangehoerigkeit", "applicant.staatsangehoerigkeit"],
  ["person_details", "familienstand", "applicant.familienstand"],
  ["person_details", "strasse", "applicant.street"],
  ["person_details", "plz", "applicant.zip"],
  ["person_details", "ort", "applicant.city"],
  ["beruf_details", "beruf", "employment.beruf"],
  ["beruf_details", "arbeitgeber", "employment.arbeitgeber"],
  ["beruf_details", "arbeitgeber_adresse", "employment.arbeitgeberAdresse"],
  ["beruf_details", "seit", "employment.eintrittsdatum"],
  ["beruf_details", "befristet", "employment.befristet"],
  ["beruf_details", "probezeit", "employment.inProbezeit"],
  ["beruf_details", "firma", "selfEmployment.firma"],
  ["beruf_details", "rechtsform", "selfEmployment.rechtsform"],
  ["beruf_details", "beteiligung", "selfEmployment.beteiligungProzent"],
  ["beruf_details", "gruendung", "selfEmployment.gruendungsdatum"],
  ["einnahmen", "brutto", "income.bruttoMonatlich"],
  ["einnahmen", "sonderzahlungen", "income.einmalzahlungenJaehrlich"],
  ["einnahmen", "miete", "income.mieteinnahmen"],
  ["einnahmen", "sonstige", "income.sonstigeEinnahmen"],
  ["haushalt_ausgaben", "warmmiete", null],
  ["haushalt_ausgaben", "unterhalt", null],
  ["eigenkapital_herkunft", "liste", "asset[]"],
  ["objekt_details", "objektart", "property.objektart"],
  ["objekt_details", "strasse", "property.street"],
  ["objekt_details", "grundstueck", "property.grundstuecksflaeche"],
  ["objekt_details", "baujahr", "property.baujahr"],
  ["objekt_details", "zimmer", "property.anzahlZimmer"],
  ["objekt_details", "stellplaetze", "property.stellplaetze"],
  ["objekt_details", "hausgeld", "property.hausgeldMonatlich"],
  ["objekt_details", "mieteinnahmen", "property.mieteinnahmenMonatlich"],
  ["konditionen", "zinsbindung", "financingRequest.zinsbindungJahre"],
  ["konditionen", "sondertilgung", "financingRequest.sondertilgungProzentJaehrlich"],
  ["konditionen", "zinsbindung_ende", null],
];

describe("Katalogschnitt", () => {
  it("hat genau dreizehn Seiten", () => {
    expect(KATALOG.map((s) => s.id)).toEqual([...KURZ, ...VOLL_ZUSAETZLICH]);
  });

  it("die kurze Kette enthaelt keine volle Seite", () => {
    const kette = sichtbareSchritte({ "vorhaben.art": "kauf_bestand" }, "kurz");
    for (const s of kette) expect(s.schritt.umfang).toBe("kurz");
  });

  it("die volle Kette beginnt mit denselben Seiten wie die kurze", () => {
    const antworten = { "vorhaben.art": "kauf_bestand" };
    const kurz = sichtbareSchritte(antworten, "kurz").map((s) => s.id);
    const voll = sichtbareSchritte(antworten, "voll").map((s) => s.id);
    expect(voll.slice(0, kurz.length)).toEqual(kurz);
  });

  it("jede Seite traegt einen Umfang und eine nicht leere Feldliste", () => {
    for (const s of KATALOG) {
      expect(["kurz", "voll"]).toContain(s.umfang);
      expect(s.felder.length).toBeGreaterThan(0);
    }
  });

  it("die ersten sechs Seiten sind kurz, die sieben dahinter voll", () => {
    // Ohne diese Zusage sind die beiden Ketten-Faelle unten LEER erfuellbar:
    // Solange keine Seite "kurz" traegt, ist die kurze Kette leer – und eine
    // leere Kette enthaelt weder eine volle Seite noch widerspricht sie dem
    // Anfang der vollen. Genau so sah es vor dieser Aufgabe aus, und genau so
    // waeren beide Faelle gruen geblieben. Umgekehrt bliebe auch ein
    // versehentliches `umfang: "kurz"` auf "objekt_details" unbemerkt, weil
    // die Pruefung oben nur den Wertebereich kennt, nicht die Seite.
    expect(KATALOG.slice(0, 6).every((s) => s.umfang === "kurz")).toBe(true);
    expect(KATALOG.slice(6).every((s) => s.umfang === "voll")).toBe(true);
  });

  it("traegt genau die 63 Felder von frueher – Seite, ID und Zielspalte", () => {
    const ist = KATALOG.flatMap((s) =>
      s.felder.map((f) => {
        const ziel = !f.ziel ? null : "liste" in f.ziel ? `${f.ziel.entitaet}[]` : `${f.ziel.entitaet}.${f.ziel.feld}`;
        return [s.id, f.id, ziel] as [string, string, string | null];
      })
    );
    expect(ist).toEqual(FELDER);
  });

  it("Feld-IDs sind je Seite eindeutig", () => {
    // Zwei gleich benannte Felder auf einer Seite ergaeben denselben
    // Antwortschluessel – die zweite Antwort ueberschriebe die erste.
    for (const s of KATALOG) {
      const ids = s.felder.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("die Personenseiten tragen Spalten", () => {
    for (const id of ["personen", "person_details", "beruf_details", "einnahmen"]) {
      expect(KATALOG.find((s) => s.id === id)?.personenSpalten).toBe(true);
    }
  });

  it("der Fortschritt zaehlt 'von 6' im kurzen Weg", () => {
    // Die angezeigte Gesamtzahl ist der Grund, weiterzumachen oder
    // abzubrechen – sie ist die eigentliche Zusicherung dieser Arbeit.
    const antworten = { "vorhaben.art": "kauf_bestand" };
    expect(fortschritt("vorhaben", antworten, "kurz").gesamt).toBe(6);
  });

  it("die Uebernahme liest einen kurz ausgefuellten Bogen vollstaendig", () => {
    // Auch die zweite Spalte: Wer zu zweit anfragt, darf seinen Partner nicht
    // beim Uebernehmen verlieren.
    const antworten = {
      "vorhaben.art": "kauf_bestand",
      "haushalt.anzahl": "2",
      "p1.personen.nachname": "Eins",
      "p2.personen.nachname": "Zwei",
    };
    const plan = planUebernahme(antworten, {
      applicants: [
        { id: "a1", position: 1 },
        { id: "a2", position: 2 },
      ],
      property: null,
      financingRequest: null,
      caseFelder: { financingType: null },
    });
    const nachnamen = plan.vorschlaege.filter((v) => v.ziel.feld === "nachname");
    expect(nachnamen.map((v) => v.kundenwert).sort()).toEqual(["Eins", "Zwei"]);
  });
});
