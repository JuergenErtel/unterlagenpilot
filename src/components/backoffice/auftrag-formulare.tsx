"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  fortsetzenAction,
  notizenSpeichernAction,
  pausierenAction,
  qualitaetFreigebenAction,
  rueckfrageEntwurfAction,
  rueckfrageErledigenAction,
  rueckfrageLoeschenAction,
  rueckfrageStellenAction,
  statusWechselnAction,
  steuerungAction,
  uebergebenAction,
  uebernehmenAction,
  zurNachbearbeitungAction,
  zuweisenAction,
  type AktionsErgebnis,
} from "@/lib/actions/backoffice";
import type { Uebergang } from "@/lib/backoffice/status";
import {
  BACKOFFICE_PRIORITAETEN,
  BACKOFFICE_PRIORITAET_LABELS,
  BACKOFFICE_RUECKFRAGE_STATUS_LABELS,
  type BackofficePrioritaet,
  type BackofficeRueckfrageStatus,
} from "@/lib/domain/enums";
import { AktionFormular, AktionKnopf, Rueckmeldung } from "./aktion-formular";

/**
 * Die Formulare der Auftragsseite. Jede Entscheidung ist ein eigener
 * Knopf mit eigener Rueckmeldung - Statuswechsel mit Begruendungspflicht
 * klappen ein Textfeld auf, Freigabe und Uebergabe verlangen einen zweiten
 * Klick. Nichts hiervon versendet eine Nachricht.
 */

const FELD = "h-9 w-full rounded-md border bg-card px-3 text-sm";

// ---------------------------------------------------------------------------
// Statuswechsel
// ---------------------------------------------------------------------------

export function UebergangsKnoepfe({ auftragId, uebergaenge, hervorheben = true }: { auftragId: string; uebergaenge: Uebergang[]; hervorheben?: boolean }) {
  const [offen, setOffen] = useState<string | null>(null);
  if (uebergaenge.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {uebergaenge.map((u) => (
          <UebergangsKnopf key={u.nach} auftragId={auftragId} u={u} offen={offen === u.nach} onOffen={() => setOffen(offen === u.nach ? null : u.nach)} hervorheben={hervorheben} />
        ))}
      </div>
    </div>
  );
}

