"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, ListChecks } from "lucide-react";
import {
  PLATFORM_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  type Platform,
  type RequirementLevel,
} from "@/lib/domain/enums";
import type {
  ChecklistTemplateDef,
  ChecklistItemDef,
} from "@/lib/checklists/templates";
import {
  PlatformRequirementRules,
  BankRequirementRules,
  type RequirementRule,
} from "@/lib/rules/requirements";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const LEVEL_VARIANT: Record<
  RequirementLevel,
  "destructive" | "warning" | "secondary" | "outline"
> = {
  zwingend: "destructive",
  spaeter: "warning",
  optional: "secondary",
  bankabhaengig: "outline",
};

/** Schlüssel-Muster je Kategorie (Reihenfolge = Priorität). */
const FALLTYP_KEYS = [
  "kauf",
  "neubau",
  "anschluss",
  "kapitalanlage",
  "modernisierung",
  "umschuldung",
];
const KUNDENTYP_KEYS = [
  "angestellter",
  "selbststaendiger",
  "beamter",
  "rentner",
  "gf",
  "gesellschafter",
  "mehrere_antragsteller",
];
const OBJEKT_KEYS = [
  "eigentumswohnung",
  "einfamilienhaus",
  "mehrfamilienhaus",
  "grundstueck",
  "vermietete",
  "gemischt",
];

function matchesAny(key: string, patterns: string[]): boolean {
  return patterns.some((p) => key.includes(p));
}

function templateMatchesQuery(tpl: ChecklistTemplateDef, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (tpl.name.toLowerCase().includes(needle)) return true;
  if (tpl.description.toLowerCase().includes(needle)) return true;
  return tpl.items.some(
    (it) =>
      it.name.toLowerCase().includes(needle) ||
      it.customerDescription.toLowerCase().includes(needle)
  );
}

function ItemTable({ items }: { items: ChecklistItemDef[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unterlage</TableHead>
          <TableHead>Pflichtstatus</TableHead>
          <TableHead>Plattformen</TableHead>
          <TableHead>Aktualität</TableHead>
          <TableHead>Bankregel</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((it) => (
          <TableRow key={it.key} className="align-top">
            <TableCell>
              <div className="space-y-1">
                <div className="font-medium">{it.name}</div>
                <p className="text-xs text-muted-foreground">
                  {it.customerDescription}
                </p>
                {it.internalDescription && (
                  <p className="text-xs text-ai">
                    Intern: {it.internalDescription}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={LEVEL_VARIANT[it.level]}>
                {REQUIREMENT_LEVEL_LABELS[it.level]}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {it.platforms.map((p: Platform) => (
                  <Badge key={p} variant="outline">
                    {PLATFORM_LABELS[p]}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="tabular-nums text-muted-foreground">
              {it.recencyDays ? `${it.recencyDays} Tage` : "—"}
            </TableCell>
            <TableCell>
              {it.bankSpecific ? (
                <Badge variant="outline">bankbezogen</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TemplateCard({ tpl }: { tpl: ChecklistTemplateDef }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <div className="font-semibold leading-none tracking-tight">
              {tpl.name}
            </div>
            <p className="text-sm text-muted-foreground">{tpl.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {tpl.items.length}{" "}
            {tpl.items.length === 1 ? "Position" : "Positionen"}
          </Badge>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && (
        <CardContent className="pt-0">
          <ItemTable items={tpl.items} />
        </CardContent>
      )}
    </Card>
  );
}

function RuleTable({ rules }: { rules: RequirementRule[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Anforderung</TableHead>
          <TableHead>Pflichtstatus</TableHead>
          <TableHead>Quelle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">{r.title}</TableCell>
            <TableCell>
              <Badge variant={LEVEL_VARIANT[r.level]}>
                {REQUIREMENT_LEVEL_LABELS[r.level]}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {r.platform && r.platform !== "allgemein"
                ? PLATFORM_LABELS[r.platform as Platform]
                : r.bank ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ChecklistBrowser({
  templates,
}: {
  templates: ChecklistTemplateDef[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => templates.filter((t) => templateMatchesQuery(t, query)),
    [templates, query]
  );

  const falltypen = filtered.filter((t) => matchesAny(t.key, FALLTYP_KEYS));
  const kundentypen = filtered.filter((t) => matchesAny(t.key, KUNDENTYP_KEYS));
  const objektzusaetze = filtered.filter((t) => matchesAny(t.key, OBJEKT_KEYS));

  // Fallback: noch nicht zugeordnete Vorlagen unter Falltypen zeigen.
  const categorized = new Set([
    ...falltypen.map((t) => t.key),
    ...kundentypen.map((t) => t.key),
    ...objektzusaetze.map((t) => t.key),
  ]);
  const uncategorized = filtered.filter((t) => !categorized.has(t.key));
  const falltypenAll = [...falltypen, ...uncategorized];

  const platformEntries = Object.entries(PlatformRequirementRules) as [
    Platform,
    RequirementRule[]
  ][];
  const bankEntries = Object.entries(BankRequirementRules);

  const emptyHint = (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">
        Keine Vorlagen für deine Suche „{query}". Probier einen anderen Begriff.
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklisten-Bibliothek</CardTitle>
        <CardDescription>
          Alle hinterlegten Vorlagen und Regeln. Klapp eine Vorlage auf, um die
          Positionen im Detail zu sehen.
        </CardDescription>
        <div className="relative pt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Vorlagen und Unterlagen durchsuchen …"
            className="pl-9"
          />
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="falltypen">
          <TabsList className="flex-wrap">
            <TabsTrigger value="falltypen">Falltypen</TabsTrigger>
            <TabsTrigger value="kundentypen">Kundentypen</TabsTrigger>
            <TabsTrigger value="objektzusaetze">Objektzusätze</TabsTrigger>
            <TabsTrigger value="plattformregeln">Plattformregeln</TabsTrigger>
            <TabsTrigger value="bankregeln">Bankregeln</TabsTrigger>
          </TabsList>

          <TabsContent value="falltypen" className="space-y-3">
            {falltypenAll.length === 0
              ? emptyHint
              : falltypenAll.map((t) => <TemplateCard key={t.key} tpl={t} />)}
          </TabsContent>

          <TabsContent value="kundentypen" className="space-y-3">
            {kundentypen.length === 0
              ? emptyHint
              : kundentypen.map((t) => <TemplateCard key={t.key} tpl={t} />)}
          </TabsContent>

          <TabsContent value="objektzusaetze" className="space-y-3">
            {objektzusaetze.length === 0
              ? emptyHint
              : objektzusaetze.map((t) => <TemplateCard key={t.key} tpl={t} />)}
          </TabsContent>

          <TabsContent value="plattformregeln" className="space-y-6">
            {platformEntries.map(([platform, rules]) => (
              <div key={platform} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">
                    {PLATFORM_LABELS[platform]}
                  </h3>
                  <Badge variant="neutral">{rules.length}</Badge>
                </div>
                <RuleTable rules={rules} />
              </div>
            ))}
          </TabsContent>

          <TabsContent value="bankregeln" className="space-y-6">
            {bankEntries.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Noch keine bankindividuellen Regeln hinterlegt. Diese werden
                  später pro Organisation pflegbar.
                </CardContent>
              </Card>
            ) : (
              bankEntries.map(([bank, rules]) => (
                <div key={bank} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{bank}</h3>
                    <Badge variant="neutral">{rules.length}</Badge>
                  </div>
                  <RuleTable rules={rules} />
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
