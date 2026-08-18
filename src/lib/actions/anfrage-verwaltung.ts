"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import {
  anfrageUrl,
  formularDerOrganisation,
  formularSlugAenderbar,
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

  if (!formular) return { slug: null, aktiv: false, url: null, einladungen, kannSlugAendern: false };
  return {
    slug: formular.slug,
    aktiv: formular.aktiv,
    url: anfrageUrl(formular.slug),
    einladungen,
    kannSlugAendern: await formularSlugAenderbar(formular.id),
  };
}

/**
 * Richtet das Formular ein – oder ändert seinen Slug, solange noch kein Bogen
 * daran hängt. Genau eines je Organisation: Die Oberfläche verwaltet nicht
 * mehr, und ein zweites Formular wäre ein zweiter öffentlicher Eingang, den
 * niemand kennt.
 */
export async function formularEinrichten(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireContext();
  const slug = slugNormalisieren(String(formData.get("slug") ?? ""));
  if (!slug) return { error: "Bitte eine Adresse aus Buchstaben und Ziffern wählen." };

  const vorhanden = await formularDerOrganisation(ctx.organizationId);

  if (vorhanden) {
    // Hängt schon ein Bogen dran, ist der Link bereits in der Welt
    // (Visitenkarte, Mailsignatur) – dann bleibt er endgültig gesperrt. Ohne
    // Bogen ist ein Tippfehler im Slug noch ohne Datenbankzugriff korrigierbar.
    if (!(await formularSlugAenderbar(vorhanden.id))) {
      return { error: "Es gibt bereits ein Anfrageformular." };
    }
    try {
      await prisma.leadformular.update({ where: { id: vorhanden.id }, data: { slug } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return { error: "Diese Adresse ist bereits vergeben. Bitte eine andere wählen." };
      }
      throw e;
    }
    // Der alte Slug MUSS mit ins Protokoll: Nach der Aenderung antwortet er
    // mit 404, und ohne Eintrag liesse sich hinterher nicht mehr feststellen,
    // welcher Link in Mailsignatur und Visitenkarte tot ist.
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "anfrage.formular_geaendert",
      entityType: "leadformular",
      entityId: vorhanden.id,
      metadata: { von: vorhanden.slug, nach: slug },
    });
    revalidatePath("/settings");
    revalidatePath("/cases/new");
    return {};
  }

  let angelegt;
  try {
    angelegt = await prisma.leadformular.create({
      data: { organizationId: ctx.organizationId, brokerId: ctx.userId, slug, aktiv: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { error: "Diese Adresse ist bereits vergeben. Bitte eine andere wählen." };
    }
    throw e;
  }
  // Auch das Einrichten gehoert ins Protokoll: Ab diesem Moment kann jeder
  // Fremde ohne Anmeldung Geburtsdatum, Einkommen und Verpflichtungen
  // eintragen. Der Zeitpunkt, ab dem das moeglich war, ist eine Tatsache, die
  // man spaeter braucht.
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "anfrage.formular_geaendert",
    entityType: "leadformular",
    entityId: angelegt.id,
    metadata: { eingerichtet: slug },
  });

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
    // War frueher "case.updated" – eine Aktion, die mit einem Fall nichts zu
    // tun hat und den Eintrag in jeder Auswertung am falschen Ort einsortierte.
    action: "anfrage.formular_geaendert",
    entityType: "leadformular",
    entityId: formular.id,
    metadata: { aktiv: !formular.aktiv },
  });

  revalidatePath("/settings");
  revalidatePath("/cases/new");
}
