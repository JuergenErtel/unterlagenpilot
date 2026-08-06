import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateFileName } from "@/lib/documents/filename";
import { planRematch } from "@/lib/documents/applicant-match";
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Gleicht alle Dokumente eines Falls erneut gegen seine Antragsteller ab.
 *
 * Nötig, weil Antragsteller nachträglich dazukommen: Beim FinLink-Import kommt
 * oft nur eine Person mit, die zweite trägt der Vermittler später nach – die
 * bereits hochgeladenen Dokumente hängen dann an der falschen Person und die
 * Checkliste meldet "fehlt", obwohl die Datei da ist.
 *
 * Reine Textlogik auf dem gespeicherten `detectedApplicant`: kein KI-Aufruf,
 * kein OCR, daher beliebig oft aufrufbar.
 *
 * @returns Zahl der umgehängten Dokumente.
 */
export async function rematchCaseDocuments(
  caseId: string,
  actor?: { organizationId: string; userId?: string | null }
): Promise<number> {
  const [applicants, docs] = await Promise.all([
    prisma.applicant.findMany({
      where: { caseId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, vorname: true, nachname: true },
    }),
    prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        applicantId: true,
        applicantSource: true,
        detectedApplicant: true,
        documentType: true,
        period: true,
        originalName: true,
      },
    }),
  ]);

  const changes = planRematch(docs, applicants);
  if (changes.length === 0) return 0;

  const nameById = new Map(
    applicants.map((a) => [a.id, [a.vorname, a.nachname].filter(Boolean).join(" ") || null])
  );
  const docById = new Map(docs.map((d) => [d.id, d]));

  for (const change of changes) {
    const doc = docById.get(change.documentId)!;
    const applicantName = nameById.get(change.applicantId) ?? null;
    // Der Dateiname trägt den Antragstellernamen – nach dem Umhängen neu erzeugen.
    const generatedName = doc.documentType
      ? generateFileName({
          documentType: doc.documentType as DocumentType,
          applicantName,
          period: doc.period,
          originalName: doc.originalName,
        })
      : undefined;

    await prisma.document.update({
      where: { id: change.documentId },
      data: {
        applicantId: change.applicantId,
        applicantSource: "auto",
        ...(generatedName ? { generatedName } : {}),
      },
    });

    if (actor) {
      await audit({
        organizationId: actor.organizationId,
        userId: actor.userId ?? null,
        action: "document.reviewed",
        entityType: "document",
        entityId: change.documentId,
        metadata: { assignedApplicant: change.applicantId, source: "auto-match" },
      });
    }
  }

  return changes.length;
}
