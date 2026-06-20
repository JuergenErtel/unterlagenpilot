import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function MessagesOverviewPage() {
  const ctx = await requireContext();
  const messages = await prisma.generatedMessage.findMany({
    where: { case: { organizationId: ctx.organizationId } },
    include: { case: { include: { applicants: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nachrichten</h1>
        <p className="text-sm text-muted-foreground">
          Zuletzt erzeugte Nachrichten (E-Mail, WhatsApp, PDF-Checkliste, interne Notizen). Erstellung erfolgt je Fall.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Letzte Nachrichten</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Nachrichten. Öffne einen Fall und erzeuge eine Nachforderung.</p>
          )}
          {messages.map((m) => (
            <Link
              key={m.id}
              href={`/cases/${m.caseId}/messages`}
              className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent/40"
            >
              <div>
                <div className="text-sm font-medium">{m.subject ?? m.templateType}</div>
                <div className="text-xs text-muted-foreground">
                  {m.case.caseNumber} · {m.case.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{m.channel}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Button asChild variant="outline" size="sm"><Link href="/cases">Zu den Fällen</Link></Button>
    </div>
  );
}
