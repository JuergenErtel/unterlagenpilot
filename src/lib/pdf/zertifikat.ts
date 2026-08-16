/**
 * Finanzierungszertifikat – das Papier, das ein Kaufinteressent dem Makler
 * vorlegt, um zu zeigen, dass die Finanzierung trägt.
 *
 * Nachgebaut nach dem Vorbild in FinLink (Vorlage vom 16.08.2026). Dessen
 * Bauart ist bewusst übernommen, nicht „verbessert":
 *
 * - **Eine einzige große Zahl**, und das ist der KAUFPREIS. Nicht die
 *   Darlehenssumme, nicht die Rate. Der Makler will wissen, bis wohin der
 *   Interessent bieten kann – alles andere ist seine Sache nicht.
 * - **Kein Gültigkeitsdatum**, nur ein Erstellungsdatum. FinLink hat keins,
 *   und ein selbst erfundener Ablauf würde ein fremdes Papier nachahmen, das
 *   es so nicht gibt.
 * - **Ein konkretes Objekt.** Das Zertifikat lautet „Gilt für eine Immobilie
 *   in <Adresse>". Ohne Objekt gibt es keins (Jürgens Entscheidung,
 *   16.08.2026) – siehe `zertifikatFehlendeAngaben`.
 *
 * Diese Datei ist rein und ohne Datenbank, damit die Torprüfung und der
 * Textaufbau testbar bleiben.
 */

/** Was das Zertifikat an Angaben braucht – geprüft, bevor der Knopf freigibt. */
export interface ZertifikatEingabe {
  kaufpreis: number | null;
  objektStrasse: string | null;
  objektPlz: string | null;
  objektOrt: string | null;
  antragsteller: Array<{ vorname: string | null; nachname: string | null }>;
}

/**
 * Welche Angaben noch fehlen, in der Sprache der Oberfläche.
 *
 * Leere Liste heißt: erzeugbar. Die Liste ist die Beschriftung unter dem
 * gesperrten Knopf – deshalb ganze Wörter, keine Feldnamen.
 */
export function zertifikatFehlendeAngaben(e: ZertifikatEingabe): string[] {
  const fehlt: string[] = [];

  // Die große Zahl. Ohne sie hätte das Papier keine Aussage – und eine 0 ist
  // keine gültige Aussage, sondern ein leer gelassenes Feld.
  if (e.kaufpreis == null || e.kaufpreis <= 0) fehlt.push("Kaufpreis");

  // Straße UND Ort: „Gilt für eine Immobilie in 76744" wäre keine Adresse.
  const hatStrasse = (e.objektStrasse ?? "").trim() !== "";
  const hatOrt = (e.objektOrt ?? "").trim() !== "";
  if (!hatStrasse || !hatOrt) fehlt.push("Objektadresse");

  // Mindestens ein Name – das Zertifikat lautet auf eine Person.
  const hatNamen = e.antragsteller.some(
    (a) => [a.vorname, a.nachname].filter(Boolean).join(" ").trim() !== ""
  );
  if (!hatNamen) fehlt.push("Name des Antragstellers");

  return fehlt;
}

export function zertifikatErzeugbar(e: ZertifikatEingabe): boolean {
  return zertifikatFehlendeAngaben(e).length === 0;
}

/**
 * Die Adresszeile hinter „Gilt für eine Immobilie in".
 *
 * Fehlende Teile fallen weg statt als Lücke oder „undefined" zu erscheinen;
 * dass Straße und Ort dasein MÜSSEN, entscheidet die Torprüfung oben.
 */
export function objektZeile(e: Pick<ZertifikatEingabe, "objektStrasse" | "objektPlz" | "objektOrt">): string {
  const ortsteil = [e.objektPlz, e.objektOrt].map((t) => (t ?? "").trim()).filter(Boolean).join(" ");
  return [(e.objektStrasse ?? "").trim(), ortsteil].filter(Boolean).join(", ");
}

/**
 * Die Namenszeile: „Mate Topcic" bzw. „Mate Topcic und Jadranka Topcic".
 *
 * Namenlose Antragsteller fallen heraus – ein Zertifikat, das auf „ und
 * Jadranka Topcic" lautet, gibt niemand aus der Hand.
 */
export function namensZeile(antragsteller: ZertifikatEingabe["antragsteller"]): string {
  return antragsteller
    .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ").trim())
    .filter((n) => n !== "")
    .join(" und ");
}

/**
 * Der Bescheinigungssatz. Wörtlich nach dem Vorbild, nur die Einzahl-/
 * Mehrzahlklammer aufgelöst – „der unten genannten Person(en)" liest sich auf
 * einem Papier für den Makler wie ein unfertiges Formular.
 */
export function bescheinigungsSatz(anzahlPersonen: number): string {
  const person = anzahlPersonen > 1 ? "der unten genannten Personen" : "der unten genannten Person";
  return `Hiermit bescheinigen wir – nach erfolgreicher Prüfung mit den Angaben ${person} – eine mögliche Baufinanzierung für den Kauf einer Immobilie zum unten genannten Kaufpreis.`;
}

/**
 * Der Vorbehalt. Wörtlich aus dem Vorbild übernommen: Er ist der Grund, warum
 * das Papier unbedenklich ist, und genau deshalb wird er nicht umformuliert.
 */
export const VORBEHALT =
  "Dieses Finanzierungszertifikat ist noch keine Kredit- oder Konditionenzusage. Der Finanzierung können wir erst nach der Beleihungswertermittlung und der finalen Kreditwürdigkeitsprüfung endgültig zusagen.";

/** Euro ohne Nachkommastellen – die große Zahl trägt keine Cent. */
export function euroGanz(betrag: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(betrag))} Euro`;
}
