import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { WoflvRoom, RoomCategory } from "@/lib/wohnflaeche/woflv";

export const roomCategoryEnum = z.enum([
  "wohnraum",
  "balkon_terrasse_loggia",
  "zubehoer_keller_hobby_abstell",
  "wintergarten",
  "schwimmbad",
]);

const floorplanRoomSchema = z.object({
  geschoss: z.string().default("EG"),
  raumname: z.string().default("Raum"),
  kategorie: roomCategoryEnum.default("wohnraum"),
  flaecheM2: z.number().positive().optional(),
  laengeM: z.number().positive().optional(),
  breiteM: z.number().positive().optional(),
  dachschraege: z.boolean().optional(),
  beheizt: z.boolean().optional(),
  konfidenz: z.number().min(0).max(1).default(0.5),
  quelle: z
    .enum(["flaeche_beschriftet", "aus_massen_berechnet", "aus_massstab_geschaetzt"])
    .default("aus_massstab_geschaetzt"),
});

export const floorplanAnalysisSchema = z.object({
  rooms: z.array(floorplanRoomSchema).default([]),
});

export type FloorplanAnalysis = z.infer<typeof floorplanAnalysisSchema>;
export type FloorplanRoom = z.infer<typeof floorplanRoomSchema>;

export const floorplanJsonSchema = zodToJsonSchema(floorplanAnalysisSchema, "floorplan") as Record<string, unknown>;

function nextId(): string {
  return crypto.randomUUID();
}

/** Erweitert die Engine-Eingabe um Konfidenz/Quelle für die UI. */
export interface FloorplanWoflvRoom extends WoflvRoom {
  konfidenz: number;
  quelle: FloorplanRoom["quelle"];
  dachschraegeHinweis: boolean;
}

export function toWoflvRooms(a: FloorplanAnalysis): FloorplanWoflvRoom[] {
  return a.rooms.map((r) => {
    const flaecheM2 =
      r.flaecheM2 ?? (r.laengeM && r.breiteM ? Math.round(r.laengeM * r.breiteM * 100) / 100 : 0);
    return {
      id: nextId(),
      geschoss: r.geschoss,
      raumname: r.raumname,
      kategorie: r.kategorie as RoomCategory,
      flaecheM2,
      beheizt: r.beheizt,
      dachschraege: null,
      dachschraegeHinweis: r.dachschraege ?? false,
      konfidenz: r.konfidenz,
      quelle: r.quelle,
    };
  });
}
