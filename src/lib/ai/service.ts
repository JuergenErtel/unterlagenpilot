import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AIProvider } from "./types";
import { getAIProvider } from "./factory";
import {
  classificationSchema,
  extractionSchema,
  scanQualitySchema,
  duplicateSchema,
  assignmentSchema,
  plausibilityResultSchema,
  missingDocumentsResultSchema,
  bankSummarySchema,
  generatedMessageSchema,
  platformMappingSchema,
  type ClassificationResult,
  type ExtractionResult,
  type ScanQualityResult,
  type DuplicateResult,
  type AssignmentResult,
  type PlausibilityResult,
  type MissingDocumentsResult,
  type BankSummary,
  type GeneratedMessageResult,
  type PlatformMappingResult,
  type ExtractedField,
} from "@/lib/domain/ai-schemas";
import type { DocumentType, Platform } from "@/lib/domain/enums";
import type { CanonicalCase } from "@/lib/domain/canonical";

/**
 * AIService – die einzige Schnittstelle für KI-Auswertungen.
 * Garantien:
 *  - Ausgaben werden IMMER gegen Zod-Schemas validiert.
 *  - Bei Validierungsfehler: Retry mit Repair-Hinweis (max. 2 Versuche).
 *  - Jede Auswertung trägt Konfidenzwerte.
 *  - Kritische Daten werden nie automatisch übernommen (Freigabe-Pflicht im UI).
 *  - Keine Kundendaten in Logs.
 */
export class AIService {
  constructor(private provider: AIProvider = getAIProvider()) {}

  private async run<S extends z.ZodTypeAny>(
    schemaName: string,
    schema: S,
    system: string,
    user: string,
    hints?: Record<string, unknown>,
    maxAttempts = 2
  ): Promise<z.output<S>> {
    const jsonSchema = toJsonSchema(schemaName, schema);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const repair =
        attempt > 1
          ? `\n\nDie vorherige Antwort war ungültig (${describe(lastError)}). Antworte ausschließlich mit gültigem JSON gemäß Schema.`
          : "";
      try {
        const raw = await this.provider.completeJSON({
          schemaName,
          system,
          user: user + repair,
          jsonSchema,
          hints: { ...hints, attempt },
        });
        return schema.parse(raw);
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `KI-Ausgabe konnte nach ${maxAttempts} Versuchen nicht validiert werden (${schemaName}): ${describe(lastError)}`
    );
  }

  // ---------------- Kern-LLM-Methoden ----------------

  classifyDocument(
    fileText: string,
    metadata: { pageCount?: number; forceType?: DocumentType } = {}
  ): Promise<ClassificationResult> {
    return this.run(
      "classification",
      classificationSchema,
      "Du klassifizierst deutsche Baufinanzierungsunterlagen. Antworte nur als JSON.",
      `Klassifiziere folgendes Dokument:\n${truncate(fileText)}`,
      { fileText, ...metadata }
    );
  }

  extractFields(
    documentType: DocumentType,
    fileText: string,
    _caseContext?: Partial<CanonicalCase>
  ): Promise<ExtractionResult> {
    return this.run(
      "extraction",
      extractionSchema,
      "Du extrahierst strukturierte Felder aus Baufinanzierungsunterlagen. Jedes Feld mit Konfidenz. Antworte nur als JSON.",
      `Extrahiere alle relevanten Felder aus diesem ${documentType}:\n${truncate(fileText)}`,
      { fileText, documentType }
    );
  }

  summarizeDocument(
    documentType: DocumentType,
    extractedFields: ExtractedField[]
  ): Promise<ExtractionResult> {
    // Verdichtung der Felder – nutzt dasselbe Schema, hier deterministisch.
    return Promise.resolve({
      documentType,
      fields: extractedFields,
      warnings: [],
      overallConfidence:
        extractedFields.length === 0
          ? 0.5
          : extractedFields.reduce((a, f) => a + f.confidence, 0) /
            extractedFields.length,
    });
  }

