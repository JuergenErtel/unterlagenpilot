import type { DocumentType, Severity } from "@/lib/domain/enums";
import type { DocReference, FindingCode, Resolution } from "./types";
import { refKeyOf } from "./fingerprint";

export interface FollowUp {
  code: FindingCode;
  /** kundentauglich – landet ueber die Checkliste im Upload-Link */
  title: string;
  reason: string;
  severity: Severity;
  resolution: Resolution;
  documentType: DocumentType | null;
  refKey: string;
  /** true = nur Hinweis, erzeugt keine Unterlagen-Anforderung */
  hinweisOnly: boolean;
}

interface FollowUpDef {
  title: string;
  reason: string;
  severity: Severity;
  documentType: DocumentType | null;
  hinweisOnly?: boolean;
}

export interface LastRule {
  key: string;
  /** gegen das kleingeschriebene Label geprueft */
  match: RegExp;
  /** auf welche Quelldokumente die Regel anwendbar ist; leer = alle */
  sourceTypes: DocumentType[];
  requires: FollowUpDef[];
}

/**
 * Was folgt aus einer Eintragung? Ausschliesslich hier – nie im Prompt.
 *
 * Bewusste Grenze: Baulasten stehen NICHT im Grundbuch, sondern im
 * Baulastenverzeichnis der Bauaufsicht, und das gibt es nicht in allen
 * Bundeslaendern (u. a. nicht in Bayern und Brandenburg). Die Baulastenauskunft
 * wird deshalb aus dem Kaufvertrag abgeleitet, nicht aus dem Grundbuch.
 */
