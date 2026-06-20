import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { generateMessage } from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyBlock } from "@/components/copy-block";
import { formatDateTime } from "@/lib/utils";
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
  await requireContext();
  const messages = await prisma.generatedMessage.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nachrichten</h1>
          <p className="text-sm text-muted-foreground">Vorformuliert – im MVP wird nichts automatisch versendet.</p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href={`/cases/${id}`}>Zur Fallakte</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Neue Nachricht erzeugen</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <form key={`${a.type}-${a.channel}`} action={generateMessage.bind(null, id, a.type, a.channel)}>
              <Button size="sm" variant="outline" type="submit">{a.label}</Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.length === 0 && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Noch keine Nachrichten erzeugt.</CardContent></Card>
        )}
        {messages.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{m.subject ?? m.templateType}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{m.channel}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <CopyBlock text={m.subject ? `Betreff: ${m.subject}\n\n${m.body}` : m.body} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