  detectDuplicateDocuments(
    documentA: { text: string },
    documentB: { text: string }
  ): Promise<DuplicateResult> {
    return this.run(
      "duplicate",
      duplicateSchema,
      "Du erkennst doppelte/fast identische Dokumente. Antworte nur als JSON.",
      "Vergleiche die beiden Dokumente.",
      { textA: documentA.text, textB: documentB.text }
    );
  }

  assessScanQuality(
    _fileMetadata: Record<string, unknown>,
    ocrText: string
  ): Promise<ScanQualityResult> {
    return this.run(
      "scanQuality",
      scanQualitySchema,
      "Du bewertest die Scan-Qualität (Lesbarkeit, Auflösung, fehlende/abgeschnittene Seiten). Antworte nur als JSON.",
      `Bewerte die Qualität dieses OCR-Texts:\n${truncate(ocrText)}`,
      { fileText: ocrText }
    );
  }

  assignDocumentToApplicantOrProperty(
    document: { text: string; detectedApplicant?: string | null },
    caseData: Partial<CanonicalCase>
  ): Promise<AssignmentResult> {
    const applicantPosition = guessApplicant(document.detectedApplicant, caseData);
    return this.run(
      "assignment",
      assignmentSchema,
      "Du ordnest ein Dokument einem Antragsteller/Objekt/Finanzierung zu. Antworte nur als JSON.",
      "Ordne das Dokument zu.",
      {
        fileText: document.text,
        applicantPosition,
        propertyRef: caseData.property?.strasse ?? null,
      }
    );
  }

  // ---------------- Fachanalysen (KO-Kriterien) ----------------

  /** Gehaltsabrechnung: KO-Kriterien & Warnhinweise (intern). */
  analyzePayslip(
    extractedFields: ExtractedField[],
    _caseContext?: Partial<CanonicalCase>
  ): PlausibilityResult {
    const get = (k: string) => extractedFields.find((f) => f.key === k)?.value;
    const checks = [] as PlausibilityResult["checks"];
    const push = (
      key: string,
      status: "ok" | "warnung" | "kritisch" | "fehlt",
      explanation: string,
      action?: string
    ) =>
      checks.push({
        key,
        category: "Gehaltsabrechnung",
        status,
        explanation,
        recommendedAction: action,
        customerVisible: false,
        relevantEuropace: true,
        relevantFinlink: false,
        relevantEhyp: true,
      });

    if (get("austrittsdatum")) push("payslip.austritt", "kritisch", "Austrittsdatum in der Gehaltsabrechnung vorhanden.", "Beschäftigungsverhältnis klären.");
    if (!get("steuerId")) push("payslip.steuerId", "warnung", "Keine erkennbare Steuer-ID.", "Steuer-ID nacherfassen.");
    const netto = Number(get("netto") ?? 0);
    const auszahlung = Number(get("auszahlungsbetrag") ?? 0);
    if (netto && auszahlung && Math.abs(netto - auszahlung) / netto > 0.2)
      push("payslip.auszahlung", "warnung", "Auszahlungsbetrag weicht stark vom Netto ab (Sonderpositionen/Pfändung?).", "Sonderpositionen prüfen.");
    if (checks.length === 0) push("payslip.ok", "ok", "Keine Auffälligkeiten in der Gehaltsabrechnung erkannt.");
    return { checks, overallConfidence: 0.8 };
  }

