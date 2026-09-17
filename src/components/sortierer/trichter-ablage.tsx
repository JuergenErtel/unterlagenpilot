"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { TrichterIcon } from "@/components/ui/trichter-icon";
import { Button } from "@/components/ui/button";
import { erstelleStapelAction } from "@/lib/actions/sortierer";
import {
  brokerUploadOne,
  finishBrokerUpload,
  requestBrokerUploadSlot,
  processBrokerStoredUpload,
} from "@/lib/actions/upload";
import { uploadFilesSequentially, type UploadProgress } from "@/lib/upload/client-upload";

/**
 * Der Trichter: die Ablageflaeche, mit der ein Sortierstapel entsteht.
 *
 * Bewusst KEIN "Neuen Stapel anlegen"-Knopf vor der Ablage. Der Sortierer ist
 * fuer den Augenblick gedacht, in dem jemand schnell dreissig Fotos ordnen
 * will; ein Formular davor waere genau die Huerde, die er abschaffen soll.
 * Der Stapel entsteht deshalb ERST, wenn Dateien da sind - vorher gibt es
 * nichts anzulegen.
 *
 * Reihenfolge beim Ablegen: Stapel anlegen, hochladen, dann hin navigieren.
 * Die Dateien ueberleben keine Navigation, also muss der Upload vorher laufen.
 */
export function TrichterAblage({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const feld = useRef<HTMLInputElement>(null);
  const [ueber, setUeber] = useState(false);
  const [fortschritt, setFortschritt] = useState<UploadProgress | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function verarbeite(dateien: File[]) {
    if (dateien.length === 0 || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const { id } = await erstelleStapelAction();
      const ergebnis = await uploadFilesSequentially(
        dateien,
        (fd) => brokerUploadOne(id, fd),
        {
          // Ein Sortierstapel hat keine Antragsteller - es gibt niemanden,
          // dem eine Seite gehoeren koennte. Der leere Wert ist genau richtig:
          // Eine geratene Zuordnung waere als "manuell" gestempelt und danach
          // von der Namenserkennung unantastbar.
          extraFields: { applicantPosition: "" },
          onProgress: setFortschritt,
          requestSlot: (name, mime) => requestBrokerUploadSlot(id, name, mime),
          processStored: (meta) => processBrokerStoredUpload(id, "", meta),
        }
      );
      await finishBrokerUpload(id);
      if (ergebnis.uploaded === 0) {
        setFehler(
          ergebnis.error ??
            ergebnis.rejected[0]?.reason ??
            "Keine der Dateien konnte angenommen werden."
        );
        setLaeuft(false);
        return;
      }
      // Erst hier navigieren: Auf der Stapelseite laeuft die Sortierung
      // sichtbar weiter.
      router.push(`/sortierer/${id}`);
    } catch (e) {
      setFehler((e as Error).message || "Der Stapel konnte nicht angelegt werden.");
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setUeber(true);
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUeber(false);
          void verarbeite(Array.from(e.dataTransfer.files));
        }}
        className={[
          "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
          ueber ? "border-ai bg-ai/10" : "border-ai/40 bg-ai/[0.04]",
          laeuft ? "pointer-events-none opacity-70" : "",
        ].join(" ")}
      >
        <TrichterIcon className="h-14 w-14 text-ai" />

        {laeuft ? (
          <>
            <p className="t-abschnitt">Der Stapel wird angelegt …</p>
            <p className="t-hilfe text-sm">
              {fortschritt
                ? `Datei ${fortschritt.done + 1} von ${fortschritt.total}${fortschritt.current ? `: ${fortschritt.current}` : ""}`
                : "Einen Augenblick."}
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-ai" aria-hidden />
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="t-abschnitt">Unterlagen hier hineinwerfen</p>
              <p className="t-hilfe mx-auto max-w-md text-sm">
                Fotos, Scans, PDFs – alles durcheinander. BaufiDesk erkennt, was
                zusammengehört, und macht daraus geordnete Dokumente. Kein Kunde
                nötig, keine Akte.
              </p>
            </div>
            <Button size="lg" onClick={() => feld.current?.click()}>
              Dateien auswählen
            </Button>
            <p className="t-hilfe text-xs">Bis {maxMb} MB je Datei</p>
          </>
        )}

        <input
          ref={feld}
          type="file"
          multiple
          className="sr-only"
          accept="image/*,application/pdf"
          onChange={(e) => {
            void verarbeite(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {fehler && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </div>
  );
}
