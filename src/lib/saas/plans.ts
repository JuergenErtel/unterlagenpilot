import { prisma } from "@/lib/db";
import type { PlanTier, UserRole } from "@/lib/domain/enums";

/**
 * SaaS-Tarife, Feature-Flags und Limits (Stripe-kompatibel vorbereitet).
 *
 * NOCH KEINE echte Zahlungsintegration. Das Datenmodell (Plan/Subscription) ist
 * jedoch so strukturiert, dass Stripe später nur Preis-IDs/Webhooks ergänzt:
 * `stripePriceId` ist als Platzhalter vorgesehen.
 */
export interface PlanLimits {
  /** Fälle pro Monat. null = unbegrenzt. */
  monthlyCases: number | null;
  /** Dokumente pro Fall. null = unbegrenzt. */
  documentsPerCase: number | null;
  /** Nutzer pro Organisation. null = unbegrenzt. */
  usersPerOrg: number | null;
  /** KI-Auswertungen pro Monat. null = unbegrenzt. */
  aiEvaluationsPerMonth: number | null;
  /** Plattform-Export (PDF/Kopiermaske/JSON/CSV) erlaubt. */
  platformExport: boolean;
  /** White-Label erlaubt. */
  whiteLabel: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceMonthlyCents: number | null;
  /** Stripe-Preis-ID (später). */
  stripePriceId?: string;
  features: string[];
  limits: PlanLimits;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  starter: {
    tier: "starter",
    name: "Starter",
    priceMonthlyCents: 2900,
    features: ["dokumentenklassifizierung", "einfache_checkliste", "pdf_export"],
    limits: { monthlyCases: 15, documentsPerCase: 30, usersPerOrg: 1, aiEvaluationsPerMonth: 150, platformExport: true, whiteLabel: false },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceMonthlyCents: 7900,
    features: ["ki_auswertung", "bankfaehige_zusammenfassung", "plattform_kopiermaske", "email_whatsapp_vorlagen"],
    limits: { monthlyCases: 75, documentsPerCase: 60, usersPerOrg: 3, aiEvaluationsPerMonth: 1000, platformExport: true, whiteLabel: false },
  },
  team: {
    tier: "team",
    name: "Team",
    priceMonthlyCents: 19900,
    features: ["mehrere_nutzer", "rollen", "audit_log_erweitert", "team_dashboard"],
    limits: { monthlyCases: null, documentsPerCase: 100, usersPerOrg: 15, aiEvaluationsPerMonth: null, platformExport: true, whiteLabel: false },
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    priceMonthlyCents: null,
    features: ["eigenes_branding", "eigene_checklisten", "eigene_plattformzugaenge", "organisationsverwaltung"],
    limits: { monthlyCases: null, documentsPerCase: null, usersPerOrg: null, aiEvaluationsPerMonth: null, platformExport: true, whiteLabel: false },
  },
  white_label: {
    tier: "white_label",
    name: "White Label",
    priceMonthlyCents: null,
    features: ["white_label", "custom_domain", "eigene_plattformzugaenge"],
    limits: { monthlyCases: null, documentsPerCase: null, usersPerOrg: null, aiEvaluationsPerMonth: null, platformExport: true, whiteLabel: true },
  },
};

/** Rollen, die je Tarif verfügbar sind (für Nutzerverwaltung/Onboarding). */
export const PLAN_ROLES: Record<PlanTier, UserRole[]> = {
  starter: ["org_admin"],
  pro: ["org_admin", "vermittler"],
  team: ["org_admin", "vermittler", "teammitglied"],
  enterprise: ["org_admin", "vermittler", "teammitglied"],
  white_label: ["white_label_admin", "org_admin", "vermittler", "teammitglied"],
};

export type LimitKey = "monthlyCases" | "documentsPerCase" | "usersPerOrg" | "aiEvaluationsPerMonth";

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: PlanTier;
}

/** Ermittelt den aktiven Tarif einer Organisation (Default: starter). */
export async function getOrgPlan(organizationId: string): Promise<PlanDefinition> {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  const tier = (sub?.plan.tier as PlanTier) ?? "starter";
  return PLAN_DEFINITIONS[tier];
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Prüft ein Mengen-Limit gegen die aktuelle Nutzung.
 * `documentsPerCase` benötigt `scope.caseId`.
 */
export async function checkLimit(
  organizationId: string,
  key: LimitKey,
  scope?: { caseId?: string }
): Promise<LimitCheck> {
  const plan = await getOrgPlan(organizationId);
  const limit = plan.limits[key];

  let used = 0;
  switch (key) {
    case "monthlyCases":
      used = await prisma.case.count({ where: { organizationId, createdAt: { gte: startOfMonth() } } });
      break;
    case "documentsPerCase":
      used = scope?.caseId
        ? await prisma.document.count({ where: { caseId: scope.caseId, case: { organizationId } } })
        : 0;
      break;
    case "usersPerOrg":
      used = await prisma.user.count({ where: { organizationId, active: true } });
      break;
    case "aiEvaluationsPerMonth":
      used = await prisma.aiJob.count({
        where: { case: { organizationId }, createdAt: { gte: startOfMonth() } },
      });
      break;
  }

  return {
    allowed: limit == null || used < limit,
    used,
    limit,
    tier: plan.tier,
  };
}

/** Prüft ein Boolean-Feature des Tarifs (z. B. platformExport, whiteLabel). */
export async function hasPlanFeature(
  organizationId: string,
  feature: "platformExport" | "whiteLabel"
): Promise<boolean> {
  const plan = await getOrgPlan(organizationId);
  return plan.limits[feature];
}
