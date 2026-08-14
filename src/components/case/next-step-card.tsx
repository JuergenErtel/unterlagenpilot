import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Phone, PhoneCall, CalendarClock, Sparkles, AlertTriangle, ScanSearch, UserRound, Send, Mail, ClipboardList, ClipboardCheck, PackageCheck, FileSearch, Scale, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { NextStep } from "@/lib/cases/next-step";
import { kontaktVersuchErfassen } from "@/lib/actions/case-management";
import { telLink, waLink } from "@/lib/kontakt/telefon";

const ICON: Record<NextStep["key"], typeof Sparkles> = {
  ki_laeuft: Sparkles,
  ki_fehler: AlertTriangle,
  erstkontakt_email_fehlt: UserRound,
  erstkontakt_vorbereiten: Mail,
  erstkontakt_entwurf: Send,
  // Telefonhoerer, nicht Klemmbrett: Das Erstgespraech ist ein Anruf, kein
  // Formular. Seit der Nachbesserung vom 14.08.2026 ist kontakt_aufnehmen die
  // eigentliche erste Aufgabe nach dem Leadeingang, das Erstgespraech folgt
  // erst danach.
  erstgespraech: PhoneCall,
  kontakt_aufnehmen: PhoneCall,
  wiedervorlage_faellig: CalendarClock,
  selbstauskunft_eingegangen: ClipboardCheck,
  selbstauskunft_wartet: ClipboardList,
  dokumente_freigeben: ScanSearch,
  kundendaten: UserRound,
  kritische_hinweise: AlertTriangle,
  machbarkeit: Scale,
  unterlagen_luecken: FileSearch,
  unterlagen_anfordern: Send,
  fristen: ClipboardList,
  erledigt: CheckCircle2,
  einreichung: PackageCheck,
};

/**
 * Die eine, unübersehbare Antwort auf „Was muss ich jetzt tun?“ – steht ganz
 * oben auf der Fallseite. `actionSlot` erlaubt Schritte, deren Aktion keine
 * Navigation ist (KI-Prüfung wiederholen = Server-Action-Form, KI läuft =
 * Fortschrittsanzeige).
 *
 * `caseId`/`telefon` sind optional, weil der Review-Abschluss dieselbe Karte
 * ohne Fallbezug zeigt (`review/page.tsx`) – die Kontaktknöpfe brauchen
 * beide, um `kontaktVersuchErfassen` zu binden, und bleiben ohne `caseId`
 * einfach weg statt mit einer kaputten Aktion zu rendern.
 */
