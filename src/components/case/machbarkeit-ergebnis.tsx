import Link from "next/link";
import { AlertTriangle, CheckCircle2, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { setzeBundesland, setzeGrunderwerbsteuer } from "@/lib/actions/machbarkeit";
import { BAND_LABELS } from "@/lib/machbarkeit/bewertung";
import { BUNDESLAENDER, BUNDESLAND_LABELS, GRESt_STAND } from "@/lib/machbarkeit/bundesland";
import type { SolverErgebnis, HebelErgebnis } from "@/lib/machbarkeit/solver";

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

/**
 * Ergebnis der Machbarkeitsrechnung. Zuerst die Diagnose – ohne sie ist die
 * Hebelliste wertlos, denn sie entscheidet, welche Frage dem Kunden ueberhaupt
 * gestellt wird.
 */
export function MachbarkeitErgebnis({
  caseId,
  ergebnis,
}: {
  caseId: string;
  ergebnis: SolverErgebnis;
}) {
  const { ausgangslage: a, annahmen, nebenkosten } = ergebnis;
  const wirksam = ergebnis.hebel.filter((h) => h.reichtAllein);
  const erfolglos = ergebnis.hebel.filter((h) => h.anwendbar && !h.reichtAllein);
  const unanwendbar = ergebnis.hebel.filter((h) => !h.anwendbar);

  return (
    <div className="space-y-6">
      {/* ---------- Diagnose ---------- */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            {ergebnis.modus === "optimierung" ? (
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            )}
            <p className="text-base font-semibold">{ergebnis.diagnose}</p>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-4">
            <Kennzahl label="Darlehensbedarf" wert={eur(a.darlehen)} />
            <Kennzahl label="Beleihungsauslauf" wert={pct(a.auslauf)} zusatz={BAND_LABELS[a.band]} />
            <Kennzahl
              label="Monatliche Rate"
              wert={eur(a.rate + a.ratenkreditRate)}
              zusatz={`${pct(a.zinsProzent)} Zins (Annahme)`}
            />
            <Kennzahl
              label="Haushaltsüberschuss"
              wert={eur(a.ueberschuss)}
              tonKritisch={a.ueberschuss < 0}
            />
          </dl>

          {/*
            * Die Wunschrate ist die Grenze des KUNDEN, nicht die der Bank –
            * deshalb steht sie neben der Ampel und nicht darin. Ein verfehlter
            * Wunsch faerbt hier nichts rot: Der Fall ist darstellbar, nur das
            * Gespraech wird ein anderes.
            */}
          {ergebnis.wunschrate != null && a.wunschrateAbweichung != null && (
            <p className="mt-5 flex items-start gap-2 border-t pt-4 text-sm">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {a.wunschrateAbweichung > 0 ? (
                <span>
                  Die Rate liegt{" "}
                  <span className="font-semibold">{eur(a.wunschrateAbweichung)}</span> über der
                  Wunschrate von {eur(ergebnis.wunschrate)}, die im Erstgespräch genannt wurde.
                </span>
              ) : (
                <span>
                  Die im Erstgespräch genannte Wunschrate von {eur(ergebnis.wunschrate)} ist
                  eingehalten.
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Unsicheres Bundesland ---------- */}
      {(ergebnis.bundeslandUnsicher || nebenkosten.steuersatzUnsicher) && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>
                Das Bundesland ließ sich aus Postleitzahl und Ort nicht sicher bestimmen. Gerechnet
                wird mit {pct(nebenkosten.grunderwerbsteuerProzent)} Grunderwerbsteuer – bei diesem
                Kaufpreis macht ein falscher Satz schnell mehrere tausend Euro aus.
              </span>
            </p>
            <form action={setzeBundesland} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="caseId" value={caseId} />
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Bundesland festlegen</span>
                <select name="bundesland" className="feld h-9" defaultValue="">
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  {BUNDESLAENDER.map((b) => (
                    <option key={b} value={b}>
                      {BUNDESLAND_LABELS[b]}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton size="sm" variant="secondary">
                Übernehmen
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------- Hebel ---------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">
          {ergebnis.modus === "rettung" ? "Was den Fall darstellbar macht" : "Was die Kondition verbessert"}
        </h2>

        {wirksam.length === 0 && (
          <p className="rounded-lg border border-warning/30 bg-warning/[0.05] p-4 text-sm">
            Kein einzelner Hebel reicht aus.
          </p>
        )}

        {wirksam.map((h) => (
          <HebelKarte key={h.key} h={h} />
        ))}

        {ergebnis.paare.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Nur zusammen</h3>
            {ergebnis.paare.map((p) => (
              <Card key={`${p.aKey}-${p.bKey}`}>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium">
                    {p.aTitel}: {p.aText}
                    <span className="text-muted-foreground"> und </span>
                    {p.bTitel}: {p.bText}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Auslauf {pct(p.nachher.auslauf)} · Überschuss {eur(p.nachher.ueberschuss)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {(erfolglos.length > 0 || unanwendbar.length > 0) && (
          <details className="rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {erfolglos.length + unanwendbar.length} Wege, die hier nicht helfen
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {[...erfolglos, ...unanwendbar].map((h) => (
                <li key={h.key}>
                  <span className="font-medium">{h.titel}</span>
                  <span className="text-muted-foreground"> — {h.grund}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---------- Annahmen ---------- */}
      <details className="rounded-lg border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Womit gerechnet wurde (Annahmen)
        </summary>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Zinsaufschläge sind keine Bankkonditionen.</span>{" "}
            Sie sind die Mitte einer dokumentierten Marktspanne und lassen sich in den{" "}
            <Link href="/settings/machbarkeit" className="underline">
              Einstellungen
            </Link>{" "}
            anpassen. Liegt am Fall ein konkreter Sollzins aus einem Angebot vor, sticht dieser jede
            Annahme.
          </p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Zeile k="Basiszins (bis 60 % Auslauf)" v={pct(annahmen.basiszinsProzent)} />
            <Zeile k="Aufschlag bis 80 %" v={`+${annahmen.aufschlagBis80} Punkte`} />
            <Zeile k="Aufschlag bis 90 %" v={`+${annahmen.aufschlagBis90} Punkte`} />
            <Zeile k="Aufschlag bis 100 %" v={`+${annahmen.aufschlagBis100} Punkte`} />
            <Zeile k="Aufschlag bis 110 %" v={`+${annahmen.aufschlagBis110} Punkte`} />
            <Zeile k="Angenommene Unschärfe" v={`± ${annahmen.aufschlagUnschaerfe} Punkte`} />
            <Zeile
              k={`Grunderwerbsteuer (Stand ${GRESt_STAND})`}
              v={pct(nebenkosten.grunderwerbsteuerProzent)}
            />
            <Zeile k="Notar und Grundbuch" v={pct(annahmen.notarGrundbuchProzent)} />
            <Zeile k="Eigenleistung höchstens" v={pct(annahmen.eigenleistungDeckelProzent)} />
            <Zeile
              k="Ratenkredit"
              v={`${pct(annahmen.ratenkreditZinsProzent)}, ${annahmen.ratenkreditLaufzeitMonate} Monate`}
            />
            <Zeile k="Mindesttilgung" v={pct(annahmen.mindestTilgungProzent)} />
            <Zeile k="Geforderter Überschuss" v={eur(annahmen.ueberschussPuffer)} />
          </dl>
          <div>
            <p className="font-medium text-foreground">
              Nebenkosten {nebenkosten.gerechnet ? "(gerechnet)" : "(am Fall erfasst)"}:{" "}
              {eur(nebenkosten.summe)}
            </p>
            {nebenkosten.gerechnet && (
              <p>
                Grunderwerbsteuer {eur(nebenkosten.grunderwerbsteuer)} · Notar und Grundbuch{" "}
                {eur(nebenkosten.notarGrundbuch)} · Makler {eur(nebenkosten.makler)}
              </p>
            )}
          </div>
          <form action={setzeGrunderwerbsteuer} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="caseId" value={caseId} />
            <label className="text-sm">
              <span className="mb-1 block">Grunderwerbsteuersatz überschreiben (%)</span>
              <input
                name="satz"
                type="number"
                step="0.1"
                min="0"
                max="10"
                defaultValue={nebenkosten.grunderwerbsteuerProzent}
                className="feld h-9 w-28"
              />
            </label>
            <SubmitButton size="sm" variant="ghost">
              Speichern
            </SubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}

function Kennzahl({
  label,
  wert,
  zusatz,
  tonKritisch,
}: {
  label: string;
  wert: string;
  zusatz?: string;
  tonKritisch?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={`tabular mt-1 text-xl font-semibold ${tonKritisch ? "text-destructive" : ""}`}>
        {wert}
      </dd>
      {zusatz && <p className="mt-0.5 text-xs text-muted-foreground">{zusatz}</p>}
    </div>
  );
}

function Zeile({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{k}</dt>
      <dd className="tabular text-foreground">{v}</dd>
    </div>
  );
}

function HebelKarte({ h }: { h: HebelErgebnis }) {
  const nach = h.nachher!;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{h.titel}</p>
            <p className="mt-0.5 text-base">{h.wertText}</p>
          </div>
          <Badge variant={h.sorte === "datengestuetzt" ? "neutral" : "outline"}>
            {h.sorte === "datengestuetzt" ? "aus der Akte" : "Frage an den Kunden"}
          </Badge>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Auslauf {pct(h.vorher.auslauf)} → <span className="text-foreground">{pct(nach.auslauf)}</span>
          {" · "}Rate {eur(h.vorher.rate + h.vorher.ratenkreditRate)} →{" "}
          <span className="text-foreground">{eur(nach.rate + nach.ratenkreditRate)}</span>
          {" · "}Überschuss {eur(h.vorher.ueberschuss)} →{" "}
          <span className="text-foreground">{eur(nach.ueberschuss)}</span>
        </p>

        {h.spanne && (
          <p className="mt-1 text-xs italic text-muted-foreground">
            Bei ungünstigerem Zinsaufschlag: {h.spanne.unguenstig}. Bei günstigerem:{" "}
            {h.spanne.guenstig}.
          </p>
        )}

        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {h.preis}
        </p>
      </CardContent>
    </Card>
  );
}
