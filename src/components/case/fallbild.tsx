"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Fallbild, Feld, Tor } from "@/lib/cases/fallbild";
import { TONE, type Tone } from "@/lib/ui/tone";
import { KontaktKnopfreihe } from "@/components/case/kontakt-knopfreihe";

/**
 * Das Fallbild: der Kunde in der Mitte, der Weg zur Einreichung als OFFENER
 * Bogen darum, die nebenlaeufigen Fachbereiche als Felder in der Mitte.
 *
 * Warum ein offener Bogen und kein Ring: Ein geschlossener Kreis behauptet,
 * dass alles in einer Reihe liegt, dass es rundlaeuft und dass "noch nicht
 * dran" dasselbe ist wie "leer". Deshalb liegen hier nur die fuenf echten Tore
 * auf dem Bogen, er hat sichtbar Start und Ziel, und was wartet, wird
 * gestrichelt mit Grund gezeigt statt als leerer Balken.
 *
 * Gezeichnet als SVG mit viewBox: Das Bild skaliert mit dem Kasten und laeuft
 * nie ueber – "alles auf einen Blick, ohne Scrollen" ist der ganze Zweck.
 */

/* Geometrie. Der Bogen laeuft von 210° im Uhrzeigersinn ueber den Scheitel bis
   150°; 0° ist oben. Damit steigt der Weg links auf und endet unten rechts,
   und die Luecke unten traegt sichtbar Start und Ziel. */
// Mehr Luft nach links und rechts als der Bogen breit ist: Die Torbeschriftung
// steht AUSSERHALB des Bogens (R + 30) und braucht dort ihre Textbreite.
// "Dokumentenpruefung" lief bei 820 Einheiten rechts aus dem Bild.
const CX = 450;
const CY = 340;
const R = 272;
const DICKE = 22;
const START = 210;
const SPANNE = 300;
const LUECKE = 2.2;

/** TONE fuehrt keine SVG-Farben – hier die Zuordnung auf die CSS-Variablen. */
const FARBE: Record<Tone, string> = {
  ready: "hsl(var(--success))",
  review: "hsl(var(--warning))",
  blocker: "hsl(var(--destructive))",
  ai: "hsl(var(--ai))",
  neutral: "hsl(var(--muted-foreground))",
};

/**
 * Zerlegt den Namen der Nabe in Zeilen. Zwei Antragsteller stehen als
 * "A & B" da – der Umbruch am "&" ist die einzige Stelle, an der ein
 * Kundenname ohne Sinnverlust brechen darf. Alles andere bleibt einzeilig
 * und wird ueber die Schriftgroesse eingepasst.
 */
function teileNamen(name: string): string[] {
  const teile = name.split(" & ").map((t) => t.trim()).filter(Boolean);
  return teile.length > 1 ? teile : [name];
}

