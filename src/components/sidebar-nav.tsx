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
  LEERE_ZAEHLER,
  bereichAusPfad,
  verfuegbareBereiche,
  type BackofficeZaehler,
  type Bereich,
  type Bereiche,
} from "@/lib/backoffice/bereich";
import { Zaehler } from "@/components/ui/flaechen";

export interface NavEintrag {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Welcher Zaehler an diesem Eintrag haengt (nur Backoffice). */
  zaehler?: keyof BackofficeZaehler;
  /** Ton des Zaehlers: Handlungsbedarf (neutral) oder Wartezustand (warnung). */
  zaehlerTon?: "neutral" | "warnung";
}

export interface NavGruppe {
  label: string;
  /** Zugeklappt starten; die Überschrift wird zum Auf-/Zuklapp-Knopf. */
  einklappbar?: boolean;
  items: NavEintrag[];
}

export const NAV_GROUPS: NavGruppe[] = [
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
export const PLATTFORM_GRUPPE: NavGruppe = {
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
export const BACKOFFICE_GRUPPEN: NavGruppe[] = [
  {
    label: "Übersicht",
    items: [
      { href: "/backoffice", label: "Dashboard", icon: Gauge },
      { href: "/backoffice/auftraege", label: "Alle Aufträge", icon: Inbox },
    ],
  },
  {
    // Der taegliche Arbeitsplatz: was das Backoffice selbst in der Hand hat,
    // in der Reihenfolge des Wegs - bearbeiten, pruefen, uebergeben.
    label: "Mein Arbeitstag",
    items: [
      { href: "/backoffice/queue", label: "Jetzt bearbeiten", icon: ListOrdered, zaehler: "jetztBearbeiten" },
      { href: "/backoffice/qualitaetskontrolle", label: "Qualitätskontrolle", icon: ClipboardCheck, zaehler: "qualitaetskontrolle" },
      { href: "/backoffice/uebergabe", label: "Fertig zur Übergabe", icon: PackageCheck, zaehler: "uebergabe" },
    ],
  },
  {
    // Alles, was auf jemand anderen wartet oder eine Entscheidung braucht.
    label: "Klärungsbedarf",
    items: [
      { href: "/backoffice/fehlende-unterlagen", label: "Fehlende Unterlagen", icon: FileWarning, zaehler: "fehlendeUnterlagen", zaehlerTon: "warnung" },
      { href: "/backoffice/dokumentenpruefung", label: "Dokumente zu prüfen", icon: FileSearch, zaehler: "dokumentePruefen" },
      { href: "/backoffice/rueckfragen", label: "Rückfragen", icon: MessageSquareText, zaehler: "rueckfragen", zaehlerTon: "warnung" },
    ],
  },
  {
    label: "Verwaltung",
    einklappbar: true,
    items: [
      { href: "/backoffice/auftraggeber", label: "Auftraggeber", icon: Handshake },
      { href: "/backoffice/team", label: "Team", icon: Users },
      { href: "/backoffice/abrechnung", label: "Abrechnung & Kontingente", icon: Receipt },
      { href: "/backoffice/konfiguration", label: "Konfiguration", icon: SlidersHorizontal },
      { href: "/audit", label: "Audit-Log", icon: ShieldCheck },
    ],
  },
];

/** Das reduzierte Portal eines Auftraggebers. Keine interne Queue, keine fremden Auftraggeber. */
export const PORTAL_GRUPPEN: NavGruppe[] = [
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
      { href: "/portal/kontingent", label: "Kontingent", icon: Receipt },
      { href: "/portal/organisation", label: "Organisation & Team", icon: Building2 },
    ],
  },
];

/** Welche Gruppen ein Nutzer im Vertrieb sieht. Reine Funktion, damit ohne DOM pruefbar. */
export function navGruppen(platformAdmin: boolean): NavGruppe[] {
  return platformAdmin ? [...NAV_GROUPS, PLATTFORM_GRUPPE] : NAV_GROUPS;
}

/**
 * Gruppen je Bereich. Der Plattform-Eintrag haengt am Vertrieb - dort ist der
 * Betreiber zu Hause. Backoffice und Portal bleiben frei davon.
 */
export function navGruppenFuer(bereich: Bereich, platformAdmin: boolean): NavGruppe[] {
  if (bereich === "backoffice") return BACKOFFICE_GRUPPEN;
  if (bereich === "portal") return PORTAL_GRUPPEN;
  return navGruppen(platformAdmin);
}

/** Dieselbe Aktiv-Regel wie beim Markieren des Eintrags – auch fürs Aufklappen. */
/** Startseiten der Bereiche leuchten nur bei exaktem Pfad - sonst waere
 *  "Dashboard" auf jeder Unterseite des Bereichs markiert. */
const NUR_EXAKT = new Set(["/dashboard", "/backoffice", "/portal"]);

function istAktiv(pathname: string, href: string): boolean {
  return pathname === href || (!NUR_EXAKT.has(href) && pathname.startsWith(href + "/"));
}

const NUR_VERTRIEB: Bereiche = { vertrieb: true, backoffice: false, portal: false };

const BEREICH_ICON: Record<Bereich, LucideIcon> = {
  vertrieb: KanbanSquare,
  backoffice: ClipboardCheck,
  portal: Handshake,
};

/**
 * Reine Regel fuer den Umschalter: Er erscheint nur, wenn es etwas
 * umzuschalten gibt. Ein Nutzer mit einem Bereich sieht keinen.
 */
export function zeigeUmschalter(bereiche: Bereiche): boolean {
  return verfuegbareBereiche(bereiche).length > 1;
}

export function SidebarNav({
  onNavigate,
  platformAdmin = false,
  bereiche = NUR_VERTRIEB,
  zaehler = LEERE_ZAEHLER,
}: { onNavigate?: () => void; platformAdmin?: boolean; bereiche?: Bereiche; zaehler?: BackofficeZaehler } = {}) {
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
          <div className="eyebrow px-3 pb-2 text-[0.625rem]">Produktbereich</div>
          {/*
            Der Umschalter ist ein Produktwechsel, kein Filter: gestapelte
            Reiter mit Symbol, der aktive traegt die Tinte und den Namen als
            Ueberschrift. Wer hier steht, soll auf einen Blick sehen, in
            welchem Produkt er arbeitet - und beim Wechsel spueren, dass
            sich die ganze Leiste darunter austauscht.
          */}
          <nav aria-label="Produktbereich" className="space-y-px rounded-md border bg-card p-1">
            {umschalter.map((b) => {
              const aktiv = b === bereich;
              const Icon = BEREICH_ICON[b];
              return (
                <Link
                  key={b}
                  aria-current={aktiv ? "true" : undefined}
                  href={BEREICH_START[b]}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    aktiv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", aktiv ? "text-primary-foreground/80" : "text-muted-foreground")} aria-hidden />
                  <span className="truncate">{BEREICH_LABELS[b]}</span>
                  {aktiv && <span className="ml-auto text-[0.625rem] font-semibold uppercase tracking-wider text-primary-foreground/70">aktiv</span>}
                </Link>
              );
            })}
          </nav>
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
                  <it.icon className={cn("h-4 w-4 shrink-0", active ? "text-ai" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.zaehler && <Zaehler n={zaehler[it.zaehler]} ton={it.zaehlerTon ?? "neutral"} />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
