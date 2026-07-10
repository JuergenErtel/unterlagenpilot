"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, ArchiveRestore, Trash2, ShieldAlert, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteCase, archiveCase, unarchiveCase } from "@/lib/actions/case-lifecycle";

/**
 * DSGVO-/Lebenszyklus-Aktionen: Archivieren (reversibel) und endgültiges Löschen
 * (Recht auf Vergessenwerden – irreversibel).
 *
 * Für das Löschen bewusst KEIN `window.confirm`: dort genügt ein hastiges Enter,
 * um einen Fall samt aller Dokumente unwiderruflich zu vernichten. Stattdessen
 * muss die Fallnummer abgetippt werden.
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
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const confirmed = confirmText.trim() === caseNumber;

  function onArchive() {
    startTransition(async () => {
      await (archived ? unarchiveCase(caseId) : archiveCase(caseId));
    });
  }

  function onDelete() {
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

        <Dialog.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmText("");
          }}
        >
          <Dialog.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
              Fall endgültig löschen (DSGVO)
            </Button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Fall unwiderruflich löschen
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                Fall <span className="font-mono">{caseNumber}</span> wird mit allen Antragstellern,
                Dokumenten und Nachrichten endgültig gelöscht. Das lässt sich nicht rückgängig machen.
              </Dialog.Description>

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="confirm-case-number">
                  Zum Bestätigen <span className="font-mono">{caseNumber}</span> eintippen
                </Label>
                <Input
                  id="confirm-case-number"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={caseNumber}
                  autoComplete="off"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Abbrechen
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onDelete}
                  disabled={!confirmed || pending}
                >
                  {pending ? "Wird gelöscht …" : "Endgültig löschen"}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          Löschen entfernt den Fall unwiderruflich inklusive aller Dokumente. Die Löschung selbst wird im Audit-Log
          protokolliert.
        </p>
      </CardContent>
    </Card>
  );
}
