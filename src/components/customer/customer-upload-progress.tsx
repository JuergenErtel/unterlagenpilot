import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kundenseitiger Fortschritt: "X von Y Unterlagen erledigt" – freundlich, mobil. */
export function CustomerUploadProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={cn("h-5 w-5", done === total && total > 0 ? "text-success" : "text-ai")} />
          <span className="text-sm font-medium">
            {done} von {total} Unterlagen erledigt
          </span>
        </div>
        <span className="font-mono text-sm font-semibold tabular text-foreground">{pct}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", done === total && total > 0 ? "bg-success" : "bg-ai")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {done === total && total > 0
          ? "Geschafft – vielen Dank! Ihr Berater prüft die Unterlagen nun."
          : "Laden Sie die noch offenen Unterlagen hoch. Sie können das jederzeit fortsetzen."}
      </p>
    </div>
  );
}
