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
 * NACHGESTELLT UND WIDERLEGT (14.08.2026, lokaler Produktionsbau gegen 181
 * Fälle – derselbe React-Chunk 4bd1b696 wie in der Produktion, 186 gestreamte
 * Teilstücke, also dieselbe Bauform wie beim echten Vorfall):
 *  - Langsam eintrudelnder Strom (32 KB alle 40 ms): hydratisiert sauber.
 *  - Hülle zuerst, Inhalt erst Sekunden später (Kaltstart-Fall): ebenfalls
 *    sauber. React verkraftet eine spät nachgelieferte Suspense-Grenze.
 *  → Das Streaming selbst ist NICHT die Ursache.
 *
 * ABGELEITET: Der Client-Baum des Dashboards ist deterministisch. Alle Datums-
 * und Zahlenformate entstehen in Server-Komponenten und kommen als fertige
 * Zeichenketten am Client an; die einzige clientseitige Formatierung
 * (`eur` in lead-board.tsx) rechnet auf ganzen Zahlen, die Node und Chrome
 * gleich gruppieren. Alle strukturellen Verzweigungen dort hängen an Props aus
 * der RSC-Payload, die Server und Client teilen. Wenn der Client also aus
 * denselben Daten dasselbe rendert und React beim Streaming korrekt arbeitet,
 * dann wich der DOM ab, BEVOR React ihn ansah – oder die Seite lief unter
 * Umständen, die die bisherige Momentaufnahme nicht erfasst.
 *
 * Genau dafür misst die Diagnose seit dem 14.08.2026 vier weitere Dinge. Jede
 * Messung trennt eine der verbliebenen Erklärungen ab:
 *  - `fremdeElemente`  – fremdes Custom-Element in BELIEBIGER Tiefe. Die
 *    ersten beiden Ebenen sind als sauber belegt; ein Passwortmanager hängt
 *    sein Symbol aber in ein Eingabefeld, nicht an den Body.
 *  - `offeneTeilstuecke` / `platzhalter` – lief der Strom im Moment des
 *    Fehlers noch? Trennt „mitten im Aufbau" von „fertig geladen".
 *  - `lage.vorgerendert` – hat Chrome die Seite aus der Adresszeile heraus
 *    unsichtbar vorgerendert und erst später aktiviert? Alle drei Vorfälle
 *    lagen auf dem ERSTEN Aufruf einer Arbeitssitzung (08:22, 07:24, 21:23
 *    Ortszeit) – die Lage, in der Chrome genau das tut.
 *  - `lage.sichtbarkeit` / `msSeitStart` – lief die Seite im Hintergrund, und
 *    wie weit war sie, als es knallte?
 *
 * Die Vorfälle vom 08. und 12.08. tragen diese Felder noch nicht: Der
 * Fingerabdruck ging erst am 14.08. live. Der nächste Vorfall entscheidet.
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

/**
 * Die Umstände des Aufrufs. Sie stammen aus Browser-APIs, die das Modul selbst
 * nicht anfassen darf (es soll rein und testbar bleiben) – `instrumentation-client.ts`
 * liest sie und reicht sie herein.
 */
export interface LageAusschnitt {
  /** `performance.getEntriesByType("navigation")[0].type`: navigate | reload | back_forward | prerender */
  navigationsart?: string;
  /**
   * `activationStart` derselben Messung. Größer 0 heißt: Chrome hat die Seite
   * vorgerendert, während sie unsichtbar war, und erst später aktiviert.
   */
  aktivierungsStartMs?: number;
  /** `document.visibilityState` im Moment des Fehlers. */
  sichtbarkeit?: string;
  /** `performance.now()` – wie weit im Leben der Seite der Fehler auftrat. */
  msSeitStart?: number;
}

export interface DokumentAusschnitt {
  documentElement: ElementAusschnitt;
  body: ElementAusschnitt;
  /** Nur der Suchteil der Adresse – der Pfad steht bereits im Sentry-Tag `url`. */
  suchparameter?: string;
  lage?: LageAusschnitt;
}

/** Höchstzahl protokollierter Kinder je Ebene – das Event soll klein bleiben. */
const MAX_KINDER = 20;

/** Höchstzahl gemeldeter fremder Elementnamen. */
const MAX_FREMDE = 20;

/**
 * Obergrenze für den Baumdurchlauf. Das Dashboard trägt bei 180 Fällen einige
 * tausend Knoten; die Grenze verhindert, dass die Diagnose auf einer noch
 * größeren Seite spürbar Zeit kostet. Sie greift bewusst spät.
 */
