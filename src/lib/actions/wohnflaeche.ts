// src/lib/actions/wohnflaeche.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { processUpload } from "@/lib/documents/pipeline";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { AIService } from "@/lib/ai/service";
import { computeWoflv, type WoflvRoom } from "@/lib/wohnflaeche/woflv";
import { toWoflvRooms, type FloorplanWoflvRoom } from "@/lib/wohnflaeche/schema";
import { buildWohnflaecheData } from "@/lib/pdf/case-pdf";
import { renderWohnflaeche } from "@/lib/pdf/renderer";

const ai = new AIService();

export interface WohnflaecheState {
  rooms: FloorplanWoflvRoom[];
  error?: string;
}

const VISION_MIME = new Set(["image/png", "image/jpeg"]);

export async function analyzeFloorplanAction(
  caseId: string,
  _prev: WohnflaecheState,
  formData: FormData
): Promise<WohnflaecheState> {
  const { ctx } = await requireCaseAccess(caseId);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { rooms: [], error: "Bitte mindestens einen Grundriss hochladen." };

  // 1) Grundrisse durch die sichere Pipeline (Validierung + Virenscan + Storage).
  const images: Array<{ base64: string; mimeType: string }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processUpload({
      organizationId: ctx.organizationId,
      caseId,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadSource: "vermittler",
      actorUserId: ctx.userId,
    });
    if (!result.ok || !result.documentId) continue;
    // Nur Bildformate an die Vision-KI (PDF-Seiten-Rendering ist hier nicht im Scope).
    if (VISION_MIME.has(file.type)) {
      images.push({ base64: buffer.toString("base64"), mimeType: file.type });
    }
  }

  if (images.length === 0) {
    return { rooms: [], error: "Für die KI-Analyse bitte JPG/PNG-Grundrisse hochladen (PDF wird gespeichert, aber nicht analysiert)." };
  }

  // 2) KI-Analyse (best effort).
  let rooms: FloorplanWoflvRoom[] = [];
  try {
    const analysis = await ai.analyzeFloorplan(images);
    rooms = toWoflvRooms(analysis);
  } catch {
    return { rooms: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen oder Räume manuell erfassen." };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "wohnflaeche", rooms: rooms.length, images: images.length },
  });

  revalidatePath(`/cases/${caseId}/wohnflaeche`);
  return { rooms };
}

export async function saveWohnflaecheAction(caseId: string, rooms: WoflvRoom[]): Promise<{ id: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const result = computeWoflv(rooms);
  const row = await prisma.wohnflaechenBerechnung.create({
    data: {
      caseId,
      rooms: result.rooms as unknown as object,
      summeWohnflaeche: result.summeWohnflaecheM2,
      summeZubehoer: result.summeZubehoerM2,
      released: true,
      model: "mistral-medium-latest",
    },
    select: { id: true },
  });

  // Spec §7: PDF als Falldokument ablegen.
  const built = await buildWohnflaecheData(caseId, ctx.organizationId);
  if (built) {
    const buffer = await renderWohnflaeche(built.data);
    const stored = await getStorage().put({
      organizationId: ctx.organizationId,
      caseId,
      originalName: built.fileName,
      mimeType: "application/pdf",
      buffer,
    });
    await prisma.document.create({
      data: {
        caseId,
        originalName: built.fileName,
        generatedName: built.fileName,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        documentType: "wohnflaechenberechnung",
        uploadSource: "vermittler",
        scanStatus: "ready_for_ocr",
        readable: true,
      },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "wohnflaeche", summeWohnflaeche: result.summeWohnflaecheM2 },
  });
  revalidatePath(`/cases/${caseId}/wohnflaeche`);
  return { id: row.id };
}
