import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getFinLinkClient, type FinLinkClient } from "@/lib/platforms/finlink/client";
import { finlinkToCanonical } from "@/lib/platforms/finlink/mapping";
import { createCaseFromCanonical } from "@/lib/platforms/case-writer";
import { waehleNeueLeads } from "@/lib/platforms/finlink/select";
import { leiteQuelleAb } from "@/lib/platforms/finlink/source";
import { bereiteErstkontaktVor } from "@/lib/cases/erstkontakt";

/**
 * Holt neue Leads aus FinLink und legt daraus Fälle an.
 *
 * Zwei Grundsätze, die den Zufluss am Leben halten:
 *  - Ein API-Fehler lässt die Marke stehen; der nächste Lauf holt nach.
 *  - Ein einzelner kaputter Lead wird übersprungen, die Marke rückt trotzdem
 *    vor. Bliebe sie stehen, würde ein Datensatz alles Weitere dauerhaft
 *    blockieren – der Schaden wäre größer als der eine verlorene Lead, den
 *    Jürgen in FinLink ohnehin weiter sieht.
 */
const QUELLE = "finlink";
const MAX_PRO_LAUF = 200;

export interface SyncErgebnis {
  status: "ok" | "nicht_konfiguriert" | "fehler";
  angelegt: number;
  /** IDs übersprungener Leads. */
  uebersprungen: string[];
  fehler?: string;
}

export async function syncFinLinkLeads(
  ctx: { organizationId: string; userId: string },
  deps?: { client?: FinLinkClient | null; jetzt?: Date }
): Promise<SyncErgebnis> {
  const client = deps?.client === undefined ? getFinLinkClient() : deps.client;
  if (!client) return { status: "nicht_konfiguriert", angelegt: 0, uebersprungen: [] };

  const jetzt = deps?.jetzt ?? new Date();
  const schluessel = { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } };
  const state = await prisma.leadSyncState.findUnique({ where: schluessel });

  // Erster Lauf: nur Stichtag setzen. Sonst käme der gesamte Bestand herein.
  if (!state) {
    await prisma.leadSyncState.upsert({
      where: schluessel,
      create: {
        organizationId: ctx.organizationId,
        quelle: QUELLE,
        syncedUntil: jetzt,
        lastRunAt: jetzt,
        lastCreated: 0,
      },
      update: { lastRunAt: jetzt },
    });
    return { status: "ok", angelegt: 0, uebersprungen: [] };
  }

  let leads;
  try {
    leads = await client.fetchLeadsPage(MAX_PRO_LAUF);
  } catch (e) {
    const fehler = e instanceof Error ? e.message.slice(0, 300) : String(e);
    await prisma.leadSyncState.upsert({
      where: schluessel,
      create: {
        organizationId: ctx.organizationId,
        quelle: QUELLE,
        lastRunAt: jetzt,
        lastError: fehler,
      },
      // syncedUntil bleibt unangetastet: Der nächste Lauf holt nach.
      update: { lastRunAt: jetzt, lastError: fehler },
    });
    return { status: "fehler", angelegt: 0, uebersprungen: [], fehler };
  }

  const neue = waehleNeueLeads(leads, state.syncedUntil, MAX_PRO_LAUF);
  const uebersprungen: string[] = [];
  let angelegt = 0;
  let letzteZeit: Date | null = null;

  for (const roh of neue) {
    letzteZeit = new Date(roh.createdAt!);
    try {
      const dto = await client.fetchVorgang(roh.id);
      const ergebnis = await createCaseFromCanonical(ctx, finlinkToCanonical(dto));
      if (ergebnis.deduped) continue;

      const { quelle, detail } = leiteQuelleAb(roh);
      await prisma.case.update({
        where: { id: ergebnis.caseId },
        data: {
          quelle,
          quelleDetail: detail,
          einwilligungKontakt: roh.einwilligungKontakt,
          einwilligungMarketing: roh.einwilligungMarketing,
        },
      });
      angelegt += 1;

      // Erstkontakt vorbereiten (Links + Nachrichtenentwurf, KEIN Versand).
      // Scheitert das, ist der Lead trotzdem angelegt – der Vermittler kann den
      // Erstkontakt jederzeit von Hand anstossen.
      try {
        await bereiteErstkontaktVor(ergebnis.caseId);
      } catch (e) {
        console.error(`[finlink] Erstkontakt für ${ergebnis.caseId} nicht vorbereitet:`, e);
      }
    } catch (e) {
      console.warn(
        `[finlink-sync] Lead ${roh.id} übersprungen: ${
          e instanceof Error ? e.message.slice(0, 200) : String(e)
        }`
      );
      uebersprungen.push(roh.id);
    }
  }

  await prisma.leadSyncState.upsert({
    where: schluessel,
    create: {
      organizationId: ctx.organizationId,
      quelle: QUELLE,
      syncedUntil: letzteZeit ?? state.syncedUntil,
      lastRunAt: jetzt,
      lastCreated: angelegt,
    },
    update: {
      ...(letzteZeit ? { syncedUntil: letzteZeit } : {}),
      lastRunAt: jetzt,
      lastCreated: angelegt,
      lastError: null,
    },
  });

  if (angelegt > 0) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId || null,
      action: "case.created",
      entityType: "organization",
      entityId: ctx.organizationId,
      metadata: { quelle: QUELLE, angelegt, uebersprungen: uebersprungen.length },
    });
  }

  return { status: "ok", angelegt, uebersprungen };
}
