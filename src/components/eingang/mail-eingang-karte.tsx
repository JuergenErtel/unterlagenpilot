"use client";

import { useState, useTransition } from "react";
import { Mail, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { schalteAbsenderFrei, entferneAbsender } from "@/lib/actions/eingang-absender";

export interface AbsenderZeile {
  id: string;
  email: string;
}

/**
 * „Unterlagen per E-Mail weiterleiten" – Adresse zeigen, Absender freischalten.
 *
 * Der Weg: Der Kunde mailt dem Vermittler die Unterlagen; der leitet die Mail
 * an BaufiDesk weiter, die Anhänge warten im Posteingang. Damit das kein
 * offenes Scheunentor ist, nimmt der Eingang nur an, was von einer
 * freigeschalteten Adresse kommt.
 *
 * Deshalb steht die Liste der Absender direkt UNTER der Adresse und nicht auf
 * einer Unterseite: Wer von einem zweiten Postfach weiterleitet, ohne es
 * freigeschaltet zu haben, bekommt keine Fehlermeldung – seine Mail
 * verschwindet einfach. Das muss man an derselben Stelle lesen können, an der
 * man die Adresse abschreibt.
 */
export function MailEingangKarte({
  adresse,
  anmeldeAdresse,
  absender,
}: {
  /** null, solange das Postfach nicht eingerichtet ist. */
  adresse: string | null;
  /** Die Login-Adresse – immer freigeschaltet, nie löschbar. */
  anmeldeAdresse: string;
  absender: AbsenderZeile[];
}) {
  const [neu, setNeu] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Unterlagen per E-Mail weiterleiten</CardTitle>
            </div>
            <CardDescription className="max-w-2xl">
              Schickt der Kunde die Unterlagen per Mail? Leite sie an diese
              Adresse weiter – die Anhänge warten wenige Minuten später im
              Posteingang, und du ordnest sie am Bildschirm mit einem Klick dem
              Fall zu.
            </CardDescription>
          </div>
          <StatusDot tone={adresse ? "ready" : "neutral"} className="mt-1.5 shrink-0" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {adresse ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">{adresse}</code>
            <CopyButton value={adresse} label="Adresse kopieren" />
          </div>
        ) : (
          <div className="flaeche-warnung rounded-md p-3 text-sm">
            <p className="font-medium">Das Postfach steht noch nicht.</p>
            <p className="t-hilfe mt-1">
              Sobald es eingerichtet ist, erscheint die Adresse hier. Bis dahin
              führt der Weg über den Apple-Kurzbefehl oder den Upload im Fall.
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h4 className="text-sm font-medium">Von diesen Adressen nehme ich an</h4>
          </div>
          <p className="t-hilfe text-xs">
            Alles andere wird verworfen – sonst könnte jeder Fremde Dateien in
            deinen Posteingang legen. Trägst du deine zweite Adresse hier
            <strong> nicht</strong> ein, verschwindet ihre Mail kommentarlos.
          </p>

          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{anmeldeAdresse}</span>
              <Badge variant="secondary" className="shrink-0">
                Anmeldeadresse
              </Badge>
            </li>
            {absender.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex-1 truncate font-mono text-xs">{a.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setMeldung(null);
                      await entferneAbsender(a.id);
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{a.email} entfernen</span>
                </Button>
              </li>
            ))}
          </ul>

          <form
            className="flex flex-wrap gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                setMeldung(null);
                const r = await schalteAbsenderFrei(neu);
                if (r.ok) setNeu("");
                setMeldung(r.meldung ?? null);
              });
            }}
          >
            <Input
              type="email"
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              placeholder="weitere@adresse.de"
              className="w-full sm:w-72"
              aria-label="Weitere Absenderadresse freischalten"
            />
            <Button type="submit" variant="outline" disabled={pending || !neu.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Freischalten
            </Button>
          </form>
          {meldung && <p className="text-xs text-destructive">{meldung}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
