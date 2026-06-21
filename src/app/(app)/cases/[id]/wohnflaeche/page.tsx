import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WohnflaecheEditor } from "@/components/case/wohnflaeche-editor";

export const dynamic = "force-dynamic";

export default async function WohnflaechePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Objekt"
        title="Wohnflächenberechnung nach WoFlV"
        subtitle="Grundriss hochladen, KI-Vorschlag prüfen, bankfertiges PDF erzeugen. Jeder Wert ist editierbar."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />
      <WohnflaecheEditor caseId={id} />
    </div>
  );
}
