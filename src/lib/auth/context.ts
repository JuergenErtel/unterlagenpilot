import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyUploadToken } from "@/lib/security/upload-token";
import { readSessionToken, verifySessionToken } from "@/lib/auth/session";
import type { AkteArt, BackofficeRolle, CaseStatus, UserRole } from "@/lib/domain/enums";

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
  /** Plattform-Ebene (Freigabe von Registrierungsantraegen). Kommt aus derselben
   *  Abfrage wie Rolle und Organisation – die Navigation kostet dadurch keine
   *  zusaetzliche Datenbankrunde. Massgeblich fuer den Zugang bleibt
   *  requirePlatformAdmin. */
  platformAdmin: boolean;
  /** Stellung im Backoffice der eigenen Organisation; null = kein Zugang.
   *  Kommt aus derselben Abfrage wie die Rolle. Ob das Backoffice fuer die
   *  Organisation freigeschaltet ist, prueft requireBackoffice zusaetzlich. */
  backofficeRolle: BackofficeRolle | null;
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
    // Rolle, Organisation und Aktiv-Kennzeichen kommen aus der DATENBANK, nicht
    // aus dem Cookie: sonst behielte ein gesperrter oder herabgestufter Nutzer
    // seine Rechte bis zum Ablauf des Tokens (bis zu SESSION_TTL_HOURS).
    // Organisation wird verschachtelt mitgeladen (eine Abfrage statt zwei).
    const nutzer = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        active: true,
        organizationId: true,
        name: true,
        role: true,
        platformAdmin: true,
        backofficeRolle: true,
        organization: { select: { name: true } },
      },
    });
    if (nutzer?.active && nutzer.organization) {
      return {
        organizationId: nutzer.organizationId,
        organizationName: nutzer.organization.name,
        userId: nutzer.id,
        userName: nutzer.name,
        role: nutzer.role as UserRole,
        platformAdmin: nutzer.platformAdmin,
        backofficeRolle: (nutzer.backofficeRolle as BackofficeRolle | null) ?? null,
        isDemo: false,
      };
    }
    // Ungueltig gewordene Session (Nutzer inaktiv/geloescht oder Organisation weg):
    // nicht in den Demo-Zweig durchfallen lassen.
    return null;
  }

  // 2) Demo-Fallback (nur ausserhalb der Produktion). Der Fallback nimmt den
  // ersten aktiven Nutzer ALLER Organisationen – mit mehreren Mandanten waere
  // das ein Fremdzugriff per Konfigurationsfehler. Deshalb hart gesperrt,
  // unabhaengig davon, was AUTH_MODE sagt.
  if (env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production") {
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
        // Der Demo-Kontext haengt an keinem echten Login – Plattformrechte
        // gibt es dort grundsaetzlich nicht (vgl. requirePlatformAdmin).
        platformAdmin: false,
        backofficeRolle: (user.backofficeRolle as BackofficeRolle | null) ?? null,
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
    // Die Entwicklermeldung gibt es nur ausserhalb der Produktion. Stuende
    // AUTH_MODE dort versehentlich auf "demo", saehe ein Kunde sonst
    // "Bitte npm run db:seed ausfuehren" statt der Anmeldeseite.
    if (getEnv().AUTH_MODE === "demo" && process.env.NODE_ENV !== "production") {
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
 *
 * `status` gehört mit in die Auskunft: Fast jede schreibende Action muss danach
 * prüfen, ob der Fall gesperrt ist (`LOCKED_CASE_STATUSES`). Ohne ihn holte
 * jede dieser Actions dieselbe Zeile ein zweites Mal – bei feldweisem Speichern
 * (Erstgespräch) wäre das eine zusätzliche Datenbankrunde je Tastendruckende.
 */
export async function requireCaseAccess(
  caseId: string
): Promise<{
  ctx: AppContext;
  caseRow: { id: string; organizationId: string; status: CaseStatus; akteArt: AkteArt };
}> {
  const ctx = await requireContext();
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, organizationId: true, status: true, akteArt: true },
  });
  if (!caseRow || caseRow.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  // Backoffice-Akten gehoeren zwar der Organisation, sind aber kein
  // Vertriebsfall: Ein Vermittler ohne Backoffice-Rolle sieht sie nicht, ein
  // Bearbeiter nur, wenn ein Auftrag dazu ihm gehoert oder frei ist.
  // Dieselbe Antwort wie bei "gibt es nicht" - 404, kein 403.
  if (caseRow!.akteArt === "backoffice" && !(await darfBackofficeAkteSehen(ctx, caseRow!.id))) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return { ctx, caseRow: caseRow as { id: string; organizationId: string; status: CaseStatus; akteArt: AkteArt } };
}

