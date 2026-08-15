"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { getBrokerInfo } from "@/lib/organization/broker-info";
import {
  buildSignature,
  buildTemplateVars,
  DEFAULT_TEMPLATES,
  renderTemplate,
  templateKey,
} from "@/lib/messages/render";
import { anfrageUrl, formularDerOrganisation } from "@/lib/leadformular/service";

/**
 * Verschickt den Link zum Anfrageformular an eine E-Mail-Adresse.
 *
 * Der schnelle Weg, wenn ein Interessent gerade am Telefon war. Es entsteht
 * dabei WEDER ein Fall NOCH ein Nachrichtenentwurf: Der Fall kommt erst,
 * wenn der Interessent den Bogen absendet. Wer das ändert, hebt den Zweck
 * des Anfrageformulars auf.
 *
 * `sendMessageByEmail` ist hier nicht benutzbar – es arbeitet auf
 * `GeneratedMessage`, und die hängt an einem Fall, den es noch nicht gibt.
 */
export async function versendeEinladung(
  formData: FormData
): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireContext();

  const email = String(formData.get("email") ?? "").trim();
  if (!email.includes("@") || email.length < 5) {
    return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  }
  const name = String(formData.get("name") ?? "").trim();

  const formular = await formularDerOrganisation(ctx.organizationId);
  if (!formular) return { error: "Es ist noch kein Anfrageformular eingerichtet." };
  if (!formular.aktiv) {
    // Der Empfaenger liefe in ein 404 – lieber gar keine Mail.
    return { error: "Das Anfrageformular ist abgeschaltet." };
  }
  if (!isEmailConfigured()) {
    return { error: "E-Mail-Versand ist nicht eingerichtet. Bitte den Link kopieren und selbst senden." };
  }

  const broker = await getBrokerInfo(ctx.organizationId);
  const vars = buildTemplateVars({
    kundeName: name || undefined,
    anfrageLink: anfrageUrl(formular.slug),
    signatur: buildSignature(broker),
  });
  const override = await prisma.messageTemplate.findFirst({
    where: {
      organizationId: ctx.organizationId,
      type: "selbstauskunft_einladung",
      channel: "email",
    },
    select: { subject: true, body: true },
  });
  const quelle = override ?? DEFAULT_TEMPLATES[templateKey("selbstauskunft_einladung", "email")];
  if (!quelle) return { error: "Vorlage für die Einladung fehlt." };

  try {
    await sendEmail({
      to: email,
      subject: quelle.subject ? renderTemplate(quelle.subject, vars) : "Ihre Baufinanzierung",
      text: renderTemplate(quelle.body, vars),
      empfaenger: "kunde",
    });
  } catch (e) {
    return { error: `Die Mail konnte nicht versendet werden: ${(e as Error).message}` };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "anfrage.eingeladen",
    entityType: "leadformular",
    entityId: formular.id,
    metadata: { email, name: name || null },
  });

  // Ohne das hier zeigt "Zuletzt eingeladen" die gerade verschickte Einladung
  // erst nach einem Neuladen – ausgerechnet die Bestätigung, für die sie
  // gebaut wurde.
  revalidatePath("/settings");
  revalidatePath("/cases/new");

  return { ok: true };
}
