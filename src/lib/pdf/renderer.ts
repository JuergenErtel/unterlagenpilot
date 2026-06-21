import PDFDocument from "pdfkit";

/**
 * Serverseitige PDF-Erzeugung (pdfkit, pure JS – serverless-tauglich).
 * Bewusst datenarm: keine sensiblen Rohdaten in Logs, neutrale, banktaugliche
 * Formulierungen. Die Builder hier sind frameworkfrei und damit testbar.
 */

export interface BrokerInfo {
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  website?: string;
}

const COLORS = {
  text: "#1a1a1a",
  muted: "#6b7280",
  rule: "#d1d5db",
  accent: "#1f3a8a",
  warn: "#92400e",
};

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function newDoc(title: string): PDFKit.PDFDocument {
  return new PDFDocument({ size: "A4", margin: 50, info: { Title: title, Creator: "UnterlagenPilot" } });
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.6);
  doc.fillColor(COLORS.accent).fontSize(12).font("Helvetica-Bold").text(text.toUpperCase(), { characterSpacing: 0.5 });
  const y = doc.y + 2;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string) {
  const startY = doc.y;
  doc.font("Helvetica").fillColor(COLORS.muted).fontSize(9.5).text(label, 50, startY, { width: 160 });
  doc.fillColor(COLORS.text).fontSize(10).text(value || "—", 215, startY, { width: 330 });
  doc.moveDown(0.2);
}

function bullet(doc: PDFKit.PDFDocument, text: string, color = COLORS.text) {
  doc.fillColor(color).fontSize(10).text(`•  ${text}`, { indent: 4, width: 495 });
  doc.moveDown(0.1);
}

function footer(doc: PDFKit.PDFDocument, broker: BrokerInfo) {
  const y = 800;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  const line = [broker.name, [broker.street, [broker.zip, broker.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), broker.website]
    .filter(Boolean)
    .join("  ·  ");
  doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica").text(line, 50, y + 6, { width: 495, align: "center" });
}

function coverHeader(doc: PDFKit.PDFDocument, broker: BrokerInfo, title: string, subtitle: string, dateStr: string) {
  doc.fillColor(COLORS.accent).fontSize(9).font("Helvetica-Bold").text("UNTERLAGENPILOT", { characterSpacing: 1 });
  doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica").text("immocockpit24.de", { continued: false });
  doc.moveDown(1.5);
  doc.fillColor(COLORS.text).fontSize(20).font("Helvetica-Bold").text(title);
  doc.fillColor(COLORS.muted).fontSize(11).font("Helvetica").text(subtitle);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor(COLORS.muted).text(`Erstellt am ${dateStr}`);
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor(COLORS.muted).text(
    `${broker.name}${broker.street ? ", " + broker.street : ""}${broker.city ? ", " + [broker.zip, broker.city].filter(Boolean).join(" ") : ""}${broker.website ? " · " + broker.website : ""}`
  );
  doc.moveDown(0.5);
}

// ---------------------------------------------------------------------------
// A) Bankfähige Fallzusammenfassung
// ---------------------------------------------------------------------------

export interface BankSummaryData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  applicants: { name: string; birthDate?: string; maritalStatus?: string; employment?: string; incomeNet?: string }[];
  property: { type?: string; address?: string; livingArea?: string; buildYear?: string; usage?: string };
  financing: { kaufpreis?: string; nebenkosten?: string; eigenkapital?: string; darlehenswunsch?: string };
  documentsPresent: string[];
  documentsMissing: string[];
  notes: string[]; // neutrale Hinweise
  openPoints: string[];
}

