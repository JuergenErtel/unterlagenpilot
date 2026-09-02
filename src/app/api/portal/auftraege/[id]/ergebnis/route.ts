import { NextRequest, NextResponse } from "next/server";
import { zipSync } from "fflate";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { buildZipManifest, type ZipDoc } from "@/lib/documents/zip";
import { renderBankSummary, renderMissingChecklist, renderWohnflaeche } from "@/lib/pdf/renderer";
import { buildBankSummaryData, buildChecklistData, buildWohnflaecheData } from "@/lib/pdf/case-pdf";
import { ergebnisseFuer, type ErgebnisArt } from "@/lib/backoffice/leistungen";
import { ladePortalAuftragFuerRoute } from "@/lib/backoffice/portal-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYP_ZU_ERGEBNIS: Record<string, ErgebnisArt> = {
  checklist: "checkliste",
  zip: "dokumente",
  "bank-summary": "bank_zusammenfassung",
  wohnflaeche: "wohnflaeche",
};

/**
 * Ergebnisabruf fuer den Auftraggeber - erst nach der Uebergabe, und nur die
 * Ergebnisse, die der beauftragte Leistungsumfang hervorbringt. Die
 * Erzeuger sind dieselben wie in /api/cases/[id]/pdf und /zip.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zugang = await ladePortalAuftragFuerRoute(id);
  if (zugang.status === 401) return new NextResponse("Nicht angemeldet.", { status: 401 });
  if (zugang.status !== 200) return new NextResponse("Nicht gefunden.", { status: 404 });
  const { auftrag, ctx } = zugang;
  if (!auftrag.uebergebenAm) return new NextResponse("Das Ergebnis ist noch nicht übergeben.", { status: 409 });

  const type = req.nextUrl.searchParams.get("type") ?? "";
  const ergebnis = TYP_ZU_ERGEBNIS[type];
  if (!ergebnis || !ergebnisseFuer(auftrag.leistungen).includes(ergebnis)) {
    return new NextResponse("Dieses Ergebnis gehört nicht zum Leistungsumfang.", { status: 404 });
  }

  const orgId = auftrag.backofficeOrganizationId;
  let buffer: Buffer | Uint8Array;
  let fileName: string;
  let contentType = "application/pdf";

  try {
    switch (type) {
      case "checklist": {
        const built = await buildChecklistData(auftrag.caseId, orgId);
        buffer = await renderMissingChecklist(built.data);
        fileName = built.fileName;
        break;
      }
      case "bank-summary": {
        const built = await buildBankSummaryData(auftrag.caseId, orgId);
        buffer = await renderBankSummary(built.data);
        fileName = built.fileName;
        break;
      }
      case "wohnflaeche": {
        const built = await buildWohnflaecheData(auftrag.caseId, orgId);
        if (!built) return new NextResponse("Noch keine Wohnflächenberechnung vorhanden.", { status: 404 });
        buffer = await renderWohnflaeche(built.data);
        fileName = built.fileName;
        break;
      }
      default: {
        const docs = (await prisma.document.findMany({
          where: { caseId: auftrag.caseId },
          select: { generatedName: true, originalName: true, storageKey: true, scanStatus: true, reviewStatus: true },
          orderBy: { createdAt: "asc" },
        })) as ZipDoc[];
        const manifest = buildZipManifest(docs);
        if (manifest.length === 0) return new NextResponse("Keine exportierbaren Dokumente vorhanden.", { status: 404 });
        const storage = getStorage();
        const files: Record<string, Uint8Array> = {};
        await Promise.all(
          manifest.map(async (entry) => {
            const b = await storage.get(entry.storageKey).catch(() => null);
            if (b) files[entry.name] = new Uint8Array(b);
          })
        );
        if (Object.keys(files).length === 0) return new NextResponse("Die Dateien sind derzeit nicht abrufbar.", { status: 502 });
        buffer = zipSync(files, { level: 0 });
        fileName = `Auftrag_${auftrag.auftragsnummer}_Unterlagen.zip`;
        contentType = "application/zip";
      }
    }
  } catch (e) {
    console.error("[portal.ergebnis] Erzeugung fehlgeschlagen", { auftragId: auftrag.id, type, fehler: e instanceof Error ? e.message : String(e) });
    return new NextResponse("Das Ergebnis konnte nicht erzeugt werden.", { status: 500 });
  }

  await audit({
    organizationId: orgId,
    userId: ctx.userId,
    action: "backoffice.ergebnis_abgerufen",
    entityType: "backoffice_auftrag",
    entityId: auftrag.id,
    metadata: { type },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
