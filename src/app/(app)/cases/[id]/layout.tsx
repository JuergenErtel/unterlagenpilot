import { CaseNav } from "@/components/case/case-nav";

/**
 * Rahmen aller Fall-Unterseiten: die Bereichsleiste oben, darunter die Seite.
 * Keine Datenbankzugriffe hier - die Seiten pruefen den Zugang selbst
 * (requireContext + Organisationsfilter); die Leiste kennt nur die ID.
 */
export default async function CaseLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <CaseNav caseId={id} />
      {children}
    </div>
  );
}
