"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FolderInput, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";
import { protokolliereAuslieferung } from "@/lib/actions/sortierer";
import { uebergebeStapelAnFall } from "@/lib/actions/sortierer-uebergabe";

export interface ErgebnisDokument {
  id: string;
  name: string;
  typ: DocumentType | null;
}

/**
 * Das Ende des Sortierens: „Wie möchtest du die Dateien zurück haben?"
 *
 * Bewusst EINE Frage mit zwei Antworten und nicht zwei Knöpfe irgendwo am
 * Rand. Der Berater ist an dieser Stelle fertig mit dem Denken - er soll nicht
 * suchen müssen, wie er sein Ergebnis bekommt.
 *
 * Der Stapel bleibt nach beidem bestehen (bis zu den vierzehn Tagen): Ein
 * zweiter Download muss möglich sein, ohne alles neu zu sortieren.
 */
export function StapelErgebnis({
  stapelId,
  dokumente,
  faelle,
}: {
  stapelId: string;
  dokumente: ErgebnisDokument[];
  faelle: Array<{ id: string; bezeichnung: string }>;
}) {
  const router = useRouter();
  const [zielFall, setZielFall] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (dokumente.length === 0) {
    return (
      <section className="flaeche-ablage rounded-lg p-5 text-sm text-muted-foreground">
        In diesem Stapel liegt noch nichts. Wirf unten Unterlagen hinein.
      </section>
    );
  }

  return (
    <section className="flaeche-oben space-y-4 rounded-lg p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
        <h2 className="t-abschnitt">Fertig sortiert – {dokumente.length} Dokumente</h2>
      </div>

      <ul className="space-y-1.5">
        {dokumente.map((d) => (
          <li key={d.id}>
            <a
              href={`/api/documents/${d.id}/download?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flaeche-ablage flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/60"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {/* Ohne erkannten Typ ehrlich "Ohne Zuordnung" statt einer
                    erfundenen Bezeichnung - der Berater sieht auf einen Blick,
                    was die Maschine nicht konnte. */}
                {d.typ ? DOCUMENT_TYPE_LABELS[d.typ] : "Ohne Zuordnung"}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Wie möchtest du die Dateien zurück haben?</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild onClick={() => void protokolliereAuslieferung(stapelId, "download")}>
            <a href={`/api/cases/${stapelId}/zip`}>
              <Download className="h-4 w-4" />
              Als ZIP herunterladen
            </a>
          </Button>

          <span className="text-sm text-muted-foreground">oder</span>

          <label className="sr-only" htmlFor="zielfall">
            Fall auswählen
          </label>
          <select
            id="zielfall"
            className="feld h-9 w-full sm:w-64"
            value={zielFall}
            disabled={laeuft || faelle.length === 0}
            onChange={(e) => {
              setZielFall(e.target.value);
              setFehler(null);
            }}
          >
            <option value="">
              {faelle.length === 0 ? "Kein offener Fall vorhanden" : "Einem Fall zuordnen …"}
            </option>
            {faelle.map((f) => (
              <option key={f.id} value={f.id}>
                {f.bezeichnung}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            disabled={laeuft || !zielFall}
            onClick={() =>
              starte(async () => {
                setFehler(null);
                const r = await uebergebeStapelAnFall(stapelId, zielFall);
                if (!r.ok) {
                  setFehler(r.grund ?? "Die Übergabe hat nicht geklappt.");
                  return;
                }
                setMeldung(
                  `${r.uebernommen} ${r.uebernommen === 1 ? "Dokument" : "Dokumente"} liegen jetzt im Fall.`
                );
                router.refresh();
              })
            }
          >
            {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
            Übernehmen
          </Button>
        </div>

        {meldung && <p className="text-sm text-success">{meldung}</p>}
        {fehler && <p className="text-sm text-destructive">{fehler}</p>}
        <p className="t-hilfe text-xs">
          Der Stapel bleibt danach bestehen – du kannst ihn erneut herunterladen, ohne alles
          neu zu sortieren.
        </p>
      </div>
    </section>
  );
}
