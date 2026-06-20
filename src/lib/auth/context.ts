import { prisma } from "@/lib/db";

/**
 * MVP-Auth-Kontext (mandantenfähig vorbereitet).
 * Im MVP wird der erste aktive Vermittler der Seed-Organisation verwendet.
 * TODO(prod): echte Session/Auth (Cookie/JWT), Rollenprüfung, CSRF.
 */
export interface AppContext {
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  role: string;
}

export async function getCurrentContext(): Promise<AppContext | null> {
  const user = await prisma.user.findFirst({
    where: { active: true },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;
  return {
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    userId: user.id,
    userName: user.name,
    role: user.role,
  };
}

/** Erzwingt einen Kontext; wirft, wenn nicht vorhanden (z.B. nicht geseedet). */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getCurrentContext();
  if (!ctx) {
    throw new Error(
      "Kein Vermittler-Kontext gefunden. Bitte `npm run db:seed` ausführen."
    );
  }
  return ctx;
}
