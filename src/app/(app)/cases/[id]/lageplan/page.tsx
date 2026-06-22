import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LageplanTool } from "@/components/case/lageplan-tool";

export const dynamic = "force-dynamic";

export default async function LageplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);
  const property = await prisma.property.findUnique({ where: { caseId: id } });
  const initialAddress = [property?.street, [property?.zip, property?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Objekt"
        title="Lageplan (Orientierung)"
        subtitle="Aus der Objektadresse einen Orientierungs-Lageplan erzeugen, als Unterlage ablegen und die amtliche Flurkarte über das Landes-Geoportal abrufen."
        actions={<Button asChild variant="outline" size="sm"><Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link></Button>}
      />
      <LageplanTool caseId={id} initialAddress={initialAddress} />
    </div>
  );
}
