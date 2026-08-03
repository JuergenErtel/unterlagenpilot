import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Erkennt das Folgerauschen von Reacts Streaming-SSR – NICHT dessen Ursache.
 *
 * React liefert lange Seiten in Teilstücken: der fertige Inhalt landet zunächst
 * in einem versteckten `<div id="S:x">` am Body-Ende, ein Inline-Skript am
 * Dokumentende schiebt ihn dann an seinen Platzhalter `<template id="P:x">`:
 *
 *     $RS = function (a, b) {
 *       a = document.getElementById(a);   // versteckter Container
 *       b = document.getElementById(b);   // Platzhalter im React-Baum
 *       a.parentNode.removeChild(a); …    // <- wirft, wenn a/b fehlen
 *     }
 *
 * Musste React den Baum zwischenzeitlich clientseitig neu aufbauen (Hydration-
 * Mismatch, React #418), sind die Platzhalter weg und JEDES dieser Skripte wirft
 * "Cannot read properties of null (reading 'parentNode')". Das Dashboard liefert
 * 12 solcher Teilstücke – daher exakt 12 identische Sentry-Events pro
 * betroffenem Aufruf (Issue BAUFIDESK-B), obwohl es EIN Vorfall ist.
 *
 * Die Seite bleibt dabei vollständig: der Inhalt kommt aus der RSC-Payload, die
 * React selbst rendert – diese Skripte verschieben nur noch vorgerendertes HTML.
 * Deshalb ist das Melden dieser Kaskade wertlos.
 *
 * Bewusst eng gefasst: es braucht BEIDES – einen Frame aus Reacts Streaming-
 * Skripten (`$RS`/`$RC`/`$RX`) UND die parentNode-Meldung. Der auslösende
 * Hydration-Fehler bleibt sichtbar; er ist das echte Signal.
 */
export function isReactStreamingCascade(event: ErrorEvent): boolean {
  const exceptions = event.exception?.values ?? [];
  const fromStreamingScript = exceptions.some((value) =>
    value.stacktrace?.frames?.some(
      (frame) =>
        frame.function === "$RS" || frame.function === "$RC" || frame.function === "$RX"
    )
  );
  const mentionsParentNode = exceptions.some((value) => value.value?.includes("parentNode"));
  return fromStreamingScript && mentionsParentNode;
}
