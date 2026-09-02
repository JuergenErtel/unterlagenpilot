"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  ScanSearch,
  ListTodo,
  ListChecks,
  FileStack,
  Plug,
  Building2,
  ShieldCheck,
  BadgeEuro,
  ChevronRight,
  KanbanSquare,
  Landmark,
  Settings,
  UserCheck,
  Inbox,
  ListOrdered,
  FileWarning,
  FileSearch,
  MessageSquareText,
  ClipboardCheck,
  PackageCheck,
  Handshake,
  Users,
  Receipt,
  SlidersHorizontal,
  Home,
  FilePlus2,
  FolderCheck,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BEREICH_LABELS,
  BEREICH_START,
  bereichAusPfad,
  verfuegbareBereiche,
  type Bereich,
  type Bereiche,
} from "@/lib/backoffice/bereich";

export const NAV_GROUPS: Array<{
  label: string;
  /** Zugeklappt starten; die Überschrift wird zum Auf-/Zuklapp-Knopf. */
  einklappbar?: boolean;
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Arbeit",
    items: [
      // Ganz oben: Die Tagesliste ist der Einstieg in die Arbeit, das Board
      // die Übersicht darüber. Der Name ist überall derselbe – Seite,
      // Dashboard-Hinweis und Menü sagen alle "Tagesliste".
      { href: "/heute", label: "Tagesliste", icon: ListTodo },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/cases", label: "Fälle", icon: FolderOpen },
      { href: "/review", label: "Review-Center", icon: ScanSearch },
      // Die Pipeline hat seit dem 12.08.2026 keinen eigenen Menüpunkt mehr:
      // Sie IST das Dashboard (Standardsicht "Board").
      //
      // "Nachrichten" ist am 16.08.2026 gefolgt: Die Seite war ein Archiv der
      // letzten 50 erzeugten Nachrichten, das nichts ausser dem Menue
      // verlinkte. Erzeugt und versendet wird in der Fallakte
      // (/cases/<id>/messages), und genau dorthin fuehren auch die
      // Prioritaetsleiter und das Review-Center.
      { href: "/banken", label: "Banken-Wiki", icon: Landmark },
    ],
  },
  {
    label: "Konfiguration",
    // Einrichtungsseiten braucht man alle paar Tage, nicht jeden Morgen –
    // zugeklappt lassen sie den Arbeitsteil der Leiste atmen (Jürgen, 21.08.2026).
    einklappbar: true,
    items: [
      { href: "/checklists", label: "Checklisten", icon: ListChecks },
      { href: "/document-types", label: "Dokumenttypen", icon: FileStack },
      { href: "/connections", label: "Plattform-Verbindungen", icon: Plug },
      { href: "/organization", label: "Organisation & Team", icon: Building2 },
      { href: "/audit", label: "Audit-Log", icon: ShieldCheck },
      { href: "/plans", label: "Tarife", icon: BadgeEuro },
      { href: "/settings", label: "Einstellungen", icon: Settings },
    ],
  },
];

/** Nur fuer den Plattformbetreiber (User.platformAdmin). Die Sichtbarkeit hier
 *  ist reine Auffindbarkeit – den Zugang selbst regelt requirePlatformAdmin auf
 *  der Seite und in jeder Server Action (404 statt 403). */
export const PLATTFORM_GRUPPE: (typeof NAV_GROUPS)[number] = {
  label: "Plattform",
  items: [
    { href: "/admin/anmeldungen", label: "Anmeldungen", icon: UserCheck },
    { href: "/admin/backoffice", label: "Backoffice-Steuerung", icon: SlidersHorizontal },
  ],
};

/**
 * BaufiDesk Backoffice: die Navigation des Sachbearbeiter-Arbeitsplatzes.
 * Eigenes Produkt, eigene Reihenfolge: oben die Arbeit (Dashboard, Queue,
 * die Wartelisten), unten die Verwaltung (Auftraggeber, Team, Abrechnung,
 * Konfiguration). Sichtbar nur mit Backoffice-Rolle UND Feature Flag - die
 * Regel steht in ladeBereiche (src/lib/backoffice/zugriff.ts).
 */
