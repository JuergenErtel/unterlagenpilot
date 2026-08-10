/** Erlaubte Auszeichnung – bewusst knapp und ohne jedes Attribut. */
const ERLAUBT = new Set(["p", "br", "ul", "ol", "li", "strong", "em", "b", "i"]);

/** Elemente, deren INHALT ebenfalls verschwinden muss, nicht nur die Huelle. */
const MIT_INHALT = "script|style|iframe|object|embed|svg|math";

/**
 * Reduziert fremdes HTML auf einen sicheren Satz.
 *
 * Laeuft beim IMPORT, nicht beim Anzeigen: Was in der Datenbank steht, ist
 * bereits sauber. In diesem Projekt gab es fuer ungepruefen Fremdinhalt schon
 * einen Stored-XSS-Befund im Review.
 *
 * Bewusst ohne Fremdbibliothek: Die Eingabe ist eng umrissen (Europace liefert
 * Absaetze und Listen), und eine eigene, vollstaendig getestete Funktion ist
 * hier weniger Angriffsflaeche als eine weitere Abhaengigkeit.
 */
export function bereinigeHtml(roh: string): string {
  if (!roh) return "";

  let s = String(roh);

  // 1) Gefaehrliche Elemente samt Inhalt.
  s = s.replace(new RegExp(`<(${MIT_INHALT})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "");
  // 2) Deren unvollstaendige oder selbstschliessende Varianten.
  s = s.replace(new RegExp(`<\\/?(${MIT_INHALT})\\b[^>]*>`, "gi"), "");
  // 3) Kommentare – koennen bedingte Auswertung enthalten.
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // 4) Alle uebrigen Tags: erlaubte OHNE Attribute behalten, Rest entfernen.
  //    Damit fallen onclick, style, href und alles andere weg.
  s = s.replace(/<\/?([a-zA-Z0-9-]+)\b[^>]*>/g, (treffer, name: string) => {
    const tag = name.toLowerCase();
    if (!ERLAUBT.has(tag)) return "";
    return treffer.startsWith("</") ? `</${tag}>` : `<${tag}>`;
  });

  return s.trim();
}
