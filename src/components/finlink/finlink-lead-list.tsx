"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { importFromFinLink, type FinLinkImportState } from "@/lib/actions/finlink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  if (leads.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Keine Leads im FinLink-Konto gefunden.</p>;
  }
  return (
    <ul className="divide-y">
      {leads.map((lead) => (
        <LeadRow key={lead.id} lead={lead} />
      ))}
    </ul>
  );
}
