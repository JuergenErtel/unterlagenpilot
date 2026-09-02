"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUFTRAGSARTEN } from "@/lib/backoffice/leistungen";
import type { QueueFilter } from "@/lib/backoffice/queue";
import {
  BACKOFFICE_PRIORITAETEN,
  BACKOFFICE_PRIORITAET_LABELS,
  BACKOFFICE_STATUS,
  BACKOFFICE_STATUS_LABELS,
} from "@/lib/domain/enums";

/**
 * Filterleiste der Queue: ein GET-Formular auf dieselbe URL. Kein Zustand im
 * Client - die URL ist der Zustand, damit ein Filter teilbar und nach dem
 * Neuladen noch da ist.
 */

const SLA_OPTIONEN: Array<{ wert: string; label: string }> = [
  { wert: "ueberschritten", label: "Überfällig" },
  { wert: "heute", label: "Heute fällig" },
  { wert: "gefaehrdet", label: "Morgen fällig" },
  { wert: "ok", label: "Im Plan" },
  { wert: "ruht", label: "Frist ruht" },
  { wert: "keine", label: "Ohne Frist" },
];

export function QueueFilterLeiste({
  filter,
  bearbeiter,
  auftraggeber,
  standardStatus = "aktiv",
}: {
  filter: QueueFilter;
  bearbeiter: Array<{ id: string; name: string }>;
  auftraggeber: Array<{ id: string; name: string }>;
  standardStatus?: "aktiv" | "alle";
}) {
  const pathname = usePathname();
  const auswahl = "feld h-9 w-full";
  return (
    <form method="get" action={pathname} className="rounded-lg border bg-card p-4 card-elevated">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
          <Label htmlFor="q">Suche</Label>
          <Input id="q" name="q" defaultValue={filter.suche ?? ""} placeholder="Nummer, Akte, Auftraggeber" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={filter.status ?? standardStatus} className={auswahl}>
            <option value="aktiv">Alle aktiven</option>
            <option value="alle">Alle (inkl. abgeschlossen)</option>
            {BACKOFFICE_STATUS.map((s) => (
              <option key={s} value={s}>
                {BACKOFFICE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prioritaet">Priorität</Label>
          <select id="prioritaet" name="prioritaet" defaultValue={filter.prioritaet ?? ""} className={auswahl}>
            <option value="">Alle</option>
            {BACKOFFICE_PRIORITAETEN.map((p) => (
              <option key={p} value={p}>
                {BACKOFFICE_PRIORITAET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sla">Frist</Label>
          <select id="sla" name="sla" defaultValue={filter.sla ?? ""} className={auswahl}>
            <option value="">Alle</option>
            {SLA_OPTIONEN.map((o) => (
              <option key={o.wert} value={o.wert}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bearbeiter">Bearbeiter</Label>
          <select id="bearbeiter" name="bearbeiter" defaultValue={filter.bearbeiterId ?? ""} className={auswahl}>
            <option value="">Alle</option>
            <option value="keiner">Nicht zugewiesen</option>
            {bearbeiter.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auftraggeber">Auftraggeber</Label>
          <select id="auftraggeber" name="auftraggeber" defaultValue={filter.auftraggeberId ?? ""} className={auswahl}>
            <option value="">Alle</option>
            {auftraggeber.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="art">Auftragsart</Label>
          <select id="art" name="art" defaultValue={filter.auftragsart ?? ""} className={auswahl}>
            <option value="">Alle</option>
            {AUFTRAGSARTEN.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          Filtern
        </Button>
        <Button asChild type="button" size="sm" variant="ghost">
          <Link href={pathname}>Zurücksetzen</Link>
        </Button>
      </div>
    </form>
  );
}
