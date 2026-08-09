import type { DocumentType } from "@/lib/domain/enums";

/**
 * BaufiDesk-Dokumenttyp -> Europace-Kategorie.
 *
 * Die Zielwerte stammen aus schema/dokument-kategorien.json (offizielle Liste
 * der Dokumente-API, 90 Eintraege). Wo BaufiDesk feiner unterscheidet als
 * Europace, laufen mehrere Typen auf dieselbe Kategorie - das ist gewollt:
 *
 * - bwa/susa/jahresabschluss/euer: Europace kennt nur "BWA" als Kategorie
 *   fuer betriebswirtschaftliche Unterlagen Selbststaendiger. SuSa,
 *   Jahresabschluss und EUER werden laut BaufiDesk-Checkliste vom selben
 *   Steuerberater im selben Bundle wie die BWA geliefert - fachlich dieselbe
 *   Schublade.
 * - einkommensteuererklaerung: Europace hat "Einkommensteuer" (allgemein)
 *   und "Einkommensteuerbescheid" (nur der Bescheid) getrennt. Die Erklaerung
 *   selbst faellt unter "Einkommensteuer".
 *
 * Typen ohne fachlich passende Kategorie liegen bewusst auf "Sonstiges"
 * (siehe Task-6-Bericht fuer die Begruendung je Typ) - ein aehnlich
 * klingender, aber falscher Wert wuerde die Unterlage bei der Bank unter dem
 * falschen Reiter ablegen.
 */
const KATEGORIE: Record<DocumentType, string> = {
  personalausweis: "Ausweis",
  gehaltsabrechnung: "Gehaltsabrechnung",
  grundbuchauszug: "Grundbuchauszug",
  expose: "Expose",
  kontoauszug: "Kontoauszug",
  einkommensteuerbescheid: "Einkommensteuerbescheid",
  einkommensteuererklaerung: "Einkommensteuer",
  eigenkapitalnachweis: "Vermoegensuebersicht",
  kaufvertragsentwurf: "Kaufvertrag",
  teilungserklaerung: "Teilungserklaerung",
  wohnflaechenberechnung: "Berechnungen",
  flurkarte_lageplan: "Plankarten",
  baubeschreibung: "Baubeschreibung",
  baukostenaufstellung: "Kostenaufstellung",
  baugenehmigung: "Baugenehmigung",
  darlehensvertrag: "Sonstiges",
  restschuldnachweis: "Saldenmitteilung",
  mietvertrag: "Mietvertrag",
  mietaufstellung: "Sonstige_Einnahmen",
  bwa: "BWA",
  susa: "BWA",
  jahresabschluss: "BWA",
  euer: "BWA",
  rentenbescheid: "Rentenbescheid",
  versicherungsnachweis: "Gebaeudeversicherung",
  sonstige: "Sonstiges",
};

export function europaceKategorie(typ: DocumentType | null): string {
  return (typ && KATEGORIE[typ]) || "Sonstiges";
}
