import { Landmark } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { vorgangsnummerSetzen } from "@/lib/actions/anforderungen";
import { BankAnforderungenAuswahl } from "@/components/case/bank-anforderungen-auswahl";
import type { AbgleichZahlen } from "@/lib/anforderungen/abgleich";

const datum = (d: Date) => d.toLocaleDateString("de-DE");
const zeitpunkt = (d: Date) => d.toLocaleString("de-DE");

/**
 * Die Karte im Fall. Server Component: Sie liest nur, was schon in der DB
 * steht (Vorgangsnummer, letzter Protokolleintrag, Abgleichzahlen). Der
 * Europace-Aufruf selbst passiert NICHT hier – der sitzt hinter dem Knopf in
 * `BankAnforderungenAuswahl`, ausgeloest erst auf Klick. Andernfalls wuerde
 * jedes Oeffnen des Falls zwei Europace-Aufrufe mit je bis zu 30 s Timeout
 * feuern, sobald echte Zugangsdaten stehen.
 */
export async function BankAnforderungen({
  caseId,
  abgleich,
}: {
  caseId: string;
  abgleich: {
    bankName: string;
    abgerufenAm: Date;
    quelle: string;
    zahlen: AbgleichZahlen;
  } | null;
}) {
  const [mapping, letzterLauf] = await Promise.all([
    prisma.platformMapping.findUnique({
      where: { caseId_platform: { caseId, platform: "europace" } },
      select: { externalId: true },
    }),
    // Juengster Protokolleintrag dieses Falls -- die einzige Stelle, an der
    // der Vermittler sieht, ob sein letzter Klick auf "Liste schärfen"
    // ueberhaupt etwas bewirkt hat. Ohne das ist ein Ergebnis mit "leer" oder
    // "fehler" von einem Klick, der gar nicht registriert wurde, nicht zu
    // unterscheiden.
    prisma.platformSyncLog.findFirst({
      where: { caseId, platform: "europace", direction: "import" },
      orderBy: { createdAt: "desc" },
      select: { status: true, message: true, createdAt: true },
    }),
  ]);

  if (!mapping?.externalId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold">Unterlagenliste an eine Bank anpassen</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Dafür braucht BaufiDesk die Europace-Vorgangsnummer. Du findest sie in
            Europace oben am Vorgang.
          </p>
          <form action={vorgangsnummerSetzen} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="caseId" value={caseId} />
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Vorgangsnummer</span>
              <Input name="vorgangsnummer" placeholder="z. B. CH6407" required />
            </label>
            <SubmitButton size="sm" pendingLabel="Merkt …">
              Merken
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Unterlagenliste an eine Bank anpassen</h2>
          <Badge variant="neutral">Vorgang {mapping.externalId}</Badge>
        </div>

        {abgleich && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {abgleich.bankName} · {abgleich.quelle === "antrag" ? "Antrag" : "Finanzierungsvorschlag"} ·
              abgerufen am {datum(abgleich.abgerufenAm)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {abgleich.zahlen.neu} Anforderungen waren bei uns nicht auf dem Schirm ·{" "}
              {abgleich.zahlen.verlangtBankNicht} Positionen verlangt diese Bank nicht ·{" "}
              {abgleich.zahlen.decktSich} decken sich
              {abgleich.zahlen.erledigt > 0 && ` · ${abgleich.zahlen.erledigt} liegen der Bank vor`}
            </p>
          </div>
        )}

        {letzterLauf && (
          <p className="text-xs text-muted-foreground">
            Letzter Abruf ({zeitpunkt(letzterLauf.createdAt)}):{" "}
            {letzterLauf.message ?? letzterLauf.status}
          </p>
        )}

        <BankAnforderungenAuswahl caseId={caseId} />
      </CardContent>
    </Card>
  );
}
