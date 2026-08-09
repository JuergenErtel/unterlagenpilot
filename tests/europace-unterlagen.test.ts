import { describe, expect, it, vi } from "vitest";
import { uebertrageUnterlagen } from "@/lib/platforms/europace/unterlagen";
import { EuropaceApiError } from "@/lib/platforms/europace/client";

const DOKUMENTE = [
  {
    id: "d1",
    generatedName: "Personalausweis Anna Muster.pdf",
    originalName: "scan1.pdf",
    documentType: "personalausweis" as const,
    mimeType: "application/pdf",
    storageKey: "org/case/d1.pdf",
    europaceDokumentId: null,
  },
  {
    id: "d2",
    generatedName: "Gehaltsabrechnung 05-2026.pdf",
    originalName: "scan2.pdf",
    documentType: "gehaltsabrechnung" as const,
    mimeType: "application/pdf",
    storageKey: "org/case/d2.pdf",
    europaceDokumentId: null,
  },
];

function deps(over: Partial<Parameters<typeof uebertrageUnterlagen>[1]> = {}) {
  return {
    client: {
      validiereKundenangaben: vi.fn(async () => {}),
      legeVorgangAn: vi.fn(async () => "YX4MDU"),
      ladeDokumentHoch: vi.fn(async () => "ep-dok-1"),
    },
    ladeVorgangsnummer: vi.fn(async () => "YX4MDU" as string | null),
    ladeDokumente: vi.fn(async () => DOKUMENTE),
    ladeDatei: vi.fn(async () => Buffer.from("PDF")),
    merkeDokumentId: vi.fn(async () => {}),
    protokolliere: vi.fn(async () => {}),
    ...over,
  };
}

describe("uebertrageUnterlagen", () => {
  it("laedt jedes akzeptierte Dokument hoch und merkt sich die ID", async () => {
    const d = deps();
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis).toMatchObject({ ok: true, uebertragen: 2 });
    expect(d.client!.ladeDokumentHoch).toHaveBeenCalledTimes(2);
    expect(d.client!.ladeDokumentHoch).toHaveBeenCalledWith(
      expect.objectContaining({
        vorgangsnummer: "YX4MDU",
        kategorie: "Ausweis",
        anzeigename: "Personalausweis Anna Muster.pdf",
      })
    );
    expect(d.merkeDokumentId).toHaveBeenCalledWith("d1", "ep-dok-1");
  });

  it("ueberspringt bereits uebertragene Dokumente", async () => {
    const d = deps({
      ladeDokumente: vi.fn(async () => [
        { ...DOKUMENTE[0]!, europaceDokumentId: "schon-da" },
        DOKUMENTE[1]!,
      ]),
    });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.uebersprungen).toBe(1);
    expect(d.client!.ladeDokumentHoch).toHaveBeenCalledOnce();
  });

  it("laedt die uebrigen weiter hoch, wenn eine Datei scheitert", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {}),
        legeVorgangAn: vi.fn(async () => "YX4MDU"),
        ladeDokumentHoch: vi
          .fn()
          .mockRejectedValueOnce(new EuropaceApiError("Dokument-Upload fehlgeschlagen (HTTP 500)."))
          .mockResolvedValueOnce("ep-dok-2"),
      },
    });

    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.fehlgeschlagen).toEqual([
      { name: "Personalausweis Anna Muster.pdf", grund: "Dokument-Upload fehlgeschlagen (HTTP 500)." },
    ]);
    expect(ergebnis.ok).toBe(false);
  });

  it("verweigert die Uebertragung ohne Vorgangsnummer", async () => {
    const d = deps({ ladeVorgangsnummer: vi.fn(async () => null) });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain("Vorgang");
    expect(d.client!.ladeDokumentHoch).not.toHaveBeenCalled();
  });

  it("meldet eine im Speicher fehlende Datei, ohne abzubrechen", async () => {
    const d = deps({ ladeDatei: vi.fn(async (key: string) => (key.endsWith("d1.pdf") ? null : Buffer.from("PDF"))) });
    const ergebnis = await uebertrageUnterlagen("case-1", d);

    expect(ergebnis.uebertragen).toBe(1);
    expect(ergebnis.fehlgeschlagen[0]!.grund).toContain("Speicher");
  });
});
