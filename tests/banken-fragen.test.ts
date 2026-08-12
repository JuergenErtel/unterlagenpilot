import { describe, it, expect, vi } from "vitest";

// Der Mock-Provider ist der einzige Weg, das Feature ohne echte KI zu pruefen.
// vi.hoisted, weil die Env vor dem Import der Factory stehen muss.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

import {
  pruefeKriterien,
  loeseBank,
  aehnlicheBanken,
  stichwoerterAusFrage,
  waehleAusKandidaten,
} from "@/lib/banken/fragen/deuten";
import { buendele, DECKEL, type Zeile } from "@/lib/banken/fragen/sammeln";
import {
  pruefeBeleg,
  inBuendel,
  parallelBegrenzt,
  BUENDEL_GROESSE,
  GLEICHZEITIG,
} from "@/lib/banken/fragen/lesen";
import { baueGruppen } from "@/lib/banken/fragen/antwort";
import type { Urteil } from "@/lib/banken/fragen/schema";
import { beantworteFrage } from "@/lib/banken/fragen";
import type { Bestand } from "@/lib/banken/fragen/bestand";
import { nurText } from "@/lib/banken/bereinigen";
import { entdoppele, istOhneAussage, neueBankId } from "@/lib/banken/produktuebersicht/import";

const zeile = (o: Partial<Zeile> & { bankId: string }): Zeile => ({
  name: o.name ?? o.bankId,
  kriterium: o.kriterium ?? "Sprache",
  status: o.status ?? "INFORMATION",
  inhalt: o.inhalt ?? "<p>Ein Dolmetscher kann hinzugezogen werden.</p>",
  bankId: o.bankId,
});

const PLATZHALTER = "<p>Es liegt noch keine Information seitens der Bank vor.</p>";

describe("Kriterien gegen den Katalog", () => {
  it("behaelt echte Namen und verwirft erfundene", () => {
    expect(pruefeKriterien(["Sprache", "Sprachkenntnisse", "Grenzgänger"])).toEqual([
      "Sprache",
      "Grenzgänger",
    ]);
  });

  it("ignoriert Gross-/Kleinschreibung und Dubletten", () => {
    expect(pruefeKriterien(["sprache", "SPRACHE"])).toEqual(["Sprache"]);
  });

  it("nimmt hoechstens drei", () => {
    expect(
      pruefeKriterien(["Sprache", "Grenzgänger", "Wohnsitz", "Baujahr"])
    ).toHaveLength(3);
  });
});

describe("Banknamen aufloesen", () => {
  const alle = [
    { bankId: "ING", name: "ING" },
    { bankId: "SPK_KOELN", name: "Sparkasse KölnBonn" },
    { bankId: "SPK_MS", name: "Sparkasse Musterstadt" },
    { bankId: "SPK_MUC", name: "Stadtsparkasse München" },
    // Die Stolpersteine aus dem echten Bestand: "ing" steckt in allen dreien.
    { bankId: "SPK_IN", name: "Spk Ingolstadt Eichstätt" },
    { bankId: "VB_TH", name: "Voba Thüringen Mitte" },
    { bankId: "RB_GEI", name: "Raiffeisenbank Geiselhöring-Pfaffenberg" },
  ];

  it("ohne Bankname keine Eingrenzung", () => {
    expect(loeseBank(null, alle)).toEqual({ banken: [], unbekannt: false, hinweis: null });
  });

  it("trifft bei exaktem Namen genau eine Bank – nicht jeden Namen mit 'ing'", () => {
    const r = loeseBank("ING", alle);
    expect(r.banken.map((b) => b.bankId)).toEqual(["ING"]);
    expect(r.hinweis).toBeNull();
  });

  it("nimmt das ganze Wort, bevor es zum Teilstring greift", () => {
    // "Sparkasse" ist ein eigenes Wort in "Sparkasse KölnBonn", steckt aber
    // auch in "Stadtsparkasse München". Das ganze Wort gewinnt.
    const r = loeseBank("Sparkasse", alle);
    expect(r.banken.map((b) => b.bankId)).toEqual(["SPK_KOELN", "SPK_MS"]);
  });

  it("faellt auf den Teilstring zurueck, wenn kein ganzes Wort passt", () => {
    const r = loeseBank("koelnbonn", alle);
    expect(r.banken.map((b) => b.bankId)).toEqual(["SPK_KOELN"]);
  });

  it("mehrere Treffer grenzen ein und sagen es", () => {
    const r = loeseBank("Sparkasse", alle);
    expect(r.banken).toHaveLength(2);
    expect(r.hinweis).toContain("2 Banken");
  });

  it("meldet eine unbekannte Bank als unbekannt und schlaegt etwas vor", () => {
    const r = loeseBank("Hausbank Entenhausen", alle);
    expect(r.banken).toEqual([]);
    expect(r.unbekannt).toBe(true);
    expect(r.hinweis).toContain("finde ich im Wiki nicht");
  });
});

