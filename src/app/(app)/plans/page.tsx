import { Check, Sparkles, Clock } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { formatEUR, cn } from "@/lib/utils";
import { type PlanTier } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TIER_SUBTITLES: Record<PlanTier, string> = {
  starter:
    "Für einzelne Vermittler, die Unterlagen sauber einsammeln wollen.",
  pro: "Für aktive Vermittler, die Fälle schneller einreichungsfertig machen wollen.",
  team: "Für Teams mit mehreren Beratern und Sachbearbeitern.",
  enterprise: "Für größere Organisationen mit eigenen Prozessen.",
  white_label:
    "Für Vertriebe, die BaufiDesk unter eigener Marke nutzen wollen.",
};

const FEATURE_LABELS: Record<string, string> = {
  ki_auswertung: "KI-Auswertung von Gehalt, Objekt und Unterlagen",
  bankfaehige_zusammenfassung: "Bankfähige Zusammenfassung als PDF",
  plattform_kopiermaske: "Kopiermaske für Europace, FinLink und eHyp home",
  email_whatsapp_vorlagen: "E-Mail- und WhatsApp-Vorlagen",
  dokumentenklassifizierung: "Automatische Dokumentenklassifizierung",
  einfache_checkliste: "Geführte Unterlagen-Checkliste",
  pdf_export: "Bankfähige Zusammenfassung als PDF",
  mehrere_nutzer: "Mehrere Nutzer",
  rollen: "Rollen & Rechte",
  audit_log_erweitert: "Erweitertes Audit-Log",
  team_dashboard: "Team-Dashboard",
  eigenes_branding: "Eigenes Branding",
  eigene_checklisten: "Eigene Checklisten",
  eigene_plattformzugaenge: "Eigene Plattformzugänge",
  organisationsverwaltung: "Organisationsverwaltung",
  white_label: "White-Label",
  custom_domain: "Eigene Domain",
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}

const FALLBACK_FEATURES: Record<PlanTier, string[]> = {
  starter: ["dokumentenklassifizierung", "einfache_checkliste", "pdf_export"],
  pro: [
    "ki_auswertung",
    "bankfaehige_zusammenfassung",
    "plattform_kopiermaske",
    "email_whatsapp_vorlagen",
  ],
  team: ["mehrere_nutzer", "rollen", "audit_log_erweitert", "team_dashboard"],
  enterprise: [
    "eigenes_branding",
    "eigene_checklisten",
    "eigene_plattformzugaenge",
    "organisationsverwaltung",
  ],
  white_label: ["white_label", "custom_domain", "eigene_checklisten", "eigene_plattformzugaenge"],
};

const FALLBACK_NAMES: Record<PlanTier, string> = {
  starter: "Starter",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
  white_label: "White Label",
};

const FALLBACK_ORDER: PlanTier[] = [
  "starter",
  "pro",
  "team",
  "enterprise",
  "white_label",
];

export default async function PlansPage() {
  const ctx = await requireContext();

  const [plans, subscription] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } }),
    prisma.subscription.findFirst({
      where: { organizationId: ctx.organizationId },
      include: { plan: true },
    }),
  ]);

  const currentTier = subscription?.plan.tier as PlanTier | undefined;

  const tiles: Array<{
    key: string;
    tier: PlanTier;
    name: string;
    priceMonthly: number | null;
    features: string[];
  }> =
    plans.length > 0
      ? plans.map((p) => {
          const tier = p.tier as PlanTier;
          const dbFeatures = Array.isArray(p.features)
            ? (p.features as unknown[]).map(String)
            : [];
          return {
            key: p.id,
            tier,
            name: p.name,
            priceMonthly: p.priceMonthly,
            features: dbFeatures.length > 0 ? dbFeatures : FALLBACK_FEATURES[tier],
          };
        })
      : FALLBACK_ORDER.map((tier) => ({
          key: tier,
          tier,
          name: FALLBACK_NAMES[tier],
          priceMonthly: null,
          features: FALLBACK_FEATURES[tier],
        }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tarife"
        title="Der passende Tarif für Ihre Arbeitsweise"
        subtitle="Wählen Sie, wie viel BaufiDesk für Sie übernehmen soll – von der sauberen Sammlung bis zur eigenen Marke."
      />

      <Card className="border-ai/30 bg-ai/5">
        <CardContent className="flex items-start gap-3 p-5">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-ai" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Spart je Fall 30–60 Minuten manuelle Prüfung und Eingabe.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Weniger Tippen, weniger Nachfragen, schneller einreichungsfertig.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => {
          const isCurrent = currentTier === t.tier;
          const isRecommended = t.tier === "pro";
          return (
            <Card
              key={t.key}
              className={cn(
                "flex flex-col",
                isCurrent && "border-success ring-1 ring-success",
                !isCurrent && isRecommended && "border-ai ring-1 ring-ai"
              )}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{t.name}</CardTitle>
                  {isCurrent ? (
                    <Badge variant="success">Aktueller Tarif</Badge>
                  ) : isRecommended ? (
                    <Badge variant="ai">Empfohlen</Badge>
                  ) : null}
                </div>
                <CardDescription>{TIER_SUBTITLES[t.tier]}</CardDescription>
                <div className="pt-2 text-2xl font-semibold">
                  {t.priceMonthly != null ? (
                    <span className="font-mono tabular">
                      {formatEUR(t.priceMonthly / 100)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / Monat
                      </span>
                    </span>
                  ) : (
                    <span className="text-base font-normal text-muted-foreground">
                      auf Anfrage
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{featureLabel(f)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <span className="text-xs text-muted-foreground">
                    Dies ist Ihr aktiver Tarif.
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Tarifwechsel auf Wunsch über Ihren Ansprechpartner.
                  </span>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p>Keine aktive Zahlungsintegration im MVP.</p>
        </CardContent>
      </Card>
    </div>
  );
}
