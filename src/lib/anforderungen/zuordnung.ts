import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/enums";
import { KATEGORIE } from "@/lib/platforms/europace/dokument-kategorien";
import { matchApplicant, type ApplicantCandidate } from "@/lib/documents/applicant-match";
import type { Bezugskategorie, Unterlagenanforderung } from "@/lib/platforms/europace/types";

/**
 * Kategorien, die keine Aussage treffen. "Sonstiges" ist bei uns das Ziel von
 * darlehensvertrag, weg_protokoll UND sonstige – daraus laesst sich kein Typ
 * zurueckrechnen, und ein geratener waere schlechter als keiner.
 */
const NICHTSSAGEND = new Set(["Sonstiges"]);

/**
 * Europace-Kategorie -> BaufiDesk-Dokumenttyp, also die Umkehrung von KATEGORIE.
 *
 * Die Umkehrung ist mehrdeutig: BWA ist Ziel von vier Typen. Aufgeloest wird
 * ueber die Reihenfolge in DOCUMENT_TYPES – eine ausdrueckliche, im Code
 * nachlesbare Rangfolge statt der Schluesselreihenfolge eines Objekts, die
 * niemand als Entscheidung erkennt.
 */
const RUECKWAERTS: Map<string, DocumentType> = (() => {
  const m = new Map<string, DocumentType>();
  for (const typ of DOCUMENT_TYPES) {
    const kategorie = KATEGORIE[typ];
    if (NICHTSSAGEND.has(kategorie)) continue;
    if (!m.has(kategorie)) m.set(kategorie, typ);
  }
  return m;
})();

export function dokumenttypFuer(
  erfuellungskategorien: string[] | undefined
): DocumentType | null {
  for (const k of erfuellungskategorien ?? []) {
    const treffer = RUECKWAERTS.get(k);
    if (treffer) return treffer;
  }
  return null;
}

/**
 * Ordnet den Bezug einer Anforderung einem Antragsteller zu.
 *
 * Nutzt bewusst denselben strengen Namensabgleich wie die Auto-Zuordnung von
 * Dokumenten: Ein Fall darf nicht zwei verschiedene Vorstellungen davon haben,
 * wem etwas gehoert.
 */
export function antragstellerFuer(
  bezug: Bezugskategorie | undefined,
  applicants: ApplicantCandidate[]
): string | null {
  if (bezug?.typ !== "antragsteller") return null;
  return matchApplicant(bezug.name, applicants);
}

/** Anzeigename einer Anforderung – nie leer, damit keine namenlose Zeile entsteht. */
export function bezeichnungFuer(a: Unterlagenanforderung): string {
  return a.kurzbezeichnung || a.text || a.code || "Unbenannte Anforderung";
}
