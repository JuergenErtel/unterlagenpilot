import type { BackofficePrioritaet, BackofficeStatus } from "@/lib/domain/enums";
import { BACKOFFICE_STATUS } from "@/lib/domain/enums";
import { bewerteSla, type SlaZustand } from "./sla";
import { istAktiv, wartetAufAuftraggeber } from "./status";

/**
 * Kennzahlen des Backoffice-Dashboards, rein gerechnet ueber die Auftraege
 * einer Organisation. Nichts hiervon liest oder schreibt Vertriebsdaten.
 */

export interface AuftragFuerKennzahlen {
  id: string;
  status: BackofficeStatus;
  prioritaet: BackofficePrioritaet;
  eingangAm: Date;
  faelligAm: Date | null;
  pausiertSeit: Date | null;
  bearbeiterId: string | null;
  bearbeiterName: string | null;
  uebergebenAm: Date | null;
  updatedAt: Date;
  /** Offene Checklistenpositionen der Akte. */
  fehlendeUnterlagen: number;
  /** Dokumente ohne Entscheidung. */
  ungepruefteDokumente: number;
  offeneRueckfragen: number;
  beantworteteRueckfragen: number;
}

export interface BackofficeKennzahlen {
  neuEingegangen: number;
  jeStatus: Array<{ status: BackofficeStatus; anzahl: number }>;
  heuteFaellig: number;
  slaGefaehrdet: number;
  slaUeberschritten: number;
  wartetAufUnterlagen: number;
  wartetAufAuftraggeber: number;
  dokumenteZuPruefen: number;
  qualitaetskontrollenOffen: number;
  heuteFertiggestellt: number;
  /** Durchschnitt Eingang -> Uebergabe in Kalendertagen, letzte 30 Tage. */
  durchschnittBearbeitungstage: number | null;
  jeBearbeiter: Array<{ bearbeiterId: string | null; name: string; anzahl: number }>;
  aktiveGesamt: number;
}

function gleicherTagBerlin(a: Date, b: Date): boolean {
  const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(a) === f.format(b);
}

export function berechneKennzahlen(auftraege: AuftragFuerKennzahlen[], jetzt: Date): BackofficeKennzahlen {
  const aktive = auftraege.filter((a) => istAktiv(a.status));
  const slaZustaende = new Map<string, SlaZustand>();
  for (const a of aktive) {
    slaZustaende.set(a.id, bewerteSla({ faelligAm: a.faelligAm, status: a.status, pausiert: a.pausiertSeit != null, jetzt }).zustand);
  }
  const zaehle = (z: SlaZustand) => [...slaZustaende.values()].filter((x) => x === z).length;

  const jeStatus = BACKOFFICE_STATUS.map((status) => ({
    status,
    anzahl: auftraege.filter((a) => a.status === status).length,
  })).filter((s) => s.anzahl > 0);

  const bearbeiterMap = new Map<string | null, { name: string; anzahl: number }>();
  for (const a of aktive) {
    const key = a.bearbeiterId;
    const name = a.bearbeiterName ?? "Nicht zugewiesen";
    const e = bearbeiterMap.get(key) ?? { name, anzahl: 0 };
    e.anzahl += 1;
    bearbeiterMap.set(key, e);
  }

  const fertigeLetzte30 = auftraege.filter(
    (a) => a.uebergebenAm && jetzt.getTime() - a.uebergebenAm.getTime() <= 30 * 86_400_000
  );
  const durchschnitt =
    fertigeLetzte30.length > 0
      ? fertigeLetzte30.reduce((acc, a) => acc + (a.uebergebenAm!.getTime() - a.eingangAm.getTime()) / 86_400_000, 0) /
        fertigeLetzte30.length
      : null;

  return {
    neuEingegangen: auftraege.filter((a) => a.status === "neu_eingegangen").length,
    jeStatus,
    heuteFaellig: zaehle("heute"),
    slaGefaehrdet: zaehle("gefaehrdet"),
    slaUeberschritten: zaehle("ueberschritten"),
    wartetAufUnterlagen: auftraege.filter((a) => a.status === "wartet_auf_unterlagen").length,
    wartetAufAuftraggeber: auftraege.filter((a) => wartetAufAuftraggeber(a.status)).length,
    dokumenteZuPruefen: aktive.reduce((acc, a) => acc + a.ungepruefteDokumente, 0),
    qualitaetskontrollenOffen: auftraege.filter((a) => a.status === "qualitaetskontrolle").length,
    heuteFertiggestellt: auftraege.filter((a) => a.uebergebenAm && gleicherTagBerlin(a.uebergebenAm, jetzt)).length,
    durchschnittBearbeitungstage: durchschnitt == null ? null : Math.round(durchschnitt * 10) / 10,
    jeBearbeiter: [...bearbeiterMap.entries()]
      .map(([bearbeiterId, e]) => ({ bearbeiterId, name: e.name, anzahl: e.anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    aktiveGesamt: aktive.length,
  };
}

/** Die Listen des Dashboards: was jetzt Aufmerksamkeit braucht. */
export interface DashboardListen<T extends AuftragFuerKennzahlen> {
  jetztBearbeiten: T[];
  fristHeute: T[];
  rueckmeldungEingegangen: T[];
  qualitaetskontrolle: T[];
  uebergabebereit: T[];
  zuletztBearbeitet: T[];
}

const PRIO_RANG: Record<BackofficePrioritaet, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };

export function baueDashboardListen<T extends AuftragFuerKennzahlen>(auftraege: T[], jetzt: Date, deckel = 8): DashboardListen<T> {
  const aktive = auftraege.filter((a) => istAktiv(a.status) && a.pausiertSeit == null);
  const sla = (a: T) => bewerteSla({ faelligAm: a.faelligAm, status: a.status, pausiert: false, jetzt });
  const nachFrist = (a: T, b: T) => {
    const pa = PRIO_RANG[a.prioritaet] - PRIO_RANG[b.prioritaet];
    if (pa !== 0) return pa;
    const fa = a.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const fb = b.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return fa - fb;
  };

  // "Jetzt bearbeiten": alles, woran das Backoffice arbeiten kann - ohne die
  // Wartezustaende, in denen es nichts tun kann.
  const bearbeitbar = aktive.filter((a) => !wartetAufAuftraggeber(a.status) && a.status !== "uebergeben");
  return {
    jetztBearbeiten: [...bearbeitbar]
      .filter((a) => a.status !== "qualitaetskontrolle" && a.status !== "einreichungsfertig")
      .sort(nachFrist)
      .slice(0, deckel),
    fristHeute: aktive.filter((a) => ["heute", "ueberschritten"].includes(sla(a).zustand)).sort(nachFrist).slice(0, deckel),
    rueckmeldungEingegangen: aktive.filter((a) => a.beantworteteRueckfragen > 0).sort(nachFrist).slice(0, deckel),
    qualitaetskontrolle: aktive.filter((a) => a.status === "qualitaetskontrolle").sort(nachFrist).slice(0, deckel),
    uebergabebereit: aktive.filter((a) => a.status === "einreichungsfertig").sort(nachFrist).slice(0, deckel),
    zuletztBearbeitet: [...auftraege].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, deckel),
  };
}
