"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Trash2, ShieldAlert, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteCase, archiveCase, unarchiveCase } from "@/lib/actions/case-lifecycle";

/**
 * DSGVO-/Lebenszyklus-Aktionen: Archivieren (reversibel) und endgültiges Löschen
 * (Recht auf Vergessenwerden – mit ausdrücklicher Bestätigung, da irreversibel).
 */
export function DangerZone({
  caseId,
  caseNumber,
  archived,
}: {
  caseId: string;
  caseNumber: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onArchive() {
    startTransition(async () => {
      await (archived ? unarchiveCase(caseId) : archiveCase(caseId));
    });
  }

  function onDelete() {
    const confirmed = window.confirm(
      `Fall ${caseNumber} und ALLE zugehörigen Daten (Antragsteller, Dokumente, Nachrichten) endgültig löschen?\n\n` +
        `Diese Aktion kann nicht rückgängig gemacht werden.`
    );
    if (!confirmed) return;
    startTransition(async () => {
      await deleteCase(caseId);
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <ShieldAlert className="h-4 w-4" /> Datenschutz &amp; Löschung
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button asChild variant="outline" className="w-full justify-start">
          <a href={`/api/cases/${caseId}/dsgvo`}>
            <FileDown className="h-4 w-4" />
            DSGVO-Auskunft exportieren (JSON)
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={onArchive}
          disabled={pending}
        >
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {archived ? "Aus dem Archiv holen" : "Fall archivieren"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={pending}
        >
          <Trash2 className="h-4 w-4" />
          Fall endgültig löschen (DSGVO)
        </Button>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          Löschen entfernt den Fall unwiderruflich inklusive aller Dokumente. Die Löschung selbst wird im Audit-Log
          protokolliert.
        </p>
      </CardContent>
    </Card>
  );
}
