import { describe, it, expect, vi } from "vitest";

// Encoder mocken (kein echtes HEIC-Sample im Test nötig).
vi.mock("heic-convert", () => ({
  default: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])),
}));

import { isHeic, normalizeUploadFile } from "@/lib/documents/heic";

/** Baut einen ISO-BMFF-Header mit ftyp-Box und gegebenem Major-Brand. */
function ftyp(brand: string): Buffer {
  const head = Buffer.from([0, 0, 0, 0x18]); // Box-Größe (egal)
  return Buffer.concat([head, Buffer.from("ftyp" + brand + "0000", "latin1")]);
}

describe("isHeic", () => {
  it("erkennt HEIC/HEIF-Brands", () => {
    for (const brand of ["heic", "heix", "mif1", "hevc", "msf1"]) {
      expect(isHeic(ftyp(brand))).toBe(true);
    }
  });

  it("erkennt Nicht-HEIC nicht als HEIC", () => {
    expect(isHeic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false); // PNG
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false); // JPEG
    expect(isHeic(ftyp("mp42"))).toBe(false); // MP4
  });

  it("ist robust bei zu kurzen Puffern", () => {
    expect(isHeic(Buffer.from([0, 0, 0]))).toBe(false);
    expect(isHeic(Buffer.alloc(0))).toBe(false);
  });
});

describe("normalizeUploadFile", () => {
  it("konvertiert HEIC nach JPEG (.jpg, image/jpeg)", async () => {
    const { file, converted } = await normalizeUploadFile({
      name: "IMG_1234.HEIC",
      type: "image/heic",
      size: 100,
      buffer: ftyp("heic"),
    });
    expect(converted).toBe(true);
    expect(file.name).toBe("IMG_1234.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.buffer[0]).toBe(0xff); // JPEG-Magic
    expect(file.buffer[1]).toBe(0xd8);
  });

  it("lässt Nicht-HEIC unverändert", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { file, converted } = await normalizeUploadFile({ name: "a.png", type: "image/png", size: 12, buffer: png });
    expect(converted).toBe(false);
    expect(file.name).toBe("a.png");
  });
});
