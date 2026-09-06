"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaseAccess } from "@/lib/auth/context";
import { eigenerAuftraggeber, erzeugeAuftrag } from "@/lib/backoffice/service";
import { ladeUebergabeZiele } from "@/lib/backoffice/uebergabe-ziele";
import { prisma } from "@/lib/db";
import type { AktionsErgebnis } from "./backoffice";

/**
 * "An Backoffice uebergeben" aus dem Vertriebsfall. Erzeugt einen Auftrag zur
 * bestehenden Akte - der Fall bleibt Vertriebsfall, seine Leadphase, sein
 * Status und seine Quelle werden nicht angefasst. Ziel ist das eigene
 * Backoffice (Modell "intern") oder ein Backoffice-Partner, bei dem diese
 * Organisation als Auftraggeber verknuepft ist (Cross-Org: der Auftrag wird
 * dort zur Zugriffsbruecke auf die Unterlagen dieser Akte).
 */
export async function anBackofficeUebergebenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const caseId = String(fd.get("caseId") ?? "");
  const { ctx, caseRow } = await requireCaseAccess(caseId);
  if (caseRow.akteArt !== "vertrieb") return { error: "Diese Akte ist bereits eine Backoffice-Akte." };

  // Das Ziel kommt aus der serverseitig berechneten Liste - ein fremder
  // Auftraggeber-Schluessel im Formular fuehrt nirgendwohin.
  const ziele = await ladeUebergabeZiele(ctx.organizationId);
  const zielSchluessel = String(fd.get("ziel") ?? "intern");
  const ziel = ziele.find((z) => z.schluessel === zielSchluessel);
  if (!ziel) return { error: "Dieses Backoffice steht nicht zur Verfügung." };

  const auftragsart = String(fd.get("auftragsart") ?? "").trim();
  if (!auftragsart) return { error: "Bitte eine Auftragsart wählen." };

  const akte = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      caseNumber: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
    },
  });
  const name = akte.applicants
    .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  const auftraggeberId = ziel.intern ? await eigenerAuftraggeber(ctx.organizationId) : ziel.auftraggeberId!;
  const ergebnis = await erzeugeAuftrag({
    backofficeOrganizationId: ziel.backofficeOrganizationId,
    auftraggeberId,
    caseId,
    aktenbezeichnung: name || akte.caseNumber,
    auftragsart,
    leistungen: fd.getAll("leistungen").map(String),
    hinweiseAuftraggeber: String(fd.get("hinweise") ?? "").trim() || null,
    referenzExtern: akte.caseNumber,
    quelle: "vertrieb_uebergabe",
    erstelltVonId: ctx.userId,
  });
  if (!ergebnis.ok) return { error: ergebnis.grund };
  revalidatePath(`/cases/${caseId}`, "layout");
  revalidatePath("/backoffice");
  revalidatePath("/backoffice/queue");
  revalidatePath("/portal");
  revalidatePath("/portal/auftraege");
  redirect(`/cases/${caseId}`);
}
