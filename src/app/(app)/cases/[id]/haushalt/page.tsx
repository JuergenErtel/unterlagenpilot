import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { prisma } from "@/lib/db";
import { berechneHaushalt } from "@/lib/haushalt/rechnung";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function eur(n: number): string {
  return `${Math.round(n).toLocaleString("de-DE")} €`;
}

export default async function HaushaltPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);

  const [canonical, caseRow] = await Promise.all([
    caseToCanonical(id),
    prisma.case.findUniqueOrThrow({
      where: { id },
      select: { caseNumber: true, applicants: { select: { anzahlKinder: true }, orderBy: { position: "asc" } } },
    }),
  ]);

  const r = berechneHaushalt({
    income: canonical.income,
    liabilities: canonical.liabilities,
    property: canonical.property,
    financing: canonical.financing,
    applicantCount: caseRow.applicants.length,
    anzahlKinder: caseRow.applicants[0]?.anzahlKinder ?? 0,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fachliche Prüfung"
        title="Haushaltsrechnung"
        subtitle="Monatliche Kapitaldienstfähigkeit – Einnahmen gegen Lebenshaltung, Bestandsraten, Objektkosten und die geschätzte Darlehensrate."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link>
          </Button>
        }
      />

      <Card className={r.tragfaehig ? "border-success/40" : "border-destructive/40"}>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {r.tragfaehig ? (
              <CheckCircle2 className="h-8 w-8 text-success" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-destructive" />
            )}
            <div>
              <div className="text-sm text-muted-foreground">Monatlicher Überschuss</div>
              <div className={`text-2xl font-semibold ${r.tragfaehig ? "text-success" : "text-destructive"}`}>
                {eur(r.ueberschuss)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Kpi label="Einnahmen" value={eur(r.summeEinnahmen)} />
            <Kpi label="Geplante Rate" value={`${eur(r.geplanteRate)}${r.rateGeschaetzt ? " *" : ""}`} />
            <Kpi label="Wohnkostenquote" value={`${r.wohnkostenquote} %`} />
            <div className="self-center">
              {r.tragfaehig ? (
                <Badge variant="success">tragfähig</Badge>
              ) : (
                <Badge variant="destructive">nicht tragfähig</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Einnahmen</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {r.einnahmen.map((p, i) => (
              <PosRow key={i} label={p.label} betrag={p.betrag} hinweis={p.hinweis} />
            ))}
            <SumRow label="Summe Einnahmen" betrag={r.summeEinnahmen} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ausgaben & Rate</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {r.ausgaben.map((p, i) => (
              <PosRow key={i} label={p.label} betrag={p.betrag} hinweis={p.hinweis} />
            ))}
            <PosRow
              label="Geplante Darlehensrate"
              betrag={-r.geplanteRate}
              hinweis={r.rateGeschaetzt ? `Stress-Annahme ${r.annahmen.stressAnnuitaetProzent} % Annuität` : "Aus Sollzins + Tilgung"}
            />
            <SumRow label="Summe Ausgaben inkl. Rate" betrag={r.summeAusgaben - r.geplanteRate} />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {r.rateGeschaetzt && "* Rate geschätzt, solange kein Sollzins hinterlegt ist. "}
        Pauschalen (Lebenshaltung {eur(r.annahmen.lebenshaltungErsteErwachsene)} erste Person,{" "}
        {eur(r.annahmen.lebenshaltungWeitereErwachsene)} je weitere, {eur(r.annahmen.lebenshaltungProKind)} je Kind;
        Bewirtschaftung {r.annahmen.bewirtschaftungProQm} €/m²) sind Richtwerte – einzelne Banken rechnen abweichend.
        Diese Aufstellung ersetzt keine verbindliche Bankprüfung.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PosRow({ label, betrag, hinweis }: { label: string; betrag: number; hinweis?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed py-1 last:border-0">
      <div>
        <span>{label}</span>
        {hinweis && <div className="text-xs text-muted-foreground">{hinweis}</div>}
      </div>
      <span className={`tabular-nums ${betrag < 0 ? "text-destructive" : ""}`}>
        {betrag < 0 ? "−" : ""}
        {eur(Math.abs(betrag))}
      </span>
    </div>
  );
}

function SumRow({ label, betrag }: { label: string; betrag: number }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1.5 font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">
        {betrag < 0 ? "−" : ""}
        {eur(Math.abs(betrag))}
      </span>
    </div>
  );
}
