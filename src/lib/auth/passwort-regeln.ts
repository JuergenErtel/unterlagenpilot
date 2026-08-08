/**
 * Passwortregeln fuer selbst gesetzte Passwoerter.
 *
 * Bewusst nur Laenge plus eine kurze Sperrliste: erzwungene Sonderzeichen
 * erzeugen erfahrungsgemaess "Sommer2026!" und sonst nichts. Laenge schuetzt
 * messbar besser als Zeichenklassen.
 */
const MIN_LAENGE = 12;

const GESPERRT = [
  "passwort",
  "password",
  "baufidesk",
  "qwertz",
  "qwerty",
  "123456",
  "111111",
  "iloveyou",
  "willkommen",
  "sommer",
  "winter",
];

export function pruefePasswort(passwort: string): { ok: true } | { ok: false; grund: string } {
  if (passwort.length < MIN_LAENGE) {
    return { ok: false, grund: `Das Passwort muss mindestens ${MIN_LAENGE} Zeichen lang sein.` };
  }
  const klein = passwort.toLowerCase();
  if (GESPERRT.some((wort) => klein.includes(wort))) {
    return { ok: false, grund: "Bitte wählen Sie ein weniger naheliegendes Passwort." };
  }
  // Reine Wiederholungen ("abcabcabcabc") oder eine einzige Ziffernfolge.
  if (/^(\d)+$/.test(passwort) || /^(.{1,3})\1+$/.test(passwort)) {
    return { ok: false, grund: "Bitte wählen Sie ein weniger naheliegendes Passwort." };
  }
  return { ok: true };
}

export const PASSWORT_HINWEIS = `Mindestens ${MIN_LAENGE} Zeichen. Eine gut merkbare Wortfolge ist sicherer als ein kurzes Kryptogramm.`;
