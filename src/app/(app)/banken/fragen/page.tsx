import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { zaehleBanken } from "@/lib/banken/abfrage";
import { MAX_LAENGE } from "@/lib/banken/fragen";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FrageAuswertung } from "@/components/banken/frage-antwort";

export const dynamic = "force-dynamic";
// Weit gefasste Fragen lesen bis zu 300 Texte in gebuendelten KI-Aufrufen.
export const maxDuration = 300;

const BEISPIELE = [
  "Welche Banken akzeptieren einen Dolmetscher beim Notartermin?",
  "Wer finanziert ein Tinyhaus?",
  "Welche Banken nehmen Grenzgänger?",
  "Nimmt die ING Einkommen in Fremdwährung?",
];

export default async function BankenFragenPage({
  searchParams,
}: {
  searchParams: Promise<{ frage?: string }>;
}) {
  await requireContext();
  const { frage } = await searchParams;
  const gestellt = (frage ?? "").trim();
  const anzahl = await zaehleBanken();

  return (
    <div className="space-y-6">
      <Link
        href="/banken"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Bankensuche
      </Link>

      <PageHeader
        eyebrow="Banken-Wiki"
        title="Frag das Wiki"
        subtitle={`Eine Frage in eigenen Worten – die Antwort wird aus den Finanzierungskriterien von ${anzahl.toLocaleString("de-DE")} Banken gelesen und mit dem Satz belegt, auf dem sie beruht.`}
      />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Deine Frage</span>
              <Input
                name="frage"
                defaultValue={gestellt}
                maxLength={MAX_LAENGE}
                placeholder="z. B. Welche Banken akzeptieren einen Dolmetscher beim Notartermin?"
              />
            </label>
            <button type="submit" className="feld h-9 px-4 text-sm">
              Fragen
            </button>
          </form>

          {!gestellt && (
            <div className="mt-4 space-y-1 text-sm">
              <p className="text-muted-foreground">Zum Beispiel:</p>
              <ul className="space-y-1">
                {BEISPIELE.map((b) => (
                  <li key={b}>
                    <Link
                      href={`/banken/fragen?frage=${encodeURIComponent(b)}`}
                      className="underline underline-offset-2"
                    >
                      {b}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <FrageAuswertung frage={gestellt} bankenAnzahl={anzahl} />

      <p className="text-xs text-muted-foreground">
        Die Antwort gibt wieder, was die Banken bei Europace hinterlegt haben – sie
        ersetzt keine Zusage. Ausschlaggebend bleibt die Auskunft der Bank.
      </p>
    </div>
  );
}
