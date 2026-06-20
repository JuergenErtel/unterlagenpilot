import { Badge } from "@/components/ui/badge";
import {
  CASE_STATUS_LABELS,
  type CaseStatus,
  type Severity,
} from "@/lib/domain/enums";

const CASE_VARIANT: Record<CaseStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  neu: "secondary",
  upload_offen: "secondary",
  ki_pruefung_laeuft: "default",
  vermittlerpruefung_erforderlich: "warning",
  unterlagen_fehlen: "warning",
  einreichungsfertig: "success",
  exportiert: "default",
  uebertragen: "success",
  abgeschlossen: "success",
  archiviert: "secondary",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge variant={CASE_VARIANT[status]}>{CASE_STATUS_LABELS[status]}</Badge>;
}

const SEVERITY_VARIANT: Record<Severity, "success" | "warning" | "destructive" | "secondary"> = {
  ok: "success",
  warnung: "warning",
  kritisch: "destructive",
  fehlt: "secondary",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  ok: "OK",
  warnung: "Warnung",
  kritisch: "Kritisch",
  fehlt: "Fehlt",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}
