/** Erlaubte Auszeichnung – bewusst knapp und ohne jedes Attribut. */
const ERLAUBT = new Set(["p", "br", "ul", "ol", "li", "strong", "em", "b", "i"]);

/** Elemente, deren INHALT ebenfalls verschwinden muss, nicht nur die Huelle. */
const MIT_INHALT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math"]);

/**
 * Sucht das Ende eines Tags ab Position `i` (auf dem "<").
 * Zaehlt wie der Browser: ein ">" innerhalb eines Anfuehrungszeichens
 * beendet den Tag NICHT. Gibt die Position nach dem ">" zurueck, oder -1,
 * wenn der Tag bis zum Ende der Eingabe offen bleibt.
 */
function tagEnde(s: string, i: number): number {
  let quote: string | null = null;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return j + 1;
    }
  }
  return -1;
}

/**
 * Macht aus dem bereits bereinigten HTML reinen Fliesstext.
 *
 * Gebraucht ueberall dort, wo der Inhalt gelesen statt angezeigt wird: in
 * einem KI-Prompt haben Tags nichts verloren, und ein woertliches Zitat laesst
 * sich nur gegen Klartext pruefen.
 *
 * Erwartet die Ausgabe von `bereinigeHtml` – dort sind Tags auf eine kurze,
 * attributlose Liste beschraenkt, weshalb hier ein einfacher Durchlauf reicht.
 */
export function nurText(html: string): string {
  if (!html) return "";
  return String(html)
    .replace(/<(?:br|\/p|\/li|\/ul|\/ol|\/div)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reduziert fremdes HTML auf einen sicheren Satz.
 *
 * Laeuft beim IMPORT, nicht beim Anzeigen: Was in der Datenbank steht, ist
 * bereits sauber. In diesem Projekt gab es fuer ungepruefen Fremdinhalt schon
 * einen Stored-XSS-Befund im Review.
 *
 * ARBEITSWEISE: ein Durchlauf von links nach rechts, der die Eingabe
 * verbraucht – kein Loeschen per Suchen-und-Ersetzen. Das ist der Kern der
 * Sicherheit: Ein ersetzender Bereiniger kann aus "<<div>img src=x onerror=…>"
 * durch Wegwerfen des <div> ein lebendiges <img …> verkleben, das kein
 * weiterer Durchlauf mehr sieht. Hier wird jedes "<", das keinen erlaubten
 * Tag eroeffnet, zu "&lt;" – dann bleibt nichts uebrig, was verkleben koennte.
 *
 * Bewusst ohne Fremdbibliothek: Die Eingabe ist eng umrissen (Europace liefert
 * Absaetze und Listen) und die erlaubte Menge kennt weder Attribute noch
 * Elemente, die den Auswertungsraum wechseln (kein svg, kein math, kein
 * style) – genau die Zutaten, aus denen mXSS gebaut wird.
 */
export function bereinigeHtml(roh: string): string {
  if (!roh) return "";
  const s = String(roh);

  let aus = "";
  let i = 0;
  /** Solange gesetzt, wird alles verworfen, bis dieses Element schliesst. */
  let verwirfBis: string | null = null;

  const schreibe = (t: string) => {
    if (!verwirfBis) aus += t;
  };

  while (i < s.length) {
    const c = s[i]!;

    if (c !== "<") {
      // Ein alleinstehendes ">" kann nichts oeffnen, wird aber maskiert,
      // damit die Ausgabe eindeutig bleibt.
      schreibe(c === ">" ? "&gt;" : c);
      i++;
      continue;
    }

    // Kommentare und <!DOCTYPE …>, <?xml …> – vollstaendig verwerfen.
    if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i);
      i = e === -1 ? s.length : e + 3;
      continue;
    }
    if (s.startsWith("<!", i) || s.startsWith("<?", i)) {
      const e = tagEnde(s, i);
      i = e === -1 ? s.length : e;
      continue;
    }

    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(s.slice(i));
    if (!m) {
      // Kein Tag-Anfang, nur ein Kleiner-als-Zeichen im Text.
      schreibe("&lt;");
      i++;
      continue;
    }

    const schliessend = m[1] === "/";
    const name = m[2]!.toLowerCase();
    const ende = tagEnde(s, i);
    // Ein Tag ohne ">" reicht bis zum Ende – der Browser verwirft ihn, wir auch.
    const naechstes = ende === -1 ? s.length : ende;

    if (verwirfBis) {
      // Innerhalb eines verworfenen Elements zaehlt nur sein Schlusstag.
      if (schliessend && name === verwirfBis) verwirfBis = null;
      i = naechstes;
      continue;
    }

    if (MIT_INHALT.has(name)) {
      // Ein Schlusstag ohne Anfang ist ein Rest – einfach schlucken.
      if (!schliessend) verwirfBis = name;
      i = naechstes;
      continue;
    }

    if (ERLAUBT.has(name) && ende !== -1) {
      schreibe(schliessend ? `</${name}>` : `<${name}>`);
    }
    // Alles andere (und angebrochene erlaubte Tags) faellt ersatzlos weg.
    i = naechstes;
  }

  return aus.trim();
}
