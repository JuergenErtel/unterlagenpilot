import Link from "next/link";
import { Mail, Send, CheckCircle2, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { type ErstkontaktStand } from "@/lib/actions/erstkontakt-actions";
import { ErstkontaktVorbereitenButton } from "@/components/case/erstkontakt-vorbereiten-button";

/**
 * Der eine Klick, der den Erstkontakt zu einem neuen Fall in Gang setzt.
 *
 * Bewusst OHNE Sende-Knopf: Sobald ein Entwurf bereitliegt, verlinkt die
 * Karte nur auf die Nachrichtenseite des Falls, wo der fertige Text steht
 * und der vorhandene Sende-Knopf sitzt (`sendMessageByEmail` in
 * `src/lib/actions/messages.ts`, samt Versandsperre und
 * Doppelklick-Sicherung). Ein zweiter Versandweg hier waere eine zweite
 * Stelle, an der diese Sicherungen vergessen werden koennten.
 */
export function ErstkontaktKarte({ caseId, stand }: { caseId: string; stand: ErstkontaktStand }) {
  const tone = stand.versendet ? TONE.ready : stand.messageId ? TONE.review : TONE.neutral;
  const Icon = stand.versendet ? CheckCircle2 : stand.messageId ? Send : stand.empfaenger ? Mail : UserRound;

  return (
    <Card className={cn("border-2", tone.border, tone.bg)}>
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-card",
            tone.border
          )}
        >
          <Icon className={cn("h-5 w-5", tone.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Erstkontakt
          </div>

          {stand.versendet ? (
            <>
              <div className="text-lg font-semibold leading-snug">Erstkontakt versendet</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {stand.versendetAm ? (
                  <>Am {stand.versendetAm.toLocaleDateString("de-DE")} an{" "}</>
                ) : (
                  "An "
                )}
                <span className="font-medium text-foreground">{stand.empfaenger}</span> gesendet.
              </p>
            </>
          ) : stand.messageId ? (
            <>
              <div className="text-lg font-semibold leading-snug">Entwurf liegt bereit</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Wird gesendet an{" "}
                <span className="text-base font-semibold text-foreground">{stand.empfaenger}</span>
              </p>
            </>
          ) : stand.empfaenger ? (
            <>
              <div className="text-lg font-semibold leading-snug">Erstkontakt noch nicht vorbereitet</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Erzeugt Upload-Link, Selbstauskunfts-Link und eine fertige Nachricht — verschickt noch
                nichts.
              </p>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold leading-snug">Noch keine E-Mail-Adresse hinterlegt</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Für diesen Fall ist noch keine E-Mail-Adresse hinterlegt. Bitte in den Kundendaten
                ergänzen.
              </p>
            </>
          )}
        </div>

        {!stand.versendet && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            {stand.messageId ? (
              <Button asChild size="lg" className="justify-center">
                <Link href={`/cases/${caseId}/messages`}>
                  <Send />
                  Prüfen und senden
                </Link>
              </Button>
            ) : stand.empfaenger ? (
              <ErstkontaktVorbereitenButton caseId={caseId} />
            ) : (
              <Button asChild variant="outline" size="lg" className="justify-center">
                <Link href={`/cases/${caseId}/edit`}>
                  <UserRound />
                  Kundendaten bearbeiten
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
