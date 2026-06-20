"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Kopierbarer Textblock (für Kopiermasken, Nachrichten, Plattform-Felder). */
export function CopyBlock({
  text,
  label = "Kopieren",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={className}>
      <div className="mb-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* Clipboard nicht verfügbar */
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Kopiert" : label}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">{text}</pre>
    </div>
  );
}