const MAX_KNOTEN = 20000;

/**
 * Custom-Elements, die die Anwendung selbst mitbringt. Alles andere mit
 * Bindestrich im Namen stammt von außen – so heißen HTML-Standardelemente nie.
 */
const EIGENE_CUSTOM_ELEMENTE = new Set(["next-route-announcer"]);

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

/** Was ein Durchlauf durch den ganzen Baum zutage fördert. */
interface Baumbefund {
  /** Fremde Custom-Elements, in beliebiger Tiefe, je Name einmal. */
  fremdeElemente: string[];
  /**
   * Versteckte Container am Body-Ende, in denen noch ECHTER Inhalt liegt:
   * React legt dort fertige Streaming-Teilstücke ab und schiebt sie an ihren
   * Platzhalter. Bleibt beim Fehler einer gefüllt zurück, war die Seite mitten
   * im Strom.
   *
   * "Echt" ist die entscheidende Einschränkung: Eine fehlerfrei geladene
   * Dashboard-Seite lässt rund 190 dieser Container zurück (gemessen am
   * 14.08.2026 im lokalen Produktionsbau), sechs davon mit einem LEEREN
   * `<tbody>` – Bodensatz des Tabellen-Streamings. Wer bloß "hat Kinder"
   * zählt, misst diesen Bodensatz und meldet auf jeder gesunden Seite Alarm.
   */
  offeneTeilstuecke: number;
  /** Verbliebene `<template>`-Platzhalter – dieselbe Frage von der anderen Seite. */
  platzhalter: number;
}

/**
 * Durchläuft den Baum EINMAL und beantwortet die beiden Fragen, die die
 * zweistufige Momentaufnahme oben nicht beantworten kann: Hängt irgendwo –
 * gleich wie tief – etwas Fremdes im Baum, und lief der Strom noch?
 */
function durchsuche(body: ElementAusschnitt): Baumbefund {
  const fremde = new Set<string>();
  let platzhalter = 0;
  let offeneTeilstuecke = 0;
  let besucht = 0;

  // Iterativ statt rekursiv: der Baum ist tief, und ein Stapelüberlauf im
  // Fehlerpfad würde die Meldung verschlucken, die er erklären soll.
  const stapel: ElementAusschnitt[] = [body];
  while (stapel.length > 0 && besucht < MAX_KNOTEN) {
    const knoten = stapel.pop()!;
    besucht++;
    const tag = knoten.tagName.toLowerCase();
    if (tag === "template") platzhalter++;
    if (tag.includes("-") && !EIGENE_CUSTOM_ELEMENTE.has(tag) && fremde.size < MAX_FREMDE) {
      fremde.add(tag);
    }
    const kinder = Array.from(knoten.children ?? []);
    for (const kind of kinder) stapel.push(kind);
  }

  for (const kind of Array.from(body.children ?? [])) {
    if (!kind.getAttributeNames().includes("hidden")) continue;
    // Ein Container zählt erst, wenn sein Inhalt selbst Inhalt hat – ein
    // blosser leerer Wrapper ist der ausgeraeumte Rest eines Teilstuecks.
    const hatEchtenInhalt = Array.from(kind.children ?? []).some(
      (enkel) => (enkel.children?.length ?? 0) > 0
    );
    if (hatEchtenInhalt) offeneTeilstuecke++;
  }

  return { fremdeElemente: [...fremde], offeneTeilstuecke, platzhalter };
}

/**
 * Die Umstände des Aufrufs, auf runde Zahlen gebracht. `vorgerendert` ist die
 * eigentliche Frage: Alle drei bisherigen Vorfälle lagen auf dem ersten Aufruf
 * einer Arbeitssitzung – genau dann rendert Chrome eine aus der Adresszeile
 * erratene Seite unsichtbar vor und aktiviert sie erst beim Klick.
 */
function lagebericht(lage: LageAusschnitt) {
  return {
    navigationsart: lage.navigationsart,
    vorgerendert: (lage.aktivierungsStartMs ?? 0) > 0,
    aktivierungsStartMs:
      lage.aktivierungsStartMs == null ? undefined : Math.round(lage.aktivierungsStartMs),
    sichtbarkeit: lage.sichtbarkeit,
    msSeitStart: lage.msSeitStart == null ? undefined : Math.round(lage.msSeitStart),
  };
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
  const befund = durchsuche(dokument.body);
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
        ...befund,
        lage: dokument.lage ? lagebericht(dokument.lage) : undefined,
      },
    },
  };
}
