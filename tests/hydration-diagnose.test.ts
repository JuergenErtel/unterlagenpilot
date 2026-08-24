import { describe, expect, it } from "vitest";
import {
  verdichteAenderungen,
  type ElementAusschnitt,
  istHydrationMismatch,
  mitDomFingerabdruck,
  type DokumentAusschnitt,
} from "@/lib/observability/hydration-diagnose";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Fixtures aus den echten Sentry-Events: BAUFIDESK-E (/dashboard, "HTML didn't
 * match") und BAUFIDESK-D (/cases/import, "text didn't match").
 */
function event(value: string): ErrorEvent {
  return {
    type: undefined,
    exception: { values: [{ type: "Error", value }] },
  } as unknown as ErrorEvent;
}

const HTML_MISMATCH =
  "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client.";
const TEXT_MISMATCH =
  "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client.";

function element(
  tagName: string,
  attribute: string[],
  id = "",
  className = ""
): DokumentAusschnitt["body"] {
  return {
    tagName,
    id,
    className,
    getAttributeNames: () => attribute,
    children: [],
  };
}

function dokument(
  bodyKinder: Array<{
    tagName: string;
    id?: string;
    className?: string;
    kinder?: Array<{ tagName: string; id?: string; className?: string }>;
  }>,
  htmlAttribute = ["lang", "translate", "class"],
  bodyAttribute = ["class"],
  suchparameter?: string
): DokumentAusschnitt {
  return {
    documentElement: element("HTML", htmlAttribute),
    body: {
      ...element("BODY", bodyAttribute),
      children: bodyKinder.map((k) => ({
        ...element(k.tagName, [], k.id ?? "", k.className ?? ""),
        children: (k.kinder ?? []).map((e) =>
          element(e.tagName, [], e.id ?? "", e.className ?? "")
        ),
      })),
    },
    suchparameter,
  };
}

describe("istHydrationMismatch", () => {
  it("erkennt die HTML-Variante (BAUFIDESK-E)", () => {
    expect(istHydrationMismatch(event(HTML_MISMATCH))).toBe(true);
  });

  it("erkennt die Text-Variante (BAUFIDESK-D)", () => {
    expect(istHydrationMismatch(event(TEXT_MISMATCH))).toBe(true);
  });

  it("erkennt React #418/#423 aus dem minifizierten Produktionsbau", () => {
    expect(
      istHydrationMismatch(
        event("Minified React error #418; visit https://react.dev/errors/418 for the full message")
      )
    ).toBe(true);
  });

  it("lässt andere Fehler unangetastet", () => {
    expect(istHydrationMismatch(event("NetworkError: A network error occurred."))).toBe(false);
    expect(istHydrationMismatch({ type: undefined } as ErrorEvent)).toBe(false);
  });
});

describe("mitDomFingerabdruck", () => {
  it("hängt fremde Body-Kinder an – daran erkennt man eine Erweiterung", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([
        { tagName: "DIV", className: "flex min-h-screen" },
        { tagName: "GRAMMARLY-DESKTOP-INTEGRATION", id: "grammarly" },
      ])
    );
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.bodyKinder).toEqual(["div.flex", "grammarly-desktop-integration#grammarly"]);
  });

  it("hält die Attributnamen von html und body fest (Erweiterungen setzen eigene)", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([], ["lang", "translate", "class", "data-darkreader-mode"], [
        "class",
        "cz-shortcut-listen",
      ])
    );
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.htmlAttribute).toContain("data-darkreader-mode");
    expect(dom.bodyAttribute).toContain("cz-shortcut-listen");
  });

  it("überträgt keine Inhalte – nur Tag, Id und erste Klasse", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([{ tagName: "DIV", id: "kunde-max-mustermann", className: "a b c" }])
    );
    const roh = JSON.stringify(angereichert.extra);
    expect(roh).not.toContain("textContent");
    expect(roh).toContain("div#kunde-max-mustermann.a");
    expect(roh).not.toContain("a b c");
  });

  it("lässt Nicht-Hydration-Events unverändert", () => {
    const original = event("NetworkError: A network error occurred.");
    expect(mitDomFingerabdruck(original, dokument([]))).toBe(original);
  });

  it("kommt ohne Dokument aus (Server, Worker)", () => {
    const original = event(HTML_MISMATCH);
    expect(mitDomFingerabdruck(original, undefined)).toBe(original);
  });

  it("zeigt die zweite Ebene – die erste ist als sauber belegt", () => {
    // Juergens Browser lieferte am 14.08.2026 auf der ersten Ebene genau das,
    // was die Anwendung selbst rendert (12x script, next-route-announcer, 2 div).
    // Der Unterschied sitzt also tiefer; eine Liste, die bei "div, div" endet,
    // kann ihn nicht zeigen.
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([
        { tagName: "SCRIPT" },
        { tagName: "DIV", id: "wurzel", kinder: [{ tagName: "MAIN" }, { tagName: "NAV" }] },
      ])
    );
    const dom = angereichert.extra?.dom as {
      wurzel: string;
      wurzelKinder: string[];
      wurzelKinderGesamt: number;
    };
    expect(dom.wurzel).toBe("div#wurzel");
    expect(dom.wurzelKinder).toEqual(["main", "nav"]);
    expect(dom.wurzelKinderGesamt).toBe(2);
  });

  it("nimmt den LETZTEN Body-Knoten mit Kindern – davor stehen die Streaming-Skripte", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([
        { tagName: "SCRIPT", id: "frueh", kinder: [{ tagName: "SPAN" }] },
        { tagName: "DIV", id: "app", kinder: [{ tagName: "MAIN" }] },
      ])
    );
    expect((angereichert.extra?.dom as { wurzel: string }).wurzel).toBe("div#app");
  });

  it("schickt nur unbedenkliche Parameterwerte mit, sonst allein den Namen", () => {
    // Ein Fehlerbericht darf keine Fall-Id und kein Upload-Token tragen. Die
    // Ansicht dagegen entscheidet, welcher Teilbaum ueberhaupt gerendert wird.
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([{ tagName: "DIV" }], undefined, undefined, "?ansicht=tabelle&case=geheim123&token=abc")
    );
    const parameter = (angereichert.extra?.dom as { parameter: string[] }).parameter;
    expect(parameter).toEqual(["ansicht=tabelle", "case", "token"]);
    expect(JSON.stringify(parameter)).not.toContain("geheim123");
    expect(JSON.stringify(parameter)).not.toContain("abc");
  });

  it("deckelt sehr lange Listen, damit das Event klein bleibt", () => {
    const viele = Array.from({ length: 50 }, (_, i) => ({ tagName: "DIV", id: `k${i}` }));
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), dokument(viele));
    const dom = angereichert.extra?.dom as { bodyKinder: string[]; bodyKinderGesamt: number };
    expect(dom.bodyKinder).toHaveLength(20);
    expect(dom.bodyKinderGesamt).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Die vier Messungen, die die verbliebenen Erklaerungen auseinanderhalten
