/**
 * Freier Notizblock am Fall (`Case.notes`).
 *
 * Eigene Datei, weil die Server-Action-Module ("use server") ausschliesslich
 * async-Funktionen exportieren duerfen – eine Konstante daneben bricht
 * `next build`.
 */

/** Obergrenze fuer den Notizblock. Grosszuegig genug fuer jedes Telefonat,
 *  aber eine Grenze: Ohne sie landet ein versehentlich eingefuegtes PDF als
 *  Megabyte-Text in einer Spalte, die jede Fallakte mitlaedt. */
export const NOTIZEN_MAX_ZEICHEN = 20000;