describe("Buendeln", () => {
  it("schickt Platzhalterzeilen NIE an die KI", () => {
    const s = buendele([
      zeile({ bankId: "A", status: "KEINE_ANGABE", inhalt: PLATZHALTER }),
      zeile({ bankId: "B" }),
    ]);
    expect(s.bloecke).toHaveLength(1);
    expect(s.bloecke[0]!.banken.map((b) => b.bankId)).toEqual(["B"]);
    expect(s.ohneAussage.map((z) => z.bankId)).toEqual(["A"]);
  });

  it("behandelt leeren Text wie eine fehlende Aussage", () => {
    const s = buendele([zeile({ bankId: "A", status: "INFORMATION", inhalt: "" })]);
    expect(s.bloecke).toHaveLength(0);
    expect(s.ohneAussage).toHaveLength(1);
  });

  it("fasst gleiche Texte zu einem Block zusammen", () => {
    const s = buendele([
      zeile({ bankId: "A" }),
      zeile({ bankId: "B" }),
      zeile({ bankId: "C" }),
    ]);
    expect(s.bloecke).toHaveLength(1);
    expect(s.bloecke[0]!.banken).toHaveLength(3);
  });

  it("stellt Bloecke mit Stichworttreffer nach vorn", () => {
    const s = buendele(
      [
        zeile({ bankId: "A", inhalt: "<p>Zum Baujahr gibt es Vorgaben.</p>" }),
        zeile({ bankId: "B", inhalt: "<p>Ein Dolmetscher ist zulässig.</p>" }),
      ],
      ["Dolmetscher"]
    );
    expect(s.bloecke[0]!.banken[0]!.bankId).toBe("B");
  });

  it("deckelt und meldet die Gesamtzahl", () => {
    const zeilen = Array.from({ length: 5 }, (_, i) =>
      zeile({ bankId: `B${i}`, inhalt: `<p>Aussage Nummer ${i}.</p>` })
    );
    const s = buendele(zeilen, [], 2);
    expect(s.bloecke).toHaveLength(2);
    expect(s.gesamtBloecke).toBe(5);
    expect(s.ungelesen).toHaveLength(3);
  });

  it("nimmt im Regelfall alles unter dem Deckel", () => {
    expect(DECKEL).toBeGreaterThanOrEqual(300);
  });

  it("bleibt auch im schlimmsten Fall unter dem Anfragebudget des Anbieters", () => {
    // Das Mistral-Konto erlaubt 50 Anfragen/Minute. Wer Deckel oder
    // Buendelgroesse aendert, aendert damit auch die Zahl der KI-Aufrufe je
    // Frage – gemessen kippt der Lauf ab zwoelf gleichzeitigen Aufrufen in den
    // Backoff und wird drei- bis fuenfmal langsamer.
    expect(Math.ceil(DECKEL / BUENDEL_GROESSE)).toBeLessThanOrEqual(30);
    expect(GLEICHZEITIG).toBeLessThanOrEqual(10);
  });

  it("liest das gefragte Kriterium zuerst, auch wenn das Stichwort woanders trifft", () => {
    const s = buendele(
      [
        zeile({ bankId: "A", kriterium: "Wohnsitz", inhalt: "<p>Einkommen aus dem Ausland.</p>" }),
        zeile({
          bankId: "B",
          kriterium: "Kurzarbeitergeld",
          inhalt: "<p>Wird nicht angerechnet.</p>",
        }),
      ],
      ["Einkommen"],
      1,
      ["Kurzarbeitergeld"]
    );
    expect(s.bloecke).toHaveLength(1);
    expect(s.bloecke[0]!.kriterium).toBe("Kurzarbeitergeld");
    expect(s.ungelesen.map((z) => z.bankId)).toEqual(["A"]);
  });
});

