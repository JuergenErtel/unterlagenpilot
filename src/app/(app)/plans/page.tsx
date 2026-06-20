import { Check, CreditCard } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { formatEUR, cn } from "@/lib/utils";
import { type PlanTier } from "@/lib/domain/enums";
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

interface TierInfo {
  tier: PlanTier;
  name: string;
  description: string;
  features: string[];
}

const STATIC_TIERS: TierInfo[] = [
  {
    tier: "starter",
    name: "Starter",
    description: "Einstieg für einzelne Vermittler.",
    features: [
      "Begrenzte Anzahl Fälle pro Monat",
      "Automatische Dokumenten-Klassifizierung",
      "Einfache Checkliste",
      "PDF-Export",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    description: "Voller KI-Funktionsumfang für aktive Vermittler.",
    features: [
      "KI-Auswertung der Unterlagen",
      "Bankfähige Zusammenfassung",
      "Kopiermaske für Plattformen",
      "E-Mail- und WhatsApp-Vorlagen",
    ],
  },
  {
    tier: "team",
    name: "Team",
    description: "Zusammenarbeit für Vermittlerteams.",
    features: [
      "Mehrere Nutzer",
      "Rollen und Rechte (RBAC)",
      "Erweitertes Audit-Log",
      "Team-Dashboard",
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    description: "Für größere Organisationen mit eigenen Anforderungen.",
    features: [
      "Eigenes Branding",
      "Eigene Checklisten",
      "Eigene Plattformzugänge",
      "Organisationsverwaltung",
    ],
  },
  {
    tier: "white_label",
    name: "White Label",
    description: "Vollständig gebrandete Lösung für Partner.",
    features: [
      "Eigenes Branding und Domain",
      "Eigene Checklisten pro Mandant",
      "Eigene Plattformzugänge",
      "Mandantenfähige Organisationsverwaltung",
    ],
  },
];

export default async function PlansPage() {
  const ctx = await requireContext();

  const [plans, subscription] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } }),
    prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      include: { plan: true },
    }),
  ]);

  const currentTier = subscription?.plan.tier as PlanTier | undefined;

  // Datenbank-Pläne bevorzugen; sonst statische Matrix.
  const tiles: Array<{
    key: string;
    tier: PlanTier;
    name: string;
    description: string;
    features: string[];
    priceMonthly: number | null;
    monthlyCasesLimit: number | null;
  }> =
    plans.length > 0
      ? plans.map((p) => {
          const fallback = STATIC_TIERS.find((t) => t.tier === p.tier);
          const dbFeatures = Array.isArray(p.features)
            ? (p.features as unknown[]).map(String)
            : [];
          return {
            key: p.id,
            tier: p.tier as PlanTier,
            name: p.name,
            description: fallback?.description ?? "",
            features: dbFeatures.length > 0 ? dbFeatures : fallback?.features ?? [],
            priceMonthly: p.priceMonthly,
            monthlyCasesLimit: p.monthlyCasesLimit,
          };
        })
      : STATIC_TIERS.map((t) => ({
          key: t.tier,
          tier: t.tier,
          name: t.name,
          description: t.description,
          features: t.features,
          priceMonthly: null,
          monthlyCasesLimit: null,
        }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SaaS-Tarife</h1>
        <p className="text-sm text-muted-foreground">
          Funktionsumfang der UnterlagenPilot-Tarife
          {currentTier
            ? " – Ihr aktueller Tarif ist hervorgehoben."
            : "."}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p>
            Im MVP ist keine aktive Zahlungsintegration angebunden. Die
            Tarifübersicht dient der Funktionsabgrenzung; der Tarifwechsel
            erfolgt aktuell manuell.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => {
          const isCurrent = currentTier === t.tier;
          return (
            <Card
              key={t.key}
              className={cn(
                "flex flex-col",
                isCurrent && "border-primary ring-1 ring-primary"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{t.name}</CardTitle>
                  {isCurrent && <Badge variant="success">Aktueller Tarif</Badge>}
                </div>
                <CardDescription>{t.description}</CardDescription>
                <div className="pt-2 text-2xl font-semibold tabular-nums">
                  {t.priceMonthly != null ? (
                    <>
                      {formatEUR(t.priceMonthly / 100)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / Monat
                      </span>
                    </>
                  ) : (
                    <span className="text-base font-normal text-muted-foreground">
                      Preis auf Anfrage
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                {t.monthlyCasesLimit != null
                  ? `Bis zu ${t.monthlyCasesLimit} Fälle / Monat`
                  : "Unbegrenzte Fälle"}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {subscription && (
        <>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Abo-Status: <strong>{subscription.status}</strong>
            {subscription.currentPeriodEnd
              ? ` · Laufzeitende ${subscription.currentPeriodEnd.toLocaleDateString(
                  "de-DE"
                )}`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
