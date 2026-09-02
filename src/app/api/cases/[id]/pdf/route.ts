import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ladeAkteFuerRoute } from "@/lib/auth/akte-zugriff";
import { audit } from "@/lib/audit";
import {
  renderBankSummary,
  renderMissingChecklist,
  renderAuditProtocol,
  renderPlatformExport,
  renderWohnflaeche,
  renderHandover,
  renderZertifikat,
} from "@/lib/pdf/renderer";
import {
  buildBankSummaryData,
  buildChecklistData,
  buildAuditProtocolData,
  buildPlatformExportData,
  buildWohnflaecheData,
  buildHandoverData,
  buildZertifikatData,
  type CasePdfType,
} from "@/lib/pdf/case-pdf";
import { PLATFORMS, type Platform } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serverseitige PDF-Erzeugung mit Audit + Tenant-Prüfung.
 * /api/cases/[id]/pdf?type=bank-summary|checklist|audit|platform[&platform=europace][&preview=1]
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zugriff = await ladeAkteFuerRoute(id);
  if (zugriff.status === 401) return new NextResponse("Nicht angemeldet.", { status: 401 });
  if (zugriff.status !== 200) return new NextResponse("Nicht gefunden.", { status: 404 });
  const { ctx } = zugriff;

  const type = (req.nextUrl.searchParams.get("type") ?? "bank-summary") as CasePdfType;
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const platformParam = req.nextUrl.searchParams.get("platform");

  let buffer: Buffer;
  let fileName: string;

  try {
    switch (type) {
      case "wohnflaeche": {
        const built = await buildWohnflaecheData(id, ctx.organizationId);
        if (!built) return new NextResponse("Noch keine Wohnflächenberechnung vorhanden.", { status: 404 });
        buffer = await renderWohnflaeche(built.data);
        fileName = built.fileName;
        break;
      }
      case "checklist": {
        const { data, fileName: fn } = await buildChecklistData(id, ctx.organizationId);
        buffer = await renderMissingChecklist(data);
        fileName = fn;
        break;
      }
      case "handover": {
        const { data, fileName: fn } = await buildHandoverData(id, ctx.organizationId);
        buffer = await renderHandover(data);
        fileName = fn;
        break;
      }
      case "audit": {
        const { data, fileName: fn } = await buildAuditProtocolData(id, ctx.organizationId);
        buffer = await renderAuditProtocol(data);
        fileName = fn;
        break;
      }
      case "platform": {
        if (!platformParam || !PLATFORMS.includes(platformParam as Platform)) {
          return new NextResponse("Unbekannte Plattform.", { status: 400 });
        }
        const { data, fileName: fn } = await buildPlatformExportData(id, ctx.organizationId, platformParam as Platform);
        buffer = await renderPlatformExport(data);
        fileName = fn;
        break;
      }
      case "zertifikat": {
        /*
         * Der Name unter der Unterschrift ist der ANGEMELDETE Nutzer, nicht
         * die Organisation: Das Zertifikat ist eine persönliche Bestätigung
         * des Beraters, und der Makler ruft die Nummer darunter an.
         *
         * `buildZertifikatData` wirft, wenn Kaufpreis, Objektadresse oder Name
         * fehlen. Die Fallakte sperrt den Knopf schon vorher; das hier fängt
         * den direkten Aufruf der URL ab.
         */
        const nutzer = await prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { name: true, email: true },
        });
        const { data, fileName: fn } = await buildZertifikatData(id, ctx.organizationId, {
          name: nutzer?.name ?? "",
          email: nutzer?.email ?? undefined,
        });
        buffer = await renderZertifikat(data);
        fileName = fn;
        break;
      }
      case "bank-summary":
      default: {
        const { data, fileName: fn } = await buildBankSummaryData(id, ctx.organizationId);
        buffer = await renderBankSummary(data);
        fileName = fn;
        break;
      }
    }
  } catch {
    return new NextResponse("PDF konnte nicht erstellt werden.", { status: 500 });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "pdf.generated",
    entityType: "case",
    entityId: id,
    metadata: { type, platform: platformParam ?? undefined },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
