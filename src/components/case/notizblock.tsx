"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarPlus, CheckCircle2, NotebookPen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { setCaseNotes, type NotizenFormState } from "@/lib/actions/case-management";

/**
 * Das heutige Datum als Zeilenkopf fuer einen neuen Eintrag.
 *
 * Wird AUSSCHLIESSLICH in Ereignisbehandlern aufgerufen, nie beim Rendern:
 * Ein `new Date()` im Rumpf einer Komponente liefert auf Server und Client
 * verschiedene Werte und erzeugt genau die Hydration-Meldungen, die uns auf
 * dem Dashboard schon beschaeftigen.
 */
function heuteAlsKopf(): string {
  return `${new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} – `;
}

/**
 * Freier Notizblock in der Fallakte – der Schmierzettel am Fall.
 *
 * Der Text wird bewusst im Client gehalten (statt nur `defaultValue`), damit
 * sichtbar ist, ob das Getippte schon in der Datenbank steht. Ein Notizblock,
 * der stumm aussieht wie gespeichert, ist schlimmer als keiner: Man verlaesst
 * sich darauf und der Fall verliert genau die Information, die nirgends sonst
 * steht.
 *
 * Jeder Eintrag bekommt sein Datum vorangestellt – der erste von selbst,
 * jeder weitere ueber "Neuer Eintrag". Bewusst als ganz normaler Text und
 * nicht als Datenfeld: Ein Schmierzettel, dessen Zeilen sich nicht mehr
 * loeschen oder umschreiben lassen, ist keiner mehr.
 */
export function Notizblock({ caseId, notes }: { caseId: string; notes: string }) {
  const [state, formAction, pending] = useActionState<NotizenFormState, FormData>(
    setCaseNotes.bind(null, caseId),
    {},
  );
  const [text, setText] = useState(notes);
  const feld = useRef<HTMLTextAreaElement>(null);

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

  /** Der allererste Tastendruck auf einem leeren Block setzt das Datum davor. */
  function tippen(neu: string) {
    setText(text.length === 0 && neu.length > 0 ? heuteAlsKopf() + neu : neu);
  }

  /** Haengt eine neue, datierte Zeile an und setzt den Schreibpunkt dahinter. */
  function neuerEintrag() {
    const kopf = heuteAlsKopf();
    const naechster = text.length === 0 ? kopf : `${text.replace(/\s+$/, "")}\n\n${kopf}`;
    setText(naechster);
    // Nach dem Rendern ans Ende springen – sonst stuende der Cursor dort, wo
    // er vor dem Klick war, und der Vermittler schriebe mitten in den alten
    // Eintrag hinein.
    requestAnimationFrame(() => {
      const el = feld.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(naechster.length, naechster.length);
      el.scrollTop = el.scrollHeight;
    });
  }

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
            ref={feld}
            name="notes"
            value={text}
            onChange={(e) => tippen(e.target.value)}
            rows={6}
            placeholder="Freie Notizen zum Fall – was man sonst auf einen Zettel schreibt."
            aria-label="Freie Notizen zum Fall"
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="submit" size="sm" disabled={pending || !ungespeichert}>
              <Save className="h-4 w-4" /> {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={neuerEintrag}>
              <CalendarPlus className="h-4 w-4" /> Neuer Eintrag
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
