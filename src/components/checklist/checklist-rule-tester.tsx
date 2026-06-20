"use client";

import { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import {
  FINANCING_TYPES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  type FinancingType,
  type EmploymentType,
  type PropertyType,
  type Platform,
  type RequirementLevel,
} from "@/lib/domain/enums";
import { evaluateRequirements } from "@/lib/rules/requirements";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const FINANCING_LABELS: Record<FinancingType, string> = {
  kauf: "Kauf",
  neubau: "Neubau",
  anschlussfinanzierung: "Anschlussfinanzierung",
  umschuldung: "Umschuldung",
  modernisierung: "Modernisierung",
  kapitalbeschaffung: "Kapitalbeschaffung",
};

const LEVEL_VARIANT: Record<
  RequirementLevel,
  "destructive" | "warning" | "secondary" | "outline"
> = {
  zwingend: "destructive",
  spaeter: "warning",
  optional: "secondary",
  bankabhaengig: "outline",
};

const GROUPS: { level: RequirementLevel; label: string }[] = [
  { level: "zwingend", label: "Zwingend erforderlich" },
  { level: "spaeter", label: "Später erforderlich" },
  { level: "optional", label: "Optional" },
  { level: "bankabhaengig", label: "Bankbezogen" },
];

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ChecklistRuleTester() {
  const [financingType, setFinancingType] = useState<FinancingType>("kauf");
  const [employmentType, setEmploymentType] =
    useState<EmploymentType>("angestellter");
  const [propertyType, setPropertyType] =
    useState<PropertyType>("einfamilienhaus");
  const [platform, setPlatform] = useState<Platform>("europace");

  const rules = useMemo(
    () =>
      evaluateRequirements({
        financingType,
        employmentType,
        propertyType,
        platforms: [platform],
      }),
    [financingType, employmentType, propertyType, platform]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-ai" />
          Regel testen: Welche Unterlagen braucht dieser Fall?
        </CardTitle>
        <CardDescription>
          Stell eine Fallkonstellation zusammen – die Regel-Engine zeigt sofort,
          welche Unterlagen erforderlich werden.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rt-financing">Finanzierungsart</Label>
            <select
              id="rt-financing"
              className={selectClass}
              value={financingType}
              onChange={(e) =>
                setFinancingType(e.target.value as FinancingType)
              }
            >
              {FINANCING_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FINANCING_LABELS[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-employment">Kundentyp</Label>
            <select
              id="rt-employment"
              className={selectClass}
              value={employmentType}
              onChange={(e) =>
                setEmploymentType(e.target.value as EmploymentType)
              }
            >
              {EMPLOYMENT_TYPES.map((e) => (
                <option key={e} value={e}>
                  {EMPLOYMENT_TYPE_LABELS[e]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-property">Objektart</Label>
            <select
              id="rt-property"
              className={selectClass}
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
            >
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {PROPERTY_TYPE_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-platform">Plattform</Label>
            <select
              id="rt-platform"
              className={selectClass}
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          {GROUPS.map((group) => {
            const items = rules.filter((r) => r.level === group.level);
            return (
              <div key={group.level} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {group.label}
                  </h3>
                  <Badge variant="neutral">{items.length}</Badge>
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Für diese Konstellation aktuell nichts.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((r) => (
                      <li
                        key={r.key}
                        className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{r.title}</span>
                        <Badge variant={LEVEL_VARIANT[r.level]}>
                          {REQUIREMENT_LEVEL_LABELS[r.level]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
