import type { ResolvedChecklistItem } from "@/lib/checklists/engine";

/**
 * Uebersetzt den internen Unterlagenstand in das, was ein Kunde sehen soll.
 *
 * Bewusst eigene Begriffe: Der Kunde liest „eingegangen", nicht „reviewStatus
 * offen". Und er sieht nur Positionen, die ihn etwas angehen.
 */
export interface KundenPosition {
  key: string;
  name: string;
  beschreibung: string;
  beispiel?: string;
  zustand: "offen" | "eingegangen" | "teilweise" | "angenommen" | "abgelehnt";
  /** Nur bei Ablehnung, und nur wenn der Vermittler einen Grund hinterlegt hat. */
  grund?: string;
  /**
   * Wie viele Dokumente diese Position insgesamt braucht (z. B. 2 bei einer
   * `perApplicant`-Position mit zwei Antragstellern, oder 2 Jahre EÜR).
   */
  verlangt: number;
  /** Wie viele davon bereits angenommen wurden. */
  akzeptiert: number;
}

export interface KundenFortschritt {
  positionen: KundenPosition[];
  /** Positionen, die vollstaendig angenommen sind. */
  erledigt: number;
  /**
   * Positionen, zu denen etwas bei uns liegt – angenommen, teilweise oder
   * ungeprueft eingegangen. Ohne diese Zahl sah ein Kunde, der abends alles
   * hochgeladen hat, bis zur Pruefung "0 von 12" und wurde weiter zum
   * Hochladen aufgefordert.
   */
  eingereicht: number;
  gesamt: number;
  /** Anteil der angenommenen Positionen. */
  prozent: number;
  /** Anteil der Positionen, zu denen etwas vorliegt (>= prozent). */
  prozentEingereicht: number;
}

export interface KundenDokument {
  documentType: string | null;
  reviewStatus: string;
  reviewNote: string | null;
  /**
   * Wann die Datei hochgeladen wurde. Noetig, weil je Position der JUENGSTE
   * Stand gilt: laedt der Kunde nach einer Ablehnung dieselbe Unterlage neu
   * hoch, darf nicht weiter der alte, abgelehnte Datensatz gewinnen.
   */
  createdAt: Date;
  /**
   * Zugeordneter Antragsteller, falls bekannt. Bei Positionen, die pro
   * Antragsteller verlangt werden, zaehlten sonst zwei Dokumente DESSELBEN
   * Antragstellers als vollstaendig.
   */
  applicantId?: string | null;
}