  /** Grundbuch: Belastungen, Eigentümer, Aktualität. */
  analyzeLandRegister(
    extractedFields: ExtractedField[],
    _caseContext?: Partial<CanonicalCase>
  ): PlausibilityResult {
    const get = (k: string) => String(extractedFields.find((f) => f.key === k)?.value ?? "");
    const checks: PlausibilityResult["checks"] = [];
    const abt2 = get("abteilungII").toLowerCase();
    const abt3 = get("abteilungIII").toLowerCase();
    if (abt2 && !abt2.includes("keine"))
      checks.push(mk("landreg.abt2", "Grundbuch", "warnung", "Lasten/Beschränkungen in Abteilung II eingetragen."));
    if (abt3 && !abt3.includes("keine"))
      checks.push(mk("landreg.abt3", "Grundbuch", "warnung", "Bestehende Grundpfandrechte in Abteilung III."));
    if (checks.length === 0)
      checks.push(mk("landreg.ok", "Grundbuch", "ok", "Keine kritischen Eintragungen erkannt."));
    return { checks, overallConfidence: 0.78 };
  }

  /** Kontoauszüge (vorbereitet). */
  analyzeBankStatements(
    extractedFields: ExtractedField[],
    _caseContext?: Partial<CanonicalCase>
  ): PlausibilityResult {
    // Architektur vorbereitet – im MVP keine Pflicht.
    return {
      checks: [
        mk("bank.ok", "Kontoauszug", extractedFields.length ? "ok" : "fehlt", extractedFields.length ? "Kontoauszüge vorhanden (Detailanalyse vorbereitet)." : "Keine Kontoauszüge vorhanden."),
      ],
      overallConfidence: 0.6,
    };
  }

  /** Exposé/Objektunterlagen: Vollständigkeit. */
  analyzePropertyDocuments(
    extractedFields: ExtractedField[],
    _caseContext?: Partial<CanonicalCase>
  ): PlausibilityResult {
    const get = (k: string) => extractedFields.find((f) => f.key === k)?.value;
    const checks: PlausibilityResult["checks"] = [];
    if (!get("baujahr")) checks.push(mk("prop.baujahr", "Objekt", "warnung", "Kein Baujahr im Exposé erkennbar."));
    if (!get("wohnflaeche")) checks.push(mk("prop.wohnflaeche", "Objekt", "warnung", "Keine Wohnfläche erkennbar."));
    if (!get("grundstuecksflaeche")) checks.push(mk("prop.grundstueck", "Objekt", "warnung", "Keine Grundstücksgröße erkennbar."));
    if (!get("kaufpreis")) checks.push(mk("prop.kaufpreis", "Objekt", "kritisch", "Kein klarer Kaufpreis erkennbar."));
    if (checks.length === 0) checks.push(mk("prop.ok", "Objekt", "ok", "Objektangaben plausibel."));
    return { checks, overallConfidence: 0.75 };
  }

  // ---------------- Engine-gestützte Methoden ----------------

  /** Fehlende Unterlagen gegen Checkliste + Plattformanforderungen. */
  detectMissingDocuments(input: {
    caseData: Partial<CanonicalCase>;
    checklist: Array<{ key: string; name: string; status: string; level: string; platforms: Platform[]; documentType: DocumentType | null }>;
    platformRequirements?: Array<{ key: string; title: string; platform: Platform; documentType: DocumentType | null; level: string }>;
  }): MissingDocumentsResult {
    const missing: MissingDocumentsResult["missing"] = [];
    for (const item of input.checklist) {
      if (["offen", "unvollstaendig", "nicht_aktuell"].includes(item.status)) {
        missing.push({
          requirementKey: item.key,
          documentType: item.documentType,
          title: item.name,
          reason:
            item.status === "nicht_aktuell"
              ? "Unterlage vorhanden, aber nicht aktuell genug."
              : item.status === "unvollstaendig"
                ? "Unterlage unvollständig."
                : "Unterlage fehlt.",
          level: item.level as MissingDocumentsResult["missing"][number]["level"],
          platform: (item.platforms[0] ?? "allgemein") as MissingDocumentsResult["missing"][number]["platform"],
          bank: null,
          customerVisible: true,
        });
      }
    }
    return missingDocumentsResultSchema.parse({ missing, confidence: 0.9 });
  }

