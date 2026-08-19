"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KreditpruefungFormular } from "@/components/case/kreditpruefung-formular";
import { fehlendeAngaben, type KreditpruefungStand } from "@/lib/cases/kreditpruefung";

const eur = (n: number | null) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("de-DE")} €`;

/**
 * Womit der Fall zur Kreditpruefung raus ist – Bank und Konditionen.
 *
 * Steht in der Fallakte, sobald die Vertriebsphase "Kreditpruefung
 * eingereicht" (oder weiter) erreicht ist. Was fehlt, wird benannt statt
 * verschwiegen: Eine Karte, die bei fehlendem Zins einfach nichts zeigt,
 * sieht aus wie "alles erfasst".
 */
export function KreditpruefungKarte({
  caseId,
  stand,
}: {
  caseId: string;
  stand: KreditpruefungStand | null;
}) {
  const [offen, setOffen] = useState(false);
  const fehlt = fehlendeAngaben(stand);

  const zeilen: Array<[string, string]> = [
    ["Bank", stand?.bank ?? "—"],
    ["Darlehenssumme", eur(stand?.darlehenssumme ?? null)],
    [
      "Sollzins",
      stand?.sollzinsProzent != null ? `${stand.sollzinsProzent.toLocaleString("de-DE")} %` : "—",
    ],
    ["Zinsbindung", stand?.zinsbindungJahre != null ? `${stand.zinsbindungJahre} Jahre` : "—"],
    [
      "Rate / Tilgung",
      stand?.rateMonatlich != null
        ? `${eur(stand.rateMonatlich)} monatlich`
        : stand?.tilgungProzent != null
          ? `${stand.tilgungProzent.toLocaleString("de-DE")} % p. a.`
          : "—",
    ],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" /> Zur Kreditprüfung eingereicht
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1 text-sm">
          {zeilen.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className={v === "—" ? "text-muted-foreground" : "font-medium tabular"}>{v}</dd>
            </div>
          ))}
        </dl>

        {stand?.eingereichtAm && (
          <p className="text-xs text-muted-foreground">
            Eingereicht am {new Date(stand.eingereichtAm).toLocaleDateString("de-DE")}
            {stand.plattform ? ` über ${stand.plattform}` : ""}
          </p>
        )}
        {stand?.notiz && <p className="text-xs text-muted-foreground">{stand.notiz}</p>}

        {fehlt.length > 0 && (
          <Badge variant="warning" className="whitespace-normal text-left">
            Es fehlt noch: {fehlt.join(", ")}
          </Badge>
        )}

        <button
          onClick={() => setOffen(true)}
          className="text-xs text-primary underline underline-offset-2"
        >
          {stand ? "Angaben ändern" : "Angaben erfassen"}
        </button>

        {/* Der automatische Abruf aus der Plattform gibt es noch nicht: Europace
            hat den Zugang noch nicht erteilt, FinLink liefert nur Leads. Bis
            dahin ist die Eingabe von Hand der einzige ehrliche Weg – deshalb
            steht die Herkunft im Datensatz (quelle), damit ein spaeterer Abruf
            nur ueberschreibt, was von ihm stammt. */}
        <p className="text-[11px] text-muted-foreground">
          Automatischer Abruf aus Europace kommt, sobald der Zugang steht – bis dahin von Hand.
        </p>

        <KreditpruefungFormular caseId={caseId} offen={offen} onClose={() => setOffen(false)} />
      </CardContent>
    </Card>
  );
}