export const BACKOFFICE_GRUPPEN: typeof NAV_GROUPS = [
  {
    label: "Aufträge",
    items: [
      { href: "/backoffice", label: "Auftragsdashboard", icon: Gauge },
      { href: "/backoffice/queue", label: "Bearbeitungsqueue", icon: ListOrdered },
      { href: "/backoffice/auftraege", label: "Aufträge", icon: Inbox },
      { href: "/backoffice/fehlende-unterlagen", label: "Fehlende Unterlagen", icon: FileWarning },
      { href: "/backoffice/dokumentenpruefung", label: "Dokumentenprüfung", icon: FileSearch },
      { href: "/backoffice/rueckfragen", label: "Rückfragen", icon: MessageSquareText },
      { href: "/backoffice/qualitaetskontrolle", label: "Qualitätskontrolle", icon: ClipboardCheck },
      { href: "/backoffice/uebergabe", label: "Fertig zur Übergabe", icon: PackageCheck },
    ],
  },
  {
    label: "Verwaltung",
    einklappbar: true,
    items: [
      { href: "/backoffice/auftraggeber", label: "Auftraggeber", icon: Handshake },
      { href: "/backoffice/team", label: "Team", icon: Users },
      { href: "/backoffice/abrechnung", label: "Abrechnung & Kontingente", icon: Receipt },
      { href: "/backoffice/konfiguration", label: "Backoffice-Konfiguration", icon: SlidersHorizontal },
      { href: "/audit", label: "Audit-Log", icon: ShieldCheck },
    ],
  },
];

/** Das reduzierte Portal eines Auftraggebers. Keine interne Queue, keine fremden Auftraggeber. */
export const PORTAL_GRUPPEN: typeof NAV_GROUPS = [
  {
    label: "Meine Aufträge",
    items: [
      { href: "/portal", label: "Übersicht", icon: Home },
      { href: "/portal/auftraege", label: "Meine Aufträge", icon: Inbox },
      { href: "/portal/auftraege/neu", label: "Neuer Auftrag", icon: FilePlus2 },
      { href: "/portal/fehlende-unterlagen", label: "Fehlende Unterlagen", icon: FileWarning },
      { href: "/portal/rueckfragen", label: "Rückfragen", icon: MessageSquareText },
      { href: "/portal/ergebnisse", label: "Ergebnisse", icon: FolderCheck },
    ],
  },
  {
    label: "Organisation",
    einklappbar: true,
    items: [
      { href: "/portal/kontingent", label: "Kontingent & Tarif", icon: Receipt },
      { href: "/portal/organisation", label: "Organisation & Mitarbeiter", icon: Building2 },
    ],
  },
];

/** Welche Gruppen ein Nutzer im Vertrieb sieht. Reine Funktion, damit ohne DOM pruefbar. */
export function navGruppen(platformAdmin: boolean): typeof NAV_GROUPS {
  return platformAdmin ? [...NAV_GROUPS, PLATTFORM_GRUPPE] : NAV_GROUPS;
}

/**
 * Gruppen je Bereich. Der Plattform-Eintrag haengt am Vertrieb - dort ist der
 * Betreiber zu Hause. Backoffice und Portal bleiben frei davon.
 */
export function navGruppenFuer(bereich: Bereich, platformAdmin: boolean): typeof NAV_GROUPS {
  if (bereich === "backoffice") return BACKOFFICE_GRUPPEN;
  if (bereich === "portal") return PORTAL_GRUPPEN;
  return navGruppen(platformAdmin);
}