export const LAST_RULES: LastRule[] = [
  {
    key: "abt2.erbbaurecht",
    match: /erbbaurecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Erbbaurechtsvertrag nebst allen Nachträgen",
        reason:
          "In Abteilung II ist ein Erbbaurecht eingetragen. Ohne den Vertrag kann keine Bank den Beleihungswert bestimmen.",
        severity: "kritisch",
        documentType: null,
      },
      {
        title: "Zustimmung des Erbbaurechtsgebers zur Beleihung",
        reason:
          "Bei Erbbaurecht ist die Belastung des Erbbaurechts zustimmungspflichtig. Ohne die Zustimmung ist die Grundschuld nicht eintragbar.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.wohnrecht",
    match: /wohnungsrecht|wohnrecht|nie(ß|ss)brauch/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Löschungsbewilligung oder Bewertung des Wohn- bzw. Nießbrauchrechts",
        reason:
          "Ein Wohnungsrecht oder Nießbrauch mindert den Beleihungswert erheblich, solange es nicht gelöscht wird.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.sanierungsvermerk",
    match: /sanierungsvermerk|sanierungsgebiet/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Sanierungsrechtliche Genehmigung der Gemeinde",
        reason:
          "Bei einem Sanierungsvermerk ist der Kaufvertrag nach § 144 BauGB genehmigungspflichtig.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.vorkaufsrecht",
    match: /vorkaufsrecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Negativattest zum Vorkaufsrecht der Gemeinde",
        reason:
          "Solange die Gemeinde ihr Vorkaufsrecht nicht abbedungen hat, ist der Eigentumsübergang nicht gesichert.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.reallast",
    match: /reallast|altenteil|leibgeding/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Bewertung der Reallast bzw. des Altenteils",
        reason:
          "Eine Reallast belastet das Objekt dauerhaft und ist für den Beleihungswert zu kapitalisieren.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "abt2.wegerecht",
    match: /geh-?\s*und\s*fahrtrecht|wegerecht|leitungsrecht/,
    sourceTypes: ["grundbuchauszug"],
    requires: [
      {
        title: "Hinweis: eingetragenes Geh-, Fahrt- oder Leitungsrecht",
        reason: "Bewertungsrelevant, aber es ist dafür keine zusätzliche Unterlage beizubringen.",
        severity: "warnung",
        documentType: null,
        hinweisOnly: true,
      },
    ],
  },
  {
    key: "kv.bautraeger",
    match: /bautr[aä]gervertrag|bautr[aä]ger/,
    sourceTypes: ["kaufvertragsentwurf"],
    requires: [
      {
        title: "MaBV-Zahlungsplan",
        reason:
          "Beim Bauträgerkauf richten sich die Auszahlungen nach den Raten der Makler- und Bauträgerverordnung.",
        severity: "kritisch",
        documentType: null,
      },
      {
        title: "Baubeschreibung",
        reason: "Die Bank bewertet das noch nicht fertige Objekt anhand der Baubeschreibung.",
        severity: "kritisch",
        documentType: "baubeschreibung",
      },
      {
        title: "Baugenehmigung",
        reason: "Ohne Baugenehmigung finanziert keine Bank einen Bauträgerkauf.",
        severity: "kritisch",
        documentType: "baugenehmigung",
      },
      {
        title: "Fertigstellungsbürgschaft des Bauträgers",
        reason: "Absicherung gegen Insolvenz des Bauträgers vor Fertigstellung.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
  {
    key: "kv.inventar",
    match: /inventar|zubeh[oö]r|einbauk[uü]che/,
    sourceTypes: ["kaufvertragsentwurf"],
    requires: [
      {
        title: "Hinweis: im Kaufvertrag herausgerechnetes Inventar",
        reason:
          "Die Bank beleiht Inventar nicht mit. Der beleihungsfähige Kaufpreis liegt entsprechend niedriger.",
        severity: "warnung",
        documentType: null,
        hinweisOnly: true,
      },
    ],
  },
  {
    key: "weg.sonderumlage",
    match: /sonderumlage/,
    sourceTypes: ["weg_protokoll"],
    requires: [
      {
        title: "Beschluss über die Sonderumlage mit Höhe und Fälligkeit",
        reason:
          "Eine beschlossene Sonderumlage belastet den Haushalt und ist der Bank offenzulegen.",
        severity: "kritisch",
        documentType: null,
      },
    ],
  },
  {
    key: "weg.wirtschaftsplan",
    match: /wirtschaftsplan|jahresabrechnung|instandhaltungsr[uü]cklage|r[uü]cklage/,
    sourceTypes: ["weg_protokoll"],
    requires: [
      {
        title: "Wirtschaftsplan, Jahresabrechnung und Rücklagenstand",
        reason:
          "Im Protokoll erwähnt, aber nicht in der Akte. Die Bank verlangt die Unterlagen der Eigentümergemeinschaft.",
        severity: "warnung",
        documentType: null,
      },
    ],
  },
];

function datumDe(iso: string | null): string | null {
  if (!iso) return null;
  const [j, m, t] = iso.split("-");
  return j && m && t ? `${t}.${m}.${j}` : null;
}

/** "2. Nachtrag zur Teilungserklärung (11.08.2011, UR 789/2011)" */
function titelMitKennung(label: string, ref: DocReference): string {
  const teile = [
    datumDe(ref.urkundeDatum),
    ref.urkundenNummer ? `UR ${ref.urkundenNummer}` : null,
  ].filter(Boolean);
  return teile.length > 0 ? `${label} (${teile.join(", ")})` : label;
}

/** Leitet aus einem gelesenen Verweis die Folgeanforderungen ab. */
export function followUpsFor(ref: DocReference, sourceType: DocumentType | null): FollowUp[] {
  const refKey = refKeyOf(ref);

  if (ref.kind === "selbst") return [];

  if (ref.kind === "bezugsurkunde" || ref.kind === "nachtrag") {
    const istTeilung = /teilungserkl/i.test(ref.label) || ref.kind === "nachtrag";
    return [
      {
        code: "referenz_fehlt",
        title: titelMitKennung(ref.label, ref),
        reason: `Im ${
          sourceType === "grundbuchauszug" ? "Grundbuchauszug" : "Dokument"
        } in Bezug genommen, liegt aber nicht in der Akte.`,
        severity: "kritisch",
        resolution: "neue_position",
        documentType: istTeilung ? "teilungserklaerung" : null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  if (ref.kind === "anlage") {
    return [
      {
        code: "anlage_fehlt",
        title: ref.label,
        reason: "Im Dokument als Anlage genannt, aber nicht beigefügt.",
        severity: "warnung",
        resolution: "neue_position",
        documentType: null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  if (ref.kind === "grundpfandrecht") {
    return [
      {
        code: "folgeunterlage_noetig",
        title: "Lastenfreistellung bzw. Löschungsbewilligung des Altgläubigers",
        reason: `In Abteilung III eingetragen: ${ref.label}. Die Bank verlangt die lastenfreie Übergabe.`,
        severity: "kritisch",
        resolution: "neue_position",
        documentType: null,
        refKey,
        hinweisOnly: false,
      },
    ];
  }

  // kind === "last": Regelkatalog befragen
  const label = ref.label.toLowerCase();
  const regel = LAST_RULES.find(
    (r) =>
      r.match.test(label) &&
      (r.sourceTypes.length === 0 || (sourceType != null && r.sourceTypes.includes(sourceType)))
  );
  if (!regel) return [];

  return regel.requires.map((f) => ({
    code: "folgeunterlage_noetig" as const,
    title: f.title,
    reason: f.reason,
    severity: f.severity,
    resolution: "neue_position" as const,
    documentType: f.documentType,
    refKey: `${regel.key}:${f.title}`,
    hinweisOnly: f.hinweisOnly ?? false,
  }));
}
