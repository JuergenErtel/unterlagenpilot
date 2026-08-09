"use client";

import { useState, useTransition } from "react";
import { Send, Upload, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { europaceUnterlagenUebertragen, europaceVorgangAnlegen } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  caseId: string;
  freigegeben: boolean;
  vorgangsnummer: string | null;
  konfiguriert: boolean;
  datenkontext: "TEST_MODUS" | "ECHT_GESCHAEFT";
  /** Anzahl noch nicht akzeptierter Dokumente – nur als Hinweis. */
  offeneDokumente: number;
}

export function EuropaceUebertragung({
  caseId,
  freigegeben,
  vorgangsnummer,
  konfiguriert,
  datenkontext,
  offeneDokumente,
}: Props) {
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [feldmeldungen, setFeldmeldungen] = useState<string[]>([]);
  const [erfolg, setErfolg] = useState(false);

  const anlegen = () =>
    starte(async () => {
      const e = await europaceVorgangAnlegen(caseId);
      setMeldung(e.meldung);
      // Bei einem parallelen zweiten Aufruf entsteht in Europace ein
      // ueberzaehliger Vorgang. Die Nummer MUSS sichtbar werden, sonst bleibt er
      // dort unbemerkt liegen.
      setFeldmeldungen(
        e.verwaisteVorgangsnummer
          ? [
              `Achtung: In Europace ist zusätzlich der Vorgang ${e.verwaisteVorgangsnummer} entstanden. Bitte dort prüfen und entfernen.`,
              ...(e.feldmeldungen ?? []),
            ]
          : (e.feldmeldungen ?? [])
      );
      setErfolg(e.ok);
    });

  const unterlagen = () =>
    starte(async () => {
      const e = await europaceUnterlagenUebertragen(caseId);
      setMeldung(e.meldung);
      // Fehlgeschlagene und ueberzaehlige Dokumente einzeln benennen – eine
      // Sammelmeldung "teilweise" allein hilft beim Aufraeumen nicht weiter.
      setFeldmeldungen([
        ...e.fehlgeschlagen.map((f) => `${f.name}: ${f.grund}`),
        ...e.ueberzaehlig.map(
          (u) => `${u.name}: doppelt nach Europace übertragen – bitte dort prüfen und entfernen.`
        ),
      ]);
      setErfolg(e.ok);
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Übertragung nach Europace</CardTitle>
        {datenkontext === "TEST_MODUS" && konfiguriert && (
          <Badge variant="outline">Testmodus – keine echten Vorgänge</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!konfiguriert && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            Europace ist noch nicht verbunden. Dafür wird ein API-Client benötigt (Antrag an
            helpdesk@europace2.de); Client-ID und Secret stehen danach in der persönlichen Linkliste
            in Europace.
          </p>
        )}

        {vorgangsnummer ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" />
              Vorgang <span className="font-mono font-semibold">{vorgangsnummer}</span> angelegt.
            </p>
            <p className="text-sm text-muted-foreground">
              Stammdaten werden bewusst nur einmal übertragen. Spätere Korrekturen nimmst du direkt
              in Europace vor. Unterlagen kannst du jederzeit nachschieben.
            </p>
            <Button onClick={unterlagen} disabled={!konfiguriert || laeuft}>
              <Upload />
              {laeuft ? "Überträgt…" : "Unterlagen nachschieben"}
            </Button>
            {offeneDokumente > 0 && (
              <p className="text-sm text-muted-foreground">
                {offeneDokumente} Dokument(e) sind noch nicht geprüft und werden nicht übertragen.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Legt den Fall als Europace-Vorgang an. Die Daten werden vorab geprüft – schlägt die
              Prüfung fehl, entsteht kein Vorgang.
            </p>
            <Button onClick={anlegen} disabled={!konfiguriert || !freigegeben || laeuft}>
              <Send />
              {laeuft ? "Überträgt…" : "Nach Europace übertragen"}
            </Button>
            {!freigegeben && (
              <p className="text-sm text-muted-foreground">
                Der Fall muss zuerst für Europace freigegeben werden.
              </p>
            )}
          </>
        )}

        {meldung && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="flex items-start gap-2">
              {erfolg ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              {meldung}
            </p>
            {feldmeldungen.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
                {feldmeldungen.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
