import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { kontaktVersuchErfassen } from "@/lib/actions/case-management";

/**
 * Nach einem erfolglosen Anruf: die fertige SMS zum Hinterherschicken.
 *
 * Eine eigene Karte, nicht Teil der `KontaktKnopfreihe`: Die Reihe hängt am
 * Leiterschritt "Kunden anrufen", und der verschwindet nach "Nicht erreicht"
 * bis zum nächsten fälligen Versuch – ein SMS-Knopf darin wäre direkt nach
 * dem Klick weg gewesen.
 *
 * BaufiDesk verschickt nichts: "SMS schicken" öffnet die Nachrichten-App mit
 * Nummer und Text, abgeschickt wird dort. Ob der Mac den Text übernimmt,
 * hängt an der macOS-Version – dafür steht "Text kopieren" daneben.
 */
export function SmsNachfassKarte({ caseId, link, text }: { caseId: string; link: string; text: string }) {
  return (
    <div className="flaeche-ablage space-y-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Nicht erreicht – SMS hinterherschicken?
      </div>
      <p className="whitespace-pre-line break-words rounded-md border bg-card px-3 py-2 text-sm">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={link}>
            <MessageSquare className="h-4 w-4" /> SMS schicken
          </a>
        </Button>
        <CopyButton value={text} label="Text kopieren" />
        <form action={kontaktVersuchErfassen.bind(null, caseId)}>
          <input type="hidden" name="kanal" value="sms" />
          <Button type="submit" variant="outline">
            SMS geschrieben
          </Button>
        </form>
      </div>
    </div>
  );
}