function UebergangsKnopf({ auftragId, u, offen, onOffen, hervorheben }: { auftragId: string; u: Uebergang; offen: boolean; onOffen: () => void; hervorheben: boolean }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(statusWechselnAction, {});
  const wartend = u.nach === "wartet_auf_unterlagen" || u.nach === "rueckfrage_auftraggeber";
  const destruktiv = u.nach === "abgelehnt" || u.nach === "storniert";
  const brauchtFeld = u.begruendungPflicht || wartend;

  if (!brauchtFeld) {
    return (
      <form action={formAction} className="inline-flex flex-col gap-1">
        <input type="hidden" name="auftragId" value={auftragId} />
        <input type="hidden" name="nach" value={u.nach} />
        {/* Genau EINE Hauptaktion je Seite: Der Vorwaertsschritt traegt die
            Tinte nur, wenn die Seite keine andere Hauptaktion zeigt. */}
        <SubmitButton size="sm" variant={hervorheben && (u.nach === "qualitaetskontrolle" || u.nach === "in_aufbereitung") ? "default" : "outline"} pendingLabel="…">
          {u.label}
        </SubmitButton>
        {state.error && <span className="text-xs text-destructive" role="alert">{state.error}</span>}
      </form>
    );
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <Button type="button" size="sm" variant={destruktiv ? "ghost" : "outline"} onClick={onOffen} className={destruktiv ? "text-destructive" : undefined}>
        {u.label}
      </Button>
      {offen && (
        <form action={formAction} className="w-80 max-w-full space-y-2 rounded-md border bg-card p-3">
          <input type="hidden" name="auftragId" value={auftragId} />
          <input type="hidden" name="nach" value={u.nach} />
          <Label htmlFor={`begr-${u.nach}`} className="text-xs">
            {wartend ? "Was wird erwartet?" : "Begründung"}
          </Label>
          <Textarea id={`begr-${u.nach}`} name={wartend ? "wartegrund" : "begruendung"} rows={3} required={u.begruendungPflicht} />
          <Rueckmeldung state={state} />
          <div className="flex gap-2">
            <SubmitButton size="sm" variant={destruktiv ? "destructive" : "default"} pendingLabel="…">{u.label}</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={onOffen}>Abbrechen</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function UebernehmenKnopf({ auftragId }: { auftragId: string }) {
  return (
    <AktionKnopf aktion={uebernehmenAction.bind(null, auftragId)} variant="default">
      Auftrag übernehmen
    </AktionKnopf>
  );
}

export function PauseSteuerung({ auftragId, pausiert }: { auftragId: string; pausiert: boolean }) {
  const [offen, setOffen] = useState(false);
  if (pausiert) {
    return (
      <AktionKnopf aktion={fortsetzenAction.bind(null, auftragId)} variant="default">
        Fortsetzen
      </AktionKnopf>
    );
  }
  return (
    <div className="inline-flex flex-col gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOffen(!offen)}>Pausieren</Button>
      {offen && (
        <AktionFormular aktion={pausierenAction} felder={{ auftragId }} submitLabel="Pausieren" size="sm" className="w-80 max-w-full rounded-md border bg-card p-3" nebenKnopf={<Button type="button" size="sm" variant="ghost" onClick={() => setOffen(false)}>Abbrechen</Button>}>
          <Label htmlFor="pause-grund" className="text-xs">Grund</Label>
          <Textarea id="pause-grund" name="grund" rows={2} required />
        </AktionFormular>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Qualitaetskontrolle
// ---------------------------------------------------------------------------

export function QualitaetsFormulare({ auftragId, freigabeMoeglich, selbstBearbeiter }: { auftragId: string; freigabeMoeglich: boolean; selbstBearbeiter: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {freigabeMoeglich && (
        <AktionFormular aktion={qualitaetFreigebenAction} felder={{ auftragId }} submitLabel="Freigeben" pendingLabel="Wird freigegeben …" erfolg="Freigabe erteilt.">
          <Label htmlFor="qc-begr" className="text-xs">Anmerkung zur Freigabe (optional)</Label>
          <Textarea id="qc-begr" name="begruendung" rows={3} />
          {selbstBearbeiter && (
            <p className="text-xs text-muted-foreground">
              Vier-Augen-Prinzip: Sie sind selbst Bearbeiter dieses Auftrags. Eine Selbstfreigabe ist nur als Manager möglich und wird im Audit-Log vermerkt.
            </p>
          )}
        </AktionFormular>
      )}
      <AktionFormular aktion={zurNachbearbeitungAction} felder={{ auftragId }} submitLabel="Zur Nachbearbeitung zurückgeben" variant="outline" pendingLabel="…">
        <Label htmlFor="qc-rueck" className="text-xs">Was ist nachzubessern? (Pflicht, bleibt intern)</Label>
        <Textarea id="qc-rueck" name="begruendung" rows={3} required />
      </AktionFormular>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uebergabe - zwei Schritte
// ---------------------------------------------------------------------------

export function UebergabeKnopf({ auftragId, zusammenfassung }: { auftragId: string; zusammenfassung: React.ReactNode }) {
  const [schritt, setSchritt] = useState<1 | 2>(1);
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(uebergebenAction, {});
  if (schritt === 1) {
    return (
      <Button type="button" onClick={() => setSchritt(2)}>
        An Auftraggeber übergeben
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-3 rounded-md border bg-card p-4">
      <input type="hidden" name="auftragId" value={auftragId} />
      <input type="hidden" name="bestaetigt" value="ja" />
      <div className="text-sm font-medium">Was übergeben wird</div>
      {zusammenfassung}
      <Rueckmeldung state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Wird übergeben …">Übergabe bestätigen</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setSchritt(1)}>Abbrechen</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Steuerung (Manager)
// ---------------------------------------------------------------------------

export function SteuerungFormular({
  auftragId,
  bearbeiterId,
  prioritaet,
  faelligAm,
  team,
}: {
  auftragId: string;
  bearbeiterId: string | null;
  prioritaet: BackofficePrioritaet;
  faelligAm: string;
  team: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-4">
      <AktionFormular aktion={zuweisenAction} felder={{ auftragId }} submitLabel="Zuweisen" size="sm" inline erfolg="Zugewiesen.">
        <Label htmlFor="bearbeiterId" className="text-xs">Bearbeiter</Label>
        <select id="bearbeiterId" name="bearbeiterId" defaultValue={bearbeiterId ?? "keiner"} className="h-8 rounded-md border bg-card px-2 text-sm">
          <option value="keiner">Nicht zugewiesen</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </AktionFormular>
      <AktionFormular aktion={steuerungAction} felder={{ auftragId }} submitLabel="Speichern" size="sm" inline erfolg="Gespeichert.">
        <Label htmlFor="prioritaet" className="text-xs">Priorität</Label>
        <select id="prioritaet" name="prioritaet" defaultValue={prioritaet} className="h-8 rounded-md border bg-card px-2 text-sm">
          {BACKOFFICE_PRIORITAETEN.map((p) => (
            <option key={p} value={p}>{BACKOFFICE_PRIORITAET_LABELS[p]}</option>
          ))}
        </select>
        <Label htmlFor="faelligAm" className="text-xs">Frist</Label>
        <Input id="faelligAm" name="faelligAm" type="date" defaultValue={faelligAm} className="h-8 w-40" />
      </AktionFormular>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notizen und Ergebnis
// ---------------------------------------------------------------------------

export function TextFormular({ auftragId, feld, wert, label, hinweis, submitLabel }: { auftragId: string; feld: "interneNotizen" | "ergebnisText"; wert: string | null; label: string; hinweis: string; submitLabel: string }) {
  return (
    <AktionFormular
      aktion={notizenSpeichernAction}
      felder={{ auftragId }}
      submitLabel={submitLabel}
      size="sm"
      variant="outline"
      erfolg="Gespeichert."
    >
      <Label htmlFor={feld} className="text-xs">{label}</Label>
      <Textarea id={feld} name={feld} rows={5} defaultValue={wert ?? ""} />
      <p className="text-xs text-muted-foreground">{hinweis}</p>
    </AktionFormular>
  );
}

// ---------------------------------------------------------------------------
// Rueckfragen
// ---------------------------------------------------------------------------

export interface RueckfrageAnsicht {
  id: string;
  betreff: string;
  frage: string;
  antwort: string | null;
  status: BackofficeRueckfrageStatus;
  gestelltAm: string | null;
  beantwortetAm: string | null;
}

export function RueckfragenKarte({
  auftragId,
  rueckfragen,
  empfaenger,
  darfStellen,
}: {
  auftragId: string;
  rueckfragen: RueckfrageAnsicht[];
  empfaenger: string;
  darfStellen: boolean;
}) {
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const tone: Record<BackofficeRueckfrageStatus, "neutral" | "warning" | "success" | "secondary"> = {
    entwurf: "neutral",
    offen: "warning",
    beantwortet: "success",
    erledigt: "secondary",
  };
  return (
    <div className="space-y-4">
      {rueckfragen.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Rückfragen.</p>}
      {rueckfragen.map((r) => (
        <div key={r.id} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{r.betreff}</div>
            <Badge variant={tone[r.status]}>{BACKOFFICE_RUECKFRAGE_STATUS_LABELS[r.status]}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.frage}</p>
          {r.antwort && (
            <div className="rounded-md bg-accent px-3 py-2 text-sm">
              <div className="text-xs font-medium text-muted-foreground">Antwort des Auftraggebers{r.beantwortetAm ? ` · ${r.beantwortetAm}` : ""}</div>
              <p className="whitespace-pre-wrap">{r.antwort}</p>
            </div>
          )}
          {r.status === "entwurf" && darfStellen && (
            <div className="space-y-2">
              {vorschau === r.id ? (
                <div className="space-y-2 rounded-md border bg-card p-3">
                  <div className="text-xs font-medium text-muted-foreground">Vorschau · Empfänger: {empfaenger}</div>
                  <div className="text-sm font-medium">{r.betreff}</div>
                  <p className="whitespace-pre-wrap text-sm">{r.frage}</p>
                  <p className="text-xs text-muted-foreground">Die Rückfrage wird im Portal des Auftraggebers angezeigt. Es wird keine E-Mail versendet.</p>
                  <AktionFormular aktion={rueckfrageStellenAction} felder={{ auftragId, rueckfrageId: r.id, bestaetigt: "ja" }} submitLabel="Rückfrage stellen" size="sm" nebenKnopf={<Button type="button" size="sm" variant="ghost" onClick={() => setVorschau(null)}>Abbrechen</Button>} />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => setVorschau(r.id)}>Vorschau & stellen</Button>
                  <AktionKnopf aktion={rueckfrageLoeschenAction.bind(null, auftragId, r.id)} variant="ghost">Entwurf löschen</AktionKnopf>
                </div>
              )}
            </div>
          )}
          {(r.status === "offen" || r.status === "beantwortet") && (
            <AktionKnopf aktion={rueckfrageErledigenAction.bind(null, auftragId, r.id)} variant="ghost">Als erledigt markieren</AktionKnopf>
          )}
        </div>
      ))}
      {darfStellen && (
        <div>
          {neu ? (
            <AktionFormular aktion={rueckfrageEntwurfAction} felder={{ auftragId }} submitLabel="Entwurf speichern" size="sm" className="rounded-md border bg-card p-3" nebenKnopf={<Button type="button" size="sm" variant="ghost" onClick={() => setNeu(false)}>Abbrechen</Button>}>
              <Label htmlFor="rf-betreff" className="text-xs">Betreff</Label>
              <Input id="rf-betreff" name="betreff" required className={FELD} />
              <Label htmlFor="rf-frage" className="text-xs">Frage</Label>
              <Textarea id="rf-frage" name="frage" rows={4} required />
            </AktionFormular>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setNeu(true)}>Neue Rückfrage entwerfen</Button>
          )}
        </div>
      )}
    </div>
  );
}
