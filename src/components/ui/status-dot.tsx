import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/ui/tone";

export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {pulse && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", TONE[tone].dot)} />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", TONE[tone].dot)} />
    </span>
  );
}
