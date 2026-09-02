import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import type { BackofficeStatus } from "@/lib/domain/enums";
import { datumText } from "@/lib/backoffice/anzeige";
import { FristMarke, StatusMarke } from "@/components/backoffice/status-anzeigen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Kompakte Aussensicht auf den Backoffice-Auftrag einer Vertriebsakte - in
 * der Seitenspalte der Fallakte. Rein lesend: Der Vermittler erfaehrt, wer
 * an seinem Fall arbeitet, wo der Auftrag steht und ob er selbst etwas
 * liefern muss. Statuswechsel gibt es nur im Auftrag selbst.
 *
 * Zeigt bewusst die Portal-Bezeichnungen (StatusMarke portal): Der Vertrieb
 * ist hier Auftraggeber, nicht Bearbeiter. Interne Notizen, Bearbeiter und
 * QC-Begruendung bleiben aussen vor.
 *
 * Rendert nichts, wenn es keinen Auftrag gibt - eine Akte ohne Backoffice
 * darf sich durch diese Karte nicht veraendern.
 */
export async function BackofficeStatusKarte({
  caseId,
  organizationId,
  istBackofficeNutzer,
}: {
  caseId: string;
  organizationId: string;
  /** Nur mit Backoffice-Rolle gibt es den Link in den Auftrag. */
  istBackofficeNutzer: boolean;
}) {
  const auftrag = await prisma.backofficeAuftrag.findFirst({
    where: { caseId, backofficeOrganizationId: organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      auftragsnummer: true,
      status: true,
      pausiertSeit: true,
      faelligAm: true,
      eingangAm: true,
      uebergebenAm: true,
      qualitaetFreigegebenAm: true,
      wartegrund: true,
      backofficeOrganization: { select: { name: true } },
      _count: { select: { rueckfragen: { where: { status: "offen" } } } },
    },
  });
  if (!auftrag) return null;

  const status = auftrag.status as BackofficeStatus;
  const pausiert = auftrag.pausiertSeit != null;
  const offeneRueckfragen = auftrag._count.rueckfragen;
  const wartetAufUnterlagen = status === "wartet_auf_unterlagen";

  const mitwirkung =
    offeneRueckfragen > 0
      ? `${offeneRueckfragen} offene ${offeneRueckfragen === 1 ? "Rückfrage" : "Rückfragen"}`
      : wartetAufUnterlagen
        ? "Unterlagen fehlen"
        : "keine";
  const mitwirkungOffen = offeneRueckfragen > 0 || wartetAufUnterlagen;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-ai" aria-hidden />
          Backoffice {auftrag.auftragsnummer}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <Zeile label="Beauftragt am" wert={datumText(auftrag.eingangAm)} />
        <Zeile label="Zuständiges Backoffice" wert={auftrag.backofficeOrganization.name} />
        <Zeile label="Bearbeitungsstatus" wert={<StatusMarke status={status} pausiert={pausiert} portal />} />
        <Zeile
          label="Fehlende Mitwirkung"
          wert={<span className={mitwirkungOffen ? "text-[hsl(var(--warning))]" : undefined}>{mitwirkung}</span>}
        />
        {mitwirkungOffen && auftrag.wartegrund && (
          <p className="text-xs text-muted-foreground">{auftrag.wartegrund}</p>
        )}
        <Zeile
          label="Zugesagte Frist"
          wert={<FristMarke faelligAm={auftrag.faelligAm} status={status} pausiert={pausiert} jetzt={new Date()} />}
        />
        <Zeile
          label="Ergebnis verfügbar"
          wert={auftrag.uebergebenAm ? datumText(auftrag.uebergebenAm) : "noch nicht"}
        />
        {istBackofficeNutzer && (
          <div className="pt-2">
            <Link
              href={`/backoffice/auftraege/${auftrag.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Zum Auftrag
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{wert}</span>
    </div>
  );
}
