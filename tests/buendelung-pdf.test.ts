import { describe, it, expect } from "vitest";
import { baueBuendelPdf } from "@/lib/buendelung/pdf";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
/** 800x1200, hochformat. */
const HOCH = () => readFileSync(join(FIXTURES, "seite-hoch.jpg"));
/** 1600x900, querformat. */
const QUER = () => readFileSync(join(FIXTURES, "seite-quer.jpg"));
const PNG = () => readFileSync(join(FIXTURES, "seite-hoch.png"));

/** Erzeugt ein einseitiges PDF mit dem vorhandenen pdfkit. */
async function einseitigesPdf(): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
    doc.addPage().text("Gescannte Seite");
    doc.end();
  });
}

async function seitenzahl(pdf: Buffer): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(pdf)).getPageCount();
}

async function seitenMasse(pdf: Buffer, index: number): Promise<{ breite: number; hoehe: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const { width, height } = (await PDFDocument.load(pdf)).getPage(index).getSize();
  return { breite: Math.round(width), hoehe: Math.round(height) };
}

describe("baueBuendelPdf", () => {
  it("macht aus zwei Fotos ein zweiseitiges PDF", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: HOCH() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("legt ein hochformatiges Foto auf A4 hoch", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: HOCH() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    // Banken erwarten A4-Seiten, keine Fotoformate.
    expect(await seitenMasse(pdf, 0)).toEqual({ breite: 595, hoehe: 842 });
  });

  it("dreht die Seite fuer ein querformatiges Foto", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/jpeg", buffer: QUER() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenMasse(pdf, 0)).toEqual({ breite: 842, hoehe: 595 });
    expect(await seitenMasse(pdf, 1)).toEqual({ breite: 595, hoehe: 842 });
  });

  it("uebernimmt ein einseitiges PDF unveraendert", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "application/pdf", buffer: await einseitigesPdf() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("kann PNG", async () => {
    const pdf = await baueBuendelPdf([
      { mimeType: "image/png", buffer: PNG() },
      { mimeType: "image/jpeg", buffer: HOCH() },
    ]);
    expect(await seitenzahl(pdf)).toBe(2);
  });

  it("wirft mit Klartext, wenn ein Teil kaputt ist", async () => {
    await expect(
      baueBuendelPdf([
        { mimeType: "image/jpeg", buffer: Buffer.from("kein Bild") },
        { mimeType: "image/jpeg", buffer: HOCH() },
      ])
    ).rejects.toThrow(/Seite 1/);
  });

  it("wirft bei einem nicht unterstuetzten Typ", async () => {
    await expect(
      baueBuendelPdf([
        { mimeType: "image/tiff", buffer: Buffer.from("x") },
        { mimeType: "image/jpeg", buffer: HOCH() },
      ])
    ).rejects.toThrow(/image\/tiff/);
  });
});
