import type { Prisma } from "@prisma/client";

/**
 * Normalisiert eine Sucheingabe: trimmt, kollabiert innere Whitespaces und
 * verwirft zu kurze Eingaben (< 2 Zeichen), damit die Suche nicht bei jedem
 * einzelnen Tastendruck die halbe Datenbank scannt.
 */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const q = raw.trim().replace(/\s+/g, " ");
  return q.length >= 2 ? q : null;
}

const insensitive = (contains: string): Prisma.StringFilter => ({ contains, mode: "insensitive" });

/** Where-Clause für Dokumente, die auf Dateinamen ODER OCR-Text matchen. */
export function documentMatchWhere(q: string): Prisma.DocumentWhereInput {
  return {
    OR: [
      { generatedName: insensitive(q) },
      { originalName: insensitive(q) },
      { pages: { some: { ocrText: insensitive(q) } } },
    ],
  };
}

/**
 * OR-Bedingungen für die Fallsuche: Fallnummer, Antragstellernamen und
 * Dokumentinhalte (Dateiname + OCR-Volltext).
 */
export function caseSearchOR(q: string): Prisma.CaseWhereInput["OR"] {
  return [
    { caseNumber: insensitive(q) },
    { applicants: { some: { OR: [{ vorname: insensitive(q) }, { nachname: insensitive(q) }] } } },
    { documents: { some: documentMatchWhere(q) } },
  ];
}
