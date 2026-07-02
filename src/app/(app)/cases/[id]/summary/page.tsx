import Link from "next/link";
import { requireCaseAccess } from "@/lib/auth/context";
import { getCaseAggregate } from "@/lib/cases/service";
import { AIService } from "@/lib/ai/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyBlock } from "@/components/copy-block";

const ai = new AIService();

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Tenant-Isolation: 404 bei fremder Organisation (kein Existenz-Leak).
  await requireCaseAccess(id);
  const agg = await getCaseAggregate(id);
  const s = ai.createBankSummary({
    ...agg.canonical,
    vorhandeneUnterlagen: agg.checklist.filter((i) => i.status === "vorhanden").map((i) => i.name),
    fehlendeUnterlagen: agg.missing.map((i) => i.name),
    risiken: agg.plausibility.filter((p) => p.status !== "ok").map((p) => p.explanation),
    offenePunkte: agg.missing.map((i) => i.name),
  });

  const text = [
    `BANKFÄHIGE ZUSAMMENFASSUNG – ${agg.caseNumber}`,
    "",
    `Kurzprofil: ${s.kurzprofil}`,
    `Einkommen & Beschäftigung: ${s.einkommenBeschaeftigung}`,
    s.selbststaendigkeit ? `Selbstständigkeit: ${s.selbststaendigkeit}` : "",
    `Objektübersicht: ${s.objektuebersicht}`,
    `Finanzierungsbedarf: ${s.finanzierungsbedarf}`,
    `Eigenkapital: ${s.eigenkapital}`,
    "",
    `Vorhandene Unterlagen: ${s.vorhandeneUnterlagen.join(", ") || "—"}`,
    `Fehlende Unterlagen: ${s.fehlendeUnterlagen.join(", ") || "—"}`,
    `Hinweise (neutral): ${s.risikenNeutral.join("; ") || "—"}`,
    `Offene Punkte: ${s.offenePunkte.join("; ") || "—"}`,
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bankfähige Zusammenfassung</h1>
          <p className="text-sm text-muted-foreground">Neutral und sachlich formuliert – ohne Bewertung der Machbarkeit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default" size="sm">
            <a href={`/api/cases/${id}/pdf?type=bank-summary`}>PDF herunterladen</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/cases/${id}/pdf?type=bank-summary&preview=1`} target="_blank" rel="noreferrer">Vorschau</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/cases/${id}/pdf?type=checklist`}>Checkliste-PDF</a>
          </Button>
          <Button asChild variant="ghost" size="sm"><Link href={`/cases/${id}`}>Zur Fallakte</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Übersicht</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <Block label="Kurzprofil" text={s.kurzprofil} />
          <Block label="Einkommen & Beschäftigung" text={s.einkommenBeschaeftigung} />
          <Block label="Objektübersicht" text={s.objektuebersicht} />
          <Block label="Finanzierungsbedarf" text={s.finanzierungsbedarf} />
          <Block label="Eigenkapital" text={s.eigenkapital} />
          {s.selbststaendigkeit && <Block label="Selbstständigkeit" text={s.selbststaendigkeit} />}
          <List label="Vorhandene Unterlagen" items={s.vorhandeneUnterlagen} />
          <List label="Fehlende Unterlagen" items={s.fehlendeUnterlagen} />
          <List label="Hinweise (neutral)" items={s.risikenNeutral} />
          <List label="Offene Punkte" items={s.offenePunkte} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kopierbare Textversion (für Bank/Plattform)</CardTitle></CardHeader>
        <CardContent>
          <CopyBlock text={text} label="Zusammenfassung kopieren" />
          <p className="mt-2 text-xs text-muted-foreground">PDF-Export: serverseitig erzeugt – „PDF herunterladen" oben.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p>{text}</p>
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {items.length ? <ul className="ml-4 list-disc">{items.map((i, k) => (<li key={k}>{i}</li>))}</ul> : <p className="text-muted-foreground">—</p>}
    </div>
  );
}
