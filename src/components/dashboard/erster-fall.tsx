import Link from "next/link";
import { Download, Plus, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Der leere Zustand der Arbeitszentrale: Die Organisation hat noch keinen
 * einzigen Fall.
 *
 * Bis 08.09.2026 stand diese Karte nur in der Kennzahlen-Sicht; das Board
 * (die Standardsicht) zeigte einem frisch freigeschalteten Vermittler sechs
 * leere Spalten, ein leeres Kennzahlenband und einen Pilot-Hinweis. Das erste
 * Bild nach dem ersten Login muss sagen, was zu tun ist – nicht, was fehlt.
 */
export function ErsterFall({ demoCaseId }: { demoCaseId: string | null }) {
  return (
    <Card>
      <CardContent className="space-y-5 p-8">
        <div className="text-center">
          <p className="text-base font-semibold">Willkommen bei BaufiDesk.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hier entsteht Ihr Board mit allen Fällen. In drei Schritten ist der erste bankfertig.
          </p>
        </div>
        <ol className="mx-auto grid max-w-lg gap-3 text-sm">
          <Schritt n={1} title="Fall anlegen" text="Name und Finanzierungsart genügen – alles Weitere ergänzt die KI aus den Unterlagen. Oder Sie holen Ihre Leads aus FinLink." />
          <Schritt n={2} title="Upload-Link an den Kunden senden" text="Im Fall unter „Sicherer Upload-Link“. Der Kunde lädt ohne Login hoch." />
          <Schritt n={3} title="Prüfen und exportieren" text="KI-Prüfung starten, Vorschläge bestätigen, Paket für die Bank erzeugen." />
        </ol>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button asChild>
            <Link href="/cases/new"><Plus aria-hidden />Ersten Fall anlegen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/cases/import"><Download aria-hidden />Aus FinLink importieren</Link>
          </Button>
          {demoCaseId && (
            <Button asChild variant="outline">
              <Link href={`/cases/${demoCaseId}`}><PlayCircle aria-hidden />Demo-Fall ansehen</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Schritt({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}
