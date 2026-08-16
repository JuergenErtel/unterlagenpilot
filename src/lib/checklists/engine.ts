import type {
  DocumentType,
  EmploymentType,
  FinancingType,
  Platform,
  PropertyType,
  RequirementLevel,
  UsageType,
} from "@/lib/domain/enums";
import {
  CHECKLIST_TEMPLATES,
  type ChecklistItemDef,
} from "./templates";

export interface CaseChecklistInput {
  financingType?: FinancingType;
  employmentType?: EmploymentType;
  propertyType?: PropertyType;
  usage?: UsageType;
  kapitalanlage?: boolean;
  applicantCount?: number;
  /**
   * IDs der Antragsteller. Nötig, um personenbezogene Positionen (Ausweis,
   * Gehaltsabrechnung) je Person statt fallweit zu prüfen.
   */
  applicantIds?: string[];
  /**
   * Antragsteller MIT ihrer Beschaeftigungsart.
   *
   * `employmentType` weiter oben gilt fuer den ganzen Fall und kann ein Paar
   * aus Selbststaendigem und Angestellter nicht abbilden – eine der beiden
   * Unterlagenlisten war dann zwangslaeufig falsch. Genau daran ist der Fall
   * UP-2026-0007 aufgelaufen: Vom selbststaendigen Arzt wurden
   * Gehaltsabrechnungen verlangt, BWA und Jahresabschluss fehlten ganz.
   *
   * Ist diese Liste gesetzt, entscheidet sie ueber Vorlagenauswahl und
   * personenbezogene Positionen; sonst bleibt es beim fallweiten Wert.
   */
  applicants?: Array<{ id: string; employmentType?: EmploymentType }>;
}

export interface ResolvedChecklistItem extends ChecklistItemDef {
  /** Status wird gegen vorhandene Dokumente bestimmt. */
  status:
    | "offen"
    | "vorhanden"
    | "unvollstaendig"
    | "nicht_aktuell"
    | "abgelehnt"
    | "nicht_erforderlich";
  matchedDocuments: number;
  customerVisible: boolean;
  /** Tatsächlich verlangte Anzahl (bei perApplicant × Anzahl Antragsteller). */
  effectiveRequiredCount: number;
  /**
   * Bei personenbezogenen Positionen: die Antragsteller, deren Soll NICHT
   * erfüllt ist. Sonst leer.
   *
   * Warum das eigens ausgewiesen wird: `matchedDocuments` und
   * `effectiveRequiredCount` zählen über den GANZEN Fall, der Status wird bei
   * `perApplicant` aber je Person gerechnet. Hängen im Fall zwei Ausweise, die
   * beide derselben Person gehören, meldet die Liste „2 von 2" und trotzdem
   * „unvollständig" – ein Widerspruch, aus dem niemand ableiten kann, wer
   * gemeint ist. Genau daran ist der Fall UP-2026-0015 aufgelaufen
   * (16.08.2026): Beide Ausweisdateien hingen an Antragsteller 1, und der
   * Vermittler lud immer wieder nach.
   */
  offeneAntragsteller: string[];
}

/** Wählt die relevanten Template-Keys für einen Fall. */
export function selectTemplateKeys(input: CaseChecklistInput): string[] {
  const keys = new Set<string>();

  // Beschäftigungs-/Kundentyp + Finanzierungsart.
  // Jede im Fall vertretene Beschaeftigungsart bringt ihre Vorlage mit: Bei
  // einem Paar aus Selbststaendigem und Angestellter braucht es BEIDE Listen,
  // nicht die des "fuehrenden" Antragstellers.
  // Nur BEKANNTE Beschaeftigungsarten der Personen zaehlen. Sind sie alle
  // unbekannt, bleibt der fallweite Wert massgeblich – eine Luecke in den
  // Personendaten darf eine gepflegte Fallangabe nicht ueberstimmen.
  const bekannte = (input.applicants ?? [])
    .map((a) => a.employmentType)
    .filter((t): t is EmploymentType => t !== undefined);
  const arten = bekannte.length > 0 ? bekannte : [input.employmentType];
  for (const art of arten) {
    switch (art) {
      case "selbststaendiger":
        keys.add("selbststaendiger_kauf");
        break;
      case "freiberufler":
        keys.add("freiberufler_kauf");
        break;
      case "beamter":
        keys.add("beamter");
        break;
      case "rentner":
        keys.add("rentner");
        break;
      case "geschaeftsfuehrer":
      case "gesellschafter":
        keys.add("gf_gesellschafter");
        break;
      default:
        keys.add("angestellter_kauf");
    }
  }

  switch (input.financingType) {
    case "neubau":
      keys.add("neubau");
      break;
    case "anschlussfinanzierung":
      keys.add("anschlussfinanzierung");
      break;
    case "umschuldung":
      keys.add("umschuldung");
      break;
    case "modernisierung":
      keys.add("modernisierung");
      break;
    default:
      break;
  }

  if (input.kapitalanlage) keys.add("kapitalanlage");

  // Objektart
  switch (input.propertyType) {
    case "eigentumswohnung":
      keys.add("eigentumswohnung");
      break;
    case "einfamilienhaus":
    case "doppelhaushaelfte":
    case "reihenhaus":
      keys.add("einfamilienhaus");
      break;
    case "mehrfamilienhaus":
      keys.add("mehrfamilienhaus");
      break;
    case "grundstueck":
      keys.add("grundstueck");
      break;
    default:
      break;
  }

  // Nutzung
  if (input.usage === "vermietet") keys.add("vermietete_immobilie");
  if (input.usage === "gemischt") keys.add("gemischt_privat_vermietet");

  // Mehrere Antragsteller
  if ((input.applicantCount ?? 1) > 1) keys.add("mehrere_antragsteller");

  return [...keys];
}

