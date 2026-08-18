/**
 * DSGVO-Datenauskunft (Art. 15/20): baut aus den geladenen Falldaten ein
 * strukturiertes, maschinenlesbares Export-Objekt. Rein (ohne I/O) und schließt
 * Secrets (Upload-Link-Token/Hashes) defensiv aus.
 */

export interface DsgvoInput {
  exportedAt: string;
  case: Record<string, unknown> & { caseNumber: string };
  applicants: Array<
    Record<string, unknown> & {
      employment?: Array<Record<string, unknown>>;
      income?: Array<Record<string, unknown>>;
    }
  >;
  property?: Record<string, unknown> | null;
  financing?: Record<string, unknown> | null;
  liabilities: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  documents: Array<
    Record<string, unknown> & { extractedFields?: Array<Record<string, unknown>>; ocrText?: string }
  >;
  messages: Array<Record<string, unknown>>;
  uploadLinks: Array<Record<string, unknown>>;
  customerForm?: { data: unknown; submitted: boolean; createdAt: unknown } | null;
  /**
   * Selbstauskunft-Boegen des Falls.
   *
   * Fehlten bis zum 18.08.2026 vollstaendig. Fuer einen Fall, der aus dem
   * oeffentlichen Anfrageformular entstanden ist, ist das die Luecke mit den
   * Folgen: Dort stehen die Antworten, die KEIN Zielfeld im Fall haben (sie
   * tauchen sonst nirgends auf) – und der Einwilligungsnachweis. Eine
   * Einwilligung ohne Zeitpunkt und Fassung ist nicht nachweisbar, und
   * ausgerechnet die Auskunft nach Art. 15 verschwieg beides.
   */
  selfDisclosures: Array<{
    answers: unknown;
    submittedAt: unknown;
    takenOverAt: unknown;
    einwilligungAm: unknown;
    einwilligungFassung: unknown;
    createdAt: unknown;
  }>;
  auditLog: Array<{ action: string; entityType: string; createdAt: unknown; metadata: unknown }>;
}

export function buildDsgvoExport(input: DsgvoInput) {
  return {
    meta: {
      dokument: "DSGVO-Datenauskunft",
      hinweis:
        "Diese Datei enthält die zu diesem Fall gespeicherten personenbezogenen Daten. " +
        "Die Original-Dokumentdateien sind separat als ZIP verfügbar.",
      caseNumber: input.case.caseNumber,
      exportedAt: input.exportedAt,
    },
    fall: input.case,
    antragsteller: input.applicants.map((a) => {
      const { employment, income, ...rest } = a;
      return {
        ...rest,
        beschaeftigung: employment ?? [],
        einkommen: income ?? [],
      };
    }),
    objekt: input.property ?? null,
    finanzierung: input.financing ?? null,
    verbindlichkeiten: input.liabilities,
    vermoegen: input.assets,
    dokumente: input.documents.map((d) => {
      const { extractedFields, ...rest } = d;
      return { ...rest, erkannteFelder: extractedFields ?? [] };
    }),
    nachrichten: input.messages,
    // Nur unbedenkliche Metadaten – niemals Token/Hash.
    uploadLinks: input.uploadLinks.map((l) => ({
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      active: l.active,
      usedCount: l.usedCount,
      maxUploads: l.maxUploads ?? null,
    })),
    kundenformular: input.customerForm ?? null,
    selbstauskunft: input.selfDisclosures.map((sd) => ({
      antworten: sd.answers,
      abgesendetAm: sd.submittedAt,
      uebernommenAm: sd.takenOverAt,
      einwilligung:
        sd.einwilligungAm == null
          ? null
          : { erteiltAm: sd.einwilligungAm, fassung: sd.einwilligungFassung },
      angelegtAm: sd.createdAt,
    })),
    auskunftProtokoll: input.auditLog,
  };
}
