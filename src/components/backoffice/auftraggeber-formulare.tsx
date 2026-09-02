"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  auftraggeberSpeichernAction,
  auftraggeberVerknuepfenAction,
  kontaktDeaktivierenAction,
  kontaktSpeichernAction,
  kontingentKorrigierenAction,
} from "@/lib/actions/backoffice";
import { BACKOFFICE_ABRECHNUNGSMODELLE, BACKOFFICE_ABRECHNUNGSMODELL_LABELS, type BackofficeAbrechnungsmodell } from "@/lib/domain/enums";
import { AktionFormular, AktionKnopf } from "./aktion-formular";

const FELD = "h-9 w-full rounded-md border bg-card px-3 text-sm";

export interface AuftraggeberWerte {
  id?: string;
  name: string;
  kurzname: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  abrechnungsmodell: BackofficeAbrechnungsmodell;
  kontingentMonatlich: number | null;
  carryOverMax: number;
  slaTage: number | null;
  antragstellerKontaktErlaubt: boolean;
  aktiv: boolean;
  notizIntern: string | null;
}

export function AuftraggeberForm({ werte }: { werte?: AuftraggeberWerte }) {
  const w = werte;
  return (
    <AktionFormular aktion={auftraggeberSpeichernAction} felder={w?.id ? { id: w.id } : {}} submitLabel={w?.id ? "Speichern" : "Auftraggeber anlegen"} erfolg={w?.id ? "Gespeichert." : undefined} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label htmlFor="ag-name">Name (Firma oder Vermittler)</Label><Input id="ag-name" name="name" required defaultValue={w?.name ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-kurz">Kurzname</Label><Input id="ag-kurz" name="kurzname" defaultValue={w?.kurzname ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-email">E-Mail</Label><Input id="ag-email" name="email" type="email" defaultValue={w?.email ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-phone">Telefon</Label><Input id="ag-phone" name="phone" defaultValue={w?.phone ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-street">Straße</Label><Input id="ag-street" name="street" defaultValue={w?.street ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-zip">PLZ</Label><Input id="ag-zip" name="zip" defaultValue={w?.zip ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-city">Ort</Label><Input id="ag-city" name="city" defaultValue={w?.city ?? ""} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ag-modell">Abrechnungsmodell</Label>
          <select id="ag-modell" name="abrechnungsmodell" defaultValue={w?.abrechnungsmodell ?? "testfall"} className={FELD}>
            {BACKOFFICE_ABRECHNUNGSMODELLE.filter((m) => m !== "intern").map((m) => (
              <option key={m} value={m}>{BACKOFFICE_ABRECHNUNGSMODELL_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ag-kont">Enthaltene Fälle je Monat (Abo)</Label><Input id="ag-kont" name="kontingentMonatlich" type="number" min={0} defaultValue={w?.kontingentMonatlich ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-carry">Übertrag in den Folgemonat (max.)</Label><Input id="ag-carry" name="carryOverMax" type="number" min={0} defaultValue={w?.carryOverMax ?? 0} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag-sla">Vereinbarte Frist in Werktagen (leer = Vorgabe)</Label><Input id="ag-sla" name="slaTage" type="number" min={1} defaultValue={w?.slaTage ?? ""} /></div>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="antragstellerKontaktErlaubt" defaultChecked={w?.antragstellerKontaktErlaubt ?? false} /> Das Backoffice darf den Antragsteller direkt ansprechen (Upload-Link, Nachforderung)</label>
        {w?.id && <label className="flex items-center gap-2"><input type="checkbox" name="aktiv" defaultChecked={w.aktiv} /> Aktiv</label>}
      </div>
      <div className="space-y-1.5"><Label htmlFor="ag-notiz">Interne Notiz</Label><Textarea id="ag-notiz" name="notizIntern" rows={3} defaultValue={w?.notizIntern ?? ""} /></div>
    </AktionFormular>
  );
}

export function VerknuepfungForm({ id, aktuellerSlug }: { id: string; aktuellerSlug: string | null }) {
  return (
    <AktionFormular aktion={auftraggeberVerknuepfenAction} felder={{ id }} submitLabel="Verknüpfung speichern" size="sm" erfolg="Verknüpfung gespeichert.">
      <Label htmlFor="ag-slug" className="text-xs">Kürzel (Slug) der BaufiDesk-Organisation – leer lassen, um die Verknüpfung zu lösen</Label>
      <Input id="ag-slug" name="slug" defaultValue={aktuellerSlug ?? ""} placeholder="z. B. mustermann-finanz" />
    </AktionFormular>
  );
}

export function KontaktForm({ auftraggeberId, verknuepft }: { auftraggeberId: string; verknuepft: boolean }) {
  return (
    <AktionFormular aktion={kontaktSpeichernAction} felder={{ auftraggeberId }} submitLabel="Kontakt anlegen" size="sm" erfolg="Kontakt angelegt.">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="k-name" className="text-xs">Name</Label><Input id="k-name" name="name" required /></div>
        <div className="space-y-1.5"><Label htmlFor="k-email" className="text-xs">E-Mail</Label><Input id="k-email" name="email" type="email" /></div>
        <div className="space-y-1.5"><Label htmlFor="k-phone" className="text-xs">Telefon</Label><Input id="k-phone" name="phone" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="darfAlleAuftraegeSehen" value="on" defaultChecked /> Sieht im Portal alle Aufträge des Auftraggebers</label>
      {verknuepft && <p className="text-xs text-muted-foreground">Passt die E-Mail zu einem Nutzer der verknüpften Organisation, wird der Kontakt an diesen Portal-Nutzer gebunden.</p>}
    </AktionFormular>
  );
}

export function KontaktDeaktivieren({ auftraggeberId, kontaktId }: { auftraggeberId: string; kontaktId: string }) {
  return (
    <AktionKnopf aktion={kontaktDeaktivierenAction.bind(null, auftraggeberId, kontaktId)} variant="ghost" bestaetigung="Kontakt deaktivieren? Ein gebundener Portal-Nutzer verliert damit seinen Zugang zu den Aufträgen.">
      Deaktivieren
    </AktionKnopf>
  );
}

export function KontingentKorrekturForm({ auftraggeberId, periode }: { auftraggeberId: string; periode: string }) {
  return (
    <AktionFormular aktion={kontingentKorrigierenAction} felder={{ auftraggeberId, periode }} submitLabel="Ereignis buchen" size="sm" variant="outline" erfolg="Gebucht.">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="kk-art" className="text-xs">Art</Label>
          <select id="kk-art" name="art" defaultValue="korrektur" className={FELD}>
            <option value="korrektur">Korrektur (±)</option>
            <option value="zusatzfall">Zusatzfall</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="kk-menge" className="text-xs">Menge (negativ = gutschreiben)</Label><Input id="kk-menge" name="menge" type="number" required defaultValue={-1} /></div>
        <div className="space-y-1.5 md:col-span-3"><Label htmlFor="kk-begr" className="text-xs">Begründung (Pflicht)</Label><Input id="kk-begr" name="begruendung" required /></div>
      </div>
    </AktionFormular>
  );
}
