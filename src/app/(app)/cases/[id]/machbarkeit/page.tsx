import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { prisma } from "@/lib/db";
import { baueEingabe } from "@/lib/machbarkeit/eingabe";
import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { loese } from "@/lib/machbarkeit/solver";
import type { Bundesland } from "@/lib/machbarkeit/bundesland";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MachbarkeitErgebnis } from "@/components/case/machbarkeit-ergebnis";

export const dynamic = "force-dynamic";

/**
 * Machbarkeitsrechnung: woran scheitert der Fall, und welche kleinste
 * Veraenderung macht ihn darstellbar? Rein abgeleitet – es wird nichts
 * gespeichert und kann deshalb auch nichts veralten.
 */
export default async function MachbarkeitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCaseAccess(id);

  const [canonical, caseRow] = await Promise.all([
    caseToCanonical(id),
    prisma.case.findUnique({
      where: { id },
      select: {
        caseNumber: true,
        applicants: { select: { anzahlKinder: true }, orderBy: { position: "asc" } },
        property: { select: { bundesland: true } },
        financingRequest: { select: { grunderwerbsteuerProzent: true } },
      },
    }),
  ]);
  if (!caseRow) notFound();

  const eingabe = baueEingabe(canonical, {
    applicantCount: Math.max(caseRow.applicants.length, 1),
    anzahlKinder: caseRow.applicants[0]?.anzahlKinder ?? 0,
    grunderwerbsteuerProzentOverride: caseRow.financingRequest?.grunderwerbsteuerProzent ?? null,
    bundeslandOverride: (caseRow.property?.bundesland as Bundesland | null) ?? null,
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/cases/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Fallakte
      </Link>

      <PageHeader
        eyebrow={caseRow.caseNumber}
        title="Machbarkeit"
        subtitle="Woran es scheitert – und welche kleinste Veränderung es ändern würde."
      />

      {!eingabe.ok ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">
              Für die Machbarkeitsrechnung fehlen noch Angaben.
            </p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {eingabe.fehlend.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Ohne diese Werte wird bewusst nicht gerechnet – ein Ergebnis aus geschätzten Nullen
              wäre schlimmer als keines.
            </p>
          </CardContent>
        </Card>
      ) : (
        <MachbarkeitErgebnis
          caseId={id}
          ergebnis={loese(
            eingabe.eingabe,
            await ladeAnnahmen(ctx.organizationId),
            eingabe.bundeslandUnsicher
          )}
        />
      )}
    </div>
  );
}
