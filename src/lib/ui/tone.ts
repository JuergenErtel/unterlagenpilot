/**
 * Zentrale Farb-/Ton-Logik (Brief-Farblogik):
 *  Grün = bereit/geprüft · Gelb = Prüfung erforderlich · Rot = Blocker/fehlt
 *  Blau = KI/automatisiert · Grau = neutral/noch nicht gestartet
 * Eine Quelle für alle Komponenten -> konsistente Statusfarben überall.
 */
export type Tone = "ready" | "review" | "blocker" | "ai" | "neutral";

export const TONE: Record<
  Tone,
  { dot: string; text: string; bg: string; ring: string; bar: string; border: string }
> = {
  ready: {
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
    ring: "stroke-success",
    bar: "bg-success",
    border: "border-success/30",
  },
  review: {
    dot: "bg-warning",
    text: "text-[hsl(var(--warning))]",
    bg: "bg-warning/12",
    ring: "stroke-[hsl(var(--warning))]",
    bar: "bg-warning",
    border: "border-warning/30",
  },
  blocker: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    ring: "stroke-destructive",
    bar: "bg-destructive",
    border: "border-destructive/30",
  },
  ai: {
    dot: "bg-ai",
    text: "text-ai",
    bg: "bg-ai/10",
    ring: "stroke-ai",
    bar: "bg-ai",
    border: "border-ai/30",
  },
  neutral: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    bg: "bg-muted",
    ring: "stroke-muted-foreground/30",
    bar: "bg-muted-foreground/40",
    border: "border-border",
  },
};

/** Einreichungs-Score -> Ton + Bandlabel (4 Bänder laut Spec). */
export function readinessTone(score: number): { tone: Tone; label: string } {
  if (score <= 40) return { tone: "blocker", label: "Viele Daten fehlen" };
  if (score <= 70) return { tone: "review", label: "Teilweise vollständig" };
  if (score <= 90) return { tone: "ai", label: "Fast einreichungsfertig" };
  return { tone: "ready", label: "Einreichungsfertig" };
}

/** Severity -> Ton. */
export function severityTone(s: "ok" | "warnung" | "kritisch" | "fehlt"): Tone {
  return s === "ok" ? "ready" : s === "warnung" ? "review" : s === "kritisch" ? "blocker" : "neutral";
}

/** Konfidenz 0..1 -> Stufe + Ton. */
export function confidenceLevel(c: number): { label: "hoch" | "mittel" | "niedrig"; tone: Tone } {
  if (c >= 0.85) return { label: "hoch", tone: "ready" };
  if (c >= 0.6) return { label: "mittel", tone: "review" };
  return { label: "niedrig", tone: "blocker" };
}
