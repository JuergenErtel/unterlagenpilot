import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EinkommenEditor } from "@/components/case/einkommen-editor";

export const dynamic = "force-dynamic";

export default async function EinkommenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await requireCaseAccess(id);

  const caseRow = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      applicants: {
        orderBy: { position: "asc" },
        include: { selfEmployment: true },
      },
    },
  });
  if (!caseRow) notFound();

  const applicants = caseRow.applicants.map((a) => ({
    position: a.position,
    name: [a.vorname, a.nachname].filter(Boolean).join(" "),
  }));

  const defaultApplicant = caseRow.applicants[0];
  const record = defaultApplicant?.selfEmployment[0];
  const selfEmployment = defaultApplicant
    ? {
        position: defaultApplicant.position,
        firma: record?.firma ?? "",
        rechtsform: record?.rechtsform ?? "",
        gruendungsjahr: record?.gruendungsdatum ? record.gruendungsdatum.getUTCFullYear() : null,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Selbständige"
        title="Selbständigen-Unterlagen → Bankzusammenfassung"
        subtitle="Finanzunterlagen hochladen, KI-Kennzahlen je Jahr prüfen, Einkommensansatz eintragen, bankfertige Zusammenfassung erzeugen."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />
      <EinkommenEditor caseId={id} applicants={applicants} selfEmployment={selfEmployment} />
    </div>
  );
}