describe("Trennschaerfe der Stichwoerter", () => {
  /**
   * Nachgebaut aus dem gemessenen Fall „befristete Aufenthaltsgenehmigung"
   * (12.08.2026): Die KI lieferte die Stichwoerter Aufenthaltsgenehmigung,
   * befristet und Wohnsitz. Im echten Bestand traf „Wohnsitz" 715 von 901
   * Bloecken, „Aufenthaltsgenehmigung" zehn.
   */
  function bestand(): Zeile[] {
    const zeilen: Zeile[] = [];
    // 60 Bloecke, in denen nur das breite Wort steht – anderes Thema.
    for (let i = 0; i < 60; i++) {
      zeilen.push(
        zeile({ bankId: `W${i}`, kriterium: "Wohnsitz", inhalt: `<p>Wohnsitz im Ausland, Fall ${i}.</p>` })
      );
    }
    // 5 Bloecke zum eigentlichen Thema.
    for (let i = 0; i < 5; i++) {
      zeilen.push(
        zeile({
          bankId: `A${i}`,
          kriterium: "Wohnsitz",
          inhalt: `<p>Eine Aufenthaltsgenehmigung ist vorzulegen, Variante ${i}.</p>`,
        })
      );
    }
    return zeilen;
  }

  it("liest nur die Texte zum trennschaerfsten Wort, nicht das ganze Thema", () => {
    const s = buendele(bestand(), ["Aufenthaltsgenehmigung", "Wohnsitz"], DECKEL, []);
    expect(s.leitwort).toBe("aufenthaltsgenehmigung");
    expect(s.bloecke).toHaveLength(5);
    expect(s.bloecke.every((b) => b.text.includes("Aufenthaltsgenehmigung"))).toBe(true);
    expect(s.abgewiesen).toBe(60);
  });

  it("meldet uebergangene Fundstellen NICHT als fehlende Banken", () => {
    // Abgewiesen heisst "anderes Thema", nicht "wurde verschwiegen" – sonst
    // behauptet die Antwort, 60 Banken fehlten ihr.
    const s = buendele(bestand(), ["Aufenthaltsgenehmigung", "Wohnsitz"], DECKEL, []);
    expect(s.ungelesen).toHaveLength(0);
  });

  it("faellt auf das naechste Wort zurueck, wenn das trennschaerfste nichts trifft", () => {
    const s = buendele(bestand(), ["Aufenthaltstitel", "Wohnsitz"], DECKEL, []);
    // "Aufenthaltstitel" kommt im Bestand nicht vor, "Wohnsitz" ueberall.
    // Lieber die breite Menge als gar keine Antwort.
    expect(s.leitwort).toBeNull();
    expect(s.bloecke.length).toBeGreaterThan(60);
  });

  it("laesst das gefragte Kriterium unangetastet – dort zaehlt kein Stichwort", () => {
    const zeilen = [
      ...bestand(),
      zeile({ bankId: "K1", kriterium: "Sprache", inhalt: "<p>Ein Dolmetscher ist zulässig.</p>" }),
    ];
    const s = buendele(zeilen, ["Aufenthaltsgenehmigung", "Wohnsitz"], DECKEL, ["Sprache"]);
    expect(s.bloecke.some((b) => b.kriterium === "Sprache")).toBe(true);
  });

  it("greift bei wenigen Bloecken nicht ein (zu wenig fuer eine Aussage ueber Haeufigkeit)", () => {
    const s = buendele(
      [
        zeile({ bankId: "A", inhalt: "<p>Zum Baujahr gibt es Vorgaben.</p>" }),
        zeile({ bankId: "B", inhalt: "<p>Ein Dolmetscher ist zulässig.</p>" }),
      ],
      ["Dolmetscher"]
    );
    expect(s.bloecke).toHaveLength(2);
    expect(s.abgewiesen).toBe(0);
  });
});

