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

function ziffern(nummer: string): string {
  return nummer.replace(/\D/g, "");
}

/** `tel:`-Link; die Nummer bleibt wie eingegeben, nur ohne Trennzeichen. */
export function telLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  const roh = ziffern(nummer);
  return roh.length >= MINDESTLAENGE ? `tel:${roh}` : null;
}

/**
 * `wa.me`-Link in internationaler Form. Ohne erkennbares Land wird die
 * deutsche Vorwahl angenommen – das Produkt bedient deutsche Baufinanzierung.
 */
export function waLink(nummer: string | null): string | null {
  if (!nummer?.trim()) return null;
  let roh = ziffern(nummer);
  if (roh.length < MINDESTLAENGE) return null;

  if (roh.startsWith("00")) roh = roh.slice(2);
  else if (roh.startsWith("0")) roh = `49${roh.slice(1)}`;

  return roh.length >= MINDESTLAENGE ? `https://wa.me/${roh}` : null;
}