function punkt(grad: number, radius: number): [number, number] {
  const rad = ((grad - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function bogenPfad(von: number, bis: number, radius: number): string {
  const [x1, y1] = punkt(von, radius);
  const [x2, y2] = punkt(bis, radius);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${bis - von > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * Lage und Groesse der vier Felder – zwei oben, zwei unten.
 *
 * Der Innenrand des Bogens (R minus halbe Strichstaerke) ist die harte Grenze:
 * Die ECKE eines Feldes liegt weiter vom Mittelpunkt entfernt als seine Mitte,
 * und genau daran ist die erste Fassung angeeckt. Bei diesen Werten liegt die
 * aeusserste Ecke bei rund 256 – der Innenrand bei 261.
 */
const FELDLAGE: Array<[number, number]> = [
  [-148, -96],
  [148, -96],
  [-148, 96],
  [148, 96],
];
const FELD_B = 160;
const FELD_H = 60;

export function FallbildAnsicht({
  bild,
  aktionSlot,
  caseId,
  telefon = null,
}: {
  bild: Fallbild;
  /**
   * Ersetzt im Band den Knopf der Empfehlung. Noetig fuer die Schritte, die
   * keine Links sind, sondern Server-Action-Formulare (KI laeuft, KI-Fehler,
   * Erstkontakt vorbereiten) – als Link wuerden sie schlicht nicht tun.
   */
  aktionSlot?: React.ReactNode;
  /**
   * `caseId`/`telefon` fuer die `KontaktKnopfreihe` bei "Kunden anrufen"
   * (`bild.naechstes.schluessel === "kontakt_aufnehmen"`). Optional, weil
   * `FallbildAnsicht` grundsaetzlich auch ohne Fallbezug denkbar waere –
   * ohne `caseId` bleibt die Knopfreihe einfach weg statt mit einer kaputten
   * Aktion zu rendern (dieselbe Regel wie in `NextStepCard`).
   */
  caseId?: string;
  telefon?: string | null;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const schritt = SPANNE / bild.tore.length;

  const waehle = (id: string) => setGewaehlt((v) => (v === id ? null : id));

  const gewaehltesElement: Tor | Feld | undefined = gewaehlt
    ? bild.tore.find((t) => t.id === gewaehlt) ?? bild.felder.find((f) => f.id === gewaehlt)
    : undefined;

  // Der Ton des Bandes folgt dem, was es zeigt.
  const ton: Tone = gewaehltesElement ? gewaehltesElement.ton : bild.naechstes.ton;

  const [sx, sy] = punkt(START, R);
  const [zx, zy] = punkt(START + SPANNE, R);

  return (
    /* Zeichnung und Empfehlung nebeneinander: Ein radiales Bild ist etwa
       quadratisch und laesst auf einem breiten Schirm viel Raum an den Seiten
       liegen. Den bekommt die Empfehlung – das spart zugleich Hoehe, und Hoehe
       ist hier die knappe Groesse. */
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Die Zeichnung liegt obenauf (Hero-Flaeche): Sie ist der Signatur-
          baustein der Fallakte und beantwortet als Erstes, wo der Fall steht. */}
      <div className="flaeche-oben overflow-hidden">
        <CardContent className="p-2">
          {/* Der Bogen erklaert sich nicht von selbst. Eine Zeile darueber sagt,
              was man da sieht – Juergens Wortlaut. */}
          <p className="px-2 pb-1 pt-1 text-sm font-semibold">Dein Weg zur Einreichung</p>
          {/* Kompakter als die erste Fassung (62vh): Der Bogen ist Orientierung,
              nicht Arbeitsfläche – bei halber Bildschirmhöhe bleibt darunter
              die Checkliste sichtbar, und die größeren Schriftgrade unten
              gleichen die Verkleinerung aus. */}
          <svg
            viewBox="0 0 900 625"
            preserveAspectRatio="xMidYMid meet"
            className="h-[clamp(340px,48vh,500px)] w-full"
            role="group"
            aria-label={`Übersicht zum Fall ${bild.fall.nummer}`}
          >
            {/* ── Die Tore auf dem Bogen ── */}
            {bild.tore.map((t, i) => {
              const von = START + i * schritt + LUECKE;
              const bis = START + (i + 1) * schritt - LUECKE;
              const aktiv = gewaehlt === t.id;
              const dick = aktiv ? DICKE + 5 : DICKE;
              // Gestrichelt NUR wenn es auch wirklich nichts zu zeigen gibt.
              // Vorhandenen Fortschritt zu verstecken waere derselbe Fehler
              // wie ein leerer Balken fuer "noch nicht dran".
              const leerGesperrt = Boolean(t.gesperrt) && t.anteil === 0;
              const bisVoll = von + (bis - von) * (t.anteil / 100);

              const mitte = (von + bis) / 2;
              const [lx, ly] = punkt(mitte, R + 30);
              const cos = Math.cos(((mitte - 90) * Math.PI) / 180);
              const anker = Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
              const dy = mitte > 90 && mitte < 270 ? 14 : 0;
              const markiert = bild.naechstes.markiert === t.id;
              const markeX = anker === "start" ? lx - 2 : anker === "end" ? lx - 96 : lx - 49;

              return (
                <g
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={aktiv}
                  aria-label={`${t.name}: ${t.zustand}`}
                  className="cursor-pointer outline-none [&:focus-visible_.rahmen]:stroke-[hsl(var(--ring))] [&:hover_.fuellung]:opacity-80"
                  onClick={() => waehle(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      waehle(t.id);
                    }
                  }}
                >
                  {leerGesperrt ? (
                    <path
                      className="rahmen"
                      d={bogenPfad(von, bis, R)}
                      stroke="hsl(var(--border))"
                      strokeWidth={dick}
                      fill="none"
                      strokeDasharray="1 7"
                      strokeLinecap="round"
                    />
                  ) : (
                    <>
                      <path
                        className="rahmen"
                        d={bogenPfad(von, bis, R)}
                        stroke="hsl(var(--muted))"
                        strokeWidth={dick}
                        fill="none"
                      />
                      {t.anteil > 0 && (
                        <path
                          className="fuellung"
                          d={bogenPfad(von, bisVoll, R)}
                          stroke={FARBE[t.ton]}
                          strokeWidth={dick}
                          fill="none"
                        />
                      )}
                    </>
                  )}
                  {/* Breite, unsichtbare Trefferflaeche: auch neben dem Strich klickbar. */}
                  <path d={bogenPfad(von, bis, R)} stroke="transparent" strokeWidth={46} fill="none" />

                  {markiert && (
                    <>
                      <rect x={markeX} y={ly + dy - 32} width={98} height={16} rx={3} fill="hsl(var(--ai))" />
                      <text
                        x={markeX + 49}
                        y={ly + dy - 20}
                        textAnchor="middle"
                        fontSize={9.5} fontWeight={700} letterSpacing="0.12em"
                        fill="hsl(var(--ai-foreground))"
                      >
                        ALS NÄCHSTES
                      </text>
                    </>
                  )}
                  {/* Eine Stufe größer als die erste Fassung (13,5/11,5): Das
                      Bild ist seit dem 20.08. kompakter, die Beschriftung muss
                      die Skalierung mittragen. */}
                  <text
                    x={lx}
                    y={ly + dy}
                    textAnchor={anker}
                    fontSize={15} fontWeight={600} fill="hsl(var(--foreground))"
                  >
                    {t.name}
                  </text>
                  <text
                    x={lx}
                    y={ly + dy + 17}
                    textAnchor={anker}
                    fontSize={12.5}
                    fill={t.ton === "blocker" ? FARBE.blocker : "hsl(var(--muted-foreground))"}
                  >
                    {t.zustand}
                  </text>
                </g>
              );
            })}

            {/* ── Start und Ziel an den offenen Enden: der Bogen laeuft nicht rund ──
                Zwei Flaggen am selben Mast: schlichtes Tuch fuer den Anfang,
                Zielflagge fuer das Ende. Ein Bildpaar, das jeder kennt, und es
                sagt in einem Blick, dass der Bogen eine Richtung hat.
                Bewusst OHNE Zustandsfarbe (kein Gruen, kein Rot): Gruen heisst
                auf diesem Bild "geschafft" – eine gruene Zielflagge wuerde
                jeden fertigen Fall behaupten. Der Ankerpunkt bleibt als
                Scheibe stehen, damit das Bogenende sichtbar endet. */}
            <StartZiel x={sx} y={sy} label="Start" seite="links" />
            <StartZiel x={zx} y={zy} label="Ziel" seite="rechts" ziel />

            {/* ── Die Nabe: der Kunde ── */}
            <rect
              x={CX - 95}
              y={CY - 54}
              width={190}
              height={108}
              rx={9}
              fill="hsl(var(--card))"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
            <text x={CX} y={CY - 30} textAnchor="middle" fontSize={10} letterSpacing="0.1em" fill="hsl(var(--muted-foreground))" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
              {bild.fall.nummer}
            </text>
            {/* Der Name traegt die Nabe – und sprengte sie: "Mate Topcic &
                Jadranka Topcic" lief bei fester Schriftgroesse weit ueber den
                Rahmen hinaus. Paare brechen deshalb am "&" um, und die
                Schriftgroesse folgt der laengsten Zeile. Abgeschnitten wird
                nichts: Ein halber Kundenname ist schlimmer als kleine Schrift. */}
            {(() => {
              const zeilen = teileNamen(bild.fall.name);
              const laengste = Math.max(...zeilen.map((z) => z.length));
              // 190 Einheiten Innenbreite, rund 0,55 Einheiten je Zeichen und
              // Punkt Schriftgroesse -> so viel passt hinein.
              const groesse = Math.max(12, Math.min(22, Math.floor(176 / (laengste * 0.55))));
              const start = zeilen.length === 1 ? CY - 4 : CY - 12;
              return zeilen.map((z, i) => (
                <text
                  key={i}
                  x={CX}
                  y={start + i * (groesse + 2)}
                  textAnchor="middle"
                  fontSize={groesse}
                  fontWeight={600}
                  fill="hsl(var(--foreground))"
                >
                  {z}
                </text>
              ));
            })()}
            <text
              x={CX}
              y={CY + (teileNamen(bild.fall.name).length > 1 ? 22 : 16)}
              textAnchor="middle"
              fontSize={11}
              fill="hsl(var(--muted-foreground))"
            >
              {bild.fall.vorhaben}
            </text>
            <text x={CX} y={CY + 42} textAnchor="middle" fontSize={16} fill="hsl(var(--foreground))" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)", fontVariantNumeric: "tabular-nums" }}>
              {bild.fall.betrag}
            </text>

            {/* ── Die vier nebenlaeufigen Felder ── */}
            {bild.felder.map((f, i) => {
              const [dx, dy] = FELDLAGE[i] ?? [0, 0];
              const x = CX + dx - FELD_B / 2;
              const y = CY + dy - FELD_H / 2;
              const aktiv = gewaehlt === f.id;
              const markiert = bild.naechstes.markiert === f.id;
              return (
                <g
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={aktiv}
                  aria-label={`${f.name}: ${f.wert} ${f.zeile}`}
                  className="cursor-pointer outline-none [&:focus-visible_.rahmen]:stroke-[hsl(var(--ring))] [&:hover_.rahmen]:stroke-[hsl(var(--ring))]"
                  onClick={() => waehle(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      waehle(f.id);
                    }
                  }}
                >
                  <rect
                    className="rahmen"
                    x={x}
                    y={y}
                    width={FELD_B}
                    height={FELD_H}
                    rx={7}
                    fill="hsl(var(--card))"
                    stroke={aktiv || markiert ? "hsl(var(--ai))" : "hsl(var(--border))"}
                    strokeWidth={aktiv || markiert ? 2 : 1}
                  />
                  <rect x={x} y={y + 9} width={3} height={FELD_H - 18} rx={1.5} fill={FARBE[f.ton]} />
                  {/* Drei Zeilen UNTEREINANDER. Nebeneinander gesetzt haben sich
                      Wert und Zeile gegenseitig ueberschrieben – im Bild sofort
                      sichtbar, in keinem Test. */}
                  <text x={x + 13} y={y + 19} fontSize={11.5} fill="hsl(var(--muted-foreground))">
                    {f.name}
                  </text>
                  <text x={x + 13} y={y + 39} fontSize={17} fontWeight={600} fill={FARBE[f.ton]} style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)", fontVariantNumeric: "tabular-nums" }}>
                    {f.wert}
                  </text>
                  <text x={x + 13} y={y + 52} fontSize={11.5} fill="hsl(var(--muted-foreground))">
                    {f.zeile}
                  </text>
                </g>
              );
            })}

            {/* Sagt in Worten, was die Form schon sagt – und raeumt die letzte
                Fehldeutung aus: diese vier stehen NEBEN dem Weg, nicht darauf. */}
            <text x={CX} y={CY + 160} textAnchor="middle" fontSize={12} fill="hsl(var(--muted-foreground))">
              diese vier laufen nebenher — ohne feste Reihenfolge
            </text>
          </svg>
        </CardContent>
      </div>

      {/* ── Das Band: Empfehlung, oder das angeklickte Element ──
          Bewusst dieselbe Bildsprache wie die bisherige NextStepCard: helle
          Karte, Rahmen und Flaeche im Ton des Schritts. Ein tintenfarbenes
          Band waere ein zweiter grosser Farbblock auf der Seite – die Tinte
          traegt in dieser App die EINE Hauptaktion, nicht ganze Flaechen. */}
      <Card className={cn("flex flex-col border-2", TONE[ton].border, TONE[ton].bg)}>
        <CardContent className="flex flex-1 flex-col justify-center gap-4 p-5">
          <div>
            <div className="eyebrow text-muted-foreground">
              {gewaehltesElement ? gewaehltesElement.name : "Nächster Schritt"}
            </div>
            <div className="text-lg font-semibold leading-snug">
              {gewaehltesElement
                ? "zustand" in gewaehltesElement
                  ? gewaehltesElement.zustand
                  : `${gewaehltesElement.wert} · ${gewaehltesElement.zeile}`
                : bild.naechstes.titel}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {gewaehltesElement ? gewaehltesElement.detail : bild.naechstes.grund}
            </p>
            {/* Verdrängte Schritte – dieselbe Zeile wie in `NextStepCard`: als
                Link-Zeile, nicht als zweiter Knopf, sonst stünden zwei
                Hauptaktionen nebeneinander. Ohne sie war "Wartet außerdem" ab
                der `lg`-Breite unsichtbar, also auf jedem gewöhnlichen
                Desktop – samt Abbruchvorschlag und offener Dokumentfreigabe.
                Nur bei der Empfehlung: Ein angeklicktes Tor erzählt seine
                eigene Geschichte, dort wäre die Zeile fehl am Platz. */}
            {!gewaehltesElement && bild.naechstes.wartet && bild.naechstes.wartet.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="eyebrow text-muted-foreground">Wartet außerdem</span>
                {bild.naechstes.wartet.map((w) => (
                  <Link
                    key={`${w.href}|${w.label}`}
                    href={w.href}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-ai/40 bg-card px-3 py-1 text-sm font-medium text-foreground transition-colors hover:border-ai hover:bg-ai/10"
                  >
                    <ScanSearch className="h-3.5 w-3.5 text-ai" />
                    {w.label}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {gewaehltesElement ? (
              <>
                <Button asChild size="sm" className="justify-center">
                  <Link href={gewaehltesElement.ziel.href}>
                    {gewaehltesElement.ziel.label}
                    <ArrowRight />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setGewaehlt(null)}>
                  Zur Empfehlung
                </Button>
              </>
            ) : (
              <>
                {aktionSlot}
                {/* EINE Definition (`KontaktKnopfreihe`), zwei Einbauorte –
                    dieselbe Zeile wie in `NextStepCard`. Ohne sie war "Kunden
                    anrufen" auf jedem Bildschirm ab der `lg`-Breite (also auf
                    jedem gewoehnlichen Desktop) nur ein Titel ohne
                    Handlungsknopf (Controller-Korrektur vom 14.08.2026). */}
                {bild.naechstes.schluessel === "kontakt_aufnehmen" && caseId && (
                  <KontaktKnopfreihe caseId={caseId} telefon={telefon} />
                )}
                {bild.naechstes.ziel && (
                  <Button asChild size="sm" className="justify-center">
                    <Link href={bild.naechstes.ziel.href}>
                      {bild.naechstes.ziel.label}
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Flagge samt Beschriftung an einem offenen Ende des Bogens.
 *
 * Beide Flaggen sind Geschwister: gleiche Masthoehe, gleicher Fuss, gleiche
 * gewellte Tuchkontur. Nur die Fuellung unterscheidet sie – der Start traegt
 * ein ruhiges einfarbiges Tuch, das Ziel das karierte Muster, das jeder als
 * Zielflagge liest. So sagt das Bildpaar auf einen Blick, dass der Bogen eine
 * Richtung hat, ohne dass ein zweites Formenvokabular dazukommt.
 *
 * Die Tuecher wehen einander ZU (das linke nach rechts, das rechte nach
 * links). Nach aussen gerichtet liefe das linke Tuch in den aufsteigenden
 * Bogen hinein – dort ist bei dieser Masthoehe nur ein Fingerbreit Platz. So
 * stehen sie stattdessen wie ein Tor am offenen Ende, und der Raum unterhalb
 * der Nabe ist ohnehin frei. Gespiegelt wird die ganze Tuchgruppe, nicht jede
 * Koordinate einzeln – die Kontur bleibt dadurch auf beiden Seiten dieselbe.
 *
 * Bewusst OHNE Zustandsfarbe: Gruen heisst auf diesem Bild "geschafft"; eine
 * gruene Zielflagge wuerde jeden Fall fuer fertig erklaeren.
 */
function StartZiel({
  x,
  y,
  label,
  seite,
  ziel = false,
}: {
  x: number;
  y: number;
  label: string;
  seite: "links" | "rechts";
  ziel?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  // Nach innen: am linken Ende weht das Tuch nach rechts und umgekehrt.
  const richtung = seite === "links" ? 1 : -1;

  const B = 40; // Tuchbreite
  const H = 26; // Tuchhoehe
  const MAST = 58; // Masthoehe ueber dem Ankerpunkt
  const oben = -MAST;
  const farbe = "hsl(var(--foreground))";
  // Die Startflagge traegt die Tinte der Marke. Kein Gruen, kein Rot: Auf
  // diesem Bild sind das Zustaende ("geschafft", "blockiert"), und eine
  // Flagge ist kein Zustand.
  const tuchfarbe = ziel ? farbe : "hsl(var(--primary))";

  // Stoff, kein verzogenes Rechteck: Ober- und Unterkante laufen PARALLEL
  // durch dieselbe Welle, um H versetzt. Die erste Fassung liess beide Kanten
  // gegeneinander schwingen – das Tuch dellte in der Mitte ein.
  const welle = (y: number, richtungHin: boolean) =>
    richtungHin
      ? `C ${B * 0.38} ${y - 6}, ${B * 0.62} ${y + 8}, ${B} ${y + 3}`
      : `C ${B * 0.62} ${y + 8}, ${B * 0.38} ${y - 6}, 0 ${y}`;
  const tuch =
    `M 0 ${oben} ${welle(oben, true)} ` +
    `L ${B} ${oben + H + 3} ` +
    `${welle(oben + H, false)} Z`;

  // Wenige, grosse Karos wirken ruhiger als ein feines Raster, das bei dieser
  // Groesse nur noch flimmert.
  const spalten = 3;
  const zeilen = 2;

  return (
    <g transform={`translate(${x},${y})`} aria-hidden>
      {/* Fuss: eine flache Scheibe. Sie markiert weiterhin das Bogenende – der
          nackte Punkt von vorher war genau das, nur ohne Flagge darauf. */}
      <ellipse cx={0} cy={0} rx={7.5} ry={2.8} fill={farbe} opacity={0.9} />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={oben - 4}
        stroke={farbe}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {/* Knauf an der Mastspitze – ohne ihn endet der Mast wie abgeschnitten. */}
      <circle cx={0} cy={oben - 5} r={2.6} fill={farbe} />

      <g transform={richtung < 0 ? "scale(-1,1)" : undefined}>
        {ziel ? (
          <>
            <defs>
              <clipPath id={`tuch-${id}`}>
                <path d={tuch} />
              </clipPath>
            </defs>
            {/* Karos innerhalb der Tuchkontur: Das Muster wellt dadurch mit,
                statt in einem starren Rechteck zu sitzen. */}
            {/* Das Karomuster liegt grosszuegig ueber der Kontur und wird von
                ihr beschnitten – so wellt es mit, statt in einem starren
                Rechteck zu sitzen. Rand: 12 Einheiten nach oben und unten
                decken die Wellenbewegung sicher ab. */}
            <g clipPath={`url(#tuch-${id})`}>
              <rect x={0} y={oben - 12} width={B} height={H + 24} fill="hsl(var(--card))" />
              {Array.from({ length: spalten }).map((_, sp) =>
                Array.from({ length: zeilen }).map((_, ze) =>
                  (sp + ze) % 2 === 0 ? (
                    <rect
                      key={`${sp}-${ze}`}
                      x={(B / spalten) * sp}
                      y={oben - 12 + ((H + 24) / zeilen) * ze}
                      width={B / spalten}
                      height={(H + 24) / zeilen}
                      fill={farbe}
                    />
                  ) : null
                )
              )}
            </g>
            <path d={tuch} fill="none" stroke={farbe} strokeWidth={1.6} strokeLinejoin="round" />
          </>
        ) : (
          <path d={tuch} fill={tuchfarbe} stroke={tuchfarbe} strokeWidth={1.4} strokeLinejoin="round" />
        )}
      </g>

      {/* Die Beschriftung bleibt AUSSEN – unter dem Tuch stuende sie im Bild. */}
      <text
        x={(seite === "links" ? -1 : 1) * 11}
        y={16}
        textAnchor={seite === "links" ? "end" : "start"}
        fontSize={12}
        fontWeight={600}
        fill="hsl(var(--muted-foreground))"
      >
        {label}
      </text>
    </g>
  );
}
