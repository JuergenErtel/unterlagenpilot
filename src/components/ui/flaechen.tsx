import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Die Oberflaechenhierarchie als Bausteine. Server-tauglich, keine Hooks.
 *
 * Warum eigene Bausteine statt Card ueberall: Eine Kennzahl, ein Hinweis und
 * ein "Jetzt tun" sind drei verschiedene Dinge. Sehen sie gleich aus, muss
 * das Auge jede Karte erst lesen, um zu wissen, ob sie wichtig ist.
 */

export type KpiTon = "neutral" | "warnung" | "kritisch" | "erfolg" | "info";

const KPI_ZAHL: Record<KpiTon, string> = {
  neutral: "text-foreground",
  warnung: "text-[hsl(var(--warning))]",
  kritisch: "text-destructive",
  erfolg: "text-success",
  info: "text-info",
};

/**
 * KPI-Karte. Eine Null tritt zurueck (blass), egal welchen Ton die Karte
 * traegt: Null Ueberschreitungen sind kein Alarm, sondern Ruhe.
 */
export function KpiKarte({
  wert,
  label,
  hinweis,
  href,
  ton = "neutral",
  klein = false,
  className,
}: {
  wert: number | string;
  label: string;
  hinweis?: string;
  href?: string;
  ton?: KpiTon;
  klein?: boolean;
  className?: string;
}) {
  const leer = wert === 0 || wert === "0" || wert === "—";
  const inhalt = (
    <>
      <div className={cn("t-kpi", klein ? "text-xl" : "text-[1.75rem]", leer ? "text-muted-foreground/45" : KPI_ZAHL[ton])}>{wert}</div>
      <div className="mt-1.5 text-[0.8125rem] font-medium leading-tight text-foreground">{label}</div>
      {hinweis && <div className="t-hilfe mt-0.5 text-xs">{hinweis}</div>}
    </>
  );
  const klasse = cn("block rounded-md px-3.5 py-3 transition-colors", href && "hover:bg-accent/60 focus-visible:bg-accent/60", className);
  return href ? (
    <Link href={href} className={klasse}>
      {inhalt}
    </Link>
  ) : (
    <div className={klasse}>{inhalt}</div>
  );
}

/**
 * Kennzahlgruppe: eine Ueberschrift, darunter die Karten in einer Flaeche.
 * Der Ton der Gruppe steht in der Kante, nicht in der Fuellung.
 */
