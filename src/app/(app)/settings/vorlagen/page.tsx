import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/settings/template-editor";
import { EDITABLE_TEMPLATES, DEFAULT_TEMPLATES, templateKey, PLACEHOLDERS } from "@/lib/messages/render";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage() {
  const ctx = await requireContext();

  const overrides = await prisma.messageTemplate.findMany({
    where: { organizationId: ctx.organizationId },
    select: { type: true, channel: true, subject: true, body: true },
  });
  const overrideMap = new Map(overrides.map((o) => [`${o.type}:${o.channel}`, o]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Konfiguration"
        title="Nachrichten-Vorlagen"
        subtitle="Passen Sie Betreff und Text der Kundennachrichten an. Platzhalter werden beim Erzeugen automatisch gefüllt."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <ArrowLeft /> Zu Einstellungen
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1.5 p-4 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Verfügbare Platzhalter:
          </div>
          {PLACEHOLDERS.map((p) => (
            <div key={p.token} className="flex items-center gap-1.5">
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{p.token}</code>
              <span className="text-muted-foreground">{p.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {EDITABLE_TEMPLATES.map(({ type, channel, label }) => {
          const key = templateKey(type, channel);
          const def = DEFAULT_TEMPLATES[key]!;
          const override = overrideMap.get(key);
          return (
            <TemplateEditor
              key={key}
              type={type}
              channel={channel}
              label={label}
              subject={override?.subject ?? def.subject ?? ""}
              body={override?.body ?? def.body}
              isCustom={Boolean(override)}
              hasSubject={def.subject !== undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
