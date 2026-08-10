import type { DocumentType } from "@/lib/domain/enums";

/**
 * BaufiDesk-Dokumenttyp -> Europace-Kategorie.
 *
 * Die Zielwerte stammen aus schema/dokument-kategorien.json (offizielle Liste
 * der Dokumente-API, 90 Eintraege). Jede Zeile unten, deren Zielwert nicht
 * praktisch namensgleich mit dem BaufiDesk-Typ ist, traegt einen eigenen
 * Kommentar mit der fachlichen Begruendung - das ist die dauerhafte Quelle
 * dafuer, warum welcher Wert gewaehlt wurde (nicht der Task-Bericht, der nach
 * Planabschluss geloescht wird).
 *
 * Wo BaufiDesk feiner unterscheidet als Europace, laufen mehrere Typen
 * bewusst auf dieselbe Kategorie. Wo keine fachlich passende Kategorie
 * existiert, steht "Sonstiges" - ein aehnlich klingender, aber falscher
 * Wert waere schlechter: Er wuerde die Unterlage bei der Bank unter dem
 * falschen Reiter ablegen.
 */
/**
 * Exportiert, weil die Rueckrichtung (Europace-Kategorie -> BaufiDesk-Typ) in
 * src/lib/anforderungen/zuordnung.ts genau diese Tabelle umkehren muss. Zwei
 * getrennt gepflegte Tabellen wuerden auseinanderlaufen.
 */
export const KATEGORIE: Record<DocumentType, string> = {
  personalausweis: "Ausweis",
  gehaltsabrechnung: "Gehaltsabrechnung",
  grundbuchauszug: "Grundbuchauszug",
  expose: "Expose",
  kontoauszug: "Kontoauszug",
  einkommensteuerbescheid: "Einkommensteuerbescheid",
  // Europace trennt "Einkommensteuer" (Erklaerung/allgemein) vom Bescheid oben.
  einkommensteuererklaerung: "Einkommensteuer",
  // Checkliste nennt als Beispiele Kontoauszug/Depotauszug/Bausparvertrag -
  // das ist ein Nachweis der eigenen Vermoegenswerte, keine eigene Kategorie.
  eigenkapitalnachweis: "Vermoegensuebersicht",
  // Ein Entwurf ist fachlich ein Kaufvertrag.
  kaufvertragsentwurf: "Kaufvertrag",
  teilungserklaerung: "Teilungserklaerung",
  // Keine eigene Wohnflaechen-Kategorie vorhanden; "Berechnungen" ist der
  // generische Container fuer solche Nachweise.
  wohnflaechenberechnung: "Berechnungen",
  // Flurkarte + Lageplan sind Katasteramt-Plandokumente; "Bauplan" meint das
  // Gebaeude selbst, "Zahlungsplan" passt thematisch nicht.
  flurkarte_lageplan: "Plankarten",
  baubeschreibung: "Baubeschreibung",
  // Baukostenaufstellung ist eine spezielle Kostenaufstellung, keine eigene
  // Kategorie vorhanden.
  baukostenaufstellung: "Kostenaufstellung",
  baugenehmigung: "Baugenehmigung",
  // UNSICHER: "Bestehender Darlehensvertrag" (Anschlussfinanzierung/Ablösung)
  // hat keine passende Kategorie. "Privatkreditvertrag" waere ein Konsumkredit
  // (kein Baudarlehen), "Darlehensantrag" ist der Antrag statt des
  // unterschriebenen Vertrags, die uebrigen Vertragskategorien
  // (Bausparvertrag/Foerderdarlehen/Nachrangdarlehen) sind je ein
  // spezifischer Darlehenstyp. Jürgen sollte diese Zeile im Betrieb im Auge
  // behalten.
  darlehensvertrag: "Sonstiges",
  // "Aktueller Kontoauszug des Darlehenskontos" laut Checkliste = eine
  // Standmitteilung zur Restschuld, fachlich eine Saldenmitteilung.
  restschuldnachweis: "Saldenmitteilung",
  mietvertrag: "Mietvertrag",
  // Laut Checkliste eine "Übersicht aller vermieteten Einheiten mit
  // Kaltmiete" - eine Einkommensuebersicht, kein Vertrag; keine eigene
  // Mieteinnahmen-Kategorie vorhanden.
  mietaufstellung: "Sonstige_Einnahmen",
  // Fuer das Protokoll der Eigentuemerversammlung gibt es keine Kategorie. Die
  // drei vorhandenen Protokoll-Kategorien meinen etwas anderes:
  // "Beratungsprotokoll" ist die Beratungsdokumentation nach § 34i GewO,
  // "Uebergabeprotokoll" die Objektuebergabe, "Erlaeuterungsprotokoll" die
  // Produkterlaeuterung. Ein aehnlich klingender falscher Wert wuerde die
  // Unterlage bei der Bank unter dem falschen Reiter ablegen.
  weg_protokoll: "Sonstiges",
  bwa: "BWA",
  // Europace kennt keine eigenen Kategorien fuer SuSa/Jahresabschluss/EUER;
  // laut Checkliste "selbststaendiger_kauf" liefert derselbe Steuerberater
  // alle vier im selben Bundle wie die BWA - fachlich dieselbe Schublade.
  susa: "BWA",
  jahresabschluss: "BWA",
  euer: "BWA",
  rentenbescheid: "Rentenbescheid",
  // UNSICHER: Keywords in document-types.ts decken sowohl Gebaeude- als auch
  // Risikolebensversicherung ab, Europace hat aber keine generische
  // Versicherungsnachweis-Kategorie. "Gebaeudeversicherung" gewaehlt, weil
  // das bei Baufinanzierungen der Regelfall ist (Sicherungsabtretung); ein
  // hochgeladener Risikolebensversicherungs-Nachweis landet damit ebenfalls
  // hier - Jürgen sollte diese Zeile im Betrieb im Auge behalten.
  versicherungsnachweis: "Gebaeudeversicherung",
  sonstige: "Sonstiges",
};

export function europaceKategorie(typ: DocumentType | null): string {
  return (typ && KATEGORIE[typ]) || "Sonstiges";
}
