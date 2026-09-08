"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext, roleAtLeast } from "@/lib/auth/context";
import { syncFinLinkLeads, type SyncErgebnis } from "@/lib/platforms/finlink/sync";

const QUELLE = "finlink";

/** „Jetzt abgleichen" – derselbe Lauf wie der Cron, nur von Hand ausgelöst. */
export async function gleicheLeadsAb(): Promise<SyncErgebnis> {
  const ctx = await requireContext();
  const ergebnis = await syncFinLinkLeads({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  revalidatePath("/dashboard");
  return ergebnis;
}

export interface SchalterErgebnis {
  ok: boolean;
  aktiv: boolean;
  meldung?: string;
}

/**
 * Schaltet den automatischen Lead-Abgleich an oder aus.
 *
 * Wirkt auf beide Wege in die Akte hinein: den Cron alle 15 Minuten und den
 * Knopf „Jetzt abgleichen". Der bewusste Einzelimport über /cases/import
 * bleibt erlaubt – wer dort eine Vorgangsnummer eintippt, will genau diesen
 * einen Fall, unabhängig davon, ob der Zufluss von selbst laufen soll.
 *
 * Die Zeile wird bei Bedarf angelegt: Vor dem ersten Lauf gibt es sie nicht,
 * und gerade dann will man den Zufluss vielleicht schon abstellen.
 */
export async function setzeLeadAbgleich(aktiv: boolean): Promise<SchalterErgebnis> {
  const ctx = await requireContext();
  // Ein Teammitglied bearbeitet Akten; ob neue Fälle hereinkommen, ist eine
  // Entscheidung über den Betrieb der Organisation.
  if (!roleAtLeast(ctx.role, "vermittler")) {
    return { ok: false, aktiv, meldung: "Dafür fehlt dir die Berechtigung." };
  }

  const jetzt = new Date();
  await prisma.leadSyncState.upsert({
    where: { organizationId_quelle: { organizationId: ctx.organizationId, quelle: QUELLE } },
    create: {
      organizationId: ctx.organizationId,
      quelle: QUELLE,
      aktiv,
      pausiertAm: aktiv ? null : jetzt,
      /*
       * Beim Anlegen den Stichtag mitsetzen, sonst holt der erste Lauf nach
       * dem Wiedereinschalten den gesamten FinLink-Bestand herein: Ohne
       * syncedUntil gilt der Lauf als Erstlauf und setzt die Marke selbst –
       * hier legen wir sie gleich richtig.
       */
      syncedUntil: jetzt,
    },
    /*
     * Beim EINSCHALTEN rueckt der Stichtag auf jetzt.
     *
     * Sonst holte der erste Lauf alles nach, was waehrend der Pause aufgelaufen
     * ist - nach zwei Wochen "aus" entstuenden auf einen Schlag Dutzende Faelle,
     * die niemand in dem Moment erwartet. Verloren ist dabei nichts: Die Leads
     * stehen weiterhin in der Auswahlliste unter "Vorgang aus FinLink
     * importieren" und lassen sich einzeln holen.
     */
    update: aktiv
      ? { aktiv, pausiertAm: null, syncedUntil: jetzt, lastError: null }
      : { aktiv, pausiertAm: jetzt },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "leadimport.geschaltet",
    entityType: "organization",
    entityId: ctx.organizationId,
    metadata: { quelle: QUELLE, aktiv },
  });

  // Beide Orte, an denen der Schalter sichtbar ist.
  revalidatePath("/dashboard");
  revalidatePath("/connections");
  return {
    ok: true,
    aktiv,
    meldung: aktiv
      ? "Automatischer Abgleich läuft wieder."
      : "Automatischer Abgleich ist aus. Es kommen keine neuen FinLink-Leads mehr herein.",
  };
}
