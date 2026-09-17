import Link from "next/link";
import { Smartphone, Mail, Inbox, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

/**
 * „Liegen die Unterlagen woanders?" – die beiden Wege neben dem Hochladen.
 *
 * EIN Baustein für Fallakte und Sortierer. Beide stellen dieselbe Frage an
 * derselben Stelle des Wegs, und zwei Kopien wären genau die Art von Dopplung,
 * bei der eine Hälfte später stehenbleibt.
 *
 * Beide Wege enden im Posteingang, nicht direkt hier. Das ist Absicht: Das
 * Ziel wird am Bildschirm gewählt, wo die Liste ohnehin vorliegt – dieselbe
 * Entscheidung wie beim Apple-Kurzbefehl.
 */
export function AndereWege({
  /** Hat der Nutzer schon ein Gerät verbunden (Apple-Kurzbefehl)? */
  geraetVerbunden,
  /** Wie viele Dateien warten gerade im Posteingang? */
  wartendImPosteingang,
  /** Adresse des Mail-Eingangs, oder null, solange das Postfach fehlt. */
  mailAdresse,
  /** Überschrift – je nach Ort etwas anderes passend. */
  titel = "Liegen die Unterlagen woanders?",
}: {
  geraetVerbunden: boolean;
  wartendImPosteingang: number;
  mailAdresse: string | null;
  titel?: string;
}) {
  return (
    <div className="space-y-3">
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
            <span className="text-muted-foreground">– noch nicht zugeordnet.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}

      <div>
        <h3 className="eyebrow mb-2">{titel}</h3>
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
              <Button asChild variant="outline" size="sm">
                <Link href={geraetVerbunden ? "/eingang" : "/connections"}>
                  {geraetVerbunden ? "Zum Posteingang" : "Kurzbefehl einrichten"}
                </Link>
              </Button>
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
