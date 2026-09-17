"use client";

import { useState, useTransition } from "react";
import { FileText, Image as BildIcon, Loader2, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  ordneEingangZuAction,
  ordneEingangInNeuenStapelAction,
  verwirfEingangAction,
} from "@/lib/actions/eingang";

export interface EingangAnzeige {
  id: string;
  originalName: string;
  mimeType: string;
  /** Fertig formatiert – der Server rechnet Groesse und Zeitzone, nicht der Browser. */
  groesse: string;
  angekommen: string;
  von: string | null;
  /** Woher sie kam: "kurzbefehl" (Handy) oder "mail" (weitergeleitet). */
  quelle: string;
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
  stapel,
  neuerStapelMoeglich,
}: {
  dateien: EingangAnzeige[];
  faelle: FallAuswahl[];
  /** Offene Sortierstapel - eigene Gruppe, damit sie nicht wie Faelle aussehen. */
  stapel: FallAuswahl[];
  /** Darf der Nutzer einen frischen Stapel anlegen? (Sortierer-Bereich) */
  neuerStapelMoeglich: boolean;
}) {
  return (
    <div className="space-y-2">
      {dateien.map((d) => (
        <Zeile
          key={d.id}
          datei={d}
          faelle={faelle}
          stapel={stapel}
          neuerStapelMoeglich={neuerStapelMoeglich}
        />
      ))}
    </div>
  );
}

/** Kennung fuer "neuer Sortierstapel" - kein echtes Ziel, sondern ein Auftrag. */
const NEUER_STAPEL = "__neuer_stapel__";

function Zeile({
  datei,
  faelle,
  stapel,
  neuerStapelMoeglich,
}: {
  datei: EingangAnzeige;
  faelle: FallAuswahl[];
  stapel: FallAuswahl[];
  neuerStapelMoeglich: boolean;
}) {
  const router = useRouter();
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
            {datei.groesse} · {datei.angekommen} · {herkunft(datei.quelle)}
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
          <option value="">Wohin damit? …</option>
          {/* Getrennte Gruppen, nicht eine Liste: Ein Fall und ein
              Sortierstapel sind grundverschiedene Ziele. Untereinander
              stuenden sie nur als Nummern da, und der Nutzer greift daneben. */}
          {neuerStapelMoeglich && (
            <optgroup label="Sortieren">
              <option value={NEUER_STAPEL}>＋ In einen neuen Sortierstapel</option>
              {stapel.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.bezeichnung}
                </option>
              ))}
            </optgroup>
          )}
          {faelle.length > 0 && (
            <optgroup label="Fälle">
              {faelle.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.bezeichnung}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <Button
          size="sm"
          disabled={pending || !caseId}
          onClick={() =>
            startTransition(async () => {
              if (caseId === NEUER_STAPEL) {
                const r = await ordneEingangInNeuenStapelAction(datei.id);
                if (!r.ok) {
                  setFehler(r.grund ?? "Das hat nicht geklappt.");
                  return;
                }
                // Direkt in den frischen Stapel: Wer "neuer Stapel" waehlt,
                // will dort weiterarbeiten - ihn danach im Posteingang stehen
                // zu lassen, waere ein Klick ins Nichts.
                if (r.stapelId) router.push(`/sortierer/${r.stapelId}`);
                return;
              }
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
          Übernehmen
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

/**
 * Woher die Datei kam, in Alltagssprache.
 *
 * Steht direkt neben Zeit und Groesse, weil es die Zuordnung leitet: Was per
 * Mail kam, gehoert meist zu dem Fall, ueber den man gerade korrespondiert -
 * was vom Handy kam, zu dem, den man gerade am Telefon hatte.
 */
function herkunft(quelle: string): string {
  if (quelle === "mail") return "per E-Mail";
  if (quelle === "kurzbefehl") return "vom Handy";
  return quelle;
}
