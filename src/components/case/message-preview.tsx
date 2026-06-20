import { Mail, MessageCircle, FileText, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyBlock } from "@/components/copy-block";
import type { MessageChannel } from "@/lib/domain/enums";

const CHANNEL = {
  email: { icon: Mail, label: "E-Mail", variant: "default" as const },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", variant: "success" as const },
  pdf: { icon: FileText, label: "PDF-Checkliste", variant: "ai" as const },
  intern: { icon: StickyNote, label: "Interne Notiz", variant: "neutral" as const },
};

/** Vorschau einer generierten Nachricht mit Kopierfunktion. */
export function MessagePreview({
  channel,
  subject,
  body,
  footer,
}: {
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  footer?: React.ReactNode;
}) {
  const c = CHANNEL[channel];
  const Icon = c.icon;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <Badge variant={c.variant}>{c.label}</Badge>
            {subject && <div className="mt-1 text-sm font-medium">{subject}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CopyBlock text={subject ? `Betreff: ${subject}\n\n${body}` : body} label="Text kopieren" />
        {footer && <div className="mt-3 flex flex-wrap gap-2">{footer}</div>}
      </CardContent>
    </Card>
  );
}
