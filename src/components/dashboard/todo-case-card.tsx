import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaseStatusBadge } from "@/components/status-badge";
import { PLATFORM_LABELS, type CaseStatus, type Platform } from "@/lib/domain/enums";

export interface TodoCase {
  caseId: string;
  caseNumber: string;
  name: string;
  status: CaseStatus;
  readiness: number;
  nextStep: string;
  blockers: Platform[];
  buttonLabel: string;
  buttonHref: string;
}

export function TodoCaseCard({ item }: { item: TodoCase }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 card-elevated transition-shadow hover:shadow-lift sm:flex-row sm:items-center">
      {/*
        Reifegrad. Bewusst NICHT in Ampelfarben: 30 % erledigt ist kein Fehler,
        sondern ein fruehes Stadium. Den Zustand sagt das Statuszeichen daneben,
        der Balken sagt nur, wie weit. Deshalb Tinte.
      */}
      <div className="flex items-center gap-3 sm:w-40 sm:flex-col sm:items-start">
        <p className="display tabular text-[2rem] leading-none">
          {item.readiness}
          <span className="text-base text-muted-foreground">%</span>
        </p>
        <div className="h-1.5 w-full max-w-[8rem] overflow-hidden rounded-[2px] bg-muted">
          <div className="h-full rounded-[2px] bg-foreground/75" style={{ width: `${item.readiness}%` }} />
        </div>
      </div>

      {/* Inhalt */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/cases/${item.caseId}`} className="font-medium hover:underline">{item.name}</Link>
          <span className="font-mono text-xs text-muted-foreground">{item.caseNumber}</span>
          <CaseStatusBadge status={item.status} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Nächster Schritt:</span> {item.nextStep}
        </p>
        {item.blockers.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Blocker:</span>
            {item.blockers.map((p) => (
              <Badge key={p} variant="destructive">{PLATFORM_LABELS[p]}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Aktion */}
      <Button asChild className="shrink-0">
        <Link href={item.buttonHref}>{item.buttonLabel}<ArrowRight /></Link>
      </Button>
    </div>
  );
}
