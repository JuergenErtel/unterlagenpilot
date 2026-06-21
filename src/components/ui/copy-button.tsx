"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kleiner, wiederverwendbarer Copy-to-Clipboard-Button mit Feedback. */
export function CopyButton({
  value,
  label,
  className,
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "icon";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={label ?? "Kopieren"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border text-xs transition-colors hover:bg-muted",
        size === "icon" ? "h-7 w-7 justify-center" : "px-2 py-1",
        className
      )}
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {size === "sm" && label ? <span>{copied ? "Kopiert" : label}</span> : null}
    </button>
  );
}
