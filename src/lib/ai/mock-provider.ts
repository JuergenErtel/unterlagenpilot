import type { AICompletionRequest, AIProvider } from "./types";
import type { DocumentType } from "@/lib/domain/enums";
import { classificationKeywords, DOCUMENT_TYPE_SPECS } from "@/lib/documents/document-types";

/**
 * Deterministischer Offline-AI-Provider für Entwicklung, Demo und Tests.
 * Erkennt Dokumenttypen heuristisch anhand von Schlüsselwörtern (zentrale
 * Registry: src/lib/documents/document-types.ts) und liefert plausible,
 * schema-konforme strukturierte Daten – ohne externe Dienste.
 * In Produktion wird stattdessen ein EU-konformer Provider (Azure OpenAI EU)
 * konfiguriert.
 */

const KEYWORDS = classificationKeywords();

function detectType(text: string): { type: DocumentType; confidence: number } {
  const lower = text.toLowerCase();
  let best: { type: DocumentType; hits: number } = { type: "sonstige", hits: 0 };
  for (const entry of KEYWORDS) {
    const hits = entry.words.filter((w) => lower.includes(w)).length;
    if (hits > best.hits) best = { type: entry.type, hits };
  }
  if (best.hits === 0) return { type: "sonstige", confidence: 0.35 };
  const confidence = Math.min(0.98, 0.6 + best.hits * 0.12);
  return { type: best.type, confidence };
}

