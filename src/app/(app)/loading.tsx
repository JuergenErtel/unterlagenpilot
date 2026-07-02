import { Loader2 } from "lucide-react";

/** Ladeanzeige für alle App-Seiten (greift bei langsamen Server-Renders). */
export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-ai" />
      <p className="text-sm">Wird geladen …</p>
    </div>
  );
}
