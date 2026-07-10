import type { DocumentType } from "@/lib/domain/enums";
import type { CanonicalCase } from "@/lib/domain/canonical";
import type { ExtractedField, PlausibilityCheck } from "@/lib/domain/ai-schemas";

/**
 * Cross-Dokument-Plausibilisierung: gleicht Werte zwischen Dokumenten und den
 * Fallstammdaten ab (Kaufpreis, Eigentümer/Verkäufer, Nettoeinkommen, Kontoinhaber).
 * Rein & deterministisch, damit testbar und ohne KI-Kosten.
 */

export interface DocFields {
  documentType: DocumentType | null;
  fields: ExtractedField[];
}

/** Deutsche Zahl/Betrag → number. "349.000,00 €" → 349000. null bei Unparsbarem. */
export function parseGermanNumber(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value)
    .replace(/[^0-9.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // Tausenderpunkte
    .replace(",", ".");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Grobe Namensübereinstimmung: teilen sich zwei Namen ein „bedeutsames" Wort? */
export function namesOverlap(a: string, b: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-zäöüß\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);
  const at = new Set(tokens(a));
  const bt = tokens(b);
  return bt.some((w) => at.has(w));
}

function mk(
  key: string,
  category: string,
  status: PlausibilityCheck["status"],
  explanation: string
): PlausibilityCheck {
  return {
    key,
    category,
    status,
    explanation,
    recommendedAction: undefined,
    customerVisible: false,
    relevantEuropace: true,
    relevantFinlink: false,
    relevantEhyp: true,
  };
}

const field = (fields: ExtractedField[], key: string) =>
  fields.find((f) => f.key === key)?.value;

/** Weicht `a` um mehr als `tol` (Anteil) von `b` ab? */
function differsBy(a: number, b: number, tol: number): boolean {
  if (a === 0 && b === 0) return false;
  const base = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / base > tol;
}

export function crossDocumentChecks(
  caseData: Partial<CanonicalCase>,
  documents: DocFields[]
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const byType = (t: DocumentType) => documents.find((d) => d.documentType === t)?.fields ?? [];

  const kaufvertrag = byType("kaufvertragsentwurf");
  const expose = byType("expose");
  const grundbuch = byType("grundbuchauszug");
  const gehalt = byType("gehaltsabrechnung");
  const konto = byType("kontoauszug");

  // 1) Kaufpreis: Kaufvertrag ↔ Antrag ↔ Exposé
  const kpVertrag = parseGermanNumber(field(kaufvertrag, "kaufpreis"));
  const kpExpose = parseGermanNumber(field(expose, "kaufpreis"));
  const kpAntrag = caseData.financing?.kaufpreis ?? null;
  const preise: Array<[string, number]> = [];
  if (kpVertrag != null) preise.push(["Kaufvertrag", kpVertrag]);
  if (kpExpose != null) preise.push(["Exposé", kpExpose]);
  if (kpAntrag != null) preise.push(["Antrag", kpAntrag]);
  for (let i = 0; i < preise.length; i++) {
    for (let j = i + 1; j < preise.length; j++) {
      if (differsBy(preise[i]![1], preise[j]![1], 0.01)) {
        checks.push(
          mk(
            `plaus.kaufpreis.${preise[i]![0]}.${preise[j]![0]}`,
            "Kaufpreis",
            "warnung",
            `Kaufpreis weicht ab: ${preise[i]![0]} ${eur(preise[i]![1])} vs. ${preise[j]![0]} ${eur(preise[j]![1])}.`
          )
        );
      }
    }
  }

  // 2) Eigentümer (Grundbuch) ↔ Verkäufer (Kaufvertrag)
  const eigentuemer = field(grundbuch, "eigentuemer");
  const verkaeufer = field(kaufvertrag, "verkaeufer");
  if (eigentuemer && verkaeufer && !namesOverlap(String(eigentuemer), String(verkaeufer))) {
    checks.push(
      mk(
        "plaus.eigentuemer_verkaeufer",
        "Objekt",
        "warnung",
        `Eigentümer laut Grundbuch ("${eigentuemer}") und Verkäufer laut Kaufvertrag ("${verkaeufer}") stimmen nicht offensichtlich überein.`
      )
    );
  }

  // 3) Netto Gehaltsabrechnung ↔ angegebenes Nettoeinkommen
  const nettoGehalt = parseGermanNumber(field(gehalt, "netto"));
  const nettoAngabe = caseData.income?.[0]?.nettoMonatlich ?? null;
  if (nettoGehalt != null && nettoAngabe != null && nettoAngabe > 0 && differsBy(nettoGehalt, nettoAngabe, 0.1)) {
    checks.push(
      mk(
        "plaus.netto_abgleich",
        "Einkommen",
        "warnung",
        `Netto laut Gehaltsabrechnung (${eur(nettoGehalt)}) weicht >10 % vom angegebenen Nettoeinkommen (${eur(nettoAngabe)}) ab.`
      )
    );
  }

  // 4) Kontoinhaber (Kontoauszug) ↔ Antragsteller
  const kontoinhaber = field(konto, "kontoinhaber");
  const applicantNames = (caseData.applicants ?? [])
    .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
    .filter(Boolean);
  if (kontoinhaber && applicantNames.length > 0 && !applicantNames.some((n) => namesOverlap(String(kontoinhaber), n))) {
    checks.push(
      mk(
        "plaus.kontoinhaber",
        "Einkommen",
        "warnung",
        `Kontoinhaber des Kontoauszugs ("${kontoinhaber}") passt zu keinem Antragsteller – bitte Zuordnung prüfen.`
      )
    );
  }

  return checks;
}

function eur(n: number): string {
  return `${Math.round(n).toLocaleString("de-DE")} €`;
}