/** Dieselbe Aktiv-Regel wie beim Markieren des Eintrags – auch fürs Aufklappen. */
function istAktiv(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

const NUR_VERTRIEB: Bereiche = { vertrieb: true, backoffice: false, portal: false };

export function SidebarNav({
  onNavigate,
  platformAdmin = false,
  bereiche = NUR_VERTRIEB,
}: { onNavigate?: () => void; platformAdmin?: boolean; bereiche?: Bereiche } = {}) {
  const pathname = usePathname();
  // Der Bereich kommt aus dem Pfad, nicht aus einem gespeicherten Zustand:
  // Wer einen Backoffice-Link oeffnet, steht im Backoffice - auch wenn er
  // zuletzt im Vertrieb war. Ein Bereich, den der Nutzer nicht hat, faellt
  // auf den Vertrieb zurueck (die Seite selbst antwortet dann mit 404).
  const rohBereich = bereichAusPfad(pathname);
  const bereich: Bereich = bereiche[rohBereich] ? rohBereich : "vertrieb";
  const gruppen = navGruppenFuer(bereich, platformAdmin);
  const umschalter = verfuegbareBereiche(bereiche);

  // Einklappbare Gruppen starten zu – AUSSER man steht gerade auf einer ihrer
  // Seiten: Dann wäre der aktive Eintrag unsichtbar und die Leiste behauptete,
  // man sei nirgends.
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>(() => {
    const offen: Record<string, boolean> = {};
    for (const g of gruppen) {
      if (g.einklappbar) offen[g.label] = g.items.some((it) => istAktiv(pathname, it.href));
    }
    return offen;
  });

  // Navigiert man von außen in eine zugeklappte Gruppe (Link im Seiteninhalt),
  // klappt sie auf – zugeklappt wieder nur von Hand.
  useEffect(() => {
    setAufgeklappt((bisher) => {
      let geaendert = false;
      const naechste = { ...bisher };
      for (const g of gruppen) {
        if (g.einklappbar && !bisher[g.label] && g.items.some((it) => istAktiv(pathname, it.href))) {
          naechste[g.label] = true;
          geaendert = true;
        }
      }
      return geaendert ? naechste : bisher;
    });
    // gruppen ist aus platformAdmin abgeleitet und je Render neu – als
    // Abhängigkeit würde der Effekt jeden Render laufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, platformAdmin, bereich]);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {umschalter.length > 1 && (
        <div>
          <div className="eyebrow px-3 pb-2 text-[0.625rem]">Bereich</div>
          {/*
            Der Umschalter ist eine Registerleiste, kein Dropdown: Alle
            Bereiche stehen nebeneinander, der aktive ist eingefaerbt. Wer hier
            steht, soll auf einen Blick sehen, in welchem Produkt er arbeitet.
          */}
          <div
            role="tablist"
            aria-label="Arbeitsbereich"
            className="grid gap-px rounded-md border bg-border p-px"
            style={{ gridTemplateColumns: `repeat(${umschalter.length}, minmax(0, 1fr))` }}
          >
            {umschalter.map((b) => {
              const aktiv = b === bereich;
              return (
                <Link
                  key={b}
                  role="tab"
                  aria-selected={aktiv}
                  href={BEREICH_START[b]}
                  onClick={onNavigate}
                  className={cn(
                    "truncate rounded-[5px] px-2 py-1.5 text-center text-xs font-medium transition-colors",
                    aktiv ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  {BEREICH_LABELS[b]}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {gruppen.map((g) => (
        <div key={g.label}>
          {g.einklappbar ? (
            <button
              type="button"
              onClick={() => setAufgeklappt((o) => ({ ...o, [g.label]: !o[g.label] }))}
              aria-expanded={aufgeklappt[g.label] ?? false}
              className="eyebrow flex w-full items-center gap-1 px-3 pb-2 text-[0.625rem] transition-colors hover:text-foreground"
            >
              {g.label}
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform",
                  (aufgeklappt[g.label] ?? false) && "rotate-90"
                )}
                aria-hidden
              />
            </button>
          ) : (
            <div className="eyebrow px-3 pb-2 text-[0.625rem]">{g.label}</div>
          )}
          <div className={cn("space-y-px", g.einklappbar && !(aufgeklappt[g.label] ?? false) && "hidden")}>
            {g.items.map((it) => {
              const active = istAktiv(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // Der aktive Eintrag ist der herausgezogene Registerreiter:
                    // eine Marke am linken Rand, kein eingefaerbter Kasten. Die
                    // Marke traegt das Markentuerkis – dieselbe Farbe, die in
                    // der App ueberall "hier passiert gerade etwas" bedeutet.
                    "relative flex items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm transition-colors",
                    "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:transition-colors",
                    active
                      ? "bg-accent font-semibold text-foreground before:bg-ai"
                      : "font-medium text-muted-foreground before:bg-transparent hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <it.icon className={cn("h-4 w-4 shrink-0", active ? "text-ai" : "text-muted-foreground")} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