// (Stand 14.08.2026, siehe Modulkommentar). Bis hierher misst die Diagnose nur
// zwei Ebenen des Body – und genau dort ist nachweislich nichts zu finden.
// ---------------------------------------------------------------------------

/** Baum beliebiger Tiefe – der Fingerabdruck oben kann nur zwei Ebenen. */
function knoten(
  tagName: string,
  kinder: DokumentAusschnitt["body"][] = [],
  attribute: string[] = []
): DokumentAusschnitt["body"] {
  return {
    tagName,
    id: "",
    className: "",
    getAttributeNames: () => attribute,
    children: kinder,
  };
}

function dokumentMitBaum(
  bodyKinder: DokumentAusschnitt["body"][],
  lage?: DokumentAusschnitt["lage"]
): DokumentAusschnitt {
  return {
    documentElement: element("HTML", ["lang", "translate", "class"]),
    body: { ...element("BODY", ["class"]), children: bodyKinder },
    lage,
  };
}

describe("mitDomFingerabdruck – Lagebericht", () => {
  it("findet ein fremdes Element in BELIEBIGER Tiefe, nicht nur auf Ebene 1 und 2", () => {
    // Der Konsolenabzug vom 14.08. hat die ersten beiden Ebenen als sauber
    // belegt. Eine Erweiterung, die tiefer im Baum haengt – etwa ein
    // Passwortmanager-Symbol in einem Eingabefeld – bleibt dort unsichtbar.
    const tief = knoten("DIV", [
      knoten("MAIN", [
        knoten("SECTION", [knoten("ARTICLE", [knoten("COM-1PASSWORD-BUTTON")])]),
      ]),
    ]);
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), dokumentMitBaum([tief]));
    const dom = angereichert.extra?.dom as { fremdeElemente: string[] };
    expect(dom.fremdeElemente).toEqual(["com-1password-button"]);
  });

  it("haelt die eigenen Custom-Elements heraus – next-route-announcer ist unseres", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([knoten("NEXT-ROUTE-ANNOUNCER"), knoten("DIV")])
    );
    const dom = angereichert.extra?.dom as { fremdeElemente: string[] };
    expect(dom.fremdeElemente).toEqual([]);
  });

  it("nennt jedes fremde Element nur einmal und deckelt die Liste", () => {
    const viele = Array.from({ length: 30 }, (_, i) => knoten(`FREMD-${i}`));
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([knoten("DIV", [...viele, knoten("FREMD-0")])])
    );
    const dom = angereichert.extra?.dom as { fremdeElemente: string[] };
    expect(dom.fremdeElemente.length).toBeLessThanOrEqual(20);
    expect(new Set(dom.fremdeElemente).size).toBe(dom.fremdeElemente.length);
  });

  it("zaehlt nicht eingehaengte Streaming-Teilstuecke – lief der Strom noch?", () => {
    // React legt fertige Teilstuecke in ein verstecktes <div> am Body-Ende und
    // schiebt sie dann an ihren Platzhalter. Liegt dort beim Fehler noch ein
    // Container mit ECHTEM Inhalt, war die Seite mitten im Strom.
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([
        knoten("DIV", [knoten("MAIN", [knoten("TEMPLATE"), knoten("TEMPLATE")])]),
        knoten("DIV", [knoten("SECTION", [knoten("P")])], ["hidden"]),
        knoten("DIV", [], ["hidden"]),
      ])
    );
    const dom = angereichert.extra?.dom as { offeneTeilstuecke: number; platzhalter: number };
    expect(dom.offeneTeilstuecke).toBe(1);
    expect(dom.platzhalter).toBe(2);
  });

  it("zaehlt ausgeraeumte Container NICHT – sonst schlaegt jede gesunde Seite Alarm", () => {
    // Gemessen am 14.08.2026 im lokalen Produktionsbau: Eine vollstaendig und
    // fehlerfrei geladene Dashboard-Seite laesst rund 190 versteckte Container
    // am Body zurueck, sechs davon mit einem LEEREN <tbody> darin. Wer bloss
    // "hat Kinder" zaehlt, misst diesen Bodensatz statt eines Vorfalls.
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([
        knoten("DIV", [knoten("TBODY")], ["hidden"]),
        knoten("DIV", [knoten("TBODY")], ["hidden"]),
        knoten("DIV", [], ["hidden"]),
      ])
    );
    const dom = angereichert.extra?.dom as { offeneTeilstuecke: number };
    expect(dom.offeneTeilstuecke).toBe(0);
  });

  it("meldet, ob Chrome die Seite vorgerendert hat – die Lage am Sitzungsbeginn", () => {
    // Alle drei Vorfaelle lagen auf dem ersten Aufruf einer Arbeitssitzung.
    // Genau dann rendert Chrome eine aus der Adresszeile erratene Seite vor.
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([knoten("DIV")], {
        navigationsart: "navigate",
        aktivierungsStartMs: 812.4,
        sichtbarkeit: "visible",
        msSeitStart: 1234.56,
      })
    );
    const lage = (angereichert.extra?.dom as { lage: Record<string, unknown> }).lage;
    expect(lage).toEqual({
      navigationsart: "navigate",
      vorgerendert: true,
      aktivierungsStartMs: 812,
      sichtbarkeit: "visible",
      msSeitStart: 1235,
    });
  });

  it("wertet einen gewoehnlichen Aufruf nicht als vorgerendert", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([knoten("DIV")], {
        navigationsart: "reload",
        aktivierungsStartMs: 0,
        sichtbarkeit: "visible",
        msSeitStart: 90,
      })
    );
    const lage = (angereichert.extra?.dom as { lage: { vorgerendert: boolean } }).lage;
    expect(lage.vorgerendert).toBe(false);
  });

  it("kommt ohne Lage aus – aeltere Browser kennen die Werte nicht", () => {
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), dokumentMitBaum([knoten("DIV")]));
    const dom = angereichert.extra?.dom as { lage?: unknown };
    expect(dom.lage).toBeUndefined();
  });

  it("überträgt auch aus der Tiefe keine Inhalte – nur Tagnamen", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokumentMitBaum([
        knoten("DIV", [knoten("SPAN", [knoten("FREMD-WIDGET", [], ["data-kunde", "title"])])]),
      ])
    );
    const roh = JSON.stringify(angereichert.extra);
    expect(roh).toContain("fremd-widget");
    expect(roh).not.toContain("data-kunde");
  });
});

