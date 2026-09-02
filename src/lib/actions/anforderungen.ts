"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext, akteSichtbarWhere, type AppContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { getEuropaceClient } from "@/lib/platforms/europace/client";
import { auswahlAus } from "@/lib/platforms/europace/anforderungen";
import { speichereAbruf } from "@/lib/anforderungen/speicher";

/**
 * Holt die Unterlagenanforderungen der Bank – ausgeloest vom Vermittler, nie
 * von allein. Welche Bank es wird, steht erst fest, wenn in Europace gerechnet
 * wurde; ein Zeitplan haette nichts, woran er sich orientieren koennte.
 */

/** Stellt sicher, dass der Fall zur Organisation des Nutzers gehoert. */
async function ladeFall(caseId: string, ctx: AppContext) {
  return prisma.case.findFirst({
    where: { id: caseId, ...akteSichtbarWhere(ctx) },
    select: { id: true },
  });
}

async function protokolliere(caseId: string, status: string, message: string) {
  await prisma.platformSyncLog.create({
    data: { caseId, platform: "europace", direction: "import", status, message },
  });
}

export async function vorgangsnummerSetzen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const nummer = String(formData.get("vorgangsnummer") ?? "").trim();
  if (!caseId || !nummer) return;
  if (!(await ladeFall(caseId, ctx))) return;

  // Dasselbe Feld, das die bestehende Uebertragung fuellt – dadurch profitiert
  // auch der Unterlagen-Upload von der Eingabe.
  await prisma.platformMapping.upsert({
    where: { caseId_platform: { caseId, platform: "europace" } },
    create: { caseId, platform: "europace", payload: {}, externalId: nummer },
    update: { externalId: nummer },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "Case",
    entityId: caseId,
    metadata: { feld: "europaceVorgangsnummer", nummer },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function anforderungenAbrufen(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const caseId = String(formData.get("caseId") ?? "");
  const quelle = String(formData.get("quelle") ?? "");
  const bezugsId = String(formData.get("bezugsId") ?? "").trim();
  const bankId = String(formData.get("bankId") ?? "").trim() || null;
  const bankName = String(formData.get("bankName") ?? "").trim() || "Bank unbekannt";

  if (!caseId || !bezugsId) return;
  if (quelle !== "antrag" && quelle !== "vorschlag") return;
  if (!(await ladeFall(caseId, ctx))) return;

  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });
  const vorgangsNummer = mapping?.externalId;
  if (!vorgangsNummer) {
    await protokolliere(caseId, "fehler", "Keine Vorgangsnummer hinterlegt.");
    revalidatePath(`/cases/${caseId}`);
    return;
  }

  const client = getEuropaceClient(ctx.organizationId);
  if (!client) {
    await protokolliere(caseId, "fehler", "Europace-Zugangsdaten fehlen.");
    revalidatePath(`/cases/${caseId}`);
    return;
  }

  try {
    const anforderungen = await client.holeAnforderungen({ quelle, vorgangsNummer, bezugsId });

    // Eine leere Liste ist ein Ergebnis, kein Erfolg mit null Zeilen.
    if (anforderungen.length === 0) {
      await protokolliere(
        caseId,
        "leer",
        `${bankName} hat zu diesem Vorgang keine Unterlagen angefordert.`
      );
      revalidatePath(`/cases/${caseId}`);
      return;
    }

    const r = await speichereAbruf({
      caseId,
      quelle,
      vorgangsNummer,
      bezugsId,
      bankId,
      bankName,
      anforderungen,
    });

    await protokolliere(caseId, "erfolg", `${r.zeilen} Anforderungen von ${bankName} geholt.`);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "platform.pushed",
      entityType: "Case",
      entityId: caseId,
      metadata: { richtung: "import", bankName, quelle, anzahl: r.zeilen },
    });
  } catch (e) {
    // Alles-oder-nichts: kein Teilstand, der spaeter jemanden in die Irre fuehrt.
    await protokolliere(caseId, "fehler", e instanceof Error ? e.message : "Unbekannter Fehler.");
  }

  revalidatePath(`/cases/${caseId}`);
}

/** Was Europace zu diesem Vorgang anbietet – fuer die Auswahl in der Karte. */
export async function auswahlLaden(caseId: string) {
  const ctx = await requireContext();
  if (!(await ladeFall(caseId, ctx))) return { fehler: "Fall nicht gefunden." };

  const mapping = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform: "europace" } },
    select: { externalId: true },
  });
  if (!mapping?.externalId) return { fehler: "Keine Vorgangsnummer hinterlegt." };

  const client = getEuropaceClient(ctx.organizationId);
  if (!client) return { fehler: "Europace-Zugangsdaten fehlen." };

  try {
    const [antraege, vorschlaege] = await Promise.all([
      client.holeAntraege(mapping.externalId),
      client.holeFinanzierungsvorschlaege(mapping.externalId),
    ]);
    return { auswahl: auswahlAus(antraege, vorschlaege) };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Europace nicht erreichbar." };
  }
}
