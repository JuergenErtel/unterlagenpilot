"use client";

import { useState, useTransition } from "react";
import { Mail, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessageByEmail } from "@/lib/actions/messages";

/**
 * Versendet eine E-Mail-Nachricht per Resend (nach Bestätigung, da outward-facing).
 * Fällt auf einen mailto:-Link zurück, wenn kein Versand eingerichtet ist oder
 * der Vermittler lieber sein eigenes Mailprogramm nutzt.
 */
export function SendEmailButton({
  messageId,
  to,
  configured,
  subject,
  body,
  alreadySent,
}: {
  messageId: string;
  to: string | null;
  configured: boolean;
  subject: string | null;
  body: string;
  alreadySent: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sent = alreadySent || result?.ok;

  const mailtoHref = `mailto:${to ?? ""}?subject=${encodeURIComponent(subject ?? "")}&body=${encodeURIComponent(body)}`;

  function send() {
    if (!to) return;
    if (!window.confirm(`Diese Nachricht jetzt per E-Mail an ${to} senden?`)) return;
    startTransition(async () => {
      const res = await sendMessageByEmail(messageId);
      setResult({ ok: res.ok, message: res.ok ? `Gesendet an ${res.to}` : res.error ?? "Versand fehlgeschlagen." });
    });
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success-foreground">
        <Check className="h-3.5 w-3.5" /> {result?.message ?? "Versendet"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {configured && to ? (
        <Button type="button" size="sm" onClick={send} disabled={pending}>
          <Mail className="h-4 w-4" />
          {pending ? "Sende …" : "Per E-Mail senden"}
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline" title={!to ? "Keine E-Mail hinterlegt" : "Versand nicht eingerichtet – im Mailprogramm öffnen"}>
          <a href={mailtoHref}>
            <ExternalLink className="h-4 w-4" /> Im Mailprogramm öffnen
          </a>
        </Button>
      )}
      {result && !result.ok ? (
        <span className="text-xs text-destructive" role="alert">
          {result.message}
        </span>
      ) : null}
    </div>
  );
}