export interface ExistingDocument {
  documentType: DocumentType | null;
  reviewStatus: string; // offen|akzeptiert|abgelehnt|ersetzt|duplikat
  readable?: boolean | null;
  ageDays?: number | null; // Alter des Dokumentinhalts (z.B. Abrechnungsmonat)
  /** Zugeordneter Antragsteller (null = noch nicht zugeordnet). */
  applicantId?: string | null;
}

/**
 * Baut die fallbezogene Checkliste: kombiniert Templates, dedupliziert nach key,
 * und bestimmt den Status je Position anhand vorhandener Dokumente.
 */
export function buildChecklistForCase(
  input: CaseChecklistInput,
  documents: ExistingDocument[] = [],
  /** Zusätzliche, fallbezogen aufgelöste Positionen (z. B. Bankanforderungen). */
  extraItems: ChecklistItemDef[] = []
): ResolvedChecklistItem[] {
  const keys = selectTemplateKeys(input);
  const merged = new Map<string, ChecklistItemDef>();

  const addItem = (it: ChecklistItemDef) => {
    // Strengste Anforderung gewinnt bei Dubletten.
    const existing = merged.get(it.key);
    if (!existing || rank(it.level) > rank(existing.level)) merged.set(it.key, it);
  };

  for (const tplKey of keys) {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.key === tplKey);
    if (!tpl) continue;
    for (const it of tpl.items) addItem(it);
  }
  for (const it of extraItems) addItem(it);

  const applicantIds = input.applicantIds ?? [];
  const applicantCount = Math.max(input.applicantCount ?? applicantIds.length ?? 1, 1);

  return [...merged.values()]
    .sort((a, b) => rank(b.level) - rank(a.level))
    .map((def) => {
      const betroffen = betroffeneAntragsteller(def, input, applicantIds);
      return { def, betroffen };
    })
    // Trifft eine personenbezogene Position auf niemanden zu, entfaellt sie:
    // Eine Gehaltsabrechnung von einem reinen Selbststaendigen-Haushalt zu
    // verlangen ist keine offene Position, sondern ein Fehler in der Liste.
    // Nur wenn die Beschaeftigungsarten ueberhaupt bekannt sind – ohne sie
    // bleibt die Liste wie bisher vollstaendig.
    .filter(
      ({ def, betroffen }) =>
        !def.nurBeiBeschaeftigung || !input.applicants?.length || betroffen.length > 0
    )
    .map(({ def, betroffen }) =>
      resolveStatus(
        def,
        documents,
        betroffen,
        def.nurBeiBeschaeftigung && input.applicants ? betroffen.length : applicantCount
      )
    );
}

/** Zählt lesbare, hinreichend aktuelle Treffer und bewertet eine Teilmenge. */
function evaluateMatches(
  def: ChecklistItemDef,
  matches: ExistingDocument[],
  required: number
): { fulfilled: boolean; tooOld: boolean } {
  // Unlesbare Dokumente zählen nicht zur Erfüllung.
  const readable = matches.filter((m) => m.readable !== false);
  const fulfilled = readable.length >= required;

  // Aktualität nur anhand von Dokumenten mit BEKANNTEM Alter beurteilen.
  // Ein Dokument ohne erkannten Zeitraum beweist weder Aktualität noch das
  // Gegenteil – früher galt `ageDays ?? 0`, also "unbekannt = brandaktuell",
  // wodurch ein einziges undatiertes Dokument veraltete Unterlagen kaschierte.
  let tooOld = false;
  if (def.recencyDays != null && fulfilled) {
    const dated = readable.filter((m) => m.ageDays != null);
    tooOld = dated.length > 0 && dated.every((m) => m.ageDays! > def.recencyDays!);
  }
  return { fulfilled, tooOld };
}

/**
 * Auf welche Antragsteller eine Position zutrifft.
 *
 * Ohne `nurBeiBeschaeftigung` auf alle. Eine unbekannte Beschaeftigungsart
 * zaehlt mit: Solange die Angabe fehlt, soll eine Position lieber zu viel
 * verlangt werden als still zu verschwinden.
 */
