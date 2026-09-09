"use client";

import { useState, useTransition } from "react";
import { Loader2, Smartphone, Trash2, ShieldAlert } from "lucide-react";
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
import { erzeugeGeraeteToken, widerrufeGeraeteToken } from "@/lib/actions/geraete";

export interface GeraetZeile {
  id: string;
  bezeichnung: string;
  /** Fertig formatiert – der Server rechnet die Zeitzone, nicht der Browser. */
  zuletztBenutzt: string | null;
}

/**
 * „Dokumente vom iPhone teilen" – Geraete verbinden und wieder loesen.
 *
 * Das Klartext-Token erscheint genau einmal, direkt nach dem Erzeugen. Es
 * bleibt danach sichtbar stehen, bis der Nutzer die Karte verlaesst: Wer es in
 * den Kurzbefehl eintippt, braucht es waehrend der ganzen Einrichtung – ein
 * Dialog, der nach dem Kopieren zuklappt, waere hier eine Falle.
 */
export function KurzbefehlKarte({
  geraete,
  basisUrl,
}: {
  geraete: GeraetZeile[];
  basisUrl: string;
}) {
  const [name, setName] = useState("");
  const [neuesToken, setNeuesToken] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Dokumente vom iPhone teilen</CardTitle>
            </div>
            <CardDescription className="max-w-2xl">
              Bekommst du Unterlagen per WhatsApp oder Mail aufs Handy? Teile sie
              mit zwei Fingertipps an BaufiDesk – sie warten dann im Posteingang,
              und du ordnest sie am Bildschirm mit einem Klick dem Fall zu.
            </CardDescription>
          </div>
          <Badge variant={geraete.length > 0 ? "success" : "neutral"} className="shrink-0">
            {geraete.length > 0 ? `${geraete.length} verbunden` : "Nicht eingerichtet"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        {/* Verbundene Geraete */}
        {geraete.length > 0 && (
          <div className="space-y-2">
            {geraete.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
              >
                <StatusDot tone="ready" />
                <span className="font-medium">{g.bezeichnung}</span>
                <span className="text-xs text-muted-foreground">
                  {g.zuletztBenutzt ? `zuletzt genutzt am ${g.zuletztBenutzt}` : "noch nicht genutzt"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await widerrufeGeraeteToken(g.id);
                      setMeldung(`„${g.bezeichnung}" ist getrennt. Der Kurzbefehl auf dem Gerät funktioniert ab sofort nicht mehr.`);
                    })
                  }
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Trennen
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Neues Geraet */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <label htmlFor="geraetname" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gerät verbinden
            </label>
            <Input
              id="geraetname"
              value={name}
              placeholder="iPhone von Jürgen"
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await erzeugeGeraeteToken(name);
                if (r.ok && r.token) {
                  setNeuesToken(r.token);
                  setName("");
                  setMeldung(null);
                } else {
                  setMeldung(r.meldung ?? "Das hat nicht geklappt.");
                }
              })
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Schlüssel erzeugen
          </Button>
        </div>

        {meldung && <p className="text-xs text-muted-foreground">{meldung}</p>}

        {/* Das Token – genau einmal sichtbar */}
        {neuesToken && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
              Dein Schlüssel – wird nur jetzt angezeigt
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{neuesToken}</code>
              <CopyButton value={neuesToken} label="Kopieren" />
            </div>
            <p className="text-xs text-muted-foreground">
              Er ist so wertvoll wie dein Passwort: Wer ihn hat, kann Dateien in
              deine Fälle laden. Nach dem Verlassen dieser Seite lässt er sich
              nicht wieder anzeigen – dann erzeugst du einfach einen neuen und
              trennst das alte Gerät.
            </p>
          </div>
        )}

        <Separator />

        <Anleitung basisUrl={basisUrl} />
      </CardContent>
    </Card>
  );
}

