import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";

/**
 * Zugang zur Plattform-Ebene (Freigabe von Registrierungsantraegen).
 *
 * Antwortet mit 404 statt 403: Wer nicht Betreiber ist, soll nicht einmal
 * erfahren, dass es diesen Bereich gibt. Die Pruefung gehoert in jede Server
 * Action – nicht nur ins Rendern der Seite.
 */
export interface PlatformAdminKontext {
  userId: string;
  organizationId: string;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminKontext> {
  const ctx = await getCurrentContext();
  // Demo-Kontext zaehlt ausdruecklich nicht – er haengt an keinem echten Login.
  if (!ctx || ctx.isDemo) notFound();

  const nutzer = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, platformAdmin: true, active: true },
  });
  if (!nutzer?.platformAdmin || !nutzer.active) notFound();

  return { userId: ctx.userId, organizationId: ctx.organizationId };
}
