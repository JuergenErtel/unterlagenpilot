"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { kontaktVersuchErfassen } from "@/lib/actions/case-management";
import { smsLink } from "@/lib/kontakt/telefon";

/** Höchstlänge, die der Vermerk vom (bearbeiteten) Text übernimmt. */
const SMS_VERMERK_MAX = 1000;

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
 *
 * Der Text ist ein Vorschlag aus der Vorlage und hier frei änderbar: Link,
 * Kopierknopf und Vermerk nehmen immer den Text, der gerade im Feld steht.
 *
 * "Verbundenes Handy" ist das per Kurzbefehl verbundene Gerät des Beraters
 * (Geräte-Token). Welches iPhone die Nachrichten-App des Macs tatsächlich
 * benutzt, kann eine Webseite nicht sehen – das Gerät ist der einzige
 * ehrliche Anhaltspunkt, den BaufiDesk hat.
 */
export function SmsNachfassKarte({
  caseId,
  telefon,
  text: vorschlag,
  handy,
}: {
  caseId: string;
  telefon: string;
  text: string;
  handy: { bezeichnung: string; zuletzt: string | null } | null;
}) {
  const [text, setText] = useState(vorschlag);
  const link = smsLink(telefon, text);
  const leer = text.trim().length === 0;

  return (
    <div className="flaeche-ablage space-y-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Nicht erreicht – SMS hinterherschicken?
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" />
        {handy ? (
          <span>
            Verbundenes Handy: <span className="font-medium text-foreground">{handy.bezeichnung}</span>
            {handy.zuletzt && <> · zuletzt genutzt {handy.zuletzt}</>}
          </span>
        ) : (
          <span>
            Kein Handy mit BaufiDesk verbunden – die SMS geht über die Nachrichten-App dieses Geräts.{" "}
            <Link href="/connections" className="underline">
              Handy verbinden
            </Link>
          </span>
        )}
        <span>· an {telefon}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(8, Math.max(3, Math.ceil(text.length / 70) + 1))}
        aria-label="SMS-Text"
        className="w-full resize-y rounded-md border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{text.length} Zeichen</span>
        {text !== vorschlag && (
          <button type="button" className="underline" onClick={() => setText(vorschlag)}>
            Vorschlag wiederherstellen
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {link && !leer ? (
          <Button asChild>
            <a href={link}>
              <MessageSquare className="h-4 w-4" /> SMS schicken
            </a>
          </Button>
        ) : (
          <Button disabled>
            <MessageSquare className="h-4 w-4" /> SMS schicken
          </Button>
        )}
        <CopyButton value={text} label="Text kopieren" />
        <form action={kontaktVersuchErfassen.bind(null, caseId)}>
          <input type="hidden" name="kanal" value="sms" />
          <input type="hidden" name="smsText" value={text.slice(0, SMS_VERMERK_MAX)} />
          <Button type="submit" variant="outline">
            SMS geschrieben
          </Button>
        </form>
      </div>
    </div>
  );
}
