import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Re-Export: Die Konstante selbst liegt in einer eigenen Datei (siehe dort
 * für die Begründung), damit sie unabhängig von diesem Dienst importierbar
 * bleibt. Dateien mit "use server" dürfen zudem ausschließlich async
 * Funktionen exportieren – eine Konstante dort bricht den Bau.
 */
export { ERSTER_SCHRITT } from "@/lib/leadformular/erster-schritt";

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
  /**
   * Ob der Slug noch gefahrlos geändert werden darf: nur solange noch kein
   * Bogen daran hängt. Hängt schon einer, ist der Link bereits in der Welt
   * (Visitenkarte, Mailsignatur) – dann bleibt er endgültig.
   */
  kannSlugAendern: boolean;
}

/**
 * Das öffentliche Anfrageformular einer Organisation.
 *
 * Der Slug steht in einer Adresse, die auf Visitenkarten und Websites landet:
 * Er wird deshalb streng normalisiert und nie aus Rohtext übernommen.
 */
export function slugNormalisieren(roh: string): string {
  return roh
    // Ein aus macOS kopiertes "Müller" liegt oft ZERLEGT vor (u + kombinierender
    // Trema, NFD) statt als ein Zeichen (NFC) – die Umlaut-Ersetzung unten
    // prüft aber auf das eine Zeichen "ü" und träfe sonst daneben ("mu-ller"
    // statt "mueller"). NFC muss deshalb der erste Schritt sein.
    .normalize("NFC")
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

/**
 * Ob der Slug eines Formulars noch geändert werden darf: nur solange noch
 * kein Bogen daran hängt (kein `SelfDisclosureLink` mit dieser `formularId`).
 * Sobald der erste Besucher abgesendet hat, ist der Link bereits in der Welt
 * – ein Tippfehler wäre dann nur noch per Datenbankzugriff zu korrigieren,
 * also bleibt der Slug ab da gesperrt.
 */
export async function formularSlugAenderbar(formularId: string): Promise<boolean> {
  const bogen = await prisma.selfDisclosureLink.findFirst({
    where: { formularId },
    select: { id: true },
  });
  return !bogen;
}
