import { GRUNDERWERBSTEUER } from "./bundesland";
import type { Annahmen, NebenkostenAufstellung, SolverEingabe } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Nebenkosten muss der Solver selbst rechnen, weil mehrere Hebel sie
 * veraendern (Kaufpreis nachverhandeln, Inventar herausrechnen).
 *
 * Sie sind nicht beleihbar – genau daran scheitern die Faelle, bei denen das
 * Eigenkapital "eigentlich reichen muesste".
 */
export function berechneNebenkosten(e: SolverEingabe, a: Annahmen): NebenkostenAufstellung {
  const steuersatzUnsicher = e.grunderwerbsteuerProzentOverride == null && e.bundesland == null;
  const satz =
    e.grunderwerbsteuerProzentOverride ??
    (e.bundesland ? GRUNDERWERBSTEUER[e.bundesland] : a.grEStFallbackProzent);

  // Inventar ist nicht grunderwerbsteuerpflichtig.
  const steuerBasis = Math.max(e.kaufpreis - e.inventarAnteil, 0);
  const grunderwerbsteuer = r2((steuerBasis * satz) / 100);
  const notarGrundbuch = r2((e.kaufpreis * a.notarGrundbuchProzent) / 100);
  const makler = r2((e.kaufpreis * (e.maklerprovisionProzent || 0)) / 100);

  return {
    grunderwerbsteuer,
    notarGrundbuch,
    makler,
    // Ein am Fall erfasster Betrag gewinnt – nie beides addieren.
    summe: e.nebenkostenErfasst ?? r2(grunderwerbsteuer + notarGrundbuch + makler),
    gerechnet: e.nebenkostenErfasst == null,
    steuersatzUnsicher,
    grunderwerbsteuerProzent: satz,
  };
}
