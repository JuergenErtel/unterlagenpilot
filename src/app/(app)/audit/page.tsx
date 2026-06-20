import { ScrollText, ShieldAlert } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

function shorten(value: string | null | undefined, max = 10): string {
  if (!value) return "–";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function compactMetadata(meta: unknown): string {
  if (meta == null) return "–";
  try {
    const json = JSON.stringify(meta);
    return json.length > 120 ? `${json.slice(0, 120)}…` : json;
  } catch {
    return "–";
  }
}

export default async function AuditPage() {
  const ctx = await requireContext();

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit-Log</h1>
        <p className="text-sm text-muted-foreground">
          Die letzten {logs.length} Ereignisse für {ctx.organizationName}.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p>
            Es werden nur Metadaten bzw. Diff-Keys gespeichert – keine sensiblen
            Klartexte. Protokolliert werden Zugriffe, Änderungen, KI-Auswertungen,
            Exporte und Freigaben.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
            Ereignisse
          </CardTitle>
          <CardDescription>
            Chronologische Aufzeichnung (neueste zuerst).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Entität</TableHead>
                <TableHead>Entitäts-ID</TableHead>
                <TableHead>Nutzer</TableHead>
                <TableHead>Metadaten</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.entityType}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{shorten(log.entityId)}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.user?.name ?? "System"}
                  </TableCell>
                  <TableCell>
                    <code className="block max-w-[24rem] truncate rounded bg-muted px-1.5 py-0.5 text-xs">
                      {compactMetadata(log.metadata)}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Noch keine Audit-Einträge vorhanden.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
