import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";

/**
 * Systemstatus für den Pilotbetrieb: zeigt transparent, welche Bausteine
 * produktiv konfiguriert sind und welche im Demo-/Stub-Modus laufen.
 */
export type StatusMode = "active" | "demo" | "stub" | "configured" | "warn";

export interface SystemStatusItem {
  key: string;
  label: string;
  value: string;
  mode: StatusMode;
  hint?: string;
}

export interface SystemStatus {
  pilot: boolean; // true, solange nicht alles produktiv konfiguriert ist
  items: SystemStatusItem[];
}

export async function getSystemStatus(organizationId: string): Promise<SystemStatus> {
  const env = getEnv();

  const connections = await prisma.platformConnection.findMany({
    where: { organizationId },
    select: { platform: true, configured: true },
  });
  const isConfigured = (p: Platform) => connections.find((c) => c.platform === p)?.configured ?? false;

  const items: SystemStatusItem[] = [
    {
      key: "auth",
      label: "Authentifizierung",
      value: env.AUTH_MODE === "session" ? "Login aktiv" : "Demo (ohne Login)",
      mode: env.AUTH_MODE === "session" ? "active" : "demo",
      hint: env.AUTH_MODE === "session" ? undefined : "Für echte Kundendaten AUTH_MODE=session setzen.",
    },
    {
      key: "storage",
      label: "Speicherung",
      value: env.STORAGE_PROVIDER,
      mode: env.STORAGE_PROVIDER === "local" ? "warn" : "configured",
      hint: env.STORAGE_PROVIDER === "local" ? "local = flüchtig (nur Dev). Produktiv: Supabase/S3 (privat, verschlüsselt)." : undefined,
    },
    {
      key: "ai",
      label: "KI-Auswertung",
      value: env.AI_PROVIDER,
      mode: env.AI_PROVIDER === "mock" ? "demo" : "configured",
    },
    {
      key: "ocr",
      label: "OCR / Texterkennung",
      value: env.OCR_PROVIDER,
      mode: env.OCR_PROVIDER === "mock" ? "demo" : "configured",
    },
    {
      key: "virus",
      label: "Virenscan",
      value: env.VIRUS_SCANNER === "clamav" && env.CLAMAV_HOST ? "ClamAV (aktiv)" : "Mock (Demo)",
      mode: env.VIRUS_SCANNER === "clamav" && env.CLAMAV_HOST ? "active" : "demo",
      hint: env.VIRUS_SCANNER === "clamav" && !env.CLAMAV_HOST ? "ClamAV gewählt, aber CLAMAV_HOST/PORT fehlen." : undefined,
    },
    ...(["europace", "finlink", "ehyp_home"] as Platform[]).map((p) => ({
      key: p,
      label: PLATFORM_LABELS[p],
      value: isConfigured(p) ? "konfiguriert" : "Stub (ManualExport)",
      mode: (isConfigured(p) ? "configured" : "stub") as StatusMode,
    })),
  ];

  const pilot =
    env.AUTH_MODE !== "session" ||
    env.STORAGE_PROVIDER === "local" ||
    env.AI_PROVIDER === "mock" ||
    !(env.VIRUS_SCANNER === "clamav" && env.CLAMAV_HOST) ||
    !(["europace", "finlink", "ehyp_home"] as Platform[]).every(isConfigured);

  return { pilot, items };
}
