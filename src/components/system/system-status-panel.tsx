import { CheckCircle2, AlertTriangle, FlaskConical, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SystemStatus, StatusMode } from "@/lib/system/status";

const MODE_BADGE: Record<StatusMode, { variant: "success" | "warning" | "neutral" | "ai"; label: string }> = {
  active: { variant: "success", label: "aktiv" },
  configured: { variant: "success", label: "konfiguriert" },
  demo: { variant: "ai", label: "Demo" },
  stub: { variant: "neutral", label: "Stub" },
  warn: { variant: "warning", label: "Achtung" },
};

export function SystemStatusPanel({ status }: { status: SystemStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" /> Systemstatus
        </CardTitle>
        <CardDescription>Welche Bausteine sind produktiv, welche im Demo-/Stub-Modus?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {status.items.map((item) => {
          const badge = MODE_BADGE[item.mode];
          return (
            <div key={item.key} className="flex items-start justify-between gap-3 rounded-md border p-2.5">
              <div className="min-w-0">
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">
                  {item.value}
                  {item.hint ? <span className="block text-warning-foreground">{item.hint}</span> : null}
                </div>
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function PilotBanner({ pilot }: { pilot: boolean }) {
  if (!pilot) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/[0.06] p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <span>Alle Kernbausteine sind produktiv konfiguriert.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-ai/30 bg-ai/[0.05] p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-ai">
        <FlaskConical className="h-4 w-4 shrink-0" /> Pilotbetrieb
      </div>
      <ul className="ml-1 space-y-1 text-muted-foreground">
        <li>• Plattform-APIs (Europace, FinLink, eHyp home) sind vorbereitet, aber noch nicht produktiv angebunden.</li>
        <li>• <strong>ManualExport</strong> (PDF, Kopiermaske, JSON, CSV) ist der aktive Übergabeweg.</li>
        <li>• KI/OCR laufen im Demo-/Mock-Modus oder mit konfiguriertem Anbieter.</li>
        <li>• Jede Übertragung erfolgt ausschließlich manuell nach Freigabe.</li>
        <li className="flex items-start gap-1 text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Echte Kundendaten nur nutzen, wenn Auth, Storage, Upload-Sicherheit und Datenschutz korrekt konfiguriert sind.
        </li>
      </ul>
    </div>
  );
}
