import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { generateMessage } from "@/lib/actions/cases";
import { isEmailConfigured } from "@/lib/email/resend";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessagePreview } from "@/components/case/message-preview";
import { SendEmailButton } from "@/components/case/send-email-button";
import type { MessageChannel, MessageTemplateType } from "@/lib/domain/enums";

const ACTIONS: Array<{ type: MessageTemplateType; channel: MessageChannel; label: string }> = [
  { type: "erstnachforderung", channel: "email", label: "Erstnachforderung (E-Mail)" },
  { type: "erstnachforderung", channel: "whatsapp", label: "Nachforderung (WhatsApp)" },
  { type: "pdf_checkliste", channel: "pdf", label: "PDF-Checkliste" },
  { type: "danke_erhalten", channel: "email", label: "Danke, erhalten" },
  { type: "datei_nicht_lesbar", channel: "email", label: "Datei nicht lesbar" },
  { type: "datei_veraltet", channel: "email", label: "Datei veraltet" },
  { type: "unterlage_fehlt_weiterhin", channel: "email", label: "Erinnerung" },
  { type: "interne_notiz", channel: "intern", label: "Interne Notiz" },
];

export default async function CaseMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const caseRecord = await prisma.case.findFirstOrThrow({
    where: { id, organizationId: ctx.organizationId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });
  const messages = await prisma.generatedMessage.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
  });

  const kundenName =
    caseRecord.applicants
      .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ") || "—";

  const recipientEmail =
    caseRecord.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null;
  const emailConfigured = isEmailConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kundenkommunikation"
        title="Nachrichten"
        subtitle={
          emailConfigured
            ? "Vorformuliert. E-Mails können nach Bestätigung direkt versendet werden – automatisch passiert nichts."
            : "Vorformuliert zum Kopieren. Für Direktversand E-Mail (Resend) konfigurieren."
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nachricht erzeugen</CardTitle>
          <CardDescription>
            Fall <span className="font-mono tabular">{caseRecord.caseNumber}</span> · {kundenName}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <form key={`${a.type}-${a.channel}`} action={generateMessage.bind(null, id, a.type, a.channel)}>
              <Button size="sm" variant="outline" type="submit">
                {a.label}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">Noch keine Nachricht erstellt.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Wähle oben eine Vorlage – die fertige Nachricht erscheint hier zum Kopieren. Versendet wird nichts automatisch.
              </p>
            </CardContent>
          </Card>
        ) : (
          messages.map((m) => (
            <MessagePreview
              key={m.id}
              channel={m.channel as MessageChannel}
              subject={m.subject}
              body={m.body}
              footer={
                <>
                  {m.channel === "email" ? (
                    <SendEmailButton
                      messageId={m.id}
                      to={recipientEmail}
                      configured={emailConfigured}
                      subject={m.subject}
                      body={m.body}
                      alreadySent={m.sent}
                    />
                  ) : null}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/cases/${id}`}>Zurück zum Fall</Link>
                  </Button>
                </>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
