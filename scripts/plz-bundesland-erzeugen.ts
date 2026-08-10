/**
 * Erzeugt src/lib/machbarkeit/plz-bundesland.json aus dem GeoNames-Datensatz.
 *
 *   curl -o /tmp/DE.zip https://download.geonames.org/export/zip/DE.zip
 *   unzip -o /tmp/DE.zip -d /tmp
 *   npx tsx scripts/plz-bundesland-erzeugen.ts /tmp/DE.txt
 *
 * Warum ein Generator statt einer handgepflegten Tabelle: Eine Gemeinde gehoert
 * zu genau einem Bundesland, aber PLZ-Gebiete sind an Zustellwegen geschnitten
 * und laufen an rund 35 Stellen ueber eine Landesgrenze. Nur PLZ UND Ort
 * zusammen sind eindeutig.
 *
 * Quelle: GeoNames postal codes (CC BY 4.0), https://download.geonames.org/export/zip/
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SLUG: Record<string, string> = {
  // Buchstabencodes
  BW: "baden_wuerttemberg", BY: "bayern", BE: "berlin", BB: "brandenburg",
  HB: "bremen", HH: "hamburg", HE: "hessen", MV: "mecklenburg_vorpommern",
  NI: "niedersachsen", NW: "nordrhein_westfalen", RP: "rheinland_pfalz",
  SL: "saarland", SN: "sachsen", ST: "sachsen_anhalt", SH: "schleswig_holstein",
  TH: "thueringen",
  // Numerische Codes derselben Quelle
  "01": "baden_wuerttemberg", "02": "bayern", "03": "bremen", "04": "hamburg",
  "05": "hessen", "06": "niedersachsen", "07": "nordrhein_westfalen",
  "08": "rheinland_pfalz", "09": "saarland", "10": "schleswig_holstein",
  "11": "brandenburg", "12": "mecklenburg_vorpommern", "13": "sachsen",
  "14": "sachsen_anhalt", "15": "thueringen", "16": "berlin",
};

/**
 * Grossempfaenger-PLZ gehoeren einer Firma, nicht einem Ort – und GeoNames
 * traegt dort den Firmensitz ein, der im falschen Bundesland liegen kann
 * (10875 ist Berlin, steht aber bei Daimler unter Baden-Wuerttemberg).
 * Eine Immobilie hat nie eine solche PLZ, also fliegen diese Zeilen raus.
 */
const FIRMA =
  /\b(gmbh|mbh|\bag\b|kgaa|\bkg\b|ohg|e\.?\s?v\.?|co\.|bank|versicherung|krankenkasse|amtsgericht|verwaltung|postfach|deutsche\s|bundes|sparkasse|stiftung|verlag|redaktion)/i;

const normOrt = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/\s+/g, " ");

/**
 * Korrektur eines Fehlers in der Quelle: GeoNames fuehrt Hamburger Stadtteile
 * ("Hamburg Bergedorf", "Hamburg Rahlstedt") unter Schleswig-Holstein. Ein Ort,
 * der "Hamburg"/"Berlin"/"Bremen" heisst oder so beginnt, liegt im jeweiligen
 * Stadtstaat – das ist keine Auslegung, sondern Definition.
 *
 * Nachbarorte wie Boernsen oder Escheburg beginnen NICHT mit dem Stadtnamen und
 * bleiben deshalb korrekt bei Schleswig-Holstein.
 */
const STADTSTAATEN: Array<[RegExp, string]> = [
  [/^hamburg\b/i, "hamburg"],
  [/^berlin\b/i, "berlin"],
  [/^bremen\b/i, "bremen"],
];

function korrigiereStadtstaat(ort: string, land: string): string {
  for (const [muster, slug] of STADTSTAATEN) {
    if (muster.test(ort.trim())) return slug;
  }
  return land;
}

const quelle = process.argv[2];
if (!quelle) {
  console.error("Aufruf: npx tsx scripts/plz-bundesland-erzeugen.ts <DE.txt>");
  process.exit(1);
}

interface Zeile {
  plz: string;
  ort: string;
  land: string;
  istFirma: boolean;
}

const zeilen: Zeile[] = readFileSync(quelle, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((z) => z.split("\t"))
  .filter((f) => f.length > 4 && /^\d{5}$/.test(f[1] ?? ""))
  .map((f) => {
    const ort = f[2] ?? "";
    const roh = SLUG[(f[4] ?? "").trim()] ?? "";
    return { plz: f[1] as string, ort, land: korrigiereStadtstaat(ort, roh), istFirma: FIRMA.test(ort) };
  })
  .filter((z) => z.land !== "");

// Je PLZ: erst die echten Ortszeilen, Firmenzeilen nur als Rueckfall.
const jePlz = new Map<string, Zeile[]>();
for (const z of zeilen) {
  const liste = jePlz.get(z.plz) ?? [];
  liste.push(z);
  jePlz.set(z.plz, liste);
}

const eindeutig: Record<string, string> = {};
const mehrdeutig: Record<string, Record<string, string>> = {};

for (const [plz, alle] of jePlz) {
  const orte = alle.filter((z) => !z.istFirma);

  // Reine Grossempfaenger-PLZ: es gibt keinen Ort, nur Firmen. Firmennamen als
  // "Ort" abzulegen waere nutzlos – hier entscheidet die Mehrheit.
  if (orte.length === 0) {
    const zaehler = new Map<string, number>();
    for (const z of alle) zaehler.set(z.land, (zaehler.get(z.land) ?? 0) + 1);
    const [gewinner] = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (gewinner) eindeutig[plz] = gewinner;
    continue;
  }

  const laender = new Set(orte.map((z) => z.land));
  if (laender.size === 1) {
    eindeutig[plz] = [...laender][0] as string;
    continue;
  }
  // Echter Grenzfall: der Ort entscheidet.
  const zuordnung: Record<string, string> = {};
  for (const z of orte) zuordnung[normOrt(z.ort)] = z.land;
  mehrdeutig[plz] = zuordnung;
}

const ausgabe = {
  stand: new Date().toISOString().slice(0, 10),
  quelle: "GeoNames postal codes (CC BY 4.0), https://download.geonames.org/export/zip/DE.zip",
  eindeutig,
  mehrdeutig,
};

const ziel = resolve("src/lib/machbarkeit/plz-bundesland.json");
writeFileSync(ziel, JSON.stringify(ausgabe));
console.log(
  `${ziel}: ${Object.keys(eindeutig).length} eindeutige, ${Object.keys(mehrdeutig).length} mehrdeutige PLZ`
);