export function baueKundenfortschritt(input: {
  positionen: ResolvedChecklistItem[];
  dokumente: KundenDokument[];
  /** Antragsteller des Falls, nach Position sortiert. */
  applicantIds?: string[];
}): KundenFortschritt {
  const sichtbar = input.positionen.filter((p) => p.customerVisible);
  const applicantIds = input.applicantIds ?? [];

  const positionen: KundenPosition[] = sichtbar.map((p) => {
    // Zeitlich aufsteigend: der letzte Eintrag ist der juengste Stand.
    //
    // `duplikat` und `ersetzt` fliegen raus – genau wie in der Vermittlersicht
    // (checklists/engine, resolveStatus). Sonst hob ausgerechnet die erneute
    // Ablage DERSELBEN Datei eine Ablehnung auf: der Kunde laedt nach der
    // Ablehnung dasselbe noch einmal hoch, es wird als `duplikat` markiert –
    // und er las dauerhaft "Bei uns eingegangen, wird geprueft", ohne je zu
    // erfahren, dass er etwas anderes liefern muss.
    const passende = input.dokumente
      .filter(
        (d) =>
          d.documentType &&
          d.documentType === p.documentType &&
          d.reviewStatus !== "duplikat" &&
          d.reviewStatus !== "ersetzt"
      )
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Manche Positionen verlangen mehr als ein Dokument (z. B. `perApplicant`
    // bei zwei Antragstellern, oder mehrere Jahre EÜR) – effectiveRequiredCount
    // traegt das bereits aufgeloest. Ohne diesen Zaehler wuerde EIN akzeptiertes
    // Dokument die Position faelschlich als komplett "angenommen" melden, obwohl
    // z. B. der zweite Antragsteller noch gar nichts eingereicht hat.
    const verlangt = Math.max(p.effectiveRequiredCount, 1);
    const angenommen = passende.filter((d) => d.reviewStatus === "akzeptiert");
    // Bei Positionen je Antragsteller zaehlt jede Person nur ihr eigenes Soll:
    // zwei Ausweise desselben Antragstellers ergeben keine zwei erfuellten
    // Plaetze.
    //
    // Achtung, hier weicht die Kundensicht bewusst von der Vermittlersicht ab:
    // `engine.ts` schreibt ein noch nicht zugeordnetes Dokument NIEMANDEM gut
    // (der Vermittler soll es im Review-Center zuordnen), wir dagegen fuellen
    // damit die offenen Plaetze auf. Grund: ueber den gemeinsamen Upload-Link
    // verraet die Datei nicht, wer sie hochgeladen hat – der Kunde saehe sonst
    // seine gerade angenommene Unterlage gar nicht.
    const perPerson = Math.max(p.requiredCount ?? 1, 1);
    const jeAntragsteller = p.perApplicant === true && applicantIds.length > 1;
    const akzeptiert = jeAntragsteller
      ? zaehleJeAntragsteller(angenommen, applicantIds, perPerson)
      : angenommen.length;
    const abgelehnt = jeAntragsteller
      ? ablehnungJeAntragsteller(passende, applicantIds, perPerson)
      : offeneAblehnung(passende, verlangt);
    const eingegangen = passende.length > 0;

    // Reihenfolge der Zustaende: eine vollstaendige Annahme schlaegt alles,
    // danach eine teilweise Annahme (der Kunde hat bereits etwas geschafft),
    // danach die Ablehnung (der Kunde muss handeln), dann der blosse Eingang.
    if (akzeptiert >= verlangt) {
      return basis(p, "angenommen", verlangt, akzeptiert);
    }
    if (akzeptiert > 0) {
      return basis(p, "teilweise", verlangt, akzeptiert);
    }
    if (abgelehnt) {
      return { ...basis(p, "abgelehnt", verlangt, akzeptiert), grund: abgelehnt.reviewNote ?? undefined };
    }
    if (eingegangen) {
      return basis(p, "eingegangen", verlangt, akzeptiert);
    }
    return basis(p, "offen", verlangt, akzeptiert);
  });

  const gesamt = positionen.length;
  const erledigt = positionen.filter((p) => p.zustand === "angenommen").length;
  // "abgelehnt" zaehlt bewusst NICHT als eingereicht: dort muss der Kunde
  // handeln, die Position ist fuer ihn wieder offen.
  const eingereicht = positionen.filter(
    (p) => p.zustand === "angenommen" || p.zustand === "teilweise" || p.zustand === "eingegangen"
  ).length;
  const prozent = gesamt === 0 ? 100 : Math.round((erledigt / gesamt) * 100);
  const prozentEingereicht = gesamt === 0 ? 100 : Math.round((eingereicht / gesamt) * 100);

  return { positionen, erledigt, eingereicht, gesamt, prozent, prozentEingereicht };
}

/**
 * Der Hinweis unter einer nur teilweise erfuellten Position.
 *
 * Bewusst ohne "reichen Sie nach": Bei einer Position, die pro Antragsteller
 * verlangt wird, fehlt die Unterlage beim MITantragsteller, nicht beim Leser –
 * die alte Formulierung schickte den Falschen los.
 */
export function fehlmengeHinweis(verlangt: number, akzeptiert: number): string {
  const offen = Math.max(verlangt - akzeptiert, 0);
  return (
    `Für diese Position fehlen noch ${offen} von ${verlangt} Unterlagen – etwa die eines` +
    ` Mitantragstellers oder für einen weiteren Zeitraum.`
  );
}

/**
 * Zaehlt angenommene Dokumente einer Position, die pro Antragsteller verlangt
 * wird: je Person hoechstens ihr eigenes Soll.
 *
 * Noch nicht zugeordnete Dokumente fuellen die verbliebenen Plaetze auf. Sie
 * wegzulassen waere unehrlich in die andere Richtung: bei einem gemeinsamen
 * Upload-Link verraet die Datei nicht, wer sie hochgeladen hat, und der
 * Vermittler ordnet erst spaeter zu – der Kunde saehe seinen angenommenen
 * Ausweis sonst gar nicht.
 */
function zaehleJeAntragsteller(
  angenommen: KundenDokument[],
  applicantIds: string[],
  proPerson: number
): number {
  let frei = angenommen.filter(
    (d) => !d.applicantId || !applicantIds.includes(d.applicantId)
  ).length;
  let summe = 0;
  for (const id of applicantIds) {
    const eigene = angenommen.filter((d) => d.applicantId === id).length;
    const gezaehlt = Math.min(eigene, proPerson);
    const ausFrei = Math.min(proPerson - gezaehlt, frei);
    frei -= ausFrei;
    summe += gezaehlt + ausFrei;
  }
  return summe;
}

/**
 * Die Ablehnung, die der Kunde zu EINEM Platz noch sehen soll – oder keine.
 *
 * Eine Ablehnung gilt nur so lange, bis der Kunde den Platz wieder gefuellt
 * hat. Ohne diese Regel bliebe er nach seinem zweiten Versuch in "Bitte erneut
 * hochladen" haengen: das alte, abgelehnte Dokument gewaenne weiter, samt altem
 * Grund – eine Quittung fuer seinen Upload bekaeme er nie.
 *
 * Massgeblich ist die MENGE der brauchbaren Dokumente, nicht bloss der zeitlich
 * letzte Eintrag. Bei einer Position ueber mehrere Dokumente (z. B. EUeR ueber
 * zwei Jahre) loeschte "der letzte gewinnt" sonst die Ablehnung von Jahr 1,
 * sobald Jahr 2 hochgeladen wurde – der Kunde erfuhr nie, dass Jahr 1 noch
 * fehlt.
 *
 * `dokumente` muss zeitlich aufsteigend sortiert sein.
 */
function offeneAblehnung(
  dokumente: KundenDokument[],
  soll: number
): KundenDokument | undefined {
  // Die juengste Ablehnung – bei zwei Ablehnungen zaehlt der neue Grund.
  let letzteIdx = -1;
  dokumente.forEach((d, i) => {
    if (d.reviewStatus === "abgelehnt") letzteIdx = i;
  });
  if (letzteIdx === -1) return undefined;

  // Zwei Bedingungen muessen zusammenkommen, damit die Ablehnung erledigt ist:
  //
  // 1. Es liegt ueberhaupt genug Brauchbares vor, um alle verlangten Plaetze zu
  //    fuellen. Sonst loeschte bei einer Position ueber mehrere Dokumente (EUeR
  //    ueber zwei Jahre) schon Jahr 2 die Ablehnung von Jahr 1.
  // 2. Mindestens ein brauchbares Dokument ist JUENGER als die Ablehnung – nur
  //    das ist eine Antwort darauf. Ein Dokument, das schon vorher zur Pruefung
  //    lag, beantwortet die spaetere Ablehnung nicht.
  const genug = dokumente.filter((d) => d.reviewStatus !== "abgelehnt").length >= soll;
  const antwort = dokumente.slice(letzteIdx + 1).some((d) => d.reviewStatus !== "abgelehnt");
  if (genug && antwort) return undefined;

  return dokumente[letzteIdx];
}

/**
 * Dieselbe Frage bei einer Position, die PRO ANTRAGSTELLER verlangt wird.
 *
 * Hier hat jeder Antragsteller seinen eigenen Platz, und eine Ablehnung darf
 * nur durch ein neueres Dokument DESSELBEN Platzes aufgehoben werden. Vorher
 * lief die zeitliche Auswertung ueber die ganze Position: Annas Ausweis wurde
 * abgelehnt, danach lud BERND seinen hoch – und Annas Ablehnung samt Grund war
 * verschwunden. Die Position galt dann sogar als eingereicht, der Hinweistext
 * sagte "Alles eingegangen, Sie muessen nichts weiter tun", und Anna erfuhr
 * nie, dass sie nachliefern muss.
 *
 * Noch nicht zugeordnete Dokumente bilden einen eigenen Platz und heben die
 * Ablehnung einer bestimmten Person NICHT auf. Das ist die vorsichtige
 * Richtung: eine Ablehnung faelschlich zu zeigen kostet den Kunden einen
 * ueberfluessigen Blick, sie faelschlich zu verbergen kostet ihn die
 * Finanzierung.
 */
function ablehnungJeAntragsteller(
  dokumente: KundenDokument[],
  applicantIds: string[],
  proPerson: number
): KundenDokument | undefined {
  for (const id of applicantIds) {
    const treffer = offeneAblehnung(
      dokumente.filter((d) => d.applicantId === id),
      proPerson
    );
    if (treffer) return treffer;
  }
  return offeneAblehnung(
    dokumente.filter((d) => !d.applicantId || !applicantIds.includes(d.applicantId)),
    proPerson
  );
}

/**
 * Der Satz unter dem Fortschrittsbalken.
 *
 * Bewusst hier statt in der Komponente: So laesst sich pruefen, dass niemand
 * mehr zum Hochladen aufgefordert wird, obwohl nichts mehr offen ist – genau
 * das stand vorher da, waehrend die Liste darunter korrekt "Bei uns
 * eingegangen, wird geprueft" meldete.
 */
export function fortschrittHinweis(f: {
  erledigt: number;
  eingereicht: number;
  gesamt: number;
}): string {
  if (f.gesamt === 0) {
    return "Aktuell sind keine Unterlagen offen. Ihr Berater meldet sich, falls noch etwas benötigt wird.";
  }
  if (f.erledigt >= f.gesamt) {
    return "Geschafft – alle Unterlagen sind angenommen. Vielen Dank!";
  }
  if (f.eingereicht >= f.gesamt) {
    return "Alles eingegangen – wir prüfen Ihre Unterlagen. Sie müssen aktuell nichts weiter tun.";
  }
  return "Laden Sie die noch offenen Unterlagen hoch. Sie können das jederzeit fortsetzen.";
}

function basis(
  p: ResolvedChecklistItem,
  zustand: KundenPosition["zustand"],
  verlangt: number,
  akzeptiert: number
): KundenPosition {
  return {
    key: p.key,
    name: p.name,
    beschreibung: p.customerDescription,
    beispiel: p.example,
    zustand,
    verlangt,
    akzeptiert,
  };
}