/**
 * Beobachtete Änderungen am Baum (seit 24.08.2026).
 *
 * Warum überhaupt: Die Momentaufnahme sagt, WIE der Baum beim Fehler aussah –
 * nicht, WAS React daran auszusetzen hatte. Repariert React den Mismatch, fasst
 * er genau den abweichenden Knoten an. Wer diese Reparatur aufzeichnet, hat
 * beim nächsten Vorfall den Ort statt einer weiteren Vermutung.
 */
function verkettet(
  tagName: string,
  kinder: ElementAusschnitt[] = [],
  id = "",
  className = ""
): ElementAusschnitt {
  const k: ElementAusschnitt = {
    tagName,
    id,
    className,
    getAttributeNames: () => [],
    children: kinder,
  };
  for (const kind of kinder) (kind as { parentElement?: ElementAusschnitt }).parentElement = k;
  return k;
}

describe("verdichteAenderungen", () => {
  it("benennt den Pfad des Knotens, dessen Kinder React ersetzt hat", () => {
    const karte = verkettet("DIV", [], "", "card");
    const spalte = verkettet("DIV", [verkettet("H2"), karte], "", "spalte");
    verkettet("BODY", [verkettet("DIV", [spalte], "", "flex")]);

    const erste = verdichteAenderungen([
      { art: "childList", ziel: karte, hinzugefuegt: ["DIV"], entfernt: ["DIV"] },
    ])[0]!;

    expect(erste.pfad).toBe("body>0>0>1");
    expect(erste.knoten).toBe("div.card");
    expect(erste.art).toBe("kinder");
  });

  it("verwirft das Rauschen, das jede gesunde Seite erzeugt", () => {
    // Next.js haengt waehrend des Stroms laufend Skripte an den Body und meldet
    // die Route an – wer das mitzaehlt, bekommt auf JEDER Seite Treffer.
    const body = verkettet("BODY");
    expect(
      verdichteAenderungen([
        { art: "childList", ziel: body, hinzugefuegt: ["SCRIPT"], entfernt: [] },
        { art: "childList", ziel: body, hinzugefuegt: ["NEXT-ROUTE-ANNOUNCER"], entfernt: [] },
        { art: "childList", ziel: body, hinzugefuegt: ["LINK", "STYLE"], entfernt: [] },
      ])
    ).toEqual([]);
  });

  it("meldet geänderten Text als Ort, nie als Inhalt", () => {
    // Der haeufigste Hydration-Grund ueberhaupt ("vor 1 Minute" gegen "vor 2
    // Minuten"). Der Ort reicht, um die Komponente zu finden; der Text selbst
    // waere ein Kundenname.
    const zelle = verkettet("SPAN", [], "", "text-xs");
    verkettet("BODY", [zelle]);

    const erste = verdichteAenderungen([{ art: "characterData", ziel: zelle }])[0]!;

    expect(erste).toEqual({ pfad: "body>0", knoten: "span.text-xs", art: "text", anzahl: 1 });
  });

  it("fasst mehrfache Änderungen am selben Knoten zusammen", () => {
    const ziel = verkettet("UL", [], "liste");
    verkettet("BODY", [ziel]);

    const verdichtet = verdichteAenderungen([
      { art: "childList", ziel, hinzugefuegt: ["LI"], entfernt: ["LI"] },
      { art: "childList", ziel, hinzugefuegt: ["LI"], entfernt: ["LI"] },
      { art: "childList", ziel, hinzugefuegt: ["LI"], entfernt: [] },
    ]);

    expect(verdichtet).toHaveLength(1);
    expect(verdichtet[0]!.anzahl).toBe(3);
  });

  it("hält die Liste kurz – ein Fehlerbericht ist kein Protokoll", () => {
    const ziele = Array.from({ length: 30 }, (_, i) => verkettet("DIV", [], `k${i}`));
    verkettet("BODY", ziele);

    const verdichtet = verdichteAenderungen(
      ziele.map((ziel) => ({ art: "childList", ziel, hinzugefuegt: ["SPAN"], entfernt: [] })),
      5
    );

    expect(verdichtet).toHaveLength(5);
  });

  it("überträgt keine Attributwerte, nur den Namen", () => {
    const ziel = verkettet("INPUT", [], "email");
    verkettet("BODY", [ziel]);

    const erste = verdichteAenderungen([
      { art: "attributes", ziel, attribut: "value" },
    ])[0]!;

    expect(erste.art).toBe("attribut:value");
    expect(JSON.stringify(erste)).not.toContain("max@");
  });

  it("kommt mit einem Ziel ohne Elternkette aus (abgehängter Knoten)", () => {
    const einzeln = verkettet("DIV", [], "", "weg");
    const erste = verdichteAenderungen([{ art: "childList", ziel: einzeln, entfernt: ["P"] }])[0]!;
    expect(erste.pfad).toBe("div.weg");
  });
});

