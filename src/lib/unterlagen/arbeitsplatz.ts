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
  /**
   * Urspruenglicher Dateiname vom Upload. Im Eingang heissen sonst sechs
   * Dateien gleich ("Sonstige_Unterlagen.jpg") - erst der Originalname
   * unterscheidet, welches Foto welches ist.
   */
  originalName: string;
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
  /**
   * Anzeigetext des Upload-Zeitpunkts, auf dem SERVER formatiert (feste
   * Zeitzone Europe/Berlin). Im Client formatieren hiesse: Server rendert in
   * UTC, Browser in Ortszeit - genau die Hydration-Falle (BAUFIDESK-E).
   */
  hochgeladenAmText: string;
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
  grundriss: "Objekt",
  ansichten: "Objekt",
  skizze: "Objekt",
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

/** Zahlen fuer die Ueberblicksleiste ueber den Spalten. */
export interface ArbeitsplatzUeberblick {
  /** Ohne Typ - muss erst zugeordnet werden. */
  eingang: number;
  /** Zugeordnet, aber noch nicht freigegeben oder abgelehnt. */
  zuPruefen: number;
  /** Anforderungen, die noch nicht erfuellt sind. */
  fehlend: number;
  erfuellt: number;
  gesamt: number;
}

export function arbeitsplatzUeberblick(a: Arbeitsplatz): ArbeitsplatzUeberblick {
  const positionen = a.abschnitte.flatMap((x) => x.positionen);
  const zugeordnet = [...positionen.flatMap((p) => p.dokumente), ...a.weitere];
  const fortschritt = a.abschnitte.map(abschnittFortschritt);
  return {
    eingang: a.eingang.length,
    zuPruefen: zugeordnet.filter((d) => d.reviewStatus === "offen").length,
    fehlend: positionen.filter((p) => p.status !== "vorhanden" && p.status !== "nicht_erforderlich")
      .length,
    erfuellt: fortschritt.reduce((s, f) => s + f.erfuellt, 0),
    gesamt: fortschritt.reduce((s, f) => s + f.gesamt, 0),
  };
}

/**
 * Womit die Seite aufgeht. Die Vorschau darf nie leer starten, solange es
 * ein Dokument gibt - "In der Mitte ein Dokument anklicken" war genau die
 * leere Seite, die niemand versteht. Reihenfolge nach Dringlichkeit: erst der
 * Eingang (blockiert alles andere), dann das erste ungepruefte Dokument, dann
 * die erste offene Anforderung (ohne Dokument - die Vorschau erklaert dann,
 * dass hier noch nichts liegt), zuletzt irgendein Dokument.
 */
export function ersterEinstieg(a: Arbeitsplatz): {
  dokumentId: string | null;
  positionKey: string | null;
} {
  if (a.eingang[0]) return { dokumentId: a.eingang[0].id, positionKey: null };
  const positionen = a.abschnitte.flatMap((x) => x.positionen);
  for (const p of positionen) {
    const offen = p.dokumente.find((d) => d.reviewStatus === "offen");
    if (offen) return { dokumentId: offen.id, positionKey: p.key };
  }
  const luecke = positionen.find((p) => p.dokumente.length === 0 && p.status !== "vorhanden");
  if (luecke) return { dokumentId: null, positionKey: luecke.key };
  for (const p of positionen) {
    if (p.dokumente[0]) return { dokumentId: p.dokumente[0].id, positionKey: p.key };
  }
  if (a.weitere[0]) return { dokumentId: a.weitere[0].id, positionKey: null };
  return { dokumentId: null, positionKey: positionen[0]?.key ?? null };
}

/**
 * Die gefuehrte Durchsicht: eine Warteschlange aller Dokumente, an denen noch
 * eine Entscheidung haengt, mit der Frage, die jeweils zu beantworten ist.
 *
 * - `zuordnen`: kein Typ erkannt (Eingang) - "Welche Unterlage ist das?"
 * - `bestaetigen`: Typ erkannt und von einer Anforderung verlangt -
 *   "Stimmt der erkannte Typ?" (freigeben, korrigieren oder aussortieren)
 * - `entscheiden`: Typ erkannt, aber keine Anforderung verlangt ihn -
 *   "Wird das gebraucht?" (behalten oder aussortieren)
 *
 * Reihenfolge nach Dringlichkeit: Zuordnen zuerst (ein Dokument ohne Typ
 * zaehlt nirgends), dann Bestaetigen in Aktenreihenfolge, zuletzt Entscheiden.
 * Wer eine Aufgabe erledigt, laesst das Dokument aus der Schlange fallen -
 * die Oberflaeche merkt sich nur den Index und steht damit automatisch auf
 * dem naechsten.
 */
export type DurchsichtAufgabe = "zuordnen" | "bestaetigen" | "entscheiden";

export interface DurchsichtSchritt {
  dokument: ArbeitsplatzDokument;
  aufgabe: DurchsichtAufgabe;
  /** Die Anforderung, unter der das Dokument haengt (nur bei `bestaetigen`). */
  position: ArbeitsplatzPosition | null;
}

export function baueDurchsicht(a: Arbeitsplatz): DurchsichtSchritt[] {
  const schritte: DurchsichtSchritt[] = [];
  for (const d of a.eingang) {
    if (d.reviewStatus === "offen") schritte.push({ dokument: d, aufgabe: "zuordnen", position: null });
  }
  for (const abschnitt of a.abschnitte) {
    for (const p of abschnitt.positionen) {
      for (const d of p.dokumente) {
        if (d.reviewStatus === "offen") schritte.push({ dokument: d, aufgabe: "bestaetigen", position: p });
      }
    }
  }
  for (const d of a.weitere) {
    if (d.reviewStatus === "offen") schritte.push({ dokument: d, aufgabe: "entscheiden", position: null });
  }
  return schritte;
}

/** Anforderungen, die nach der Durchsicht noch offen sind - fuer den Abschluss. */
export function offeneAnforderungen(a: Arbeitsplatz): ArbeitsplatzPosition[] {
  return a.abschnitte
    .flatMap((x) => x.positionen)
    .filter((p) => p.status !== "vorhanden" && p.status !== "nicht_erforderlich");
}
