import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
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
  await requireCaseAccess(id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Selbständige"
        title="Einkommensanalyse Selbständige"
        subtitle="Finanzunterlagen hochladen, KI-Kennzahlen je Jahr prüfen, Einkommensansatz eintragen, bankfertiges PDF erzeugen."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />
      <EinkommenEditor caseId={id} />
    </div>
  );
}