export async function renderBankSummary(data: BankSummaryData): Promise<Buffer> {
  const doc = newDoc(`Bankzusammenfassung ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Bankfähige Fallzusammenfassung", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Antragsteller");
  if (data.applicants.length === 0) doc.text("Keine Antragstellerdaten erfasst.");
  data.applicants.forEach((a, i) => {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.text).text(`${i + 1}. ${a.name || "—"}`);
    doc.font("Helvetica");
    if (a.birthDate) kv(doc, "Geburtsdatum", a.birthDate);
    if (a.maritalStatus) kv(doc, "Familienstand", a.maritalStatus);
    if (a.employment) kv(doc, "Beschäftigung", a.employment);
    if (a.incomeNet) kv(doc, "Nettoeinkommen/Monat", a.incomeNet);
    doc.moveDown(0.3);
  });

  heading(doc, "Objekt");
  kv(doc, "Objektart", data.property.type ?? "—");
  kv(doc, "Adresse", data.property.address ?? "—");
  kv(doc, "Wohnfläche", data.property.livingArea ?? "—");
  kv(doc, "Baujahr", data.property.buildYear ?? "—");
  kv(doc, "Nutzung", data.property.usage ?? "—");

  heading(doc, "Finanzierungsbedarf");
  kv(doc, "Kaufpreis", data.financing.kaufpreis ?? "—");
  kv(doc, "Nebenkosten", data.financing.nebenkosten ?? "—");
  kv(doc, "Eigenkapital", data.financing.eigenkapital ?? "—");
  kv(doc, "Darlehenswunsch", data.financing.darlehenswunsch ?? "—");

  heading(doc, "Vorhandene Unterlagen");
  if (data.documentsPresent.length === 0) doc.text("—");
  data.documentsPresent.forEach((d) => bullet(doc, d));

  heading(doc, "Fehlende Unterlagen");
  if (data.documentsMissing.length === 0) doc.fillColor(COLORS.text).text("Keine offenen Pflichtunterlagen.");
  data.documentsMissing.forEach((d) => bullet(doc, d, COLORS.warn));

  if (data.notes.length > 0) {
    heading(doc, "Hinweise");
    data.notes.forEach((n) => bullet(doc, n));
  }

  if (data.openPoints.length > 0) {
    heading(doc, "Offene Punkte");
    data.openPoints.forEach((p) => bullet(doc, p, COLORS.warn));
  }

  doc.moveDown(1);
  doc.fillColor(COLORS.muted).fontSize(7.5).font("Helvetica").text(
    "Diese Zusammenfassung dient der strukturierten Unterlagenübergabe. Sie stellt keine Finanzierungszusage und keine Bonitäts- oder Machbarkeitsbewertung dar. Die fachliche Prüfung und Entscheidung obliegt der finanzierenden Bank.",
    { width: 495 }
  );

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// B) Fehlende-Unterlagen-Checkliste (kundenfreundlich)
// ---------------------------------------------------------------------------

export interface ChecklistData {
  customerName: string;
  dateStr: string;
  broker: BrokerInfo;
  items: { name: string; description?: string; done: boolean }[];
}

export async function renderMissingChecklist(data: ChecklistData): Promise<Buffer> {
  const doc = newDoc("Unterlagencheckliste");
  coverHeader(doc, data.broker, "Ihre Unterlagen-Checkliste", data.customerName ? `Für ${data.customerName}` : "", data.dateStr);

  doc.moveDown(0.4);
  doc.fillColor(COLORS.text).fontSize(10).font("Helvetica").text(
    "Bitte laden Sie die noch offenen Unterlagen über Ihren persönlichen, sicheren Link hoch. Bereits vorhandene Unterlagen sind abgehakt."
  );
  doc.moveDown(0.6);

  const open = data.items.filter((i) => !i.done);
  const done = data.items.filter((i) => i.done);

  heading(doc, `Noch offen (${open.length})`);
  if (open.length === 0) doc.text("Alles vollständig – vielen Dank!");
  open.forEach((i) => {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text).text(`☐  ${i.name}`);
    if (i.description) doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(i.description, { indent: 16 });
    doc.moveDown(0.2);
  });

  if (done.length > 0) {
    heading(doc, `Bereits erhalten (${done.length})`);
    done.forEach((i) => doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(`☑  ${i.name}`));
  }

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// C) Prüfprotokoll / Audit-Auszug (nur Metadaten)
// ---------------------------------------------------------------------------

export interface AuditProtocolData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  entries: { date: string; actor: string; action: string; detail?: string }[];
}

export async function renderAuditProtocol(data: AuditProtocolData): Promise<Buffer> {
  const doc = newDoc(`Prüfprotokoll ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Prüfprotokoll / Audit-Auszug", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Nachvollziehbare Vorgänge");
  doc.fillColor(COLORS.muted).fontSize(8).text("Es werden ausschließlich Metadaten dokumentiert (kein Klartext-Inhalt).");
  doc.moveDown(0.4);

  if (data.entries.length === 0) doc.fillColor(COLORS.text).fontSize(10).text("Keine Ereignisse vorhanden.");
  data.entries.forEach((e) => {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLORS.text).text(`${e.date}  ·  ${e.action}`);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(`${e.actor}${e.detail ? "  —  " + e.detail : ""}`);
    doc.moveDown(0.25);
  });

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// D) Plattform-Export-Zusammenfassung
// ---------------------------------------------------------------------------

export interface PlatformExportData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  platformLabel: string;
  readinessPercent: number;
  released: boolean;
  fields: { label: string; value: string; status?: string }[];
  missingFields: string[];
  missingDocuments: string[];
}

export async function renderPlatformExport(data: PlatformExportData): Promise<Buffer> {
  const doc = newDoc(`Export ${data.platformLabel} ${data.caseNumber}`);
  coverHeader(doc, data.broker, `Plattform-Export: ${data.platformLabel}`, `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Status");
  kv(doc, "Bereitschaftsgrad", `${data.readinessPercent} %`);
  kv(doc, "Manuelle Freigabe", data.released ? "freigegeben" : "noch nicht freigegeben");
  doc.moveDown(0.2);
  doc.fillColor(COLORS.muted).fontSize(8).text(
    "Hinweis: Es erfolgt KEINE automatische Übertragung. Die Felder dienen der manuellen Übernahme (Kopiermaske) in die Plattform nach Freigabe durch den Vermittler."
  );

  heading(doc, "Felder");
  data.fields.forEach((f) => kv(doc, f.label, f.value + (f.status ? `   (${f.status})` : "")));

  if (data.missingFields.length > 0) {
    heading(doc, "Fehlende Pflichtfelder");
    data.missingFields.forEach((m) => bullet(doc, m, COLORS.warn));
  }
  if (data.missingDocuments.length > 0) {
    heading(doc, "Fehlende Dokumente");
    data.missingDocuments.forEach((m) => bullet(doc, m, COLORS.warn));
  }

  footer(doc, data.broker);
  return docToBuffer(doc);
}
