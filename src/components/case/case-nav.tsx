"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  LayoutPanelLeft,
  PhoneCall,
  Send,
  Calculator,
  Scale,
  ClipboardList,
  ClipboardCheck,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FallBereich {
  href: string;
  label: string;
  icon: LucideIcon;
}

export type CaseNavVariante = "vertrieb" | "backoffice";

/**
 * Die Arbeitsbereiche eines Falls als feste Leiste ueber JEDER Fall-Unterseite.
 *
 * Bis zum 01.09.2026 fuehrte von einer Unterseite nur "Zur Fallakte" zurueck,
 * und von der Fallakte aus lagen die Bereiche in zugeklappten Werkzeugkisten
 * oder drei Klicks tief in einem Reiter (der Unterlagen-Arbeitsplatz hinter
 * Dokumente -> Oeffnen). Wer nicht wusste, wo etwas liegt, musste suchen. Die
 * Leiste macht die Bereiche zu Registerreitern der Akte: immer sichtbar,
 * immer ein Klick.
 *
 * Werkzeuge, die man selten braucht (Wohnflaeche, Lageplan, Zusammenfassung,
 * Kundendaten), bleiben in der Fallakte - die Leiste soll tragen, nicht
 * alles auflisten.
 */
export function fallBereiche(caseId: string): FallBereich[] {
  const base = `/cases/${caseId}`;
  return [
    { href: base, label: "Fallakte", icon: FolderOpen },
    { href: `${base}/unterlagen`, label: "Unterlagen", icon: LayoutPanelLeft },
    { href: `${base}/erstgespraech`, label: "Erstgespräch", icon: PhoneCall },
    { href: `${base}/messages`, label: "Nachrichten", icon: Send },
    { href: `${base}/haushalt`, label: "Haushalt", icon: Calculator },
    { href: `${base}/machbarkeit`, label: "Machbarkeit", icon: Scale },
    { href: `${base}/verwaltung`, label: "Verwaltung", icon: ClipboardList },
    { href: `${base}/export`, label: "Einreichung", icon: FileText },
  ];
}

/**
 * Dieselbe Leiste fuer eine Backoffice-Akte. Der erste Reiter fuehrt zum
 * Auftrag (der die Rolle der Fallakte einnimmt); "Fallakte" und
 * "Erstgespraech" fehlen, weil beides Vertrieb ist - ein Backoffice-Auftrag
 * hat keine Leadphase und kein Telefonat vor dem Lead.
 */
export function backofficeBereiche(caseId: string, auftragId: string): FallBereich[] {
  const base = `/cases/${caseId}`;
  return [
    { href: `/backoffice/auftraege/${auftragId}`, label: "Auftrag", icon: ClipboardCheck },
    { href: `${base}/unterlagen`, label: "Unterlagen", icon: LayoutPanelLeft },
    { href: `${base}/messages`, label: "Nachrichten", icon: Send },
    { href: `${base}/haushalt`, label: "Haushalt", icon: Calculator },
    { href: `${base}/machbarkeit`, label: "Machbarkeit", icon: Scale },
    { href: `${base}/verwaltung`, label: "Verwaltung", icon: ClipboardList },
    { href: `${base}/export`, label: "Einreichung", icon: FileText },
  ];
}

/**
 * Welcher Bereich aktiv ist. Die Fallakte selbst nur bei exaktem Pfad -
 * sonst leuchtete sie auf jeder Unterseite mit. Unterseiten ohne eigenen
 * Reiter (z. B. /wohnflaeche) markieren nichts: Die Leiste behauptet dann
 * nicht, man stuende woanders.
 *
 * `bereiche` ist die Liste, in der gesucht wird - ohne Angabe die des
 * Vertriebsfalls.
 */
export function aktiverBereich(
  pathname: string,
  caseId: string,
  bereiche: FallBereich[] = fallBereiche(caseId)
): string | null {
  const base = `/cases/${caseId}`;
  if (pathname === base) return base;
  const treffer = bereiche.find(
    (b) => b.href !== base && (pathname === b.href || pathname.startsWith(b.href + "/"))
  );
  return treffer?.href ?? null;
}

export function CaseNav({
  caseId,
  variante = "vertrieb",
  auftragId,
}: {
  caseId: string;
  variante?: CaseNavVariante;
  /** Pflicht bei variante "backoffice": Ziel des Reiters "Auftrag". */
  auftragId?: string;
}) {
  const pathname = usePathname();
  const bereiche =
    variante === "backoffice" && auftragId ? backofficeBereiche(caseId, auftragId) : fallBereiche(caseId);
  const aktiv = aktiverBereich(pathname, caseId, bereiche);
  return (
    <nav
      aria-label="Bereiche des Falls"
      className="-mx-4 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
    >
      <ul className="flex min-w-max gap-1">
        {bereiche.map((b) => {
          const istAktiv = aktiv === b.href;
          return (
            <li key={b.href}>
              <Link
                href={b.href}
                aria-current={istAktiv ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
                  istAktiv
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <b.icon className="h-4 w-4" aria-hidden />
                {b.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
