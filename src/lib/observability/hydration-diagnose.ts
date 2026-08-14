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
 * BELEGT (14.08.2026, Konsolenabzug aus Jürgens Chrome auf /dashboard):
 * `html: [lang, translate, class]`, `body: [class]`, Kinder `12x script,
 * next-route-announcer, div, div`. Das ist **genau das, was die Anwendung
 * selbst rendert** – keine Erweiterung fasst den Baum an. Die Vermutung oben
 * ist damit widerlegt: Der Fehler ist unserer, und der Unterschied sitzt
 * tiefer als die erste Ebene. Deshalb erfasst die Diagnose seit diesem Datum
 * auch die zweite Ebene und die Suchparameter.
 *
 * Bereits ausgeschlossen (14.08.2026), damit die Wege nicht doppelt gelaufen
 * werden:
 *  - Browser-Erweiterung – siehe Abzug oben.
 *  - Zahlenformatierung (`toLocaleString("de-DE")` in der Client-Komponente
 *    `lead-board.tsx`): Node und Chrome gruppieren identisch, und `eur` rundet
 *    ohnehin auf ganze Zahlen.
 *  - Die Checkbox "Verlorene anzeigen": `useState(false)`, kein Speicher, kein
 *    Effekt – React rendert beim Hydrieren dieselbe Struktur wie der Server.
 *  - Ungültige HTML-Verschachtelung in den Board-Karten: keine gefunden
 *    (kein Block in `<p>`, kein `<button>` in `<a>`).
 *  - Sourcemaps fehlen NICHT. Der Build lädt sie mit Debug-IDs hoch
 *    ("Source Map Upload Report" im Vercel-Log). Der Stack bleibt trotzdem
 *    ohne Aussage, weil React den Fehler über den globalen onerror-Handler
 *    wirft und kein einziger Frame aus unserem Code darin steht.
 *  - Übersetzung ist bereits dreifach abgewehrt (lang, translate="no",
 *    notranslate, meta google) – siehe layout.tsx. Der Fehler kam danach wieder.
 *  - Zeitabhängige Begrüßung ist ausgeschlossen (dashboard/page.tsx: greeting()
 *    ist bewusst zeitneutral).
 *  - Die drei Vorfälle verteilen sich über drei Releases, treten aber nur
 *    sporadisch auf (3x in 5 Tagen bei täglicher Nutzung). Eine feste
 *    Locale-Differenz scheidet damit aus; es hängt an Umgebung oder Datenlage.
 *
 * Bewusst NICHT gesetzt: `suppressHydrationWarning` an html/body. Das wäre die
 * übliche Absicherung gegen Erweiterungen – würde hier aber genau das Signal
 * verschlucken, das die Ursache noch klären muss. Erst nach dem Befund setzen.
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
  children: ArrayLike<ElementAusschnitt>;
}

export interface DokumentAusschnitt {
  documentElement: ElementAusschnitt;
  body: ElementAusschnitt;
  /** Nur der Suchteil der Adresse – der Pfad steht bereits im Sentry-Tag `url`. */
  suchparameter?: string;
}

/** Höchstzahl protokollierter Kinder je Ebene – das Event soll klein bleiben. */
const MAX_KINDER = 20;

/**
 * Suchparameter, deren WERT mitgeschickt werden darf.
 *
 * Der Rest wird nur mit seinem Namen vermerkt: `?case=<id>` oder ein
 * Upload-Token haben in einem Fehlerbericht nichts verloren. Diese beiden
 * steuern dagegen, welcher Teilbaum ueberhaupt gerendert wird – ohne sie
 * kostet die naechste Eingrenzung eine weitere Wartezeit.
 */
const UNBEDENKLICHE_PARAMETER = ["ansicht", "tab"];

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

/**
 * Die Adresse auf das reduzieren, was den Seitenaufbau erklaert: Werte nur fuer
 * die Positivliste, sonst allein der Name des Parameters.
 */
function sichereParameter(suche: string): string[] {
  const paare = new URLSearchParams(suche);
  return [...paare.entries()].map(([name, wert]) =>
    UNBEDENKLICHE_PARAMETER.includes(name) ? `${name}=${wert}` : name
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
  /*
   * Zweite Ebene, seit dem 14.08.2026 (Befund unten): Die erste Ebene ist
   * inzwischen als sauber BELEGT – Juergens Browser lieferte dort genau das,
   * was die Anwendung selbst rendert. Der Unterschied sitzt also tiefer, und
   * eine Liste, die bei "div, div" endet, kann ihn nicht mehr zeigen.
   *
   * Genommen wird der letzte Body-Knoten mit Kindern: Davor stehen die
   * Streaming-Skripte von Next.js, dahinter der eigentliche Anwendungsbaum.
   */
  const wurzel = [...kinder].reverse().find((k) => (k.children?.length ?? 0) > 0);
  const wurzelKinder = Array.from(wurzel?.children ?? []);
  return {
    ...event,
    extra: {
      ...event.extra,
      dom: {
        htmlAttribute: dokument.documentElement.getAttributeNames(),
        bodyAttribute: dokument.body.getAttributeNames(),
        bodyKinder: kinder.slice(0, MAX_KINDER).map(kuerzel),
        bodyKinderGesamt: kinder.length,
        wurzel: wurzel ? kuerzel(wurzel) : null,
        wurzelKinder: wurzelKinder.slice(0, MAX_KINDER).map(kuerzel),
        wurzelKinderGesamt: wurzelKinder.length,
        parameter: dokument.suchparameter ? sichereParameter(dokument.suchparameter) : [],
      },
    },
  };
}
