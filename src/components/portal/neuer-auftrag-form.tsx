"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { portalAuftragAnlegenAction } from "@/lib/actions/backoffice-portal";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";
import { AUFTRAGSARTEN, LEISTUNGSBAUSTEINE } from "@/lib/backoffice/leistungen";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  FINANCING_TYPES,
  FINANCING_TYPE_LABELS,
} from "@/lib/domain/enums";

export interface NeuerAuftragPartner {
  id: string;
  backofficeName: string;
}

/**
 * Auftrag an das Backoffice erteilen. Die Auftragsart belegt die
 * Leistungsbausteine vor; der Auftraggeber kann sie danach frei anpassen.
 * Pflicht ist nur, was der Auftrag zum Anlegen braucht: Auftragsart und
 * entweder ein Nachname oder eine Aktenbezeichnung.
 */
export function NeuerAuftragForm({ partner }: { partner: NeuerAuftragPartner[] }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalAuftragAnlegenAction, {});
  const erste = AUFTRAGSARTEN[0]!;
  const [auftragsart, setAuftragsart] = useState<string>(erste.key);
  const [leistungen, setLeistungen] = useState<Set<string>>(new Set(erste.leistungen));

  function waehleArt(key: string) {
    setAuftragsart(key);
    const art = AUFTRAGSARTEN.find((a) => a.key === key);
    setLeistungen(new Set(art?.leistungen ?? []));
  }

  function toggleLeistung(key: string, an: boolean) {
    setLeistungen((prev) => {
      const next = new Set(prev);
      if (an) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8">
      <p className="rounded-md border border-ai/30 bg-ai/5 px-3 py-2 text-sm text-foreground">
        Es werden keine Vertriebsdaten benötigt. Das Backoffice arbeitet ausschließlich mit den Unterlagen und den Angaben, die Sie hier machen.
      </p>

      {partner.length > 1 ? (
        <section className="space-y-1.5">
          <Label htmlFor="auftraggeberId">Backoffice-Partner</Label>
          <select id="auftraggeberId" name="auftraggeberId" required defaultValue={partner[0]!.id} className="feld h-9 w-full sm:max-w-md">
            {partner.map((p) => (
              <option key={p.id} value={p.id}>
                {p.backofficeName}
              </option>
            ))}
          </select>
        </section>
      ) : (
        <input type="hidden" name="auftraggeberId" value={partner[0]?.id ?? ""} />
      )}

      <section className="space-y-3">
        <h2 className="display text-base">Antragsteller</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vorname">Vorname</Label>
            <Input id="vorname" name="vorname" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nachname">Nachname</Label>
            <Input id="nachname" name="nachname" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail (optional)</Label>
            <Input id="email" name="email" type="email" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon (optional)</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="off" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="aktenbezeichnung">Aktenbezeichnung (optional)</Label>
            <Input id="aktenbezeichnung" name="aktenbezeichnung" placeholder="z. B. „Familie Muster – Kauf Musterstraße 1“" />
            <p className="text-xs text-muted-foreground">Nachname oder Aktenbezeichnung – eines von beiden genügt.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-base">Auftragsart</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUFTRAGSARTEN.map((a) => (
            <label
              key={a.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="auftragsart"
                value={a.key}
                checked={auftragsart === a.key}
                onChange={() => waehleArt(a.key)}
                className="mt-1 h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-muted-foreground">{a.beschreibung}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-base">Leistungsbausteine</h2>
        <p className="text-sm text-muted-foreground">Durch die Auftragsart vorbelegt – bei Bedarf ergänzen oder abwählen.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEISTUNGSBAUSTEINE.map((l) => (
            <label key={l.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 has-[:checked]:border-primary/60">
              <input
                type="checkbox"
                name="leistungen"
                value={l.key}
                checked={leistungen.has(l.key)}
                onChange={(e) => toggleLeistung(l.key, e.target.checked)}
                className="mt-1 h-4 w-4 rounded border"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.beschreibung}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-base">Rahmen des Falls</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="financingType">Finanzierungsart</Label>
            <select id="financingType" name="financingType" defaultValue="" className="feld h-9 w-full">
              <option value="">Noch offen</option>
              {FINANCING_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FINANCING_TYPE_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employmentType">Beschäftigungsart</Label>
            <select id="employmentType" name="employmentType" defaultValue="" className="feld h-9 w-full">
              <option value="">Noch offen</option>
              {EMPLOYMENT_TYPES.map((e) => (
                <option key={e} value={e}>
                  {EMPLOYMENT_TYPE_LABELS[e]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referenzExtern">Eigene Referenz (optional)</Label>
            <Input id="referenzExtern" name="referenzExtern" placeholder="Ihre Vorgangs- oder Kundennummer" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hinweise">Hinweise an das Backoffice</Label>
            <Textarea id="hinweise" name="hinweise" rows={4} placeholder="Zielbank, Besonderheiten, Termine, was bereits geklärt ist …" />
          </div>
        </div>
      </section>

      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <SubmitButton pendingLabel="Auftrag wird angelegt …">Auftrag erteilen</SubmitButton>
        <p className="text-xs text-muted-foreground">Nach dem Anlegen können Sie sofort Unterlagen hochladen.</p>
      </div>
    </form>
  );
}
