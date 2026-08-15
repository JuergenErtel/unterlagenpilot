"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import {
  anfrageUrl,
  formularDerOrganisation,
  slugNormalisieren,
  type FormularStand,
} from "@/lib/leadformular/service";

/**
 * Alles, was die Karte anzeigt. Die Einladungen kommen aus dem
 * Prüfprotokoll: Ohne Fall gäbe es sonst keine Spur von denen, die den Link
 * bekommen, aber nie ausgefüllt haben.
 */
export async function ladeFormularStand(): Promise<FormularStand> {
  const ctx = await requireContext();
  const formular = await formularDerOrganisation(ctx.organizationId);

  const eintraege = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, action: "anfrage.eingeladen" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { metadata: true, createdAt: true },
  });
  const einladungen = eintraege.map((e) => ({
    email: String((e.metadata as { email?: string } | null)?.email ?? "—"),
    am: e.createdAt.toLocaleDateString("de-DE"),
  }));

  if (!formular) return { slug: null, aktiv: false, url: null, einladungen };
  return {
    slug: formular.slug,
    aktiv: formular.aktiv,
    url: anfrageUrl(formular.slug),
    einladungen,
  };
}

export async function formularEinrichten(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireContext();
  const slug = slugNormalisieren(String(formData.get("slug") ?? ""));
  if (!slug) return { error: "Bitte eine Adresse aus Buchstaben und Ziffern wählen." };

  const vorhanden = await formularDerOrganisation(ctx.organizationId);
  // Genau eines je Organisation: Die Oberfläche verwaltet nicht mehr, und ein
  // zweites Formular wäre ein zweiter öffentlicher Eingang, den niemand kennt.
  if (vorhanden) return { error: "Es gibt bereits ein Anfrageformular." };

  try {
    await prisma.leadformular.create({
      data: { organizationId: ctx.organizationId, brokerId: ctx.userId, slug, aktiv: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { error: "Diese Adresse ist bereits vergeben. Bitte eine andere wählen." };
    }
    throw e;
  }

  revalidatePath("/settings");
  revalidatePath("/cases/new");
  return {};
}

/** Schaltet das Formular an oder ab. Abgeschaltet antwortet der Slug mit 404. */
export async function formularUmschalten(): Promise<void> {
  const ctx = await requireContext();
  const formular = await formularDerOrganisation(ctx.organizationId);
  if (!formular) return;

  await prisma.leadformular.update({
    where: { id: formular.id },
    data: { aktiv: !formular.aktiv },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "leadformular",
    entityId: formular.id,
    metadata: { aktiv: !formular.aktiv },
  });

  revalidatePath("/settings");
  revalidatePath("/cases/new");
}
