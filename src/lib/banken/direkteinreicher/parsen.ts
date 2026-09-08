/**
 * Liest den Wiki-Artikel "<Bank> - Direkteinreicherinformationen" aus dem
 * Europace-Zendesk: Ansprechpartner der Bank fuer Vermittler, mit Funktion,
 * Telefon und E-Mail, dazu die Anschrift.
 *
 * Reines Parsen ohne DOM – laeuft in Node und im Test. Die Artikel sind aus
 * Excel eingefuegte Tabellen mit Inline-Styles; alles, was hier nicht als
 * Tabelle erkannt wird, landet als Klartext in `hinweise`, damit nichts
 * stumm verloren geht.
 */

export interface Ansprechpartner {
  name: string;
  funktion: string;
  telefon: string;
  email: string;
}

export interface Direkteinreicherinfo {
  ansprechpartner: Ansprechpartner[];
  anschrift: string | null;
  /** Alles ausserhalb der erkannten Tabellen, als Klartext. */
  hinweise: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};

export function entitiesAufloesen(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/ /g, " ");
}

/**
 * HTML zu Klartext. Blockgrenzen werden zu Zeilenumbruechen – ohne das klebt
 * `textContent` "Strasse 60</p><p>89073 Ulm" zu "Strasse 6089073 Ulm" zusammen
 * (die Falle aus der Produktuebersicht).
 */
export function klartext(html: string): string {
  const t = html
    // Verweise behalten ihr Ziel – die Deutsche Bank verlinkt ihre
    // Ansprechpersonen nur als PDF-Anhang, der Text allein waere wertlos.
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) =>
      /^https?:/.test(href) ? `${text} (${href})` : text
    )
    // <br> traegt bei Zendesk Attribute – ohne \b[^>]* klebten Strasse und Ort zusammen.
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|figure|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " \t ")
    .replace(/<[^>]+>/g, "");
  return entitiesAufloesen(t)
    .split("\n")
    .map((z) => z.replace(/[ \t]+/g, " ").trim())
    .filter((z, i, a) => z !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n")
    .trim();
}

type Block =
  | { art: "ueberschrift"; text: string }
  | { art: "tabelle"; zeilen: string[][] }
  | { art: "text"; text: string };

