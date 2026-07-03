import { NextRequest, NextResponse } from "next/server";
import { zipSync } from "fflate";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { buildZipManifest, type ZipDoc } from "@/lib/documents/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ZIP-Export aller (umbenannten) Falldokumente für die Bank-Einreichung.
 * - Nur für angemeldete Nutzer der besitzenden Organisation (Tenant).
 * - Enthält die generierten Dateinamen; abgelehnte/duplizierte und
 *   sicherheitsgesperrte Dokumente werden ausgelassen.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentContext();
  if (!ctx) return new NextResponse("Nicht angemeldet.", { status: 401 });

  const caseRow = await prisma.case.findUnique({
    where: { id },
    select: { organizationId: true, caseNumber: true },
  });
  if (!caseRow || caseRow.organizationId !== ctx.organizationId) {
    return new NextResponse("Nicht gefunden.", { status: 404 });
  }

  const docs = (await prisma.document.findMany({
    where: { caseId: id },
    select: {
      generatedName: true,
      originalName: true,
      storageKey: true,
      scanStatus: true,
      reviewStatus: true,
    },
    orderBy: { createdAt: "asc" },
  })) as ZipDoc[];

  const manifest = buildZipManifest(docs);
  if (manifest.length === 0) {
    return new NextResponse("Für diesen Fall liegen keine exportierbaren Dokumente vor.", { status: 404 });
  }

  const storage = getStorage();
  const files: Record<string, Uint8Array> = {};
  let missing = 0;
  await Promise.all(
    manifest.map(async (entry) => {
      const buffer = await storage.get(entry.storageKey).catch(() => null);
      if (buffer) files[entry.name] = new Uint8Array(buffer);
      else missing += 1;
    })
  );

  if (Object.keys(files).length === 0) {
    return new NextResponse("Die Dateien sind derzeit nicht abrufbar.", { status: 502 });
  }

  // Store-only (level 0): PDFs/JPG/PNG sind bereits komprimiert -> kein Nutzen,
  // spart CPU/Zeit auf der Function.
  const zipped = zipSync(files, { level: 0 });
  const fileName = `Fall_${caseRow.caseNumber}_Unterlagen.zip`;

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.downloaded",
    entityType: "case",
    entityId: id,
    metadata: { export: "zip", documents: Object.keys(files).length, missing },
  });

  return new NextResponse(new Uint8Array(zipped), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
