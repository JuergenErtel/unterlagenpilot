"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Download, ExternalLink, Search } from "lucide-react";
import { importFromFinLink, type FinLinkImportState } from "@/lib/actions/finlink";
import { useFallOeffnen } from "./fall-oeffnen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface LeadRowData {
  id: string;
  name: string;
  ort?: string;
  objektOrt?: string;
  finanzierungsart?: string;
  kaufpreis?: number;
  createdAt?: string;
  /** Vertriebsstatus aus FinLink: active | lost | won | on_hold */
  salesState?: string;
  importedCase?: { id: string; caseNumber: string };
}

const SALES_STATE_LABEL: Record<string, string> = {
  active: "Aktiv",
  lost: "Verloren",
  won: "Gewonnen",
  on_hold: "Pausiert",
};

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// timeZone gepinnt: der Server (Vercel, UTC) und der Browser (Europe/Berlin) müssen
// identischen Text rendern, sonst gibt es einen Hydration-Mismatch bei Leads,
// die zwischen 0 und 2 Uhr nachts angelegt wurden.
const datum = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

export function formatLeadDate(iso: string): string {
  return datum.format(new Date(iso));
}

const FINANZIERUNG_LABEL: Record<string, string> = {
  kauf: "Kauf",
  neubau: "Neubau",
  kapitalbeschaffung: "Kapitalbeschaffung",
  modernisierung: "Modernisierung",
  anschlussfinanzierung: "Anschlussfinanzierung",
  umschuldung: "Umschuldung",
};

/**
 * Clientseitiger Filter über Name, Ort, Objektort, Finanzierungsart und
 * Fallnummer. Mehrere Suchwörter (durch Leerzeichen) müssen alle treffen.
 */
export function filterLeads(leads: LeadRowData[], query: string): LeadRowData[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return leads;
  return leads.filter((lead) => {
    const haystack = [
      lead.name,
      lead.ort,
      lead.objektOrt,
      lead.finanzierungsart ? (FINANZIERUNG_LABEL[lead.finanzierungsart] ?? lead.finanzierungsart) : undefined,
      lead.importedCase?.caseNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

function LeadRow({ lead }: { lead: LeadRowData }) {
  const [state, action, pending] = useActionState<FinLinkImportState, FormData>(importFromFinLink, {});
  // Der Import meldet den Fall zurück; das Öffnen ist Sache des Clients.
  useFallOeffnen(state.fall?.id);
  // Frisch importiert zählt wie „schon importiert": beide führen zum selben
  // Fall. So steht der Weg dorthin sichtbar da, auch wenn keine Navigation
  // greift – genau daran scheiterte es am 28.08.2026.
  const fall = state.fall
    ? { id: state.fall.id, caseNumber: state.fall.caseNumber ?? "Fall öffnen" }
    : lead.importedCase;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{lead.name}</span>
          {lead.finanzierungsart && (
            <Badge variant="outline">{FINANZIERUNG_LABEL[lead.finanzierungsart] ?? lead.finanzierungsart}</Badge>
          )}
          {lead.salesState && lead.salesState !== "active" && (
            <Badge variant="neutral">{SALES_STATE_LABEL[lead.salesState] ?? lead.salesState}</Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {[
            lead.ort,
            lead.objektOrt && lead.objektOrt !== lead.ort ? `Objekt: ${lead.objektOrt}` : null,
            lead.kaufpreis != null ? eur.format(lead.kaufpreis) : null,
            lead.createdAt ? formatLeadDate(lead.createdAt) : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Keine weiteren Angaben"}
        </div>
        {state.error && (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
      </div>
      {fall ? (
        <div className="flex items-center gap-2">
          <Badge variant="success">{state.fall ? "Importiert" : "Bereits importiert"}</Badge>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/cases/${fall.id}`}>
              {fall.caseNumber}
              <ExternalLink />
            </Link>
          </Button>
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="finlinkId" value={lead.id} />
          <Button type="submit" size="sm" disabled={pending}>
            <Download />
            {pending ? "Wird importiert …" : "Importieren"}
          </Button>
        </form>
      )}
    </li>
  );
}

/** Nur Leads mit aktivem Antrag – Karteileichen (verloren/gewonnen/pausiert/ohne Antrag) bleiben draußen. */
export function activeLeads(leads: LeadRowData[]): LeadRowData[] {
  return leads.filter((l) => l.salesState === "active");
}

export function FinLinkLeadList({ leads }: { leads: LeadRowData[] }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (leads.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Keine Leads im FinLink-Konto gefunden.</p>;
  }
  const base = showAll ? leads : activeLeads(leads);
  const filtered = filterLeads(base, query);
  return (
    <div>
      <div className="space-y-2 border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen nach Name, Ort oder Finanzierungsart …"
            aria-label="Leads durchsuchen"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Auch inaktive Leads zeigen (verloren, gewonnen, pausiert)
          </label>
          <p className="text-xs text-muted-foreground">
            {filtered.length} von {base.length} {showAll ? "Leads" : "aktiven Leads"}
          </p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {query ? <>Keine Treffer für „{query}“.</> : "Keine aktiven Leads gefunden."}
        </p>
      ) : (
        <ul className="divide-y">
          {filtered.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </div>
  );
}
