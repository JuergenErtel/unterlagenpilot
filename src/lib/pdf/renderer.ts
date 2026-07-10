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
  return new PDFDocument({ size: "A4", margin: 50, info: { Title: title, Creator: "BaufiDesk" } });
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
  doc.fillColor(COLORS.accent).fontSize(9).font("Helvetica-Bold").text("BAUFIDESK", { characterSpacing: 1 });
  doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica").text("baufidesk.de", { continued: false });
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

// ---------------------------------------------------------------------------
// E) Wohnflächenberechnung nach WoFlV
// ---------------------------------------------------------------------------

export interface WohnflaecheData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  rooms: Array<{ geschoss: string; raumname: string; kategorie: string; flaecheM2: number; faktor: number; anrechenbarM2: number; istZubehoer: boolean }>;
  summeWohnflaeche: number;
  summeZubehoer: number;
}

const KAT_LABEL: Record<string, string> = {
  wohnraum: "Wohnraum",
  balkon_terrasse_loggia: "Balkon/Terrasse",
  zubehoer_keller_hobby_abstell: "Zubehör",
  wintergarten: "Wintergarten",
  schwimmbad: "Schwimmbad",
};

export async function renderWohnflaeche(data: WohnflaecheData): Promise<Buffer> {
  const doc = newDoc(`Wohnflaechenberechnung ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Wohnflächenberechnung nach WoFlV", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Aufstellung");
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  data.rooms.forEach((r) => {
    const line = `${r.geschoss} · ${r.raumname} (${KAT_LABEL[r.kategorie] ?? r.kategorie}) — ${r.flaecheM2.toFixed(2)} m² × ${Math.round(r.faktor * 100)}% = ${r.anrechenbarM2.toFixed(2)} m²${r.istZubehoer ? "  [Zubehör]" : ""}`;
    doc.text(line);
    doc.moveDown(0.1);
  });

  heading(doc, "Summen");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f3a8a");
  doc.text(`Anrechenbare Wohnfläche: ${data.summeWohnflaeche.toFixed(2)} m²`);
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
  doc.text(`Zubehörflächen (nicht angerechnet): ${data.summeZubehoer.toFixed(2)} m²`);

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Berechnung auf Basis der vorgelegten Pläne – ersetzt keine amtliche Aufmaß-/Vermesserbescheinigung. Werte vor Verwendung prüfen.",
    { width: 495 }
  );

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// F) Einkommensanalyse Selbständige
// ---------------------------------------------------------------------------

export interface EinkommensanalyseData {
  applicantName: string;
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  jahre: number[];
  rows: Array<{ label: string; cells: Record<number, number | null>; trend: "steigend" | "fallend" | "stabil" | "unbekannt" }>;
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
  einkommensansatzMonat: number | null;
  begleittext?: { heading: string; paragraphs: string[] };
}

const TREND_LABEL: Record<string, string> = {
  steigend: "↑ steigend",
  fallend: "↓ fallend",
  stabil: "→ stabil",
  unbekannt: "—",
};

function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export async function renderEinkommensanalyse(data: EinkommensanalyseData): Promise<Buffer> {
  const doc = newDoc(`Einkommensanalyse ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Einkommensanalyse Selbständige", `${data.applicantName} · Vorgang ${data.caseNumber}`, data.dateStr);

  if (data.begleittext) {
    heading(doc, data.begleittext.heading);
    data.begleittext.paragraphs.forEach((p) => {
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(p, { width: 495 });
      doc.moveDown(0.3);
    });
  }

  heading(doc, "Kennzahlen je Jahr");
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  if (data.rows.length === 0) {
    doc.text("Keine Kennzahlen erfasst.");
  } else {
    const head = `Kennzahl  ·  ${data.jahre.join("   ")}   ·  Trend`;
    doc.font("Helvetica-Bold").text(head);
    doc.font("Helvetica");
    data.rows.forEach((r) => {
      const cols = data.jahre.map((j) => eur(r.cells[j] ?? null)).join("   ");
      doc.text(`${r.label}: ${cols}   (${TREND_LABEL[r.trend] ?? r.trend})`);
      doc.moveDown(0.1);
    });
  }

  if (data.einkommensansatzJahr != null) {
    heading(doc, "Einkommensansatz (Vermittler)");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f3a8a");
    doc.text(`${eur(data.einkommensansatzJahr)} p. a.  ·  ${eur(data.einkommensansatzMonat)} / Monat`);
    doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  }

  if (data.docNotes.length > 0) {
    heading(doc, "Einordnung je Dokument");
    data.docNotes.forEach((n) => {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1a1a1a").text(n.label);
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(n.notiz || "—");
      doc.moveDown(0.2);
    });
  }

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Werte prüfen.",
    { width: 495 }
  );

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// G) Lageplan (Orientierung)
// ---------------------------------------------------------------------------

export interface LageplanData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  address: string;
  lat: number;
  lon: number;
  bundesland: string;
  geoportalLabel: string;
  geoportalUrl: string;
  attributions: string;
  mapPng: Buffer;
}

