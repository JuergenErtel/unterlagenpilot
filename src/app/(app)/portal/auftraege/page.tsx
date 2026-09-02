import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { istAktiv } from "@/lib/backoffice/status";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AuftragsTabelle } from "@/components/portal/auftrags-tabelle";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Filter = "aktiv" | "abgeschlossen" | "alle";

export default async function PortalAuftraege({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePortal();
  const sp = await searchParams;
  const roh = typeof sp.status === "string" ? sp.status : "aktiv";
  const filter: Filter = roh === "abgeschlossen" || roh === "alle" ? roh : "aktiv";

  const alle = await ladeAuftragZeilen(portalAuftraegeFilter(ctx));
  const zeilen =
    filter === "aktiv" ? alle.filter((z) => istAktiv(z.status)) : filter === "abgeschlossen" ? alle.filter((z) => !istAktiv(z.status)) : alle;

  const reiter: Array<{ key: Filter; label: string; n: number }> = [
    { key: "aktiv", label: "Laufend", n: alle.filter((z) => istAktiv(z.status)).length },
    { key: "abgeschlossen", label: "Abgeschlossen", n: alle.filter((z) => !istAktiv(z.status)).length },
    { key: "alle", label: "Alle", n: alle.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Meine Aufträge"
        title="Aufträge"
        subtitle={`${zeilen.length} ${zeilen.length === 1 ? "Auftrag" : "Aufträge"} in dieser Ansicht.`}
        actions={
          <Button asChild size="sm">
            <Link href="/portal/auftraege/neu">
              <Plus />
              Neuer Auftrag
            </Link>
          </Button>
        }
      />

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Filter">
        {reiter.map((r) => (
          <Link
            key={r.key}
            href={r.key === "aktiv" ? "/portal/auftraege" : `/portal/auftraege?status=${r.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              filter === r.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            aria-current={filter === r.key ? "page" : undefined}
          >
            {r.label} <span className="tabular text-xs text-muted-foreground">({r.n})</span>
          </Link>
        ))}
      </nav>

      <AuftragsTabelle
        zeilen={zeilen}
        leerText={filter === "aktiv" ? "Derzeit läuft kein Auftrag. Über „Neuer Auftrag“ erteilen Sie den nächsten." : "Noch keine abgeschlossenen Aufträge."}
      />
    </div>
  );
}
