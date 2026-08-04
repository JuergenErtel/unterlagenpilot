import { Loader2 } from "lucide-react";

/** Der erste Abruf der FinLink-Lead-Liste kann ~10–15 s dauern (danach Cache). */
export default function ImportLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-ai" />
      <p className="text-sm">Leads werden aus FinLink geladen …</p>
      <p className="text-xs">Beim ersten Aufruf kann das einen Moment dauern.</p>
    </div>
  );
}
