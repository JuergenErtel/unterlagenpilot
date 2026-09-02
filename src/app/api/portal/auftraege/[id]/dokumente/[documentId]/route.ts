import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { isDeliverableScanStatus } from "@/lib/domain/enums";
import { ladePortalAuftragFuerRoute } from "@/lib/backoffice/portal-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dokument-Download fuer den Auftraggeber. Dieselben Regeln wie die interne
 * Download-Route (Allowlist der Scan-Status, signierte URL, Audit) - nur die
 * Berechtigung kommt aus dem Auftrag statt aus der Organisation der Akte.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const zugang = await ladePortalAuftragFuerRoute(id);
  if (zugang.status === 401) return new NextResponse("Nicht angemeldet.", { status: 401 });
  if (zugang.status !== 200) return new NextResponse("Nicht gefunden.", { status: 404 });

  const doc = await prisma.document.findFirst({
    where: { id: documentId, caseId: zugang.auftrag.caseId },
    select: { id: true, storageKey: true, mimeType: true, generatedName: true, originalName: true, scanStatus: true },
  });
  if (!doc) return new NextResponse("Nicht gefunden.", { status: 404 });
  if (!isDeliverableScanStatus(doc.scanStatus)) {
    return new NextResponse("Dokument ist aus Sicherheitsgründen gesperrt.", { status: 403 });
  }

  const preview = req.nextUrl.searchParams.get("preview") === "1";
  await audit({
    organizationId: zugang.auftrag.backofficeOrganizationId,
    userId: zugang.ctx.userId,
    action: "document.downloaded",
    entityType: "document",
    entityId: doc.id,
    metadata: { mode: preview ? "preview" : "download", quelle: "portal", auftragId: zugang.auftrag.id },
  });

  const storage = getStorage();
  const fileName = doc.generatedName || doc.originalName;
  const signed = await storage.createSignedUrl(doc.storageKey, getEnv().DOWNLOAD_URL_TTL_SEC);
  if (signed) return NextResponse.redirect(signed);

  const buffer = await storage.get(doc.storageKey);
  if (!buffer) return new NextResponse("Datei nicht verfügbar.", { status: 404 });
  const SAFE_INLINE = new Set(["application/pdf", "image/jpeg", "image/png"]);
  const safeType = SAFE_INLINE.has(doc.mimeType ?? "") ? doc.mimeType! : "application/octet-stream";
  const inline = preview && safeType !== "application/octet-stream";
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
