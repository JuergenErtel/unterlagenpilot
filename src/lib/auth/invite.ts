import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/session";
import { pruefePasswort } from "@/lib/auth/passwort-regeln";
import {
  entwerteOffeneToken,
  erstelleToken,
  findeToken,
  verbraucheToken,
  TOKEN_GUELTIGKEIT,
} from "@/lib/auth/tokens";
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

/**
 * Eine noch nicht angenommene Einladung: eingeladen (invitedAt gesetzt), aber
 * ohne Passwort. Nur solche Konten duerfen erneut eingeladen oder
 * zurueckgezogen werden – ein Konto MIT Passwort ist ein arbeitender Mensch und
 * darf ueber diesen Weg nicht verschwinden (das waere eine Nutzerverwaltung,
 * die es hier nicht gibt).
 */
async function ladeOffeneEinladung(userId: string, organizationId: string) {
  const nutzer = await prisma.user.findUnique({ where: { id: userId } });
  // Mandantengrenze: auch ein org_admin darf nur die eigene Organisation
  // anfassen. Die Pruefung steht hier UND in der Server Action.
  if (!nutzer || nutzer.organizationId !== organizationId) return null;
  if (!nutzer.invitedAt || nutzer.passwordHash !== null) return null;
  return nutzer;
}

export type ErneutErgebnis =
  | { ok: true; token: string; email: string; name: string }
  | { ok: false; grund: "nicht_offen" };

/**
 * Verschickt eine Einladung erneut: das alte Token wird entwertet, ein frisches
 * erzeugt. Ohne diesen Weg verbrennt eine misslungene oder verfallene Einladung
 * dauerhaft einen Tarifplatz – erneut einladen scheitert an der vergebenen
 * Adresse, und deaktivieren laesst sich ein Nutzer nirgends.
 */
export async function sendeEinladungErneut(input: {
  userId: string;
  organizationId: string;
  handelnderUserId: string;
}): Promise<ErneutErgebnis> {
  const nutzer = await ladeOffeneEinladung(input.userId, input.organizationId);
  if (!nutzer) return { ok: false, grund: "nicht_offen" };

  await entwerteOffeneToken("einladung", { userId: nutzer.id });
  const { token } = await erstelleToken({
    zweck: "einladung",
    userId: nutzer.id,
    gueltigSekunden: TOKEN_GUELTIGKEIT.einladung,
  });
  await prisma.user.update({ where: { id: nutzer.id }, data: { invitedAt: new Date() } });

  await audit({
    organizationId: input.organizationId,
    userId: input.handelnderUserId,
    action: "user.invite_resent",
    entityType: "user",
    entityId: nutzer.id,
  });

  return { ok: true, token, email: nutzer.email, name: nutzer.name };
}

export type WiderrufErgebnis = { ok: true } | { ok: false; grund: "nicht_offen" };

/**
 * Zieht eine noch nicht angenommene Einladung zurueck: das Konto verschwindet,
 * der Tarifplatz ist wieder frei. Die Token haengen per onDelete: Cascade daran,
 * Audit-Eintraege bleiben (userId wird auf null gesetzt).
 */
export async function zieheEinladungZurueck(input: {
  userId: string;
  organizationId: string;
  handelnderUserId: string;
}): Promise<WiderrufErgebnis> {
  const nutzer = await ladeOffeneEinladung(input.userId, input.organizationId);
  if (!nutzer) return { ok: false, grund: "nicht_offen" };

  await prisma.user.delete({ where: { id: nutzer.id } });

  // Nach dem Loeschen: entityId zeigt bewusst auf das entfernte Konto, damit im
  // Protokoll nachvollziehbar bleibt, welcher Platz freigegeben wurde.
  await audit({
    organizationId: input.organizationId,
    userId: input.handelnderUserId,
    action: "user.invite_revoked",
    entityType: "user",
    entityId: nutzer.id,
    metadata: { rolle: nutzer.role },
  });

  return { ok: true };
}

export interface EinladungKontext {
  organisation: string;
  einladenderName: string | null;
  name: string;
}

/**
 * Loest ein Einladungstoken NUR lesend auf – fuer die Anzeige auf
 * /einladung/[token]. Eine Seite, die ohne jeden Zusammenhang nach einem
 * Passwort fragt, hat die Form einer Phishing-Seite; Organisation und
 * Einladender nehmen ihr das.
 *
 * Der Einladende steht nicht am Nutzer, sondern im Audit-Log (Eintrag
 * "user.invited"/"user.invite_resent"). Fehlt er dort, bleibt das Feld leer –
 * die Organisation allein reicht fuer die Einordnung.
 */
export async function liesEinladung(token: string): Promise<EinladungKontext | null> {
  const treffer = await findeToken(token, "einladung");
  if (!treffer?.userId) return null;

  const nutzer = await prisma.user.findUnique({
    where: { id: treffer.userId },
    select: {
      name: true,
      active: true,
      passwordHash: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  if (!nutzer?.active || nutzer.passwordHash !== null) return null;

  const eintrag = await prisma.auditLog.findFirst({
    where: {
      organizationId: nutzer.organizationId,
      entityType: "user",
      entityId: treffer.userId,
      action: { in: ["user.invited", "user.invite_resent"] },
    },
    orderBy: { createdAt: "desc" },
    select: { user: { select: { name: true } } },
  });

  return {
    organisation: nutzer.organization.name,
    einladenderName: eintrag?.user?.name ?? null,
    name: nutzer.name,
  };
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
