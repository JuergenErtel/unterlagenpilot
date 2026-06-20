import Link from "next/link";
import { Plus, FolderOpen } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
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
import { CASE_STATUS_LABELS, type CaseStatus } from "@/lib/domain/enums";

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

  const subtitle = `${cases.length} ${cases.length === 1 ? "Fall" : "Fälle"}${
    statusFilter ? ` · Filter: ${CASE_STATUS_LABELS[statusFilter]}` : ""
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fälle"
        subtitle={subtitle}
        actions={
          <Button asChild size="sm">
            <Link href="/cases/new">
              <Plus />
              Neuer Fall
            </Link>
          </Button>
        }
      />

      {cases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
              <FolderOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Noch keine Fälle</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Legen Sie Ihren ersten Fall an – wir führen Sie durch
                Unterlagen, Prüfung und Übergabe.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/cases/new">
                <Plus />
                Ersten Fall anlegen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fallnummer</TableHead>
                  <TableHead>Antragsteller</TableHead>
                  <TableHead className="w-16 text-right">Dok.</TableHead>
                  <TableHead className="w-52">Einreichungsstatus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktualisiert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono tabular text-sm font-medium">
                      <Link href={`/cases/${c.id}`} className="hover:underline">
                        {c.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.applicants
                        .map((a) =>
                          [a.vorname, a.nachname].filter(Boolean).join(" ")
                        )
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-sm">
                      {c._count.documents}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={c.readinessScore} className="h-2 w-24" />
                        <span className="font-mono tabular text-xs text-muted-foreground">
                          {c.readinessScore}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CaseStatusBadge status={c.status as CaseStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