describe("Belegpruefung", () => {
  const quelle = "Ein Dolmetscher kann zum Notartermin hinzugezogen werden.";

  it("nimmt ein woertliches Zitat an", () => {
    expect(pruefeBeleg("Ein Dolmetscher kann zum Notartermin", quelle)).toBe(
      "Ein Dolmetscher kann zum Notartermin"
    );
  });

  it("verzeiht Gross-/Kleinschreibung und Leerraum", () => {
    expect(pruefeBeleg("ein   dolmetscher kann", quelle)).not.toBeNull();
  });

  it("verwirft ein erfundenes Zitat", () => {
    expect(pruefeBeleg("Dolmetscher sind ausdrücklich erwünscht.", quelle)).toBeNull();
  });

  it("verwirft ein leeres oder zu kurzes Zitat", () => {
    expect(pruefeBeleg("", quelle)).toBeNull();
    expect(pruefeBeleg("Ein", quelle)).toBeNull();
  });

  it("nimmt ein Zitat mit Auslassung an, wenn alle Teile woertlich vorkommen", () => {
    const lang =
      "Deutsche Sprachkenntnisse sind erforderlich. Bei Bedarf wird ein vereidigter Dolmetscher beim Notar und bei Unterzeichnung hinzugezogen.";
    expect(pruefeBeleg("Bei Bedarf wird ein vereidigter Dolmetscher … hinzugezogen", lang)).not.toBeNull();
    expect(pruefeBeleg("Bei Bedarf wird ein vereidigter Dolmetscher ... hinzugezogen", lang)).not.toBeNull();
  });

  it("verwirft eine Auslassung, die die Reihenfolge verdreht", () => {
    const lang = "Ein Dolmetscher ist zulässig. Deutschkenntnisse sind nicht nötig.";
    expect(pruefeBeleg("Deutschkenntnisse sind nicht nötig … Ein Dolmetscher ist zulässig", lang)).toBeNull();
  });

  it("verwirft eine Auslassung mit belanglosem Bruchstueck", () => {
    expect(pruefeBeleg("Ein Dolmetscher … zum", quelle)).toBeNull();
  });

  it("verwirft eine treffende, aber erfundene Zusammenfassung", () => {
    // Genau der Fall aus dem echten Bestand: das Urteil stimmt, der Satz stand
    // so aber nirgends.
    const original =
      "Wird im Rahmen der Beurkundung des Kaufvertrags ein Dolmetscher hinzugezogen, ist keine Finanzierung möglich.";
    expect(pruefeBeleg("Ein Dolmetscher wird nicht akzeptiert.", original)).toBeNull();
  });
});

