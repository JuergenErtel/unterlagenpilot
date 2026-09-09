"use client";

import { useState, useTransition } from "react";
import { FileText, Image as BildIcon, Loader2, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordneEingangZuAction, verwirfEingangAction } from "@/lib/actions/eingang";

export interface EingangAnzeige {
  id: string;
  originalName: string;
  mimeType: string;
  /** Fertig formatiert – der Server rechnet Groesse und Zeitzone, nicht der Browser. */
  groesse: string;
  angekommen: string;
  von: string | null;
}

export interface FallAuswahl {
  id: string;
  bezeichnung: string;
}

/**
 * Die wartenden Dateien, je Zeile eine Entscheidung: zu welchem Fall – oder weg.
 *
 * Bewusst kein Sammelvorgang mit Haekchen: Es ist genau EINE Frage je Datei,
 * und die Antwort ist bei jeder eine andere. Ein Auswahlmodus wuerde nur einen
 * zweiten Klick vor dieselbe Entscheidung setzen.
 */
export function PosteingangListe({
  dateien,
  faelle,
}: {
  dateien: EingangAnzeige[];
  faelle: FallAuswahl[];
}) {
  return (
    <div className="space-y-2">
      {dateien.map((d) => (
        <Zeile key={d.id} datei={d} faelle={faelle} />
      ))}
    </div>
  );
}

function Zeile({ datei, faelle }: { datei: EingangAnzeige; faelle: FallAuswahl[] }) {
  const [caseId, setCaseId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const istBild = datei.mimeType.startsWith("image/");

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {istBild ? (
          <BildIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{datei.originalName}</div>
          <div className="text-xs text-muted-foreground">
            {datei.groesse} · {datei.angekommen}
            {datei.von ? ` · von ${datei.von}` : ""}
          </div>
        </div>

        <label className="sr-only" htmlFor={`fall-${datei.id}`}>
          Fall für {datei.originalName}
        </label>
        <select
          id={`fall-${datei.id}`}
          className="feld h-9 w-full sm:w-72"
          value={caseId}
          disabled={pending}
          onChange={(e) => {
            setCaseId(e.target.value);
            setFehler(null);
          }}
        >
          <option value="">Fall auswählen …</option>
          {faelle.map((f) => (
            <option key={f.id} value={f.id}>
              {f.bezeichnung}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          disabled={pending || !caseId}
          onClick={() =>
            startTransition(async () => {
              const r = await ordneEingangZuAction(datei.id, caseId);
              if (!r.ok) setFehler(r.grund ?? "Das hat nicht geklappt.");
            })
          }
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          In die Akte
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await verwirfEingangAction(datei.id);
              if (!r.ok) setFehler(r.grund ?? "Das hat nicht geklappt.");
            })
          }
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Wegwerfen
        </Button>
      </div>
      {fehler && <p className="mt-2 text-xs text-destructive">{fehler}</p>}
    </div>
  );
}
