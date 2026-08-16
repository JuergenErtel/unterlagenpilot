import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { einstiegsSchritt } from "@/lib/self-disclosure/navigation";
import { umfangDesBogens } from "@/lib/self-disclosure/umfang";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

/** Einstieg: schickt an den zuletzt erreichten Schritt (oder den ersten). */
export default async function SelbstauskunftEinstieg({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveSelfDisclosureToken(token);
  // Die erste Seite des Katalogs statt einer festen ID: Dort meldet die
  // Schrittseite "Link ungültig oder abgelaufen" – ein hier eingetippter Name
  // liefe beim naechsten Katalogschnitt ins Leere.
  if (!access) redirect(`/selbstauskunft/${token}/${KATALOG[0]!.id}`);

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access!.linkId },
    select: {
      currentStep: true,
      answers: true,
      submittedAt: true,
      link: { select: { formularId: true } },
    },
  });
  if (bogen?.submittedAt) redirect(`/selbstauskunft/${token}/zusammenfassung`);

  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const umfang = umfangDesBogens({ formularId: bogen?.link?.formularId ?? null });
  // GEPRUEFT, nicht bloss weitergereicht: Ein `currentStep`, den es nicht mehr
  // gibt, schickte die Schrittseite zurueck hierher und diese Seite sofort
  // wieder dorthin – ERR_TOO_MANY_REDIRECTS ohne Selbstheilung.
  const ziel = einstiegsSchritt(bogen?.currentStep, antworten, umfang);
  redirect(`/selbstauskunft/${token}/${ziel}`);
}
