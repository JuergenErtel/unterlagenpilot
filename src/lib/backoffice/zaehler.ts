import { prisma } from "@/lib/db";
import type { AppContext } from "@/lib/auth/context";
import { sichtbarkeitsFilter } from "./sichtbarkeit";
import { LEERE_ZAEHLER, type BackofficeZaehler } from "./bereich";
import { zaehleEingang } from "@/lib/eingang/service";

/**
 * Zaehler der Backoffice-Navigation - sechs kleine Zaehlabfragen, keine
 * Checklisten-Engine: Die Leiste steht auf JEDER Seite, sie darf keine
 * Sekunde kosten. "Fehlende Unterlagen" zaehlt deshalb Auftraege im Warte-
 * status, nicht offene Checklistenpositionen; die genaue Zahl steht auf der
 * Seite selbst.
 */
export async function ladeBackofficeZaehler(ctx: AppContext): Promise<BackofficeZaehler> {
  // Vor dem Ausstieg: Der Posteingang haengt nicht an einer Backoffice-Rolle.
  const posteingang = await zaehleEingang(ctx.organizationId);
  if (!ctx.backofficeRolle) return { ...LEERE_ZAEHLER, posteingang };
  const sicht = sichtbarkeitsFilter(ctx);
  const aktiv = { ...sicht, pausiertSeit: null };
  const [jetzt, qc, uebergabe, fehlend, rueckfragen, dokumente] = await Promise.all([
    prisma.backofficeAuftrag.count({
      where: { ...aktiv, status: { in: ["neu_eingegangen", "auftrag_pruefen", "in_aufbereitung", "nachbearbeitung"] } },
    }),
    prisma.backofficeAuftrag.count({ where: { ...aktiv, status: "qualitaetskontrolle" } }),
    prisma.backofficeAuftrag.count({ where: { ...aktiv, status: "einreichungsfertig" } }),
    prisma.backofficeAuftrag.count({ where: { ...sicht, status: "wartet_auf_unterlagen" } }),
    prisma.backofficeRueckfrage.count({
      where: { status: { in: ["offen", "beantwortet"] }, auftrag: sicht },
    }),
    prisma.document.count({
      where: {
        reviewStatus: "offen",
        classificationStatus: "fertig",
        case: {
          akteArt: "backoffice",
          backofficeAuftraege: {
            some: { ...sicht, status: { notIn: ["abgeschlossen", "abgelehnt", "storniert"] } },
          },
        },
      },
    }),
  ]);
  return {
    posteingang,
    jetztBearbeiten: jetzt,
    qualitaetskontrolle: qc,
    uebergabe,
    fehlendeUnterlagen: fehlend,
    dokumentePruefen: dokumente,
    rueckfragen,
  };
}
