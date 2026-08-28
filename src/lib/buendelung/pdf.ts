/** A4 in PDF-Punkten (72 dpi). */
const A4_KURZ = 595;
const A4_LANG = 842;

export interface BuendelTeil {
  mimeType: string;
  buffer: Buffer;
}

/**
 * Baut aus Einzelseiten EIN PDF - in genau der uebergebenen Reihenfolge.
 *
 * Bilder kommen auf eine A4-Seite (bei querformatigem Bild A4 quer),
 * proportional eingepasst und zentriert: Banken erwarten A4-Seiten, keine
 * Fotoformate. Ein bereits einseitiges PDF wird unveraendert uebernommen -
 * keine Neuberechnung, kein Qualitaetsverlust.
 *
 * Wirft mit deutschem Klartext und der SEITENNUMMER, wenn ein Teil nicht
 * verarbeitbar ist. Der Aufrufer bricht dann alles ab: ein halb
 * zusammengefuegtes Dokument waere schlimmer als gar keines.
 */
export async function baueBuendelPdf(teile: BuendelTeil[]): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const ziel = await PDFDocument.create();

  for (const [index, teil] of teile.entries()) {
    const nummer = index + 1;
    try {
      if (teil.mimeType === "application/pdf") {
        const quelle = await PDFDocument.load(teil.buffer);
        const [seite] = await ziel.copyPages(quelle, [0]);
        ziel.addPage(seite);
        continue;
      }

      const bild =
        teil.mimeType === "image/png"
          ? await ziel.embedPng(teil.buffer)
          : teil.mimeType === "image/jpeg" || teil.mimeType === "image/jpg"
            ? await ziel.embedJpg(teil.buffer)
            : null;
      if (!bild) {
        throw new Error(`Dateityp ${teil.mimeType} kann nicht eingebettet werden.`);
      }

      // Querformatiges Foto bekommt eine quere Seite - sonst schrumpft der
      // Text auf ein Drittel und wird unlesbar.
      const quer = bild.width > bild.height;
      const seitenBreite = quer ? A4_LANG : A4_KURZ;
      const seitenHoehe = quer ? A4_KURZ : A4_LANG;
      const seite = ziel.addPage([seitenBreite, seitenHoehe]);

      const faktor = Math.min(seitenBreite / bild.width, seitenHoehe / bild.height);
      const breite = bild.width * faktor;
      const hoehe = bild.height * faktor;
      seite.drawImage(bild, {
        x: (seitenBreite - breite) / 2,
        y: (seitenHoehe - hoehe) / 2,
        width: breite,
        height: hoehe,
      });
    } catch (e) {
      const grund = e instanceof Error ? e.message : String(e);
      throw new Error(`Seite ${nummer} konnte nicht verarbeitet werden: ${grund}`);
    }
  }

  return Buffer.from(await ziel.save());
}
