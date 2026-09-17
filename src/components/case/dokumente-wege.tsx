import Link from "next/link";
import { Smartphone, Mail, Inbox, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { BrokerUploadForm, type BrokerUploadApplicant } from "@/components/case/broker-upload-form";

/**
 * Die drei Wege, auf denen Unterlagen in die Akte kommen.
 *
 * Der Anlass: Juergen bekommt die Unterlagen vom Kunden fast nie als Datei am
 * Rechner, sondern per WhatsApp aufs Handy oder per Mail ins Postfach. Beide
 * Wege gab es (Kurzbefehl) oder gibt es neu (Mail-Eingang) - aber an der
 * Stelle, an der man ans Hochladen denkt, stand nur das Dateifeld. Wer den
 * anderen Weg nicht kennt, laedt herunter und wieder hoch.
 *
 * Deshalb stehen sie hier nebeneinander, und die beiden Nebenwege sind
 * bewusst klein: Sie erklaeren sich in einem Satz und tragen genau einen Link.
 * Vgl. [[unsichtbare-aktionen-durch-ueberlauf]] - ein Weg, den man nicht
 * sieht, existiert nicht.
 *
 * Beide Nebenwege enden im Posteingang (/eingang), nicht direkt in dieser
 * Akte. Das ist Absicht und kein Mangel: Der Fall wird am Bildschirm gewaehlt,
 * wo die Liste ohnehin vor einem liegt - dieselbe Entscheidung wie beim
 * Kurzbefehl (siehe eingang/service.ts).
 */
export function DokumenteWege({
  caseId,
  maxMb,
  applicants,
  geraetVerbunden,
  wartendImPosteingang,
  mailAdresse,
}: {
  caseId: string;
  maxMb: number;
  applicants: BrokerUploadApplicant[];
  /** Hat der Nutzer schon einen Apple-Kurzbefehl eingerichtet? */
  geraetVerbunden: boolean;
  /** Wie viele Dateien warten gerade im Posteingang auf eine Zuordnung? */
  wartendImPosteingang: number;
  /** Adresse des Mail-Eingangs, oder null, solange das Postfach fehlt. */
  mailAdresse: string | null;
}) {
  return (
    <div className="space-y-4">
      <BrokerUploadForm caseId={caseId} maxMb={maxMb} applicants={applicants} />

      {wartendImPosteingang > 0 && (
        <Link
          href="/eingang"
          className="flaeche-oben flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent/60"
        >
          <Inbox className="h-4 w-4 shrink-0 text-ai" aria-hidden />
          <span className="flex-1">
            <span className="font-medium">
              {wartendImPosteingang}{" "}
              {wartendImPosteingang === 1 ? "Datei wartet" : "Dateien warten"} im Posteingang
            </span>{" "}
            <span className="text-muted-foreground">
              – vom Handy geteilt oder per Mail geschickt, noch keinem Fall zugeordnet.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}

      <div>
        <h3 className="eyebrow mb-2">Liegen die Unterlagen woanders?</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Weg
            icon={Smartphone}
            titel="Per WhatsApp schicken"
            text={
              geraetVerbunden
                ? "Auf dem Handy in WhatsApp lange auf das Dokument tippen → Teilen → „An BaufiDesk“. Es wartet dann im Posteingang."
                : "Bekommst du Unterlagen per WhatsApp aufs Handy? Mit dem Apple-Kurzbefehl teilst du sie direkt an BaufiDesk."
            }
            aktion={
              geraetVerbunden ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/eingang">Zum Posteingang</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href="/connections">Kurzbefehl einrichten</Link>
                </Button>
              )
            }
          />
          <Weg
            icon={Mail}
            titel="Per E-Mail schicken"
            text={
              mailAdresse
                ? "Leite die Kundenmail an diese Adresse weiter – die Anhänge warten wenige Minuten später im Posteingang."
                : "Kundenmails an BaufiDesk weiterleiten – der Weg ist vorbereitet, das Postfach fehlt noch."
            }
            aktion={
              mailAdresse ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                    {mailAdresse}
                  </code>
                  <CopyButton value={mailAdresse} />
                </div>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href="/connections">Einrichten</Link>
                </Button>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

function Weg({
  icon: Icon,
  titel,
  text,
  aktion,
}: {
  icon: typeof Smartphone;
  titel: string;
  text: string;
  aktion: React.ReactNode;
}) {
  return (
    <div className="flaeche-ablage flex flex-col gap-2 rounded-md p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{titel}</span>
      </div>
      <p className="t-hilfe flex-1 text-xs">{text}</p>
      <div className="flex min-w-0">{aktion}</div>
    </div>
  );
}
