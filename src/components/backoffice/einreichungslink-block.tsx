"use client";

import { useActionState, useState, useTransition } from "react";
import {
  einreichungsLinkDeaktivierenAction,
  einreichungsLinkErzeugenAction,
  einreichungsLinkSendenAction,
  type EinreichungsLinkVersandStand,
} from "@/lib/actions/backoffice";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EinreichungsLinkStandAnzeige {
  aktiv: boolean;
  seit: string | null;
  zuletztGenutzt: string | null;
  einreichungen: number;
}

/** Ein moeglicher Empfaenger: Kontakt des Auftraggebers oder dessen Firmenadresse. */
export interface EinreichungsLinkEmpfaenger {
  name: string;
  email: string;
}

const ANDERE = "__andere__";

function datum(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function LinkAnzeige({ url, hinweis }: { url: string; hinweis: string }) {
  return (
    <div className="space-y-1.5 rounded-md border border-ai/30 bg-ai/[0.05] p-3">
      <p className="text-xs font-medium">{hinweis}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton value={url} label="Link kopieren" />
      </div>
    </div>
  );
}

/**
 * Manager-Block "Einreichungslink" auf der Auftraggeberseite.
 *
 * Zwei Wege, beide vom Manager ausgeloest: Link erzeugen und von Hand
 * weitergeben (Klartext erscheint genau einmal), oder Link erzeugen und per
 * Mail an einen Kontakt des Auftraggebers schicken. Beides ist ein Erneuern –
 * der Klartext liegt nirgends, also gibt es kein "nochmal senden" ohne neuen
 * Link. Automatisch versendet wird nie.
 */
export function EinreichungslinkBlock({
  auftraggeberId,
  stand,
  empfaenger,
}: {
  auftraggeberId: string;
  stand: EinreichungsLinkStandAnzeige;
  empfaenger: EinreichungsLinkEmpfaenger[];
}) {
  const [state, formAction] = useActionState(einreichungsLinkErzeugenAction, {} as { url?: string; error?: string });
  const [versand, versandAction] = useActionState(einreichungsLinkSendenAction, {} as EinreichungsLinkVersandStand);
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigeVersand, setZeigeVersand] = useState(false);
  const [wahl, setWahl] = useState<string>(empfaenger[0]?.email ?? ANDERE);

  const gewaehlt = empfaenger.find((e) => e.email === wahl) ?? null;

  return (
    <div className="space-y-3 text-sm">
      {stand.aktiv ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Aktiv seit</dt>
          <dd>{datum(stand.seit)}</dd>
          <dt className="text-muted-foreground">Zuletzt genutzt</dt>
          <dd>{datum(stand.zuletztGenutzt)}</dd>
          <dt className="text-muted-foreground">Einreichungen</dt>
          <dd>{stand.einreichungen}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">Kein aktiver Link.</p>
      )}

      {state.url && <LinkAnzeige url={state.url} hinweis="Nur jetzt sichtbar. Kopieren und dem Auftraggeber persönlich geben." />}

      {versand.gesendetAn && (
        <div className="space-y-2">
          {versand.versandFehler ? (
            <p role="alert" className="text-xs text-destructive">
              Der Link wurde erneuert, aber die Mail an {versand.gesendetAn} kam nicht raus: {versand.versandFehler}
            </p>
          ) : (
            <p className="text-xs font-medium text-success">Link per E-Mail an {versand.gesendetAn} gesendet.</p>
          )}
          {versand.url && (
            <LinkAnzeige
              url={versand.url}
              hinweis={versand.versandFehler ? "Hier ist der Link zum Weitergeben von Hand." : "Derselbe Link, falls du ihn zusätzlich von Hand weitergeben willst."}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="auftraggeberId" value={auftraggeberId} />
          <SubmitButton size="sm" variant="outline" pendingLabel="Wird erzeugt …">
            {stand.aktiv ? "Link erneuern" : "Link erzeugen"}
          </SubmitButton>
        </form>
        <Button type="button" size="sm" variant={zeigeVersand ? "outline" : "default"} onClick={() => setZeigeVersand((v) => !v)}>
          Per E-Mail senden
        </Button>
        {stand.aktiv && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={laeuft}
            onClick={() => {
              if (!window.confirm("Einreichungslink deaktivieren? Der Auftraggeber kann darüber dann nichts mehr einreichen.")) return;
              starte(async () => {
                const r = await einreichungsLinkDeaktivierenAction(auftraggeberId);
                setFehler(r.error ?? null);
              });
            }}
          >
            Deaktivieren
          </Button>
        )}
      </div>

      {zeigeVersand && (
        <form action={versandAction} className="space-y-3 rounded-md border p-3">
          <input type="hidden" name="auftraggeberId" value={auftraggeberId} />
          <div className="space-y-1.5">
            <Label htmlFor="einreichung-empfaenger">Empfänger</Label>
            {empfaenger.length > 0 ? (
              <select
                id="einreichung-empfaenger"
                value={wahl}
                onChange={(e) => setWahl(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {empfaenger.map((e) => (
                  <option key={e.email} value={e.email}>
                    {e.name} – {e.email}
                  </option>
                ))}
                <option value={ANDERE}>Andere Adresse …</option>
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">Der Auftraggeber hat noch keinen Kontakt mit E-Mail-Adresse.</p>
            )}
            {gewaehlt ? (
              <>
                <input type="hidden" name="empfaengerEmail" value={gewaehlt.email} />
                <input type="hidden" name="empfaengerName" value={gewaehlt.name} />
              </>
            ) : (
              <Input name="empfaengerEmail" type="email" required placeholder="name@vermittler.de" autoComplete="off" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="einreichung-notiz">Persönliche Zeile (optional)</Label>
            <Textarea id="einreichung-notiz" name="notiz" rows={2} maxLength={1000} placeholder="Wie besprochen – melden Sie sich bei Fragen gern direkt bei mir." />
          </div>
          <p className="text-xs text-muted-foreground">
            {stand.aktiv
              ? "Beim Senden wird ein neuer Link erzeugt; der bisherige wird sofort ungültig."
              : "Die Mail erklärt dem Auftraggeber, wie die Einreichung abläuft. Absender ist dein Backoffice, Antworten gehen an dich."}
          </p>
          <SubmitButton size="sm" pendingLabel="Wird gesendet …">
            Link erzeugen und senden
          </SubmitButton>
        </form>
      )}

      {stand.aktiv && state.url == null && !zeigeVersand && (
        <p className="text-xs text-muted-foreground">Erneuern ersetzt den bestehenden Link; der alte wird sofort ungültig.</p>
      )}
      {(state.error || versand.error || fehler) && (
        <p role="alert" className="text-xs text-destructive">
          {state.error ?? versand.error ?? fehler}
        </p>
      )}
    </div>
  );
}
