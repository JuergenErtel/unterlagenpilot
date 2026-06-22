// src/lib/actions/lageplan.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { geocodeAddress, OSM_ATTRIBUTION } from "@/lib/geo/geocode";
import { buildTopPlusUrl, fetchMapPng, TOPPLUS_ATTRIBUTION } from "@/lib/geo/map";
import { geoportalFor } from "@/lib/geo/geoportale";
import { renderLageplan } from "@/lib/pdf/renderer";
import { getBrokerInfo, pdfFileName } from "@/lib/pdf/case-pdf";

export interface LageplanState {
  mapDataUri: string | null;
  lat: number | null;
  lon: number | null;
  bundesland: string | null;
  geoportalLabel: string;
  geoportalUrl: string;
  address: string;
  error?: string;
}

function emptyState(address: string): LageplanState {
  const { entry } = geoportalFor(null);
  return {
    mapDataUri: null,
    lat: null,
    lon: null,
    bundesland: null,
    geoportalLabel: entry.label,
    geoportalUrl: entry.url,
    address,
    error: undefined,
  };
}

export async function generateLageplanAction(
  caseId: string,
  _prev: LageplanState,
  formData: FormData
): Promise<LageplanState> {
  const { ctx } = await requireCaseAccess(caseId);
  const address = String(formData.get("address") ?? "").trim();
  if (!address) return { ...emptyState(""), error: "Bitte eine Objektadresse eingeben." };

  // Geocoding (nur Objektadresse; keine Adresse ins Log).
  let geo;
  try {
    geo = await geocodeAddress(address);
  } catch {
    return { ...emptyState(address), error: "Adress-Suche derzeit nicht möglich. Bitte später erneut versuchen." };
  }
  if (!geo) {
    return { ...emptyState(address), error: "Adresse nicht gefunden. Bitte präzisieren – der Geoportal-Link unten funktioniert weiterhin." };
  }

  const { entry } = geoportalFor(geo.bundesland);

  // Kartenbild holen.
  let mapDataUri: string | null = null;
  try {
    const png = await fetchMapPng(buildTopPlusUrl(geo.lat, geo.lon));
    mapDataUri = `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Karte optional – Koordinaten/Link bleiben nutzbar.
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "lageplan", geocoded: true, map: mapDataUri != null, bundesland: geo.bundesland ?? null },
  });

  revalidatePath(`/cases/${caseId}/lageplan`);
  return {
    mapDataUri,
    lat: geo.lat,
    lon: geo.lon,
    bundesland: geo.bundesland ?? null,
    geoportalLabel: entry.label,
    geoportalUrl: entry.url,
    address,
    error: mapDataUri ? undefined : "Karte derzeit nicht verfügbar – Koordinaten und Geoportal-Link sind nutzbar.",
  };
}

export interface LageplanPdfInput {
  address: string;
  lat: number;
  lon: number;
  bundesland: string;
  geoportalLabel: string;
  geoportalUrl: string;
  mapBase64: string;
}

export async function saveLageplanPdfAction(
  caseId: string,
  input: LageplanPdfInput
): Promise<{ documentId?: string; error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  try {
    const broker = await getBrokerInfo(ctx.organizationId);
    const caseRow = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { applicants: { orderBy: { position: "asc" } } },
    });
    const buffer = await renderLageplan({
      caseNumber: caseRow.caseNumber,
      dateStr: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      broker,
      address: input.address,
      lat: input.lat,
      lon: input.lon,
      bundesland: input.bundesland,
      geoportalLabel: input.geoportalLabel,
      geoportalUrl: input.geoportalUrl,
      attributions: `${TOPPLUS_ATTRIBUTION} · ${OSM_ATTRIBUTION}`,
      mapPng: Buffer.from(input.mapBase64, "base64"),
    });
    const fileName = pdfFileName("Lageplan", caseRow.applicants);
    const stored = await getStorage().put({
      organizationId: ctx.organizationId,
      caseId,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer,
    });
    const created = await prisma.document.create({
      data: {
        caseId,
        originalName: fileName,
        generatedName: fileName,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        documentType: "flurkarte_lageplan",
        uploadSource: "vermittler",
        scanStatus: "ready_for_ocr",
        readable: true,
      },
      select: { id: true },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "pdf.generated",
      entityType: "case",
      entityId: caseId,
      metadata: { feature: "lageplan", documentId: created.id },
    });
    revalidatePath(`/cases/${caseId}`);
    return { documentId: created.id };
  } catch {
    return { error: "Lageplan-PDF konnte nicht erstellt werden." };
  }
}
