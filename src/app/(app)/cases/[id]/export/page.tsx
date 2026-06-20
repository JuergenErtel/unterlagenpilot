import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { releasePlatform } from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyBlock } from "@/components/copy-block";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/domain/enums";

export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ platform?: string }>;
}) {
  const { id } = await params;
  const { platform } = await searchParams;
  await requireContext();
  const canonical = await caseToCanonical(id);
  const active = (PLATFORMS.includes(platform as Platform) ? platform : "europace") as Platform;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plattform-Export & Kopiermaske</h1>
          <p className="text-sm text-muted-foreground">
            Manueller Export (PDF/JSON/CSV/Kopiermaske). Übertragung nur nach manueller Freigabe – keine automatische API-Übertragung im MVP.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href={`/cases/${id}`}>Zur Fallakte</Link></Button>
      </div>

      <Tabs defaultValue={active}>
        <TabsList>
          {PLATFORMS.map((p) => (<TabsTrigger key={p} value={p}>{PLATFORM_LABELS[p]}</TabsTrigger>))}
        </TabsList>
        {PLATFORMS.map((p) => {
          const payload = buildPlatformMapping(canonical, p);
          const json = JSON.stringify(payload, null, 2);
          const flat = payload.groups
            .map((g) => `## ${g.group}\n` + g.fields.map((f) => `${f.label}: ${f.value ?? "—"}`).join("\n"))
            .join("\n\n");
          return (
            <TabsContent key={p} value={p} className="space-y-4">
              {payload.missingRequiredFields.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                  <span className="font-medium text-warning">Fehlende Pflichtfelder ({payload.missingRequiredFields.length}):</span>{" "}
                  {payload.missingRequiredFields.join(", ")}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <form action={releasePlatform.bind(null, id, p)}>
                  <Button size="sm" variant="success" type="submit">Für {PLATFORM_LABELS[p]} freigeben</Button>
                </form>
                <Badge variant="outline" className="self-center">Felder: {payload.groups.reduce((a, g) => a + g.fields.length, 0)}</Badge>
              </div>

              {payload.groups.map((g) => (
                <Card key={g.group}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{g.group}</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {g.fields.map((f) => (
                      <div key={f.platformField} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{f.value === null ? "—" : String(f.value)}</span>
                          {f.requiresReview && <Badge variant="warning" className="text-[10px]">prüfen</Badge>}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              <Card>
                <CardHeader><CardTitle className="text-sm">Kopiermaske (Text)</CardTitle></CardHeader>
                <CardContent><CopyBlock text={flat} label="Felder kopieren" /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">JSON-Export</CardTitle></CardHeader>
                <CardContent><CopyBlock text={json} label="JSON kopieren" /></CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
