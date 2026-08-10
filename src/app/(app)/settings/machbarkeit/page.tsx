import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { speichereAnnahmen } from "@/lib/actions/machbarkeit";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

/**
 * Zinsannahmen des Machbarkeits-Solvers. Bewusst nur diese fuenf Werte: alles
 * andere sind fachliche Konstanten, die im Code stehen und dort versioniert
 * werden.
 */
export default async function MachbarkeitSettingsPage() {
  const ctx = await requireContext();
  const a = await ladeAnnahmen(ctx.organizationId);

  const felder = [
    { name: "basiszinsProzent", label: "Basiszins bis 60 % Auslauf", wert: a.basiszinsProzent, hinweis: "Realkreditgrenze – hier gilt kein Aufschlag." },
    { name: "aufschlagBis80", label: "Aufschlag bis 80 %", wert: a.aufschlagBis80, hinweis: "Marktspanne: um 0 bis 0,2 Punkte." },
    { name: "aufschlagBis90", label: "Aufschlag bis 90 %", wert: a.aufschlagBis90, hinweis: "Marktspanne: 0,1 bis 0,3 Punkte." },
    { name: "aufschlagBis100", label: "Aufschlag bis 100 %", wert: a.aufschlagBis100, hinweis: "Marktspanne: 0,3 bis 0,8 Punkte." },
    { name: "aufschlagBis110", label: "Aufschlag bis 110 %", wert: a.aufschlagBis110, hinweis: "Nebenkosten mitfinanziert – deutlich teurer." },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zu den Einstellungen
      </Link>

      <PageHeader
        title="Zinsannahmen der Machbarkeitsrechnung"
        subtitle="Womit der Solver rechnet, solange kein konkretes Angebot vorliegt."
      />

      <Card>
        <CardContent className="space-y-4 pt-6 text-sm text-muted-foreground">
          <p>
            Der Zins hängt vom Beleihungsauslauf ab: bis zur Realkreditgrenze von 60 % gilt der
            Basiszins, darüber kommt je Band ein Aufschlag dazu. Dieser Aufschlag erhöht die Rate
            und damit die Belastung des Haushalts – deshalb braucht der Solver ihn.
          </p>
          <p>
            <span className="font-medium text-foreground">Es gibt hier keine „richtige" Zahl.</span>{" "}
            Der Aufschlag unterscheidet sich je Bank, Produkt und Tagesmarkt. Die Vorgaben sind die
            Mitte dokumentierter Marktspannen. Passe sie an, wenn deine Anbieter erkennbar enger
            oder weiter liegen – erfinden musst du nichts, das Werkzeug funktioniert auch ohne.
          </p>
          <p>
            Liegt an einem Fall ein konkreter Sollzins aus einem Angebot vor, sticht dieser jede
            Annahme. Und jedes Ergebnis wird zusätzlich am oberen und unteren Rand der Spanne
            gerechnet, damit die Unsicherheit sichtbar bleibt.
          </p>
        </CardContent>
      </Card>

      <form action={speichereAnnahmen}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {felder.map((f) => (
              <div key={f.name} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                <div>
                  <label htmlFor={f.name} className="text-sm font-medium">
                    {f.label}
                  </label>
                  <p className="text-xs text-muted-foreground">{f.hinweis}</p>
                </div>
                <Input
                  id={f.name}
                  name={f.name}
                  type="number"
                  step="0.05"
                  min="0"
                  max={f.name === "basiszinsProzent" ? "20" : "5"}
                  defaultValue={f.wert}
                  className="w-32"
                />
              </div>
            ))}
            <div className="pt-2">
              <SubmitButton>Speichern</SubmitButton>
              <p className="mt-2 text-xs text-muted-foreground">
                Gespeichert wird nur, wenn alle fünf Werte gültig sind – ein halb gesetztes
                Zinsgerüst wäre schlimmer als die Vorgaben, weil es plausibel aussieht.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
