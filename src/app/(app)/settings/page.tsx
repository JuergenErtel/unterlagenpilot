import Link from "next/link";
import { ShieldCheck, BrainCircuit, Database, Lock, MessageSquareText, ChevronRight } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSystemStatus } from "@/lib/system/status";
import { SystemStatusPanel, PilotBanner } from "@/components/system/system-status-panel";

export default async function SettingsPage() {
  const ctx = await requireContext();
  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
  });
  const status = await getSystemStatus(ctx.organizationId);

  const aiProvider = process.env.AI_PROVIDER ?? "mock";
  const ocrProvider = process.env.OCR_PROVIDER ?? "mock";
  const storageProvider = process.env.STORAGE_PROVIDER ?? "local";

  const retention =
    org && org.retentionDays > 0
      ? `${org.retentionDays} Tage`
      : "Bis zur manuellen Löschung";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">
          Datenschutz, KI/OCR, Speicherung und Sicherheit für{" "}
          {ctx.organizationName}. Reine Anzeige – Secrets werden nicht angezeigt.
        </p>
      </div>

      <PilotBanner pilot={status.pilot} />
      <SystemStatusPanel status={status} />

      <Link href="/settings/vorlagen" className="block">
        <Card className="transition-colors hover:border-primary/40">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Nachrichten-Vorlagen</div>
                <div className="text-xs text-muted-foreground">
                  Betreff und Text der Kundennachrichten anpassen (Nachforderung, Erinnerung, Checkliste …).
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              Datenschutz &amp; Aufbewahrung
            </CardTitle>
            <CardDescription>
              Speicherfristen und Löschkonzept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Aufbewahrungsfrist</span>
              <Badge variant="outline">{retention}</Badge>
            </div>
            <p className="text-muted-foreground">
              Standardwert <code>0</code> bedeutet: Daten werden bis zur manuellen
              Löschung vorgehalten. Es bestehen ein Löschkonzept sowie die
              Möglichkeit zum Export personenbezogener Daten (DSGVO-Auskunft und
              -Löschung).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-muted-foreground" />
              KI &amp; OCR
            </CardTitle>
            <CardDescription>
              Auswertungs- und Texterkennungsdienste.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">KI-Provider</span>
              <Badge variant="secondary">{aiProvider}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">OCR-Provider</span>
              <Badge variant="secondary">{ocrProvider}</Badge>
            </div>
            <p className="text-muted-foreground">
              Standard ist <code>mock</code>. Produktiv wird Azure OpenAI (EU-Region)
              für DSGVO-Konformität empfohlen. Jede KI-Auswertung erfordert eine
              menschliche Freigabe; Ergebnisse werden mit Konfidenzwerten
              ausgewiesen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              Speicherung
            </CardTitle>
            <CardDescription>Ablage von Dokumenten und Dateien.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Storage-Provider</span>
              <Badge variant="secondary">{storageProvider}</Badge>
            </div>
            <p className="text-muted-foreground">
              Dokumente werden mandantengetrennt abgelegt. Produktiv ist ein
              EU-Objektspeicher mit serverseitiger Verschlüsselung vorgesehen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Sicherheit
            </CardTitle>
            <CardDescription>Zugriffsschutz und Mandantentrennung.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ul className="list-disc space-y-1 pl-5">
              <li>Signierte Upload-Links mit Ablaufzeit.</li>
              <li>Strikte Mandantentrennung über die Organisations-ID.</li>
              <li>Rollenbasierte Zugriffskontrolle (RBAC).</li>
              <li>Audit-Protokollierung sicherheitsrelevanter Aktionen.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
