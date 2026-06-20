import { ShieldCheck, ScrollText, ArrowRight } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
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
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";

type Meta = Record<string, unknown>;

function asMeta(value: unknown): Meta {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Meta)
    : {};
}

function str(meta: Meta, key: string): string | undefined {
  const v = meta[key];
  if (v == null) return undefined;
  return String(v);
}

/** Übersetzt eine Audit-Aktion in einen menschlich lesbaren Satz. */
function describeEvent(action: string, raw: unknown): string {
  const m = asMeta(raw);
  switch (action) {
    case "field.corrected": {
      const field = str(m, "field") ?? "Ein Feld";
      const before = str(m, "before") ?? "—";
      const after = str(m, "after") ?? "—";
      return `${field} von ${before} auf ${after} korrigiert`;
    }
    case "document.reviewed":
      return `${str(m, "document") ?? "Dokument"} ${str(m, "reviewStatus") ?? "geprüft"}`;
    case "platform.released": {
      const platform = str(m, "platform") as Platform | undefined;
      const label = platform ? PLATFORM_LABELS[platform] ?? "" : "";
      return `${label}-Export freigegeben`.trim();
    }
    case "platform.pushed": {
      const platform = str(m, "platform") as Platform | undefined;
      const label = platform ? PLATFORM_LABELS[platform] ?? "" : "";
      return `An ${label || "Plattform"} übertragen`;
    }
    case "message.generated":
      return `Nachforderung per ${str(m, "channel") ?? "Nachricht"} vorbereitet`;
    case "ai.evaluated":
      return `KI hat ${str(m, "documents") ?? "mehrere"} Dokument(e) ausgewertet`;
    case "upload_link.created":
      return "Upload-Link erstellt";
    case "document.uploaded":
      return `Dokument hochgeladen (${str(m, "document") ?? str(m, "source") ?? "Upload"})`;
    case "document.classified":
      return `Dokument klassifiziert (${str(m, "document") ?? "Upload"})`;
    case "document.deleted":
      return "Dokument gelöscht";
    case "case.created":
      return "Fall angelegt";
    case "case.updated":
      return "Falldaten aktualisiert";
    case "case.status_changed":
      return `Status geändert${str(m, "to") ? ` zu ${str(m, "to")}` : ""}`;
    case "export.prepared":
      return "Export vorbereitet";
    case "customer.data_exported":
      return "Kundendaten exportiert (DSGVO-Auskunft)";
    case "customer.deleted":
      return "Kundendaten gelöscht";
    case "access.viewed":
      return "Vorgang angesehen";
    default:
      return action;
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
      <PageHeader
        eyebrow="Nachvollziehbarkeit"
        title="Audit-Log"
        subtitle="Wer, was, wann – inkl. KI/Mensch. Es werden nur Metadaten gespeichert, keine sensiblen Klartexte."
      />

      <Card className="border-success/30 bg-success/5">
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p>
            Jede Änderung, KI-Auswertung, Freigabe und jeder Export wird
            nachvollziehbar protokolliert. Sensible Klartexte (z. B. IBAN oder
            Ausweisnummern) werden dabei nie gespeichert.
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
            Die letzten {logs.length} Ereignisse, neueste zuerst.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">Noch keine Aktivitäten</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sobald Sie Fälle bearbeiten, Unterlagen prüfen oder freigeben,
                erscheint hier die lückenlose Historie.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Wann</TableHead>
                  <TableHead className="w-40">Akteur</TableHead>
                  <TableHead>Ereignis</TableHead>
                  <TableHead className="w-24 text-right">Quelle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const meta = asMeta(log.metadata);
                  const isAi = meta.actor === "KI";
                  const before = str(meta, "before");
                  const after = str(meta, "after");
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap font-mono tabular text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        {isAi ? (
                          <Badge variant="ai">KI</Badge>
                        ) : (
                          <span className="text-sm">
                            {log.user?.name ?? "System"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {describeEvent(log.action, log.metadata)}
                        </div>
                        {before != null && after != null && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono tabular">{before}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-mono tabular text-foreground">
                              {after}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAi ? (
                          <Badge variant="ai">KI</Badge>
                        ) : (
                          <Badge variant="neutral">Mensch</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
