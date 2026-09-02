import { prisma } from "@/lib/db";
import type { AppContext } from "@/lib/auth/context";
import { sichtbarkeitsFilter } from "./sichtbarkeit";
import { LEERE_ZAEHLER, type BackofficeZaehler } from "./bereich";

/**
 * Zaehler der Backoffice-Navigation - sechs kleine Zaehlabfragen, keine
 * Checklisten-Engine: Die Leiste steht auf JEDER Seite, sie darf keine
 * Sekunde kosten. "Fehlende Unterlagen" zaehlt deshalb Auftraege im Warte-
 * status, nicht offene Checklistenpositionen; die genaue Zahl steht auf der
 * Seite selbst.
 */
export async function ladeBackofficeZaehler(ctx: AppContext): Promise<BackofficeZaehler> {
  if (!ctx.backofficeRolle) return LEERE_ZAEHLER;
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
    jetztBearbeiten: jetzt,
    qualitaetskontrolle: qc,
    uebergabe,
    fehlendeUnterlagen: fehlend,
    dokumentePruefen: dokumente,
    rueckfragen,
  };
}
