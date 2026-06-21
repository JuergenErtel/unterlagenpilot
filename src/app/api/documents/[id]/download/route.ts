import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";
import { getStorage } from "@/lib/storage";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Authentifizierter, auditierter Dokumenten-Download/-Preview.
 * - Zugriff nur für angemeldete Nutzer der besitzenden Organisation (Tenant).
 * - Infizierte/abgelehnte Dateien werden nie ausgeliefert.
 * - Supabase: Weiterleitung auf eine kurzlebige signierte URL.
 * - local: direkter Stream aus dem Storage.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentContext();
  if (!ctx) return new NextResponse("Nicht angemeldet.", { status: 401 });

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      generatedName: true,
      originalName: true,
      scanStatus: true,
      case: { select: { id: true, organizationId: true } },
    },
  });
  // Existenz nicht preisgeben: gleiche Antwort bei „nicht da" und „fremde Org".
  if (!doc || doc.case.organizationId !== ctx.organizationId) {
    return new NextResponse("Nicht gefunden.", { status: 404 });
  }
  if (doc.scanStatus === "rejected" || doc.scanStatus === "quarantined") {
    return new NextResponse("Dokument ist aus Sicherheitsgründen gesperrt.", { status: 403 });
  }

  const preview = req.nextUrl.searchParams.get("preview") === "1";
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.downloaded",
    entityType: "document",
    entityId: doc.id,
    metadata: { mode: preview ? "preview" : "download" },
  });

  const storage = getStorage();
  const fileName = doc.generatedName || doc.originalName;

  // Provider mit signierten URLs (Supabase): dorthin weiterleiten.
  const signed = await storage.createSignedUrl(doc.storageKey, getEnv().DOWNLOAD_URL_TTL_SEC);
  if (signed) return NextResponse.redirect(signed);

  // Sonst direkt streamen (local/dev).
  const buffer = await storage.get(doc.storageKey);
  if (!buffer) return new NextResponse("Datei nicht verfügbar.", { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
