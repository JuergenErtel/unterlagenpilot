import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";
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
  if (!access) redirect(`/selbstauskunft/${token}/finanzierungsart`);

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access!.linkId },
    select: { currentStep: true, answers: true, submittedAt: true },
  });
  if (bogen?.submittedAt) redirect(`/selbstauskunft/${token}/zusammenfassung`);

  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const ziel = bogen?.currentStep ?? sichtbareSchritte(antworten)[0]!.id;
  redirect(`/selbstauskunft/${token}/${ziel}`);
}
