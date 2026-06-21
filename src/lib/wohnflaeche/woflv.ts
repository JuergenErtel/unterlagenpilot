export type RoomCategory =
  | "wohnraum"
  | "balkon_terrasse_loggia"
  | "zubehoer_keller_hobby_abstell"
  | "wintergarten"
  | "schwimmbad";

export interface WoflvRoom {
  id: string;
  geschoss: string;
  raumname: string;
  kategorie: RoomCategory;
  flaecheM2: number;
  /** Anrechnungsfaktor für Balkon/Terrasse/Loggia (Standard 0.25, max 0.5). */
  balkonFaktor?: number;
  /** Nur Wintergarten/Schwimmbad: beheizt = 100 %, sonst 50 %. */
  beheizt?: boolean;
  /** Teilflächen nach lichter Höhe (m²). Wenn gesetzt, ersetzt es die einfache Anrechnung. */
  dachschraege?: { unter1m: number; zw1und2m: number; ab2m: number } | null;
}

export interface WoflvRoomResult extends WoflvRoom {
  faktor: number;
  anrechenbarM2: number;
  istZubehoer: boolean;
}

export interface WoflvResult {
  rooms: WoflvRoomResult[];
  summeWohnflaecheM2: number;
  summeZubehoerM2: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function anrechenbar(room: WoflvRoom): { faktor: number; anrechenbarM2: number; istZubehoer: boolean } {
  if (room.kategorie === "zubehoer_keller_hobby_abstell") {
    return { faktor: 0, anrechenbarM2: 0, istZubehoer: true };
  }
  if (room.kategorie === "balkon_terrasse_loggia") {
    const f = Math.min(0.5, Math.max(0, room.balkonFaktor ?? 0.25));
    return { faktor: f, anrechenbarM2: round2(room.flaecheM2 * f), istZubehoer: false };
  }
  if (room.kategorie === "wintergarten" || room.kategorie === "schwimmbad") {
    const f = room.beheizt ? 1 : 0.5;
    return { faktor: f, anrechenbarM2: round2(room.flaecheM2 * f), istZubehoer: false };
  }
  // wohnraum (ggf. mit Dachschräge)
  if (room.dachschraege) {
    const d = room.dachschraege;
    const flaeche = d.unter1m * 0 + d.zw1und2m * 0.5 + d.ab2m * 1;
    const basis = d.unter1m + d.zw1und2m + d.ab2m || 1;
    return { faktor: round2(flaeche / basis), anrechenbarM2: round2(flaeche), istZubehoer: false };
  }
  return { faktor: 1, anrechenbarM2: round2(room.flaecheM2), istZubehoer: false };
}

export function computeWoflv(rooms: WoflvRoom[]): WoflvResult {
  const results: WoflvRoomResult[] = rooms.map((r) => ({ ...r, ...anrechenbar(r) }));
  const summeWohnflaecheM2 = round2(
    results.filter((r) => !r.istZubehoer).reduce((s, r) => s + r.anrechenbarM2, 0)
  );
  const summeZubehoerM2 = round2(
    results.filter((r) => r.istZubehoer).reduce((s, r) => s + r.flaecheM2, 0)
  );
  return { rooms: results, summeWohnflaecheM2, summeZubehoerM2 };
}
