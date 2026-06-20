import { ListChecks, Lock } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { CHECKLIST_TEMPLATES } from "@/lib/checklists/templates";
import {
  PLATFORM_LABELS,
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  type Platform,
  type DocumentType,
  type RequirementLevel,
} from "@/lib/domain/enums";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const LEVEL_VARIANT: Record<
  RequirementLevel,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  zwingend: "destructive",
  spaeter: "warning",
  optional: "secondary",
  bankabhaengig: "outline",
};

export default async function ChecklistsPage() {
  const ctx = await requireContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Checklisten</h1>
        <p className="text-sm text-muted-foreground">
          Unterlagen-Checklisten je Fallkonstellation für {ctx.organizationName}.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p>
            Im MVP sind die Checklisten fix vorgegeben. Später werden sie pro
            Organisation (und im White-Label-Betrieb pro Mandant) editierbar
            sein.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {CHECKLIST_TEMPLATES.map((tpl) => (
          <Card key={tpl.key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-muted-foreground" />
                  {tpl.name}
                </CardTitle>
                <Badge variant="secondary">
                  {tpl.items.length}{" "}
                  {tpl.items.length === 1 ? "Position" : "Positionen"}
                </Badge>
              </div>
              <CardDescription>{tpl.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unterlage</TableHead>
                    <TableHead>Pflichtstatus</TableHead>
                    <TableHead>Plattformen</TableHead>
                    <TableHead>Dokumenttyp</TableHead>
                    <TableHead>Aktualität</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tpl.items.map((it) => (
                    <TableRow key={it.key}>
                      <TableCell className="font-medium">{it.name}</TableCell>
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
                      <TableCell className="text-muted-foreground">
                        {it.documentType
                          ? DOCUMENT_TYPE_LABELS[it.documentType as DocumentType]
                          : "–"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {it.recencyDays ? `${it.recencyDays} Tage` : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
