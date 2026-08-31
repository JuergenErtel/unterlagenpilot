import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { getCaseAggregate } from "@/lib/cases/service";
import { fehltFuerSatz } from "@/lib/checklists/engine";
import {
  baueArbeitsplatz,
  abschnittFortschritt,
  type ArbeitsplatzDokument,
} from "@/lib/unterlagen/arbeitsplatz";
import { UnterlagenArbeitsplatz } from "@/components/case/unterlagen-arbeitsplatz";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
// Die KI-Nachprüfung eines einzelnen Dokuments läuft synchron in der
// Server-Action dieser Seite – ihr Zeitbudget muss die KI-Aufrufe tragen.
export const maxDuration = 300;

/** Fester Formatierer: Serverzeit ist UTC, angezeigt wird Ortszeit. */
const UPLOAD_ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Der Unterlagen-Arbeitsplatz: Soll, Ist und Vorschau nebeneinander.
 *
 * Eigene Unterseite statt eines weiteren Reiters in der Fallakte - die ist
 * schon die schwerste Seite der App, und drei Spalten brauchen die volle
 * Bildschirmbreite.
 */
export default async function UnterlagenArbeitsplatzPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const caseRow = await prisma.case.findFirstOrThrow({
    where: { id, organizationId: ctx.organizationId },
    select: {
      caseNumber: true,
      applicants: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, vorname: true, nachname: true },
      },
    },
  });

  const [aggregate, documents] = await Promise.all([
    getCaseAggregate(id),
    prisma.document.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        originalName: true,
        generatedName: true,
        mimeType: true,
        documentType: true,
        applicantId: true,
        applicantSource: true,
        reviewStatus: true,
        readable: true,
        classificationStatus: true,
        extractionStatus: true,
        createdAt: true,
      },
    }),
  ]);

  const checklist = aggregate.checklist.map((i) => ({
    key: i.key,
    name: i.name,
    level: i.level,
    status: i.status,
    documentType: i.documentType,
    effectiveRequiredCount: i.effectiveRequiredCount,
    fehltFuer: fehltFuerSatz(i.offeneAntragsteller, caseRow.applicants),
  }));

  const arbeitsplatzDokumente: ArbeitsplatzDokument[] = documents.map((d) => ({
    id: d.id,
    name: d.generatedName ?? d.originalName,
    originalName: d.originalName,
    mimeType: d.mimeType,
    documentType: d.documentType,
    applicantId: d.applicantId,
    applicantSource: d.applicantSource,
    reviewStatus: d.reviewStatus,
    readable: d.readable,
    classificationStatus: d.classificationStatus,
    extractionStatus: d.extractionStatus,
    hochgeladenAm: d.createdAt.toISOString(),
    hochgeladenAmText: `${UPLOAD_ZEIT.format(d.createdAt)} Uhr`,
  }));

  const arbeitsplatz = baueArbeitsplatz(checklist, arbeitsplatzDokumente);
  const fortschritt = arbeitsplatz.abschnitte.map((a) => ({
    titel: a.titel,
    ...abschnittFortschritt(a),
  }));

  const kundenName =
    caseRow.applicants
      .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ") || "—";
  const applicantOptions = caseRow.applicants.map((a) => ({
    id: a.id,
    name: [a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unterlagen-Status"
        title="Unterlagen-Arbeitsplatz"
        subtitle={
          <>
            Fall <span className="font-mono tabular">{caseRow.caseNumber}</span> · {kundenName} —
            links das Soll, in der Mitte das Ist, rechts prüfen und entscheiden.
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      <UnterlagenArbeitsplatz
        caseId={id}
        arbeitsplatz={arbeitsplatz}
        applicants={applicantOptions}
        fortschritt={fortschritt}
      />
    </div>
  );
}
