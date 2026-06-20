import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaseStatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import {
  CASE_STATUS_LABELS,
  type CaseStatus,
  FINANCING_TYPES,
} from "@/lib/domain/enums";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireContext();
  const { status } = await searchParams;
  const statusFilter =
    status && status in CASE_STATUS_LABELS ? (status as CaseStatus) : undefined;

  const cases = await prisma.case.findMany({
    where: { organizationId: ctx.organizationId, status: statusFilter },
    include: { applicants: true, _count: { select: { documents: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fälle</h1>
          <p className="text-sm text-muted-foreground">
            {cases.length} Fall/Fälle{statusFilter ? ` · Filter: ${CASE_STATUS_LABELS[statusFilter]}` : ""}
          </p>
        </div>
        <Button asChild size="sm"><Link href="/cases/new"><Plus />Neuer Fall</Link></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fallnummer</TableHead>
                <TableHead>Antragsteller</TableHead>
                <TableHead>Finanzierung</TableHead>
                <TableHead>Dok.</TableHead>
                <TableHead className="w-48">Einreichungsstatus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktualisiert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Keine Fälle vorhanden. <Link href="/cases/new" className="text-primary underline">Ersten Fall anlegen</Link>.
                  </TableCell>
                </TableRow>
              )}
              {cases.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/cases/${c.id}`} className="hover:underline">{c.caseNumber}</Link>
                  </TableCell>
                  <TableCell>
                    {c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.financingType
                      ? FINANCING_TYPES.includes(c.financingType) ? c.financingType : "—"
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{c._count.documents}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={c.readinessScore} className="h-2 w-24" />
                      <span className="text-xs tabular-nums text-muted-foreground">{c.readinessScore}%</span>
                    </div>
                  </TableCell>
                  <TableCell><CaseStatusBadge status={c.status as CaseStatus} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(c.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