function betroffeneAntragsteller(
  def: ChecklistItemDef,
  input: CaseChecklistInput,
  applicantIds: string[]
): string[] {
  if (!def.nurBeiBeschaeftigung || !input.applicants || input.applicants.length === 0) {
    return applicantIds;
  }
  const erlaubt = new Set(def.nurBeiBeschaeftigung);
  return input.applicants
    .filter((a) => a.employmentType === undefined || erlaubt.has(a.employmentType))
    .map((a) => a.id);
}

function resolveStatus(
  def: ChecklistItemDef,
  documents: ExistingDocument[],
  applicantIds: string[],
  applicantCount: number
): ResolvedChecklistItem {
  const matches = documents.filter(
    (d) =>
      d.documentType === def.documentType &&
      d.reviewStatus !== "abgelehnt" &&
      d.reviewStatus !== "duplikat" &&
      // Ein ersetztes Dokument erfuellt keine Position mehr – sonst zaehlt nach
      // dem Auftrennen das Original zusaetzlich zu seinen Teilen.
      d.reviewStatus !== "ersetzt"
  );
  const perPerson = def.requiredCount ?? 1;
  const perApplicant = def.perApplicant === true && applicantCount > 1;
  const effectiveRequiredCount = perApplicant ? perPerson * applicantCount : perPerson;

  let status: ResolvedChecklistItem["status"] = "offen";
  let offeneAntragsteller: string[] = [];

  // Je Person auswerten – auch OHNE Treffer. Steht gar nichts im Fall, ist die
  // Position für jede Person offen, und genau das soll die Anzeige sagen
  // können. Die frühere Fassung rechnete das nur innerhalb von
  // `matches.length > 0` und ließ die Frage „für wen?" im häufigsten Fall
  // unbeantwortet.
  if (perApplicant && applicantIds.length > 0) {
    const perResults = applicantIds.map((id) => ({
      id,
      ...evaluateMatches(def, matches.filter((m) => m.applicantId === id), perPerson),
    }));
    // Nicht zugeordnete Dokumente können keiner Person gutgeschrieben werden –
    // der Vermittler ordnet sie im Review-Center zu. Sonst gälte die Position
    // als erfüllt, obwohl von Antragsteller 2 nichts vorliegt.
    offeneAntragsteller = perResults.filter((r) => !r.fulfilled).map((r) => r.id);
    if (matches.length > 0) {
      status =
        offeneAntragsteller.length === 0
          ? perResults.some((r) => r.tooOld)
            ? "nicht_aktuell"
            : "vorhanden"
          : "unvollstaendig";
    }
  } else if (matches.length > 0) {
    const { fulfilled, tooOld } = evaluateMatches(def, matches, effectiveRequiredCount);
    status = fulfilled ? (tooOld ? "nicht_aktuell" : "vorhanden") : "unvollstaendig";
  }

  return {
    ...def,
    status,
    matchedDocuments: matches.length,
    effectiveRequiredCount,
    offeneAntragsteller,
    // KO-/Risikobewertungen sind intern; reine Unterlagen-Checkliste ist für Kunde sichtbar.
    customerVisible: def.scope !== "bankbezogen",
  };
}

function rank(level: RequirementLevel): number {
  switch (level) {
    case "zwingend":
      return 4;
    case "bankabhaengig":
      return 3;
    case "spaeter":
      return 2;
    case "optional":
      return 1;
  }
}

/**
 * Der Zusatz „Fehlt noch für: …" zu einer personenbezogenen Position.
 *
 * `null`, wenn es nichts zu sagen gibt – bei fallweiten Positionen, bei einem
 * einzelnen Antragsteller oder wenn alle ihr Soll erfüllt haben. Ein Satz, der
 * nur „Fehlt noch für:" ohne Namen lautet, wäre schlimmer als keiner.
 *
 * Namenlose Antragsteller (im Lead steht oft nur eine E-Mail) bekommen ihre
 * Position: „Antragsteller 2" ist eine brauchbare Auskunft, eine leere
 * Zeichenkette nicht.
 */
export function fehltFuerSatz(
  offeneAntragsteller: string[],
  applicants: Array<{ id: string; position: number; vorname?: string | null; nachname?: string | null }>
): string | null {
  if (offeneAntragsteller.length === 0 || applicants.length < 2) return null;
  const namen = offeneAntragsteller
    .map((id) => applicants.find((a) => a.id === id))
    .filter((a): a is (typeof applicants)[number] => a !== undefined)
    .map(
      (a) =>
        [a.vorname, a.nachname].filter(Boolean).join(" ").trim() || `Antragsteller ${a.position}`
    );
  if (namen.length === 0) return null;
  return `Fehlt noch für: ${namen.join(" und ")}.`;
}

/** Plattformbezug einer Position (für Nachforderungsfilter). */
export function itemPlatforms(item: ChecklistItemDef): Platform[] {
  return item.platforms;
}
