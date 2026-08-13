import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Beweismittel für den offenen Hydration-Mismatch auf /dashboard
 * (Sentry BAUFIDESK-E, seit 08.08.2026, bisher 3x – immer nur bei einem
 * Vollaufruf der Einstiegsseite, nie bei clientseitiger Navigation).
 *
 * Warum überhaupt Diagnose statt Fix: Reacts Meldung nennt sechs mögliche
 * Ursachen und keine davon. Der Produktionsbau liefert weder Komponenten-Stack
 * noch Diff, lokal ist der Fehler nicht reproduzierbar (sauberer Browser,
 * dieselbe Seite: hydratisiert fehlerfrei), und der Fehler hat den kompletten
 * Umbau der Seite am 12.08. überlebt – er hängt also nicht am Inhalt.
 *
 * Genau diese Konstellation deutet auf einen DOM, der VOR der Hydration von
 * außen verändert wurde: Browser-Erweiterungen hängen typischerweise eigene
 * Knoten an den Body (`<grammarly-desktop-integration>`, `<plasmo-csui>`) oder
 * setzen Attribute an html/body (`data-darkreader-*`, `cz-shortcut-listen`).
 * Trifft das zu, ist der Fehler nicht unserer – und das Fehlerbuch kann ihn
 * verwerfen, statt ihn ungeklärt mitzuschleppen. Trifft es nicht zu, sind die
 * Body-Kinder trotzdem der erste Hinweis, wo React auseinanderläuft.
 *
 * Datenschutz: aufgezeichnet werden ausschließlich Tagname, Id und erste
 * CSS-Klasse sowie Attribut-NAMEN – keine Attributwerte, keine Textknoten.
 * Damit kann kein Kundenname, kein Betrag und kein Dokumentinhalt nach außen
 * gelangen. Siehe auch instrumentation-client.ts: kein Session-Replay.
 */

/** Der Ausschnitt des DOM, den die Diagnose braucht (ein echtes `Document` erfüllt ihn). */
export interface ElementAusschnitt {
  tagName: string;
  id: string;
  className: string;
  getAttributeNames(): string[];
}

export interface DokumentAusschnitt {
  documentElement: ElementAusschnitt;
  body: ElementAusschnitt & { children: ArrayLike<ElementAusschnitt> };
}

/** Höchstzahl protokollierter Body-Kinder – das Event soll klein bleiben. */
const MAX_KINDER = 20;

/**
 * Erkennt Reacts Hydration-Mismatch in allen Formulierungen: die beiden
 * ausgeschriebenen Varianten aus dem Entwicklungsbau ("HTML didn't match",
 * "text didn't match") und die minifizierten Fehlernummern #418/#423/#425,
 * die der Produktionsbau meldet.
 */
export function istHydrationMismatch(event: ErrorEvent): boolean {
  const meldungen = (event.exception?.values ?? []).map((wert) => wert.value ?? "");
  return meldungen.some(
    (meldung) =>
      meldung.includes("Hydration failed because") ||
      /Minified React error #(418|423|425)\b/.test(meldung)
  );
}

/** Kurzform eines Elements: `div#id.klasse` – ohne Inhalte. */
function kuerzel(element: ElementAusschnitt): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const ersteKlasse = String(element.className ?? "").trim().split(/\s+/)[0];
  return `${tag}${id}${ersteKlasse ? `.${ersteKlasse}` : ""}`;
}

/**
 * Hängt den Strukturfingerabdruck an ein Hydration-Event. Alle anderen Events
 * – und Aufrufe ohne Dokument (Server, Worker) – kommen unverändert zurück.
 */
export function mitDomFingerabdruck(
  event: ErrorEvent,
  dokument: DokumentAusschnitt | undefined
): ErrorEvent {
  if (!dokument?.body || !istHydrationMismatch(event)) return event;

  const kinder = Array.from(dokument.body.children ?? []);
  return {
    ...event,
    extra: {
      ...event.extra,
      dom: {
        htmlAttribute: dokument.documentElement.getAttributeNames(),
        bodyAttribute: dokument.body.getAttributeNames(),
        bodyKinder: kinder.slice(0, MAX_KINDER).map(kuerzel),
        bodyKinderGesamt: kinder.length,
      },
    },
  };
}
