import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { ladeUebergabeZiele } from "@/lib/backoffice/uebergabe-ziele";
import { BACKOFFICE_TERMINAL_STATUS, type AkteArt } from "@/lib/domain/enums";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackofficeUebergabeForm } from "@/components/case/backoffice-uebergabe-form";

/**
 * Karte "An Backoffice uebergeben" in der Fallverwaltung.
 *
 * Erscheint nur, wenn (1) die Akte ein Vertriebsfall ist, (2) es mindestens
 * ein Ziel gibt: das eigene Backoffice (Flag) oder einen Backoffice-Partner,
 * bei dem diese Organisation Auftraggeber ist. Ohne Ziel rendert sie nichts -
 * die Verwaltung eines Vermittlers ohne Backoffice sieht aus wie bisher.
 * Laeuft bereits ein Auftrag (gleich welches Backoffice), steht statt des
 * Formulars ein Hinweis mit der Nummer; der Link fuehrt in den eigenen
 * Auftrag (mit Backoffice-Rolle) oder ins Auftraggeberportal.
 */
export async function BackofficeUebergabeKarte({
  caseId,
  organizationId,
  akteArt,
  istBackofficeNutzer,
}: {
  caseId: string;
  organizationId: string;
  akteArt: AkteArt;
  istBackofficeNutzer: boolean;
}) {
  if (akteArt !== "vertrieb") return null;
  const ziele = await ladeUebergabeZiele(organizationId);
  if (ziele.length === 0) return null;

  const aktiver = await prisma.backofficeAuftrag.findFirst({
    where: {
      caseId,
      status: { notIn: [...BACKOFFICE_TERMINAL_STATUS] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, auftragsnummer: true, backofficeOrganizationId: true },
  });
  const eigenerAuftrag = aktiver?.backofficeOrganizationId === organizationId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          An Backoffice übergeben
        </CardTitle>
        <CardDescription>
          Unterlagenprüfung und Aufbereitung an ein Backoffice geben. Der Fall bleibt Ihre Akte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {aktiver ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-ai/30 bg-ai/[0.05] px-3 py-2 text-sm">
            <span>
              Zu dieser Akte läuft bereits der Backoffice-Auftrag{" "}
              <span className="font-medium">{aktiver.auftragsnummer}</span>. Den Stand zeigt die
              Fallakte.
            </span>
            {eigenerAuftrag ? (
              istBackofficeNutzer && (
                <Link
                  href={`/backoffice/auftraege/${aktiver.id}`}
                  className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Zum Auftrag
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )
            ) : (
              <Link
                href={`/portal/auftraege/${aktiver.id}`}
                className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Im Auftraggeberportal ansehen
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        ) : (
          <BackofficeUebergabeForm caseId={caseId} ziele={ziele.map((z) => ({ schluessel: z.schluessel, name: z.name }))} />
        )}
      </CardContent>
    </Card>
  );
}
