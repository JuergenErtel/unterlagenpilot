"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  FolderArchive,
  UserRound,
  Banknote,
  LayoutPanelLeft,
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

export type CaseNavVariante = "vertrieb" | "backoffice" | "fremd";

/**
 * Die drei Bereiche eines Falls als feste Leiste ueber JEDER Unterseite.
 *
 * Bis zum 17.09.2026 standen hier ACHT Eintraege (Fallakte, Unterlagen,
 * Erstgespraech, Nachrichten, Haushalt, Machbarkeit, Verwaltung, Einreichung)
 * - und in der Fallakte darunter noch einmal dieselben Ziele als Werkzeuge.
 * Dieselbe Sache auf zwei Wegen, in zwei verschiedenen Ordnungen.
 *
 * Jetzt gilt EINE Einteilung, oben wie unten: Dokumente, Beratung,
 * Einreichung. Die Leiste ist damit zugleich die Umschaltung der Fallakte -
 * eine zweite Reiterreihe auf der Seite waere dieselbe Leiste zweimal.
 *
 * Der Bereich steht in der Adresse (`?tab=`) und nicht in einem Zustand im
 * Browser: So laesst sich ein Bereich verlinken, und der Zurueck-Knopf tut,
 * was er soll.
 */
export type FallBereichKey = "dokumente" | "beratung" | "einreichung";

/**
 * Zu welchem Bereich eine Unterseite gehoert.
 *
 * Ohne diese Zuordnung stuende der Berater auf /haushalt vor einer Leiste, die
 * nichts markiert - er waere "irgendwo im Fall", ohne zu wissen, wo. Wer eine
 * neue Unterseite baut, traegt sie hier ein.
 */
export const UNTERSEITE_BEREICH: Record<string, FallBereichKey> = {
  unterlagen: "dokumente",
  messages: "dokumente",
  erstgespraech: "beratung",
  edit: "beratung",
  haushalt: "beratung",
  machbarkeit: "beratung",
  wohnflaeche: "beratung",
  "einkommen-selbststaendig": "beratung",
  lageplan: "beratung",
  export: "einreichung",
  summary: "einreichung",
  verwaltung: "einreichung",
  einreichung: "einreichung",
};

export function fallBereiche(caseId: string): FallBereich[] {
  const base = `/cases/${caseId}`;
  return [
    { href: `${base}?tab=dokumente`, label: "Dokumente", icon: FolderArchive },
    { href: `${base}?tab=beratung`, label: "Beratung", icon: UserRound },
    { href: `${base}?tab=einreichung`, label: "Einreichung", icon: Banknote },
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
 * Fremdakte (Cross-Org-Uebergabe): eine Akte einer anderen Organisation, an
 * der ein Auftrag der eigenen Backoffice-Organisation haengt. Nur Auftrag und
 * Unterlagen - die Vertriebsseiten gehoeren dem Eigentuemer und antworten fuer
 * diesen Kontext mit 404 (requireCaseAccess ohne fremdakteErlaubt).
 */
export function fremdBereiche(caseId: string, auftragId: string): FallBereich[] {
  const base = `/cases/${caseId}`;
  return [
    { href: `/backoffice/auftraege/${auftragId}`, label: "Auftrag", icon: ClipboardCheck },
    { href: `${base}/unterlagen`, label: "Unterlagen", icon: LayoutPanelLeft },
  ];
}

/**
 * Welcher der drei Bereiche gerade gilt.
 *
 * Auf der Fallakte entscheidet `?tab=`, auf einer Unterseite ihre Zuordnung
 * (UNTERSEITE_BEREICH). Eine unbekannte Unterseite faellt auf "dokumente" -
 * lieber eine Markierung, die ungefaehr stimmt, als eine Leiste, die
 * behauptet, man stuende nirgends.
 */
export function aktiverFallBereich(
  pathname: string,
  caseId: string,
  tab?: string | null
): FallBereichKey {
  const base = `/cases/${caseId}`;
  if (pathname === base) {
    return tab === "beratung" || tab === "einreichung" ? tab : "dokumente";
  }
  const rest = pathname.startsWith(base + "/") ? pathname.slice(base.length + 1).split("/")[0]! : "";
  return UNTERSEITE_BEREICH[rest] ?? "dokumente";
}

/**
 * Aktiver Eintrag der Backoffice- und Fremdakten-Leisten, die weiterhin nach
 * Unterseiten gegliedert sind: Ein Backoffice-Auftrag hat keine Leadphase und
 * keine Beratung, die Vertriebseinteilung passt dort nicht.
 */
export function aktiverBereich(
  pathname: string,
  caseId: string,
  bereiche: FallBereich[]
): string | null {
  const base = `/cases/${caseId}`;
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
  /** Pflicht bei variante "backoffice" und "fremd": Ziel des Reiters "Auftrag". */
  auftragId?: string;
}) {
  const pathname = usePathname();
  const bereiche =
    variante === "fremd" && auftragId
      ? fremdBereiche(caseId, auftragId)
      : variante === "backoffice" && auftragId
        ? backofficeBereiche(caseId, auftragId)
        : fallBereiche(caseId);
  const tab = useSearchParams().get("tab");
  const istVertrieb = variante === "vertrieb";

  // Auf der Fallakte selbst blendet sich die Leiste aus.
  //
  // Dort steht die Umschaltung direkt unter dem Kreislauf, wo ihre Wirkung
  // sichtbar wird. Stuenden hier oben dieselben drei Namen, gaebe es zwei
  // Bedienelemente fuer dieselbe Sache - und eines davon weit weg von dem,
  // was es aendert. Genau das war der Fehler vom 17.09.2026.
  //
  // Auf den Unterseiten bleibt sie: Dort ist sie keine Umschaltung, sondern
  // der Weg zurueck in den richtigen Bereich - und sagt zugleich, in welchem
  // man gerade steht.
  if (istVertrieb && pathname === `/cases/${caseId}`) return null;
  const aktiverSchluessel = istVertrieb ? aktiverFallBereich(pathname, caseId, tab) : null;
  const aktiv = istVertrieb ? null : aktiverBereich(pathname, caseId, bereiche);
  return (
    <nav
      aria-label="Bereiche des Falls"
      className="-mx-4 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
    >
      <ul className="flex min-w-max gap-1">
        {bereiche.map((b) => {
          // Im Vertrieb entscheidet der Bereichsschluessel, sonst der Pfad.
          const istAktiv = istVertrieb
            ? b.href.endsWith(`tab=${aktiverSchluessel}`)
            : aktiv === b.href;
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
