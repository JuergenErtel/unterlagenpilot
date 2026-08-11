import { faltenBasis } from "@/lib/text/falten";

/**
 * Zuordnung von Dokumenten zu Antragstellern anhand des von der KI erkannten
 * Namens (`Document.detectedApplicant`).
 *
 * Bewusst streng: Ehepaare mit gleichem Nachnamen sind in der Baufinanzierung
 * der Normalfall. Ein Abgleich allein über den Nachnamen träfe dort
 * systematisch die falsche Person. Ein nicht zugeordnetes Dokument ist ein
 * sichtbarer, korrigierbarer Zustand – eine falsche Zuordnung ein stiller
 * Fehler.
 *
 * Reine Logik: keine Datenbank, keine KI-Aufrufe.
 */

export interface ApplicantCandidate {
  id: string;
  position: number;
  vorname: string | null;
  nachname: string | null;
}

/** Kleinschreibung, Umlaute/ß aufgelöst, Diakritika entfernt. */
function fold(value: string): string {
  return faltenBasis(value);
}

/**
 * Zerlegt einen Namen in vergleichbare Wörter. Bindestriche und Satzzeichen
 * sind Wortgrenzen – „Meier-Schmidt" trifft damit auch „Meier Schmidt".
 */
function tokenize(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Passt der Kandidat auf den erkannten Namen? Verlangt Vor- UND Nachname als
 * eigenes Wort – wortweise, nicht per Teilstring (sonst träfe „Berg" auf
 * „Bergmann").
 */
function candidateMatches(candidate: ApplicantCandidate, detectedTokens: string[]): boolean {
  const vornameTokens = tokenize(candidate.vorname ?? "");
  const nachnameTokens = tokenize(candidate.nachname ?? "");
  if (vornameTokens.length === 0 || nachnameTokens.length === 0) return false;

  const hasAll = (tokens: string[]) => tokens.every((t) => detectedTokens.includes(t));
  return hasAll(vornameTokens) && hasAll(nachnameTokens);
}

/**
 * Liefert die ID des eindeutig passenden Antragstellers oder null.
 *
 * Bei genau einem Antragsteller im Fall wird immer diesem zugeordnet – die
 * Zuordnung ist dann trivial eindeutig. Sie wird als `auto` markiert und
 * dadurch revidierbar, sobald eine zweite Person dazukommt.
 */
export function matchApplicant(
  detectedName: string | null | undefined,
  applicants: ApplicantCandidate[]
): string | null {
  if (applicants.length === 0) return null;
  if (applicants.length === 1) return applicants[0]!.id;

  const detectedTokens = tokenize(detectedName ?? "");
  if (detectedTokens.length === 0) return null;

  const hits = applicants.filter((a) => candidateMatches(a, detectedTokens));
  return hits.length === 1 ? hits[0]!.id : null;
}

export interface RematchDocument {
  id: string;
  applicantId: string | null;
  /** "auto" | "manuell" | null (Bestandsdaten ohne Herkunft). */
  applicantSource: string | null;
  detectedApplicant: string | null;
}

export interface RematchChange {
  documentId: string;
  applicantId: string;
}

/**
 * Entscheidet, welche Dokumente eines Falls neu zugeordnet werden müssen.
 *
 * Angefasst wird nur, was unzugeordnet ist oder automatisch zugeordnet wurde –
 * Entscheidungen des Vermittlers bleiben unangetastet. Liefert der Abgleich
 * kein eindeutiges Ergebnis, bleibt eine bestehende Zuordnung stehen: Die
 * Checkliste soll nie rückwärts laufen.
 */
export function planRematch(
  docs: RematchDocument[],
  applicants: ApplicantCandidate[]
): RematchChange[] {
  const changes: RematchChange[] = [];
  for (const doc of docs) {
    const editable = doc.applicantId === null || doc.applicantSource === "auto";
    if (!editable) continue;

    const match = matchApplicant(doc.detectedApplicant, applicants);
    if (match === null || match === doc.applicantId) continue;

    changes.push({ documentId: doc.id, applicantId: match });
  }
  return changes;
}