/**
 * Prisma-Where fuer "Akten, die dieser Kontext sehen darf" - fuer Stellen,
 * die den Fall per Abfrage statt ueber requireCaseAccess laden (Seiten mit
 * findFirst, Dokument-Actions mit `case: {...}`). Dieselbe Regel wie
 * requireCaseAccess: eigene Organisation, Vertriebsakten immer, Backoffice-
 * Akten nur mit Backoffice-Rolle, fuer Bearbeiter nur mit eigenem oder freiem
 * Auftrag.
 */
export function akteSichtbarWhere(ctx: AppContext): Prisma.CaseWhereInput {
  const backoffice: Prisma.CaseWhereInput[] = ctx.backofficeRolle
    ? [
        {
          akteArt: "backoffice",
          ...(ctx.backofficeRolle === "bearbeiter"
            ? {
                backofficeAuftraege: {
                  some: {
                    backofficeOrganizationId: ctx.organizationId,
                    OR: [{ bearbeiterId: null }, { bearbeiterId: ctx.userId }],
                  },
                },
              }
            : {}),
        },
      ]
    : [];
  return { organizationId: ctx.organizationId, OR: [{ akteArt: "vertrieb" }, ...backoffice] };
}

/**
 * Sichtbarkeit einer Backoffice-Akte fuer den Kontext. Die Regel selbst
 * steht in src/lib/backoffice/sichtbarkeit.ts (darfAuftragSehen); hier wird
 * nur der passende Auftrag gesucht.
 */
export async function darfBackofficeAkteSehen(ctx: AppContext, caseId: string): Promise<boolean> {
  if (!ctx.backofficeRolle) return false;
  if (ctx.backofficeRolle !== "bearbeiter") return true;
  const auftrag = await prisma.backofficeAuftrag.findFirst({
    where: {
      caseId,
      backofficeOrganizationId: ctx.organizationId,
      OR: [{ bearbeiterId: null }, { bearbeiterId: ctx.userId }],
    },
    select: { id: true },
  });
  return auftrag != null;
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
  const { hashToken } = await import("@/lib/security/upload-token");
  const auswahl = {
    id: true,
    token: true,
    active: true,
    expiresAt: true,
    caseId: true,
    case: { select: { organizationId: true } },
  } as const;

  // Der kurze Weg: Das Token ist undurchsichtig, seine Zeile findet sich ueber
  // den Hash. Gespeichert ist weiterhin nur der Hash – ein Datenbankleck
  // liefert also keinen benutzbaren Link.
  let link = await prisma.uploadLink.findUnique({
    where: { token: hashToken(token) },
    select: auswahl,
  });

  // Altbestand: Vor dem 19.08.2026 trug das Token seine linkId signiert in
  // sich. Solche Links laufen weiter, bis sie ablaufen – ein Kunde, der die
  // Mail von gestern oeffnet, darf nicht vor einer toten Seite stehen.
  if (!link) {
    const payload = verifyUploadToken(token);
    if (!payload) return null;
    link = await prisma.uploadLink.findUnique({ where: { id: payload.linkId }, select: auswahl });
    if (!link) return null;
    if (link.caseId !== payload.caseId) return null;
    if (link.token !== hashToken(token)) return null;
  }

  if (!link.active) return null;
  if (link.expiresAt < new Date()) return null;
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
