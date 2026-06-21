import { describe, it, expect } from "vitest";
import { computeWoflv, type WoflvRoom } from "@/lib/wohnflaeche/woflv";

const room = (p: Partial<WoflvRoom>): WoflvRoom => ({
  id: p.id ?? "r", geschoss: p.geschoss ?? "EG", raumname: p.raumname ?? "Raum",
  kategorie: p.kategorie ?? "wohnraum", flaecheM2: p.flaecheM2 ?? 10,
  balkonFaktor: p.balkonFaktor, beheizt: p.beheizt, dachschraege: p.dachschraege ?? null,
});

describe("WoFlV-Engine", () => {
  it("rechnet Wohnraum mit 100%", () => {
    const r = computeWoflv([room({ flaecheM2: 24.5 })]);
    expect(r.summeWohnflaecheM2).toBe(24.5);
    expect(r.summeZubehoerM2).toBe(0);
  });

  it("Balkon Standard 25%, einstellbar 50%", () => {
    expect(computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 12 })]).summeWohnflaecheM2).toBe(3);
    expect(computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 12, balkonFaktor: 0.5 })]).summeWohnflaecheM2).toBe(6);
  });

  it("Zubehör (Keller) zählt 0% zur Wohnfläche, getrennt ausgewiesen", () => {
    const r = computeWoflv([room({ kategorie: "zubehoer_keller_hobby_abstell", flaecheM2: 30 })]);
    expect(r.summeWohnflaecheM2).toBe(0);
    expect(r.summeZubehoerM2).toBe(30);
    expect(r.rooms[0]!.istZubehoer).toBe(true);
  });

  it("Dachschräge: <1m 0%, 1-2m 50%, >=2m 100%", () => {
    const r = computeWoflv([room({ flaecheM2: 30, dachschraege: { unter1m: 5, zw1und2m: 10, ab2m: 15 } })]);
    // 5*0 + 10*0.5 + 15*1 = 20
    expect(r.summeWohnflaecheM2).toBe(20);
  });

  it("Wintergarten beheizt 100% / unbeheizt 50%", () => {
    expect(computeWoflv([room({ kategorie: "wintergarten", flaecheM2: 10, beheizt: true })]).summeWohnflaecheM2).toBe(10);
    expect(computeWoflv([room({ kategorie: "wintergarten", flaecheM2: 10, beheizt: false })]).summeWohnflaecheM2).toBe(5);
  });

  it("rundet auf 2 Nachkommastellen", () => {
    const r = computeWoflv([room({ kategorie: "balkon_terrasse_loggia", flaecheM2: 10 })]);
    expect(r.summeWohnflaecheM2).toBe(2.5);
  });
});
