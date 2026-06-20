import Link from "next/link";
import {
  Sparkles,
  KeyRound,
  PlugZap,
  FileDown,
  ShieldCheck,
  MonitorSmartphone,
} from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { connectionStatuses } from "@/lib/platforms/connectors";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusDot } from "@/components/ui/status-dot";

type ConnectorKey = "europace" | "finlink" | "ehyp_home";

/** Statische Beschreibungstexte je Verbindung (Mikrocopy, menschlich). */
const CONNECTOR_META: Record<
  ConnectorKey,
  { name: string; benefit: string; credentials: string[] }
> = {
  europace: {
    name: "Europace",
    benefit:
      "Vorgänge samt Kundenangaben und Anforderungen werden übernommen – du startest nicht bei null.",
    credentials: ["Client-ID", "Client-Secret", "Base-URL"],
  },
  finlink: {
    name: "FinLink",
    benefit:
      "Bestehende Fälle und Kundenstammdaten landen direkt in UnterlagenPilot – der schnellste Einstieg.",
    credentials: ["API-Key", "Base-URL"],
  },
  ehyp_home: {
    name: "eHyp home",
    benefit:
      "Objekt- und Grundbuchnachweise aus dem Developer Studio werden für die Einreichung vorbereitet.",
    credentials: ["API-Key", "Client-ID", "Client-Secret", "Firmen-ID"],
  },
};

/** Reihenfolge: FinLink als empfohlener Startpunkt zuerst. */
const ORDER: ConnectorKey[] = ["finlink", "europace", "ehyp_home"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

export default async function ConnectionsPage() {
  const ctx = await requireContext();
  const statuses = await connectionStatuses(ctx.organizationId);
  const byPlatform = new Map(statuses.map((s) => [s.platform, s]));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Einrichtung"
        title="Plattform-Verbindungen"
        subtitle="Verbinde deine Plattformen oder nutze den sicheren manuellen Export. Beides führt zu einer einreichungsfertigen Akte."
      />

      {/* Empfohlener Startpunkt: FinLink */}
      <Card className="border-ai/30 bg-ai/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-ai" />
                <CardTitle>
                  Empfohlener Startpunkt: Fälle aus FinLink importieren
                </CardTitle>
              </div>
              <CardDescription className="max-w-2xl">
                Wenn du bereits mit FinLink arbeitest, ist der Import der
                schnellste Weg zu einer vollständigen Akte. Trag einmalig deine
                Zugangsdaten ein – wir holen die offenen Fälle für dich.
              </CardDescription>
            </div>
            <Badge variant="ai" className="shrink-0">
              Empfohlen
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button variant="ai" disabled className="cursor-not-allowed opacity-90">
            <KeyRound className="mr-2 h-4 w-4" />
            Zugangsdaten eintragen
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/cases">Demo-Export öffnen</Link>
          </Button>
        </CardFooter>
      </Card>

      {/* Plattform-Karten */}
      <div className="grid gap-6 lg:grid-cols-2">
        {ORDER.map((key) => {
          const meta = CONNECTOR_META[key];
          const status = byPlatform.get(key);
          const ok = status?.ok ?? false;
          return (
            <Card key={key} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PlugZap className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>{meta.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={ok ? "ready" : "neutral"} />
                    <Badge variant={ok ? "success" : "neutral"}>
                      {ok ? "Verbunden" : "Bereit zum Einrichten"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-5 text-sm">
                <div className="space-y-1">
                  <SectionLabel>Was bringt die Verbindung?</SectionLabel>
                  <p className="text-muted-foreground">{meta.benefit}</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <SectionLabel>Welche Zugangsdaten?</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.credentials.map((c) => (
                      <Badge key={c} variant="outline">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <SectionLabel>Was funktioniert aktuell?</SectionLabel>
                    <p className="text-muted-foreground">
                      PDF- und JSON-Export sowie die Kopiermaske – sicher und
                      sofort nutzbar.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <SectionLabel>Was ist vorbereitet?</SectionLabel>
                    <p className="text-muted-foreground">
                      Der API-Adapter ist angelegt. Im MVP erfolgt die Übergabe
                      sicher über Export und Kopiermaske.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1">
                  <SectionLabel>Letzter Test</SectionLabel>
                  <p className="text-muted-foreground tabular-nums">—</p>
                  {status?.message && (
                    <p className="text-xs text-muted-foreground/90">
                      {status.message}
                    </p>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled
                  className="cursor-not-allowed opacity-70"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Zugangsdaten eintragen
                </Button>
                <Button
                  variant="outline"
                  disabled
                  className="cursor-not-allowed opacity-70"
                >
                  Verbindung testen
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/cases">Demo-Export öffnen</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {/* Manueller Export – immer verfügbar */}
        <Card className="flex flex-col border-success/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileDown className="h-5 w-5 text-success" />
                <CardTitle>Manueller Export</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <StatusDot tone="ready" />
                <Badge variant="success">Immer verfügbar</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 space-y-5 text-sm">
            <div className="space-y-1">
              <SectionLabel>Was bringt die Verbindung?</SectionLabel>
              <p className="text-muted-foreground">
                Die produktive MVP-Variante: Du übergibst die Akte sicher per
                PDF, JSON oder Kopiermaske an jede Plattform – ganz ohne
                Schnittstelle.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <SectionLabel>Welche Zugangsdaten?</SectionLabel>
              <p className="text-muted-foreground">
                Keine. Es werden keine externen Zugangsdaten benötigt.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <SectionLabel>Was funktioniert aktuell?</SectionLabel>
                <p className="text-muted-foreground">
                  PDF-Checkliste, JSON-Datenpaket und die Kopiermaske für die
                  manuelle Übertragung.
                </p>
              </div>
              <div className="space-y-1">
                <SectionLabel>Was ist vorbereitet?</SectionLabel>
                <p className="text-muted-foreground">
                  Zusätzliche API-Adapter sind vorbereitet und werden nach
                  Freigabe aktiviert.
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-1">
              <SectionLabel>Letzter Test</SectionLabel>
              <p className="text-muted-foreground tabular-nums">—</p>
            </div>
          </CardContent>

          <CardFooter className="flex-wrap gap-2">
            <Button variant="success" asChild>
              <Link href="/cases">Demo-Export öffnen</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* DSGVO / EU-Hinweis + Browser-Assist */}
      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-3 p-6 text-sm text-muted-foreground sm:flex-row sm:items-start">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="space-y-2">
            <p>
              Alle Daten werden DSGVO-konform innerhalb der EU verarbeitet. Eine
              Übertragung an Plattformen erfolgt erst nach deiner ausdrücklichen
              Freigabe.
            </p>
            <p className="flex items-center gap-2 text-xs">
              <MonitorSmartphone className="h-4 w-4 shrink-0" />
              BrowserAssist ist als späterer, optionaler Assistenz-Fallback
              vorgesehen – derzeit deaktiviert.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
