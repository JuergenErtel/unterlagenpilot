import type { BackofficePrioritaet, BackofficeStatus } from "@/lib/domain/enums";
import { BACKOFFICE_PRIORITAETEN, BACKOFFICE_STATUS } from "@/lib/domain/enums";
import { bewerteSla, type SlaZustand } from "./sla";
import { istAktiv } from "./status";
import type { AuftragFuerKennzahlen } from "./kennzahlen";

/**
 * Filter und Reihenfolge der Bearbeitungsqueue - rein, damit die Seite nur
 * noch die URL-Parameter durchreicht.
 */

export interface QueueFilter {
  auftraggeberId?: string | null;
  bearbeiterId?: string | null; // "keiner" = nicht zugewiesen
  status?: BackofficeStatus | "aktiv" | "alle" | null;
  prioritaet?: BackofficePrioritaet | null;
  sla?: SlaZustand | null;
  auftragsart?: string | null;
  suche?: string | null;
}

export interface AuftragFuerQueue extends AuftragFuerKennzahlen {
  auftragsnummer: string;
  aktenbezeichnung: string;
  auftraggeberId: string;
  auftraggeberName: string;
  auftragsart: string;
}

const PRIO_RANG: Record<BackofficePrioritaet, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };

export function liesQueueFilter(params: Record<string, string | string[] | undefined>): QueueFilter {
  const eins = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };
  const status = eins("status");
  const prio = eins("prioritaet");
  const sla = eins("sla");
  return {
    auftraggeberId: eins("auftraggeber"),
    bearbeiterId: eins("bearbeiter"),
    status:
      status === "aktiv" || status === "alle" || (BACKOFFICE_STATUS as readonly string[]).includes(status ?? "")
        ? (status as QueueFilter["status"])
        : null,
    prioritaet: (BACKOFFICE_PRIORITAETEN as readonly string[]).includes(prio ?? "") ? (prio as BackofficePrioritaet) : null,
    sla: ["ok", "heute", "gefaehrdet", "ueberschritten", "ruht", "keine"].includes(sla ?? "") ? (sla as SlaZustand) : null,
    auftragsart: eins("art"),
    suche: eins("q"),
  };
}

export function filtereQueue<T extends AuftragFuerQueue>(auftraege: T[], filter: QueueFilter, jetzt: Date): T[] {
  const suche = filter.suche?.toLowerCase() ?? null;
  return auftraege.filter((a) => {
    const statusFilter = filter.status ?? "aktiv";
    if (statusFilter === "aktiv" && !istAktiv(a.status)) return false;
    if (statusFilter !== "aktiv" && statusFilter !== "alle" && a.status !== statusFilter) return false;
    if (filter.auftraggeberId && a.auftraggeberId !== filter.auftraggeberId) return false;
    if (filter.bearbeiterId === "keiner" && a.bearbeiterId != null) return false;
    if (filter.bearbeiterId && filter.bearbeiterId !== "keiner" && a.bearbeiterId !== filter.bearbeiterId) return false;
    if (filter.prioritaet && a.prioritaet !== filter.prioritaet) return false;
    if (filter.auftragsart && a.auftragsart !== filter.auftragsart) return false;
    if (filter.sla) {
      const z = bewerteSla({ faelligAm: a.faelligAm, status: a.status, pausiert: a.pausiertSeit != null, jetzt }).zustand;
      if (z !== filter.sla) return false;
    }
    if (suche) {
      const treffer =
        a.auftragsnummer.toLowerCase().includes(suche) ||
        a.aktenbezeichnung.toLowerCase().includes(suche) ||
        a.auftraggeberName.toLowerCase().includes(suche);
      if (!treffer) return false;
    }
    return true;
  });
}

/**
 * Reihenfolge: Ueberfaellig und heute zuerst, dann nach Prioritaet, dann nach
 * Frist, pausierte und wartende ans Ende. Terminale zuletzt nach Datum.
 */
export function sortiereQueue<T extends AuftragFuerQueue>(auftraege: T[], jetzt: Date): T[] {
  const rang = (a: T): number => {
    if (!istAktiv(a.status)) return 5;
    if (a.pausiertSeit) return 4;
    const z = bewerteSla({ faelligAm: a.faelligAm, status: a.status, pausiert: false, jetzt }).zustand;
    if (z === "ueberschritten") return 0;
    if (z === "heute") return 1;
    if (z === "ruht") return 3;
    return 2;
  };
  return [...auftraege].sort((a, b) => {
    const r = rang(a) - rang(b);
    if (r !== 0) return r;
    const p = PRIO_RANG[a.prioritaet] - PRIO_RANG[b.prioritaet];
    if (p !== 0) return p;
    const fa = a.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const fb = b.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    return a.eingangAm.getTime() - b.eingangAm.getTime();
  });
}