export async function renderLageplan(data: LageplanData): Promise<Buffer> {
  const doc = newDoc(`Lageplan ${data.caseNumber}`);
  coverHeader(doc, data.broker, "Lageplan (Orientierung)", `Vorgang ${data.caseNumber}`, data.dateStr);

  heading(doc, "Objekt");
  doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a");
  doc.text(data.address || "—");
  doc.fillColor("#6b7280").fontSize(8).text(`Koordinaten: ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)} · ${data.bundesland || "—"}`);

  heading(doc, "Kartenausschnitt");
  // Quadratisches Kartenbild, Objekt in der Mitte.
  const mapSize = 360;
  const x = 50;
  const y = doc.y + 4;
  let imageOk = true;
  try {
    doc.image(data.mapPng, x, y, { fit: [mapSize, mapSize] });
  } catch {
    imageOk = false;
    doc.fillColor("#92400e").fontSize(9).text("Kartenbild konnte nicht eingebettet werden.");
  }
  // Markierung in der Bildmitte (Objektposition = Kartenzentrum) – nur wenn Bild erfolgreich eingebettet.
  if (imageOk) {
    const cx = x + mapSize / 2;
    const cy = y + mapSize / 2;
    doc.strokeColor("#c0152f").lineWidth(2);
    doc.moveTo(cx - 8, cy).lineTo(cx + 8, cy).stroke();
    doc.moveTo(cx, cy - 8).lineTo(cx, cy + 8).stroke();
    doc.circle(cx, cy, 9).strokeColor("#c0152f").lineWidth(1.5).stroke();
  }
  doc.y = y + mapSize + 8;

  heading(doc, "Amtliche Flurkarte");
  doc.font("Helvetica").fontSize(10).fillColor("#1f3a8a").text(`${data.geoportalLabel}: ${data.geoportalUrl}`, { link: data.geoportalUrl, underline: true });
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a").text("Den amtlichen Auszug über das Geoportal des Bundeslandes abrufen.");

  doc.moveDown(1);
  doc.fillColor("#6b7280").fontSize(7.5).font("Helvetica").text(
    "Orientierungs-Lageplan – kein amtlicher Auszug; amtliche Flurkarte über das Landes-Geoportal.",
    { width: 495 }
  );
  doc.fillColor("#9ca3af").fontSize(7).text(`Kartenquellen: ${data.attributions}`, { width: 495 });

  footer(doc, data.broker);
  return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// F) Übergabe-Deckblatt (bankfertiges Einreichpaket)
// ---------------------------------------------------------------------------

export interface HandoverData {
  caseNumber: string;
  dateStr: string;
  broker: BrokerInfo;
  bankName?: string;
  applicants: string; // "Max & Erika Mustermann"
  objekt?: string;
  finanzierung?: string;
  /** Beigefügte Unterlagen in Reihenfolge (Inhaltsverzeichnis). */
  enthalten: string[];
  /** Noch nachzureichen. */
  nachreichen: string[];
  /** Kurzfazit Haushaltsrechnung, optional. */
  haushalt?: { ueberschuss: string; tragfaehig: boolean };
  hinweis?: string;
}

export async function renderHandover(data: HandoverData): Promise<Buffer> {
  const doc = newDoc(`Übergabe ${data.caseNumber}`);
  coverHeader(
    doc,
    data.broker,
    "Einreichungspaket – Übergabe",
    `Vorgang ${data.caseNumber}${data.bankName ? " · " + data.bankName : ""}`,
    data.dateStr
  );

  heading(doc, "Eckdaten");
  kv(doc, "Antragsteller", data.applicants || "—");
  if (data.objekt) kv(doc, "Objekt", data.objekt);
  if (data.finanzierung) kv(doc, "Finanzierung", data.finanzierung);
  if (data.bankName) kv(doc, "Einreichung bei", data.bankName);
  if (data.haushalt) {
    kv(doc, "Haushaltsrechnung", `Überschuss ${data.haushalt.ueberschuss} (${data.haushalt.tragfaehig ? "tragfähig" : "prüfen"})`);
  }

  heading(doc, `Beigefügte Unterlagen (${data.enthalten.length})`);
  if (data.enthalten.length === 0) doc.text("Keine freigegebenen Unterlagen im Paket.");
  data.enthalten.forEach((name, i) => {
    doc.fillColor(COLORS.text).fontSize(10).text(`${String(i + 1).padStart(2, "0")}.  ${name}`, { width: 495 });
    doc.moveDown(0.05);
  });

  heading(doc, `Noch nachzureichen (${data.nachreichen.length})`);
  if (data.nachreichen.length === 0) {
    doc.fillColor(COLORS.text).fontSize(10).text("Keine offenen Unterlagen – Paket vollständig.");
  } else {
    data.nachreichen.forEach((name) => bullet(doc, name, COLORS.warn));
  }

  if (data.hinweis) {
    heading(doc, "Übergabenotiz");
    doc.fillColor(COLORS.text).fontSize(10).text(data.hinweis, { width: 495 });
  }

  footer(doc, data.broker);
  return docToBuffer(doc);
}
