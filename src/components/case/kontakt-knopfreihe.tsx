import { useId } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { kontaktVersuchErfassen } from "@/lib/actions/case-management";
import { telLink, waLink } from "@/lib/kontakt/telefon";

/**
 * Die Handlungsknöpfe des Schritts "Kunden anrufen" – EINE Definition, ZWEI
 * Einbauorte (`NextStepCard` für schmale Schirme, `FallbildAnsicht` ab der
 * `lg`-Breite). Ohne diese Bündelung wäre die Zeile zweimal von Hand gebaut
 * worden und beim nächsten Umbau leicht auseinandergelaufen – genau der
 * Fehler, der die Knöpfe ursprünglich nur auf dem schmalen Schirm zeigte
 * (Controller-Korrektur vom 14.08.2026).
 *
 * `useId()` sorgt dafür, dass beide gleichzeitig im DOM stehenden Instanzen
 * (nur CSS blendet die eine oder andere aus, siehe `page.tsx`) kein
 * doppeltes `id`/`htmlFor`-Paar für das Datumsfeld erzeugen.
 *
 * BaufiDesk verschickt nichts: Der WhatsApp-Link öffnet WhatsApp mit der
 * richtigen Nummer, geschrieben wird dort vom Vermittler. "Erreicht",
 * "Nicht erreicht" und "WhatsApp geschrieben" halten nur fest, dass etwas
 * passiert ist.
 *
 * Die Wiedervorlage sitzt IM "Erreicht"-Formular, nicht daneben: Ein
 * eigenes Formular hätte bei jedem Klick zusätzlich "Telefonisch erreicht."
 * vermerkt, auch wenn nur ein Datum gesetzt werden sollte (derselbe Fehler,
 * den der Entwurf mit "bei erreicht fragt die Karte direkt nach einer
 * Wiedervorlage" bereits ausschloss). Das Feld bleibt optional: "Erreicht"
 * ohne Datum geht weiterhin mit einem Klick und setzt keine Wiedervorlage
 * (`kontaktVersuchErfassen` liest ein leeres Feld als "nichts angegeben").
 */
export function KontaktKnopfreihe({ caseId, telefon }: { caseId: string; telefon: string | null }) {
  const wiedervorlageId = useId();
  // Im Zweifel lieber KEIN Link (siehe telefon.ts) – beide koennen null sein.
  const anrufLink = telLink(telefon);
  const whatsappLink = waLink(telefon);

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/*
        Die Nummer steht IMMER lesbar da – auf dem Desktop ist sie sogar die
        einzige Anrufhilfe.
        Grund (Jürgen, 15.08.2026): Ein `tel:`-Link reicht die Nummer nur ans
        Betriebssystem weiter, und am Mac landet sie bei FaceTime. Wer das
        nicht eingerichtet hat, klickt auf einen Knopf, der nichts tut – und
        sah bisher nicht einmal die Nummer, um sie von Hand zu wählen. Auf dem
        Handy dagegen öffnet derselbe Link die Telefon-App, dort ist er das
        Bequemste. Deshalb: Zahl plus Kopierknopf überall, der Wähl-Link nur
        auf schmalen Schirmen.
      */}
      {telefon && telefon.trim() !== "" && (
        <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
          <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium tabular-nums">{telefon}</span>
          <CopyButton value={telefon} label="Kopieren" />
        </span>
      )}
      {anrufLink && (
        <Button asChild variant="default" className="md:hidden">
          <a href={anrufLink}>
            <Phone className="h-4 w-4" /> Anrufen
          </a>
        </Button>
      )}
      <form action={kontaktVersuchErfassen.bind(null, caseId)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="kanal" value="telefon" />
        <input type="hidden" name="ergebnis" value="erreicht" />
        <div className="space-y-1">
          <Label htmlFor={wiedervorlageId} className="text-xs">
            Wiedervorlage (optional)
          </Label>
          <Input id={wiedervorlageId} type="date" name="wiedervorlage" className="h-9 w-40" />
        </div>
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
  );
}
