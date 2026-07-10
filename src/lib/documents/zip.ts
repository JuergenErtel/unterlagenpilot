/**
 * Auswahl & Namensauflösung für den ZIP-Export der Falldokumente.
 * Rein (ohne I/O) gehalten, damit die Logik testbar bleibt; das Laden der
 * Bytes und das Packen übernimmt die Route.
 */

import { isDeliverableScanStatus } from "@/lib/domain/enums";

export interface ZipDoc {
  generatedName: string | null;
  originalName: string;
  storageKey: string;
  scanStatus: string;
  reviewStatus: string;
}

export interface ZipEntry {
  name: string;
  storageKey: string;
}

// Diese Dokumente gehören nicht in ein Einreichungspaket.
const EXCLUDED_REVIEW = new Set(["abgelehnt", "duplikat"]);

/** Liefert einen im Set noch nicht vergebenen Dateinamen (fügt _2, _3 … vor der Endung ein). */
export function uniqueEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let candidate = `${stem}_${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${stem}_${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Baut die Liste der zu packenden Einträge: filtert abgelehnte/duplizierte und
 * sicherheitsgesperrte Dokumente aus und vergibt kollisionsfreie, umbenannte
 * Dateinamen (generierter Name bevorzugt, sonst Originalname).
 */
export function buildZipManifest(docs: ZipDoc[]): ZipEntry[] {
  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  for (const doc of docs) {
    if (!isDeliverableScanStatus(doc.scanStatus) || EXCLUDED_REVIEW.has(doc.reviewStatus)) continue;
    const desired = (doc.generatedName?.trim() || doc.originalName || "dokument").trim();
    entries.push({ name: uniqueEntryName(desired, used), storageKey: doc.storageKey });
  }
  return entries;
}
