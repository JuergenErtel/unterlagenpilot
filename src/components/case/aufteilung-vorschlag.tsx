import { Scissors } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { aufteilenAction, aufteilungVerwerfenAction } from "@/lib/actions/aufteilung";

export interface SegmentView {
  vonSeite: number;
  bisSeite: number;
  titel: string;
}

/**
 * Vorschlag, eine Sammeldatei aufzutrennen.
 *
 * Die vollstaendige Segmentliste steht VOR dem Klick da – wer acht Dokumente
 * erzeugt, will vorher sehen, welche.
 */
export function AufteilungVorschlag({
  caseId,
  documentId,
  segmente,
}: {
  caseId: string;
  documentId: string;
  segmente: SegmentView[];
}) {
  if (segmente.length < 2) return null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/[0.05] p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Scissors className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        Enthält vermutlich {segmente.length} Dokumente
      </p>
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {segmente.map((s) => (
          <li key={`${s.vonSeite}-${s.bisSeite}`}>
            Seiten {s.vonSeite}
            {s.bisSeite > s.vonSeite ? `–${s.bisSeite}` : ""}: {s.titel}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <form action={aufteilenAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton size="sm">Auftrennen</SubmitButton>
        </form>
        <form action={aufteilungVerwerfenAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton size="sm" variant="ghost">
            Verwerfen
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
