import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Der Schritt, mit dem das öffentliche Formular beginnt.
 *
 * Steht hier und nicht in der Aktionsdatei: Dateien mit "use server" dürfen
 * ausschließlich async Funktionen exportieren – eine Konstante dort bricht
 * den Bau.
 */
export const ERSTER_SCHRITT = "finanzierungsart";

/** Rückmeldung des ersten abgesendeten Schritts. */
export interface AnfrageStart {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Bestätigung ohne Wirkung – siehe Honigtöpfchen. */
  danke?: boolean;
}

/** Alles, was die Verwaltungskarte anzeigt. */
export interface FormularStand {
  slug: string | null;
  aktiv: boolean;
  /** Öffentliche Adresse; null, solange kein Formular eingerichtet ist. */
  url: string | null;
  einladungen: Array<{ email: string; am: string }>;
}

/**
 * Das öffentliche Anfrageformular einer Organisation.
 *
 * Der Slug steht in einer Adresse, die auf Visitenkarten und Websites landet:
 * Er wird deshalb streng normalisiert und nie aus Rohtext übernommen.
 */
export function slugNormalisieren(roh: string): string {
  return roh
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function anfrageUrl(slug: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/anfrage/${slug}`;
}

/**
 * Auflösung für die öffentliche Seite. Ein abgeschaltetes Formular verhält
 * sich wie ein unbekanntes: Wer den Slug errät, soll nicht erfahren, dass es
 * ihn gibt.
 */
export async function formularZuSlug(
  slug: string
): Promise<{ id: string; organizationId: string; brokerId: string } | null> {
  const f = await prisma.leadformular.findUnique({
    where: { slug },
    select: { id: true, organizationId: true, brokerId: true, aktiv: true },
  });
  if (!f || !f.aktiv) return null;
  return { id: f.id, organizationId: f.organizationId, brokerId: f.brokerId };
}

/** Das Formular der Organisation – die Oberfläche verwaltet genau eines. */
export async function formularDerOrganisation(
  organizationId: string
): Promise<{ id: string; slug: string; aktiv: boolean } | null> {
  return prisma.leadformular.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, aktiv: true },
  });
}