describe("mitDomFingerabdruck – beobachtete Änderungen", () => {
  it("hängt die Änderungen an den Fingerabdruck", () => {
    const ziel = verkettet("SECTION", [], "", "board");
    verkettet("BODY", [ziel]);
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), {
      ...dokument([{ tagName: "DIV", className: "flex" }]),
      aenderungen: [{ art: "childList", ziel, hinzugefuegt: ["DIV"], entfernt: ["DIV"] }],
    });
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.aenderungen).toEqual([
      { pfad: "body>0", knoten: "section.board", art: "kinder", anzahl: 1 },
    ]);
  });

  it("meldet ausdrücklich, wenn React gar nichts angefasst hat", () => {
    // Das ist ein Befund, keine Lücke: Dann repariert React erst nach dem
    // Bericht – und die naechste Runde muss spaeter messen.
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), {
      ...dokument([{ tagName: "DIV", className: "flex" }]),
      aenderungen: [],
    });
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.aenderungen).toEqual([]);
  });
});

describe("verdichteAenderungen – Zeitpunkte", () => {
  it("hält fest, wann die Änderung geschah – nur so ist Strom von Reparatur zu trennen", () => {
    // Waehrend des Stroms schiebt React laufend Teilstuecke an ihren Platz.
    // Das sieht aus wie eine Reparatur. Erst der Abstand zum Fehlerzeitpunkt
    // (lage.msSeitStart) entscheidet, was es war.
    const ziel = verkettet("DIV", [], "", "board");
    verkettet("BODY", [ziel]);

    const [erste] = verdichteAenderungen([
      { art: "childList", ziel, hinzugefuegt: ["DIV"], entfernt: [], ms: 120.4 },
      { art: "childList", ziel, hinzugefuegt: ["DIV"], entfernt: [], ms: 812.6 },
    ]);

    expect(erste).toMatchObject({ anzahl: 2, vonMs: 120, bisMs: 813 });
  });
});

