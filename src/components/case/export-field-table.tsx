import { Copy, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/case/confidence-badge";

export type ExportField = {
  platformField: string;
  label: string;
  value: string | number | boolean | null;
  source?: string;
  confidence: number;
  requiresReview: boolean;
};

/**
 * Presentational: zeigt die aufbereiteten Plattformfelder mit Konfidenz und
 * Prüfstatus. Aktionen sind im MVP visuell – Übergabe bleibt manuell.
 */
export function ExportFieldTable({ fields }: { fields: ExportField[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plattformfeld</TableHead>
          <TableHead>Wert</TableHead>
          <TableHead>Quelle</TableHead>
          <TableHead>Konfidenz</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Aktion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Felder aufbereitet.
            </TableCell>
          </TableRow>
        )}
        {fields.map((f) => {
          const empty = f.value === null || f.value === "";
          return (
            <TableRow key={f.platformField}>
              <TableCell>
                <div className="font-medium text-foreground">{f.label}</div>
                <div className="font-mono tabular text-xs text-muted-foreground">{f.platformField}</div>
              </TableCell>
              <TableCell className="font-mono tabular">
                {empty ? <span className="text-muted-foreground">—</span> : String(f.value)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{f.source ?? "—"}</TableCell>
              <TableCell>
                <ConfidenceBadge value={f.confidence} />
              </TableCell>
              <TableCell>
                {f.requiresReview ? (
                  <Badge variant="warning">prüfen</Badge>
                ) : (
                  <Badge variant="success">übernommen</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label="Wert kopieren">
                    <Copy />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Wert bearbeiten">
                    <Pencil />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
