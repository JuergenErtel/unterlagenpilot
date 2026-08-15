/**
 * Telefonnummern für Wähl- und WhatsApp-Links aufbereiten.
 *
 * Kundennummern stehen im Freitext: "0170 1234567", "+49 170 1234567",
 * "(0170) 123-4567". Für `tel:` ist das gleichgültig, `wa.me` verlangt dagegen
 * die internationale Form ohne Pluszeichen.
 *
 * Im Zweifel lieber KEIN Link: Ein Link auf eine falsch geratene Nummer
 * schreibt an einen Fremden.
 */

/** Kürzeste Nummer, die noch plausibel ist (Vorwahl + Anschluss). */
const MINDESTLAENGE = 7;

/** Maximum für E.164 (internationale Telefonnummern). */
const MAX_LAENGE_E164 = 15;

/** Maximum für deutsche Nummern mit führender 0 (vor Normalisierung): 9+3=12. */
const MAX_LAENGE_DEUTSCH_MIT_NULL = 12;

/** Minimum für deutsche Nummern: 49 + 2-stellige Vorwahl + 5-stellige Rufnummer = 9. */
const MIN_LAENGE_DEUTSCH = 9;

/** Maximum für deutsche Nummern nach Normalisierung: 49 + 11 Ziffern ohne führende 0. */
const MAX_LAENGE_DEUTSCH = 13;

/** Minimum für internationale Nummern (nach Normalisierung). */
const MIN_LAENGE_INTERNATIONAL = 8;

/**
 * Deutsche Mobilfunk-Vorwahlen ohne führende Null – zusammen mit
 * `LAENGE_DEUTSCHE_MOBIL_OHNE_NULL` das Erkennungsmerkmal für die doppelte
 * Null (siehe `waLink`). Es gibt keine Ländervorwahl 15/16/17, deshalb kostet
 * diese Ausnahme keine gültige Auslandsnummer.
 */
const DEUTSCHE_MOBIL_PRAEFIXE = ["15", "16", "17"];

/** Länge einer deutschen Mobilnummer ohne führende Null: z. B. 170 1234567. */
const LAENGE_DEUTSCHE_MOBIL_OHNE_NULL = 10;

function ziffern(nummer: string): string {
  return nummer.replace(/\D/g, "");
}

/**
 * Erkennt die doppelte Null vor einer deutschen Mobilnummer und gibt sie ohne
 * führende Null zurück ("00170 1234567" → "1701234567"); sonst `null`.
 *
 * EINE Regel, ZWEI Leser (`telLink` und `waLink`). Als die Ausnahme nur in
 * `waLink` stand, verstanden die beiden Funktionen dieselbe Eingabe
 * verschieden – der WhatsApp-Link zeigte auf die deutsche Nummer, der
 * Wähl-Link auf eine Auslandswahl ins Leere. Zwei Deutungen derselben Ziffern
 * sind eine Falle für den Nächsten.
 *
 * Warum das sicher ist: Es gibt keine Ländervorwahl 15/16/17, und die Ausnahme
 * greift nur bei GENAU zehn Ziffern. Eine elfstellige Restnummer bleibt
 * international – dort wäre die nordamerikanische Deutung (Ländercode 1 plus
 * zehn Ziffern) genauso plausibel, und bei Gleichstand gilt der Dateikopf:
 * im Zweifel nicht umdeuten.
 */
function deutscheMobilnummerNachDoppelterNull(roh: string): string | null {
  if (!roh.startsWith("00")) return null;
  const rest = roh.slice(2);
  if (rest.length !== LAENGE_DEUTSCHE_MOBIL_OHNE_NULL) return null;
  if (!DEUTSCHE_MOBIL_PRAEFIXE.some((p) => rest.startsWith(p))) return null;
  return rest;
}

/** `tel:`-Link; die Nummer bleibt wie eingegeben, nur ohne Trennzeichen. */
export function telLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  let roh = ziffern(nummer);
  // Dieselbe Ausnahme wie in `waLink`: die doppelte Null vor einer deutschen
  // Mobilnummer ist ein Tippfehler, keine Auslandswahl. Korrigiert auf die
  // nationale Form mit EINER führenden Null – so bleibt die Nummer, wie sie
  // gemeint war, statt als +170… ins Leere zu wählen.
  const mobilOhneNull = deutscheMobilnummerNachDoppelterNull(roh);
  if (mobilOhneNull) roh = `0${mobilOhneNull}`;
  // Längenkontrolle: mindestens 7, höchstens 15 (E.164-Obergrenze).
  // Ohne maximale Grenze könnten Durchwahlen stumm mitdial werden.
  // Deutsche Nummern (mit führender 0): maximal 12 Ziffern
  // (sonst können Durchwahlen getarnt sein, z.B. "030 12345678-100").
  if (roh.length < MINDESTLAENGE || roh.length > MAX_LAENGE_E164) return null;
  if (roh.startsWith("0") && roh.length > MAX_LAENGE_DEUTSCH_MIT_NULL) {
    return null;
  }
  return `tel:${roh}`;
}

/**
 * `wa.me`-Link in internationaler Form. Ohne erkennbares Land wird die
 * deutsche Vorwahl angenommen – das Produkt bedient deutsche Baufinanzierung.
 */
export function waLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  let roh = ziffern(nummer);
  if (roh.length < MINDESTLAENGE) return null;

  let istDeutsch = false;
  if (roh.startsWith("00")) {
    // "00170 1234567" ist ein Tippfehler (eine Null zu viel), keine
    // Auslandsnummer: Nach dem bloßen Strippen bliebe "1701234567" stehen und
    // ergäbe einen Link auf eine nordamerikanisch aussehende FREMDE Nummer –
    // genau das, was der Dateikopf ausschließt. Dieselbe Erkennung wie in
    // `telLink`, nur die Zielform unterscheidet sich (wa.me will 49…).
    const mobilOhneNull = deutscheMobilnummerNachDoppelterNull(roh);
    if (mobilOhneNull) {
      roh = `49${mobilOhneNull}`;
      istDeutsch = true;
    } else {
      roh = roh.slice(2);
    }
  } else if (roh.startsWith("0")) {
    // Deutsche Nummern mit führender 0 dürfen maximal 12 Ziffern haben
    // (sonst können Durchwahlen getarnt sein). Das verhindert z.B. "030 12345678-100".
    if (roh.length > MAX_LAENGE_DEUTSCH_MIT_NULL) {
      return null;
    }
    roh = `49${roh.slice(1)}`;
    istDeutsch = true;
  }

  // Nach Normalisierung: unterschiedliche Grenzen für deutsch und international
  // - Deutsch (49 wurde eingefügt): 9–13 Ziffern
  // - International (00 oder +, nach Strippen): 8–15 Ziffern
  if (istDeutsch) {
    // Deutsche Nummer nach Normalisierung: 9–13 Ziffern
    if (roh.length < MIN_LAENGE_DEUTSCH || roh.length > MAX_LAENGE_DEUTSCH) {
      return null;
    }
  } else {
    // Internationale Nummer nach Normalisierung: 8–15 Ziffern
    if (roh.length < MIN_LAENGE_INTERNATIONAL || roh.length > MAX_LAENGE_E164) {
      return null;
    }
  }

  return `https://wa.me/${roh}`;
}
