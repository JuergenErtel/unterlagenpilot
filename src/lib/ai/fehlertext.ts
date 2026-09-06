import { findeAnbieterFehler } from "./http";

/**
 * Menschlicher Grund fuer einen KI-Fehler, wie er am Dokument gespeichert und
 * dem Vermittler gezeigt wird. Keine Kundendaten: Eingang ist nur die
 * Anbietermeldung bzw. der Statuscode, nie Dokumenttext.
 *
 * Hintergrund (06.09.2026, Fall Schmidt): "KI-Fehler – nachpruefen lassen"
 * war alles, was der Arbeitsplatz sagte. Der Klick lief vier Minuten und
 * endete beim selben Satz. Dass Mistral das Modell fuer dieses Konto komplett
 * sperrte (0 Anfragen/min seit dem 31.08.), stand in keinem Bild.
 */
export function kiFehlerText(e: unknown): string {
  const anbieter = findeAnbieterFehler(e);
  if (anbieter) {
    if (anbieter.kontingentGesperrt) {
      return "KI-Anbieter lässt für das eingestellte Modell 0 Anfragen pro Minute zu – Abo-Stufe und Limits im Mistral-Konto prüfen. Erneutes Prüfen hilft erst danach.";
    }
    if (anbieter.status === 429) {
      return "KI-Anbieter: Minutenkontingent erschöpft. In ein paar Minuten erneut prüfen.";
    }
    if (anbieter.status === 403) {
      return "KI-Anbieter: Das eingestellte Modell ist in der Abo-Stufe des Kontos nicht enthalten.";
    }
    if (anbieter.status === 401) {
      return "KI-Anbieter: Zugangsschlüssel abgelehnt – Schlüssel im Konto prüfen.";
    }
    return `KI-Anbieter antwortete mit HTTP ${anbieter.status}.`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 200);
}
