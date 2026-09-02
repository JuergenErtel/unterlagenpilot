"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { auftragAnlegenAction, type AktionsErgebnis } from "@/lib/actions/backoffice";
import {
  BACKOFFICE_PRIORITAETEN,
  BACKOFFICE_PRIORITAET_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  FINANCING_TYPES,
  FINANCING_TYPE_LABELS,
} from "@/lib/domain/enums";
import { AuftragsartAuswahl } from "./auftragsart-auswahl";
import { Rueckmeldung } from "./aktion-formular";

export interface AnlageAuftraggeber {
  id: string;
  name: string;
  kontakte: Array<{ id: string; name: string; email: string | null }>;
}

const FELD = "h-9 w-full rounded-md border bg-card px-3 text-sm";

export function AuftragAnlegenForm({ auftraggeber }: { auftraggeber: AnlageAuftraggeber[] }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(auftragAnlegenAction, {});
  const [agId, setAgId] = useState(auftraggeber[0]?.id ?? "");
  const kontakte = auftraggeber.find((a) => a.id === agId)?.kontakte ?? [];

  return (
    <form action={formAction} className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="auftraggeberId">Auftraggeber</Label>
          <select id="auftraggeberId" name="auftraggeberId" value={agId} onChange={(e) => setAgId(e.target.value)} className={FELD} required>
            {auftraggeber.length === 0 && <option value="">Zuerst einen Auftraggeber anlegen</option>}
            {auftraggeber.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kontaktId">Ansprechpartner</Label>
          <select id="kontaktId" name="kontaktId" className={FELD} defaultValue="">
            <option value="">Kein bestimmter Kontakt</option>
            {kontakte.map((k) => (
              <option key={k.id} value={k.id}>{k.name}{k.email ? ` · ${k.email}` : ""}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-sm font-medium">Antragsteller</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="vorname">Vorname</Label><Input id="vorname" name="vorname" autoComplete="off" /></div>
          <div className="space-y-1.5"><Label htmlFor="nachname">Nachname</Label><Input id="nachname" name="nachname" autoComplete="off" /></div>
          <div className="space-y-1.5"><Label htmlFor="email">E-Mail (optional)</Label><Input id="email" name="email" type="email" autoComplete="off" /></div>
          <div className="space-y-1.5"><Label htmlFor="phone">Telefon (optional)</Label><Input id="phone" name="phone" autoComplete="off" /></div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="aktenbezeichnung">Aktenbezeichnung (optional, sonst der Name)</Label>
            <Input id="aktenbezeichnung" name="aktenbezeichnung" placeholder="z. B. Müller – Kauf ETW Karlsruhe" />
          </div>
        </div>
      </section>

      <AuftragsartAuswahl />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="prioritaet">Priorität</Label>
          <select id="prioritaet" name="prioritaet" defaultValue="normal" className={FELD}>
            {BACKOFFICE_PRIORITAETEN.map((p) => (
              <option key={p} value={p}>{BACKOFFICE_PRIORITAET_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="faelligAm">Gewünschte Frist (leer = Vorgabe des Auftraggebers)</Label>
          <Input id="faelligAm" name="faelligAm" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="referenzExtern">Referenz des Auftraggebers</Label>
          <Input id="referenzExtern" name="referenzExtern" placeholder="Vorgangsnummer, Plattform-ID" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="financingType">Finanzierungsart</Label>
          <select id="financingType" name="financingType" defaultValue="" className={FELD}>
            <option value="">Noch offen</option>
            {FINANCING_TYPES.map((f) => (
              <option key={f} value={f}>{FINANCING_TYPE_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employmentType">Beschäftigungsart</Label>
          <select id="employmentType" name="employmentType" defaultValue="" className={FELD}>
            <option value="">Noch offen</option>
            {EMPLOYMENT_TYPES.map((e) => (
              <option key={e} value={e}>{EMPLOYMENT_TYPE_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="hinweise">Hinweise des Auftraggebers</Label>
        <Textarea id="hinweise" name="hinweise" rows={4} placeholder="Besonderheiten, Zielbank, Termine …" />
      </div>

      <Rueckmeldung state={state} />
      <SubmitButton pendingLabel="Wird angelegt …">Auftrag anlegen</SubmitButton>
    </form>
  );
}
