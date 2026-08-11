import { Landmark } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { anforderungenAbrufen, auswahlLaden, vorgangsnummerSetzen } from "@/lib/actions/anforderungen";
import type { AbgleichZahlen } from "@/lib/anforderungen/abgleich";

const datum = (d: Date) => d.toLocaleDateString("de-DE");

/**
 * Die Karte im Fall. Server Component: Die Auswahl wird beim Rendern geholt,
 * damit kein Zwischenklick noetig ist.
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
  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });

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
            <button type="submit" className="feld h-9 px-4 text-sm">
              Merken
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const ergebnis = await auswahlLaden(caseId);

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

        {"fehler" in ergebnis && ergebnis.fehler ? (
          <p className="text-sm text-muted-foreground">{ergebnis.fehler}</p>
        ) : null}

        {"auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length > 0 ? (
          <div className="space-y-2">
            {ergebnis.auswahl.map((a) => (
              <form
                key={`${a.quelle}-${a.bezugsId}`}
                action={anforderungenAbrufen}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <input type="hidden" name="caseId" value={caseId} />
                <input type="hidden" name="quelle" value={a.quelle} />
                <input type="hidden" name="bezugsId" value={a.bezugsId} />
                <input type="hidden" name="bankId" value={a.bankId ?? ""} />
                <input type="hidden" name="bankName" value={a.bankName} />
                <div className="text-sm">
                  <p className="font-medium">{a.bankName}</p>
                  <p className="text-muted-foreground">
                    {a.quelle === "antrag" ? "Antrag" : "Vorschlag"} {a.bezugsId}
                    {a.hinweis ? ` · ${a.hinweis}` : ""}
                  </p>
                </div>
                <button type="submit" className="feld h-8 shrink-0 px-3 text-sm">
                  Liste schärfen
                </button>
              </form>
            ))}
          </div>
        ) : null}

        {"auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Europace nennt zu diesem Vorgang weder Anträge noch Finanzierungsvorschläge.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