describe("verdichteAenderungen – was beim Kürzen überlebt", () => {
  it("behält die spätesten Änderungen, nicht die ersten", () => {
    // Der Bericht entsteht im Augenblick des Fehlers. Reacts Reparatur steht
    // deshalb am ENDE der Aufzeichnung – das Einstroemen davor steht auf jeder
    // gesunden Seite. Wer vorne kappt, wirft den Befund weg und behaelt das
    // Rauschen.
    const ziele = Array.from({ length: 8 }, (_, i) => verkettet("DIV", [], `k${i}`));
    verkettet("BODY", ziele);

    const verdichtet = verdichteAenderungen(
      ziele.map((ziel, i) => ({
        art: "childList",
        ziel,
        hinzugefuegt: ["SPAN"],
        entfernt: [],
        ms: i * 100,
      })),
      3
    );

    expect(verdichtet.map((a) => a.knoten)).toEqual(["div#k5", "div#k6", "div#k7"]);
  });
});

describe("mitDomFingerabdruck – der Kopf", () => {
  it("hält die Kopf-Kinder fest – dort hängt React seine Metaangaben ein", () => {
    // Blinder Fleck bis zum 24.08.2026: Der echte Vorfall ist die
    // HTML-Variante (Struktur), und der Kopf ist Struktur wie jede andere.
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), {
      ...dokument([{ tagName: "DIV", className: "flex" }]),
      head: verkettet("HEAD", [verkettet("TITLE"), verkettet("META"), verkettet("LINK")]),
    });
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.kopfKinder).toEqual(["title", "meta", "link"]);
    expect(dom.kopfKinderGesamt).toBe(3);
  });

  it("kommt ohne Kopf aus – ein fehlendes Feld ist besser als ein fehlender Bericht", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([{ tagName: "DIV", className: "flex" }])
    );
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.kopfKinder).toBeUndefined();
  });
});
