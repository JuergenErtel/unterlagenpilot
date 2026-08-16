import { schluessel } from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

/**
 * Was ein Anfrageformular mindestens braucht, damit daraus ein Fall werden
 * darf. Der KATALOG bleibt ohne Pflichtfelder (siehe types.ts) – die Pflicht
 * sitzt hier, am Absenden, und ausschließlich beim Formular-Weg: Ein Lead
 * ohne Rückweg ist keiner.
 *
 * Die Antworten der ersten Person tragen das Präfix "p1." (siehe
 * `personenSchluessel`). Wer das vergisst, prüft Schlüssel, die es nie gibt,
 * und lässt damit jeden Bogen durch.
 */
export const KONTAKT_SCHLUESSEL = {
  nachname: schluessel("p1.personen", "nachname"),
  email: schluessel("p1.personen", "email"),
  telefon: schluessel("p1.personen", "telefon"),
} as const;

export type Kontaktangabe = keyof typeof KONTAKT_SCHLUESSEL;

export const KONTAKT_LABELS: Record<Kontaktangabe, string> = {
  nachname: "Nachname",
  email: "E-Mail",
  telefon: "Telefon",
};

/** Fassung des Einwilligungstextes – wandert als Nachweis an den Bogen. */
export const EINWILLIGUNG_FASSUNG = "2026-08-15";

const text = (a: Antworten, k: string): string => String(a[k] ?? "").trim();

export function fehlendeKontaktangaben(antworten: Antworten): Kontaktangabe[] {
  const fehlt: Kontaktangabe[] = [];
  if (!text(antworten, KONTAKT_SCHLUESSEL.nachname)) fehlt.push("nachname");
  const email = text(antworten, KONTAKT_SCHLUESSEL.email);
  if (!email || !email.includes("@")) fehlt.push("email");
  if (!text(antworten, KONTAKT_SCHLUESSEL.telefon)) fehlt.push("telefon");
  return fehlt;
}
