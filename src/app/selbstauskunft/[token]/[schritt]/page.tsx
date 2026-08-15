import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import {
  schrittFinden,
  vorherigerSchritt,
  fortschritt,
  personenSchluessel,
} from "@/lib/self-disclosure/navigation";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import { ladeVorbelegung, vorbelegung } from "@/lib/self-disclosure/prefill";
import { umfangDesBogens } from "@/lib/self-disclosure/umfang";
import { StepForm } from "@/components/self-disclosure/step-form";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

export default async function SelbstauskunftSchritt({
  params,
}: {
  params: Promise<{ token: string; schritt: string }>;
}) {
  const { token, schritt: schrittId } = await params;
  const access = await resolveSelfDisclosureToken(token);

  if (!access) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold">Link ungültig oder abgelaufen</h1>
            <p className="text-sm text-muted-foreground">
              Bitte wenden Sie sich an Ihren Berater – er schickt Ihnen einen neuen Link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true, link: { select: { formularId: true } } },
  });
  if (bogen?.submittedAt) redirect(`/selbstauskunft/${token}/zusammenfassung`);

  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const umfang = umfangDesBogens({ formularId: bogen?.link?.formularId ?? null });
  const aktuell = schrittFinden(schrittId, antworten, umfang);
  if (!aktuell) redirect(`/selbstauskunft/${token}`);

  const f = fortschritt(aktuell.id, antworten, umfang);
  const zurueck = vorherigerSchritt(aktuell.id, antworten, umfang);

  // Vorbelegung: die eigene frühere Antwort schlägt den Fallstand. Was der Fall
  // schon weiß, muss niemand abtippen.
  const stand = await ladeVorbelegung(access.caseId);
  const felder = sichtbareFelder(aktuell.schritt, antworten);
  const personen = aktuell.personen ?? [undefined];
  // Ein flacher Schluessel-Raum ueber ALLE Spalten: `defaults` traegt bei
  // zwei Spalten die Antworten beider Personen unter ihrem jeweils
  // vollstaendigen Schluessel (siehe schritt-felder.tsx).
  const defaults: Record<string, string> = {};
  for (const person of personen) {
    for (const feld of felder) {
      const key = personenSchluessel(aktuell.schritt.id, feld.id, person);
      const eigene = antworten[key];
      defaults[key] =
        eigene !== undefined && eigene !== null && eigene !== ""
          ? String(eigene)
          : vorbelegung(stand, feld, person ?? 1);
    }
  }

  // Bereits bekannte Vornamen, damit die Spaltenueberschrift bei jedem
  // Schritt den Namen zeigt, sobald "Wie heissen Sie?" beantwortet ist.
  const vornamen: Partial<Record<1 | 2, string>> = {};
  for (const person of [1, 2] as const) {
    const v = antworten[personenSchluessel("person_name", "vorname", person)];
    if (typeof v === "string" && v.trim() !== "") vornamen[person] = v.trim();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-6">
      <Logo />
      <StepForm
        token={token}
        schrittId={aktuell.id}
        frage={aktuell.schritt.frage}
        hinweis={aktuell.schritt.hinweis}
        felder={felder}
        defaults={defaults}
        personen={aktuell.personen}
        vornamen={vornamen}
      />
      <div className="mt-auto space-y-2">
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((f.position / Math.max(f.gesamt, 1)) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {zurueck ? (
            <Link href={`/selbstauskunft/${token}/${zurueck.id}`} className="hover:underline">
              zurück
            </Link>
          ) : (
            <span />
          )}
          <span>
            Schritt {f.position} von {f.gesamt}
          </span>
        </div>
      </div>
    </main>
  );
}
