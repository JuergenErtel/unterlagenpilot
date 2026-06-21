import { requireContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_TYPE_SPECS } from "@/lib/documents/document-types";
import { getRiskRule, RISK_SEVERITY_LABELS } from "@/lib/rules/risk-catalog";
import { DOCUMENT_TYPE_LABELS, PLATFORM_LABELS, type DocumentType } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

// MVP-Pflichttypen (sichere Erkennung) zuerst, dann vorbereitete Typen.
const MVP: DocumentType[] = ["personalausweis", "gehaltsabrechnung", "grundbuchauszug", "expose"];

export default async function DocumentTypesPage() {
  await requireContext();
  const specs = Object.values(DOCUMENT_TYPE_SPECS).filter((s) => s.type !== "sonstige");
  const sorted = [...specs].sort((a, b) => {
    const am = MVP.includes(a.type) ? 0 : 1;
    const bm = MVP.includes(b.type) ? 0 : 1;
    return am - bm || DOCUMENT_TYPE_LABELS[a.type].localeCompare(DOCUMENT_TYPE_LABELS[b.type]);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Konfiguration"
        title="Erkannte Dokumenttypen"
        subtitle="Klassifizierung, Pflichtfelder, typische Warnhinweise und Plattformrelevanz je Dokumenttyp. Im Demo-/Mock-Modus liefert die Erkennung deterministische Ergebnisse; produktiv übernimmt der KI-Provider diese Schemata."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((s) => {
          const required = s.fields.filter((f) => f.required);
          const optional = s.fields.filter((f) => !f.required);
          return (
            <Card key={s.type}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{DOCUMENT_TYPE_LABELS[s.type]}</span>
                  {MVP.includes(s.type) ? (
                    <Badge variant="success">erkannt</Badge>
                  ) : (
                    <Badge variant="ai">vorbereitet</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pflichtfelder</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {required.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      required.map((f) => <Badge key={f.key} variant="neutral">{f.label}</Badge>)
                    )}
                  </div>
                </div>
                {optional.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weitere Felder</div>
                    <div className="mt-1 text-xs text-muted-foreground">{optional.map((f) => f.label).join(", ")}</div>
                  </div>
                )}
                {s.warningCodes.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typische Hinweise</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {s.warningCodes.map((code) => {
                        const rule = getRiskRule(code);
                        return (
                          <li key={code}>
                            {rule ? (
                              <>
                                <span className="text-foreground">{rule.title}</span>{" "}
                                <span className="text-muted-foreground">({RISK_SEVERITY_LABELS[rule.severity]})</span>
                              </>
                            ) : (
                              code
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Plattformen:</span>
                  {s.platformRelevance.map((p) => (
                    <Badge key={p} variant="outline">{PLATFORM_LABELS[p]}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
