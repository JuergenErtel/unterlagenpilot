"use client";

import { useActionState, useState, useEffect } from "react";
import { UploadCloud, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeWoflv, type WoflvRoom, type RoomCategory } from "@/lib/wohnflaeche/woflv";
import { analyzeFloorplanAction, saveWohnflaecheAction, type WohnflaecheState } from "@/lib/actions/wohnflaeche";
import type { FloorplanWoflvRoom } from "@/lib/wohnflaeche/schema";

const KATS: { value: RoomCategory; label: string }[] = [
  { value: "wohnraum", label: "Wohnraum" },
  { value: "balkon_terrasse_loggia", label: "Balkon/Terrasse" },
  { value: "zubehoer_keller_hobby_abstell", label: "Zubehör (Keller/Hobby)" },
  { value: "wintergarten", label: "Wintergarten" },
  { value: "schwimmbad", label: "Schwimmbad" },
];

/** Lokaler Zustand, der WoflvRoom um die UI-Felder aus FloorplanWoflvRoom erweitert. */
type EditorRoom = WoflvRoom & Pick<FloorplanWoflvRoom, "konfidenz" | "dachschraegeHinweis">;

export function WohnflaecheEditor({ caseId }: { caseId: string }) {
  const action = analyzeFloorplanAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<WohnflaecheState, FormData>(action, { rooms: [] });
  const [rooms, setRooms] = useState<EditorRoom[]>([]);
  const [saved, setSaved] = useState(false);
  /** Pro Zeile: ob das Dachschräge-Panel aufgeklappt ist. */
  const [dachOpen, setDachOpen] = useState<Record<string, boolean>>({});

  // Improvement 1: useEffect (not useMemo) to sync AI results into editable state.
  useEffect(() => {
    if (state.rooms.length > 0) {
      setRooms(
        state.rooms.map((r) => ({
          id: r.id,
          geschoss: r.geschoss,
          raumname: r.raumname,
          kategorie: r.kategorie,
          flaecheM2: r.flaecheM2,
          beheizt: r.beheizt,
          balkonFaktor: r.balkonFaktor,
          dachschraege: r.dachschraege ?? null,
          konfidenz: r.konfidenz,
          dachschraegeHinweis: r.dachschraegeHinweis,
        }))
      );
      // Auto-open Dachschräge panel for rooms where the AI detected a hint.
      setDachOpen(
        Object.fromEntries(state.rooms.map((r) => [r.id, r.dachschraegeHinweis]))
      );
      setSaved(false);
    }
  }, [state.rooms]);

  const result = computeWoflv(rooms);

  function update(id: string, patch: Partial<WoflvRoom>) {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function toggleDach(id: string, enabled: boolean, room: EditorRoom) {
    setDachOpen((prev) => ({ ...prev, [id]: enabled }));
    if (enabled) {
      // Initialise with zeros; user will fill them.
      update(id, { dachschraege: { unter1m: 0, zw1und2m: 0, ab2m: room.flaecheM2 } });
    } else {
      update(id, { dachschraege: null });
    }
  }

  async function save() {
    await saveWohnflaecheAction(caseId, rooms);
    setSaved(true);
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:border-ai/50">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">
            Grundriss(e) hochladen (JPG/PNG für KI-Analyse, PDF wird gespeichert)
          </span>
          <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 text-xs" />
        </label>
        <Button type="submit" className="mt-3 w-full" disabled={pending}>
          {pending ? "Analysiere …" : "Analysieren"}
        </Button>
        {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      </form>

      {rooms.length > 0 && (
        <>
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <div className="text-xs text-muted-foreground">Anrechenbare Wohnfläche</div>
              <div className="text-2xl font-semibold">{result.summeWohnflaecheM2.toFixed(2)} m²</div>
              <div className="text-xs text-muted-foreground">
                Zubehör getrennt: {result.summeZubehoerM2.toFixed(2)} m²
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} variant="success" size="sm">
                <Save className="h-4 w-4" />
                {saved ? "Gespeichert" : "Prüfen & speichern"}
              </Button>
              {saved && (
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/cases/${caseId}/pdf?type=wohnflaeche`}>
                    <FileDown className="h-4 w-4" />
                    PDF
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Geschoss</th>
                  <th className="px-2 py-2">Raum</th>
                  <th className="px-2 py-2">Kategorie</th>
                  <th className="px-2 py-2">Fläche m²</th>
                  <th className="px-2 py-2">Faktor</th>
                  <th className="px-2 py-2">Anrechenbar</th>
                  <th className="px-2 py-2">Konfidenz</th>
                </tr>
              </thead>
              <tbody>
                {/* Improvement 3: map over rooms/result.rooms — no re-indexing by i */}
                {result.rooms.map((resultRoom) => {
                  // Find the matching editorRoom by id (avoids unchecked indexed access).
                  const editorRoom = rooms.find((r) => r.id === resultRoom.id);
                  if (!editorRoom) return null;

                  const konf = editorRoom.konfidenz;
                  const isDachOpen = dachOpen[editorRoom.id] ?? false;

                  return (
                    <>
                      <tr key={resultRoom.id} className="border-b last:border-0">
                        <td className="px-2 py-1">
                          <Input
                            value={editorRoom.geschoss}
                            onChange={(e) => update(editorRoom.id, { geschoss: e.target.value })}
                            className="h-8 w-16"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <Input
                              value={editorRoom.raumname}
                              onChange={(e) => update(editorRoom.id, { raumname: e.target.value })}
                              className="h-8 w-32"
                            />
                            {/* Improvement 2: badge hint when AI detected roof slope */}
                            {editorRoom.dachschraegeHinweis && (
                              <span
                                title="KI erkennt mögliche Dachschräge"
                                className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              >
                                Dachschräge?
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={editorRoom.kategorie}
                            onChange={(e) =>
                              update(editorRoom.id, { kategorie: e.target.value as RoomCategory })
                            }
                            className="h-8 rounded-md border px-1 text-xs"
                          >
                            {KATS.map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editorRoom.flaecheM2}
                            onChange={(e) =>
                              update(editorRoom.id, { flaecheM2: Number(e.target.value) })
                            }
                            className="h-8 w-20"
                          />
                        </td>
                        <td className="px-2 py-1 text-xs text-muted-foreground">
                          {Math.round(resultRoom.faktor * 100)}%
                        </td>
                        <td className="px-2 py-1 font-medium">{resultRoom.anrechenbarM2.toFixed(2)}</td>
                        <td className="px-2 py-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              konf >= 0.8
                                ? "bg-success/15 text-success-foreground"
                                : konf >= 0.6
                                  ? "bg-warning/15 text-warning-foreground"
                                  : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            {Math.round(konf * 100)}%
                          </span>
                        </td>
                      </tr>
                      {/* Improvement 2: Dachschräge toggle + sub-row for wohnraum */}
                      {editorRoom.kategorie === "wohnraum" && (
                        <tr key={`${resultRoom.id}-dach`} className="border-b bg-muted/20 last:border-0">
                          <td colSpan={7} className="px-3 py-1.5">
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                              <input
                                type="checkbox"
                                checked={isDachOpen}
                                onChange={(e) =>
                                  toggleDach(editorRoom.id, e.target.checked, editorRoom)
                                }
                                className="h-3.5 w-3.5"
                              />
                              <span className="font-medium text-foreground">Dachschräge</span>
                              <span>(Teilflächen nach lichter Höhe angeben)</span>
                            </label>
                            {isDachOpen && (
                              <div className="mt-2 flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-1 text-xs">
                                  <span className="w-16 text-muted-foreground">&lt; 1 m (0%)</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editorRoom.dachschraege?.unter1m ?? 0}
                                    onChange={(e) =>
                                      update(editorRoom.id, {
                                        dachschraege: {
                                          unter1m: Number(e.target.value),
                                          zw1und2m: editorRoom.dachschraege?.zw1und2m ?? 0,
                                          ab2m: editorRoom.dachschraege?.ab2m ?? 0,
                                        },
                                      })
                                    }
                                    className="h-7 w-20 text-xs"
                                  />
                                  <span className="text-muted-foreground">m²</span>
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                  <span className="w-16 text-muted-foreground">1–2 m (50%)</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editorRoom.dachschraege?.zw1und2m ?? 0}
                                    onChange={(e) =>
                                      update(editorRoom.id, {
                                        dachschraege: {
                                          unter1m: editorRoom.dachschraege?.unter1m ?? 0,
                                          zw1und2m: Number(e.target.value),
                                          ab2m: editorRoom.dachschraege?.ab2m ?? 0,
                                        },
                                      })
                                    }
                                    className="h-7 w-20 text-xs"
                                  />
                                  <span className="text-muted-foreground">m²</span>
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                  <span className="w-16 text-muted-foreground">≥ 2 m (100%)</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editorRoom.dachschraege?.ab2m ?? 0}
                                    onChange={(e) =>
                                      update(editorRoom.id, {
                                        dachschraege: {
                                          unter1m: editorRoom.dachschraege?.unter1m ?? 0,
                                          zw1und2m: editorRoom.dachschraege?.zw1und2m ?? 0,
                                          ab2m: Number(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 w-20 text-xs"
                                  />
                                  <span className="text-muted-foreground">m²</span>
                                </label>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche Aufmaß-/Vermesserbescheinigung.
            Bitte jeden Wert prüfen.
          </p>
        </>
      )}
    </div>
  );
}
