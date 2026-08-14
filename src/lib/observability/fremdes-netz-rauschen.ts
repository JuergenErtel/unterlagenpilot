import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Erkennt Netzwerk-Rejections, die nachweislich NICHT aus unserem Code stammen.
 *
 * Anlass ist BAUFIDESK-T (12.08.2026, /gate): ein Besucher aus einer ganz
 * anderen Umgebung als Jürgens (Windows 11, Chrome 134, Zeitzone Moskau,
 * Sprache en-US) meldete „NetworkError: A network error occurred." als
 * unbehandelte Promise-Rejection – ohne einen einzigen Stack-Rahmen. Die
 * Brotkrumen davor: dreimal `[object FontFace]` auf der Konsole.
 *
 * Drei Befunde machen daraus einen sicheren Fall (14.08.2026 nachgeprüft):
 *  1. `FontFace` kommt in KEINEM unserer ausgelieferten Bündel vor, und die
 *     Anwendung ruft nirgends `console.log`. Beides stammt also aus fremdem
 *     Code im Browser des Besuchers – typischerweise einer Erweiterung.
 *  2. Alle drei Schriften der Gate-Seite laden von außen mit 200 und voller
 *     Größe. Es ist kein kaputtes Asset von uns.
 *  3. Genau diese Meldung ist die DOMException `NETWORK_ERR` (code 19) aus
 *     XHR-, FontFace- und Medien-APIs. Unser Code benutzt keine davon: Wir
 *     laden ausschließlich per `fetch` – und ein gescheiterter `fetch` heißt
 *     in Chrome „TypeError: Failed to fetch".
 *
 * Warum überhaupt filtern: `/gate` ist neben Kunden-Upload und Selbstauskunft
 * eine der wenigen öffentlich erreichbaren Seiten. Dort landen fremde Browser
 * mit fremden Erweiterungen, deren Rejections der globale Handler von Sentry
 * mitnimmt. Solche Meldungen sind für uns nicht behebbar und verdecken mit der
 * Zeit die echten – dieselbe Überlegung wie bei der Streaming-Kaskade in
 * `react-streaming-noise.ts`.
 *
 * Bewusst eng gefasst – es braucht ALLE drei Merkmale. Ein echter Abbruch
 * unserer eigenen Uploads bleibt sichtbar: Er trägt eine andere Meldung UND
 * einen Stack aus unseren Bündeln.
 */

/** Die DOMException `NETWORK_ERR`, wortgleich wie sie im Ereignis steht. */
const DOM_NETZFEHLER = "NetworkError: A network error occurred.";

export function istFremdesNetzRauschen(event: ErrorEvent): boolean {
  const werte = event.exception?.values ?? [];
  if (werte.length === 0) return false;

  return werte.every((wert) => {
    const ausRejection = wert.mechanism?.type === "auto.browser.global_handlers.onunhandledrejection";
    const domNetzfehler = (wert.value ?? "").trim() === DOM_NETZFEHLER;
    const ohneHerkunft = (wert.stacktrace?.frames ?? []).length === 0;
    return ausRejection && domNetzfehler && ohneHerkunft;
  });
}
