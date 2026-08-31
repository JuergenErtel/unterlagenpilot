import type { ResolvedChecklistItem } from "@/lib/checklists/engine";
import type { DocumentType } from "@/lib/domain/enums";

/**
 * Der Unterlagen-Arbeitsplatz: Soll (Checkliste) und Ist (Dokumente) in einer
 * Struktur, aus der die Drei-Spalten-Ansicht direkt rendern kann.
 *
 * Die Zuordnung Dokument -> Position ist ABGELEITET, keine eigene Beziehung:
 * massgeblich ist der Dokumenttyp, genau wie in der Checklisten-Engine
 * (resolveStatus in checklists/engine.ts). Wer hier eine zweite
 * Zuordnungswahrheit einfuehrt, baut die naechste Aggregat-Falle - die Engine
 * und der Arbeitsplatz muessen dasselbe Dokument derselben Position zuschreiben.
 */

export interface ArbeitsplatzDokument {
  id: string;
  name: string;
  mimeType: string;
  documentType: DocumentType | null;
  applicantId: string | null;
  applicantSource: string | null;
  reviewStatus: string;
  readable: boolean | null;
  classificationStatus: string;
  extractionStatus: string;
  /** ISO-Datum des Uploads - Client-Komponenten bekommen keine Date-Objekte. */
  hochgeladenAm: string;
}

export interface ArbeitsplatzPosition {
  key: string;
  name: string;
  level: string;
  status: ResolvedChecklistItem["status"];
  documentType: DocumentType | null;
  effectiveRequiredCount: number;
  /** Zusatz "Fehlt noch fuer: ..." - vorformuliert, weil nur der Server die Namen kennt. */
  fehltFuer: string | null;
  /** Zaehlende Dokumente (offen/akzeptiert). */
  dokumente: ArbeitsplatzDokument[];
  /** Aussortierte Versionen (ersetzt/abgelehnt/Duplikat) - eingeklappt sichtbar. */
  stapel: ArbeitsplatzDokument[];
}

export interface ArbeitsplatzAbschnitt {
  titel: string;
  positionen: ArbeitsplatzPosition[];
}

export interface Arbeitsplatz {
  abschnitte: ArbeitsplatzAbschnitt[];
  /** Dokumente ohne erkannten Typ - der Eingang, aus dem zugeordnet wird. */
  eingang: ArbeitsplatzDokument[];
  /** Dokumente MIT Typ, den aber keine Position verlangt (z. B. "sonstige"). */
  weitere: ArbeitsplatzDokument[];
  /** Aussortierte ohne passende Position - nichts darf stillschweigend verschwinden. */
  aussortiert: ArbeitsplatzDokument[];
}

/** Aufbau eines Kreditakts - die Reihenfolge ist die Lesereihenfolge der Bank. */
const ABSCHNITT_REIHENFOLGE = [
  "Person",
  "Einkommen",
  "Eigenkapital & Vermögen",
  "Objekt",
  "Finanzierung & Bestand",
  "Weitere Anforderungen",
] as const;

const ABSCHNITT_JE_TYP: Partial<Record<DocumentType, (typeof ABSCHNITT_REIHENFOLGE)[number]>> = {
  personalausweis: "Person",
  gehaltsabrechnung: "Einkommen",
  einkommensteuerbescheid: "Einkommen",
  einkommensteuererklaerung: "Einkommen",
  bwa: "Einkommen",
  susa: "Einkommen",
  jahresabschluss: "Einkommen",
  euer: "Einkommen",
  rentenbescheid: "Einkommen",
  kontoauszug: "Eigenkapital & Vermögen",
  eigenkapitalnachweis: "Eigenkapital & Vermögen",
  grundbuchauszug: "Objekt",
  expose: "Objekt",
  kaufvertragsentwurf: "Objekt",
  teilungserklaerung: "Objekt",
  wohnflaechenberechnung: "Objekt",
  flurkarte_lageplan: "Objekt",
  baubeschreibung: "Objekt",
  baukostenaufstellung: "Objekt",
  baugenehmigung: "Objekt",
  mietvertrag: "Objekt",
  mietaufstellung: "Objekt",
  weg_protokoll: "Objekt",
  darlehensvertrag: "Finanzierung & Bestand",
  restschuldnachweis: "Finanzierung & Bestand",
  versicherungsnachweis: "Finanzierung & Bestand",
};

