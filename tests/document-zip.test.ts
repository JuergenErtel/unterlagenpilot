import { describe, it, expect } from "vitest";
import { uniqueEntryName, buildZipManifest, type ZipDoc } from "@/lib/documents/zip";

describe("uniqueEntryName", () => {
  it("gibt den Namen unverändert zurück, wenn noch frei", () => {
    const used = new Set<string>();
    expect(uniqueEntryName("Gehaltsabrechnung.pdf", used)).toBe("Gehaltsabrechnung.pdf");
  });

  it("hängt bei Kollision einen Zähler vor der Endung an", () => {
    const used = new Set<string>(["Gehaltsabrechnung.pdf"]);
    expect(uniqueEntryName("Gehaltsabrechnung.pdf", used)).toBe("Gehaltsabrechnung_2.pdf");
  });

  it("zählt bei mehrfacher Kollision weiter hoch", () => {
    const used = new Set<string>(["Ausweis.jpg", "Ausweis_2.jpg"]);
    expect(uniqueEntryName("Ausweis.jpg", used)).toBe("Ausweis_3.jpg");
  });

  it("kommt mit Namen ohne Endung klar", () => {
    const used = new Set<string>(["Dokument"]);
    expect(uniqueEntryName("Dokument", used)).toBe("Dokument_2");
  });
});

describe("buildZipManifest", () => {
  const base: ZipDoc = {
    generatedName: null,
    originalName: "datei.pdf",
    storageKey: "k",
    scanStatus: "ready_for_ocr",
    reviewStatus: "akzeptiert",
  };

  it("nutzt den generierten (umbenannten) Namen, sonst den Originalnamen", () => {
    const manifest = buildZipManifest([
      { ...base, generatedName: "Gehaltsabrechnung_Max_2026-05.pdf", storageKey: "k1" },
      { ...base, generatedName: null, originalName: "IMG_1234.jpg", storageKey: "k2" },
    ]);
    expect(manifest.map((m) => m.name)).toEqual([
      "Gehaltsabrechnung_Max_2026-05.pdf",
      "IMG_1234.jpg",
    ]);
  });

  it("schließt abgelehnte, duplizierte, quarantänisierte und rejected Dokumente aus", () => {
    const manifest = buildZipManifest([
      { ...base, storageKey: "ok" },
      { ...base, storageKey: "abgelehnt", reviewStatus: "abgelehnt" },
      { ...base, storageKey: "duplikat", reviewStatus: "duplikat" },
      { ...base, storageKey: "quarantted", scanStatus: "quarantined" },
      { ...base, storageKey: "virus", scanStatus: "rejected" },
    ]);
    expect(manifest.map((m) => m.storageKey)).toEqual(["ok"]);
  });

  it("macht Namensdubletten eindeutig", () => {
    const manifest = buildZipManifest([
      { ...base, generatedName: "Gehaltsabrechnung.pdf", storageKey: "a" },
      { ...base, generatedName: "Gehaltsabrechnung.pdf", storageKey: "b" },
    ]);
    expect(manifest.map((m) => m.name)).toEqual([
      "Gehaltsabrechnung.pdf",
      "Gehaltsabrechnung_2.pdf",
    ]);
  });
});
