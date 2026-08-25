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
 * BEFUND AUS DEN VIER MESSUNGEN (24.08.2026, sechs Vorfälle mit Feldern,
 * vom 15. bis 22.08.). Sie beantworten die Frage, wegen der sie eingebaut
 * wurden – und verschieben den Verdächtigen:
 *
 *  - **`sichtbarkeit: "hidden"` in SECHS von sechs.** Kein einziger Vorfall
 *    trat in einem sichtbaren Tab auf. Die Seite hydratisiert im Hintergrund –
 *    typischerweise beim Wiederherstellen der Sitzung am Arbeitsbeginn (die
 *    Zeitpunkte passen: 06:59, 07:03, 07:34, 08:41 Ortszeit) oder wenn das
 *    Fenster nicht vorn steht.
 *  - **Nicht vorgerendert** (`aktivierungsStartMs: 0`), Navigationsart
 *    `navigate`, **kein Referer**: ein direkter Aufruf, kein Klick von einer
 *    anderen Seite.
 *  - **Der Strom war fertig** (`offeneTeilstuecke: 0`, `platzhalter: 0`) und
 *    **nichts Fremdes im Baum** (`fremdeElemente: []`), in allen sechs.
 *  - Der Fehler fällt 0,5 bis 2,9 s nach Seitenstart, rund 30 ms nach dem
 *    Verlaufseintrag, den Next.js beim Start selbst schreibt – also im
 *    Augenblick der Hydration.
 *
 * ES IST NICHT DAS DASHBOARD. Der Vorfall vom 19.08.2026 traf
 * `/cases/<id>`. Gemeinsam ist beiden Seiten nur der Rahmen (`AppShell`:
 * `div.flex > aside.sticky + div.flex`) – und genau der steht in allen sechs
 * Fingerabdrücken als Wurzel. Der Titel des Sentry-Issues führt in die Irre.
 *
 * ES IST DIE HTML-VARIANTE, NICHT TEXT. Die echten Meldungen nennen
 * "server rendered HTML didn't match" – eine STRUKTUR weicht ab, keine
 * Zeichenkette.
 *
 * Dazu ein aufgeklärter Nebenbefund (25.08.2026): Der lokale Produktionsbau
 * meldet dieselbe Lage als minifiziertes `#418` mit `args[]=HTML`, die echten
 * Sentry-Ereignisse tragen den vollen Text. Nachgesehen: Der ausgelieferte
 * React-Chunk enthält den Volltext NICHT (nur "Minified React error"), und
 * kein anderer ausgelieferter Chunk auch. Der Browser kann die Zeichenkette
 * also nicht erzeugt haben – Sentry setzt sie anhand der Fehlernummer ein.
 * Zwei Folgerungen: In der Produktion läuft der richtige (minifizierte)
 * React-Bau, kein Entwicklungsbau. Und aus der FORMULIERUNG einer Meldung
 * darf man hier nichts ableiten – wohl aber aus `args[]`, denn das ist Reacts
 * eigener Parameter. `istHydrationMismatch` erkennt beide Formen.
 *
 * NACHSTELLUNG WEITER ERFOLGLOS – diese drei Wege sind verbraucht:
 *  - Kopfloser Browser mit Hintergrund-Tab: meldet immer `visible`.
 *  - `document.visibilityState` überschreiben: kein Mismatch. Unser Code liest
 *    die Sichtbarkeit nirgends; es geht also um Chromes Zeitverhalten im
 *    Hintergrund, nicht um einen Zweig im Code.
 *  - Echtes Chrome über die Erweiterung: nicht verbunden.
 *
 * DESHALB SEIT DEM 24.08.2026 zwei weitere Beweismittel:
 *  - `aenderungen` – was React beim Reparieren anfasst (Beobachter im
 *    Dokumentkopf, siehe `hydration-beobachter-skript.ts`). Im lokalen
 *    Produktionsbau mit erzwungenem Mismatch gemessen: Sitzt der Unterschied
 *    im Rahmen, baut React vom Körper an neu; sitzt er im Seiteninhalt, bleibt
 *    die Reparatur lokal. Der nächste Vorfall trennt damit Rahmen von Inhalt –
 *    er benennt nicht den Knoten.
 *  - `kopfKinder` – der Kopf war blinder Fleck. React 19 hängt dort Titel und
 *    Metaangaben selbst ein (46 Einhängungen je Aufbau); weicht der Kopf ab,
 *    ist das ein HTML-Mismatch, den ein körperbezogener Fingerabdruck nicht
 *    sieht.
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
  /**
   * Nur fuer die Ortsangabe einer beobachteten Aenderung. Ein echtes `Element`
   * bringt sie mit; die Testbaeume setzen sie beim Verketten.
   */
  parentElement?: ElementAusschnitt | null;
}