/** Zerlegt den Artikel in Ueberschriften, Tabellen und Fliesstext – in Lesereihenfolge. */
export function bloecke(html: string): Block[] {
  const raus: Block[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>|<table[^>]*>([\s\S]*?)<\/table>/gi;
  let letzte = 0;
  let m: RegExpExecArray | null;
  const text = (s: string) => {
    const t = klartext(s);
    if (t) raus.push({ art: "text", text: t });
  };
  while ((m = re.exec(html))) {
    text(html.slice(letzte, m.index));
    letzte = m.index + m[0].length;
    if (m[2] !== undefined) {
      raus.push({ art: "ueberschrift", text: klartext(m[2] ?? "") });
    } else {
      const zeilen: string[][] = [];
      const zr = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let z: RegExpExecArray | null;
      while ((z = zr.exec(m[3] ?? ""))) {
        const zellen: string[] = [];
        const cr = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let c: RegExpExecArray | null;
        while ((c = cr.exec(z[1] ?? ""))) zellen.push(klartext(c[1] ?? ""));
        if (zellen.some((x) => x !== "")) zeilen.push(zellen);
      }
      raus.push({ art: "tabelle", zeilen });
    }
  }
  text(html.slice(letzte));
  return raus;
}

type Feld = keyof Ansprechpartner;

/** Welches Feld eine Beschriftungszelle meint – null, wenn keine Beschriftung. */
export function feldAusBeschriftung(zelle: string): Feld | null {
  const s = zelle.toLowerCase().replace(/[\s:.\-]/g, "");
  if (!s) return null;
  if (/^(e?mail|emailadresse|mailadresse)$/.test(s)) return "email";
  if (/^(telefon|telefonnummer|telefonnr|tel|telnr|rufnummer|durchwahl|mobil|mobilnummer|handy|telefonmobil)$/.test(s)) return "telefon";
  if (/^(funktion|position|aufgabe|taetigkeit|tätigkeit|rolle|zustaendigkeit|zuständigkeit|bereich)$/.test(s)) return "funktion";
  if (/^(ansprechpartner|ansprechpartnerin|ansprechperson|name|kontakt|ansprechpartner\/in)$/.test(s)) return "name";
  return null;
}

const leer = (): Ansprechpartner => ({ name: "", funktion: "", telefon: "", email: "" });
const hatInhalt = (a: Ansprechpartner) => Object.values(a).some((v) => v.trim() !== "");

/**
 * Liest Ansprechpartner aus einer Tabelle. Zwei Bauarten kommen vor:
 * Beschriftung in der ERSTEN SPALTE, eine Spalte je Person (Sparkasse Ulm) –
 * oder Beschriftung in der ERSTEN ZEILE, eine Zeile je Person.
 * Gibt null zurueck, wenn die Tabelle keine der beiden ist.
 */
export function ansprechpartnerAusTabelle(zeilen: string[][]): Ansprechpartner[] | null {
  if (zeilen.length === 0) return null;
  const spaltenFelder = zeilen.map((z) => feldAusBeschriftung(z[0] ?? ""));
  const kopfFelder = (zeilen[0] ?? []).map(feldAusBeschriftung);
  const spaltenTreffer = spaltenFelder.filter(Boolean).length;
  const kopfTreffer = kopfFelder.filter(Boolean).length;

  if (spaltenTreffer >= 2 && spaltenTreffer >= kopfTreffer) {
    const breite = Math.max(...zeilen.map((z) => z.length));
    const personen: Ansprechpartner[] = [];
    for (let s = 1; s < breite; s++) {
      const p = leer();
      zeilen.forEach((z, i) => {
        const f = spaltenFelder[i];
        const wert = (z[s] ?? "").trim();
        if (f && wert) p[f] = p[f] ? `${p[f]}\n${wert}` : wert;
      });
      if (hatInhalt(p)) personen.push(p);
    }
    return personen;
  }
  if (kopfTreffer >= 2) {
    const personen: Ansprechpartner[] = [];
    for (const z of zeilen.slice(1)) {
      const p = leer();
      kopfFelder.forEach((f, i) => {
        const wert = (z[i] ?? "").trim();
        if (f && wert) p[f] = p[f] ? `${p[f]}\n${wert}` : wert;
      });
      if (hatInhalt(p)) personen.push(p);
    }
    return personen;
  }
  return null;
}

const istAnschrift = (u: string) => /anschrift|adresse|postanschrift/i.test(u);

const TELEFON = /(?:\+49|0)[\d\s()\/.-]{5,}\d/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/**
 * Tabelle ohne Beschriftung, aber mit Telefonnummern oder E-Mails in den
 * Zellen (Allianz: Thema | Zustaendigkeit | Kontakt). Erste Zelle ist der
 * Name bzw. das Thema, Zellen mit @ die E-Mail, Zellen mit Rufnummer das
 * Telefon, der Rest die Funktion. Null, wenn keine Zeile einen Kontaktweg hat.
 */
export function ansprechpartnerAusKontaktTabelle(zeilen: string[][]): Ansprechpartner[] | null {
  const personen: Ansprechpartner[] = [];
  for (const z of zeilen) {
    const zellen = z.map((x) => x.trim());
    if (zellen.length < 2 || !zellen.some((x) => EMAIL.test(x) || TELEFON.test(x))) continue;
    const p = leer();
    p.name = zellen[0] ?? "";
    for (const zelle of zellen.slice(1)) {
      if (!zelle) continue;
      for (const teil of zelle.split("\n").map((t) => t.trim()).filter(Boolean)) {
        const feld: Feld = EMAIL.test(teil) ? "email" : TELEFON.test(teil) ? "telefon" : "funktion";
        p[feld] = p[feld] ? `${p[feld]}\n${teil}` : teil;
      }
    }
    if (hatInhalt(p)) personen.push(p);
  }
  return personen.length > 0 ? personen : null;
}

/**
 * Vorlage ohne Inhalt: Beschriftungen vorhanden, aber alle Datenzellen leer
 * (VR-Bank Ostbayern-Mitte: "Ansprechpartner · Funktion · Telefon" und drei
 * leere Zeilen). Eine Tabelle OHNE Beschriftungen ist keine Vorlage – die
 * einspaltige Anschrift-Tabelle muss durch.
 */
function istLeereVorlage(zeilen: string[][]): boolean {
  const zellen = zeilen.flat().map((x) => x.trim());
  const beschriftungen = zellen.filter((x) => feldAusBeschriftung(x) !== null);
  if (beschriftungen.length === 0) return false;
  return zellen.filter((x) => x !== "" && feldAusBeschriftung(x) === null).length === 0;
}

/** Zendesk-Platzhalter fuer einen Artikel ohne Inhalt. */
export function istLeererArtikel(html: string): boolean {
  const t = klartext(html ?? "");
  return (
    t === "" ||
    /^_+$/.test(t) ||
    /^es (gibt|liegen) keine (aktuellen )?[\wäöüß-]+( vor)?\.?$/i.test(t)
  );
}

export function parseDirekteinreicher(html: string): Direkteinreicherinfo {
  if (istLeererArtikel(html)) return { ansprechpartner: [], anschrift: null, hinweise: null };
  const ansprechpartner: Ansprechpartner[] = [];
  const anschriften: string[] = [];
  const hinweise: string[] = [];
  let ueberschrift = "";

  for (const b of bloecke(html)) {
    if (b.art === "ueberschrift") {
      ueberschrift = b.text;
      continue;
    }
    if (b.art === "text") {
      hinweise.push(ueberschrift && !istAnschrift(ueberschrift) ? `${ueberschrift}: ${b.text}` : b.text);
      continue;
    }
    if (b.zeilen.length === 0 || istLeereVorlage(b.zeilen)) continue;
    // "Postadresse" steht bei manchen Banken nicht als Ueberschrift, sondern
    // als einzige Kopfzelle der Tabelle.
    const kopf = b.zeilen[0] ?? [];
    const tabellenAnschrift = kopf.length === 1 && istAnschrift(kopf[0] ?? "");
    const personen = tabellenAnschrift
      ? null
      : ansprechpartnerAusTabelle(b.zeilen) ?? ansprechpartnerAusKontaktTabelle(b.zeilen);
    if (personen && personen.length > 0) {
      ansprechpartner.push(...personen);
      continue;
    }
    const zeilen = tabellenAnschrift ? b.zeilen.slice(1) : b.zeilen;
    const text = zeilen.map((z) => z.filter((x) => x).join(" · ")).filter(Boolean).join("\n");
    if (!text) continue;
    if (tabellenAnschrift || istAnschrift(ueberschrift)) anschriften.push(text);
    else hinweise.push(ueberschrift ? `${ueberschrift}\n${text}` : text);
  }

  return {
    ansprechpartner,
    anschrift: anschriften.length ? anschriften.join("\n\n") : null,
    hinweise: hinweise.length ? hinweise.join("\n\n") : null,
  };
}
