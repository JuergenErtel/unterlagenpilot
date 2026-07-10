import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyUploadToken } from "@/lib/security/upload-token";
import { readSessionToken, verifySessionToken } from "@/lib/auth/session";
import type { UserRole } from "@/lib/domain/enums";

/**
 * Auth-/Zugriffskontext (mandantenfähig).
 *
 * Zwei Modi (ENV `AUTH_MODE`):
 *  - "session": echte Login-Pflicht. Kontext stammt aus dem signierten
 *    Session-Cookie. Für echte Pilot-/Kundendaten verbindlich.
 *  - "demo":    Komfort für lokale Entwicklung/Demo – der erste aktive Nutzer
 *    der Seed-Organisation wird verwendet, OHNE Login. Wird im Systemstatus
 *    klar als „Demo" ausgewiesen. Niemals mit echten Kundendaten nutzen.
 */
export interface AppContext {
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  role: UserRole;
  /** true, wenn der Kontext aus dem Demo-Fallback stammt (kein echter Login). */
  isDemo: boolean;
}

// ---- Rollen-Hierarchie (höher = mehr Rechte) ----
const ROLE_RANK: Record<UserRole, number> = {
  teammitglied: 1,
  vermittler: 2,
  org_admin: 3,
  white_label_admin: 4,
};

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getCurrentContext(): Promise<AppContext | null> {
  const env = getEnv();

  // 1) Echte Session aus dem Cookie
  const session = verifySessionToken(await readSessionToken());
  if (session) {
    // Org-Name nachladen (klein, ungecached – Korrektheit vor Mikro-Optimierung).
    const org = await prisma.organization.findUnique({
      where: { id: session.org },
      select: { name: true },
    });
    if (org) {
      return {
        organizationId: session.org,
        organizationName: org.name,
        userId: session.sub,
        userName: session.name,
        role: session.role,
        isDemo: false,
      };
    }
  }

  // 2) Demo-Fallback (nur wenn ausdrücklich erlaubt)
  if (env.AUTH_MODE === "demo") {
    const user = await prisma.user.findFirst({
      where: { active: true },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    if (user) {
      return {
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        userId: user.id,
        userName: user.name,
        role: user.role as UserRole,
        isDemo: true,
      };
    }
  }

  return null;
}

/**
 * Erzwingt einen Kontext. Wirft, wenn keiner vorhanden ist.
 * (Backward-kompatibel zu bestehenden Server Actions/Seiten.)
 */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getCurrentContext();
  if (!ctx) {
    if (getEnv().AUTH_MODE === "demo") {
      throw new Error("Kein Vermittler-Kontext gefunden. Bitte `npm run db:seed` ausführen.");
    }
    redirect("/login");
  }
  return ctx;
}

/** Auth-Gate für Seiten: leitet bei fehlender Anmeldung auf /login um. */
export async function requireUser(): Promise<AppContext> {
  return requireContext();
}

/** Erzwingt eine Mindestrolle; sonst Weiterleitung aufs Dashboard (kein Leak). */
export async function requireRole(min: UserRole): Promise<AppContext> {
  const ctx = await requireContext();
  if (!roleAtLeast(ctx.role, min)) redirect("/dashboard");
  return ctx;
}

/** Stellt sicher, dass der Kontext zur angegebenen Organisation gehört. */
export async function requireOrganizationAccess(organizationId: string): Promise<AppContext> {
  const ctx = await requireContext();
  if (ctx.organizationId !== organizationId) redirect("/dashboard");
  return ctx;
}

/**
 * Lädt einen Fall NUR, wenn er zur Organisation des Kontextes gehört.
 * Existiert er nicht oder gehört er einer anderen Organisation, antworten wir
 * identisch (404), um Existenz nicht preiszugeben.
 */
export async function requireCaseAccess(
  caseId: string
): Promise<{ ctx: AppContext; caseRow: { id: string; organizationId: string } }> {
  const ctx = await requireContext();
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, organizationId: true },
  });
  if (!caseRow || caseRow.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return { ctx, caseRow: caseRow! };
}

export interface UploadTokenAccess {
  linkId: string;
  caseId: string;
  organizationId: string;
}

/**
 * Prüft Signatur, Hash, Aktivität, Ablauf und Fallbindung eines Upload-Tokens –
 * OHNE das Upload-Kontingent zu betrachten. Für Aktionen, die auch nach dem
 * letzten Upload noch laufen müssen (Abschluss-Benachrichtigung, Formular,
 * Seitenanzeige). Neue Uploads gehen über `requireUploadTokenAccess`.
 */
export async function resolveUploadToken(token: string): Promise<UploadTokenAccess | null> {
  const payload = verifyUploadToken(token);
  if (!payload) return null;
  const { hashToken } = await import("@/lib/security/upload-token");
  const link = await prisma.uploadLink.findUnique({
    where: { id: payload.linkId },
    select: {
      id: true,
      token: true,
      active: true,
      expiresAt: true,
      caseId: true,
      case: { select: { organizationId: true } },
    },
  });
  if (!link || !link.active) return null;
  if (link.expiresAt < new Date()) return null;
  if (link.caseId !== payload.caseId) return null;
  // Token-Hash-Abgleich (Klartext-Token wird nicht gespeichert).
  if (link.token !== hashToken(token)) return null;
  return { linkId: link.id, caseId: link.caseId, organizationId: link.case.organizationId };
}

/**
 * Wie `resolveUploadToken`, zusätzlich mit Kontingent-Vorprüfung.
 * Gibt null zurück bei ungültig/abgelaufen/deaktiviert/Limit erreicht.
 *
 * Achtung: Die Prüfung allein ist nicht rennsicher – vor dem eigentlichen
 * Upload muss `consumeUploadSlot` das Kontingent atomar reservieren.
 */
export async function requireUploadTokenAccess(token: string): Promise<UploadTokenAccess | null> {
  const access = await resolveUploadToken(token);
  if (!access) return null;
  const link = await prisma.uploadLink.findUnique({
    where: { id: access.linkId },
    select: { maxUploads: true, usedCount: true },
  });
  if (!link) return null;
  if (link.maxUploads != null && link.usedCount >= link.maxUploads) return null;
  return access;
}

/**
 * Reserviert atomar einen Upload-Slot. Der bedingte `updateMany` verhindert,
 * dass parallele Requests das Limit gemeinsam überschreiten (TOCTOU):
 * Nur wer die Zeile tatsächlich hochzählt (count === 1), darf hochladen.
 * Gibt `true` bei unbegrenzten Links direkt zurück.
 */
export async function consumeUploadSlot(linkId: string): Promise<boolean> {
  const link = await prisma.uploadLink.findUnique({
    where: { id: linkId },
    select: { maxUploads: true },
  });
  if (!link) return false;
  if (link.maxUploads == null) {
    await prisma.uploadLink.update({ where: { id: linkId }, data: { usedCount: { increment: 1 } } });
    return true;
  }
  const { count } = await prisma.uploadLink.updateMany({
    where: { id: linkId, usedCount: { lt: link.maxUploads } },
    data: { usedCount: { increment: 1 } },
  });
  return count === 1;
}

/** Gibt einen zuvor reservierten Slot zurück (wenn der Upload scheiterte). */
export async function releaseUploadSlot(linkId: string): Promise<void> {
  await prisma.uploadLink.updateMany({
    where: { id: linkId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}
