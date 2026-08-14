"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { frageStellen, type FrageErgebnis } from "@/lib/actions/banken-fragen";
import type { Urteil } from "@/lib/banken/fragen";
import { TONE, type Tone } from "@/lib/ui/tone";
import { datumDe } from "@/lib/datum";

/** Beschriftung und Farbe je Urteil – eine Quelle fuer die ganze Antwort. */
const ANZEIGE: Record<Urteil, { titel: string; ton: Tone }> = {
  ja: { titel: "Akzeptiert", ton: "ready" },
  bedingt: { titel: "Nur unter Bedingungen", ton: "review" },
  nein: { titel: "Akzeptiert nicht", ton: "blocker" },
  keine_aussage: { titel: "Hat sich nicht geäußert", ton: "neutral" },
};

const datum = datumDe;

/**
 * Fuehrt die Auswertung aus und zeigt sie an.
 *
 * Client-Komponente, weil der Lauf je nach Frage einige Sekunden bis gut eine
 * halbe Minute dauert. Als Server-Seitenaufbau waere das eine Seite, die
 * scheinbar nicht laedt – dieser Fehler ist in diesem Projekt schon einmal als
 * "Endlos-Spinner" aufgeschlagen. Hier laeuft stattdessen eine sichtbare Uhr.
 */
export function FrageAuswertung({
  frage,
  bankenAnzahl,
}: {
  frage: string;
  bankenAnzahl: number;
}) {
  const [laeuft, starte] = useTransition();
  const [ergebnis, setErgebnis] = useState<FrageErgebnis | null>(null);
  const [sekunden, setSekunden] = useState(0);
  const gestellt = useRef<string | null>(null);

  useEffect(() => {
    if (!frage || gestellt.current === frage) return;
    gestellt.current = frage;
    setErgebnis(null);
    starte(async () => {
      setErgebnis(await frageStellen(frage));
    });
  }, [frage]);

  useEffect(() => {
    if (!laeuft) return;
    setSekunden(0);
    const t = setInterval(() => setSekunden((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [laeuft]);

  if (!frage) return null;

  if (laeuft || !ergebnis) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          <div className="text-sm">
            <p>
              Liest die Aussagen von {bankenAnzahl.toLocaleString("de-DE")} Banken … (
              {sekunden} s)
            </p>
            <p className="text-muted-foreground">
              Bei weit gefassten Fragen dauert das bis zu einer Minute.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if ("fehler" in ergebnis) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 pt-6 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span>{ergebnis.fehler}</span>
        </CardContent>
      </Card>
    );
  }

  const a = ergebnis.antwort;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          {a.verstanden && (
            <p>
              <span className="text-muted-foreground">Verstanden als: </span>
              {a.verstanden}
            </p>
          )}
          <p className="text-muted-foreground">
            {a.kriterien.length > 0
              ? `Grundlage: ${a.kriterien.map((k) => `„${k}“`).join(", ")}`
              : "Grundlage: Freitextsuche über alle Kriterien"}
            {" · "}
            {a.gelesen > 0 && `${a.gelesen} von ${a.gesamt} Texten gelesen · `}
            Abzug vom {datum(a.standAm)}
          </p>
          {a.nichtGelesen > 0 && (
            <p className="text-muted-foreground">
              {a.nichtGelesen} Banken wurden nicht ausgewertet.
            </p>
          )}
          {a.hinweise.map((h) => (
            <p key={h} className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{h}</span>
            </p>
          ))}
        </CardContent>
      </Card>

      {a.gruppen
        .filter((g) => g.banken.length > 0)
        .map((g) => {
          const { titel, ton } = ANZEIGE[g.urteil];
          const eingeklappt = g.urteil === "keine_aussage";
          const liste = (
            <div className="space-y-2">
              {g.banken.map((b) => (
                <Card key={b.bankId}>
                  <CardContent className="space-y-1 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/banken/${encodeURIComponent(b.bankId)}`}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {b.name}
                      </Link>
                      <Badge variant="neutral">{b.kriterium}</Badge>
                    </div>
                    {/* Bewusst als Text, nie als HTML: Das ist KI-Ausgabe. */}
                    {b.beleg ? (
                      <p className="text-sm text-muted-foreground">„{b.beleg}“</p>
                    ) : b.auszug ? (
                      <p className="text-sm text-muted-foreground">{b.auszug}</p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          );

          return (
            <section key={g.urteil} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${TONE[ton].dot}`} aria-hidden />
                {titel}
                <span className="font-normal text-muted-foreground">
                  ({g.banken.length})
                </span>
              </h2>

              {eingeklappt ? (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {g.banken.length} Banken anzeigen – das ist kein Nein, hier lohnt die
                    direkte Nachfrage.
                  </summary>
                  <div className="mt-3">{liste}</div>
                </details>
              ) : (
                liste
              )}
            </section>
          );
        })}

      {a.gruppen.every((g) => g.banken.length === 0) && (
        <p className="text-sm text-muted-foreground">
          Zu dieser Frage steht nichts im Bestand.
        </p>
      )}
    </div>
  );
}
