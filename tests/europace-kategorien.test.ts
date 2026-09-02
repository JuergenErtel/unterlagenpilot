import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { europaceKategorie } from "@/lib/platforms/europace/dokument-kategorien";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";

const ERLAUBT: string[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../src/lib/platforms/europace/schema/dokument-kategorien.json"),
    "utf8"
  )
);

describe("europaceKategorie", () => {
  it("bildet jeden BaufiDesk-Dokumenttyp auf eine gueltige Europace-Kategorie ab", () => {
    const ungueltig = DOCUMENT_TYPES.filter((t) => !ERLAUBT.includes(europaceKategorie(t)));
    expect(ungueltig).toEqual([]);
  });

  it("ordnet den Personalausweis der Kategorie Ausweis zu", () => {
    expect(europaceKategorie("personalausweis")).toBe("Ausweis");
  });

  it("legt Bauzeichnungen unter Bauplan ab", () => {
    expect(europaceKategorie("grundriss")).toBe("Bauplan");
    expect(europaceKategorie("ansichten")).toBe("Bauplan");
    expect(europaceKategorie("skizze")).toBe("Bauplan");
  });

  it("faellt fuer unbekannte Typen auf Sonstiges zurueck", () => {
    expect(europaceKategorie(null)).toBe("Sonstiges");
  });
});
