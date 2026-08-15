"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { versendeEinladung } from "@/lib/actions/anfrage-einladung";
import { formularEinrichten, formularUmschalten } from "@/lib/actions/anfrage-verwaltung";
import type { FormularStand } from "@/lib/leadformular/service";

/**
 * Anfrageformular einrichten, Adresse kopieren, Einladung verschicken.
 *
 * Rückmeldungen werden IMMER angezeigt – auch die Fehler. Ein stiller
 * Fehlschlag ist hier besonders teuer: Der Vermittler glaubt sonst, der
 * Interessent habe seinen Link, und wartet auf eine Antwort, die nie kommt.
 */
export function FormularKarte({ stand }: { stand: FormularStand }) {
  const [meldung, setMeldung] = useState<{ ok?: boolean; text: string } | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Kunden selbst ausfüllen lassen</h3>
        {stand.slug && <Badge variant="outline">{stand.aktiv ? "aktiv" : "abgeschaltet"}</Badge>}
      </div>

      <p className="text-xs text-muted-foreground">
        Ein Link, den Interessenten selbst ausfüllen. Der Fall entsteht erst, wenn jemand
        abgesendet hat – mit allen Angaben darin.
      </p>

      {!stand.slug && (
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await formularEinrichten(fd);
              setMeldung(res.error ? { text: res.error } : { ok: true, text: "Formular eingerichtet." });
            })
          }
          className="flex items-end gap-2"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="slug" className="text-xs">Wunschadresse</Label>
            <Input id="slug" name="slug" placeholder="ertel" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>Einrichten</Button>
        </form>
      )}

      {stand.url && (
        <>
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <code className="flex-1 truncate text-xs">{stand.url}</code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
              onClick={() => {
                navigator.clipboard?.writeText(stand.url!);
                setKopiert(true);
                setTimeout(() => setKopiert(false), 1500);
              }}
            >
              {kopiert ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {kopiert ? "Kopiert" : "Kopieren"}
            </button>
          </div>

          {stand.kannSlugAendern && (
            <form
              action={(fd) =>
                startTransition(async () => {
                  const res = await formularEinrichten(fd);
                  setMeldung(res.error ? { text: res.error } : { ok: true, text: "Adresse geändert." });
                })
              }
              className="flex items-end gap-2"
            >
              <div className="flex-1 space-y-1">
                <Label htmlFor="slug-aendern" className="text-xs">
                  Adresse ändern (noch niemand hat abgesendet)
                </Label>
                <Input id="slug-aendern" name="slug" defaultValue={stand.slug ?? ""} />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Ändern
              </Button>
            </form>
          )}

          <form
            action={(fd) =>
              startTransition(async () => {
                const res = await versendeEinladung(fd);
                setMeldung(
                  res.error ? { text: res.error } : { ok: true, text: "Einladung verschickt." }
                );
              })
            }
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="einladung-email" className="text-xs">Einladung an</Label>
              <Input id="einladung-email" name="email" type="email" placeholder="kunde@example.de" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Senden
            </Button>
          </form>

          <form action={() => startTransition(() => formularUmschalten())}>
            <Button type="submit" size="sm" variant="ghost" disabled={pending}>
              {stand.aktiv ? "Formular abschalten" : "Formular einschalten"}
            </Button>
          </form>

          <div className="space-y-1 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Zuletzt eingeladen</p>
            {stand.einladungen.length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch niemand eingeladen.</p>
            ) : (
              <ul className="space-y-0.5">
                {stand.einladungen.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3 text-xs">
                    <span className="truncate">{e.email}</span>
                    <span className="shrink-0 text-muted-foreground">{e.am}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {meldung && (
        <p className={meldung.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {meldung.text}
        </p>
      )}
    </div>
  );
}
