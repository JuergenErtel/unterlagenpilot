"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshFromFinLink, type FinLinkRefreshState } from "@/lib/actions/finlink";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * „Aus FinLink aktualisieren“ in der Aktionen-Sidebar der Fallseite.
 * Füllt nur leere Felder nach – das Ergebnis wird direkt unter dem Button
 * gemeldet, damit klar ist, was passiert ist (oder dass alles aktuell war).
 */
export function FinLinkRefreshButton({ caseId }: { caseId: string }) {
  const [state, action] = useActionState<FinLinkRefreshState, FormData>(
    refreshFromFinLink.bind(null, caseId),
    {}
  );
  return (
    <form action={action} className="space-y-1.5">
      <SubmitButton variant="outline" className="w-full justify-start" pendingLabel="Hole Daten aus FinLink …">
        <RefreshCw />Aus FinLink aktualisieren
      </SubmitButton>
      {state.success && <p className="text-xs text-success">{state.success}</p>}
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
