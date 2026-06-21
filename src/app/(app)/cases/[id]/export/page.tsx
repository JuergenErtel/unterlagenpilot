import Link from "next/link";
import { ArrowLeft, FileText, Lock, ShieldCheck, FileJson, Sheet, Copy } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { releasePlatform } from "@/lib/actions/cases";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyBlock } from "@/components/copy-block";
import { ProgressRing } from "@/components/case/progress-ring";
import { PlatformExportTable, type ExportGroup } from "@/components/case/platform-export-table";
import { readinessTone } from "@/lib/ui/tone";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/domain/enums";

function internalName(platformField: string): string {
  const parts = platformField.split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : platformField;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ platform?: string }>;
}) {
  const { id } = await params;
  const { platform } = await searchParams;
  await requireCaseAccess(id);
  const canonical = await caseToCanonical(id);
  const active = (PLATFORMS.includes(platform as Platform) ? platform : "europace") as Platform;

  const [mappings, docCounts] = await Promise.all([
    prisma.platformMapping.findMany({ where: { caseId: id }, select: { platform: true, released: true } }),
    prisma.document.groupBy({ by: ["reviewStatus"], where: { caseId: id }, _count: true }),
  ]);
  const releasedOf = (p: Platform) => mappings.find((m) => m.platform === p)?.released ?? false;
  const docsReleased = docCounts.find((d) => d.reviewStatus === "akzeptiert")?._count ?? 0;
  const docsOpen = docCounts.filter((d) => d.reviewStatus !== "akzeptiert").reduce((s, d) => s + d._count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Einreichung"
        title="Einreichungsassistent"
        subtitle="Aufbereitete Felder pro Plattform – kopieren, exportieren und manuell freigeben. Keine automatische Übertragung im MVP."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue={active}>
        <TabsList>
          {PLATFORMS.map((p) => (
            <TabsTrigger key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </TabsTrigger>
          ))}
        </TabsList>

        {PLATFORMS.map((p) => {
          const payload = buildPlatformMapping(canonical, p);
          const missing = payload.missingRequiredFields;
          const allFields = payload.groups.flatMap((g) => g.fields);
          const requiredFields = allFields.filter((f) => f.requiresReview);
          const presentRequired = requiredFields.filter((f) => f.value != null && f.value !== "").length;
          const readiness = requiredFields.length === 0 ? 100 : Math.round((presentRequired / requiredFields.length) * 100);
          const band = readinessTone(readiness);
          const released = releasedOf(p);

          const checkedFields = allFields.filter((f) => f.value != null && f.value !== "").length;
          const uncheckedFields = allFields.length - checkedFields;

          const groups: ExportGroup[] = payload.groups.map((g) => ({
            group: g.group,
            fields: g.fields.map((f) => ({
              platformField: f.platformField,
              internalField: internalName(f.platformField),
              label: f.label,
              value: f.value,
              confidence: f.confidence,
              requiresReview: f.requiresReview,
            })),
          }));

          const missingLabels = missing.map((pf) => allFields.find((f) => f.platformField === pf)?.label ?? pf);

          const flat = payload.groups
            .map(
              (g) =>
                `## ${g.group}\n` +
                g.fields.map((f) => `${f.label}: ${f.value === null || f.value === "" ? "—" : String(f.value)}`).join("\n")
            )
            .join("\n\n");
          const json = JSON.stringify(payload, null, 2);
          const csv = [
            ["Abschnitt", "Plattformfeld", "Interner Feldname", "Wert", "Konfidenz", "Status"].join(","),
            ...payload.groups.flatMap((g) =>
              g.fields.map((f) =>
                [
                  csvEscape(g.group),
                  csvEscape(f.platformField),
                  csvEscape(internalName(f.platformField)),
                  csvEscape(f.value === null || f.value === "" ? "" : String(f.value)),
                  String(f.confidence),
                  f.value === null || f.value === "" ? "fehlt" : f.requiresReview ? "pruefen" : "uebernommen",
                ].join(",")
              )
            ),
          ].join("\n");

          return (
            <TabsContent key={p} value={p} className="space-y-6">
              <Card>
                <CardContent className="flex flex-wrap items-center gap-6 p-6">
                  <ProgressRing value={readiness} label="Bereitschaftsgrad" sublabel={PLATFORM_LABELS[p]} size={120} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={missing.length === 0 ? "success" : "warning"}>{band.label}</Badge>
                      {released ? <Badge variant="success">freigegeben</Badge> : <Badge variant="neutral">nicht freigegeben</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {missing.length === 0
                        ? "Alle Pflichtangaben liegen vor. Prüfe die markierten Felder und gib die Übergabe manuell frei."
                        : `${missing.length} Pflichtangabe${missing.length === 1 ? "" : "n"} blockier${missing.length === 1 ? "t" : "en"} die Einreichung.`}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Felder gefüllt: <strong className="text-foreground">{checkedFields}</strong></span>
                      <span>Felder offen: <strong className="text-foreground">{uncheckedFields}</strong></span>
                      <span>Dokumente freigegeben: <strong className="text-foreground">{docsReleased}</strong></span>
                      <span>Dokumente offen: <strong className="text-foreground">{docsOpen}</strong></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <form action={releasePlatform.bind(null, id, p)}>
                        <Button size="sm" variant="success" type="submit" disabled={missing.length > 0}>
                          Für {PLATFORM_LABELS[p]} freigeben
                        </Button>
                      </form>
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/cases/${id}/pdf?type=platform&platform=${p}`}>
                          <FileText />
                          PDF-Zusammenfassung
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {missing.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                  <div className="font-medium text-destructive">Diese Angaben blockieren die Einreichung:</div>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {missingLabels.map((l, i) => (
                      <li key={`${l}-${i}`}>
                        <Badge variant="destructive">{l}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Felder für {PLATFORM_LABELS[p]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlatformExportTable groups={groups} caseId={id} platform={p} />
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Copy className="h-4 w-4" /> Kopiermaske
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CopyBlock text={flat} label="Alle Felder kopieren" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileJson className="h-4 w-4" /> JSON
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CopyBlock text={json} label="JSON kopieren" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sheet className="h-4 w-4" /> CSV
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CopyBlock text={csv} label="CSV kopieren" />
                  </CardContent>
                </Card>
              </div>

              <Separator />
              <div className="flex items-start gap-2 rounded-lg border border-ai/30 bg-ai/10 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                <span>
                  <Lock className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                  Keine automatische Übertragung. API-Anbindung vorbereitet. Im MVP erfolgt die Übergabe sicher über Export und
                  Kopiermaske – jede Freigabe bleibt manuell. Verarbeitung DSGVO-konform in der EU.
                </span>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
