import type { BackofficePrioritaet, BackofficeStatus } from "@/lib/domain/enums";
import type { Tone } from "@/lib/ui/tone";
import type { SlaZustand } from "./sla";

/**
 * Farbton je Status - dieselbe Brief-Farblogik wie im Vertrieb (tone.ts):
 * Gruen = bereit, Gelb = wartet auf jemanden, Rot = Blocker, Blau = in
 * Arbeit, Grau = ruht/abgeschlossen. Jede Marke traegt zusaetzlich Text.
 */
export function statusTone(status: BackofficeStatus): Tone {
  switch (status) {
    case "neu_eingegangen":
    case "auftrag_pruefen":
      return "review";
    case "wartet_auf_unterlagen":
    case "rueckfrage_auftraggeber":
      return "review";
    case "in_aufbereitung":
    case "qualitaetskontrolle":
      return "ai";
    case "nachbearbeitung":
      return "blocker";
    case "einreichungsfertig":
    case "uebergeben":
      return "ready";
    case "abgeschlossen":
    case "abgelehnt":
    case "storniert":
      return "neutral";
  }
}

export function slaTone(z: SlaZustand): Tone {
  switch (z) {
    case "ueberschritten":
      return "blocker";
    case "heute":
    case "gefaehrdet":
      return "review";
    case "ok":
      return "ready";
    case "ruht":
    case "keine":
      return "neutral";
  }
}

export function prioritaetTone(p: BackofficePrioritaet): Tone {
  switch (p) {
    case "dringend":
      return "blocker";
    case "hoch":
      return "review";
    case "normal":
      return "neutral";
    case "niedrig":
      return "neutral";
  }
}

const DATUM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function datumText(d: Date | null | undefined): string {
  return d ? DATUM.format(d) : "—";
}

export function datumZeitText(d: Date | null | undefined): string {
  return d ? `${DATUM_ZEIT.format(d)} Uhr` : "—";
}

/** Fuer <input type="date">: JJJJ-MM-TT in Berliner Ortszeit. */
export function datumFeld(d: Date | null | undefined): string {
  if (!d) return "";
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return teile;
}
