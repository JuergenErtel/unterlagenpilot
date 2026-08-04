"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Download, ExternalLink, Search } from "lucide-react";
import { importFromFinLink, type FinLinkImportState } from "@/lib/actions/finlink";
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
  importedCase?: { id: string; caseNumber: string };
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const datum = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

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
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{lead.name}</span>
          {lead.finanzierungsart && (
            <Badge variant="outline">{FINANZIERUNG_LABEL[lead.finanzierungsart] ?? lead.finanzierungsart}</Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {[
            lead.ort,
            lead.objektOrt && lead.objektOrt !== lead.ort ? `Objekt: ${lead.objektOrt}` : null,
            lead.kaufpreis != null ? eur.format(lead.kaufpreis) : null,
            lead.createdAt ? datum.format(new Date(lead.createdAt)) : null,
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
      {lead.importedCase ? (
        <div className="flex items-center gap-2">
          <Badge variant="success">Bereits importiert</Badge>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/cases/${lead.importedCase.id}`}>
              {lead.importedCase.caseNumber}
              <ExternalLink />
            </Link>
          </Button>
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="finlinkId" value={lead.id} />
          <Button type="submit" size="sm" disabled={pending}>
            <Download />
            {pending ? "Importiert …" : "Importieren"}
          </Button>
        </form>
      )}
    </li>
  );
}

export function FinLinkLeadList({ leads }: { leads: LeadRowData[] }) {
  const [query, setQuery] = useState("");
  if (leads.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Keine Leads im FinLink-Konto gefunden.</p>;
  }
  const filtered = filterLeads(leads, query);
  return (
    <div>
      <div className="border-b px-4 py-3">
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
        {query && (
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length} von {leads.length} Leads
          </p>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Keine Treffer für „{query}“.</p>
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