function num(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m || !m[1]) return null;
  const v = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function str(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m && m[1] ? m[1].trim() : null;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  isConfigured() {
    return true;
  }

  async completeJSON(req: AICompletionRequest): Promise<unknown> {
    const text = String(req.hints?.fileText ?? req.user ?? "");
    switch (req.schemaName) {
      case "classification":
        return this.classify(text, req);
      case "extraction":
        return this.extract(text, req);
      case "scanQuality":
        return this.scanQuality(text);
      case "duplicate":
        return this.duplicate(req);
      case "assignment":
        return this.assign(req);
      case "plausibility":
        return req.hints?.precomputed ?? { checks: [], overallConfidence: 0.8 };
      case "missingDocuments":
        return req.hints?.precomputed ?? { missing: [], confidence: 0.85 };
      case "bankSummary":
        return req.hints?.precomputed ?? this.fallbackSummary();
      case "platformMapping":
        return req.hints?.precomputed ?? { platform: "europace", groups: [], missingRequiredFields: [] };
      case "generatedMessage":
        return req.hints?.precomputed ?? { channel: "email", subject: "Ihre Unterlagen", body: "" };
      default:
        return {};
    }
  }

  private classify(text: string, req: AICompletionRequest) {
    const forced = req.hints?.forceType as DocumentType | undefined;
    const detected = forced
      ? { type: forced, confidence: 0.95 }
      : detectType(text);
    return {
      documentType: detected.type,
      confidence: detected.confidence,
      detectedApplicant:
        str(text, /(?:Arbeitnehmer|Name)[:\s]+([A-Za-zÄÖÜäöüß ]{3,40})/) ?? null,
      detectedPropertyRef: str(text, /(Musterstra[ßs]+e\s*\d+|[A-Za-zäöüß]+stra[ßs]+e\s*\d+)/i) ?? null,
      period: str(text, /(\d{4}-\d{2})/) ?? null,
      issuer: null,
      pageCount: (req.hints?.pageCount as number) ?? 1,
      reasoning: forced
        ? "Vorklassifizierung übernommen"
        : `Heuristische Erkennung anhand von Schlüsselwörtern (${detected.type}).`,
    };
  }

  private extract(text: string, req: AICompletionRequest) {
    const type = (req.hints?.documentType as DocumentType) ?? detectType(text).type;
    const fields = this.fieldsFor(type, text);
    const warnings = this.warningsFor(type, text, fields);
    const overall =
      fields.length === 0
        ? 0.4
        : fields.reduce((a, f) => a + f.confidence, 0) / fields.length;
    return { documentType: type, fields, warnings, overallConfidence: overall };
  }

  private fieldsFor(type: DocumentType, text: string) {
    const f = (
      key: string,
      label: string,
      value: string | number | boolean | null,
      confidence = 0.8,
      source?: string
    ) => ({ key, label, value, confidence, source });

    switch (type) {
      case "gehaltsabrechnung":
        return [
          f("arbeitnehmer", "Name Arbeitnehmer", str(text, /(?:Arbeitnehmer|Name)[:\s]+([A-Za-zÄÖÜäöüß ]{3,40})/) ?? "Max Mustermann"),
          f("arbeitgeber", "Arbeitgeber", str(text, /Arbeitgeber[:\s]+([A-Za-zÄÖÜäöüß .&-]{3,40})/) ?? "Muster GmbH"),
          f("abrechnungsmonat", "Abrechnungsmonat", str(text, /(\d{4}-\d{2})/) ?? "2026-05"),
          f("brutto", "Brutto", num(text, /Brutto[:\s]+([\d.,]+)/) ?? 4200, 0.85),
          f("netto", "Netto", num(text, /Netto[:\s]+([\d.,]+)/) ?? 2750, 0.85),
          f("steuerklasse", "Steuerklasse", num(text, /Steuerklasse[:\s]+([1-6IV]+)/i) ?? 3, 0.7),
          f("steuerId", "Steuer-ID", str(text, /Steuer-?ID[:\s]+([\d ]{11,})/) ?? null, 0.5),
          f("eintrittsdatum", "Eintrittsdatum", str(text, /Eintritt[:\s]+([\d.]{8,10})/) ?? null, 0.6),
          f("austrittsdatum", "Austrittsdatum", str(text, /Austritt[:\s]+([\d.]{8,10})/) ?? null, 0.9),
          f("auszahlungsbetrag", "Auszahlungsbetrag", num(text, /Auszahlung[:\s]+([\d.,]+)/) ?? 2750, 0.85),
        ];
      case "grundbuchauszug":
        return [
          f("grundbuchamt", "Grundbuchamt", str(text, /Grundbuchamt[:\s]+([A-Za-zÄÖÜäöüß ]{2,40})/) ?? "Amtsgericht Wörth"),
          f("blattnummer", "Blattnummer", str(text, /Blatt[:\s]+(\d+)/) ?? "1234"),
          f("gemarkung", "Gemarkung", str(text, /Gemarkung[:\s]+([A-Za-zÄÖÜäöüß ]{2,40})/) ?? "Wörth"),
          f("flur", "Flur", str(text, /Flur[:\s]+(\d+)/) ?? "3"),
          f("flurstueck", "Flurstück", str(text, /Flurst[üu]ck[:\s]+([\d/]+)/) ?? "127/4"),
          f("grundstuecksgroesse", "Grundstücksgröße (m²)", num(text, /([\d.]+)\s*m²/) ?? 540, 0.8),
          f("eigentuemer", "Eigentümer", str(text, /Eigent[üu]mer[:\s]+([A-Za-zÄÖÜäöüß ,]{3,60})/) ?? "Max und Erika Mustermann"),
          f("abteilungII", "Abteilung II (Lasten)", str(text, /Abteilung II[:\s]+([^\n]{0,60})/) ?? "keine Eintragungen", 0.7),
          f("abteilungIII", "Abteilung III (Grundpfandrechte)", str(text, /Abteilung III[:\s]+([^\n]{0,60})/) ?? "keine Eintragungen", 0.7),
        ];
      case "personalausweis":
        return [
          f("vorname", "Vorname", str(text, /Vorname[:\s]+([A-Za-zÄÖÜäöüß]{2,30})/) ?? "Max"),
          f("nachname", "Nachname", str(text, /Name[:\s]+([A-Za-zÄÖÜäöüß]{2,30})/) ?? "Mustermann"),
          f("geburtsdatum", "Geburtsdatum", str(text, /geb(?:oren)?[:.\s]+([\d.]{8,10})/i) ?? "1985-04-12"),
          f("geburtsort", "Geburtsort", str(text, /Geburtsort[:\s]+([A-Za-zÄÖÜäöüß ]{2,30})/) ?? "Karlsruhe"),
          f("anschrift", "Anschrift", str(text, /(Musterstra[ßs]+e\s*\d+[^\n]{0,30})/i) ?? null, 0.7),
          f("gueltigBis", "Gültig bis", str(text, /g[üu]ltig bis[:\s]+([\d.]{8,10})/i) ?? "2030-03-01", 0.85),
        ];
      case "expose":
        return [
          f("objektadresse", "Objektadresse", str(text, /(Musterstra[ßs]+e\s*\d+[^\n]{0,30})/i) ?? "Musterstraße 12, 76744 Wörth"),
          f("objektart", "Objektart", "einfamilienhaus"),
          f("kaufpreis", "Kaufpreis", num(text, /Kaufpreis[:\s]+([\d.,]+)/) ?? 420000, 0.85),
          f("wohnflaeche", "Wohnfläche (m²)", num(text, /Wohnfl[äa]che[:\s]+([\d.,]+)/) ?? 142, 0.85),
          f("grundstuecksflaeche", "Grundstücksfläche (m²)", num(text, /Grundst[üu]cksfl[äa]che[:\s]+([\d.,]+)/) ?? null, 0.4),
          f("baujahr", "Baujahr", num(text, /Baujahr[:\s]+(\d{4})/) ?? 1998, 0.8),
          f("zimmer", "Anzahl Zimmer", num(text, /(\d+)\s*Zimmer/) ?? 5, 0.7),
          f("heizungsart", "Heizungsart", str(text, /Heizung[:\s]+([A-Za-zÄÖÜäöüß -]{2,30})/) ?? "Gas-Brennwert", 0.6),
        ];
      default: {
        // Schema-basierte Extraktion für vorbereitete Dokumenttypen (Registry).
        const spec = DOCUMENT_TYPE_SPECS[type];
        if (type !== "sonstige" && spec && spec.fields.length > 0) {
          return spec.fields.map((fld) => f(fld.key, fld.label, null, fld.required ? 0.5 : 0.4));
        }
        return [f("dokumentinhalt", "Erkannter Inhalt", text.slice(0, 80) || null, 0.4)];
      }
    }
  }

  private warningsFor(
    type: DocumentType,
    _text: string,
    fields: Array<{ key: string; value: unknown }>
  ) {
    const w: Array<{ code: string; severity: string; message: string; customerVisible: boolean }> = [];
    const get = (k: string) => fields.find((f) => f.key === k)?.value ?? null;

    if (type === "gehaltsabrechnung") {
      if (get("austrittsdatum")) {
        w.push({ code: "AUSTRITT_VORHANDEN", severity: "kritisch", message: "Austrittsdatum in der Gehaltsabrechnung erkannt – mögliches KO-Kriterium.", customerVisible: false });
      }
      if (!get("steuerId")) {
        w.push({ code: "STEUER_ID_FEHLT", severity: "warnung", message: "Keine erkennbare Steuer-ID auf der Abrechnung.", customerVisible: false });
      }
    }
    if (type === "expose") {
      if (!get("grundstuecksflaeche")) {
        w.push({ code: "GRUNDSTUECK_FEHLT", severity: "warnung", message: "Exposé enthält Wohnfläche, aber keine Grundstücksgröße.", customerVisible: false });
      }
    }
    if (type === "grundbuchauszug") {
      const abt3 = String(get("abteilungIII") ?? "");
      if (abt3 && !abt3.toLowerCase().includes("keine")) {
        w.push({ code: "GRUNDSCHULD_VORHANDEN", severity: "warnung", message: "Bestehende Grundpfandrechte in Abteilung III.", customerVisible: false });
      }
    }
    return w;
  }

  private scanQuality(text: string) {
    const readable = text.trim().length > 20;
    return {
      readable,
      resolutionOk: readable,
      truncatedPages: false,
      missingPages: false,
      confidence: readable ? 0.9 : 0.5,
      warnings: readable
        ? []
        : [{ code: "UNLESBAR", severity: "kritisch", message: "Scan scheint unlesbar oder leer.", customerVisible: true }],
    };
  }

  private duplicate(req: AICompletionRequest) {
    const a = String(req.hints?.textA ?? "");
    const b = String(req.hints?.textB ?? "");
    const similarity = a && b ? jaccard(a, b) : 0;
    return {
      isDuplicate: similarity > 0.92,
      isNearDuplicate: similarity > 0.75 && similarity <= 0.92,
      similarity,
      reasoning: `Token-Ähnlichkeit ${(similarity * 100).toFixed(0)} %`,
    };
  }

  private assign(req: AICompletionRequest) {
    return {
      applicantPosition: (req.hints?.applicantPosition as number) ?? 1,
      propertyRef: (req.hints?.propertyRef as string) ?? null,
      financingRef: null,
      liabilityRef: null,
      assetRef: null,
      confidence: 0.7,
      reasoning: "Heuristische Zuordnung anhand erkannter Namen/Objektbezug.",
    };
  }

  private fallbackSummary() {
    return {
      kurzprofil: "Antragsteller (Demo)",
      einkommenBeschaeftigung: "Angaben siehe Fallakte.",
      selbststaendigkeit: null,
      objektuebersicht: "Angaben siehe Fallakte.",
      finanzierungsbedarf: "Angaben siehe Fallakte.",
      eigenkapital: "Angaben siehe Fallakte.",
      vorhandeneUnterlagen: [],
      fehlendeUnterlagen: [],
      risikenNeutral: [],
      offenePunkte: [],
    };
  }
}

function jaccard(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const sb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}
