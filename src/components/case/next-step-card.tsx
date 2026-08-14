import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, PhoneCall, Sparkles, AlertTriangle, ScanSearch, UserRound, Send, Mail, ClipboardList, ClipboardCheck, PackageCheck, FileSearch, Scale, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { NextStep } from "@/lib/cases/next-step";

const ICON: Record<NextStep["key"], typeof Sparkles> = {
  ki_laeuft: Sparkles,
  ki_fehler: AlertTriangle,
  erstkontakt_email_fehlt: UserRound,
  erstkontakt_vorbereiten: Mail,
  erstkontakt_entwurf: Send,
  // Telefonhoerer, nicht Klemmbrett: Das Erstgespraech ist ein Anruf, kein
  // Formular – und es ist die erste Aufgabe nach dem Leadeingang.
  erstgespraech: PhoneCall,
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
 */
export function NextStepCard({ step, actionSlot }: { step: NextStep; actionSlot?: ReactNode }) {
  const tone = TONE[step.tone];
  const Icon = ICON[step.key];
  // Hervorgehoben heisst: groesseres Zeichen, groessere Zeile, kraeftigerer
  // Rahmen – dieselbe Karte, nur lauter. Kein zweites Kartenlayout, sonst
  // laufen die beiden beim naechsten Umbau auseinander.
  const laut = step.hervorgehoben === true;
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
