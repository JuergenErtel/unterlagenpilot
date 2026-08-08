import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/session";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import { erstelleToken, verbraucheToken, TOKEN_GUELTIGKEIT } from "@/lib/auth/tokens";
import { checkLimit, getOrgPlan, PLAN_ROLES } from "@/lib/saas/plans";
import type { UserRole } from "@/lib/domain/enums";

/**
 * Einladung weiterer Nutzer in eine BESTEHENDE Organisation.
 *
 * Anders als bei der Registrierung entsteht hier sofort ein User – nur eben
 * ohne passwordHash. Diesen Zustand faengt der Auth-Provider bereits ab:
 * passwortlose Konten koennen sich nie per Zugangsdaten anmelden.
 */
export type EinladungErgebnis =
  | { ok: true; token: string; userId: string }
  | { ok: false; grund: "limit_erreicht" | "adresse_vergeben" | "rolle_nicht_erlaubt" };

export async function ladeEin(input: {
  organizationId: string;
  email: string;
  name: string;
  rolle: UserRole;
  einladenderUserId: string;
}): Promise<EinladungErgebnis> {
  const email = input.email.trim().toLowerCase();

  // Reihenfolge bewusst limit -> adresse -> rolle (siehe Anmerkung in
  // task-9-report.md): nur so werden die im Brief vorgegebenen Datenbanktests
  // gruen, ohne die im Brief beschriebene Fachlogik zu aendern.
  const limit = await checkLimit(input.organizationId, "usersPerOrg");
  if (!limit.allowed) return { ok: false, grund: "limit_erreicht" };

  const vergeben = await prisma.user.findUnique({ where: { email } });
  if (vergeben) return { ok: false, grund: "adresse_vergeben" };

  const plan = await getOrgPlan(input.organizationId);
  if (!PLAN_ROLES[plan.tier].includes(input.rolle)) return { ok: false, grund: "rolle_nicht_erlaubt" };

  const nutzer = await prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email,
      name: input.name.trim(),
      role: input.rolle,
      passwordHash: null,
      invitedAt: new Date(),
    },
  });

  const { token } = await erstelleToken({
    zweck: "einladung",
    userId: nutzer.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.einladung,
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.einladenderUserId,
    action: "user.invited",
    entityType: "user",
    entityId: nutzer.id,
    metadata: { rolle: input.rolle },
  });

  return { ok: true, token, userId: nutzer.id };
}

export type EinloesungErgebnis =
  | { ok: true; userId: string; organizationId: string; name: string; role: UserRole }
  | { ok: false; grund: "ungueltig" | "passwort_schwach"; text?: string };

export async function loeseEinladungEin(
  token: string,
  passwort: string
): Promise<EinloesungErgebnis> {
  const regel = pruefePasswort(passwort);
  if (!regel.ok) return { ok: false, grund: "passwort_schwach", text: regel.grund };

  const treffer = await verbraucheToken(token, "einladung");
  if (!treffer?.userId) return { ok: false, grund: "ungueltig" };

  const nutzer = await prisma.user.findUnique({ where: { id: treffer.userId } });
  if (!nutzer || !nutzer.active) return { ok: false, grund: "ungueltig" };

  await prisma.user.update({
    where: { id: nutzer.id },
    data: { passwordHash: hashPassword(passwort) },
  });

  await audit({
    organizationId: nutzer.organizationId,
    userId: nutzer.id,
    action: "user.invite_accepted",
    entityType: "user",
    entityId: nutzer.id,
  });

  return {
    ok: true,
    userId: nutzer.id,
    organizationId: nutzer.organizationId,
    name: nutzer.name,
    role: nutzer.role as UserRole,
  };
}