export function KpiGruppe({
  titel,
  beschreibung,
  ton = "neutral",
  children,
  className,
}: {
  titel: string;
  beschreibung?: string;
  ton?: "neutral" | "handeln" | "warten";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={titel}
      className={cn(
        "flaeche-blatt",
        ton === "handeln" && "border-l-[3px] border-l-primary",
        ton === "warten" && "border-l-[3px] border-l-warning/70",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="eyebrow">{titel}</h2>
        {beschreibung && <span className="t-hilfe hidden text-xs sm:inline">{beschreibung}</span>}
      </div>
      <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-4 [&>*]:bg-card max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">{children}</div>
    </section>
  );
}

/**
 * Leerer Zustand mit den drei Antworten: Warum ist hier nichts, was kann ich
 * tun, welche Aktion fuehrt weiter.
 */
export function LeerZustand({
  icon: Icon,
  titel,
  text,
  aktion,
  nebenAktion,
  className,
  kompakt = false,
}: {
  icon?: LucideIcon;
  titel: string;
  text: string;
  aktion?: { href: string; label: string };
  nebenAktion?: { href: string; label: string };
  className?: string;
  kompakt?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", kompakt ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon && (
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-muted-foreground" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h3 className="t-abschnitt text-foreground">{titel}</h3>
      <p className="t-hilfe mt-1.5 max-w-md">{text}</p>
      {(aktion || nebenAktion) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {aktion && (
            <Button asChild size="sm">
              <Link href={aktion.href}>{aktion.label}</Link>
            </Button>
          )}
          {nebenAktion && (
            <Button asChild size="sm" variant="outline">
              <Link href={nebenAktion.href}>{nebenAktion.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Warn- oder Blockerhinweis: Farbe als Kante, Text traegt die Aussage. */
export function Hinweis({
  ton = "info",
  titel,
  children,
  aktion,
  className,
}: {
  ton?: "info" | "warnung" | "kritisch" | "erfolg";
  titel?: string;
  children: React.ReactNode;
  aktion?: { href: string; label: string };
  className?: string;
}) {
  const kante = {
    info: "border-l-info",
    warnung: "border-l-warning",
    kritisch: "border-l-destructive",
    erfolg: "border-l-success",
  }[ton];
  return (
    <div role={ton === "kritisch" ? "alert" : "status"} className={cn("flex flex-wrap items-start justify-between gap-3 rounded-md border border-l-[3px] bg-card px-4 py-3 text-sm", kante, className)}>
      <div className="min-w-0">
        {titel && <div className="font-medium text-foreground">{titel}</div>}
        <div className={cn("t-hilfe", titel && "mt-0.5")}>{children}</div>
      </div>
      {aktion && (
        <Link href={aktion.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
          {aktion.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Tabellencontainer: Kopfleiste (Zaehler, Aktionen) und der Scrollbereich darunter. */
export function TabellenContainer({
  titel,
  zaehler,
  aktionen,
  children,
  className,
}: {
  titel?: string;
  zaehler?: string;
  aktionen?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flaeche-blatt", className)}>
      {(titel || zaehler || aktionen) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-surface-sunken/60 px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            {titel && <h2 className="t-abschnitt">{titel}</h2>}
            {zaehler && <span className="t-hilfe text-xs">{zaehler}</span>}
          </div>
          {aktionen && <div className="flex flex-wrap items-center gap-2">{aktionen}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Seitenpanel: Kontext rechts, kompakter als eine Karte. */
export function Seitenpanel({ titel, children, className }: { titel: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flaeche-ablage", className)}>
      <h2 className="eyebrow border-b px-4 py-2.5">{titel}</h2>
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

/** Kleiner Zaehler fuer Navigation und Reiter. Null wird nicht gezeigt. */
export function Zaehler({ n, ton = "neutral", className }: { n: number; ton?: "neutral" | "warnung" | "kritisch"; className?: string }) {
  if (!n || n <= 0) return null;
  const farbe = {
    neutral: "bg-primary/10 text-primary",
    warnung: "bg-warning/15 text-[hsl(var(--warning))]",
    kritisch: "bg-destructive/12 text-destructive",
  }[ton];
  return (
    <span className={cn("ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular", farbe, className)} aria-label={`${n} offen`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Faktenleiste: die Angaben, die man in Sekunden braucht - ein Feld je Fakt. */
export function Faktenleiste({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl className={cn("flaeche-ablage grid grid-cols-2 gap-px overflow-hidden bg-border/60 sm:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface-sunken", className)}>
      {children}
    </dl>
  );
}

export function Fakt({ label, wert, leer, href }: { label: string; wert: string; leer?: boolean; href?: string }) {
  const inhalt = (
    <>
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm", leer ? "text-muted-foreground" : "font-medium text-foreground")} title={wert}>
        {wert}
      </dd>
    </>
  );
  return href ? (
    <div className="min-w-0">
      <Link href={href} className="block px-3.5 py-2.5 transition-colors hover:bg-accent/60">{inhalt}</Link>
    </div>
  ) : (
    <div className="min-w-0 px-3.5 py-2.5">{inhalt}</div>
  );
}

/** Zahlenzeile unter einem Fortschrittsbild: Zahl gross, Beschriftung leise. */
export function Kennzahlzeile({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("flex flex-wrap gap-x-6 gap-y-2 text-sm", className)}>{children}</dl>;
}

export function Kennzahlwert({ label, wert, ton = "neutral" }: { label: string; wert: number | string; ton?: "neutral" | "aktion" | "warnung" | "kritisch" | "leer" }) {
  const farbe = {
    aktion: "text-primary",
    warnung: "text-[hsl(var(--warning))]",
    kritisch: "text-destructive",
    leer: "text-muted-foreground/60",
    neutral: "text-foreground",
  }[ton];
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className={cn("t-kpi text-lg", farbe)}>{wert}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
