import Link from "next/link";
import { Plus, FolderOpen, Search, X, FileText } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { normalizeSearchQuery, caseSearchOR, documentMatchWhere } from "@/lib/cases/search";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await requireContext();
  const { status, q: rawQ } = await searchParams;
  const statusFilter =
    status && status in CASE_STATUS_LABELS ? (status as CaseStatus) : undefined;
  const q = normalizeSearchQuery(rawQ);

  const cases = await prisma.case.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: statusFilter,
      ...(q ? { OR: caseSearchOR(q) } : {}),
    },
    include: {
      applicants: true,
      _count: { select: { documents: true } },
      // Bei aktiver Suche: die matchenden Dokumente mitliefern (Treffer-Kontext),
      // damit sichtbar ist, WARUM ein Fall gefunden wurde.
      ...(q
        ? {
            documents: {
              where: documentMatchWhere(q),
              select: { id: true, generatedName: true, originalName: true },
              take: 3,
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  const subtitle = `${cases.length} ${cases.length === 1 ? "Fall" : "Fälle"}${
    q ? ` · Suche: „${q}“` : ""
  }${statusFilter ? ` · Filter: ${CASE_STATUS_LABELS[statusFilter]}` : ""}`;

  // Query-String für „Filter/Suche zurücksetzen" und Formular-Erhalt.
  const statusHidden = statusFilter ? statusFilter : "";

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

      <form method="get" className="flex items-center gap-2">
        {statusHidden ? <input type="hidden" name="status" value={statusHidden} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Fall, Antragsteller oder Dokumentinhalt suchen (z. B. „Steuerbescheid 2023“)"
            className="pl-9"
            aria-label="Fälle durchsuchen"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Suchen
        </Button>
        {q ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={statusHidden ? `/cases?status=${statusHidden}` : "/cases"}>
              <X className="h-4 w-4" /> Zurücksetzen
            </Link>
          </Button>
        ) : null}
      </form>

      {cases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
              {q ? (
                <Search className="h-6 w-6 text-muted-foreground" />
              ) : (
                <FolderOpen className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            {q ? (
              <div>
                <p className="text-sm font-medium">Keine Treffer für „{q}“</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Es wurde in Fallnummern, Antragstellernamen und Dokumentinhalten gesucht. Versuchen Sie einen anderen Begriff.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium">Noch keine Fälle</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Legen Sie Ihren ersten Fall an – wir führen Sie durch
                  Unterlagen, Prüfung und Übergabe.
                </p>
              </div>
            )}
            {q ? (
              <Button asChild variant="outline" size="sm">
                <Link href={statusHidden ? `/cases?status=${statusHidden}` : "/cases"}>Suche zurücksetzen</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/cases/new">
                  <Plus />
                  Ersten Fall anlegen
                </Link>
              </Button>
            )}
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
                      <div>
                        {c.applicants
                          .map((a) =>
                            [a.vorname, a.nachname].filter(Boolean).join(" ")
                          )
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                      {"documents" in c && c.documents.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.documents.map((d) => (
                            <span
                              key={d.id}
                              className="inline-flex items-center gap-1 rounded bg-ai/10 px-1.5 py-0.5 text-[11px] text-ai"
                            >
                              <FileText className="h-3 w-3" />
                              {d.generatedName ?? d.originalName}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
