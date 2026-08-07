import { prisma } from "@/lib/db";
import type { Feld } from "@/lib/self-disclosure/types";

/**
 * Bekannte Werte aus dem Fall, damit der Kunde nichts abtippt, was schon
 * vorliegt (Name, Objektadresse, Kaufpreis nach FinLink-Import).
 *
 * Bewusst dieselbe Abwägung wie auf der Upload-Seite: Wer den Link hat, sieht
 * die Falldaten. Der Link wird gezielt verschickt, läuft ab und ist widerrufbar.
 */
export interface Vorbelegungsstand {
  applicants: Array<Record<string, unknown> & { position: number }>;
  property: Record<string, unknown> | null;
  financingRequest: Record<string, unknown> | null;
}

export async function ladeVorbelegung(caseId: string): Promise<Vorbelegungsstand> {
  const [applicants, property, financingRequest] = await Promise.all([
    prisma.applicant.findMany({ where: { caseId }, orderBy: { position: "asc" } }),
    prisma.property.findUnique({ where: { caseId } }),
    prisma.financingRequest.findUnique({ where: { caseId } }),
  ]);
  return {
    applicants: applicants as unknown as Vorbelegungsstand["applicants"],
    property: (property as Record<string, unknown> | null) ?? null,
    financingRequest: (financingRequest as Record<string, unknown> | null) ?? null,
  };
}

export function vorbelegung(stand: Vorbelegungsstand, feld: Feld, person: 1 | 2): string {
  if (!feld.ziel || "liste" in feld.ziel) return "";
  const quelle =
    feld.ziel.entitaet === "applicant"
      ? stand.applicants.find((a) => a.position === person)
      : feld.ziel.entitaet === "property"
        ? stand.property
        : feld.ziel.entitaet === "financingRequest"
          ? stand.financingRequest
          : null;
  const v = quelle?.[feld.ziel.feld];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
