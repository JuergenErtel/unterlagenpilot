import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-Mail",
  whatsapp: "WhatsApp",
  pdf: "PDF-Checkliste",
  intern: "Interne Notiz",
};

export default async function MessagesOverviewPage() {
  const ctx = await requireContext();
  const messages = await prisma.generatedMessage.findMany({
    where: { case: { organizationId: ctx.organizationId } },
    include: { case: { include: { applicants: { orderBy: { position: "asc" } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kundenkommunikation"
        title="Nachrichten"
        subtitle="Zuletzt erzeugte Nachrichten (E-Mail, WhatsApp, PDF-Checkliste, interne Notizen). Erstellt wird je Fall – versendet wird nichts automatisch."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/cases">Zu den Fällen</Link>
          </Button>
        }
      />

      {messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">Noch keine Nachricht erzeugt.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Öffne einen Fall und erstelle eine Nachforderung oder PDF-Checkliste – sie taucht dann hier auf.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 p-3">
            {messages.map((m) => {
              const namen =
                m.case.applicants
                  .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
                  .filter(Boolean)
                  .join(", ") || "—";
              return (
                <Link
                  key={m.id}
                  href={`/cases/${m.caseId}/messages`}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.subject ?? m.templateType}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="font-mono tabular">{m.case.caseNumber}</span> · {namen}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{CHANNEL_LABEL[m.channel] ?? m.channel}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
