import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";

/**
 * Zugang zur Plattform-Ebene (Freigabe von Registrierungsantraegen).
 *
 * Antwortet mit 404 statt 403: Wer angemeldet, aber nicht Betreiber ist, soll
 * nicht einmal erfahren, dass es diesen Bereich gibt. Die Pruefung gehoert in
 * jede Server Action – nicht nur ins Rendern der Seite.
 *
 * OHNE Anmeldung dagegen: zur Anmeldeseite, mit Rueckweg. Bis 08.09.2026 gab
 * es auch hier 404 – der Betreiber tippte auf dem Handy den Link aus der Mail
 * „neue Anmeldung wartet", war dort nicht angemeldet und sah „Seite nicht
 * gefunden" statt der Anmeldemaske. Eine Anmeldeseite verraet nichts, was
 * nicht jede andere geschuetzte Seite auch verraet.
 */
export interface PlatformAdminKontext {
  userId: string;
  organizationId: string;
}

export async function requirePlatformAdmin(zurueckZu = "/admin/anmeldungen"): Promise<PlatformAdminKontext> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(zurueckZu)}`);
  // Demo-Kontext zaehlt ausdruecklich nicht – er haengt an keinem echten Login.
  if (ctx.isDemo) notFound();

  const nutzer = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, platformAdmin: true, active: true },
  });
  if (!nutzer?.platformAdmin || !nutzer.active) notFound();

  return { userId: ctx.userId, organizationId: ctx.organizationId };
}