/**
 * Einrichtung in der iPhone-App „Kurzbefehle".
 *
 * Bewusst als ausgeschriebene Schrittfolge und nicht als Download: Ein
 * importierter Kurzbefehl aus fremder Hand verlangt „Nicht vertrauenswuerdige
 * Kurzbefehle erlauben" - ausgerechnet die Einstellung, die man fuer einen
 * Schluessel dieser Art nicht anfassen will.
 *
 * Die erste Fassung liess den Kurzbefehl die Fallliste holen, das JSON
 * auspacken und den Fall am Handy auswaehlen: sechs Aktionen, an denen Juergen
 * haengen blieb. Jetzt schickt er nur die Datei - die Frage "zu welchem Fall?"
 * beantwortet der Posteingang am Bildschirm, wo die Akte ohnehin offen ist.
 */
function Anleitung({ basisUrl }: { basisUrl: string }) {
  const ziel = `${basisUrl}/api/eingang/posteingang`;
  const schritte: { titel: string; text: string; kopieren?: string }[] = [
    {
      titel: "Kurzbefehle öffnen",
      text: 'Die App „Kurzbefehle" ist auf jedem iPhone vorinstalliert – notfalls per Spotlight suchen (auf dem Startbildschirm nach unten wischen, „Kurzbefehle" tippen). Dann oben rechts auf das Plus.',
    },
    {
      titel: "Die eine Aktion hinzufügen",
      text: 'Ins Suchfeld „URL" tippen und „Inhalte von URL laden" wählen. In das URL-Feld die Adresse unten einsetzen.',
      kopieren: ziel,
    },
    {
      titel: "Methode auf POST",
      text: 'Auf den Pfeil rechts neben der URL tippen, damit die Einstellungen aufklappen. Bei „Methode" POST wählen.',
    },
    {
      titel: "Schlüssel in den Header – nicht in den Haupttext",
      text: 'Unter „Header" auf „neue Überschrift hinzufügen" tippen. So nennt Apple das Hinzufügen einer Kopfzeile – gemeint ist keine Überschrift, sondern genau dieses Feld. Links „Authorization" eintragen, rechts deinen Schlüssel (bd_…) einsetzen.',
    },
    {
      titel: "Haupttext auf Formular, Feld „datei“",
      text: 'Bei „Haupttext anfordern" von JSON auf „Formular" umstellen. Dann „neues Feld hinzufügen": links „datei" eintragen, rechts auf den Wert tippen und die Variable „Kurzbefehleingabe" wählen. Steht dort noch ein anderes Feld (etwa dein Schlüssel), mit dem roten Minus entfernen – der gehört in den Header, nicht hierher.',
    },
    {
      titel: "Ins Teilen-Menü legen",
      text: 'Unten auf die Infotaste (ⓘ) tippen → „Im Teilen-Menü anzeigen" einschalten. Oben den Namen auf „An BaufiDesk" ändern, dann „Fertig".',
    },
    {
      titel: "Benutzen",
      text: 'In WhatsApp lange auf ein Dokument tippen → Teilen → „An BaufiDesk". Die Datei landet im Posteingang von BaufiDesk; dort ordnest du sie mit einem Klick dem Fall zu.',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Einrichtung auf dem iPhone – einmalig, etwa fünf Minuten
      </div>
      <ol className="space-y-3">
        {schritte.map((s, i) => (
          <li key={s.titel} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
              {i + 1}
            </span>
            <div className="space-y-1">
              <div className="font-medium">{s.titel}</div>
              <p className="text-muted-foreground">{s.text}</p>
              {s.kopieren && (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{s.kopieren}</code>
                  <CopyButton value={s.kopieren} label="Kopieren" />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Ein Hinweis, den kein Übertragungsweg löst: Was dir jemand als
        <em> Foto</em> über WhatsApp schickt, hat WhatsApp bereits komprimiert.
        Für saubere Unterlagen bleibt der Kunden-Upload-Link der bessere Weg –
        oder du bittest um das Dokument als Datei-Anhang.
      </p>
    </div>
  );
}
