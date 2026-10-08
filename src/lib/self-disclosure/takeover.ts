import { sichtbareSchritte, personenSchluessel, offeneFelder } from "@/lib/self-disclosure/navigation";
import { KATALOG, anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import type { Antworten, Feld, Schritt, Ziel } from "@/lib/self-disclosure/types";
import { KATALOG_ZU_FINANZIERUNGSART } from "@/lib/self-disclosure/finanzierungsart";

/**
 * Vergleicht die Antworten des Kunden mit dem aktuellen Fallstand und macht
 * daraus Vorschläge. Reine Funktion, ohne Datenbank – die Vorschläge werden bei
 * jedem Aufruf frisch gerechnet und können deshalb nicht veralten.
 *
 * Zwei Grundsätze, die hier durchgesetzt werden:
 *  - Eine Lücke erzeugt NIE einen Vorschlag. Ein übersprungenes Feld darf einen
 *    gepflegten Wert nicht mit Leere überschreiben.
 *  - Ein abweichender Wert wird nur gezeigt, nie vorausgewählt (das entscheidet
 *    die Oberfläche anhand von `art`).
 */
export interface Fallstand {
  applicants: Array<{ position: number } & Record<string, unknown>>;
  property: Record<string, unknown> | null;
  financingRequest: Record<string, unknown> | null;
  caseFelder: Record<string, unknown>;
}

export interface Vorschlag {
  schluessel: string;
  label: string;
  abschnitt: string;
  kundenwert: string;
  fallwert: string | null;
  art: "luecke" | "abweichung";
  ziel: { entitaet: string; feld: string; person?: 1 | 2 };
}

export interface Uebernahmeplan {
  vorschlaege: Vorschlag[];
  /** Vom Kunden übersprungen – die Nachfassliste. */
  offen: Array<{ label: string; abschnitt: string }>;
  /** Angaben, für die es (noch) kein Zielfeld gibt, etwa Warmmiete. */
  ohneZiel: Array<{ label: string; wert: string }>;
}

const alsText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/** Der aktuell im Fall gespeicherte Wert für ein Ziel – oder null. */
function fallwertLesen(
  stand: Fallstand,
  ziel: Extract<Ziel, { feld: string }>,
  person: 1 | 2
): string | null {
  const leerZuNull = (v: unknown) => {
    const t = alsText(v);
    return t === "" ? null : t;
  };
  switch (ziel.entitaet) {
    case "case":
      return leerZuNull(stand.caseFelder[ziel.feld]);
    case "property":
      return leerZuNull(stand.property?.[ziel.feld]);
    case "financingRequest":
      return leerZuNull(stand.financingRequest?.[ziel.feld]);
    case "applicant": {
      const a = stand.applicants.find((x) => x.position === person);
      return leerZuNull(a?.[ziel.feld]);
    }
    default:
      // income/employment/selfEmployment hängen an eigenen Datensätzen, die
      // erst beim Übernehmen entstehen. Für den Vergleich zählen sie als leer.
      return null;
  }
}

/** Eine tatsächlich gegebene Antwort, samt allem, was der Plan darüber weiß. */
interface Beantwortet {
  schritt: Schritt;
  feld: Feld;
  spaltenPerson?: 1 | 2;
  schluessel: string;
  kundenwert: string;
  /** Trägt die Bedingung des Felds (samt Seite und Spalte) bei DIESEN Antworten noch? */
  sichtbar: boolean;
  /**
   * Antwort einer Person, die es laut Haushaltsangabe nicht mehr gibt. Sie
   * wird gezeigt, aber nie vorgeschlagen: Beim Übernehmen legte ein Vorschlag
   * für Person 2 einen Antragsteller AN (`schreibeVorschlaege`).
   */
  ohnePerson: boolean;
}

/**
 * Alle Antworten, die der Kunde tatsächlich gegeben hat – in Katalogreihenfolge.
 *
 * Bewusst ALLE Felder ALLER Seiten und BEIDER Personen-Spalten, nicht
 * `sichtbareFelder`/`sichtbareSchritte`: "Wer liest, nimmt die volle Kette."
 * Eine gegebene Antwort darf nicht verschwinden, nur weil der Kunde die
 * zugehörige Steuerantwort später geändert hat – sie steht ja weiterhin in
 * `answers` und der Vermittler muss sie sehen können. Ob die Bedingung noch
 * trägt, wird deshalb nur VERMERKT, nicht zum Filter gemacht.
 *
 * Die Regel galt bis 08.10.2026 nur auf Feldebene. Über `sichtbareSchritte`
 * fiel eine ganze Seite oder Spalte heraus, sobald IHRE Bedingung nicht mehr
 * trug: Wer erst „angestellt" wählte, den Arbeitgeber nannte und dann auf
 * „Rentner" umstellte, verlor den Arbeitgeber still aus Vorschlag und
 * „ohneZiel" – ebenso die Objektdetails, wenn „Immobilie gefunden"
 * zurückgenommen wurde.
 *
 * Umfang fest "voll": Der Bogen kann aus dem kurzen ODER dem vollen Weg
 * stammen, der Vermittler soll aber ALLES sehen, was der Kunde tatsächlich
 * beantwortet hat – ein "kurz" hier würde eine gegebene Antwort aus einem
 * Schritt verschweigen, der nur im vollen Katalog steht.
 */
function beantworteteFelder(antworten: Antworten): Beantwortet[] {
  const kette = sichtbareSchritte(antworten, "voll");
  const anzahl = anzahlAntragsteller(antworten);
  const out: Beantwortet[] = [];
  for (const schritt of KATALOG) {
    const imBogen = kette.find((s) => s.id === schritt.id);
    const spalten: Array<1 | 2 | undefined> = schritt.personenSpalten ? [1, 2] : [undefined];
    for (const spaltenPerson of spalten) {
      const spalteSichtbar =
        imBogen !== undefined &&
        (spaltenPerson === undefined || (imBogen.personen ?? []).includes(spaltenPerson));
      for (const feld of schritt.felder) {
        const schluessel = personenSchluessel(schritt.id, feld.id, spaltenPerson);
        const roh = antworten[schluessel];
        const kundenwert = alsText(roh);
        if (kundenwert === "" || (Array.isArray(roh) && roh.length === 0)) continue; // Lücke
        out.push({
          schritt,
          feld,
          spaltenPerson,
          schluessel,
          kundenwert,
          sichtbar:
            spalteSichtbar && (feld.sichtbar ? feld.sichtbar(antworten, spaltenPerson) : true),
          ohnePerson: spaltenPerson !== undefined && spaltenPerson > anzahl,
        });
      }
    }
  }
  return out;
}

/**
 * Zielspalte samt Person – die Ebene, auf der sich zwei Antworten schlagen.
 * Null für Antworten ohne Zielfeld, mit Listenziel oder einer weggefallenen
 * Person: Die schlagen sich nie und werden nur zur Kenntnis gezeigt.
 */
function zielGruppe(e: Beantwortet): string | null {
  if (e.ohnePerson) return null;
  if (!e.feld.ziel || "liste" in e.feld.ziel) return null;
  return `${e.feld.ziel.entitaet}.${e.feld.ziel.feld}|${e.spaltenPerson ?? ""}`;
}

/**
 * Wenn mehrere beantwortete Felder auf DIESELBE Spalte zeigen: welches gewinnt.
 *
 * Der Fall: `objekt_preis.kaufpreis` und `objekt_preis.grundstueck` zielen
 * beide auf `financingRequest.kaufpreis`, `restschuld`/`kapitalbedarf`/
 * `darlehen` alle drei auf `financingRequest.darlehenswunsch` – und seit dem
 * Katalogschnitt stehen sie auf IMMER sichtbaren Seiten. Wer im Bogen
 * zurueckgeht und die Vorhabensart wechselt, hat danach zwei Betraege in den
 * Antworten. Ohne diese Entscheidung wuerden daraus zwei Vorschlaege auf
 * dieselbe Spalte, und geschrieben wird in Katalogreihenfolge: Die letzte
 * Zuweisung gewinnt, stumm und beim oeffentlichen Weg ohne jede Rueckfrage.
 *
 * Es gewinnt das GERADE SICHTBARE Feld – es gehoert zu der Vorhabensart, die
 * der Kunde zuletzt gewaehlt hat. Traegt keines mehr seine Bedingung, bleibt es
 * beim ersten in Katalogreihenfolge: Irgendeine Zuordnung ist besser als gar
 * keine, und der Vermittler waehlt beim Uebernehmen ohnehin aus.
 */
function gewinnerJeZielspalte(eintraege: Beantwortet[]): Map<string, string> {
  const gewinner = new Map<string, Beantwortet>();
  for (const e of eintraege) {
    const gruppe = zielGruppe(e);
    if (gruppe === null) continue;
    const bisher = gewinner.get(gruppe);
    if (!bisher || (!bisher.sichtbar && e.sichtbar)) gewinner.set(gruppe, e);
  }
  return new Map([...gewinner].map(([gruppe, e]) => [gruppe, e.schluessel]));
}

export function planUebernahme(antworten: Antworten, stand: Fallstand): Uebernahmeplan {
  const vorschlaege: Vorschlag[] = [];
  const ohneZiel: Array<{ label: string; wert: string }> = [];

  const eintraege = beantworteteFelder(antworten);
  const gewinner = gewinnerJeZielspalte(eintraege);

  for (const e of eintraege) {
    const { feld, spaltenPerson, schluessel: k, kundenwert } = e;
    const personLabel = spaltenPerson ? ` (Antragsteller ${spaltenPerson})` : "";
    const label = `${feld.label}${personLabel}`;

    // Ohne Zielfeld, als Liste – oder von einer aktuelleren Antwort auf
    // dieselbe Spalte verdraengt: nur zur Kenntnis, nicht als Vorschlag.
    // Verloren geht dabei nichts, es schreibt nur nichts mehr blind.
    const gruppe = zielGruppe(e);
    if (gruppe === null || gewinner.get(gruppe) !== k) {
      ohneZiel.push({ label, wert: kundenwert });
      continue;
    }
    // Ab hier steht durch `zielGruppe` fest, dass es ein Spaltenziel ist.
    const ziel = feld.ziel as Extract<Ziel, { feld: string }>;

    // Die Kinderzahl gilt dem Haushalt: sie geht an beide Antragsteller.
    // (Die Seite "haushalt" traegt nur haushaltsweite Angaben.)
    const zielPersonen: Array<1 | 2> =
      e.schritt.id === "haushalt"
        ? (stand.applicants
            .map((a) => a.position)
            .filter((p): p is 1 | 2 => p === 1 || p === 2)
            .sort())
        : [spaltenPerson ?? 1];

    const mehrfach = zielPersonen.length > 1;
    for (const zielPerson of zielPersonen) {
      const fallwert = fallwertLesen(stand, ziel, zielPerson);
      // Verglichen wird, was BEIM UEBERNEHMEN in der Spalte staende – nicht
      // der Katalogwert selbst. Sonst stand "kauf" (Fall) gegen "kauf_bestand"
      // (Katalog), und der Vermittler bekam dauerhaft eine Abweichung
      // angezeigt, deren Uebernahme exakt nichts geaendert haette.
      const alsSpaltenwert =
        ziel.feld === "financingType"
          ? (KATALOG_ZU_FINANZIERUNGSART[kundenwert] ?? kundenwert)
          : kundenwert;
      if (fallwert === alsSpaltenwert) continue;
      vorschlaege.push({
        schluessel: mehrfach ? `${k}#p${zielPerson}` : k,
        label: mehrfach ? `${feld.label} (Antragsteller ${zielPerson})` : label,
        abschnitt: e.schritt.abschnitt,
        kundenwert,
        fallwert,
        art: fallwert === null ? "luecke" : "abweichung",
        ziel: { entitaet: ziel.entitaet, feld: ziel.feld, person: zielPerson },
      });
    }
  }

  return {
    vorschlaege,
    // Ebenso "voll": die Nachfassliste soll jede offene Frage des Katalogs
    // zeigen, unabhängig davon, ob der Bogen ueber den kurzen oder den vollen
    // Weg entstand.
    offen: offeneFelder(antworten, "voll").map((o) => ({ label: o.label, abschnitt: o.abschnitt })),
    ohneZiel,
  };
}
