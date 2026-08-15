import { prisma } from "@/lib/db";
import { fortschritt } from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

/**
 * Stand der Selbstauskunft eines Falls – EINE Quelle für Fallseite (Sidebar,
 * "noch nicht erstellt" vs. "beim Kunden") UND Prioritätsleiter
 * (next-step.ts, "Selbstauskunft nachfassen").
 *
 * Der Bug, den diese Datei behebt: Der Erstkontakt legt beim Vorbereiten
 * bereits einen `SelfDisclosureLink` an (siehe erstkontakt.ts) – einen
 * `SelfDisclosure`-Datensatz gibt es aber erst, sobald der Kunde den Bogen
 * öffnet und den ersten Schritt speichert (`speichereAntwort`). Wer daher nur
 * nach einem `SelfDisclosure`-Datensatz sucht, sieht einen frisch beim Kunden
 * liegenden, noch nicht geöffneten Link fälschlich als "kein Link" – und
 * legt per Klick einen zweiten an, während der erste (in der Mail
 * verschickte) weiterhin gültig, aber der Oberfläche unbekannt ist.
 *
 * Deshalb startet die Abfrage hier immer beim `SelfDisclosureLink` (dem
 * zuletzt erstellten je Fall) und liest den optionalen `SelfDisclosure` nur
 * als Anhängsel mit.
 */
export interface SelbstauskunftStand {
  linkId: string | null;
  /** Link ist weder widerrufen (`active`) noch abgelaufen (`expiresAt`). */
  gueltig: boolean;
  begonnen: boolean;
  /** Kunde hat abgesendet, Vermittler hat es noch nicht übernommen. */
  eingegangen: boolean;
  uebernommen: boolean;
  /** Tage seit Linkerstellung; null, wenn es nie einen Link gab. */
  erstelltVorTagen: number | null;
  fortschritt: { position: number; gesamt: number } | null;
  /** Fertig formulierter Text für Badges/Karten. */
  label: string;
}

const LEER: SelbstauskunftStand = {
  linkId: null,
  gueltig: false,
  begonnen: false,
  eingegangen: false,
  uebernommen: false,
  erstelltVorTagen: null,
  fortschritt: null,
  label: "noch nicht erstellt",
};

interface RohDisclosure {
  currentStep: string | null;
  answers: unknown;
  submittedAt: Date | null;
  takenOverAt: Date | null;
}

interface RohLink {
  id: string;
  active: boolean;
  expiresAt: Date;
  createdAt: Date;
  disclosure: RohDisclosure | null;
}

function ausRohLink(link: RohLink | null): SelbstauskunftStand {
  if (!link) return LEER;

  const abgelaufen = link.expiresAt < new Date();
  const widerrufen = !link.active;
  const gueltig = !widerrufen && !abgelaufen;

  const bogen = link.disclosure;
  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  // Fest "voll": Diese Datei liest ausschliesslich Links, die an einem Fall
  // haengen (`where: { caseId }` unten) – ein Formular-Link kommt hier nie
  // vor, der Umfang steht also ohne Ableitung fest.
  const progress = bogen?.currentStep ? fortschritt(bogen.currentStep, antworten, "voll") : null;
  const begonnen = Boolean(bogen?.currentStep) || Boolean(bogen?.submittedAt);
  const uebernommen = Boolean(bogen?.takenOverAt);
  // Nur ein noch nicht übernommener, eingegangener Bogen ist ein offener Schritt.
  const eingegangen = Boolean(bogen?.submittedAt) && !uebernommen;
  const erstelltVorTagen = Math.floor((Date.now() - link.createdAt.getTime()) / 86_400_000);

  const label = uebernommen
    ? "übernommen"
    : bogen?.submittedAt
      ? "eingegangen"
      : progress && progress.position > 0
        ? `begonnen, Schritt ${progress.position} von ${progress.gesamt}`
        : gueltig
          ? "erstellt, noch nicht begonnen"
          : widerrufen
            ? "widerrufen"
            : "abgelaufen, nicht begonnen";

  return { linkId: link.id, gueltig, begonnen, eingegangen, uebernommen, erstelltVorTagen, fortschritt: progress, label };
}

const LINK_SELECT = {
  id: true,
  active: true,
  expiresAt: true,
  createdAt: true,
  disclosure: { select: { currentStep: true, answers: true, submittedAt: true, takenOverAt: true } },
} as const;

/** Stand für einen einzelnen Fall – z. B. die Fallseite. */
export async function ladeSelbstauskunftStand(caseId: string): Promise<SelbstauskunftStand> {
  const link = await prisma.selfDisclosureLink.findFirst({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    select: LINK_SELECT,
  });
  return ausRohLink(link as RohLink | null);
}

/** Batch-Variante für Listen (z. B. Dashboard) – eine Query statt N. */
export async function ladeSelbstauskunftStandBatch(
  caseIds: string[]
): Promise<Map<string, SelbstauskunftStand>> {
  if (caseIds.length === 0) return new Map();

  const links = await prisma.selfDisclosureLink.findMany({
    where: { caseId: { in: caseIds } },
    orderBy: { createdAt: "desc" },
    select: { caseId: true, ...LINK_SELECT },
  });

  const neuesterJeFall = new Map<string, RohLink>();
  for (const l of links as Array<RohLink & { caseId: string }>) {
    if (!neuesterJeFall.has(l.caseId)) neuesterJeFall.set(l.caseId, l);
  }

  const out = new Map<string, SelbstauskunftStand>();
  for (const caseId of caseIds) out.set(caseId, ausRohLink(neuesterJeFall.get(caseId) ?? null));
  return out;
}