  detectBankSpecificRequirements(input: {
    caseData: Partial<CanonicalCase>;
    bankRules: Array<{ bankName: string; key: string; title: string; documentType: DocumentType | null; level: string }>;
  }): MissingDocumentsResult {
    const missing = input.bankRules.map((r) => ({
      requirementKey: r.key,
      documentType: r.documentType,
      title: r.title,
      reason: `Zusätzliche Anforderung der Bank ${r.bankName}.`,
      level: "bankabhaengig" as const,
      platform: "allgemein" as const,
      bank: r.bankName,
      customerVisible: false,
    }));
    return missingDocumentsResultSchema.parse({ missing, confidence: 0.7 });
  }

  /** Plausibilitäts-Engine (deterministischer Kern, validiert). */
  analyzePlausibility(input: {
    caseData: Partial<CanonicalCase>;
    documents: Array<{ documentType: DocumentType | null; fields: ExtractedField[] }>;
  }): PlausibilityResult {
    const checks: PlausibilityResult["checks"] = [];
    const byType = (t: DocumentType) =>
      input.documents.find((d) => d.documentType === t)?.fields ?? [];

    // Name Formular vs. Ausweis
    const ausweis = byType("personalausweis");
    const formName = input.caseData.applicants?.[0];
    const ausweisName = ausweis.find((f) => f.key === "nachname")?.value;
    if (formName?.nachname && ausweisName && String(ausweisName).toLowerCase() !== formName.nachname.toLowerCase()) {
      checks.push(mk("plaus.name", "Identität", "kritisch", "Name aus Formular und Personalausweis stimmen nicht überein."));
    }

    // Gehaltsabrechnung KO
    checks.push(...this.analyzePayslip(byType("gehaltsabrechnung")).checks);
    // Grundbuch
    if (byType("grundbuchauszug").length) checks.push(...this.analyzeLandRegister(byType("grundbuchauszug")).checks);
    // Exposé
    if (byType("expose").length) checks.push(...this.analyzePropertyDocuments(byType("expose")).checks);

    // Eigenkapital belegt?
    const ek = input.caseData.financing?.eigenkapital ?? 0;
    const ekBelegt = (input.caseData.assets ?? []).some((a) => a.belegt);
    if (ek > 0 && !ekBelegt) {
      checks.push(mk("plaus.ek", "Eigenkapital", "warnung", "Eigenkapital angegeben, aber nicht durch Nachweis belegt."));
    }

    return plausibilityResultSchema.parse({ checks, overallConfidence: 0.8 });
  }

  /** Bankfähige Zusammenfassung – neutral, sachlich (keine Bewertung). */
  createBankSummary(caseData: Partial<CanonicalCase> & {
    vorhandeneUnterlagen?: string[];
    fehlendeUnterlagen?: string[];
    risiken?: string[];
    offenePunkte?: string[];
  }): BankSummary {
    const a = caseData.applicants?.[0];
    const fin = caseData.financing ?? {};
    const prop = caseData.property;
    const summary: BankSummary = {
      kurzprofil: [a?.vorname, a?.nachname].filter(Boolean).join(" ") || "Antragsteller",
      einkommenBeschaeftigung: describeIncome(caseData),
      selbststaendigkeit: (caseData.employment ?? []).some((e) => e.beschaeftigungsart === "selbststaendiger")
        ? "Mindestens ein Antragsteller ist selbstständig – Selbstständigenunterlagen erforderlich."
        : null,
      objektuebersicht: prop
        ? `${prop.objektart ?? "Objekt"} in ${[prop.strasse, prop.plz, prop.ort].filter(Boolean).join(", ")}${prop.wohnflaeche ? `, ${prop.wohnflaeche} m² Wohnfläche` : ""}.`
        : "Objektangaben unvollständig.",
      finanzierungsbedarf: `Kaufpreis ${fmt(fin.kaufpreis)}, Darlehenswunsch ${fmt(fin.darlehenswunsch)}.`,
      eigenkapital: `Eigenkapital ${fmt(fin.eigenkapital)}.`,
      vorhandeneUnterlagen: caseData.vorhandeneUnterlagen ?? [],
      fehlendeUnterlagen: caseData.fehlendeUnterlagen ?? [],
      risikenNeutral: caseData.risiken ?? [],
      offenePunkte: caseData.offenePunkte ?? [],
    };
    return bankSummarySchema.parse(summary);
  }

