import { AIService } from "@/lib/ai/service";
import { getStorage } from "@/lib/storage";
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Bild-Einstufung fuer Dateien ohne Textgrundlage (06.09.2026, Fall Schmidt).
 *
 * Bis dahin galt: ohne Text keine Einstufung, das Dokument ist "unlesbar".
 * Fuer gescannte Papiere stimmt das. Fuer Hausfotos, fotografierte Grundrisse
 * und Flurkarten nicht - die tragen naturgemaess keinen Text und sind trotzdem
 * vollwertige Unterlagen. Hier schaut die Bild-KI auf die Datei selbst.
 *
 * Bilder gehen als data-URI, PDFs als kurzlebige signierte URL (lokaler
 * Storage kann keine URL - dann bleibt es beim alten Verhalten). Nur ein
 * klares Ergebnis zaehlt: Typ ungleich "sonstige" und Konfidenz ab 0,6.
 * Alles andere bleibt "unlesbar", und der Weg heraus ist wie bisher die
 * Typwahl von Hand.
 */

/** Mindestkonfidenz, ab der die Bild-Einstufung uebernommen wird. */
export const BILD_MIN_KONFIDENZ = 0.6;
const SIGNIERTE_URL_SEKUNDEN = 600;

export interface BildEinstufung {
  documentType: DocumentType;
  confidence: number;
  beschreibung: string | null;
}

export async function stufeBildEin(
  input: { storageKey: string; mimeType: string; originalName?: string | null; buffer?: Buffer | null },
  ai: AIService = new AIService()
): Promise<BildEinstufung | null> {
  const istBild = input.mimeType.startsWith("image/");
  let medien: { image?: { base64: string; mimeType: string }; documentUrl?: string };
  if (istBild) {
    const buffer = input.buffer ?? (await getStorage().get(input.storageKey));
    if (!buffer) return null;
    medien = { image: { base64: buffer.toString("base64"), mimeType: input.mimeType } };
  } else {
    const url = await getStorage().createSignedUrl(input.storageKey, SIGNIERTE_URL_SEKUNDEN);
    if (!url) return null;
    medien = { documentUrl: url };
  }
  const ergebnis = await ai.classifyImageDocument(medien, { originalName: input.originalName ?? undefined });
  if (ergebnis.documentType === "sonstige" || ergebnis.confidence < BILD_MIN_KONFIDENZ) return null;
  return {
    documentType: ergebnis.documentType,
    confidence: ergebnis.confidence,
    beschreibung: ergebnis.beschreibung?.trim() || null,
  };
}