/**
 * Eine beobachtete Aenderung am Baum, roh wie der Beobachter sie liefert.
 * `ziel` ist bei Textaenderungen bereits das ELTERNelement des Textknotens –
 * ein Textknoten hat weder Tag noch Klasse, und seinen Inhalt wollen wir nicht.
 */
export interface AenderungRoh {
  art: "childList" | "attributes" | "characterData" | string;
  ziel: ElementAusschnitt | null;
  /** Nur Tagnamen der hinzugefuegten/entfernten Knoten – keine Inhalte. */
  hinzugefuegt?: string[];
  entfernt?: string[];
  /** Name des geaenderten Attributs, nie sein Wert. */
  attribut?: string | null;
  /**
   * `performance.now()` beim Eintreten – gerundet. Der entscheidende Trenner:
   * Waehrend des Stroms schiebt React laufend fertige Teilstuecke an ihren
   * Platz (gemessen am 24.08.2026: Templates raus, Divs rein, Kommentarmarken
   * hin und her). Das sieht aus wie eine Reparatur, ist aber der Normalbetrieb.
   * Erst der Abstand zum Fehlerzeitpunkt (`lage.msSeitStart`) trennt beides.
   */
  ms?: number;
}

/** Eine verdichtete Aenderung: Ort und Art, sonst nichts. */
export interface Aenderung {
  /** `body>0>3>1` – Kindindizes vom obersten erreichbaren Knoten abwaerts. */
  pfad: string;
  /** `div.card` – Tag, Id und erste Klasse des Ziels. */
  knoten: string;
  /** `kinder`, `text` oder `attribut:<name>`. */
  art: string;
  anzahl: number;
  /** Erster und letzter Zeitpunkt dieser Aenderung, ms seit Seitenstart. */
  vonMs?: number;
  bisMs?: number;
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
  /**
   * Der Kopf. Blinder Fleck bis zum 24.08.2026 – dabei haengt React 19 dort
   * Titel und Metaangaben selbst ein (im lokalen Produktionsbau gemessen: 46
   * Einhaengungen in den Kopf bei einem einzigen Seitenaufbau). Weicht der
   * Kopf ab, meldet React einen HTML-Mismatch, und ein Fingerabdruck, der nur
   * den Koerper kennt, zeigt eine heile Seite.
   */
  head?: ElementAusschnitt;
  /** Nur der Suchteil der Adresse – der Pfad steht bereits im Sentry-Tag `url`. */
  suchparameter?: string;
  lage?: LageAusschnitt;
  /**
   * Was der Beobachter seit dem Laden am Baum gesehen hat (siehe
   * instrumentation-client.ts). Fehlt sie, bleibt das Feld weg – ein alter
   * Browser ohne MutationObserver soll den Bericht nicht verlieren.
   */
  aenderungen?: AenderungRoh[];
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
 * Knoten, die Next.js waehrend und nach dem Strom von sich aus in den Baum
 * haengt. Wer sie mitzaehlt, bekommt auf JEDER gesunden Seite Treffer – und
 * ein Beweismittel, das immer anschlaegt, beweist nichts.
 */
const RAUSCHEN = new Set(["script", "link", "style", "next-route-announcer"]);

/** Hoechstzahl gemeldeter Aenderungen – ein Fehlerbericht ist kein Protokoll. */
const MAX_AENDERUNGEN = 12;

/**
 * Der Ort eines Knotens als Kette von Kindindizes: `body>0>3>1`. Bewusst keine
 * CSS-Auswahl – die traegt Klassennamen und Ids aus Kundendaten mit sich.
 *
 * Haengt der Knoten nicht (mehr) im Baum, bleibt sein Kuerzel als Ortsangabe.
 * Genau das ist der interessante Fall: Ein von React ersetzter Teilbaum hat
 * seinen Platz verloren.
 */
function pfadVon(element: ElementAusschnitt): string {
  const stufen: number[] = [];
  let aktuell: ElementAusschnitt = element;
  let eltern = element.parentElement;

  while (eltern) {
    const geschwister = Array.from(eltern.children ?? []);
    const index = geschwister.indexOf(aktuell);
    stufen.unshift(index);
    aktuell = eltern;
    eltern = eltern.parentElement;
  }

  if (stufen.length === 0) return kuerzel(element);
  return [aktuell.tagName.toLowerCase(), ...stufen].join(">");
}

/** Nur Rauschen im Spiel? Dann ist die Aenderung keine Meldung wert. */
function nurRauschen(roh: AenderungRoh): boolean {
  const beteiligte = [...(roh.hinzugefuegt ?? []), ...(roh.entfernt ?? [])];
  if (beteiligte.length === 0) return true;
  return beteiligte.every((tag) => RAUSCHEN.has(tag.toLowerCase()));
}

/** Wie die Aenderung im Bericht heisst. */
function artVon(roh: AenderungRoh): string {
  if (roh.art === "characterData") return "text";
  if (roh.art === "attributes") return `attribut:${roh.attribut ?? "?"}`;
  return "kinder";
}

/**
 * Verdichtet die Rohmeldungen des Beobachters zu einer kurzen Liste von Orten.
 *
 * Der Zweck ist eng: Repariert React einen Hydration-Mismatch, ersetzt er genau
 * den abweichenden Teilbaum. Diese Reparatur aufzuzeichnen beantwortet die
 * Frage, an der die Jagd seit dem 08.08.2026 haengt – WO die Baeume
 * auseinandergehen. Alles andere (Inhalte, Attributwerte, Text) bleibt draussen.
 */
export function verdichteAenderungen(
  rohe: AenderungRoh[],
  max = MAX_AENDERUNGEN
): Aenderung[] {
  const nachOrt = new Map<string, Aenderung>();

  for (const roh of rohe) {
    if (!roh.ziel) continue;
    if (roh.art === "childList" && nurRauschen(roh)) continue;

    const art = artVon(roh);
    const pfad = pfadVon(roh.ziel);
    const schluessel = `${pfad}|${art}`;
    const ms = roh.ms == null ? undefined : Math.round(roh.ms);
    const bekannt = nachOrt.get(schluessel);

    if (bekannt) {
      bekannt.anzahl++;
      if (ms != null) {
        bekannt.vonMs = bekannt.vonMs == null ? ms : Math.min(bekannt.vonMs, ms);
        bekannt.bisMs = bekannt.bisMs == null ? ms : Math.max(bekannt.bisMs, ms);
      }
      continue;
    }

    nachOrt.set(schluessel, {
      pfad,
      knoten: kuerzel(roh.ziel),
      art,
      anzahl: 1,
      ...(ms == null ? {} : { vonMs: ms, bisMs: ms }),
    });
  }

  /*
   * Muss die Liste gekuerzt werden, ueberleben die SPAETESTEN Aenderungen.
   * Der Bericht entsteht im Augenblick des Fehlers; was React beim Reparieren
   * anfasst, steht deshalb am Ende. Wer vorne kappt, wirft genau das weg und
   * behaelt das Einstroemen – den Teil, der auf jeder gesunden Seite steht.
   */
  const alle = [...nachOrt.values()];
  if (alle.length <= max) return alle;
  return alle
    .slice()
    .sort((a, b) => (b.bisMs ?? 0) - (a.bisMs ?? 0))
    .slice(0, max)
    .sort((a, b) => (a.vonMs ?? 0) - (b.vonMs ?? 0));
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
        kopfKinder: dokument.head
          ? Array.from(dokument.head.children ?? []).slice(0, MAX_KINDER).map(kuerzel)
          : undefined,
        kopfKinderGesamt: dokument.head ? Array.from(dokument.head.children ?? []).length : undefined,
        bodyAttribute: dokument.body.getAttributeNames(),
        bodyKinder: kinder.slice(0, MAX_KINDER).map(kuerzel),
        bodyKinderGesamt: kinder.length,
        wurzel: wurzel ? kuerzel(wurzel) : null,
        wurzelKinder: wurzelKinder.slice(0, MAX_KINDER).map(kuerzel),
        wurzelKinderGesamt: wurzelKinder.length,
        parameter: dokument.suchparameter ? sichereParameter(dokument.suchparameter) : [],
        ...befund,
        aenderungen: dokument.aenderungen ? verdichteAenderungen(dokument.aenderungen) : undefined,
        lage: dokument.lage ? lagebericht(dokument.lage) : undefined,
      },
    },
  };
}
