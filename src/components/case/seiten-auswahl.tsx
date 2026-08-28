"use client";

import { createContext, useContext, useEffect, useState, useActionState } from "react";
import { Layers } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  seitenZusammenfuegenAction,
  type SeitenZusammenfuegenState,
} from "@/lib/actions/buendelung";

interface AuswahlKontextWert {
  istKandidat: (id: string) => boolean;
  istGewaehlt: (id: string) => boolean;
  umschalten: (id: string) => void;
}

// Die Tabelle steckt voller Server-Zeilen (DocumentTypeSelect,
// Server-Action-Formulare) und wird auf der Fallseite server-seitig
// gerendert. Eine Render-Funktion als Prop kaeme ueber die Server/Client-Grenze
// nicht mit - RSC serialisiert keine Callbacks, nur bereits gerenderte
// Elemente. Die Kaestchen melden sich deshalb per Kontext hier an, statt dass
// die Tabelle eine Funktion aufruft.
const AuswahlKontext = createContext<AuswahlKontextWert | null>(null);

/**
 * Auswahlkaestchen an den Einzelseiten plus die Leiste zum Zusammenfuegen.
 *
 * Der Notausgang, wenn die KI danebenliegt. Die Reihenfolge ist die der
 * Tabelle (Uploadzeit) - wer eine andere braucht, faedelt ueber den
 * KI-Vorschlag oder macht danach "Rueckgaengig".
 *
 * Der Auswahlzustand wird bewusst NICHT gespeichert: eine halb angehakte
 * Auswahl, die einen Seitenwechsel ueberlebt, ist eine Falle, keine Hilfe.
 */
export function SeitenAuswahl({
  caseId,
  kandidaten,
  children,
}: {
  caseId: string;
  /** Dokument-IDs, die angehakt werden duerfen - in Tabellenreihenfolge. */
  kandidaten: string[];
  /** Die (serverseitig gerenderte) Tabelle. */
  children: React.ReactNode;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [state, zusammenfuegen] = useActionState<SeitenZusammenfuegenState, FormData>(
    seitenZusammenfuegenAction,
    {}
  );

  // Aendert sich die Kandidatenliste (z.B. weil eine Zusammenfuehrung gerade
  // geglueckt ist und die Quellseiten ihr Kaestchen verloren haben), faellt
  // jede Auswahl heraus, die es als Kandidat nicht mehr gibt - sonst zaehlt
  // die Leiste Seiten mit, die gar nicht mehr ankreuzbar sind.
  useEffect(() => {
    const erlaubt = new Set(kandidaten);
    setGewaehlt((alt) => alt.filter((id) => erlaubt.has(id)));
  }, [kandidaten]);

  const erlaubt = new Set(kandidaten);
  const umschalten = (id: string) =>
    setGewaehlt((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));

  // In Tabellenreihenfolge, nicht in Anklickreihenfolge: die Seitenfolge soll
  // vorhersagbar sein.
  const inReihenfolge = kandidaten.filter((id) => gewaehlt.includes(id));

  return (
    <AuswahlKontext.Provider
      value={{
        istKandidat: (id) => erlaubt.has(id),
        istGewaehlt: (id) => gewaehlt.includes(id),
        umschalten,
      }}
    >
      <div className="space-y-3">
        {inReihenfolge.length >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ai/30 bg-ai/[0.05] p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 shrink-0 text-ai" aria-hidden />
                {inReihenfolge.length} Seiten ausgewählt
              </p>
              {/* Ein fehlgeschlagenes Zusammenfuegen (istBuendelKandidat lehnt
                  z.B. eine inzwischen freigegebene Quelle ab) muss HIER sichtbar
                  werden - sonst sieht der Vermittler nur, dass der Klick nichts
                  bewirkt hat (der teuerste wiederkehrende Fehler in diesem
                  Projekt). `grund` ist bereits kundengrader Klartext aus der
                  Service-Schicht. */}
              {state.grund && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {state.grund}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <form action={zusammenfuegen}>
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="documentIds" value={inReihenfolge.join(",")} />
                <SubmitButton size="sm" pendingLabel="Wird zusammengefügt …">
                  Als ein Dokument zusammenfügen
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setGewaehlt([])}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Auswahl aufheben
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </AuswahlKontext.Provider>
  );
}

/**
 * Ein Auswahlkaestchen fuer genau eine Tabellenzeile.
 *
 * Eigene Client-Komponente statt eines rohen `<input>` in der (server-
 * gerenderten) Zeile: Sie meldet sich per Kontext bei der umgebenden
 * `<SeitenAuswahl>` an, damit Zustand und Kaestchen nicht ueber Props durch
 * eine Server-Komponente hindurch mussten.
 */
export function SeitenKaestchen({ documentId, label }: { documentId: string; label: string }) {
  const kontext = useContext(AuswahlKontext);
  if (!kontext || !kontext.istKandidat(documentId)) return null;
  return (
    <input
      type="checkbox"
      checked={kontext.istGewaehlt(documentId)}
      onChange={() => kontext.umschalten(documentId)}
      aria-label={`${label} zum Zusammenfügen auswählen`}
      className="h-4 w-4 cursor-pointer accent-primary"
    />
  );
}
