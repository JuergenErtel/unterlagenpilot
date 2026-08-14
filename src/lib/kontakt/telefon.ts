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

function ziffern(nummer: string): string {
  return nummer.replace(/\D/g, "");
}

/** `tel:`-Link; die Nummer bleibt wie eingegeben, nur ohne Trennzeichen. */
export function telLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  const roh = ziffern(nummer);
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
    roh = roh.slice(2);
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