  /** Plattform-Mapping (kanonisch -> Plattform). Delegiert an Mapping-Layer. */
  async createPlatformMapping(
    caseData: CanonicalCase,
    platform: Platform
  ): Promise<PlatformMappingResult> {
    const { buildPlatformMapping } = await import("@/lib/platforms/mapping");
    return platformMappingSchema.parse(buildPlatformMapping(caseData, platform));
  }

  // ---------------- Nachrichten ----------------

  async generateCustomerEmail(
    missingItems: Array<{ title: string }>,
    caseData: { kundeName?: string; uploadLink?: string }
  ): Promise<GeneratedMessageResult> {
    const { buildEmail } = await import("@/lib/messages/generators");
    return generatedMessageSchema.parse(buildEmail(missingItems, caseData));
  }

  async generateWhatsappMessage(
    missingItems: Array<{ title: string }>,
    caseData: { kundeName?: string; uploadLink?: string }
  ): Promise<GeneratedMessageResult> {
    const { buildWhatsapp } = await import("@/lib/messages/generators");
    return generatedMessageSchema.parse(buildWhatsapp(missingItems, caseData));
  }

  async generatePdfChecklist(
    missingItems: Array<{ title: string }>,
    caseData: { kundeName?: string; uploadLink?: string }
  ): Promise<GeneratedMessageResult> {
    const { buildPdfChecklistText } = await import("@/lib/messages/generators");
    return generatedMessageSchema.parse(buildPdfChecklistText(missingItems, caseData));
  }
}

// ---------------- Helpers ----------------

function mk(
  key: string,
  category: string,
  status: "ok" | "warnung" | "kritisch" | "fehlt",
  explanation: string
): PlausibilityResult["checks"][number] {
  return {
    key,
    category,
    status,
    explanation,
    recommendedAction: undefined,
    customerVisible: false,
    relevantEuropace: true,
    relevantFinlink: false,
    relevantEhyp: true,
  };
}

function describeIncome(caseData: Partial<CanonicalCase>): string {
  const inc = caseData.income?.[0];
  const emp = caseData.employment?.[0];
  const parts: string[] = [];
  if (emp?.beschaeftigungsart) parts.push(emp.beschaeftigungsart);
  if (emp?.arbeitgeber) parts.push(`bei ${emp.arbeitgeber}`);
  if (inc?.nettoMonatlich) parts.push(`Netto ${fmt(inc.nettoMonatlich)}/Monat`);
  return parts.join(", ") || "Angaben siehe Fallakte.";
}

function guessApplicant(
  name: string | null | undefined,
  caseData: Partial<CanonicalCase>
): number {
  if (!name) return 1;
  const lower = name.toLowerCase();
  const match = (caseData.applicants ?? []).find(
    (a) => a.nachname && lower.includes(a.nachname.toLowerCase())
  );
  return match?.position ?? 1;
}

function truncate(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const jsonSchemaCache = new Map<string, Record<string, unknown>>();
function toJsonSchema(name: string, schema: z.ZodTypeAny): Record<string, unknown> {
  const cached = jsonSchemaCache.get(name);
  if (cached) return cached;
  const js = zodToJsonSchema(schema, { name, target: "openApi3" }) as Record<string, unknown>;
  jsonSchemaCache.set(name, js);
  return js;
}

function describe(err: unknown): string {
  if (err instanceof z.ZodError) return "Schema-Validierung fehlgeschlagen";
  if (err instanceof Error) return err.message;
  return "unbekannter Fehler";
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export const aiService = new AIService();
