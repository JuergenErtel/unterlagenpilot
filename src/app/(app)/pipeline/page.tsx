import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { buildPipeline, type PipelineCaseInput } from "@/lib/cases/pipeline";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge } from "@/components/status-badge";
import { BadgeEuro, TrendingUp } from "lucide-react";
import { type CaseStatus } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

function eur(n: number | null): string {
  return n == null ? "—" : `${Math.round(n).toLocaleString("de-DE")} €`;
}
function dateStr(d: Date | null): string {
  return d ? d.toLocaleDateString("de-DE") : "—";
}

export default async function PipelinePage() {
  const ctx = await requireContext();

  // Fälle, die schon bepreist sind (Darlehensbetrag ODER Courtage gesetzt) bzw. abgeschlossen.
  const rows = await prisma.case.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: { not: "archiviert" },
      OR: [{ darlehensbetrag: { not: null } }, { courtageProzent: { not: null } }, { status: "abgeschlossen" }],
    },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      abschlussBank: true,
      bankName: true,
      darlehensbetrag: true,
      courtageProzent: true,
      abschlussdatum: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const input: PipelineCaseInput[] = rows.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    kundenName:
      c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
      "Ohne Namen",
    status: c.status,
    abschlussBank: c.abschlussBank ?? c.bankName,
    darlehensbetrag: c.darlehensbetrag,
    courtageProzent: c.courtageProzent,
    abschlussdatum: c.abschlussdatum,
  }));
  const pipeline = buildPipeline(input);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Geschäft"
        title="Abschlüsse & Provision"
        subtitle="Erwartete und erzielte Courtage. Abschlussdaten je Fall unter „Verwaltung“."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Abgeschlossen" value={pipeline.abgeschlossen.length} icon={BadgeEuro} />
        <MetricCard label="Courtage abgeschlossen" value={eur(pipeline.courtageAbgeschlossen)} tone="ready" icon={BadgeEuro} />
        <MetricCard label="In Pipeline" value={pipeline.offen.length} icon={TrendingUp} />
        <MetricCard label="Courtage Pipeline (erwartet)" value={eur(pipeline.couragePipeline)} tone="ai" icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fälle</CardTitle></CardHeader>
        <CardContent>
          {input.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Abschlussdaten erfasst. Trage sie im jeweiligen Fall unter „Verwaltung" ein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fall</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">Darlehen</TableHead>
                  <TableHead className="text-right">Courtage %</TableHead>
                  <TableHead className="text-right">Courtage €</TableHead>
                  <TableHead>Abschluss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pipeline.abgeschlossen, ...pipeline.offen].map((c) => (
                  <TableRow key={c.caseId}>
                    <TableCell>
                      <Link href={`/cases/${c.caseId}/verwaltung`} className="font-medium hover:underline">
                        {c.kundenName}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{c.caseNumber}</div>
                    </TableCell>
                    <TableCell><CaseStatusBadge status={c.status as CaseStatus} /></TableCell>
                    <TableCell>{c.abschlussBank ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(c.darlehensbetrag)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.courtageProzent != null ? `${c.courtageProzent} %` : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(c.courtage)}</TableCell>
                    <TableCell>{dateStr(c.abschlussdatum)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