describe("Buendelung und Gleichzeitigkeit", () => {
  it("zerlegt in Buendel fester Groesse", () => {
    expect(inBuendel([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("behaelt die Reihenfolge und ueberlebt einen Fehlschlag", async () => {
    const r = await parallelBegrenzt([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("Absicht");
      return n * 10;
    });
    expect(r).toEqual([10, null, 30]);
  });
});

describe("Gruppieren", () => {
  const block = (id: number, bankIds: string[], kriterium = "Sprache") => ({
    id,
    kriterium,
    text: "Ein Dolmetscher kann hinzugezogen werden.",
    banken: bankIds.map((b) => zeile({ bankId: b, kriterium })),
  });

  it("bildet die Urteile vollstaendig auf die Banken zurueck", () => {
    const { gruppen } = baueGruppen(
      [block(1, ["A", "B"]), block(2, ["C"])],
      new Map([
        [1, { urteil: "ja" as Urteil, beleg: "Ein Dolmetscher" }],
        [2, { urteil: "nein" as Urteil, beleg: null }],
      ]),
      [zeile({ bankId: "D", status: "KEINE_ANGABE", kriterium: "Sprache" })],
      ["Sprache"]
    );
    const zahl = Object.fromEntries(gruppen.map((g) => [g.urteil, g.banken.length]));
    expect(zahl).toEqual({ ja: 2, bedingt: 0, nein: 1, keine_aussage: 1 });
  });

  it("zeigt 'hat sich nicht geaeussert' nur unter einem gefragten Kriterium", () => {
    // Gemessener Beifang (12.08.2026): Bei der Frage nach der befristeten
    // Aufenthaltsgenehmigung landeten Banken zum Merkmal "befristete
    // Arbeitsvertraege" in dieser Gruppe – ueber die Bezeichnung eingesammelt,
    // ohne einen einzigen Satz zum Thema.
    const ohne = [
      zeile({ bankId: "D", status: "KEINE_ANGABE", kriterium: "befristete Arbeitsverträge" }),
    ];
    const nurFreitext = baueGruppen([], new Map(), ohne, []);
    expect(nurFreitext.gruppen.find((g) => g.urteil === "keine_aussage")!.banken).toHaveLength(0);

    const mitKriterium = baueGruppen([], new Map(), ohne, ["befristete Arbeitsverträge"]);
    expect(mitKriterium.gruppen.find((g) => g.urteil === "keine_aussage")!.banken).toHaveLength(1);
  });

  it("laesst bei mehreren Kriterien das restriktivste Urteil gewinnen", () => {
    const { gruppen } = baueGruppen(
      [block(1, ["A"], "Sprache"), block(2, ["A"], "Legitimation")],
      new Map([
        [1, { urteil: "ja" as Urteil, beleg: "Ein Dolmetscher" }],
        [2, { urteil: "nein" as Urteil, beleg: "kann hinzugezogen" }],
      ]),
      []
    );
    expect(gruppen.find((g) => g.urteil === "ja")!.banken).toHaveLength(0);
    const nein = gruppen.find((g) => g.urteil === "nein")!.banken;
    expect(nein).toHaveLength(1);
    expect(nein[0]!.kriterium).toBe("Legitimation");
  });

  it("belegt bei gleichem Urteil aus dem gefragten Kriterium", () => {
    // Der echte Fall: Die ING sagt unter "Einkommen in Fremdwährung" klar Nein,
    // unter "Grenzgänger" ebenfalls – gezeigt werden muss das gefragte.
    const { gruppen } = baueGruppen(
      [
        { ...block(1, ["ING"], "Grenzgänger"), text: "Das Einkommen wird in Deutschland versteuert." },
        { ...block(2, ["ING"], "Einkommen in Fremdwährung"), text: "Wird von der Bank nicht unterstützt." },
      ],
      new Map([
        [1, { urteil: "nein" as Urteil, beleg: "Das Einkommen wird" }],
        [2, { urteil: "nein" as Urteil, beleg: "Wird von der Bank nicht unterstützt." }],
      ]),
      [],
      ["Einkommen in Fremdwährung"]
    );
    const nein = gruppen.find((g) => g.urteil === "nein")!.banken;
    expect(nein).toHaveLength(1);
    expect(nein[0]!.kriterium).toBe("Einkommen in Fremdwährung");
  });

  it("zieht ein Nein aus einem Nebenkriterium einem Ja aus dem Hauptkriterium vor", () => {
    const { gruppen } = baueGruppen(
      [block(1, ["A"], "Sprache"), block(2, ["A"], "Legitimation")],
      new Map([
        [1, { urteil: "ja" as Urteil, beleg: "Ein Dolmetscher" }],
        [2, { urteil: "nein" as Urteil, beleg: "kann hinzugezogen" }],
      ]),
      [],
      ["Sprache"]
    );
    expect(gruppen.find((g) => g.urteil === "nein")!.banken).toHaveLength(1);
    expect(gruppen.find((g) => g.urteil === "ja")!.banken).toHaveLength(0);
  });

  it("zaehlt eine Bank ohne Aussage nie als Nein", () => {
    const { gruppen } = baueGruppen(
      [],
      new Map(),
      [zeile({ bankId: "A", status: "KEINE_ANGABE" })],
      ["Sprache"]
    );
    expect(gruppen.find((g) => g.urteil === "nein")!.banken).toHaveLength(0);
    expect(gruppen.find((g) => g.urteil === "keine_aussage")!.banken).toHaveLength(1);
  });

  it("meldet Bloecke ohne Urteil als ungelesen statt als Aussage", () => {
    const { gruppen, ungelesen } = baueGruppen([block(1, ["A"])], new Map(), []);
    expect(gruppen.every((g) => g.banken.length === 0)).toBe(true);
    expect(ungelesen.map((z) => z.bankId)).toEqual(["A"]);
  });
});

describe("Klartext aus bereinigtem HTML", () => {
  it("entfernt Auszeichnung und loest Entitaeten auf", () => {
    expect(nurText("<p>Ja &amp; nein</p><ul><li>eins</li><li>zwei</li></ul>")).toBe(
      "Ja & nein eins zwei"
    );
  });
});

describe("Ganze Frage (Mock-KI, ohne Datenbank)", () => {
  const bestand = (zeilen: Zeile[]): Bestand => ({
    bankNamen: async () => [{ bankId: "ING", name: "ING" }],
    zeilen: async (kriterien, stichwoerter) =>
      // Bildet das Auffangnetz nach: Kriterium ODER Stichwort im Freitext.
      zeilen.filter(
        (z) =>
          kriterien.includes(z.kriterium) ||
          stichwoerter.some((w) => z.inhalt.toLowerCase().includes(w.toLowerCase()))
      ),
    abzugStand: async () => new Date("2026-08-10T00:00:00Z"),
  });

  it("beantwortet die Dolmetscher-Frage ueber das Stichwort-Auffangnetz", async () => {
    const antwort = await beantworteFrage(
      "Welche Banken akzeptieren einen Dolmetscher beim Notartermin?",
      bestand([
        zeile({ bankId: "A", inhalt: "<p>Ein Dolmetscher kann hinzugezogen werden.</p>" }),
        zeile({
          bankId: "B",
          inhalt: "<p>Zur Akzeptanz eines Dolmetschers wird keine Aussage getroffen.</p>",
        }),
        zeile({ bankId: "C", status: "KEINE_ANGABE", inhalt: PLATZHALTER }),
      ])
    );

    expect(antwort.fehlanzeige).toBe(false);
    // Der Mock findet das Kriterium "Sprache" NICHT – das Netz muss tragen.
    expect(antwort.kriterien).not.toContain("Sprache");
    expect(antwort.stichwoerter).toContain("dolmetscher");
    expect(antwort.gelesen).toBe(2);

    // Jede Bank taucht genau einmal auf.
    const alle = antwort.gruppen.flatMap((g) => g.banken.map((b) => b.bankId));
    expect(new Set(alle).size).toBe(alle.length);
    // C hat sich nicht geaeussert und enthaelt das Stichwort nicht – ohne
    // erkanntes Kriterium kann die Freitextsuche solche Banken gar nicht sehen.
    expect(alle.sort()).toEqual(["A", "B"]);
  });

  it("sagt es, wenn ohne Kriterium nur im Freitext gesucht wurde", async () => {
    const antwort = await beantworteFrage(
      "Welche Banken akzeptieren einen Dolmetscher beim Notartermin?",
      bestand([zeile({ bankId: "A", inhalt: "<p>Ein Dolmetscher ist zulässig.</p>" })])
    );
    expect(antwort.kriterien).toEqual([]);
    expect(antwort.hinweise.join(" ")).toContain("kein Kriterium zu diesem Thema");
    expect(antwort.hinweise.join(" ")).toContain("fehlen ganz");
  });

  it("liefert bei erkanntem Kriterium auch die schweigenden Banken", async () => {
    // "Grenzgänger" steht woertlich in der Frage – das findet sogar der Mock.
    const antwort = await beantworteFrage(
      "Welche Banken nehmen Grenzgänger?",
      bestand([
        zeile({
          bankId: "A",
          kriterium: "Grenzgänger",
          inhalt: "<p>Grenzgänger werden finanziert.</p>",
        }),
        zeile({
          bankId: "C",
          kriterium: "Grenzgänger",
          status: "KEINE_ANGABE",
          inhalt: PLATZHALTER,
        }),
      ])
    );
    expect(antwort.kriterien).toEqual(["Grenzgänger"]);
    const ohneAussage = antwort.gruppen.find((g) => g.urteil === "keine_aussage")!;
    expect(ohneAussage.banken.map((b) => b.bankId)).toEqual(["C"]);
  });

  it("zeigt nur geprueftes oder gar kein Zitat", async () => {
    const antwort = await beantworteFrage(
      "Welche Banken akzeptieren einen Dolmetscher?",
      bestand([zeile({ bankId: "A", inhalt: "<p>Ein Dolmetscher ist zulässig.</p>" })])
    );
    for (const b of antwort.gruppen.flatMap((g) => g.banken)) {
      if (b.beleg) expect("Ein Dolmetscher ist zulässig.").toContain(b.beleg);
    }
  });

  it("gibt eine Fehlanzeige statt einer Rateliste", async () => {
    const antwort = await beantworteFrage("Gibt es hier Ponyhöfe?", bestand([]));
    expect(antwort.fehlanzeige).toBe(true);
    expect(antwort.gruppen).toEqual([]);
    expect(antwort.hinweise.join(" ")).toContain("nichts im Bestand");
  });

  it("weist eine zu kurze Frage ab", async () => {
    const antwort = await beantworteFrage("?", bestand([]));
    expect(antwort.fehlanzeige).toBe(true);
    expect(antwort.hinweise.join(" ")).toContain("zu kurz");
  });
});

describe("Bankname als Abkürzung (Bugfix 11.08.)", () => {
  const alle = [
    { bankId: "HVB", name: "HypoVereinsbank" },
    { bankId: "SPK_KOELN", name: "Sparkasse KölnBonn" },
    { bankId: "BERL", name: "Berliner Sparkasse" },
    { bankId: "ING", name: "ING" },
  ];

  it("kann „HVB“ NICHT von sich aus auflösen – und behauptet es auch nicht", () => {
    // Gegen die echten 664 Namen gemessen ist keine lokale Regel tragfähig:
    // „HVB“ als Teilfolge trifft fünf Banken, „KSK“ achtundfünfzig, „SKB“
    // sechsundneunzig. Und die Großbuchstaben von „HypoVereinsbank“ sind „HV“,
    // nicht „HVB“ – das B kommt aus dem kleingeschriebenen „bank“.
    const r = loeseBank("HVB", alle);
    expect(r.banken).toEqual([]);
    expect(r.unbekannt).toBe(true);
  });

  it("schlägt stattdessen die richtige Bank vor", () => {
    expect(aehnlicheBanken("HVB", alle).map((b) => b.bankId)).toContain("HVB");
  });

  it("meldet eine wirklich unbekannte Bank als unbekannt", () => {
    const r = loeseBank("Hausbank Entenhausen", alle);
    expect(r.banken).toEqual([]);
    expect(r.unbekannt).toBe(true);
  });

  it("meldet eine nicht genannte Bank NICHT als unbekannt", () => {
    expect(loeseBank(null, alle).unbekannt).toBe(false);
  });

  it("nimmt eine erfundene Kennung aus der Bankauswahl nicht an", () => {
    // Die KI darf aus der Liste zeigen, nicht erfinden.
    expect(waehleAusKandidaten("GIBTSNICHT", alle)).toBeNull();
    expect(waehleAusKandidaten(null, alle)).toBeNull();
    expect(waehleAusKandidaten("HVB", alle)?.name).toBe("HypoVereinsbank");
  });
});

describe("Unauflösbare Bank sucht nicht den ganzen Markt ab", () => {
  it("bricht ab, statt auf alle Banken zurückzufallen", async () => {
    // Der eigentliche Schaden: Wer nach EINER Bank fragt, will keine
    // Marktübersicht. Der Rückfall kostete 15 KI-Aufrufe statt einem – und
    // riss durch den Deckel zusätzlich 57 Texte mit.
    let gefragt = 0;
    const antwort = await beantworteFrage("Akzeptiert die Entenbank Grenzgänger?", {
      bankNamen: async () => [{ bankId: "ING", name: "ING" }],
      zeilen: async () => {
        gefragt++;
        return [];
      },
      abzugStand: async () => new Date("2026-08-10T00:00:00Z"),
    });

    expect(gefragt).toBe(0);
    expect(antwort.fehlanzeige).toBe(true);
    expect(antwort.hinweise.join(" ")).toContain("Entenbank");
  });

  it("durchsucht ohne genannte Bank weiterhin alle Banken", async () => {
    // Gegenprobe: Die Marktfrage darf der Fix nicht mit abwürgen.
    let gefragt = 0;
    const antwort = await beantworteFrage("Welche Banken nehmen Grenzgänger?", {
      bankNamen: async () => [{ bankId: "ING", name: "ING" }],
      zeilen: async () => {
        gefragt++;
        return [zeile({ bankId: "ING", kriterium: "Grenzgänger", inhalt: "<p>Wird finanziert.</p>" })];
      },
      abzugStand: async () => new Date("2026-08-10T00:00:00Z"),
    });
    expect(gefragt).toBe(1);
    expect(antwort.fehlanzeige).toBe(false);
  });
});

describe("Thema fehlt im Kriterienkatalog (Bugfix 11.08.)", () => {
  it("sagt es, wenn der Katalog zum Thema gar kein Kriterium hat", async () => {
    // Der gemeldete Fall: Die Frage nach der befristeten Aufenthaltsgenehmigung
    // landete unter „Wohnsitz“ – dort geht es um Expatriates. Es gibt im
    // ganzen Katalog kein Kriterium zu Staatsangehörigkeit oder Aufenthalts-
    // titel. Die Antwort las sich wie ein Schweigen der Bank, war aber eine
    // Lücke im Katalog. Der Mock erkennt hier kein Kriterium – genau der Fall.
    const antwort = await beantworteFrage("Akzeptiert die Bank eine befristete Aufenthaltsgenehmigung?", {
      bankNamen: async () => [{ bankId: "HVB", name: "HypoVereinsbank" }],
      zeilen: async () => [
        zeile({
          bankId: "HVB",
          name: "HypoVereinsbank",
          kriterium: "Wohnsitz",
          inhalt: "<p>Deutschland. Expatriates: deutsche Staatsangehörige im Auslandseinsatz.</p>",
        }),
      ],
      abzugStand: async () => new Date("2026-08-10T00:00:00Z"),
    });
    expect(antwort.kriterien).toEqual([]);
    const hinweis = antwort.hinweise.join(" ");
    expect(hinweis).toContain("kein Kriterium zu diesem Thema");
    expect(hinweis).toContain("können etwas anderes meinen");
    expect(hinweis).toContain("fehlen ganz");
  });

  it("warnt NICHT, wenn ein Kriterium wirklich passt", async () => {
    const antwort = await beantworteFrage("Wer akzeptiert Kurzarbeitergeld?", {
      bankNamen: async () => [{ bankId: "A", name: "Testbank" }],
      zeilen: async () => [
        zeile({ bankId: "A", kriterium: "Kurzarbeitergeld", inhalt: "<p>Wird nicht angerechnet.</p>" }),
      ],
      abzugStand: async () => new Date("2026-08-10T00:00:00Z"),
    });
    expect(antwort.kriterien).toEqual(["Kurzarbeitergeld"]);
    expect(antwort.hinweise.join(" ")).not.toContain("kein Kriterium zu diesem Thema");
  });
});

describe("Stichwörter notfalls aus der Frage", () => {
  it("lässt Fragewörter weg und behält die Sache", () => {
    expect(stichwoerterAusFrage("Welche Banken akzeptieren eine befristete Aufenthaltsgenehmigung?"))
      .toEqual(["befristete", "Aufenthaltsgenehmigung"]);
  });

  it("liefert nichts, wenn die Frage nur aus Fragewörtern besteht", () => {
    expect(stichwoerterAusFrage("Welche Banken nehmen?")).toEqual([]);
  });
});

describe("Zuordnung der Produktübersichten", () => {
  it("deckt jeden Artikel ab, ohne Dubletten und ohne Erfindungen", async () => {
    // Bei 28 Einträgen ist Handarbeit billiger als jede Heuristik – aber sie
    // muss geprüft sein. Ein Teilstringvergleich hatte „Hannoversche“ (den
    // Versicherer) der „Hannoversche Volksbank“ zugeordnet.
    const z = (await import("@/lib/banken/produktuebersicht/zuordnung.json")).default;
    const auf = Object.keys(z.aufVorhandeneBank);
    const alle = [...auf, ...z.neueBank];

    expect(new Set(alle).size).toBe(alle.length); // kein Artikel doppelt
    const ziele = Object.values(z.aufVorhandeneBank);
    expect(new Set(ziele).size).toBe(ziele.length); // kein Ziel doppelt
    expect(alle).toHaveLength(28);
    // Keine leeren Namen auf beiden Seiten.
    for (const [artikel, bank] of Object.entries(z.aufVorhandeneBank)) {
      expect(artikel.trim().length).toBeGreaterThan(1);
      expect(String(bank).trim().length).toBeGreaterThan(1);
    }
  });
});

describe("Produktübersicht: Import-Regeln", () => {
  it("behält bei doppelter Zeile die längere Fassung und meldet es", () => {
    // Die Deutsche Bank führt „Selbstständige“ zweimal – einmal „ja“, einmal
    // mit Erläuterung. Ohne diesen Schritt entschiede die Reihenfolge, und zwar
    // stillschweigend.
    const { merkmale, zusammengefasst } = entdoppele([
      { abschnitt: "Antragsteller", unterabschnitt: null, bezeichnung: "Selbstständige", wert: "ja" },
      {
        abschnitt: "Antragsteller", unterabschnitt: null, bezeichnung: "Selbstständige",
        wert: "ja; angestellte Geschäftsführer gelten ab 10 % Beteiligung als selbstständig",
      },
      { abschnitt: "Immobilie", unterabschnitt: null, bezeichnung: "Erbbaurecht", wert: "nein" },
    ]);
    expect(merkmale).toHaveLength(2);
    expect(merkmale.find((m) => m.bezeichnung === "Selbstständige")!.wert).toContain("Geschäftsführer");
    expect(zusammengefasst).toEqual(["Antragsteller||Selbstständige"]);
  });

  it("erkennt „keine Angabe“ als fehlende Aussage – nicht als Nein", () => {
    // 279 der 1.380 Werte lauten wörtlich „keine Angabe“.
    expect(istOhneAussage("keine Angabe")).toBe(true);
    expect(istOhneAussage("  ")).toBe(true);
    expect(istOhneAussage("—")).toBe(true);
    expect(istOhneAussage("nein")).toBe(false);
    expect(istOhneAussage("ja, Blue Card möglich")).toBe(false);
  });

  it("kennzeichnet neu angelegte Banken als aus dem Wiki stammend", () => {
    // Eine erfundene Europace-Kennung wäre eine Behauptung über deren Bestand.
    expect(neueBankId("NRW.Bank")).toBe("WIKI_NRW_BANK");
    expect(neueBankId("Sparda-Bank Hessen eG")).toBe("WIKI_SPARDA_BANK_HESSEN_EG");
    expect(neueBankId("Versicherungskammer Bayern")).toBe("WIKI_VERSICHERUNGSKAMMER_BAYERN");
  });
});