export function NextStepCard({
  step,
  actionSlot,
  caseId,
  telefon = null,
}: {
  step: NextStep;
  actionSlot?: ReactNode;
  caseId?: string;
  telefon?: string | null;
}) {
  const tone = TONE[step.tone];
  const Icon = ICON[step.key];
  // Hervorgehoben heisst: groesseres Zeichen, groessere Zeile, kraeftigerer
  // Rahmen – dieselbe Karte, nur lauter. Kein zweites Kartenlayout, sonst
  // laufen die beiden beim naechsten Umbau auseinander.
  const laut = step.hervorgehoben === true;
  // Im Zweifel lieber KEIN Link (siehe telefon.ts) – beide koennen null sein.
  const anrufLink = telLink(telefon);
  const whatsappLink = waLink(telefon);
  return (
    <Card className={cn("border-2", tone.border, tone.bg, laut && "shadow-md")}>
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border-2 bg-card",
            tone.border,
            laut ? "h-14 w-14" : "h-11 w-11"
          )}
        >
          <Icon className={cn(tone.text, laut ? "h-7 w-7" : "h-5 w-5")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nächster Schritt</div>
          <div className={cn("font-semibold leading-snug", laut ? "text-xl" : "text-lg")}>{step.title}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{step.reason}</p>
          {/* Die drei Knöpfe des Anrufs: erreicht / nicht erreicht /
              WhatsApp geschrieben, dazu Wähl- und wa.me-Link, wenn eine
              Nummer da ist. BaufiDesk verschickt nichts – geschrieben wird
              in WhatsApp vom Vermittler, der Knopf haelt nur fest, dass es
              passiert ist. Kein eigener Verlust-Dialog hier: den gibt es im
              Board bereits (`LossDialog`), der Abbruchvorschlag steht seit
              der Nachbesserung vom 14.08.2026 nur noch in "Wartet
              außerdem" (kontakt_aufgeben als Hauptschritt haette Faelle
              dauerhaft festgehalten). */}
          {step.key === "kontakt_aufnehmen" && caseId && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {anrufLink && (
                <Button asChild variant="default">
                  <a href={anrufLink}>
                    <Phone className="h-4 w-4" /> Anrufen
                  </a>
                </Button>
              )}
              <form action={kontaktVersuchErfassen.bind(null, caseId)}>
                <input type="hidden" name="kanal" value="telefon" />
                <input type="hidden" name="ergebnis" value="erreicht" />
                <Button type="submit" variant="outline">
                  Erreicht
                </Button>
              </form>
              <form action={kontaktVersuchErfassen.bind(null, caseId)}>
                <input type="hidden" name="kanal" value="telefon" />
                <input type="hidden" name="ergebnis" value="nicht_erreicht" />
                <Button type="submit" variant="outline">
                  Nicht erreicht
                </Button>
              </form>
              {whatsappLink && (
                <>
                  <Button asChild variant="ghost">
                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                      WhatsApp öffnen
                    </a>
                  </Button>
                  <form action={kontaktVersuchErfassen.bind(null, caseId)}>
                    <input type="hidden" name="kanal" value="whatsapp" />
                    <input type="hidden" name="ergebnis" value="nicht_erreicht" />
                    <Button type="submit" variant="ghost">
                      WhatsApp geschrieben
                    </Button>
                  </form>
                </>
              )}
            </div>
          )}
          {/* Nach "Erreicht" ist die naechste Frage immer dieselbe: wann
              wieder anfassen? Laeuft ueber dieselbe Aktion wie die
              Kontaktknoepfe oben – ein leeres Datumsfeld setzt keine
              Wiedervorlage, `kontaktVersuchErfassen` ignoriert es dann. */}
          {step.key === "erstgespraech" && caseId && (
            <form action={kontaktVersuchErfassen.bind(null, caseId)} className="mt-3 flex items-end gap-2">
              <input type="hidden" name="kanal" value="telefon" />
              <input type="hidden" name="ergebnis" value="erreicht" />
              <div className="space-y-1">
                <Label htmlFor="wv" className="text-xs">
                  Wiedervorlage
                </Label>
                <Input id="wv" type="date" name="wiedervorlage" className="h-9 w-40" />
              </div>
              <Button type="submit" variant="outline" size="sm">
                Merken
              </Button>
            </form>
          )}
          {/* Verdrängte Schritte: als Zeile, nicht als zweiter Knopf – sonst
              stünden zwei Hauptaktionen nebeneinander und die Leiter verlöre
              ihren Sinn. */}
          {step.wartet && step.wartet.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Wartet außerdem
              </span>
              {step.wartet.map((w) => (
                <Link
                  key={`${w.href}|${w.label}`}
                  href={w.href}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-ai/40 bg-card px-3 py-1 text-sm font-medium text-foreground transition-colors hover:border-ai hover:bg-ai/10"
                >
                  <ScanSearch className="h-3.5 w-3.5 text-ai" />
                  {w.label}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          {actionSlot}
          {step.cta && (
            <Button asChild size="lg" className="justify-center">
              <Link href={step.cta.href}>
                {step.cta.label}
                <ArrowRight />
              </Link>
            </Button>
          )}
          {step.secondary?.map((s) => (
            <Button key={`${s.href}|${s.label}`} asChild variant="outline" size="sm" className="justify-center">
              <Link href={s.href}>{s.label}</Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
