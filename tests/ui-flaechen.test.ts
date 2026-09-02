import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KpiKarte, LeerZustand, Zaehler, Hinweis } from "@/components/ui/flaechen";
import { StatusMarke, FristMarke } from "@/components/backoffice/status-anzeigen";

/**
 * Die gemeinsamen Flaechen serverseitig gerendert - ohne Browser, aber mit
 * den Regeln, die sonst niemand prueft: Null-Zaehler verschwinden, eine
 * Null in der KPI-Karte tritt zurueck, Status tragen Text zur Farbe.
 */
describe("Flaechen", () => {
  it("zeigt bei null keinen Zaehler und kappt ueber 99", () => {
    expect(renderToStaticMarkup(createElement(Zaehler, { n: 0 }))).toBe("");
    expect(renderToStaticMarkup(createElement(Zaehler, { n: 3 }))).toContain(">3<");
    expect(renderToStaticMarkup(createElement(Zaehler, { n: 150 }))).toContain("99+");
    expect(renderToStaticMarkup(createElement(Zaehler, { n: 2 }))).toContain('aria-label="2 offen"');
  });

  it("laesst eine Null in der KPI-Karte zuruecktreten, auch bei kritischem Ton", () => {
    const leer = renderToStaticMarkup(createElement(KpiKarte, { wert: 0, label: "Frist überschritten", ton: "kritisch" }));
    expect(leer).toContain("text-muted-foreground/45");
    expect(leer).not.toContain("text-destructive");
    const voll = renderToStaticMarkup(createElement(KpiKarte, { wert: 2, label: "Frist überschritten", ton: "kritisch" }));
    expect(voll).toContain("text-destructive");
  });

  it("verlinkt die KPI-Karte nur, wenn ein Ziel gesetzt ist", () => {
    expect(renderToStaticMarkup(createElement(KpiKarte, { wert: 1, label: "x", href: "/backoffice/queue" }))).toContain('href="/backoffice/queue"');
    expect(renderToStaticMarkup(createElement(KpiKarte, { wert: 1, label: "x" }))).not.toContain("href=");
  });

  it("beantwortet im leeren Zustand alle drei Fragen: warum, was tun, wohin", () => {
    const html = renderToStaticMarkup(
      createElement(LeerZustand, { titel: "Noch kein Auftrag", text: "Legen Sie den ersten an.", aktion: { href: "/x/neu", label: "Anlegen" }, nebenAktion: { href: "/x", label: "Ansehen" } })
    );
    expect(html).toContain("Noch kein Auftrag");
    expect(html).toContain("Legen Sie den ersten an.");
    expect(html).toContain('href="/x/neu"');
    expect(html).toContain('href="/x"');
  });

  it("Hinweise tragen eine Rolle fuer Screenreader", () => {
    expect(renderToStaticMarkup(createElement(Hinweis, { ton: "kritisch", children: "Blockiert" }))).toContain('role="alert"');
    expect(renderToStaticMarkup(createElement(Hinweis, { ton: "info", children: "Info" }))).toContain('role="status"');
  });

  it("Statusmarken sagen den Zustand als Text, nicht nur als Farbe", () => {
    const html = renderToStaticMarkup(createElement(StatusMarke, { status: "wartet_auf_unterlagen" }));
    expect(html).toContain("Wartet auf Unterlagen");
    const portal = renderToStaticMarkup(createElement(StatusMarke, { status: "qualitaetskontrolle", portal: true }));
    expect(portal).toContain("In Bearbeitung");
    expect(portal).not.toContain("Qualitätskontrolle");
    const pausiert = renderToStaticMarkup(createElement(StatusMarke, { status: "in_aufbereitung", pausiert: true }));
    expect(pausiert).toContain("Pausiert");
  });

  it("Fristmarke traegt den Zustand im Text", () => {
    const jetzt = new Date("2026-09-02T10:00:00+02:00");
    const ueber = renderToStaticMarkup(createElement(FristMarke, { faelligAm: new Date("2026-08-30T17:00:00+02:00"), status: "in_aufbereitung", pausiert: false, jetzt }));
    expect(ueber).toContain("überfällig");
    const ruht = renderToStaticMarkup(createElement(FristMarke, { faelligAm: new Date("2026-08-30T17:00:00+02:00"), status: "wartet_auf_unterlagen", pausiert: false, jetzt }));
    expect(ruht).toContain("Frist ruht");
  });
});
