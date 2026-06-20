import { Plug, ShieldCheck, MonitorSmartphone, FileDown } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { connectionStatuses } from "@/lib/platforms/connectors";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const ENV_VARS: Record<Platform, string[]> = {
  europace: ["EUROPACE_BASE_URL", "EUROPACE_CLIENT_ID", "EUROPACE_CLIENT_SECRET"],
  finlink: ["FINLINK_BASE_URL", "FINLINK_API_KEY"],
  ehyp_home: [
    "EHYP_BASE_URL",
    "EHYP_API_KEY",
    "EHYP_CLIENT_ID",
    "EHYP_CLIENT_SECRET",
    "EHYP_COMPANY_ID",
  ],
};

export default async function ConnectionsPage() {
  const ctx = await requireContext();
  const statuses = await connectionStatuses(ctx.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plattform-Verbindungen</h1>
        <p className="text-sm text-muted-foreground">
          Status der Anbindungen an Europace, FinLink und eHyp home für{" "}
          {ctx.organizationName}.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p>
            Im MVP sind alle Plattform-Connectoren <strong>Stubs</strong> – es
            findet keine automatische API-Übertragung statt. Produktiv erfolgt
            die Übergabe über den manuellen Export (PDF, JSON, CSV, Kopiermaske).
            Die folgenden Verbindungen werden über Umgebungsvariablen
            konfiguriert und sind für die spätere echte API-Anbindung vorbereitet.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((s) => {
          const platform = s.platform as Platform;
          return (
            <Card key={s.platform} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Plug className="h-5 w-5 text-muted-foreground" />
                    {PLATFORM_LABELS[platform] ?? s.platform}
                  </CardTitle>
                  {s.ok ? (
                    <Badge variant="success">Konfiguriert</Badge>
                  ) : (
                    <Badge variant="warning">Nicht konfiguriert</Badge>
                  )}
                </div>
                <CardDescription>{s.message}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Benötigte Umgebungsvariablen
                </p>
                <ul className="space-y-1">
                  {(ENV_VARS[platform] ?? []).map((v) => (
                    <li key={v}>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {v}
                      </code>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                MVP: Stub-Connector – Übergabe aktuell über manuellen Export.
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5 text-muted-foreground" />
                Manueller Export
              </CardTitle>
              <Badge variant="success">Immer verfügbar</Badge>
            </div>
            <CardDescription>
              <code>ManualExportConnector</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Der manuelle Export ist die produktive MVP-Variante: bankfähige
            Zusammenfassung als PDF, strukturierte Daten als JSON/CSV sowie
            Kopiermasken für die Eingabe in die jeweilige Plattform. Keine
            Konfiguration erforderlich.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
                Browser-Assist
              </CardTitle>
              <Badge variant="warning">Deaktiviert</Badge>
            </div>
            <CardDescription>
              <code>BrowserAssistConnector</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Browser-Assist ist lediglich als späterer, optionaler manueller
            Assistenz-Fallback konzipiert. Im MVP ist diese Funktion bewusst
            deaktiviert – kein automatisiertes Ausfüllen oder Scraping.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
