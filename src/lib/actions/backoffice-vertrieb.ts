"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaseAccess } from "@/lib/auth/context";
import { istBackofficeAktiv } from "@/lib/backoffice/feature";
import { eigenerAuftraggeber, erzeugeAuftrag } from "@/lib/backoffice/service";
import { prisma } from "@/lib/db";
import type { AktionsErgebnis } from "./backoffice";

/**
 * "An Backoffice uebergeben" aus dem Vertriebsfall. Erzeugt einen Auftrag zur
 * bestehenden Akte - der Fall bleibt Vertriebsfall, seine Leadphase, sein
 * Status und seine Quelle werden nicht angefasst. Das Backoffice ist die
 * eigene Organisation (Modell "intern").
 */
export async function anBackofficeUebergebenAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const caseId = String(fd.get("caseId") ?? "");
  const { ctx, caseRow } = await requireCaseAccess(caseId);
  if (caseRow.akteArt !== "vertrieb") return { error: "Diese Akte ist bereits eine Backoffice-Akte." };
  if (!(await istBackofficeAktiv(ctx.organizationId))) return { error: "BaufiDesk Backoffice ist für diese Organisation nicht freigeschaltet." };

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

  const auftraggeberId = await eigenerAuftraggeber(ctx.organizationId);
  const ergebnis = await erzeugeAuftrag({
    backofficeOrganizationId: ctx.organizationId,
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
  redirect(`/cases/${caseId}`);
}
