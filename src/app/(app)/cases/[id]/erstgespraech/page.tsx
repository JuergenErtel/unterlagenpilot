import Link from "next/link";
import { ArrowLeft, Lock, Users } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { LOCKED_CASE_STATUSES, MAX_APPLICANTS } from "@/lib/domain/enums";
import { berechneReife } from "@/lib/erstgespraech/reife";
import { baueMaske } from "@/lib/erstgespraech/maske";
import { nebenkostenVorschau } from "@/lib/erstgespraech/nebenkosten-vorschau";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { Reifeleiste } from "@/components/erstgespraech/reifeleiste";
import { GespraechsAbschnitt } from "@/components/erstgespraech/abschnitt";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const eur = (n: number): string => `${Math.round(n).toLocaleString("de-DE")} €`;

/**
 * Die gefuehrte Maske fuers Erstgespraech.
 *
 * Juergen telefoniert und tippt gleichzeitig. Die Seite ist deshalb eine
 * Gespraechsfuehrung, kein Formular: oben, wie weit es noch bis zum Angebot
 * ist, darunter die Abschnitte in der Reihenfolge, in der man sie fragt –
 * abgehakte eingeklappt. Gespeichert wird beim Verlassen jedes Feldes.
 *
 * Kein Feld blockiert. Es gibt keinen Absenden-Knopf, den man "richtig"
 * ausfuellen muesste.
 */
export default async function ErstgespraechPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zu_zweit?: string }>;
}) {
  const { id } = await params;
  const { zu_zweit } = await searchParams;
  await requireCaseAccess(id);

  const fall = await prisma.case.findUniqueOrThrow({
    where: { id },
    select: {
      caseNumber: true,
      status: true,
      financingType: true,
      applicants: {
        orderBy: { position: "asc" },
        include: {
          employment: { orderBy: { createdAt: "asc" } },
          income: { orderBy: { createdAt: "asc" } },
          selfEmployment: { orderBy: { createdAt: "asc" } },
        },
      },
      property: true,
      financingRequest: true,
    },
  });

  const stand: Fallstand = {
    applicants: fall.applicants as unknown as Fallstand["applicants"],
    property: (fall.property as Record<string, unknown> | null) ?? null,
    financingRequest: (fall.financingRequest as Record<string, unknown> | null) ?? null,
    caseFelder: { financingType: fall.financingType ?? null },
  };

  /*
   * Zwei Antragsteller sind der Baufi-Standard-Hoechstfall; ohne Antragsteller
   * fragen wir nach einem – ein leerer Fall soll die Maske nicht leeren.
   *
   * "Wir kaufen zu zweit" faellt oft erst im Gespraech. Die Katalogfrage
   * danach hat kein Zielfeld und steht deshalb nicht in der Maske; ohne den
   * Schalter muesste der Vermittler mitten im Telefonat nach /edit wechseln,
   * um Antragsteller 2 anzulegen. Der Schalter steht in der Adresse (statt im
   * Browserspeicher), damit er ein Neuladen und jedes Zwischenspeichern
   * ueberlebt. Angelegt wird Antragsteller 2 dabei nicht – das erledigt
   * `schreibeZielwert` beim ersten Wert, den er bekommt (`ermittleApplicantId`).
   */
  const vorhandene = Math.min(Math.max(fall.applicants.length, 1), MAX_APPLICANTS);
  const zuZweit = vorhandene > 1 || zu_zweit === "1";
  const antragstellerZahl = (zuZweit ? 2 : 1) as 1 | 2;

  const reife = berechneReife(stand, antragstellerZahl);
  const maske = baueMaske(stand, antragstellerZahl, reife);
  const nebenkosten = nebenkostenVorschau({
    kaufpreis: fall.financingRequest?.kaufpreis ?? null,
    plz: fall.property?.zip ?? null,
    ort: fall.property?.city ?? null,
    maklerprovisionProzent: fall.financingRequest?.maklerprovisionProzent ?? null,
    nebenkostenErfasst: fall.financingRequest?.nebenkosten ?? null,
    grunderwerbsteuerProzentOverride: fall.financingRequest?.grunderwerbsteuerProzent ?? null,
  });
  const kaufpreis = fall.financingRequest?.kaufpreis ?? null;
  const gesperrt = LOCKED_CASE_STATUSES.has(fall.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Erstkontakt"
        title={`Erstgespräch · ${fall.caseNumber}`}
        subtitle="Die Fragen für ein Angebot in der Reihenfolge, in der man sie am Telefon stellt. Jedes Feld speichert beim Verlassen – nichts ist Pflicht, nichts geht verloren."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      {gesperrt && (
        <Card className="border-warning/40">
          <CardContent className="flex items-center gap-3 p-5 text-sm">
            <Lock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              Der Fall ist bereits abgegeben – die Angaben lassen sich hier nicht mehr ändern.
            </span>
          </CardContent>
        </Card>
      )}

      <Reifeleiste reife={reife} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {zuZweit ? "Zwei Antragsteller" : "Ein Antragsteller"}
              {zuZweit && vorhandene < 2 && (
                <span className="text-muted-foreground">
                  {" "}
                  · Antragsteller 2 entsteht mit der ersten Angabe
                </span>
              )}
            </span>
          </div>
          {vorhandene > 1 ? (
            <span className="text-xs text-muted-foreground">
              Beide sind bereits im Fall angelegt – entfernen geht in den Stammdaten.
            </span>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link
                href={
                  zuZweit ? `/cases/${id}/erstgespraech` : `/cases/${id}/erstgespraech?zu_zweit=1`
                }
              >
                {zuZweit ? "Doch alleine" : "Zweiter Antragsteller"}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kaufnebenkosten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {nebenkosten ? (
            <>
              <Zeile
                label={`Grunderwerbsteuer (${nebenkosten.grunderwerbsteuerProzent
                  .toLocaleString("de-DE", { maximumFractionDigits: 2 })} %)`}
                betrag={nebenkosten.grunderwerbsteuer}
              />
              <Zeile label="Notar und Grundbuch" betrag={nebenkosten.notarGrundbuch} />
              <Zeile label="Maklerprovision" betrag={nebenkosten.makler} />
              <div className="flex items-center justify-between gap-3 border-t pt-2 font-semibold">
                <span>Nebenkosten gesamt</span>
                <span className="tabular-nums">{eur(nebenkosten.summe)}</span>
              </div>
              {kaufpreis !== null && (
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span>Gesamtaufwand mit Kaufpreis</span>
                  <span className="tabular-nums">{eur(kaufpreis + nebenkosten.summe)}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Nebenkosten sind nicht beleihbar – sie müssen aus dem Eigenkapital kommen.
                {!nebenkosten.gerechnet && " Der am Fall erfasste Betrag hat Vorrang vor der Rechnung."}
                {nebenkosten.steuersatzUnsicher &&
                  " Das Bundesland steht noch nicht fest; bis dahin gilt ein Mittelwert – PLZ und Ort im Abschnitt „Das Objekt“ schärfen die Zahl."}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Sobald ein Kaufpreis steht, rechnen wir die Nebenkosten hier mit – ohne danach zu
              fragen.
            </p>
          )}
        </CardContent>
      </Card>

      {maske.map((abschnitt) => (
        <GespraechsAbschnitt
          key={abschnitt.id}
          caseId={id}
          abschnitt={abschnitt}
          gesperrt={gesperrt}
        />
      ))}
    </div>
  );
}

function Zeile({ label, betrag }: { label: string; betrag: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{eur(betrag)}</span>
    </div>
  );
}
