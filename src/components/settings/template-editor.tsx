"use client";

import { useActionState } from "react";
import { Save, RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  saveMessageTemplate,
  resetMessageTemplate,
  type TemplateFormState,
} from "@/lib/actions/templates";
import type { MessageChannel, MessageTemplateType } from "@/lib/domain/enums";

export function TemplateEditor({
  type,
  channel,
  label,
  subject,
  body,
  isCustom,
  hasSubject,
}: {
  type: MessageTemplateType;
  channel: MessageChannel;
  label: string;
  subject: string;
  body: string;
  isCustom: boolean;
  hasSubject: boolean;
}) {
  const action = saveMessageTemplate.bind(null, type, channel);
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {});

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{label}</h3>
          {isCustom ? <Badge variant="ai">angepasst</Badge> : <Badge variant="neutral">Standard</Badge>}
        </div>
        {isCustom ? (
          <form action={resetMessageTemplate.bind(null, type, channel)}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Auf Standard zurücksetzen
            </Button>
          </form>
        ) : null}
      </div>

      <form action={formAction} className="space-y-3">
        {hasSubject ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Betreff</label>
            <Input name="subject" defaultValue={subject} />
          </div>
        ) : null}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Text</label>
          <textarea
            name="body"
            defaultValue={body}
            rows={10}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            <Save className="h-4 w-4" /> {pending ? "Speichern …" : "Speichern"}
          </Button>
          {state.ok ? (
            <span className="flex items-center gap-1 text-xs text-success-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Gespeichert
            </span>
          ) : null}
          {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        </div>
      </form>
    </div>
  );
}
