import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { buildDsgvoExport } from "@/lib/dsgvo/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DSGVO-Datenauskunft (Art. 15/20): liefert alle zu einem Fall gespeicherten
 * personenbezogenen Daten als strukturierte JSON-Datei. Tenant-geprüft, auditiert.
 * Dokument-Token/Hashes werden ausgeschlossen; Original-Dateien gibt es via ZIP.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentContext();
  if (!ctx) return new NextResponse("Nicht angemeldet.", { status: 401 });

  const caseRow = await prisma.case.findUnique({
    where: { id },
    include: {
      applicants: {
        orderBy: { position: "asc" },
        include: { employment: true, income: true },
      },
      property: true,
      financingRequest: true,
      liabilities: true,
      assets: true,
      customerForm: true,
      documents: {
        orderBy: { createdAt: "asc" },
        include: { extractedFields: true, pages: { orderBy: { pageNumber: "asc" } } },
      },
      generatedMessages: { orderBy: { createdAt: "asc" } },
      uploadLinks: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!caseRow || caseRow.organizationId !== ctx.organizationId) {
    return new NextResponse("Nicht gefunden.", { status: 404 });
  }

  // Audit-Einträge für den Fall UND seine Dokumente.
  const entityIds = [id, ...caseRow.documents.map((d) => d.id)];
  const auditRows = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityId: { in: entityIds } },
    orderBy: { createdAt: "asc" },
    select: { action: true, entityType: true, createdAt: true, metadata: true },
  });

  const { organizationId: _org, brokerId: _broker, ...caseSafe } = caseRow;
  void _org;
  void _broker;

  const exportObj = buildDsgvoExport({
    exportedAt: new Date().toISOString(),
    case: {
      caseNumber: caseRow.caseNumber,
      status: caseRow.status,
      createdAt: caseRow.createdAt,
      financingType: caseRow.financingType,
      kapitalanlage: caseRow.kapitalanlage,
      selbstnutzung: caseRow.selbstnutzung,
      notes: caseRow.notes,
    },
    applicants: caseRow.applicants.map((a) => ({
      position: a.position,
      vorname: a.vorname,
      nachname: a.nachname,
      geburtsdatum: a.geburtsdatum,
      geburtsort: a.geburtsort,
      staatsangehoerigkeit: a.staatsangehoerigkeit,
      familienstand: a.familienstand,
      anzahlKinder: a.anzahlKinder,
      strasse: a.street,
      plz: a.zip,
      ort: a.city,
      email: a.email,
      telefon: a.phone,
      employment: a.employment,
      income: a.income,
    })),
    property: caseRow.property,
    financing: caseRow.financingRequest,
    liabilities: caseRow.liabilities,
    assets: caseRow.assets,
    documents: caseRow.documents.map((d) => ({
      originalName: d.originalName,
      generatedName: d.generatedName,
      documentType: d.documentType,
      uploadSource: d.uploadSource,
      createdAt: d.createdAt,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      scanStatus: d.scanStatus,
      reviewStatus: d.reviewStatus,
      extractedFields: d.extractedFields.map((f) => ({
        key: f.key,
        label: f.label,
        value: f.value,
        correctedValue: f.correctedValue,
      })),
      ocrText: d.pages.map((p) => p.ocrText ?? "").join("\n").trim(),
    })),
    messages: caseRow.generatedMessages.map((m) => ({
      channel: m.channel,
      templateType: m.templateType,
      subject: m.subject,
      body: m.body,
      sent: m.sent,
      createdAt: m.createdAt,
    })),
    uploadLinks: caseRow.uploadLinks.map((l) => ({
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      active: l.active,
      usedCount: l.usedCount,
      maxUploads: l.maxUploads,
    })),
    customerForm: caseRow.customerForm
      ? { data: caseRow.customerForm.data, submitted: caseRow.customerForm.submitted, createdAt: caseRow.customerForm.createdAt }
      : null,
    auditLog: auditRows.map((a) => ({
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt,
      metadata: a.metadata,
    })),
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "customer.data_exported",
    entityType: "case",
    entityId: id,
    metadata: { format: "json", documents: caseRow.documents.length },
  });

  const body = JSON.stringify(exportObj, null, 2);
  const fileName = `DSGVO-Auskunft_${caseRow.caseNumber}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
