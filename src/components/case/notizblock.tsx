"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, NotebookPen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { setCaseNotes, type NotizenFormState } from "@/lib/actions/case-management";

/**
 * Freier Notizblock in der Fallakte – der Schmierzettel am Fall.
 *
 * Der Text wird bewusst im Client gehalten (statt nur `defaultValue`), damit
 * sichtbar ist, ob das Getippte schon in der Datenbank steht. Ein Notizblock,
 * der stumm aussieht wie gespeichert, ist schlimmer als keiner: Man verlaesst
 * sich darauf und der Fall verliert genau die Information, die nirgends sonst
 * steht.
 */
export function Notizblock({ caseId, notes }: { caseId: string; notes: string }) {
  const [state, formAction, pending] = useActionState<NotizenFormState, FormData>(
    setCaseNotes.bind(null, caseId),
    {},
  );
  const [text, setText] = useState(notes);

  // Gespeichert heisst: was im Feld steht, entspricht dem Stand vom Server.
  // Nach dem Speichern liefert die Server-Action den getrimmten Text zurueck,
  // `notes` aendert sich, und der Vergleich wird von selbst wieder wahr.
  const ungespeichert = text.trim() !== notes;

  // Fenster schliessen / neu laden mit ungespeichertem Text: Der Browser fragt
  // nach. Fuer Navigation innerhalb der App greift das nicht – dagegen steht
  // der sichtbare Hinweis unten.
  useEffect(() => {
    if (!ungespeichert) return;
    const warnen = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [ungespeichert]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="h-4 w-4" /> Notizen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-2">
          <Textarea
            name="notes"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Freie Notizen zum Fall – was man sonst auf einen Zettel schreibt."
            aria-label="Freie Notizen zum Fall"
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="submit" size="sm" disabled={pending || !ungespeichert}>
              <Save className="h-4 w-4" /> {pending ? "Speichern …" : "Speichern"}
            </Button>
            {state.error ? (
              <span className="text-xs text-destructive">{state.error}</span>
            ) : ungespeichert ? (
              <span className="text-xs text-muted-foreground">Nicht gespeichert</span>
            ) : state.ok ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Gespeichert
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