/** Zaehlt fuer die Erfuellung einer Position - Spiegel der Engine-Regel. */
const AKTIV = new Set(["offen", "akzeptiert"]);

export function baueArbeitsplatz(
  checklist: Array<
    Pick<
      ResolvedChecklistItem,
      "key" | "name" | "level" | "status" | "documentType" | "effectiveRequiredCount"
    > & { fehltFuer?: string | null }
  >,
  dokumente: ArbeitsplatzDokument[]
): Arbeitsplatz {
  const relevante = checklist.filter((i) => i.status !== "nicht_erforderlich");

  // Je Dokumenttyp gewinnt die ERSTE Position der (nach Pflichtgrad
  // sortierten) Checkliste - eine Bank-Zusatzposition mit demselben Typ wie
  // eine Basisposition darf dasselbe Dokument nicht doppelt zeigen.
  const positionJeTyp = new Map<DocumentType, ArbeitsplatzPosition>();
  const positionen: ArbeitsplatzPosition[] = relevante.map((i) => {
    const p: ArbeitsplatzPosition = {
      key: i.key,
      name: i.name,
      level: i.level,
      status: i.status,
      documentType: i.documentType,
      effectiveRequiredCount: i.effectiveRequiredCount,
      fehltFuer: i.fehltFuer ?? null,
      dokumente: [],
      stapel: [],
    };
    if (i.documentType && !positionJeTyp.has(i.documentType)) {
      positionJeTyp.set(i.documentType, p);
    }
    return p;
  });

  const eingang: ArbeitsplatzDokument[] = [];
  const weitere: ArbeitsplatzDokument[] = [];
  const aussortiert: ArbeitsplatzDokument[] = [];

  for (const d of dokumente) {
    const ziel = d.documentType ? positionJeTyp.get(d.documentType) : undefined;
    if (AKTIV.has(d.reviewStatus)) {
      if (ziel) ziel.dokumente.push(d);
      else if (d.documentType) weitere.push(d);
      else eingang.push(d);
    } else {
      // Ersetzt/abgelehnt/Duplikat: hinter der Position stapeln, damit die
      // Mittelspalte aufgeraeumt ist, ohne dass etwas verschwindet.
      if (ziel) ziel.stapel.push(d);
      else aussortiert.push(d);
    }
  }

  const abschnittMap = new Map<string, ArbeitsplatzPosition[]>();
  for (const p of positionen) {
    const titel = (p.documentType && ABSCHNITT_JE_TYP[p.documentType]) || "Weitere Anforderungen";
    const liste = abschnittMap.get(titel) ?? [];
    liste.push(p);
    abschnittMap.set(titel, liste);
  }

  const abschnitte: ArbeitsplatzAbschnitt[] = ABSCHNITT_REIHENFOLGE.filter((t) =>
    abschnittMap.has(t)
  ).map((t) => ({ titel: t, positionen: abschnittMap.get(t)! }));

  return { abschnitte, eingang, weitere, aussortiert };
}

/** Erfuellte Positionen eines Abschnitts - fuer den Fortschritt im Kopf. */
export function abschnittFortschritt(a: ArbeitsplatzAbschnitt): { erfuellt: number; gesamt: number } {
  const zaehlbar = a.positionen.filter((p) => p.status !== "nicht_erforderlich");
  return {
    erfuellt: zaehlbar.filter((p) => p.status === "vorhanden").length,
    gesamt: zaehlbar.length,
  };
}
